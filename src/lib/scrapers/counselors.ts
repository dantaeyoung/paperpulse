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

  // Cache for catcode → issue info mapping (populated from website)
  private catcodeCache: Map<string, JournalIssue> = new Map();

  // Parse issue info from dropdown option text like "상담학 연구 제22권 제2호(통권 122호)"
  private parseIssueFromOptionText(catcode: string, text: string): JournalIssue {
    const volMatch = text.match(/제(\d+)권/);
    const issueMatch = text.match(/제(\d+)호/);

    const volume = volMatch ? volMatch[1] : '';
    const issue = issueMatch ? issueMatch[1] : '';
    // Year = 1999 + volume (Vol.1 = 2000, Vol.22 = 2021, etc.)
    const year = volume ? String(1999 + parseInt(volume, 10)) : '';

    return { id: catcode, year, volume, issue };
  }

  // Fetch and cache the catcode → issue mapping from the website
  private async fetchCatcodeMapping(): Promise<void> {
    if (this.catcodeCache.size > 0) return; // Already cached

    const url = `${this.baseUrl}/KOR/journal/journal.php?ptype=list&catcode=1&lnb2=1`;
    try {
      const res = await this.fetchWithRetry(url);
      const buffer = await res.arrayBuffer();
      const decoder = new TextDecoder('euc-kr');
      const html = decoder.decode(buffer);

      // Parse all options: <option value="108">상담학 연구 제22권 제2호(통권 122호)</option>
      const optionPattern = /<option[^>]*value="(\d+)"[^>]*>([^<]+)<\/option>/gi;
      let match;
      while ((match = optionPattern.exec(html)) !== null) {
        const catcode = match[1];
        const text = match[2];
        if (text.includes('제') && text.includes('권')) {
          const issueInfo = this.parseIssueFromOptionText(catcode, text);
          this.catcodeCache.set(catcode, issueInfo);
        }
      }
      console.log(`[counselors] Cached ${this.catcodeCache.size} catcode mappings`);
    } catch (err) {
      console.error('[counselors] Failed to fetch catcode mapping:', err);
    }
  }

  // Derive year/volume/issue from catcode
  getIssueInfoFromCatcode(catcode: string): JournalIssue {
    const cached = this.catcodeCache.get(catcode);
    if (cached) return cached;

    // Fallback for unknown catcodes
    return { id: catcode, year: '', volume: '', issue: '' };
  }

  async getIssues(startYear: number, endYear: number): Promise<JournalIssue[]> {
    // First, ensure we have the catcode mapping
    await this.fetchCatcodeMapping();

    const issues: JournalIssue[] = [];

    // Use the cached mapping to get issues in the year range
    for (const [catcode, issueInfo] of this.catcodeCache.entries()) {
      const year = parseInt(issueInfo.year, 10);
      if (!isNaN(year) && year >= startYear && year <= endYear) {
        issues.push(issueInfo);
      }
    }

    // Sort by catcode descending (newest first)
    issues.sort((a, b) => parseInt(b.id, 10) - parseInt(a.id, 10));

    console.log(`[counselors] Found ${issues.length} issues between ${startYear}-${endYear}`);
    return issues;
  }

  async parseArticlesFromIssue(catcode: string, issueInfo: JournalIssue): Promise<JournalArticle[]> {
    // Ensure we have the catcode mapping for correct year/volume/issue
    await this.fetchCatcodeMapping();

    // Use cached mapping if issueInfo is incomplete
    if (!issueInfo.year || !issueInfo.volume) {
      const cached = this.catcodeCache.get(catcode);
      if (cached) {
        issueInfo = cached;
      }
    }

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
    // Extract paper number: in first <td><b> 1 </b></td> (with possible whitespace inside <b>)
    const numberPattern = /<td[^>]*>\s*<b>\s*(\d+)\s*<\/b>\s*<\/td>/i;
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
      .replace(/&#8228;/g, ' ') // One dot leader → space
      .replace(/&#\d+;/g, ' ')  // Other numeric HTML entities → space
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\u2024/g, ' ')  // One dot leader unicode → space
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
