import {
  JournalScraperBase,
  JournalArticle,
  JournalIssue,
  registerScraper
} from './journal-base';

class CounselorsScraper extends JournalScraperBase {
  readonly name = '한국상담학회지';
  readonly baseUrl = 'https://counselors.or.kr';
  readonly scraperKey = 'counselors';

  // Catcode ranges by year (discovered from website)
  // Volume number = year - 1999 (e.g., 2025 = Vol.26)
  // Pattern: 6 issues per year starting from 2003, 4 issues for 2000-2002
  private catcodeRanges: Record<number, [number, number]> = {
    2025: [133, 138],  // Vol.26
    2024: [127, 132],  // Vol.25
    2023: [121, 126],  // Vol.24
    2022: [115, 120],  // Vol.23
    2021: [109, 114],  // Vol.22
    2020: [103, 108],  // Vol.21
    2019: [97, 102],   // Vol.20
    2018: [91, 96],    // Vol.19
    2017: [85, 90],    // Vol.18
    2016: [79, 84],    // Vol.17
    2015: [73, 78],    // Vol.16
    2014: [67, 72],    // Vol.15
    2013: [61, 66],    // Vol.14
    2012: [55, 60],    // Vol.13
    2011: [49, 54],    // Vol.12
    2010: [43, 48],    // Vol.11
    2009: [37, 42],    // Vol.10
    2008: [31, 36],    // Vol.9
    2007: [25, 30],    // Vol.8
    2006: [19, 24],    // Vol.7
    2005: [13, 18],    // Vol.6
    2004: [7, 12],     // Vol.5
    2003: [5, 6],      // Vol.4 (only 2 issues?)
    2002: [3, 4],      // Vol.3
    2001: [2, 2],      // Vol.2
    2000: [1, 1],      // Vol.1
  };

  // Derive year/volume/issue from catcode
  getIssueInfoFromCatcode(catcode: string): JournalIssue {
    const catcodeNum = parseInt(catcode, 10);

    for (const [yearStr, [start, end]] of Object.entries(this.catcodeRanges)) {
      if (catcodeNum >= start && catcodeNum <= end) {
        const year = parseInt(yearStr, 10);
        return {
          id: catcode,
          year: String(year),
          volume: String(year - 1999),
          issue: String(catcodeNum - start + 1),
        };
      }
    }

    // Fallback for unknown catcodes
    return { id: catcode, year: '', volume: '', issue: '' };
  }

  async getIssues(startYear: number, endYear: number): Promise<JournalIssue[]> {
    // Fetch the issue list page to get all available issues dynamically
    const url = `${this.baseUrl}/KOR/journal/journal_year.php`;
    console.log(`[counselors] Fetching issue list from: ${url}`);

    try {
      const res = await this.fetchWithRetry(url);
      const buffer = await res.arrayBuffer();
      const decoder = new TextDecoder('euc-kr');
      const html = decoder.decode(buffer);

      const issues: JournalIssue[] = [];

      // Parse links like: /KOR/journal/journal.php?ptype=list&catcode=137&lnb2=1
      // The page has year headings like "2025년" followed by issue links
      const linkPattern = /catcode=(\d+)/g;
      const yearPattern = /(\d{4})년/g;

      // Find all catcodes
      const catcodes: number[] = [];
      let match;
      while ((match = linkPattern.exec(html)) !== null) {
        const catcode = parseInt(match[1], 10);
        if (!catcodes.includes(catcode)) {
          catcodes.push(catcode);
        }
      }

      // Sort catcodes descending (newest first)
      catcodes.sort((a, b) => b - a);

      // Convert catcodes to issues using our mapping
      for (const catcode of catcodes) {
        const issueInfo = this.getIssueInfoFromCatcode(String(catcode));
        const year = parseInt(issueInfo.year, 10);

        // Filter by year range
        if (year >= startYear && year <= endYear) {
          issues.push(issueInfo);
        }
      }

      console.log(`[counselors] Found ${issues.length} issues between ${startYear}-${endYear}`);
      return issues;

    } catch (err) {
      console.error('[counselors] Failed to fetch issue list, falling back to hardcoded ranges:', err);
      // Fallback to hardcoded ranges
      return this.getIssuesFallback(startYear, endYear);
    }
  }

  // Fallback method using hardcoded ranges
  private getIssuesFallback(startYear: number, endYear: number): JournalIssue[] {
    const issues: JournalIssue[] = [];
    const currentYear = new Date().getFullYear();

    for (let year = startYear; year <= Math.min(endYear, currentYear); year++) {
      const range = this.catcodeRanges[year];
      if (!range) continue;

      for (let catcode = range[0]; catcode <= range[1]; catcode++) {
        issues.push({
          id: String(catcode),
          volume: String(year - 1999),
          issue: String(catcode - range[0] + 1),
          year: String(year),
        });
      }
    }

    return issues;
  }

  async parseArticlesFromIssue(catcode: string, issueInfo: JournalIssue): Promise<JournalArticle[]> {
    const url = `${this.baseUrl}/KOR/journal/journal.php?ptype=list&catcode=${catcode}&lnb2=1`;
    console.log(`[counselors] Fetching issue from: ${url}`);

    try {
      const res = await this.fetchWithRetry(url);
      console.log(`[counselors] Response status: ${res.status}`);

      // The page uses EUC-KR encoding, need to decode properly
      const buffer = await res.arrayBuffer();
      const decoder = new TextDecoder('euc-kr');
      const html = decoder.decode(buffer);
      console.log(`[counselors] HTML length: ${html.length}, has go_popup: ${html.includes('go_popup')}, has down.php: ${html.includes('down.php')}`);

      // Check if the issue exists (page might be empty or redirect)
      if (!html.includes('go_popup') && !html.includes('down.php')) {
        console.log(`Issue ${catcode} appears to be empty or not yet published`);
        return [];
      }

      const articles = this.parseHtml(html, issueInfo);
      console.log(`[counselors] Parsed ${articles.length} articles from issue ${catcode}`);
      return articles;
    } catch (err) {
      console.error(`Failed to fetch issue ${catcode}:`, err);
      return [];
    }
  }

  private parseHtml(html: string, issueInfo: JournalIssue): JournalArticle[] {
    const articles: JournalArticle[] = [];

    // The HTML structure is:
    // <tr>
    //   <td><b>1</b></td>  <!-- row number -->
    //   <td style="text-align:left">TITLE<!-- ID --></td>  <!-- title -->
    //   <td>..go_popup..</td>  <!-- PDF view -->
    //   <td>..</td>  <!-- download -->
    //   <td>AUTHORS</td>  <!-- authors with <br /> -->
    // </tr>

    // Find all rows with article IDs
    // Pattern: look for <!-- ARTICLE_ID --> which appears after the title
    const rowPattern = /<tr[^>]*>[\s\S]*?<!--\s*(\d+)\s*-->[\s\S]*?<\/tr>/gi;

    let match;
    while ((match = rowPattern.exec(html)) !== null) {
      const articleId = match[1];
      const rowHtml = match[0];

      const article = this.extractArticleFromRow(rowHtml, articleId, issueInfo);
      if (article) {
        articles.push(article);
      }
    }

    return articles;
  }

  private extractArticleFromRow(rowHtml: string, articleId: string, issueInfo: JournalIssue): JournalArticle | null {
    // Extract paper number: in first <td><b>1</b></td>
    const numberPattern = /<td[^>]*>\s*<b>(\d+)<\/b>\s*<\/td>/i;
    const numberMatch = numberPattern.exec(rowHtml);
    const paperNumber = numberMatch ? parseInt(numberMatch[1], 10) : undefined;

    // Extract title: in <td style="text-align:left">TITLE<!-- ID --></td>
    const titlePattern = /<td[^>]*style="text-align:left"[^>]*>([\s\S]*?)<!--\s*\d+\s*-->/i;
    const titleMatch = titlePattern.exec(rowHtml);

    let title = `Article ${articleId}`;
    if (titleMatch) {
      title = this.cleanText(titleMatch[1]);
    }

    // Extract authors: in the last <td> before </tr>
    // The authors cell contains names, possibly separated by <br /> or commas
    // Find all <td> tags and get the last one that looks like it contains author names
    const allTds = rowHtml.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
    let authors: string[] = [];

    // The last <td> typically contains authors
    if (allTds.length > 0) {
      const lastTd = allTds[allTds.length - 1];
      const tdContent = lastTd.replace(/<\/?td[^>]*>/gi, '');

      // Split by <br /> or <br> and clean each name
      const names = tdContent.split(/<br\s*\/?>/i);
      for (const name of names) {
        let cleaned = this.cleanText(name);
        // Remove common suffixes like "보기", "-->", arrows, etc.
        cleaned = cleaned.replace(/\s*(보기|바로보기|-->|->|…|, )\s*/g, '').trim();

        // Korean names are typically 2-4 characters, allow up to 10 for longer names
        if (cleaned.length >= 2 && cleaned.length <= 15) {
          // Filter out non-name content
          const excludeWords = ['논문', '저자', '학회', '상담', '치료', '연구', '분석', '효과', '관계', '버튼', 'Viewer', 'PDF', 'viewer', '다운', '보기', '바로'];
          if (!excludeWords.some(w => cleaned.toLowerCase().includes(w.toLowerCase()))) {
            authors.push(cleaned);
          }
        }
      }
    }

    return {
      id: articleId,
      title,
      authors,
      year: issueInfo.year,
      volume: issueInfo.volume,
      issue: issueInfo.issue,
      paperNumber,
      url: `${this.baseUrl}/KOR/journal/journal.php?ptype=view&idx=${articleId}`,
      pdfUrl: this.getPdfUrl(articleId),
    };
  }

  private cleanText(text: string): string {
    return text
      .replace(/<[^>]+>/g, '') // Remove HTML tags
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim();
  }

  getPdfUrl(articleId: string): string {
    return `${this.baseUrl}/admin/journal/down.php?idx=${articleId}`;
  }
}

// Singleton instance
let instance: CounselorsScraper | null = null;

// Register this scraper
registerScraper('counselors', () => {
  if (!instance) instance = new CounselorsScraper();
  return instance;
});

export function getCounselorsScraper(): CounselorsScraper {
  if (!instance) instance = new CounselorsScraper();
  return instance;
}
