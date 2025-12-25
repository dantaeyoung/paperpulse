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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; id: string }> }
) {
  const { token, id } = await params;
  const supabase = createServerClient();
  const body = await request.json();

  const user = await getUserByToken(supabase, token);
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};
  if ('is_active' in body) {
    updates.is_active = Boolean(body.is_active);
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const { data: keyword, error } = await supabase
    .from('keywords')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id, keyword, is_active')
    .single();

  if (error) {
    return NextResponse.json({ error: 'Failed to update keyword' }, { status: 500 });
  }

  return NextResponse.json({ keyword });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; id: string }> }
) {
  const { token, id } = await params;
  const supabase = createServerClient();

  const user = await getUserByToken(supabase, token);
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const { error } = await supabase
    .from('keywords')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({ error: 'Failed to delete keyword' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
