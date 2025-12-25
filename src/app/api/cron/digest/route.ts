import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { getAIProvider } from '@/lib/ai/provider';
import { sendDigestEmail } from '@/lib/email/resend';

// Verify cron secret for security
function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.warn('CRON_SECRET not set');
    return false;
  }

  if (authHeader === `Bearer ${cronSecret}`) {
    return true;
  }

  const vercelCron = request.headers.get('x-vercel-cron');
  if (vercelCron) {
    return true;
  }

  return false;
}

export async function GET(request: NextRequest) {
  return handleDigest(request);
}

export async function POST(request: NextRequest) {
  return handleDigest(request);
}

async function handleDigest(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServerClient();
  const ai = getAIProvider();

  // Get current day and hour in KST
  const now = new Date();
  const kstOffset = 9 * 60; // KST is UTC+9
  const kstTime = new Date(now.getTime() + kstOffset * 60 * 1000);
  const currentDay = kstTime.getUTCDay(); // 0=Sun, 1=Mon, ...
  const currentHour = kstTime.getUTCHours();

  const stats = {
    processed: 0,
    emails_sent: 0,
    emails_skipped: 0,
    errors: [] as string[],
  };

  try {
    // Find users who should receive digest at this time
    const { data: users } = await supabase
      .from('users')
      .select('*')
      .eq('is_active', true)
      .eq('digest_day', currentDay)
      .eq('digest_hour', currentHour);

    if (!users || users.length === 0) {
      return NextResponse.json({
        message: 'No users scheduled for this time',
        ...stats,
      });
    }

    // Process each user
    for (const user of users) {
      stats.processed++;

      try {
        // Get user's active keywords
        const { data: keywords } = await supabase
          .from('keywords')
          .select('keyword')
          .eq('user_id', user.id)
          .eq('is_active', true);

        if (!keywords || keywords.length === 0) {
          stats.emails_skipped++;
          await logEmail(supabase, user.id, 0, 'skipped');
          continue;
        }

        // Get user's selected journals
        const { data: userJournals } = await supabase
          .from('user_journals')
          .select('source_id')
          .eq('user_id', user.id);

        const selectedSourceIds = userJournals?.map(j => j.source_id) || [];

        // Get papers from the last 7 days from user's selected journals
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const keywordPatterns = keywords.map(k => k.keyword);

        // Get all recent papers from selected journals
        let papersQuery = supabase
          .from('papers')
          .select('*')
          .gte('collected_at', weekAgo.toISOString())
          .order('collected_at', { ascending: false });

        // Filter by selected journals if user has any
        if (selectedSourceIds.length > 0) {
          papersQuery = papersQuery.in('source_id', selectedSourceIds);
        }

        const { data: allPapers } = await papersQuery;

        // Score and filter papers by keyword relevance
        // Scoring: title match (+3), abstract match (+2), full_text match (+1)
        const papers = (allPapers || [])
          .map(paper => {
            const titleLower = (paper.title || '').toLowerCase();
            const abstractLower = (paper.abstract || '').toLowerCase();
            const fullTextLower = (paper.full_text || '').toLowerCase();
            let score = 0;
            const matchedKeywords: string[] = [];

            for (const kw of keywordPatterns) {
              const kwLower = kw.toLowerCase();
              if (titleLower.includes(kwLower)) {
                score += 3; // Title match worth more
                if (!matchedKeywords.includes(kw)) matchedKeywords.push(kw);
              }
              if (abstractLower.includes(kwLower)) {
                score += 2; // Abstract match
                if (!matchedKeywords.includes(kw)) matchedKeywords.push(kw);
              }
              if (fullTextLower.includes(kwLower)) {
                score += 1; // Full text match (from PDF extraction)
                if (!matchedKeywords.includes(kw)) matchedKeywords.push(kw);
              }
            }

            return { ...paper, relevanceScore: score, matchedKeywords };
          })
          .filter(p => p.relevanceScore > 0) // Only papers with keyword matches
          .sort((a, b) => b.relevanceScore - a.relevanceScore); // Most relevant first

        if (!papers || papers.length === 0) {
          stats.emails_skipped++;
          await logEmail(supabase, user.id, 0, 'skipped');
          continue;
        }

        // Generate summaries for papers that don't have one yet
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const summariesWithPapers: { paper: any; summary: any }[] = [];

        for (const paper of papers.slice(0, 10)) { // Limit to 10 papers per digest
          // Check if summary already exists
          const { data: existingSummary } = await supabase
            .from('summaries')
            .select('*')
            .eq('paper_id', paper.id)
            .eq('user_id', user.id)
            .single();

          if (existingSummary) {
            summariesWithPapers.push({ paper, summary: existingSummary });
            continue;
          }

          // Generate new summary
          const textToSummarize = paper.full_text || paper.abstract || paper.title;
          const summaryContent = await ai.summarize(
            `제목: ${paper.title}\n저자: ${JSON.stringify(paper.authors)}\n학술지: ${paper.journal_name}\n\n${textToSummarize}`,
            user.field_context || undefined
          );

          // Save summary
          const { data: newSummary } = await supabase
            .from('summaries')
            .insert({
              paper_id: paper.id,
              user_id: user.id,
              content: summaryContent,
              model: ai.getModelName(),
            })
            .select()
            .single();

          if (newSummary) {
            summariesWithPapers.push({ paper, summary: newSummary });
          }
        }

        // Send email
        const emailResult = await sendDigestEmail({
          user,
          summaries: summariesWithPapers,
        });

        if (emailResult.success) {
          stats.emails_sent++;
          await logEmail(supabase, user.id, summariesWithPapers.length, 'sent');
        } else {
          stats.errors.push(`Email failed for ${user.email}: ${emailResult.error}`);
          await logEmail(supabase, user.id, summariesWithPapers.length, 'failed', emailResult.error);
        }

      } catch (userError) {
        const errorMsg = userError instanceof Error ? userError.message : 'Unknown error';
        stats.errors.push(`Error processing ${user.email}: ${errorMsg}`);
        await logEmail(supabase, user.id, 0, 'failed', errorMsg);
      }
    }

    return NextResponse.json({
      message: 'Digest completed',
      ...stats,
    });

  } catch (error) {
    console.error('Digest error:', error);
    return NextResponse.json({
      error: 'Digest failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

async function logEmail(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  paperCount: number,
  status: 'sent' | 'failed' | 'skipped',
  errorMessage?: string
) {
  await supabase.from('email_logs').insert({
    user_id: userId,
    paper_count: paperCount,
    status,
    error_message: errorMessage,
  });
}
