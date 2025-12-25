import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';

export async function GET() {
  const supabase = createServerClient();

  // Get papers grouped by journal
  const { data: papers } = await supabase
    .from('papers')
    .select('title, journal_name, source_id')
    .order('collected_at', { ascending: false })
    .limit(20);

  // Get sources
  const { data: sources } = await supabase
    .from('sources')
    .select('id, name, is_global, is_active');

  // Count by journal
  const { data: allPapers } = await supabase
    .from('papers')
    .select('journal_name');

  const byJournal: Record<string, number> = {};
  allPapers?.forEach(p => {
    byJournal[p.journal_name || 'unknown'] = (byJournal[p.journal_name || 'unknown'] || 0) + 1;
  });

  // Search for family therapy keywords in existing papers
  const { data: familyTherapyPapers } = await supabase
    .from('papers')
    .select('title, journal_name')
    .or('title.ilike.%가족치료%,title.ilike.%상담%,abstract.ilike.%가족치료%')
    .limit(10);

  // Search for immigration-related papers
  const { data: immigrationPapers } = await supabase
    .from('papers')
    .select('title, journal_name')
    .or('title.ilike.%이민%,title.ilike.%교포%,title.ilike.%이주%,title.ilike.%미국%,abstract.ilike.%이민%,abstract.ilike.%교포%')
    .limit(10);

  return NextResponse.json({
    totalPapers: allPapers?.length || 0,
    papersByJournal: byJournal,
    sources: sources?.map(s => ({ name: s.name, active: s.is_active, global: s.is_global })),
    recentPapers: papers?.map(p => ({
      journal: p.journal_name,
      title: p.title?.substring(0, 60) + '...'
    })),
    familyTherapyPapers: familyTherapyPapers?.map(p => ({
      journal: p.journal_name,
      title: p.title?.substring(0, 60) + '...'
    })),
    immigrationPapers: immigrationPapers?.map(p => ({
      journal: p.journal_name,
      title: p.title?.substring(0, 60) + '...'
    })),
  });
}
