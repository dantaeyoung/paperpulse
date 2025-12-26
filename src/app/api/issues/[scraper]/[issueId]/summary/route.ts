import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { getScraper } from '@/lib/scrapers/journal-base';
import { getIssueSummaryService, computeIssueStatistics, PaperExtraction, CitationMap } from '@/lib/ai/issue-summary';
import '@/lib/scrapers/counselors';

interface RouteParams {
  params: Promise<{
    scraper: string;
    issueId: string;
  }>;
}

// GET: Retrieve existing issue summary
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { scraper: scraperKey, issueId } = await params;
  const userId = request.nextUrl.searchParams.get('userId');

  const supabase = createServerClient();

  try {
    // Build query
    let query = supabase
      .from('issue_summaries')
      .select('*')
      .eq('scraper_key', scraperKey)
      .eq('issue_id', issueId);

    // If userId provided, get user-specific summary
    if (userId) {
      query = query.eq('user_id', userId);
    } else {
      query = query.is('user_id', null);
    }

    const { data: summary, error } = await query.single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    if (!summary) {
      return NextResponse.json({
        exists: false,
        summary: null,
      });
    }

    // Compute statistics from stored extractions
    const extractions = (summary.extractions || []) as PaperExtraction[];
    const statistics = extractions.length > 0 ? computeIssueStatistics(extractions) : null;

    // Get citation map - use stored one or compute from extractions for backward compatibility
    let citationMap: CitationMap | null = summary.citation_map as CitationMap | null;
    if (!citationMap && extractions.length > 0) {
      citationMap = {};
      extractions.forEach((extraction, index) => {
        const citationNum = index + 1;
        citationMap![citationNum.toString()] = {
          paper_id: extraction.paper_id,
          title: extraction.title,
        };
      });
    }

    return NextResponse.json({
      exists: true,
      summary: {
        id: summary.id,
        content: summary.summary_content,
        paperCount: summary.paper_count,
        extractions: summary.extractions,
        statistics,
        citationMap,
        fieldContext: summary.field_context,
        customPrompt: summary.custom_prompt,
        modelExtraction: summary.model_extraction,
        modelSynthesis: summary.model_synthesis,
        tokensExtraction: summary.tokens_used_extraction,
        tokensSynthesis: summary.tokens_used_synthesis,
        costEstimate: summary.cost_estimate,
        createdAt: summary.created_at,
      },
    });
  } catch (error) {
    console.error('Get issue summary error:', error);
    return NextResponse.json({
      error: 'Failed to get issue summary',
      details: error instanceof Error ? error.message : 'Unknown',
    }, { status: 500 });
  }
}

// POST: Generate new issue summary
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { scraper: scraperKey, issueId } = await params;

  const scraper = getScraper(scraperKey);
  if (!scraper) {
    return NextResponse.json({
      error: `Scraper '${scraperKey}' not found`,
    }, { status: 404 });
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

  try {
    // Get issue info and articles from cache
    const { data: issueCache } = await supabase
      .from('issue_cache')
      .select('journal_name, issue_info, articles')
      .eq('scraper_key', scraperKey)
      .eq('issue_id', issueId)
      .single();

    if (!issueCache) {
      return NextResponse.json({
        error: 'Issue not found in cache. Please load the issue first.',
      }, { status: 404 });
    }

    const journalName = issueCache.journal_name || scraper.name;
    const issueInfo = issueCache.issue_info as { volume?: string; issue?: string; year?: string } || {};
    const issueInfoStr = `${issueInfo.volume || ''}권 ${issueInfo.issue || ''}호 (${issueInfo.year || ''})`;

    // Get article IDs from cache
    const cachedArticles = (issueCache.articles || []) as Array<{ id: string }>;
    const articleIds = cachedArticles.map(a => a.id);

    if (articleIds.length === 0) {
      return NextResponse.json({
        error: 'No articles found in cache for this issue.',
      }, { status: 404 });
    }

    // Get source to find papers
    const { data: source } = await supabase
      .from('sources')
      .select('id')
      .eq('name', scraper.name)
      .eq('type', 'journal')
      .single();

    if (!source) {
      return NextResponse.json({
        error: 'Source not found in database',
      }, { status: 404 });
    }

    // Get papers for this issue with full text (match by external_id)
    const { data: papers, error: papersError } = await supabase
      .from('papers')
      .select('id, title, full_text, abstract')
      .eq('source_id', source.id)
      .in('external_id', articleIds)
      .not('full_text', 'is', null);

    if (papersError) {
      throw papersError;
    }

    if (!papers || papers.length === 0) {
      return NextResponse.json({
        error: 'No papers with full text found for this issue. Please scrape papers first.',
      }, { status: 400 });
    }

    // Prepare papers for summary service
    const papersForSummary = papers.map(p => ({
      id: p.id,
      title: p.title,
      text: p.full_text || p.abstract || '',
    }));

    console.log(`Generating issue summary for ${papers.length} papers...`);

    // Generate summary
    const summaryService = getIssueSummaryService();
    const result = await summaryService.generateIssueSummary(
      papersForSummary,
      journalName,
      issueInfoStr,
      customPrompt,
      fieldContext
    );

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

    let savedSummary = null;
    let saveError = null;

    if (userId) {
      // For user-specific summaries, upsert works
      const result = await supabase
        .from('issue_summaries')
        .upsert(summaryData, { onConflict: 'scraper_key,issue_id,user_id' })
        .select()
        .single();
      savedSummary = result.data;
      saveError = result.error;
    } else {
      // For global summaries (NULL user_id), delete first then insert
      await supabase
        .from('issue_summaries')
        .delete()
        .eq('scraper_key', scraperKey)
        .eq('issue_id', issueId)
        .is('user_id', null);

      const insertResult = await supabase
        .from('issue_summaries')
        .insert(summaryData)
        .select()
        .single();
      savedSummary = insertResult.data;
      saveError = insertResult.error;
    }

    if (saveError) {
      console.error('Failed to save summary:', saveError);
      // Still return the result even if save failed
    }

    return NextResponse.json({
      success: true,
      summary: {
        id: savedSummary?.id,
        content: result.summary,
        paperCount: result.paper_count,
        extractions: result.extractions,
        failedPapers: result.failed_papers,
        tokensExtraction: result.tokens_extraction,
        tokensSynthesis: result.tokens_synthesis,
        costEstimate: result.cost_estimate,
      },
    });

  } catch (error) {
    console.error('Generate issue summary error:', error);
    return NextResponse.json({
      error: 'Failed to generate issue summary',
      details: error instanceof Error ? error.message : 'Unknown',
    }, { status: 500 });
  }
}

// GET default prompt for the modal
export async function OPTIONS(request: NextRequest, { params }: RouteParams) {
  const { scraper: scraperKey, issueId } = await params;

  const scraper = getScraper(scraperKey);
  if (!scraper) {
    return NextResponse.json({
      error: `Scraper '${scraperKey}' not found`,
    }, { status: 404 });
  }

  const fieldContext = request.nextUrl.searchParams.get('fieldContext');

  const supabase = createServerClient();

  try {
    // Get issue info and paper count
    const { data: issueCache } = await supabase
      .from('issue_cache')
      .select('journal_name, issue_info, articles')
      .eq('scraper_key', scraperKey)
      .eq('issue_id', issueId)
      .single();

    const journalName = issueCache?.journal_name || scraper.name;
    const issueInfo = issueCache?.issue_info as { volume?: string; issue?: string; year?: string } || {};
    const issueInfoStr = `${issueInfo.volume || ''}권 ${issueInfo.issue || ''}호 (${issueInfo.year || ''})`;
    const articleCount = Array.isArray(issueCache?.articles) ? issueCache.articles.length : 0;

    const summaryService = getIssueSummaryService();
    const defaultPrompt = summaryService.getDefaultSynthesisPrompt(
      journalName,
      issueInfoStr,
      articleCount,
      fieldContext || undefined
    );

    return NextResponse.json({
      defaultPrompt,
      journalName,
      issueInfo: issueInfoStr,
      articleCount,
    });
  } catch (error) {
    console.error('Get default prompt error:', error);
    return NextResponse.json({
      error: 'Failed to get default prompt',
      details: error instanceof Error ? error.message : 'Unknown',
    }, { status: 500 });
  }
}
