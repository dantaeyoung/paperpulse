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

  // Check if this is a global source or user's own source
  const { data: existingSource } = await supabase
    .from('sources')
    .select('id, is_global, user_id')
    .eq('id', id)
    .single();

  if (!existingSource) {
    return NextResponse.json({ error: 'Source not found' }, { status: 404 });
  }

  // For global sources, users can only toggle is_active (stored per-user in a separate mechanism)
  // For now, we only allow editing user's own sources
  if (existingSource.is_global) {
    return NextResponse.json({ error: 'Cannot modify global sources' }, { status: 403 });
  }

  if (existingSource.user_id !== user.id) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  const updates: Record<string, unknown> = {};
  if ('is_active' in body) updates.is_active = Boolean(body.is_active);
  if ('name' in body) updates.name = body.name;
  if ('url' in body) updates.url = body.url;

  const { data: source, error } = await supabase
    .from('sources')
    .update(updates)
    .eq('id', id)
    .select('id, type, name, url, is_active')
    .single();

  if (error) {
    return NextResponse.json({ error: 'Failed to update source' }, { status: 500 });
  }

  return NextResponse.json({ source });
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

  // Only allow deleting user's own sources, not global ones
  const { error } = await supabase
    .from('sources')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('is_global', false);

  if (error) {
    return NextResponse.json({ error: 'Failed to delete source' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
