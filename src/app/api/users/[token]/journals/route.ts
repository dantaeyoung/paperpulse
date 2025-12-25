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

  // Get all active global journals
  const { data: globalSources, error: globalError } = await supabase
    .from('sources')
    .select('id, name, description')
    .eq('is_active', true)
    .eq('is_global', true)
    .order('name');

  if (globalError) {
    return NextResponse.json({ error: 'Failed to fetch journals' }, { status: 500 });
  }

  // Get user's custom journals (user_id is set)
  const { data: customSources, error: customError } = await supabase
    .from('sources')
    .select('id, name, description')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('name');

  if (customError) {
    return NextResponse.json({ error: 'Failed to fetch custom journals' }, { status: 500 });
  }

  // Get user's selected journals
  const { data: userJournals } = await supabase
    .from('user_journals')
    .select('source_id')
    .eq('user_id', user.id);

  const selectedIds = new Set(userJournals?.map(uj => uj.source_id) || []);

  // Combine the data
  const globalJournals = globalSources?.map(source => ({
    id: source.id,
    name: source.name,
    description: source.description,
    is_selected: selectedIds.has(source.id),
    is_custom: false,
  })) || [];

  const customJournals = customSources?.map(source => ({
    id: source.id,
    name: source.name,
    description: source.description,
    is_selected: selectedIds.has(source.id),
    is_custom: true,
  })) || [];

  return NextResponse.json({ journals: [...globalJournals, ...customJournals] });
}

// Add a new custom journal
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const supabase = createServerClient();
  const body = await request.json();

  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'Journal name is required' }, { status: 400 });
  }

  const user = await getUserByToken(supabase, token);
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  // Create the custom journal
  const { data: source, error: sourceError } = await supabase
    .from('sources')
    .insert({
      user_id: user.id,
      type: 'journal',
      name: body.name.trim(),
      description: body.description?.trim() || null,
      is_active: true,
      is_global: false,
    })
    .select('id, name, description')
    .single();

  if (sourceError) {
    return NextResponse.json({ error: 'Failed to create journal' }, { status: 500 });
  }

  // Auto-select the new journal for the user
  await supabase
    .from('user_journals')
    .insert({
      user_id: user.id,
      source_id: source.id,
    });

  return NextResponse.json({
    journal: {
      id: source.id,
      name: source.name,
      description: source.description,
      is_selected: true,
      is_custom: true,
    }
  }, { status: 201 });
}
