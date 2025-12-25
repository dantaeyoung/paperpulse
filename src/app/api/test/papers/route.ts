import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { getAllScraperKeys } from '@/lib/scrapers/journal-base';
import { existsSync } from 'fs';
import path from 'path';
import '@/lib/scrapers/counselors';

// Get scraped papers with filtering and stats
export async function GET(request: NextRequest) {
  const setup = request.nextUrl.searchParams.get('setup');
  const sourceId = request.nextUrl.searchParams.get('source_id');
  const volume = request.nextUrl.searchParams.get('volume');
  const issue = request.nextUrl.searchParams.get('issue');
  const paperId = request.nextUrl.searchParams.get('paper_id');
  const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50', 10);

  const supabase = createServerClient();

  try {
    // Setup: Create source for a scraper if it doesn't exist
    if (setup === 'counselors') {
      // Check if source already exists
      const { data: existing } = await supabase
        .from('sources')
        .select('id')
        .eq('name', '한국상담학회지')
        .single();

      if (existing) {
        // Update config to include scraper
        await supabase
          .from('sources')
          .update({ config: { scraper: 'counselors' } })
          .eq('id', existing.id);

        return NextResponse.json({
          message: 'Source updated with scraper config',
          sourceId: existing.id
        });
      }

      // Create new source
      const { data: newSource, error } = await supabase
        .from('sources')
        .insert({
          name: '한국상담학회지',
          type: 'journal',
          url: 'https://counselors.or.kr',
          is_active: true,
          is_global: true,
          config: { scraper: 'counselors' },
        })
        .select('id')
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        message: 'Source created',
        sourceId: newSource?.id
      });
    }

    // If requesting a specific paper, return full details
    if (paperId) {
      const { data: paper, error } = await supabase
        .from('papers')
        .select('*, sources(name)')
        .eq('id', paperId)
        .single();

      if (error || !paper) {
        return NextResponse.json({ error: 'Paper not found' }, { status: 404 });
      }

      return NextResponse.json({ paper });
    }

    // Get only sources with direct scrapers configured
    const { data: sources } = await supabase
      .from('sources')
      .select('id, name, type, url, config')
      .eq('is_active', true)
      .not('config', 'is', null)
      .order('name');

    // Filter to only sources that have a scraper key in config
    const sourcesWithScrapers = (sources || []).filter(s => {
      const config = s.config as { scraper?: string } | null;
      return config?.scraper;
    });

    // Get paper counts per source
    const sourcesWithCounts = await Promise.all(
      sourcesWithScrapers.map(async (source) => {
        const { count: totalCount } = await supabase
          .from('papers')
          .select('*', { count: 'exact', head: true })
          .eq('source_id', source.id);

        const { count: withTextCount } = await supabase
          .from('papers')
          .select('*', { count: 'exact', head: true })
          .eq('source_id', source.id)
          .not('full_text', 'is', null);

        return {
          ...source,
          totalPapers: totalCount || 0,
          withFullText: withTextCount || 0,
        };
      })
    );

    // If a source is selected, get its papers
    let papers: unknown[] = [];
    let volumes: { volume: string; issue: string; count: number }[] = [];

    if (sourceId) {
      // Get volume/issue breakdown
      const { data: volumeData } = await supabase
        .from('papers')
        .select('volume, issue')
        .eq('source_id', sourceId)
        .not('volume', 'is', null);

      // Count papers per volume/issue
      const volumeCounts = new Map<string, number>();
      for (const p of volumeData || []) {
        const key = `${p.volume}|${p.issue}`;
        volumeCounts.set(key, (volumeCounts.get(key) || 0) + 1);
      }
      volumes = Array.from(volumeCounts.entries())
        .map(([key, count]) => {
          const [vol, iss] = key.split('|');
          return { volume: vol, issue: iss, count };
        })
        .sort((a, b) => {
          const volDiff = parseInt(b.volume || '0') - parseInt(a.volume || '0');
          if (volDiff !== 0) return volDiff;
          return parseInt(b.issue || '0') - parseInt(a.issue || '0');
        });

      // Build papers query
      let query = supabase
        .from('papers')
        .select('id, external_id, title, authors, volume, issue, published_at, full_text, collected_at')
        .eq('source_id', sourceId)
        .order('collected_at', { ascending: false })
        .limit(limit);

      if (volume) {
        query = query.eq('volume', volume);
      }
      if (issue) {
        query = query.eq('issue', issue);
      }

      const { data: paperData } = await query;

      // Get scraper key for this source to find PDF files
      const selectedSource = sourcesWithScrapers.find(s => s.id === sourceId);
      const scraperKey = (selectedSource?.config as { scraper?: string } | null)?.scraper;

      // Return papers with text length instead of full text
      papers = (paperData || []).map(p => {
        // Check if PDF exists locally
        let localPdfUrl: string | null = null;
        if (scraperKey && p.external_id) {
          const pdfPath = path.join(process.cwd(), 'public', 'pdfs', scraperKey, `${p.external_id}.pdf`);
          if (existsSync(pdfPath)) {
            localPdfUrl = `/pdfs/${scraperKey}/${p.external_id}.pdf`;
          }
        }

        return {
          ...p,
          hasFullText: !!p.full_text,
          fullTextLength: p.full_text?.length || 0,
          fullTextPreview: p.full_text?.substring(0, 300) || null,
          full_text: undefined, // Don't send full text in list view
          localPdfUrl,
        };
      });
    }

    return NextResponse.json({
      sources: sourcesWithCounts,
      volumes: sourceId ? volumes : [],
      papers,
    });

  } catch (error) {
    console.error('Papers API error:', error);
    return NextResponse.json({
      error: 'Failed to fetch papers',
      details: error instanceof Error ? error.message : 'Unknown',
    }, { status: 500 });
  }
}
