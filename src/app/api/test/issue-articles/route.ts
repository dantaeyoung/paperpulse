import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { getScraper, JournalArticle } from '@/lib/scrapers/journal-base';
import { existsSync } from 'fs';
import path from 'path';
import '@/lib/scrapers/counselors';

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

interface IssueInfo {
  year?: string;
  volume?: string;
  issue?: string;
}

// Get all articles for an issue, merged with database status
export async function GET(request: NextRequest) {
  const scraperKey = request.nextUrl.searchParams.get('scraper');
  const issueId = request.nextUrl.searchParams.get('issue');
  const refresh = request.nextUrl.searchParams.get('refresh') === 'true';

  if (!scraperKey || !issueId) {
    return NextResponse.json({
      error: 'Missing scraper or issue parameter',
    }, { status: 400 });
  }

  const scraper = getScraper(scraperKey);
  if (!scraper) {
    return NextResponse.json({
      error: `Scraper '${scraperKey}' not found`,
    }, { status: 404 });
  }

  const supabase = createServerClient();

  try {
    // Get issue info
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const issueInfo = (scraper as any).getIssueInfoFromCatcode?.(issueId) || {
      id: issueId,
      year: '',
      volume: '',
      issue: '',
    };

    let websiteArticles: JournalArticle[] = [];
    let fromCache = false;

    // Check cache first (unless refresh requested)
    if (!refresh) {
      const { data: cached } = await supabase
        .from('issue_cache')
        .select('articles, issue_info, cached_at')
        .eq('scraper_key', scraperKey)
        .eq('issue_id', issueId)
        .single();

      if (cached?.articles) {
        // Use cached issue_info if available
        const cachedIssueInfo = cached.issue_info as IssueInfo | null;
        if (cachedIssueInfo) {
          issueInfo.year = cachedIssueInfo.year || issueInfo.year;
          issueInfo.volume = cachedIssueInfo.volume || issueInfo.volume;
          issueInfo.issue = cachedIssueInfo.issue || issueInfo.issue;
        }

        websiteArticles = (cached.articles as CachedArticle[]).map(a => ({
          id: a.id,
          title: a.title,
          authors: a.authors,
          year: a.year || issueInfo.year,
          volume: a.volume || issueInfo.volume,
          issue: a.issue || issueInfo.issue,
          paperNumber: a.paperNumber,
          url: a.url,
          pdfUrl: a.pdfUrl,
        }));
        fromCache = true;
      }
    }

    // Fetch from website if no cache or refresh requested
    if (!fromCache) {
      websiteArticles = await scraper.collectIssue(issueId, {
        extractText: false,
        onProgress: () => {},
      });

      // Extract issueInfo from first article (articles have correct info from scraper)
      if (websiteArticles.length > 0) {
        const firstArticle = websiteArticles[0];
        if (firstArticle.year) issueInfo.year = firstArticle.year;
        if (firstArticle.volume) issueInfo.volume = firstArticle.volume;
        if (firstArticle.issue) issueInfo.issue = firstArticle.issue;
      }

      // Fill in issue info for any articles missing it
      for (const article of websiteArticles) {
        if (!article.year) article.year = issueInfo.year;
        if (!article.volume) article.volume = issueInfo.volume;
        if (!article.issue) article.issue = issueInfo.issue;
      }

      // Cache the results
      const articlesToCache = websiteArticles.map(a => ({
        id: a.id,
        title: a.title,
        authors: a.authors,
        year: a.year,
        volume: a.volume,
        issue: a.issue,
        paperNumber: a.paperNumber,
        url: a.url,
        pdfUrl: a.pdfUrl,
      }));

      await supabase
        .from('issue_cache')
        .upsert({
          scraper_key: scraperKey,
          issue_id: issueId,
          journal_name: scraper.name,
          issue_info: issueInfo,
          articles: articlesToCache,
          cached_at: new Date().toISOString(),
        }, {
          onConflict: 'scraper_key,issue_id',
        });
    }

    // Get source from database
    const { data: source } = await supabase
      .from('sources')
      .select('id')
      .eq('name', scraper.name)
      .eq('type', 'journal')
      .single();

    // Get existing papers from database for this issue
    // Match by external_id (article.id) since volume/issue matching can be unreliable
    let dbPapers: Record<string, {
      id: string;
      hasFullText: boolean;
      fullTextLength: number;
    }> = {};

    if (source) {
      // Get all article IDs from the cache to query
      const articleIds = websiteArticles.map(a => a.id);

      if (articleIds.length > 0) {
        const { data: papers } = await supabase
          .from('papers')
          .select('id, external_id, full_text')
          .eq('source_id', source.id)
          .in('external_id', articleIds);

        if (papers) {
          for (const paper of papers) {
            dbPapers[paper.external_id] = {
              id: paper.id,
              hasFullText: !!paper.full_text,
              fullTextLength: paper.full_text?.length || 0,
            };
          }
        }
      }
    }

    // Merge website articles with database status
    const unifiedArticles = websiteArticles.map(article => {
      const dbPaper = dbPapers[article.id];
      let localPdfUrl: string | null = null;

      // Check if PDF exists locally
      if (dbPaper?.hasFullText) {
        const pdfPath = path.join(process.cwd(), 'public', 'pdfs', scraperKey, `${article.id}.pdf`);
        if (existsSync(pdfPath)) {
          localPdfUrl = `/pdfs/${scraperKey}/${article.id}.pdf`;
        }
      }

      return {
        id: article.id,
        title: article.title,
        authors: article.authors,
        year: article.year,
        volume: article.volume,
        issue: article.issue,
        paperNumber: article.paperNumber,
        url: article.url,
        pdfUrl: article.pdfUrl,
        // Database status
        isScraped: !!dbPaper,
        dbPaperId: dbPaper?.id || null,
        hasFullText: dbPaper?.hasFullText || false,
        fullTextLength: dbPaper?.fullTextLength || 0,
        localPdfUrl,
      };
    });

    const scrapedCount = unifiedArticles.filter(a => a.isScraped).length;

    // Find adjacent issues (prev/next) from cache
    const { data: allIssues } = await supabase
      .from('issue_cache')
      .select('issue_id, issue_info')
      .eq('scraper_key', scraperKey);

    let prevIssue: { id: string; info: IssueInfo } | null = null;
    let nextIssue: { id: string; info: IssueInfo } | null = null;

    if (allIssues && allIssues.length > 0) {
      // Sort by year desc, volume desc, issue desc (newest first)
      const sortedIssues = allIssues.sort((a, b) => {
        const infoA = a.issue_info as IssueInfo;
        const infoB = b.issue_info as IssueInfo;

        const yearA = parseInt(infoA.year || '0', 10);
        const yearB = parseInt(infoB.year || '0', 10);
        if (yearB !== yearA) return yearB - yearA;

        const volA = parseInt(infoA.volume || '0', 10);
        const volB = parseInt(infoB.volume || '0', 10);
        if (volB !== volA) return volB - volA;

        const issueA = parseInt(infoA.issue || '0', 10);
        const issueB = parseInt(infoB.issue || '0', 10);
        return issueB - issueA;
      });

      const currentIndex = sortedIssues.findIndex(i => i.issue_id === issueId);
      if (currentIndex !== -1) {
        // Next = newer issue (lower index in descending array)
        if (currentIndex > 0) {
          const next = sortedIssues[currentIndex - 1];
          nextIssue = { id: next.issue_id, info: next.issue_info as IssueInfo };
        }
        // Prev = older issue (higher index in descending array)
        if (currentIndex < sortedIssues.length - 1) {
          const prev = sortedIssues[currentIndex + 1];
          prevIssue = { id: prev.issue_id, info: prev.issue_info as IssueInfo };
        }
      }
    }

    return NextResponse.json({
      scraper: scraperKey,
      journal: scraper.name,
      issueId,
      issueInfo,
      totalArticles: unifiedArticles.length,
      scrapedCount,
      fromCache,
      articles: unifiedArticles,
      prevIssue,
      nextIssue,
    });

  } catch (error) {
    console.error('Issue articles error:', error);
    return NextResponse.json({
      error: 'Failed to fetch issue articles',
      details: error instanceof Error ? error.message : 'Unknown',
    }, { status: 500 });
  }
}
