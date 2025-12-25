/**
 * KCI Web Scraper
 * Scrapes KCI search results directly from the website
 * No API key required!
 */

export interface KCIWebPaper {
  articleId: string;
  title: string;
  authors: { name: string; orcid?: string }[];
  journal: string;
  publisher?: string;
  volume?: string;
  pages?: string;
  publishedAt?: string;
  field?: string;
  url: string;
  citationCount?: number;
}

interface KCIWebSearchParams {
  keyword?: string;
  journal?: string;      // Journal name to search
  dateFrom?: string;     // YYYYMM format
  dateTo?: string;       // YYYYMM format
  page?: number;
  pageSize?: number;     // 10, 20, 50, 100
}

interface KCIWebResponse {
  papers: KCIWebPaper[];
  totalCount: number;
  page: number;
  hasMore: boolean;
}

export class KCIWebScraper {
  private baseUrl = 'https://www.kci.go.kr/kciportal/po/search/poArtiSearList.kci';

  /**
   * Search for papers
   */
  async search(params: KCIWebSearchParams): Promise<KCIWebResponse> {
    const searchParams = new URLSearchParams();

    if (params.keyword) {
      searchParams.set('poSearchBean.keyword', params.keyword);
    }
    if (params.journal) {
      // Search by journal name in the search field
      searchParams.set('poSearchBean.keyword', params.journal);
      searchParams.set('poSearchBean.schKind', 'SERE_NM'); // Search in journal name
    }
    if (params.dateFrom) {
      searchParams.set('poSearchBean.strtYY', params.dateFrom.substring(0, 4));
      searchParams.set('poSearchBean.strtMM', params.dateFrom.substring(4, 6));
    }
    if (params.dateTo) {
      searchParams.set('poSearchBean.endYY', params.dateTo.substring(0, 4));
      searchParams.set('poSearchBean.endMM', params.dateTo.substring(4, 6));
    }

    const page = params.page || 1;
    const pageSize = params.pageSize || 20;
    searchParams.set('poSearchBean.page', String(page));
    searchParams.set('poSearchBean.docsCount', String(pageSize));

    const url = `${this.baseUrl}?${searchParams.toString()}`;
    console.log(`KCI Web scrape: ${url}`);

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ArticleSummarizer/1.0)',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
        },
      });

      if (!response.ok) {
        throw new Error(`KCI request failed: ${response.status}`);
      }

      const html = await response.text();
      return this.parseSearchResults(html, page, pageSize);
    } catch (error) {
      console.error('KCI Web scrape error:', error);
      throw error;
    }
  }

  /**
   * Search for recent papers from a specific journal
   */
  async searchByJournal(journalName: string, options?: {
    keywords?: string[];
    daysBack?: number;
  }): Promise<KCIWebPaper[]> {
    const { keywords = [], daysBack = 30 } = options || {};

    // Calculate date range
    const now = new Date();
    const fromDate = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
    const dateFrom = `${fromDate.getFullYear()}${String(fromDate.getMonth() + 1).padStart(2, '0')}`;
    const dateTo = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;

    const allPapers: KCIWebPaper[] = [];

    if (keywords.length > 0) {
      // Search with each keyword + journal filter
      for (const keyword of keywords) {
        try {
          // Combine journal name and keyword in search
          const result = await this.search({
            keyword: `${journalName} ${keyword}`,
            dateFrom,
            dateTo,
            pageSize: 50,
          });

          // Filter results to only include papers from this journal
          const filtered = result.papers.filter(p =>
            p.journal.includes(journalName) || journalName.includes(p.journal)
          );
          allPapers.push(...filtered);
        } catch (error) {
          console.error(`KCI search error for keyword "${keyword}":`, error);
        }
      }
    } else {
      // Search by journal name only
      try {
        const result = await this.search({
          keyword: journalName,
          dateFrom,
          dateTo,
          pageSize: 100,
        });

        // Filter results to only include papers from this journal
        const filtered = result.papers.filter(p =>
          p.journal.includes(journalName) || journalName.includes(p.journal)
        );
        allPapers.push(...filtered);
      } catch (error) {
        console.error(`KCI search error for journal "${journalName}":`, error);
      }
    }

    // Deduplicate by articleId
    const seen = new Set<string>();
    return allPapers.filter(paper => {
      if (seen.has(paper.articleId)) {
        return false;
      }
      seen.add(paper.articleId);
      return true;
    });
  }

  /**
   * Parse HTML search results
   */
  private parseSearchResults(html: string, page: number, pageSize: number): KCIWebResponse {
    const papers: KCIWebPaper[] = [];

    // Extract total count
    const totalMatch = html.match(/총\s*<strong[^>]*>([0-9,]+)<\/strong>\s*건/);
    const totalCount = totalMatch ? parseInt(totalMatch[1].replace(/,/g, ''), 10) : 0;

    // Find all article entries - they follow the pattern with artiId in the URL
    const articleRegex = /ciSereArtiView\.kci\?sereArticleSearchBean\.artiId=(ART\d+)[^"]*"[^>]*class="subject"[^>]*>\s*([^<]+)/g;
    let match;
    const articleIds: string[] = [];
    const titles: Map<string, string> = new Map();

    while ((match = articleRegex.exec(html)) !== null) {
      const articleId = match[1];
      const title = match[2].trim();
      if (!articleIds.includes(articleId)) {
        articleIds.push(articleId);
        titles.set(articleId, title);
      }
    }

    // For each article, extract more details
    for (const articleId of articleIds) {
      const paper = this.extractPaperDetails(html, articleId, titles.get(articleId) || '');
      if (paper) {
        papers.push(paper);
      }
    }

    const hasMore = page * pageSize < totalCount;

    return {
      papers,
      totalCount,
      page,
      hasMore,
    };
  }

  /**
   * Extract paper details from HTML
   */
  private extractPaperDetails(html: string, articleId: string, title: string): KCIWebPaper | null {
    // Find the section for this article
    const articleSection = this.findArticleSection(html, articleId);
    if (!articleSection) {
      return {
        articleId,
        title,
        authors: [],
        journal: '',
        url: `https://www.kci.go.kr/kciportal/ci/sereArticleSearch/ciSereArtiView.kci?sereArticleSearchBean.artiId=${articleId}`,
      };
    }

    // Extract authors
    const authors: { name: string; orcid?: string }[] = [];
    const authorRegex = /poCretDetail\.kci\?[^"]*artiId=[^"]*">\s*([^<]+)<\/a>(?:[^<]*<a[^>]*orcid\.org\/([^"]+)")?/g;
    let authorMatch;
    while ((authorMatch = authorRegex.exec(articleSection)) !== null) {
      const name = authorMatch[1].trim();
      const orcid = authorMatch[2];
      if (name && !authors.find(a => a.name === name)) {
        authors.push({ name, orcid });
      }
    }

    // Extract journal info from subject-info list
    const infoItems = this.extractInfoItems(articleSection);

    return {
      articleId,
      title,
      authors,
      journal: infoItems.journal || '',
      publisher: infoItems.publisher,
      volume: infoItems.volume,
      pages: infoItems.pages,
      publishedAt: infoItems.date,
      field: infoItems.field,
      url: `https://www.kci.go.kr/kciportal/ci/sereArticleSearch/ciSereArtiView.kci?sereArticleSearchBean.artiId=${articleId}`,
      citationCount: infoItems.citations,
    };
  }

  /**
   * Find the HTML section for a specific article
   */
  private findArticleSection(html: string, articleId: string): string | null {
    // Find from the article ID to the next article or end of list
    const startPattern = new RegExp(`artiId=${articleId}[^<]*<[^>]*class="subject"`, 'i');
    const startMatch = startPattern.exec(html);
    if (!startMatch) return null;

    const startIndex = startMatch.index;
    // Find the next article (next row) or end
    const nextArticleMatch = html.substring(startIndex + 100).match(/artiId=ART\d+[^<]*<[^>]*class="subject"/);
    const endIndex = nextArticleMatch && nextArticleMatch.index !== undefined
      ? startIndex + 100 + nextArticleMatch.index
      : startIndex + 2000;

    return html.substring(startIndex, endIndex);
  }

  /**
   * Extract info items from article section
   */
  private extractInfoItems(section: string): {
    publisher?: string;
    journal?: string;
    volume?: string;
    pages?: string;
    date?: string;
    field?: string;
    citations?: number;
  } {
    const result: {
      publisher?: string;
      journal?: string;
      volume?: string;
      pages?: string;
      date?: string;
      field?: string;
      citations?: number;
    } = {};

    // Extract journal name (from ciSereInfoView link)
    const journalMatch = section.match(/ciSereInfoView\.kci[^>]*>\s*([^<]+)<\/a>/);
    if (journalMatch) {
      result.journal = journalMatch[1].trim();
    }

    // Extract publisher (from poInsiSearSoceView link)
    const publisherMatch = section.match(/poInsiSearSoceView\.kci[^>]*>\s*([^<]+)<\/a>/);
    if (publisherMatch) {
      result.publisher = publisherMatch[1].trim();
    }

    // Extract volume (pattern like "61(4)" or "제61권 제4호")
    const volumeMatch = section.match(/>\s*(\d+\([^)]+\))\s*<\/a>/);
    if (volumeMatch) {
      result.volume = volumeMatch[1];
    }

    // Extract pages
    const pagesMatch = section.match(/pp\.([^<]+)</);
    if (pagesMatch) {
      result.pages = pagesMatch[1].trim();
    }

    // Extract date (YYYY.MM format)
    const dateMatch = section.match(/<li>\s*(\d{4}\.\d{1,2})\s*<\/li>/);
    if (dateMatch) {
      result.date = dateMatch[1];
    }

    // Extract field
    const fieldMatch = section.match(/<li>\s*(\d{4}\.\d{1,2})\s*<\/li>\s*<li>([^<]+)<\/li>/);
    if (fieldMatch) {
      result.field = fieldMatch[2].trim();
    }

    // Extract citation count
    const citationMatch = section.match(/피인용\s*횟수[^<]*<[^>]*>\s*(\d+)\s*<\/a>/);
    if (citationMatch) {
      result.citations = parseInt(citationMatch[1], 10);
    }

    return result;
  }
}

// Singleton instance
let kciWebScraperInstance: KCIWebScraper | null = null;

export function getKCIWebScraper(): KCIWebScraper {
  if (!kciWebScraperInstance) {
    kciWebScraperInstance = new KCIWebScraper();
  }
  return kciWebScraperInstance;
}
