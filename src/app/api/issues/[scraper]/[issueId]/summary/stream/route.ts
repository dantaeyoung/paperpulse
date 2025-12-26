import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { getScraper } from '@/lib/scrapers/journal-base';
import { getIssueSummaryService, computeIssueStatistics, PaperExtraction } from '@/lib/ai/issue-summary';
import '@/lib/scrapers/counselors';

interface RouteParams {
  params: Promise<{
    scraper: string;
    issueId: string;
  }>;
}

// Streaming endpoint for progress updates
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { scraper: scraperKey, issueId } = await params;

  const scraper = getScraper(scraperKey);
  if (!scraper) {
    return new Response(JSON.stringify({ error: `Scraper '${scraperKey}' not found` }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: {
    customPrompt?: string;
    userId?: string;
    fieldContext?: string;
  } = {};

  try {
    body = await request.json();
  } catch {
    // Empty body is fine
  }

  const { customPrompt, userId, fieldContext } = body;

  const supabase = createServerClient();

  // Create a TransformStream for SSE
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  const sendEvent = async (event: string, data: unknown) => {
    await writer.write(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
  };

  // Start processing in the background
  (async () => {
    try {
      // Get issue info and articles from cache
      const { data: issueCache } = await supabase
        .from('issue_cache')
        .select('journal_name, issue_info, articles')
        .eq('scraper_key', scraperKey)
        .eq('issue_id', issueId)
        .single();

      if (!issueCache) {
        await sendEvent('error', { message: 'Issue not found in cache' });
        await writer.close();
        return;
      }

      const journalName = issueCache.journal_name || scraper.name;
      const issueInfo = issueCache.issue_info as { volume?: string; issue?: string; year?: string } || {};
      const issueInfoStr = `${issueInfo.volume || ''}권 ${issueInfo.issue || ''}호 (${issueInfo.year || ''})`;

      const cachedArticles = (issueCache.articles || []) as Array<{ id: string }>;
      const articleIds = cachedArticles.map(a => a.id);

      if (articleIds.length === 0) {
        await sendEvent('error', { message: 'No articles found in cache' });
        await writer.close();
        return;
      }

      const { data: source } = await supabase
        .from('sources')
        .select('id')
        .eq('name', scraper.name)
        .eq('type', 'journal')
        .single();

      if (!source) {
        await sendEvent('error', { message: 'Source not found in database' });
        await writer.close();
        return;
      }

      const { data: papers } = await supabase
        .from('papers')
        .select('id, title, full_text, abstract')
        .eq('source_id', source.id)
        .in('external_id', articleIds)
        .not('full_text', 'is', null);

      if (!papers || papers.length === 0) {
        await sendEvent('error', { message: 'No papers with full text found' });
        await writer.close();
        return;
      }

      await sendEvent('start', { total: papers.length });

      const papersForSummary = papers.map(p => ({
        id: p.id,
        title: p.title,
        text: p.full_text || p.abstract || '',
      }));

      const summaryService = getIssueSummaryService();
      const result = await summaryService.generateIssueSummary(
        papersForSummary,
        journalName,
        issueInfoStr,
        customPrompt,
        fieldContext,
        async (current, total, paperTitle) => {
          await sendEvent('progress', { current, total, paperTitle });
        }
      );

      // Send synthesis progress
      await sendEvent('progress', { current: papers.length, total: papers.length, paperTitle: 'Synthesizing trends...' });

      // Save to database - handle NULL user_id specially since NULL != NULL in SQL
      const summaryData = {
        scraper_key: scraperKey,
        issue_id: issueId,
        summary_content: result.summary,
        extractions: result.extractions,
        citation_map: result.citationMap,
        paper_count: result.paper_count,
        custom_prompt: customPrompt || null,
        user_id: userId || null,
        field_context: fieldContext || null,
        model_extraction: result.model_used,
        model_synthesis: result.model_used,
        tokens_used_extraction: result.tokens_extraction,
        tokens_used_synthesis: result.tokens_synthesis,
        cost_estimate: result.cost_estimate,
      };

      if (userId) {
        // For user-specific summaries, upsert works
        await supabase
          .from('issue_summaries')
          .upsert(summaryData, { onConflict: 'scraper_key,issue_id,user_id' });
      } else {
        // For global summaries (NULL user_id), delete first then insert
        await supabase
          .from('issue_summaries')
          .delete()
          .eq('scraper_key', scraperKey)
          .eq('issue_id', issueId)
          .is('user_id', null);

        await supabase
          .from('issue_summaries')
          .insert(summaryData);
      }

      await sendEvent('complete', {
        summary: {
          content: result.summary,
          paperCount: result.paper_count,
          failedPapers: result.failed_papers,
          costEstimate: result.cost_estimate,
          statistics: result.statistics,
          citationMap: result.citationMap,
        },
      });

    } catch (error) {
      console.error('Stream error:', error);
      await sendEvent('error', { message: error instanceof Error ? error.message : 'Unknown error' });
    } finally {
      await writer.close();
    }
  })();

  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
