import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { getAIProvider } from '@/lib/ai/provider';
import { sendDigestEmail } from '@/lib/email/resend';

// Test endpoint to generate summaries for a user (bypasses schedule)
// Add ?send_email=true to also send the digest email
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  const sendEmail = request.nextUrl.searchParams.get('send_email') === 'true';

  if (!token) {
    return NextResponse.json({ error: 'Token required' }, { status: 400 });
  }

  const supabase = createServerClient();
  const ai = getAIProvider();

  try {
    // Get user
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('token', token)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get user's keywords
    const { data: keywords } = await supabase
      .from('keywords')
      .select('keyword')
      .eq('user_id', user.id)
      .eq('is_active', true);

    // Get user's selected journals
    const { data: userJournals } = await supabase
      .from('user_journals')
      .select('source_id')
      .eq('user_id', user.id);

    const selectedSourceIds = userJournals?.map(j => j.source_id) || [];

    // Get recent papers (last 90 days for testing)
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const userKeywords = keywords?.map(k => k.keyword) || [];

    // Get all recent papers from user's selected journals only
    // If no journals selected, don't return any papers (require journal selection)
    if (selectedSourceIds.length === 0) {
      return NextResponse.json({
        message: 'No journals selected',
        user: user.email,
        keywords: userKeywords,
        note: 'Please select journals in your dashboard to receive relevant papers',
      });
    }

    const { data: allPapers } = await supabase
      .from('papers')
      .select('*')
      .in('source_id', selectedSourceIds)
      .not('journal_name', 'is', null)
      .neq('journal_name', '')
      .gte('collected_at', ninetyDaysAgo.toISOString())
      .order('collected_at', { ascending: false });

    // Score and filter papers by keyword relevance
    const scoredPapers = (allPapers || [])
      .map(paper => {
        const titleLower = (paper.title || '').toLowerCase();
        const abstractLower = (paper.abstract || '').toLowerCase();
        let score = 0;
        const matchedKeywords: string[] = [];

        for (const kw of userKeywords) {
          const kwLower = kw.toLowerCase();
          if (titleLower.includes(kwLower)) {
            score += 3; // Title match worth more
            if (!matchedKeywords.includes(kw)) matchedKeywords.push(kw);
          }
          if (abstractLower.includes(kwLower)) {
            score += 1;
            if (!matchedKeywords.includes(kw)) matchedKeywords.push(kw);
          }
        }

        return { ...paper, relevanceScore: score, matchedKeywords };
      })
      .filter(p => p.relevanceScore > 0) // Only papers with keyword matches
      .sort((a, b) => b.relevanceScore - a.relevanceScore); // Most relevant first

    // Use scored papers, or fall back to all papers if no matches
    const papers = scoredPapers.length > 0 ? scoredPapers : (allPapers || []).slice(0, 5);

    if (!papers || papers.length === 0) {
      return NextResponse.json({
        message: 'No papers found',
        user: user.email,
        keywords: userKeywords,
        note: 'Try adding more journals or broader keywords',
      });
    }

    // Generate summaries for top 3 papers
    const results: {
      paper: string;
      summary?: string;
      model?: string;
      cached?: boolean;
      error?: string;
      matchedKeywords?: string[];
      relevanceScore?: number;
    }[] = [];

    for (const paper of papers.slice(0, 3)) {
      try {
        // Check for existing summary
        const { data: existing } = await supabase
          .from('summaries')
          .select('content')
          .eq('paper_id', paper.id)
          .eq('user_id', user.id)
          .single();

        if (existing) {
          results.push({
            paper: paper.title,
            summary: existing.content,
            cached: true,
            matchedKeywords: paper.matchedKeywords || [],
            relevanceScore: paper.relevanceScore || 0,
          });
          continue;
        }

        // Generate new summary
        const textToSummarize = paper.abstract || paper.title;
        console.log(`Summarizing: ${paper.title}`);

        const summaryContent = await ai.summarize(
          `제목: ${paper.title}\n저자: ${JSON.stringify(paper.authors)}\n학술지: ${paper.journal_name}\n\n${textToSummarize}`,
          user.field_context || undefined
        );

        const modelUsed = ai.getModelName();

        // Save summary
        await supabase
          .from('summaries')
          .insert({
            paper_id: paper.id,
            user_id: user.id,
            content: summaryContent,
            model: modelUsed,
          });

        results.push({
          paper: paper.title,
          summary: summaryContent,
          model: modelUsed,
          cached: false,
          matchedKeywords: paper.matchedKeywords || [],
          relevanceScore: paper.relevanceScore || 0,
        });
      } catch (err) {
        results.push({
          paper: paper.title,
          error: err instanceof Error ? err.message : 'Failed',
        });
      }
    }

    // Optionally send email
    let emailResult = null;
    if (sendEmail && results.some(r => r.summary)) {
      const summariesForEmail = results
        .filter(r => r.summary && !r.error)
        .map((r, i) => ({
          paper: {
            title: papers[i].title,
            url: papers[i].url,
            journal_name: papers[i].journal_name,
            published_at: papers[i].published_at,
            authors: papers[i].authors || [],
          },
          summary: { content: r.summary! },
        }));

      emailResult = await sendDigestEmail({
        user: {
          name: user.name,
          email: user.email,
          token: user.token,
        },
        summaries: summariesForEmail,
      });
    }

    return NextResponse.json({
      user: user.email,
      keywords: keywords?.map(k => k.keyword) || [],
      papersFound: papers.length,
      summaries: results,
      emailSent: emailResult?.success ?? null,
      emailError: emailResult?.error ?? null,
    });

  } catch (error) {
    console.error('Test digest error:', error);
    return NextResponse.json({
      error: 'Test failed',
      details: error instanceof Error ? error.message : 'Unknown',
    }, { status: 500 });
  }
}
