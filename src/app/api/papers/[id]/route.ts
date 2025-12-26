import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { getPdfUrl } from '@/lib/supabase/storage';

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
    console.log('=== PAPER DETAIL API CALLED ===');
    console.log('paperId from URL:', paperId, 'type:', typeof paperId);

    // First, try to find the paper in the papers table (scraped papers)
    // Query all papers and filter in JS to handle type mismatches
    // Use simple query without extraction column (may not exist if migration wasn't run)
    const { data: allPapers, error: scrapedError } = await supabase
      .from('papers')
      .select('id, external_id, source_id, title, authors, full_text, url, journal_name, volume, issue, published_at');

    if (scrapedError) {
      console.error('Paper query error:', scrapedError);
    }

    console.log('Total papers in DB:', allPapers?.length || 0);

    // Find by external_id using String() comparison (handles type mismatches)
    const scrapedPaper = allPapers?.find(p => String(p.external_id) === String(paperId)) || null;

    console.log('Found scrapedPaper:', scrapedPaper ? 'YES' : 'NO');
    if (scrapedPaper) {
      console.log('scrapedPaper.external_id:', scrapedPaper.external_id);
      console.log('scrapedPaper.full_text length:', scrapedPaper.full_text?.length || 0);
    } else if (allPapers && allPapers.length > 0) {
      console.log('Sample external_ids from DB:', allPapers.slice(0, 5).map(p => `"${p.external_id}" (${typeof p.external_id})`));
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

    // Generate storage PDF URL if paper has full text
    const storagePdfUrl = (scraperKey && scrapedPaper?.full_text)
      ? getPdfUrl(scraperKey, paperId)
      : null;

    // Look for AI extraction from issue_summaries
    // (extraction column on papers table may not exist)
    let extraction = null;

    if (scrapedPaper?.id) {
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
      scraperKey: scraperKey || '',
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
      storagePdfUrl,
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
