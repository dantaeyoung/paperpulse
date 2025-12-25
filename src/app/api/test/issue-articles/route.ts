import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { getScraper } from '@/lib/scrapers/journal-base';
import { existsSync } from 'fs';
import path from 'path';
import '@/lib/scrapers/counselors';

// Get all articles for an issue, merged with database status
export async function GET(request: NextRequest) {
  const scraperKey = request.nextUrl.searchParams.get('scraper');
  const issueId = request.nextUrl.searchParams.get('issue');

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

  try {
    // Get issue info
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const issueInfo = (scraper as any).getIssueInfoFromCatcode?.(issueId) || {
      id: issueId,
      year: '',
      volume: '',
      issue: '',
    };

    // Fetch articles from website
    const websiteArticles = await scraper.collectIssue(issueId, {
      extractText: false,
      onProgress: () => {},
    });

    // Fill in issue info for articles
    for (const article of websiteArticles) {
      if (!article.year) article.year = issueInfo.year;
      if (!article.volume) article.volume = issueInfo.volume;
      if (!article.issue) article.issue = issueInfo.issue;
    }

    // Get source from database
    const supabase = createServerClient();
    const { data: source } = await supabase
      .from('sources')
      .select('id')
      .eq('name', scraper.name)
      .eq('type', 'journal')
      .single();

    // Get existing papers from database for this issue
    let dbPapers: Record<string, {
      id: string;
      hasFullText: boolean;
      fullTextLength: number;
    }> = {};

    if (source) {
      const { data: papers } = await supabase
        .from('papers')
        .select('id, external_id, full_text')
        .eq('source_id', source.id)
        .eq('volume', issueInfo.volume)
        .eq('issue', issueInfo.issue);

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

    return NextResponse.json({
      scraper: scraperKey,
      journal: scraper.name,
      issueId,
      issueInfo,
      totalArticles: unifiedArticles.length,
      scrapedCount,
      articles: unifiedArticles,
    });

  } catch (error) {
    console.error('Issue articles error:', error);
    return NextResponse.json({
      error: 'Failed to fetch issue articles',
      details: error instanceof Error ? error.message : 'Unknown',
    }, { status: 500 });
  }
}
