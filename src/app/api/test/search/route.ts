import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { getKCIWebScraper } from '@/lib/scrapers/kci-web';

// Search KCI within user's selected journals by keywords and save results
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  const keywordParam = request.nextUrl.searchParams.get('keyword');

  if (!token) {
    return NextResponse.json({ error: 'Token required' }, { status: 400 });
  }

  const supabase = createServerClient();
  const kciScraper = getKCIWebScraper();

  try {
    // Get user
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('token', token)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get user's selected journals
    const { data: userJournals } = await supabase
      .from('user_journals')
      .select('source_id, sources(id, name)')
      .eq('user_id', user.id);

    const selectedJournals = userJournals?.map(uj => {
      // sources is a single object from the join, but TypeScript types it as array
      const source = uj.sources as unknown as { id: string; name: string } | null;
      return {
        id: uj.source_id,
        name: source?.name || '',
      };
    }).filter(j => j.name) || [];

    if (selectedJournals.length === 0) {
      return NextResponse.json({
        error: 'No journals selected',
        note: 'Please select journals in your dashboard first',
      });
    }

    // Get keywords to search (either from param or user's keywords)
    let searchKeywords: string[] = [];

    if (keywordParam) {
      searchKeywords = [keywordParam];
    } else {
      const { data: keywords } = await supabase
        .from('keywords')
        .select('keyword')
        .eq('user_id', user.id)
        .eq('is_active', true);

      searchKeywords = keywords?.map(k => k.keyword) || [];
    }

    if (searchKeywords.length === 0) {
      return NextResponse.json({
        error: 'No keywords to search',
        note: 'Add keywords or use ?keyword=검색어',
      });
    }

    const results: {
      keyword: string;
      journal: string;
      found: number;
      matched: number;
      saved: number;
      papers: { title: string; journal: string; url: string }[];
    }[] = [];

    // Search KCI for each keyword within each selected journal
    for (const keyword of searchKeywords) {
      for (const journal of selectedJournals) {
        // Search with journal name and keyword combined
        const searchQuery = `${journal.name} ${keyword}`;
        console.log(`Searching KCI for: "${searchQuery}"`);

        try {
          const searchResult = await kciScraper.search({
            keyword: searchQuery,
            pageSize: 20,
          });

          // Filter to papers that:
          // 1. Actually come from this journal (case-insensitive partial match)
          // 2. Contain the keyword in title
          const journalNameLower = journal.name.toLowerCase();
          const keywordLower = keyword.toLowerCase();

          const matchingPapers = searchResult.papers.filter(paper => {
            const paperJournalLower = (paper.journal || '').toLowerCase();
            const titleLower = paper.title.toLowerCase();

            // Check if paper is from this journal
            const isFromJournal = paperJournalLower.includes(journalNameLower) ||
                                  journalNameLower.includes(paperJournalLower);

            // Check if keyword is in title
            const hasKeywordInTitle = titleLower.includes(keywordLower);

            return isFromJournal && hasKeywordInTitle;
          });

          const keywordResult = {
            keyword,
            journal: journal.name,
            found: searchResult.papers.length,
            matched: matchingPapers.length,
            saved: 0,
            papers: [] as { title: string; journal: string; url: string }[],
          };

          // Save matching papers with the correct source_id
          for (const paper of matchingPapers) {
            try {
              const { error: insertError } = await supabase
                .from('papers')
                .upsert({
                  source_id: journal.id,
                  external_id: paper.articleId,
                  title: paper.title,
                  authors: paper.authors,
                  url: paper.url,
                  journal_name: paper.journal || journal.name,
                  published_at: paper.publishedAt ?
                    (paper.publishedAt.includes('.')
                      ? `${paper.publishedAt.split('.')[0]}-${paper.publishedAt.split('.')[1]?.padStart(2, '0') || '01'}-01`
                      : paper.publishedAt)
                    : null,
                }, {
                  onConflict: 'source_id,external_id',
                });

              if (!insertError) {
                keywordResult.saved++;
                keywordResult.papers.push({
                  title: paper.title,
                  journal: paper.journal || journal.name,
                  url: paper.url,
                });
              }
            } catch (err) {
              console.error('Error saving paper:', err);
            }
          }

          // Only add result if there were any matches
          if (matchingPapers.length > 0 || searchResult.papers.length > 0) {
            results.push(keywordResult);
          }
        } catch (err) {
          console.error(`Search error for "${searchQuery}":`, err);
          results.push({
            keyword,
            journal: journal.name,
            found: 0,
            matched: 0,
            saved: 0,
            papers: [],
          });
        }
      }
    }

    const totalFound = results.reduce((sum, r) => sum + r.found, 0);
    const totalMatched = results.reduce((sum, r) => sum + r.matched, 0);
    const totalSaved = results.reduce((sum, r) => sum + r.saved, 0);

    return NextResponse.json({
      message: 'Journal-specific keyword search completed',
      searchedKeywords: searchKeywords,
      selectedJournals: selectedJournals.map(j => j.name),
      totalFound,
      totalMatched,
      totalSaved,
      results,
    });

  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json({
      error: 'Search failed',
      details: error instanceof Error ? error.message : 'Unknown',
    }, { status: 500 });
  }
}
