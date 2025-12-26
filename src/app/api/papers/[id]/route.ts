import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { existsSync } from 'fs';
import path from 'path';

interface CachedArticle {
  id: string;
  title: string;
  authors: string[];
  year: string;
  volume: string;
  issue: string;
  url: string;
  pdfUrl: string;
}

// Get a single paper by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: paperId } = await params;

  const supabase = createServerClient();

  try {
    // First, try to find the paper in the papers table (scraped papers)
    // Query all papers and filter in JS to handle type mismatches
    const { data: allPapers, error: scrapedError } = await supabase
      .from('papers')
      .select('*, extraction, sources(name, config)');

    if (scrapedError) {
      console.error('Paper query error:', scrapedError);
    }

    // Find by external_id using String() comparison (handles type mismatches)
    const scrapedPaper = allPapers?.find(p => String(p.external_id) === String(paperId)) || null;

    if (!scrapedPaper && allPapers && allPapers.length > 0) {
      console.log('[paper-detail] Paper not found. Looking for:', paperId);
      console.log('[paper-detail] Sample external_ids:', allPapers.slice(0, 3).map(p => p.external_id));
    }

    // Also search in issue_cache for the article metadata
    const { data: cachedIssues } = await supabase
      .from('issue_cache')
      .select('scraper_key, journal_name, issue_info, articles');

    let cachedArticle: CachedArticle | null = null;
    let scraperKey = '';
    let journalName = '';

    // Find the article in cached issues
    // Use String() comparison to handle potential type mismatches (string vs number)
    for (const cache of cachedIssues || []) {
      const articles = cache.articles as CachedArticle[] || [];
      const found = articles.find(a => String(a.id) === String(paperId));
      if (found) {
        cachedArticle = found;
        scraperKey = cache.scraper_key;
        journalName = cache.journal_name;
        break;
      }
    }

    if (!cachedArticle && !scrapedPaper) {
      return NextResponse.json({ error: 'Paper not found' }, { status: 404 });
    }

    // Check for local PDF
    let localPdfUrl: string | null = null;
    if (scraperKey) {
      const pdfPath = path.join(process.cwd(), 'public', 'pdfs', scraperKey, `${paperId}.pdf`);
      if (existsSync(pdfPath)) {
        localPdfUrl = `/pdfs/${scraperKey}/${paperId}.pdf`;
      }
    }

    // Look for AI extraction - first check paper's own extraction field
    let extraction = scrapedPaper?.extraction || null;

    // Fall back to issue_summaries if no direct extraction
    if (!extraction && scrapedPaper?.id) {
      const { data: summaries } = await supabase
        .from('issue_summaries')
        .select('extractions')
        .eq('scraper_key', scraperKey);

      // Find the extraction for this paper by database ID
      for (const summary of summaries || []) {
        const extractions = summary.extractions as Array<{ paper_id: string }> || [];
        const found = extractions.find(e => e.paper_id === scrapedPaper.id);
        if (found) {
          extraction = found;
          break;
        }
      }
    }

    // Build the response
    const paper = {
      id: paperId,
      scraperKey: scraperKey || (scrapedPaper?.sources as { config?: { scraper?: string } })?.config?.scraper || '',
      journal: journalName || scrapedPaper?.journal_name || '',
      year: cachedArticle?.year || (scrapedPaper?.published_at ? new Date(scrapedPaper.published_at).getFullYear().toString() : ''),
      volume: cachedArticle?.volume || scrapedPaper?.volume || '',
      issue: cachedArticle?.issue || scrapedPaper?.issue || '',
      title: cachedArticle?.title || scrapedPaper?.title || '',
      authors: cachedArticle?.authors || (scrapedPaper?.authors as { name: string }[] || []).map(a => a.name),
      url: cachedArticle?.url || scrapedPaper?.url || '',
      pdfUrl: cachedArticle?.pdfUrl || '',
      isScraped: !!scrapedPaper,
      hasFullText: !!scrapedPaper?.full_text,
      fullTextLength: scrapedPaper?.full_text?.length || 0,
      fullText: scrapedPaper?.full_text || null,
      localPdfUrl,
      extraction,
    };

    return NextResponse.json({ paper });

  } catch (error) {
    console.error('Paper fetch error:', error);
    return NextResponse.json({
      error: 'Failed to fetch paper',
      details: error instanceof Error ? error.message : 'Unknown',
    }, { status: 500 });
  }
}
