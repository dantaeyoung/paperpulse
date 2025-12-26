import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';

// Helper to clean text of HTML entities
function cleanText(text: string): string {
  return text
    .replace(/&#8228;/g, ' ')
    .replace(/&#\d+;/g, ' ')
    .replace(/\u2024/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Clean up author names and titles in cached data (fix &#8228; and similar entities)
export async function POST() {
  const supabase = createServerClient();

  try {
    // Get all cached issues
    const { data: issues, error: fetchError } = await supabase
      .from('issue_cache')
      .select('id, articles');

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    let updatedCount = 0;
    let titlesFixed = 0;
    let authorsFixed = 0;

    for (const issue of issues || []) {
      const articles = issue.articles as Array<{
        id: string;
        title: string;
        authors: string[];
        [key: string]: unknown;
      }>;

      if (!articles || !Array.isArray(articles)) continue;

      let issueModified = false;

      for (const article of articles) {
        // Clean title
        if (article.title) {
          const cleanedTitle = cleanText(article.title);
          if (cleanedTitle !== article.title) {
            article.title = cleanedTitle;
            titlesFixed++;
            issueModified = true;
          }
        }

        // Clean authors
        if (article.authors && Array.isArray(article.authors)) {
          const cleanedAuthors = article.authors.map(author => {
            const cleaned = cleanText(author);
            if (cleaned !== author) {
              authorsFixed++;
              issueModified = true;
            }
            return cleaned;
          });
          article.authors = cleanedAuthors;
        }
      }

      if (issueModified) {
        await supabase
          .from('issue_cache')
          .update({ articles })
          .eq('id', issue.id);

        updatedCount++;
      }
    }

    return NextResponse.json({
      success: true,
      issuesUpdated: updatedCount,
      titlesFixed,
      authorsFixed,
    });

  } catch (error) {
    console.error('Cleanup error:', error);
    return NextResponse.json({
      error: 'Cleanup failed',
      details: error instanceof Error ? error.message : 'Unknown',
    }, { status: 500 });
  }
}
