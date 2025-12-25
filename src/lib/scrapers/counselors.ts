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
  private catcodeRanges: Record<number, [number, number]> = {
    2025: [133, 138],  // Vol.26, up to 6 issues
    2024: [127, 132],  // Vol.25
    2023: [121, 126],  // Vol.24
    2022: [115, 120],  // Vol.23
    2021: [109, 114],  // Vol.22
    2020: [103, 108],  // Vol.21
    2019: [97, 102],   // Vol.20
    2018: [91, 96],    // Vol.19
  };

  async getIssues(startYear: number, endYear: number): Promise<JournalIssue[]> {
    const issues: JournalIssue[] = [];
    const currentYear = new Date().getFullYear();

    for (let year = startYear; year <= Math.min(endYear, currentYear); year++) {
      const range = this.catcodeRanges[year];
      if (!range) continue;

      for (let catcode = range[0]; catcode <= range[1]; catcode++) {
        // For current year, check if issue exists by trying to fetch it
        // For past years, include all issues in range
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
    // Extract title: in <td style="text-align:left">TITLE<!-- ID --></td>
    const titlePattern = /<td[^>]*style="text-align:left"[^>]*>([\s\S]*?)<!--\s*\d+\s*-->/i;
    const titleMatch = titlePattern.exec(rowHtml);

    let title = `Article ${articleId}`;
    if (titleMatch) {
      title = this.cleanText(titleMatch[1]);
    }

    // Extract authors: in the last <td> before </tr>, contains names with <br />
    // Pattern: look for <td> containing Korean names separated by <br />
    const authorsTdPattern = /<td[^>]*>((?:[^<]*<br\s*\/?>\s*)+[^<]*)<\/td>\s*<\/tr>/i;
    const authorsMatch = authorsTdPattern.exec(rowHtml);

    let authors: string[] = [];
    if (authorsMatch) {
      const authorsText = authorsMatch[1];
      // Split by <br /> and clean each name
      const names = authorsText.split(/<br\s*\/?>/i);
      for (const name of names) {
        const cleaned = this.cleanText(name);
        if (cleaned.length >= 2 && cleaned.length <= 10) {
          // Filter out non-name content
          const excludeWords = ['논문', '저자', '학회', '상담', '치료', '연구', '분석', '효과', '관계', '버튼'];
          if (!excludeWords.some(w => cleaned.includes(w))) {
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
