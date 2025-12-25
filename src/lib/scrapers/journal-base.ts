import { extractText } from 'unpdf';

// Common article interface for all journals
export interface JournalArticle {
  id: string;            // Unique article ID from source
  title: string;
  authors: string[];
  volume?: string;
  issue?: string;
  year: string;
  pages?: string;
  url: string;           // Article page URL
  pdfUrl?: string;       // PDF download URL
  extractedText?: string; // Extracted PDF content
}

export interface JournalIssue {
  id: string;            // Issue identifier (e.g., catcode)
  volume: string;
  issue: string;
  year: string;
}

// Abstract base class - extend this for each journal
export abstract class JournalScraperBase {
  abstract readonly name: string;        // e.g., '한국상담학회지'
  abstract readonly baseUrl: string;     // e.g., 'https://counselors.or.kr'
  abstract readonly scraperKey: string;  // e.g., 'counselors'

  // Each journal implements these
  abstract getIssues(startYear: number, endYear: number): Promise<JournalIssue[]>;
  abstract parseArticlesFromIssue(issueId: string, issueInfo: JournalIssue): Promise<JournalArticle[]>;
  abstract getPdfUrl(articleId: string): string;

  // Shared utilities (inherited by all scrapers)
  protected async delay(ms: number = 1000): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  protected async fetchWithRetry(url: string, retries = 3): Promise<Response> {
    for (let i = 0; i < retries; i++) {
      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
          },
        });
        if (res.ok) return res;
        console.warn(`Fetch attempt ${i + 1} failed with status ${res.status}`);
      } catch (err) {
        console.warn(`Fetch attempt ${i + 1} failed:`, err);
        if (i === retries - 1) throw err;
      }
      await this.delay(1000 * (i + 1)); // Exponential backoff
    }
    throw new Error(`Failed to fetch ${url} after ${retries} attempts`);
  }

  protected async extractPdfText(buffer: Buffer): Promise<string> {
    try {
      const uint8Array = new Uint8Array(buffer);
      const { text } = await extractText(uint8Array);
      // text is an array of strings (one per page), join them
      if (Array.isArray(text)) {
        return text.join('\n\n');
      }
      return String(text || '');
    } catch (err) {
      console.error('PDF extraction error:', err);
      throw err;
    }
  }

  // Main collection method (shared logic)
  async collectAll(options: {
    startYear?: number;
    endYear?: number;
    extractText?: boolean;
    onProgress?: (msg: string) => void;
  } = {}): Promise<JournalArticle[]> {
    const {
      startYear = 2022,
      endYear = new Date().getFullYear(),
      extractText = true,
      onProgress = console.log
    } = options;

    const articles: JournalArticle[] = [];
    const issues = await this.getIssues(startYear, endYear);

    onProgress(`Found ${issues.length} issues to process for ${this.name}`);

    for (const issue of issues) {
      onProgress(`Processing ${this.name} Vol.${issue.volume} No.${issue.issue} (${issue.year})`);
      await this.delay();

      try {
        const issueArticles = await this.parseArticlesFromIssue(issue.id, issue);

        for (const article of issueArticles) {
          // Fill in issue info
          article.volume = issue.volume;
          article.issue = issue.issue;
          article.year = issue.year;

          if (extractText && article.pdfUrl) {
            try {
              onProgress(`  Downloading PDF for: ${article.title.substring(0, 50)}...`);
              const res = await this.fetchWithRetry(article.pdfUrl);
              const contentType = res.headers.get('content-type') || '';

              if (contentType.includes('pdf') || contentType.includes('octet-stream')) {
                const buffer = Buffer.from(await res.arrayBuffer());
                article.extractedText = await this.extractPdfText(buffer);
                onProgress(`  ✓ Extracted ${article.extractedText.length} chars`);
              } else {
                onProgress(`  ✗ Not a PDF (${contentType})`);
              }
            } catch (err) {
              onProgress(`  ✗ PDF failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
            await this.delay();
          }
          articles.push(article);
        }

        onProgress(`  Found ${issueArticles.length} articles in this issue`);
      } catch (err) {
        onProgress(`  ✗ Failed to parse issue: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    onProgress(`Completed: ${articles.length} total articles collected`);
    return articles;
  }

  // Collect a single issue (useful for testing and incremental updates)
  async collectIssue(issueId: string, options: {
    extractText?: boolean;
    onProgress?: (msg: string) => void;
  } = {}): Promise<JournalArticle[]> {
    const { extractText = false, onProgress = console.log } = options;

    // Create a minimal issue info for parsing
    const issueInfo: JournalIssue = {
      id: issueId,
      volume: '',
      issue: '',
      year: '',
    };

    const articles = await this.parseArticlesFromIssue(issueId, issueInfo);

    if (extractText) {
      for (const article of articles) {
        if (article.pdfUrl) {
          try {
            onProgress(`Downloading PDF for: ${article.title.substring(0, 50)}...`);
            const res = await this.fetchWithRetry(article.pdfUrl);
            const buffer = Buffer.from(await res.arrayBuffer());
            article.extractedText = await this.extractPdfText(buffer);
            onProgress(`✓ Extracted ${article.extractedText.length} chars`);
          } catch (err) {
            onProgress(`✗ PDF failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
          }
          await this.delay();
        }
      }
    }

    return articles;
  }
}

// Registry of all journal scrapers
const scraperRegistry: Map<string, () => JournalScraperBase> = new Map();

export function registerScraper(key: string, factory: () => JournalScraperBase): void {
  scraperRegistry.set(key, factory);
}

export function getScraper(key: string): JournalScraperBase | null {
  const factory = scraperRegistry.get(key);
  return factory ? factory() : null;
}

export function getAllScraperKeys(): string[] {
  return Array.from(scraperRegistry.keys());
}
