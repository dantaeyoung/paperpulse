import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';

// Parse issue info from the website's dropdown format
function parseIssueFromOptionText(text: string): { year: string; volume: string; issue: string } | null {
  const volMatch = text.match(/제(\d+)권/);
  const issueMatch = text.match(/제(\d+)호/);

  if (!volMatch || !issueMatch) return null;

  const volume = volMatch[1];
  const issue = issueMatch[1];
  // Year = 1999 + volume (Vol.1 = 2000, Vol.22 = 2021, etc.)
  const year = String(1999 + parseInt(volume, 10));

  return { year, volume, issue };
}

// Fix issue metadata in cached data by fetching correct mapping from website
export async function POST() {
  const supabase = createServerClient();

  try {
    // Fetch the catcode mapping from the website
    const res = await fetch('https://counselors.or.kr/KOR/journal/journal.php?ptype=list&catcode=1&lnb2=1', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });

    const buffer = await res.arrayBuffer();
    const decoder = new TextDecoder('euc-kr');
    const html = decoder.decode(buffer);

    // Parse all options: <option value="108">상담학 연구 제22권 제2호(통권 122호)</option>
    const catcodeMap = new Map<string, { year: string; volume: string; issue: string }>();
    const optionPattern = /<option[^>]*value="(\d+)"[^>]*>([^<]+)<\/option>/gi;
    let match;
    while ((match = optionPattern.exec(html)) !== null) {
      const catcode = match[1];
      const text = match[2];
      const parsed = parseIssueFromOptionText(text);
      if (parsed) {
        catcodeMap.set(catcode, parsed);
      }
    }

    console.log(`[fix-metadata] Parsed ${catcodeMap.size} catcode mappings from website`);

    // Get all cached issues
    const { data: issues, error: fetchError } = await supabase
      .from('issue_cache')
      .select('id, issue_id, issue_info, articles');

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    let fixedCount = 0;
    let articlesFixed = 0;

    for (const issue of issues || []) {
      const correctInfo = catcodeMap.get(issue.issue_id);
      if (!correctInfo) continue;

      const currentInfo = issue.issue_info as { year?: string; volume?: string; issue?: string } || {};

      // Check if correction is needed
      const needsFix =
        currentInfo.year !== correctInfo.year ||
        currentInfo.volume !== correctInfo.volume ||
        currentInfo.issue !== correctInfo.issue;

      if (needsFix) {
        // Update issue_info
        const newIssueInfo = {
          year: correctInfo.year,
          volume: correctInfo.volume,
          issue: correctInfo.issue,
        };

        // Also update articles with correct year/volume/issue
        const articles = issue.articles as Array<{
          year?: string;
          volume?: string;
          issue?: string;
          [key: string]: unknown;
        }>;

        if (articles && Array.isArray(articles)) {
          for (const article of articles) {
            if (article.year !== correctInfo.year ||
                article.volume !== correctInfo.volume ||
                article.issue !== correctInfo.issue) {
              article.year = correctInfo.year;
              article.volume = correctInfo.volume;
              article.issue = correctInfo.issue;
              articlesFixed++;
            }
          }
        }

        await supabase
          .from('issue_cache')
          .update({
            issue_info: newIssueInfo,
            articles,
          })
          .eq('id', issue.id);

        console.log(`[fix-metadata] Fixed issue ${issue.issue_id}: ${currentInfo.year}/${currentInfo.volume}/${currentInfo.issue} → ${correctInfo.year}/${correctInfo.volume}/${correctInfo.issue}`);
        fixedCount++;
      }
    }

    return NextResponse.json({
      success: true,
      catcodeMappings: catcodeMap.size,
      issuesFixed: fixedCount,
      articlesFixed,
    });

  } catch (error) {
    console.error('Fix metadata error:', error);
    return NextResponse.json({
      error: 'Fix failed',
      details: error instanceof Error ? error.message : 'Unknown',
    }, { status: 500 });
  }
}
