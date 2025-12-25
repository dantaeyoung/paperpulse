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
  const url = new URL(request.url);

  const limit = parseInt(url.searchParams.get('limit') || '20');
  const offset = parseInt(url.searchParams.get('offset') || '0');

  const user = await getUserByToken(supabase, token);
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  // Get summaries with paper info
  const { data: summaries, error, count } = await supabase
    .from('summaries')
    .select(`
      id,
      content,
      created_at,
      paper:papers(
        id,
        title,
        url,
        journal_name,
        published_at,
        authors
      )
    `, { count: 'exact' })
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch summaries' }, { status: 500 });
  }

  return NextResponse.json({
    summaries: summaries || [],
    total: count || 0,
    has_more: (count || 0) > offset + limit,
  });
}
