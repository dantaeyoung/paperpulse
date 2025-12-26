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

      // Get latest cached issue
      const { data: latestIssue } = await supabase
        .from('issue_cache')
        .select('issue_id, issue_info')
        .eq('scraper_key', key)
        .order('cached_at', { ascending: false })
        .limit(1)
        .single();

      // Get paper count for this journal
      const { data: source } = await supabase
        .from('sources')
        .select('id')
        .eq('name', scraper.name)
        .single();

      let paperCount = 0;
      if (source) {
        const { count } = await supabase
          .from('papers')
          .select('*', { count: 'exact', head: true })
          .eq('source_id', source.id);
        paperCount = count || 0;
      }

      const issueInfo = latestIssue?.issue_info as { volume?: string; issue?: string; year?: string } | null;

      return {
        scraperKey: key,
        name: scraper.name,
        latestIssue: latestIssue ? {
          id: latestIssue.issue_id,
          volume: issueInfo?.volume || '',
          issue: issueInfo?.issue || '',
          year: issueInfo?.year || '',
        } : undefined,
        paperCount,
      };
    })
  );

  return NextResponse.json({
    journals: journals.filter(Boolean),
  });
}
