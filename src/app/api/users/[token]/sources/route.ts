import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';

async function getUserByToken(supabase: ReturnType<typeof createServerClient>, token: string) {
  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('token', token)
    .single();
  return user;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const supabase = createServerClient();

  const user = await getUserByToken(supabase, token);
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  // Get global sources and user's custom sources
  const { data: sources, error } = await supabase
    .from('sources')
    .select('id, type, name, url, is_active, is_global, created_at')
    .or(`is_global.eq.true,user_id.eq.${user.id}`)
    .order('is_global', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch sources' }, { status: 500 });
  }

  return NextResponse.json({ sources });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const supabase = createServerClient();
  const body = await request.json();

  if (!body.name || !body.type) {
    return NextResponse.json({ error: 'Name and type are required' }, { status: 400 });
  }

  const validTypes = ['kci', 'riss', 'journal', 'custom'];
  if (!validTypes.includes(body.type)) {
    return NextResponse.json({ error: 'Invalid source type' }, { status: 400 });
  }

  const user = await getUserByToken(supabase, token);
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const { data: source, error } = await supabase
    .from('sources')
    .insert({
      user_id: user.id,
      type: body.type,
      name: body.name.trim(),
      url: body.url?.trim() || null,
      config: body.config || {},
      is_active: true,
      is_global: false,
    })
    .select('id, type, name, url, is_active, is_global')
    .single();

  if (error) {
    return NextResponse.json({ error: 'Failed to create source' }, { status: 500 });
  }

  return NextResponse.json({ source }, { status: 201 });
}
