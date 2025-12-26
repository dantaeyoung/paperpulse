import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { getAllScraperKeys, getScraper } from '@/lib/scrapers/journal-base';
import '@/lib/scrapers/counselors';

export async function GET() {
  const supabase = createServerClient();
  const scraperKeys = getAllScraperKeys();

  const journals = await Promise.all(
    scraperKeys.map(async (key) => {
      const scraper = getScraper(key);
      if (!scraper) return null;

      // Get all cached issues for this scraper
      const { data: cachedIssues } = await supabase
        .from('issue_cache')
        .select('issue_id, journal_name, issue_info, articles, cached_at')
        .eq('scraper_key', key)
        .order('cached_at', { ascending: false });

      // Get issue summaries to check which have AI summaries
      const { data: summaries } = await supabase
        .from('issue_summaries')
        .select('issue_id')
        .eq('scraper_key', key)
        .is('user_id', null);

      const summaryIssueIds = new Set(summaries?.map(s => s.issue_id) || []);

      const issues = (cachedIssues || []).map(issue => ({
        issue_id: issue.issue_id,
        journal_name: issue.journal_name || scraper.name,
        issue_info: issue.issue_info as { year?: string; volume?: string; issue?: string },
        article_count: Array.isArray(issue.articles) ? issue.articles.length : 0,
        has_summary: summaryIssueIds.has(issue.issue_id),
        cached_at: issue.cached_at,
      }));

      // Sort by year desc, volume desc, issue desc (newest first)
      issues.sort((a, b) => {
        const yearA = parseInt(a.issue_info.year || '0', 10);
        const yearB = parseInt(b.issue_info.year || '0', 10);
        if (yearB !== yearA) return yearB - yearA;

        const volA = parseInt(a.issue_info.volume || '0', 10);
        const volB = parseInt(b.issue_info.volume || '0', 10);
        if (volB !== volA) return volB - volA;

        const issueA = parseInt(a.issue_info.issue || '0', 10);
        const issueB = parseInt(b.issue_info.issue || '0', 10);
        return issueB - issueA;
      });

      return {
        scraperKey: key,
        name: scraper.name,
        issues,
      };
    })
  );

  return NextResponse.json({
    journals: journals.filter(Boolean),
  });
}
