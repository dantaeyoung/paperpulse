import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { getKCIWebScraper, KCIWebPaper } from '@/lib/scrapers/kci-web';
import { getOpenAlexScraper, OpenAlexPaper } from '@/lib/scrapers/openalex';
import { getScraper, JournalArticle } from '@/lib/scrapers/journal-base';
// Import scrapers to register them
import '@/lib/scrapers/counselors';

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
  return handleCollect(request);
}

export async function POST(request: NextRequest) {
  return handleCollect(request);
}

async function handleCollect(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServerClient();
  const results: { source: string; count: number; scraper: string; errors: string[] }[] = [];

  try {
    // Get all active global sources (journals)
    const { data: sources } = await supabase
      .from('sources')
      .select('*')
      .eq('is_active', true)
      .eq('is_global', true);

    if (!sources || sources.length === 0) {
      return NextResponse.json({
        message: 'No active sources found',
        collected: 0,
        results: [],
      });
    }

    // Get all unique keywords from active users
    const { data: keywords } = await supabase
      .from('keywords')
      .select('keyword')
      .eq('is_active', true);

    const uniqueKeywords = [...new Set(keywords?.map(k => k.keyword) || [])];

    if (uniqueKeywords.length === 0) {
      return NextResponse.json({
        message: 'No active keywords found',
        collected: 0,
        results: [],
      });
    }

    // Initialize scrapers
    const kciWebScraper = getKCIWebScraper();
    const openAlexScraper = getOpenAlexScraper();

    // For each journal source, run the scraper
    for (const source of sources) {
      const sourceResult = { source: source.name, count: 0, scraper: '', errors: [] as string[] };

      try {
        // Check if this source has a direct journal scraper configured
        const sourceConfig = source.config as { scraper?: string; startYear?: number } | null;
        const scraperKey = sourceConfig?.scraper;

        if (scraperKey) {
          // Use direct journal scraper
          const journalScraper = getScraper(scraperKey);
          if (journalScraper) {
            console.log(`Using direct scraper '${scraperKey}' for: ${source.name}`);
            sourceResult.scraper = `Direct: ${scraperKey}`;

            // For cron, only collect current year to stay within timeout
            const currentYear = new Date().getFullYear();
            const articles = await journalScraper.collectAll({
              startYear: currentYear,
              endYear: currentYear,
              extractText: true, // Get full text for keyword matching
              onProgress: (msg) => console.log(`[${scraperKey}] ${msg}`),
            });

            // Save articles to database
            for (const article of articles) {
              try {
                const { error: insertError } = await supabase
                  .from('papers')
                  .upsert({
                    source_id: source.id,
                    external_id: article.id,
                    title: article.title,
                    authors: article.authors.map(name => ({ name })),
                    full_text: article.extractedText || null,
                    url: article.url,
                    journal_name: journalScraper.name,
                    volume: article.volume,
                    issue: article.issue,
                    pages: article.pages,
                    published_at: article.year ? `${article.year}-01-01` : null,
                  }, {
                    onConflict: 'source_id,external_id',
                  });

                if (!insertError) {
                  sourceResult.count++;
                }
              } catch (err) {
                console.error(`Error saving article:`, err);
              }
            }

            results.push(sourceResult);
            continue; // Skip KCI/OpenAlex for this source
          }
        }

        // Fall through to KCI/OpenAlex scrapers
        let papers: Array<KCIWebPaper | OpenAlexPaper> = [];
        let scraperUsed = '';

        // Try KCI Web scraper first (no API key, current data)
        try {
          console.log(`Scraping KCI Web for: ${source.name}`);
          const kciPapers = await kciWebScraper.searchByJournal(source.name, {
            keywords: uniqueKeywords,
            daysBack: 90, // 3 months
          });
          papers = kciPapers;
          scraperUsed = 'KCI Web';
          console.log(`Found ${papers.length} papers from KCI Web for ${source.name}`);
        } catch (err) {
          console.warn(`KCI Web failed for ${source.name}:`, err);

          // Fall back to OpenAlex (free, no key, but may have older data)
          try {
            console.log(`Falling back to OpenAlex for: ${source.name}`);
            const openAlexPapers = await openAlexScraper.searchByJournal(source.name, {
              daysBack: 365 * 10,
            });
            papers = openAlexPapers;
            scraperUsed = 'OpenAlex';
            console.log(`Found ${papers.length} papers from OpenAlex for ${source.name}`);
          } catch (openAlexErr) {
            console.warn(`OpenAlex also failed for ${source.name}:`, openAlexErr);
          }
        }

        sourceResult.scraper = scraperUsed;

        // Save papers to database
        for (const paper of papers) {
          try {
            // Normalize the paper data
            const externalId = 'articleId' in paper ? paper.articleId : paper.id;
            const journalName = 'journal' in paper ? paper.journal : source.name;

            // Handle different date formats
            let publishedAt = null;
            if (paper.publishedAt) {
              // Could be "2024.12" or "2024-12-01" format
              if (paper.publishedAt.includes('.')) {
                const [year, month] = paper.publishedAt.split('.');
                publishedAt = `${year}-${month.padStart(2, '0')}-01`;
              } else {
                publishedAt = paper.publishedAt;
              }
            }

            const { error: insertError } = await supabase
              .from('papers')
              .upsert({
                source_id: source.id,
                external_id: externalId,
                title: paper.title,
                authors: paper.authors,
                abstract: 'abstract' in paper ? paper.abstract : null,
                url: paper.url,
                doi: 'doi' in paper ? paper.doi : null,
                journal_name: journalName,
                published_at: publishedAt,
              }, {
                onConflict: 'source_id,external_id',
              });

            if (!insertError) {
              sourceResult.count++;
            }
          } catch (err) {
            console.error(`Error saving paper:`, err);
          }
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        sourceResult.errors.push(errorMsg);
        console.error(`Error scraping ${source.name}:`, err);
      }

      results.push(sourceResult);
    }

    const totalCollected = results.reduce((sum, r) => sum + r.count, 0);

    return NextResponse.json({
      message: 'Collection completed',
      collected: totalCollected,
      keywords: uniqueKeywords.length,
      results,
    });

  } catch (error) {
    console.error('Collection error:', error);
    return NextResponse.json({
      error: 'Collection failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
