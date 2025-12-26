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
  paperNumber?: number;
  url: string;
  pdfUrl: string;
}

interface IssueCache {
  scraper_key: string;
  issue_id: string;
  journal_name: string;
  issue_info: { year: string; volume: string; issue: string };
  articles: CachedArticle[];
}

// Get all papers from all cached issues, merged with scrape status
export async function GET(request: NextRequest) {
  const supabase = createServerClient();

  try {
    // Get all cached issues
    const { data: cachedIssues, error: cacheError } = await supabase
      .from('issue_cache')
      .select('scraper_key, issue_id, journal_name, issue_info, articles')
      .order('issue_id', { ascending: false });

    if (cacheError) {
      return NextResponse.json({
        error: 'Failed to fetch cached issues',
        details: cacheError.message,
      }, { status: 500 });
    }

    if (!cachedIssues || cachedIssues.length === 0) {
      return NextResponse.json({
        papers: [],
        message: 'No cached issues found. Load some issues first to populate the cache.',
      });
    }

    // Get all scraped papers to check status
    const { data: scrapedPapers } = await supabase
      .from('papers')
      .select('id, external_id, source_id, full_text');

    // Build a map of scraped papers by external_id
    // Use String() to ensure consistent key types
    const scrapedMap = new Map<string, { dbId: string; hasFullText: boolean; fullTextLength: number }>();
    for (const paper of scrapedPapers || []) {
      scrapedMap.set(String(paper.external_id), {
        dbId: paper.id,
        hasFullText: !!paper.full_text,
        fullTextLength: paper.full_text?.length || 0,
      });
    }

    // Get all issue summaries to find papers with AI extractions
    const { data: issueSummaries } = await supabase
      .from('issue_summaries')
      .select('extractions');

    // Build a set of paper IDs (database UUIDs) that have extractions
    const extractedPaperIds = new Set<string>();
    for (const summary of issueSummaries || []) {
      const extractions = (summary.extractions as Array<{ paper_id: string }>) || [];
      for (const extraction of extractions) {
        if (extraction.paper_id) {
          extractedPaperIds.add(extraction.paper_id);
        }
      }
    }

    // Flatten all articles from all issues into one list
    const allPapers: {
      id: string;
      scraperKey: string;
      issueId: string;
      journal: string;
      year: string;
      volume: string;
      issue: string;
      paperNumber?: number;
      title: string;
      authors: string[];
      url: string;
      pdfUrl: string;
      isScraped: boolean;
      hasFullText: boolean;
      fullTextLength: number;
      storagePdfUrl: string | null;
      hasExtraction: boolean;
    }[] = [];

    for (const cache of cachedIssues as IssueCache[]) {
      const articles = cache.articles || [];
      const issueInfo = cache.issue_info || {};

      for (const article of articles) {
        const scraped = scrapedMap.get(String(article.id));

        allPapers.push({
          id: article.id,
          scraperKey: cache.scraper_key,
          issueId: cache.issue_id,
          journal: cache.journal_name || '',
          year: article.year || issueInfo.year || '',
          volume: article.volume || issueInfo.volume || '',
          issue: article.issue || issueInfo.issue || '',
          paperNumber: article.paperNumber,
          title: article.title,
          authors: article.authors || [],
          url: article.url,
          pdfUrl: article.pdfUrl,
          isScraped: !!scraped,
          hasFullText: scraped?.hasFullText || false,
          fullTextLength: scraped?.fullTextLength || 0,
          storagePdfUrl: scraped?.hasFullText ? getPdfUrl(cache.scraper_key, article.id) : null,
          hasExtraction: scraped?.dbId ? extractedPaperIds.has(scraped.dbId) : false,
        });
      }
    }

    // Sort by year desc, volume desc, issue desc
    allPapers.sort((a, b) => {
      const yearDiff = parseInt(b.year || '0') - parseInt(a.year || '0');
      if (yearDiff !== 0) return yearDiff;
      const volDiff = parseInt(b.volume || '0') - parseInt(a.volume || '0');
      if (volDiff !== 0) return volDiff;
      return parseInt(b.issue || '0') - parseInt(a.issue || '0');
    });

    // Stats
    const totalPapers = allPapers.length;
    const scrapedCount = allPapers.filter(p => p.isScraped).length;
    const withFullTextCount = allPapers.filter(p => p.hasFullText).length;

    return NextResponse.json({
      totalPapers,
      scrapedCount,
      withFullTextCount,
      papers: allPapers,
    });

  } catch (error) {
    console.error('All papers API error:', error);
    return NextResponse.json({
      error: 'Failed to fetch papers',
      details: error instanceof Error ? error.message : 'Unknown',
    }, { status: 500 });
  }
}
