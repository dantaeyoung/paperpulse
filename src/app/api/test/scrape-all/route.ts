import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { getScraper } from '@/lib/scrapers/journal-base';
import '@/lib/scrapers/counselors';

// Scrape all issues for all years and cache them
export async function GET(request: NextRequest) {
  const scraperKey = request.nextUrl.searchParams.get('scraper') || 'counselors';
  const startYear = parseInt(request.nextUrl.searchParams.get('start') || '2000', 10);
  const endYear = parseInt(request.nextUrl.searchParams.get('end') || String(new Date().getFullYear()), 10);

  const scraper = getScraper(scraperKey);
  if (!scraper) {
    return NextResponse.json({ error: `Scraper '${scraperKey}' not found` }, { status: 404 });
  }

  const supabase = createServerClient();
  const logs: string[] = [];
  const log = (msg: string) => {
    logs.push(msg);
    console.log(`[scrape-all] ${msg}`);
  };

  try {
    log(`Starting bulk scrape for ${scraperKey} from ${startYear} to ${endYear}`);

    let totalIssues = 0;
    let totalArticles = 0;
    let cachedYears = 0;
    let cachedIssues = 0;

    // Process each year
    for (let year = endYear; year >= startYear; year--) {
      log(`Processing year ${year}...`);

      // Check if year is already cached
      const { data: yearCache } = await supabase
        .from('year_issues_cache')
        .select('issues')
        .eq('scraper_key', scraperKey)
        .eq('year', year)
        .single();

      let issues;
      if (yearCache?.issues) {
        issues = yearCache.issues;
        log(`  Year ${year}: ${issues.length} issues (from cache)`);
      } else {
        // Fetch from website
        issues = await scraper.getIssues(year, year);
        log(`  Year ${year}: ${issues.length} issues (fetched)`);

        // Cache the year
        await supabase
          .from('year_issues_cache')
          .upsert({
            scraper_key: scraperKey,
            year,
            journal_name: scraper.name,
            issues,
            cached_at: new Date().toISOString(),
          }, {
            onConflict: 'scraper_key,year',
          });
        cachedYears++;
      }

      totalIssues += issues.length;

      // Process each issue in the year
      for (const issue of issues) {
        // Check if issue is already cached
        const { data: issueCache } = await supabase
          .from('issue_cache')
          .select('articles')
          .eq('scraper_key', scraperKey)
          .eq('issue_id', issue.id)
          .single();

        if (issueCache?.articles) {
          const articleCount = (issueCache.articles as unknown[]).length;
          totalArticles += articleCount;
          log(`    Issue ${issue.id} (Vol.${issue.volume} No.${issue.issue}): ${articleCount} articles (from cache)`);
        } else {
          // Fetch articles from website
          const articles = await scraper.collectIssue(issue.id, {
            extractText: false,
            onProgress: () => {},
          });

          // Fill in issue info
          for (const article of articles) {
            if (!article.year) article.year = issue.year;
            if (!article.volume) article.volume = issue.volume;
            if (!article.issue) article.issue = issue.issue;
          }

          // Cache the articles
          const articlesToCache = articles.map(a => ({
            id: a.id,
            title: a.title,
            authors: a.authors,
            year: a.year,
            volume: a.volume,
            issue: a.issue,
            url: a.url,
            pdfUrl: a.pdfUrl,
          }));

          await supabase
            .from('issue_cache')
            .upsert({
              scraper_key: scraperKey,
              issue_id: issue.id,
              journal_name: scraper.name,
              issue_info: { year: issue.year, volume: issue.volume, issue: issue.issue },
              articles: articlesToCache,
              cached_at: new Date().toISOString(),
            }, {
              onConflict: 'scraper_key,issue_id',
            });

          totalArticles += articles.length;
          cachedIssues++;
          log(`    Issue ${issue.id} (Vol.${issue.volume} No.${issue.issue}): ${articles.length} articles (fetched)`);

          // Small delay to be nice to the server
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    }

    log(`Done! ${totalIssues} issues, ${totalArticles} articles total`);
    log(`Newly cached: ${cachedYears} years, ${cachedIssues} issues`);

    return NextResponse.json({
      success: true,
      scraper: scraperKey,
      startYear,
      endYear,
      totalIssues,
      totalArticles,
      newlyCached: {
        years: cachedYears,
        issues: cachedIssues,
      },
      logs,
    });

  } catch (error) {
    console.error('Bulk scrape error:', error);
    return NextResponse.json({
      error: 'Bulk scrape failed',
      details: error instanceof Error ? error.message : 'Unknown',
      logs,
    }, { status: 500 });
  }
}
