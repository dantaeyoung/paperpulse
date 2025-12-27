import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { getScraper } from '@/lib/scrapers/journal-base';
import '@/lib/scrapers/counselors';
import '@/lib/scrapers/familytherapy';

// Quick check for new issues only (doesn't re-fetch everything)
export async function GET(request: NextRequest) {
  const scraperKey = request.nextUrl.searchParams.get('scraper') || 'counselors';

  const scraper = getScraper(scraperKey);
  if (!scraper) {
    return NextResponse.json({ error: `Scraper '${scraperKey}' not found` }, { status: 404 });
  }

  const supabase = createServerClient();

  try {
    // Get all cached issue IDs for this scraper and find the highest numerically
    const { data: cachedIssues } = await supabase
      .from('issue_cache')
      .select('issue_id')
      .eq('scraper_key', scraperKey);

    // Find the highest issue ID numerically (not string sort!)
    let highestCachedId = 0;
    if (cachedIssues && cachedIssues.length > 0) {
      for (const issue of cachedIssues) {
        const id = parseInt(issue.issue_id, 10);
        if (!isNaN(id) && id > highestCachedId) {
          highestCachedId = id;
        }
      }
    }

    console.log(`[check-new] Highest cached issue ID: ${highestCachedId} (from ${cachedIssues?.length || 0} cached issues)`);

    // Get current year's issues from the website
    const currentYear = new Date().getFullYear();
    const issues = await scraper.getIssues(currentYear, currentYear);

    console.log(`[check-new] Found ${issues.length} issues for ${currentYear}`);

    // Find issues with IDs higher than our cached max
    const newIssues = issues.filter(issue => {
      const issueId = parseInt(issue.id, 10);
      return issueId > highestCachedId;
    });

    console.log(`[check-new] ${newIssues.length} new issues found`);

    if (newIssues.length === 0) {
      return NextResponse.json({
        success: true,
        newIssuesCount: 0,
        newArticlesCount: 0,
        message: 'No new issues found',
      });
    }

    // Fetch and cache the new issues
    let totalNewArticles = 0;

    for (const issue of newIssues) {
      console.log(`[check-new] Fetching new issue ${issue.id} (${issue.year} Vol.${issue.volume} No.${issue.issue})`);

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

      totalNewArticles += articles.length;
      console.log(`[check-new] Cached ${articles.length} articles from issue ${issue.id}`);
    }

    // Also update year cache
    const { data: yearCache } = await supabase
      .from('year_issues_cache')
      .select('issues')
      .eq('scraper_key', scraperKey)
      .eq('year', currentYear)
      .single();

    // Merge new issues into year cache
    const existingIssues = (yearCache?.issues || []) as { id: string }[];
    const existingIds = new Set(existingIssues.map(i => i.id));
    const updatedIssues = [...existingIssues];

    for (const issue of newIssues) {
      if (!existingIds.has(issue.id)) {
        updatedIssues.push(issue);
      }
    }

    await supabase
      .from('year_issues_cache')
      .upsert({
        scraper_key: scraperKey,
        year: currentYear,
        journal_name: scraper.name,
        issues: updatedIssues,
        cached_at: new Date().toISOString(),
      }, {
        onConflict: 'scraper_key,year',
      });

    return NextResponse.json({
      success: true,
      newIssuesCount: newIssues.length,
      newArticlesCount: totalNewArticles,
      newIssues: newIssues.map(i => ({
        id: i.id,
        year: i.year,
        volume: i.volume,
        issue: i.issue,
      })),
    });

  } catch (error) {
    console.error('Check new issues error:', error);
    return NextResponse.json({
      error: 'Failed to check for new issues',
      details: error instanceof Error ? error.message : 'Unknown',
    }, { status: 500 });
  }
}
