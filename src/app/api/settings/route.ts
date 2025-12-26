import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';

// GET: Retrieve settings
export async function GET() {
  const supabase = createServerClient();

  try {
    const { data: settings } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['extraction_prompt', 'synthesis_prompt']);

    const settingsMap: Record<string, string> = {};
    for (const setting of settings || []) {
      settingsMap[setting.key] = setting.value;
    }

    return NextResponse.json({ settings: settingsMap });
  } catch (error) {
    console.error('Get settings error:', error);
    return NextResponse.json({ settings: {} });
  }
}

// POST: Update settings
export async function POST(request: NextRequest) {
  const supabase = createServerClient();

  console.log('=== SETTINGS SAVE CALLED ===');

  try {
    const body = await request.json();
    const { extraction_prompt, synthesis_prompt } = body;

    console.log('Saving extraction_prompt:', extraction_prompt ? `${extraction_prompt.length} chars` : 'undefined');
    console.log('Saving synthesis_prompt:', synthesis_prompt ? `${synthesis_prompt.length} chars` : 'undefined');

    // Upsert each setting
    const results = [];

    if (extraction_prompt !== undefined) {
      const result = await supabase
        .from('app_settings')
        .upsert({ key: 'extraction_prompt', value: extraction_prompt }, { onConflict: 'key' });
      console.log('Extraction prompt save result:', result.error ? result.error : 'OK');
      if (result.error) {
        return NextResponse.json({ error: result.error.message }, { status: 500 });
      }
      results.push(result);
    }

    if (synthesis_prompt !== undefined) {
      const result = await supabase
        .from('app_settings')
        .upsert({ key: 'synthesis_prompt', value: synthesis_prompt }, { onConflict: 'key' });
      console.log('Synthesis prompt save result:', result.error ? result.error : 'OK');
      if (result.error) {
        return NextResponse.json({ error: result.error.message }, { status: 500 });
      }
      results.push(result);
    }

    console.log('Settings saved successfully');
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Save settings error:', error);
    return NextResponse.json({
      error: 'Failed to save settings',
      details: error instanceof Error ? error.message : 'Unknown',
    }, { status: 500 });
  }
}
