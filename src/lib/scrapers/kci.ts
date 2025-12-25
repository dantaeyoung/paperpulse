/**
 * KCI (Korea Citation Index) Scraper
 * Uses the official KCI Open API to search for papers
 *
 * API Key required: Apply at https://www.kci.go.kr/kciportal/po/openapi/openApiList.kci
 */

interface KCISearchParams {
  journal?: string;      // Journal name (UTF-8)
  keyword?: string;      // Search keywords
  title?: string;        // Paper title
  author?: string;       // Author name
  dateFrom?: string;     // Start date (YYYYMM format)
  dateTo?: string;       // End date (YYYYMM format)
  displayCount?: number; // Results per page (max 100)
  page?: number;         // Page number
}

interface KCIAuthor {
  name: string;
  affiliation?: string;
}

export interface KCIPaper {
  articleId: string;
  title: string;
  titleEn?: string;
  authors: KCIAuthor[];
  journal: string;
  volume?: string;
  issue?: string;
  pages?: string;
  publishedAt?: string;
  abstract?: string;
  abstractEn?: string;
  keywords?: string[];
  doi?: string;
  url: string;
}

interface KCIResponse {
  papers: KCIPaper[];
  totalCount: number;
  page: number;
  hasMore: boolean;
}

export class KCIScraper {
  private apiKey: string;
  private baseUrl = 'https://open.kci.go.kr/po/openapi/openApiSearch.kci';

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.KCI_API_KEY || '';
    if (!this.apiKey) {
      console.warn('KCI API key not set. Apply at https://www.kci.go.kr/kciportal/po/openapi/openApiList.kci');
    }
  }

  /**
   * Search for papers by journal name and/or keywords
   */
  async search(params: KCISearchParams): Promise<KCIResponse> {
    if (!this.apiKey) {
      throw new Error('KCI API key is required');
    }

    const queryParams = new URLSearchParams({
      key: this.apiKey,
      apiCode: 'articleSearch',
      displayCount: String(params.displayCount || 20),
      page: String(params.page || 1),
    });

    // Add optional search parameters
    if (params.journal) {
      queryParams.set('journal', params.journal);
    }
    if (params.keyword) {
      queryParams.set('keyword', params.keyword);
    }
    if (params.title) {
      queryParams.set('title', params.title);
    }
    if (params.author) {
      queryParams.set('author', params.author);
    }
    if (params.dateFrom) {
      queryParams.set('dateFrom', params.dateFrom);
    }
    if (params.dateTo) {
      queryParams.set('dateTo', params.dateTo);
    }

    const url = `${this.baseUrl}?${queryParams.toString()}`;

    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`KCI API error: ${response.status} ${response.statusText}`);
      }

      const xmlText = await response.text();
      return this.parseResponse(xmlText, params.page || 1);
    } catch (error) {
      console.error('KCI search error:', error);
      throw error;
    }
  }

  /**
   * Search for recent papers from a specific journal
   */
  async searchByJournal(journalName: string, options?: {
    keywords?: string[];
    daysBack?: number;
  }): Promise<KCIPaper[]> {
    const { keywords = [], daysBack = 30 } = options || {};

    // Calculate date range
    const now = new Date();
    const fromDate = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
    const dateFrom = `${fromDate.getFullYear()}${String(fromDate.getMonth() + 1).padStart(2, '0')}`;
    const dateTo = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;

    const allPapers: KCIPaper[] = [];

    if (keywords.length > 0) {
      // Search with each keyword
      for (const keyword of keywords) {
        try {
          const result = await this.search({
            journal: journalName,
            keyword,
            dateFrom,
            dateTo,
            displayCount: 50,
          });
          allPapers.push(...result.papers);
        } catch (error) {
          console.error(`KCI search error for keyword "${keyword}":`, error);
        }
      }
    } else {
      // Search journal without keywords
      try {
        const result = await this.search({
          journal: journalName,
          dateFrom,
          dateTo,
          displayCount: 100,
        });
        allPapers.push(...result.papers);
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
   * Parse XML response from KCI API
   */
  private parseResponse(xmlText: string, page: number): KCIResponse {
    const papers: KCIPaper[] = [];

    // Extract total count
    const totalCountMatch = xmlText.match(/<TOTAL_COUNT>(\d+)<\/TOTAL_COUNT>/);
    const totalCount = totalCountMatch ? parseInt(totalCountMatch[1], 10) : 0;

    // Extract each record
    const recordRegex = /<RECORD>([\s\S]*?)<\/RECORD>/g;
    let match;

    while ((match = recordRegex.exec(xmlText)) !== null) {
      const record = match[1];

      const paper = this.parseRecord(record);
      if (paper) {
        papers.push(paper);
      }
    }

    const displayCount = papers.length;
    const hasMore = page * displayCount < totalCount;

    return {
      papers,
      totalCount,
      page,
      hasMore,
    };
  }

  /**
   * Parse a single record from XML
   */
  private parseRecord(record: string): KCIPaper | null {
    const getValue = (tag: string): string => {
      const regex = new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}>([^<]*)<\\/${tag}>`);
      const match = record.match(regex);
      return (match?.[1] || match?.[2] || '').trim();
    };

    const articleId = getValue('ARTICLE_ID') || getValue('ARTI_ID');
    if (!articleId) {
      return null;
    }

    // Parse authors
    const authors: KCIAuthor[] = [];
    const authorMatches = record.match(/<AUTHOR_NM>([^<]*)<\/AUTHOR_NM>/g);
    const affiliationMatches = record.match(/<INST_NM>([^<]*)<\/INST_NM>/g);

    if (authorMatches) {
      authorMatches.forEach((authorMatch, i) => {
        const name = authorMatch.replace(/<\/?AUTHOR_NM>/g, '').trim();
        const affiliation = affiliationMatches?.[i]?.replace(/<\/?INST_NM>/g, '').trim();
        if (name) {
          authors.push({ name, affiliation });
        }
      });
    }

    // Parse keywords
    const keywords: string[] = [];
    const keywordMatches = record.match(/<KEYWORD>([^<]*)<\/KEYWORD>/g);
    if (keywordMatches) {
      keywordMatches.forEach(kw => {
        const keyword = kw.replace(/<\/?KEYWORD>/g, '').trim();
        if (keyword) {
          keywords.push(keyword);
        }
      });
    }

    // Build URL
    const url = `https://www.kci.go.kr/kciportal/ci/sereArticleSearch/ciSereArtiView.kci?sereArticleSearchBean.artiId=${articleId}`;

    return {
      articleId,
      title: getValue('TITLE') || getValue('ARTI_TITLE') || '',
      titleEn: getValue('TITLE_ENG') || getValue('ARTI_TITLE_ENG') || undefined,
      authors,
      journal: getValue('JOURNAL_NM') || getValue('SERE_NM') || '',
      volume: getValue('VOL') || undefined,
      issue: getValue('ISSUE') || undefined,
      pages: getValue('PAGE') || undefined,
      publishedAt: getValue('PUB_YEAR') || getValue('PUBL_YEAR') || undefined,
      abstract: getValue('ABSTRACT') || getValue('ARTI_ABS') || undefined,
      abstractEn: getValue('ABSTRACT_ENG') || getValue('ARTI_ABS_ENG') || undefined,
      keywords: keywords.length > 0 ? keywords : undefined,
      doi: getValue('DOI') || undefined,
      url,
    };
  }
}

// Singleton instance
let kciScraperInstance: KCIScraper | null = null;

export function getKCIScraper(): KCIScraper {
  if (!kciScraperInstance) {
    kciScraperInstance = new KCIScraper();
  }
  return kciScraperInstance;
}
