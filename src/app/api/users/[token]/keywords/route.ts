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

  const { data: keywords, error } = await supabase
    .from('keywords')
    .select('id, keyword, is_active, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch keywords' }, { status: 500 });
  }

  return NextResponse.json({ keywords });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const supabase = createServerClient();
  const body = await request.json();

  if (!body.keyword || typeof body.keyword !== 'string') {
    return NextResponse.json({ error: 'Keyword is required' }, { status: 400 });
  }

  const keyword = body.keyword.trim();
  if (keyword.length === 0 || keyword.length > 100) {
    return NextResponse.json({ error: 'Keyword must be 1-100 characters' }, { status: 400 });
  }

  const user = await getUserByToken(supabase, token);
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const { data: newKeyword, error } = await supabase
    .from('keywords')
    .insert({
      user_id: user.id,
      keyword,
      is_active: true,
    })
    .select('id, keyword, is_active, created_at')
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Keyword already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to create keyword' }, { status: 500 });
  }

  return NextResponse.json({ keyword: newKeyword }, { status: 201 });
}
