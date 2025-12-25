import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { getScraper, getAllScraperKeys } from '@/lib/scrapers/journal-base';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
// Import scrapers to register them
import '@/lib/scrapers/counselors';

export async function GET(request: NextRequest) {
  const scraperKey = request.nextUrl.searchParams.get('scraper');
  const issueId = request.nextUrl.searchParams.get('issue');
  const articleId = request.nextUrl.searchParams.get('article'); // Single article ID
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

    // Scrape a specific issue (or single article within issue)
    if (issueId) {
      onProgress(`Scraping issue ${issueId}${articleId ? ` (article ${articleId})` : ''}...`);
      let articles = await scraper.collectIssue(issueId, {
        extractText: articleId ? false : extractText, // Don't extract if we're filtering to one article
        onProgress,
      });

      // Get issue info (year/volume/issue) from catcode for counselors scraper
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const issueInfo = (scraper as any).getIssueInfoFromCatcode?.(issueId) || { year: '', volume: '', issue: '' };

      // Fill in issue info for all articles
      for (const article of articles) {
        if (!article.year) article.year = issueInfo.year;
        if (!article.volume) article.volume = issueInfo.volume;
        if (!article.issue) article.issue = issueInfo.issue;
      }

      // If articleId specified, filter to just that article and extract its PDF
      if (articleId) {
        articles = articles.filter(a => a.id === articleId);
        if (articles.length > 0 && extractText) {
          const article = articles[0];
          if (article.pdfUrl) {
            try {
              onProgress(`Downloading PDF for: ${article.title.substring(0, 50)}...`);
              const res = await fetch(article.pdfUrl, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                },
              });
              const contentType = res.headers.get('content-type') || '';
              const buffer = await res.arrayBuffer();
              const uint8Array = new Uint8Array(buffer);

              // Check if it's a PDF by content-type OR by checking PDF magic bytes (%PDF)
              const isPdf = contentType.includes('pdf') ||
                            contentType.includes('octet-stream') ||
                            contentType.includes('file/unknown') ||
                            (uint8Array[0] === 0x25 && uint8Array[1] === 0x50 && uint8Array[2] === 0x44 && uint8Array[3] === 0x46); // %PDF

              if (isPdf && uint8Array.length > 100) {
                // Save PDF to local file
                const pdfDir = path.join(process.cwd(), 'public', 'pdfs', scraperKey || 'unknown');
                if (!existsSync(pdfDir)) {
                  await mkdir(pdfDir, { recursive: true });
                }
                const pdfFileName = `${article.id}.pdf`;
                const pdfPath = path.join(pdfDir, pdfFileName);
                await writeFile(pdfPath, Buffer.from(buffer));
                onProgress(`✓ Saved PDF: /pdfs/${scraperKey}/${pdfFileName}`);

                // Extract text
                const { extractText: extractPdfText } = await import('unpdf');
                const { text } = await extractPdfText(uint8Array);
                article.extractedText = Array.isArray(text) ? text.join('\n\n') : String(text || '');
                onProgress(`✓ Extracted ${article.extractedText.length} chars`);
              } else {
                onProgress(`✗ Not a PDF (${contentType})`);
              }
            } catch (err) {
              onProgress(`✗ PDF failed: ${err instanceof Error ? err.message : 'Unknown'}`);
            }
          }
        }
      }

      // Save to database if requested
      if (save) {
        const supabase = createServerClient();

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
            localPdfUrl: text.length > 0 ? `/pdfs/${scraperKey}/${a.id}.pdf` : null,
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
