import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const supabase = createServerClient();

  const { data: user, error } = await supabase
    .from('users')
    .select('id, email, name, field_context, digest_day, digest_hour, timezone, is_active')
    .eq('token', token)
    .single();

  if (error || !user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  return NextResponse.json({ user });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const supabase = createServerClient();
  const body = await request.json();

  // Only allow updating specific fields
  const allowedFields = ['name', 'field_context', 'digest_day', 'digest_hour', 'timezone'];
  const updates: Record<string, unknown> = {};

  for (const field of allowedFields) {
    if (field in body) {
      updates[field] = body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  updates.updated_at = new Date().toISOString();

  const { data: user, error } = await supabase
    .from('users')
    .update(updates)
    .eq('token', token)
    .select('id, email, name, field_context, digest_day, digest_hour, timezone')
    .single();

  if (error) {
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }

  return NextResponse.json({ user });
}
