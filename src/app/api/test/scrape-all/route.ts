import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { getScraper } from '@/lib/scrapers/journal-base';
import '@/lib/scrapers/counselors';

const JOB_ID = 'bulk-scrape';

// Helper to update status
async function updateStatus(
  supabase: ReturnType<typeof createServerClient>,
  status: string,
  progress: string,
  result?: object
) {
  await supabase
    .from('scrape_status')
    .upsert({
      id: JOB_ID,
      status,
      progress,
      ...(status === 'running' ? { started_at: new Date().toISOString() } : {}),
      ...(status === 'completed' || status === 'error' ? { completed_at: new Date().toISOString() } : {}),
      ...(result ? { result } : {}),
    }, { onConflict: 'id' });
}

// GET: Check status or start scraping
export async function GET(request: NextRequest) {
  const scraperKey = request.nextUrl.searchParams.get('scraper') || 'counselors';
  const statusOnly = request.nextUrl.searchParams.get('status') === 'true';
  const startYear = parseInt(request.nextUrl.searchParams.get('start') || '2000', 10);
  const endYear = parseInt(request.nextUrl.searchParams.get('end') || String(new Date().getFullYear()), 10);

  const supabase = createServerClient();

  // If just checking status, return current status
  if (statusOnly) {
    const { data: status } = await supabase
      .from('scrape_status')
      .select('*')
      .eq('id', JOB_ID)
      .single();

    return NextResponse.json({
      status: status?.status || 'idle',
      progress: status?.progress || '',
      startedAt: status?.started_at,
      completedAt: status?.completed_at,
      result: status?.result,
    });
  }

  // Check if already running
  const { data: currentStatus } = await supabase
    .from('scrape_status')
    .select('status')
    .eq('id', JOB_ID)
    .single();

  if (currentStatus?.status === 'running') {
    return NextResponse.json({
      error: 'Scrape already in progress',
      status: 'running',
    }, { status: 409 });
  }

  const scraper = getScraper(scraperKey);
  if (!scraper) {
    return NextResponse.json({ error: `Scraper '${scraperKey}' not found` }, { status: 404 });
  }

  try {
    await updateStatus(supabase, 'running', `Starting bulk scrape for ${scraperKey}...`);

    let totalIssues = 0;
    let totalArticles = 0;
    let cachedYears = 0;
    let cachedIssues = 0;

    // Process each year
    for (let year = endYear; year >= startYear; year--) {
      await updateStatus(supabase, 'running', `Processing year ${year}...`);

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
      } else {
        // Fetch from website
        issues = await scraper.getIssues(year, year);

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
      for (let i = 0; i < issues.length; i++) {
        const issue = issues[i];
        await updateStatus(
          supabase,
          'running',
          `Year ${year}: Issue ${i + 1}/${issues.length} (Vol.${issue.volume} No.${issue.issue})`
        );

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
            paperNumber: a.paperNumber,
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

          // Small delay to be nice to the server
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    }

    const result = {
      scraper: scraperKey,
      startYear,
      endYear,
      totalIssues,
      totalArticles,
      newlyCached: { years: cachedYears, issues: cachedIssues },
    };

    await updateStatus(
      supabase,
      'completed',
      `Done! ${totalIssues} issues, ${totalArticles} articles`,
      result
    );

    return NextResponse.json({ success: true, ...result });

  } catch (error) {
    console.error('Bulk scrape error:', error);
    await updateStatus(
      supabase,
      'error',
      `Error: ${error instanceof Error ? error.message : 'Unknown'}`
    );
    return NextResponse.json({
      error: 'Bulk scrape failed',
      details: error instanceof Error ? error.message : 'Unknown',
    }, { status: 500 });
  }
}
