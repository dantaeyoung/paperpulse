import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';

// Get scraped papers with filtering and stats
export async function GET(request: NextRequest) {
  const sourceId = request.nextUrl.searchParams.get('source_id');
  const volume = request.nextUrl.searchParams.get('volume');
  const issue = request.nextUrl.searchParams.get('issue');
  const paperId = request.nextUrl.searchParams.get('paper_id');
  const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50', 10);

  const supabase = createServerClient();

  try {
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

    // Get all sources with paper counts
    const { data: sources } = await supabase
      .from('sources')
      .select('id, name, type, url, config')
      .eq('is_active', true)
      .order('name');

    // Get paper counts per source
    const sourcesWithCounts = await Promise.all(
      (sources || []).map(async (source) => {
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

      // Return papers with text length instead of full text
      papers = (paperData || []).map(p => ({
        ...p,
        hasFullText: !!p.full_text,
        fullTextLength: p.full_text?.length || 0,
        fullTextPreview: p.full_text?.substring(0, 300) || null,
        full_text: undefined, // Don't send full text in list view
      }));
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
