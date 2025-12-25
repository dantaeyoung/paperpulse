import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { getScraper, getAllScraperKeys } from '@/lib/scrapers/journal-base';
// Import scrapers to register them
import '@/lib/scrapers/counselors';

export async function GET(request: NextRequest) {
  const scraperKey = request.nextUrl.searchParams.get('scraper');
  const issueId = request.nextUrl.searchParams.get('issue');
  const year = request.nextUrl.searchParams.get('year');
  const extractText = request.nextUrl.searchParams.get('extract') === 'true';
  const save = request.nextUrl.searchParams.get('save') === 'true';
  const token = request.nextUrl.searchParams.get('token');

  // List all available scrapers
  if (!scraperKey) {
    return NextResponse.json({
      message: 'Available journal scrapers',
      scrapers: getAllScraperKeys(),
      usage: {
        'List scrapers': '/api/test/scrape-journal',
        'List issues': '/api/test/scrape-journal?scraper=counselors&year=2024',
        'Scrape issue': '/api/test/scrape-journal?scraper=counselors&issue=137',
        'Scrape + extract': '/api/test/scrape-journal?scraper=counselors&issue=137&extract=true',
        'Scrape + save': '/api/test/scrape-journal?scraper=counselors&year=2024&save=true&token=xxx',
      },
    });
  }

  // Get the requested scraper
  const scraper = getScraper(scraperKey);
  if (!scraper) {
    return NextResponse.json({
      error: `Scraper '${scraperKey}' not found`,
      available: getAllScraperKeys(),
    }, { status: 404 });
  }

  const logs: string[] = [];
  const onProgress = (msg: string) => {
    logs.push(msg);
    console.log(`[${scraperKey}] ${msg}`);
  };

  try {
    // If year is specified but no issue, list all issues for that year
    if (year && !issueId) {
      const yearNum = parseInt(year, 10);
      const issues = await scraper.getIssues(yearNum, yearNum);
      return NextResponse.json({
        scraper: scraperKey,
        journal: scraper.name,
        year: yearNum,
        issues,
        message: `Found ${issues.length} issues. Use ?scraper=${scraperKey}&issue=XXX to scrape a specific issue.`,
      });
    }

    // Scrape a specific issue
    if (issueId) {
      onProgress(`Scraping issue ${issueId}...`);
      const articles = await scraper.collectIssue(issueId, {
        extractText,
        onProgress,
      });

      // Save to database if requested
      if (save && token) {
        const supabase = createServerClient();

        // Get user from token
        const { data: user, error: userError } = await supabase
          .from('users')
          .select('id')
          .eq('token', token)
          .single();

        if (userError || !user) {
          return NextResponse.json({
            error: 'Invalid token',
          }, { status: 401 });
        }

        // Get or create source for this journal
        let { data: source } = await supabase
          .from('sources')
          .select('id')
          .eq('name', scraper.name)
          .eq('type', 'journal')
          .single();

        if (!source) {
          const { data: newSource } = await supabase
            .from('sources')
            .insert({
              name: scraper.name,
              type: 'journal',
              url: scraper.baseUrl,
              is_active: true,
              is_global: true,
              config: { scraper: scraperKey },
            })
            .select('id')
            .single();
          source = newSource;
        }

        // Save articles
        let savedCount = 0;
        for (const article of articles) {
          const { error: insertError } = await supabase
            .from('papers')
            .upsert({
              source_id: source!.id,
              external_id: article.id,
              title: article.title,
              authors: article.authors.map(name => ({ name })),
              full_text: article.extractedText || null,
              url: article.url,
              journal_name: scraper.name,
              volume: article.volume,
              issue: article.issue,
              pages: article.pages,
              published_at: article.year ? `${article.year}-01-01` : null,
            }, {
              onConflict: 'source_id,external_id',
            });

          if (!insertError) savedCount++;
        }

        onProgress(`Saved ${savedCount}/${articles.length} articles to database`);
      }

      return NextResponse.json({
        scraper: scraperKey,
        journal: scraper.name,
        issue: issueId,
        extractedText: extractText,
        saved: save,
        articleCount: articles.length,
        articles: articles.map(a => {
          const text = typeof a.extractedText === 'string' ? a.extractedText : '';
          return {
            id: a.id,
            title: a.title,
            authors: a.authors,
            year: a.year,
            volume: a.volume,
            issue: a.issue,
            url: a.url,
            pdfUrl: a.pdfUrl,
            hasExtractedText: text.length > 0,
            extractedTextLength: text.length,
            // Include first 500 chars of extracted text for preview
            textPreview: text.length > 0 ? text.substring(0, 500) : null,
          };
        }),
        logs,
      });
    }

    // If no year or issue specified, show info
    const currentYear = new Date().getFullYear();
    const issues = await scraper.getIssues(currentYear, currentYear);

    return NextResponse.json({
      scraper: scraperKey,
      journal: scraper.name,
      baseUrl: scraper.baseUrl,
      currentYearIssues: issues,
      usage: {
        'List issues for year': `?scraper=${scraperKey}&year=2024`,
        'Scrape one issue': `?scraper=${scraperKey}&issue=137`,
        'Scrape with PDF extraction': `?scraper=${scraperKey}&issue=137&extract=true`,
        'Scrape and save to DB': `?scraper=${scraperKey}&issue=137&save=true&token=XXX`,
        'Scrape full year and save': `?scraper=${scraperKey}&year=2024&save=true&token=XXX`,
      },
    });
  } catch (error) {
    console.error('Scraper error:', error);
    return NextResponse.json({
      error: 'Scraper failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      logs,
    }, { status: 500 });
  }
}
