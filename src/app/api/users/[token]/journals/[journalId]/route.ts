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

// Add journal to user's selections
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; journalId: string }> }
) {
  const { token, journalId } = await params;
  const supabase = createServerClient();

  const user = await getUserByToken(supabase, token);
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  // Verify the journal exists and user has access (global or their own custom)
  const { data: journal } = await supabase
    .from('sources')
    .select('id, is_global, user_id')
    .eq('id', journalId)
    .eq('is_active', true)
    .single();

  if (!journal) {
    return NextResponse.json({ error: 'Journal not found' }, { status: 404 });
  }

  // Check access: must be global or owned by user
  if (!journal.is_global && journal.user_id !== user.id) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  // Add to user_journals (upsert to handle duplicates)
  const { error } = await supabase
    .from('user_journals')
    .upsert({
      user_id: user.id,
      source_id: journalId,
    }, {
      onConflict: 'user_id,source_id',
    });

  if (error) {
    return NextResponse.json({ error: 'Failed to add journal' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// Remove journal from user's selections OR delete custom journal
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; journalId: string }> }
) {
  const { token, journalId } = await params;
  const supabase = createServerClient();

  const user = await getUserByToken(supabase, token);
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  // Check if this is a delete journal request (vs just unselect)
  const deleteJournal = request.headers.get('X-Delete-Journal') === 'true';

  if (deleteJournal) {
    // Delete custom journal - verify ownership first
    const { data: journal } = await supabase
      .from('sources')
      .select('id, user_id, is_global')
      .eq('id', journalId)
      .single();

    if (!journal) {
      return NextResponse.json({ error: 'Journal not found' }, { status: 404 });
    }

    // Can only delete custom journals (user-owned, not global)
    if (journal.is_global || journal.user_id !== user.id) {
      return NextResponse.json({ error: 'Cannot delete this journal' }, { status: 403 });
    }

    // Delete the journal (cascade will remove user_journals entries)
    const { error } = await supabase
      .from('sources')
      .delete()
      .eq('id', journalId)
      .eq('user_id', user.id);

    if (error) {
      return NextResponse.json({ error: 'Failed to delete journal' }, { status: 500 });
    }

    return NextResponse.json({ success: true, deleted: true });
  }

  // Just unselect the journal
  const { error } = await supabase
    .from('user_journals')
    .delete()
    .eq('user_id', user.id)
    .eq('source_id', journalId);

  if (error) {
    return NextResponse.json({ error: 'Failed to remove journal' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
