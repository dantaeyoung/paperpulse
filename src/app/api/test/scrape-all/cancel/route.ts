import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';

const JOB_ID = 'bulk-scrape';

// POST: Cancel/reset the scrape status
export async function POST() {
  const supabase = createServerClient();

  try {
    await supabase
      .from('scrape_status')
      .upsert({
        id: JOB_ID,
        status: 'cancelled',
        progress: 'Cancelled by user',
        completed_at: new Date().toISOString(),
      }, { onConflict: 'id' });

    return NextResponse.json({ success: true, message: 'Scrape cancelled' });
  } catch (error) {
    return NextResponse.json({
      error: 'Failed to cancel',
      details: error instanceof Error ? error.message : 'Unknown',
    }, { status: 500 });
  }
}
