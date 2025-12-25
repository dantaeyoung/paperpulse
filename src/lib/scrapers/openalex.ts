/**
 * OpenAlex Scraper
 * Free API with no key required - https://docs.openalex.org/
 *
 * OpenAlex indexes 240M+ works including Korean journals
 */

interface OpenAlexSearchParams {
  sourceId?: string;       // OpenAlex source ID (e.g., S2764780376)
  query?: string;          // Search query for title/abstract
  fromDate?: string;       // Filter by publication date (YYYY-MM-DD)
  toDate?: string;         // Filter by publication date
  perPage?: number;        // Results per page (max 200)
  page?: number;           // Page number
}

interface OpenAlexAuthor {
  name: string;
  affiliation?: string;
}

export interface OpenAlexPaper {
  id: string;
  doi?: string;
  title: string;
  authors: OpenAlexAuthor[];
  journal?: string;
  publishedAt?: string;
  abstract?: string;
  url: string;
  keywords?: string[];
  language?: string;
}

interface OpenAlexResponse {
  papers: OpenAlexPaper[];
  totalCount: number;
  page: number;
  hasMore: boolean;
}

export class OpenAlexScraper {
  private baseUrl = 'https://api.openalex.org';
  private email?: string;

  constructor(email?: string) {
    // Adding email gives faster response times (polite pool)
    this.email = email || process.env.OPENALEX_EMAIL;
  }

  /**
   * Search for a journal/source by name
   */
  async findSource(name: string): Promise<{ id: string; name: string; worksCount: number } | null> {
    const url = new URL(`${this.baseUrl}/sources`);
    url.searchParams.set('search', name);
    if (this.email) {
      url.searchParams.set('mailto', this.email);
    }

    try {
      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`OpenAlex API error: ${response.status}`);
      }

      const data = await response.json();
      if (data.results && data.results.length > 0) {
        const source = data.results[0];
        return {
          id: source.id.replace('https://openalex.org/', ''),
          name: source.display_name,
          worksCount: source.works_count,
        };
      }
      return null;
    } catch (error) {
      console.error('OpenAlex findSource error:', error);
      return null;
    }
  }

  /**
   * Search for papers
   */
  async search(params: OpenAlexSearchParams): Promise<OpenAlexResponse> {
    const url = new URL(`${this.baseUrl}/works`);

    // Build filter string
    const filters: string[] = [];

    if (params.sourceId) {
      filters.push(`primary_location.source.id:${params.sourceId}`);
    }
    if (params.fromDate) {
      filters.push(`from_publication_date:${params.fromDate}`);
    }
    if (params.toDate) {
      filters.push(`to_publication_date:${params.toDate}`);
    }

    if (filters.length > 0) {
      url.searchParams.set('filter', filters.join(','));
    }

    if (params.query) {
      url.searchParams.set('search', params.query);
    }

    url.searchParams.set('sort', 'publication_date:desc');
    url.searchParams.set('per_page', String(params.perPage || 25));
    url.searchParams.set('page', String(params.page || 1));

    if (this.email) {
      url.searchParams.set('mailto', this.email);
    }

    try {
      console.log(`OpenAlex API call: ${url.toString()}`);
      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`OpenAlex API error: ${response.status}`);
      }

      const data = await response.json();
      console.log(`OpenAlex API returned ${data.meta?.count || 0} total results`);
      return this.parseResponse(data, params.page || 1, params.perPage || 25);
    } catch (error) {
      console.error('OpenAlex search error:', error);
      throw error;
    }
  }

  /**
   * Search for recent papers from a specific journal
   */
  async searchByJournal(journalName: string, options?: {
    keywords?: string[];
    daysBack?: number;
  }): Promise<OpenAlexPaper[]> {
    const { keywords = [], daysBack = 30 } = options || {};

    // First, find the journal's OpenAlex source ID
    const source = await this.findSource(journalName);
    if (!source) {
      console.warn(`Journal not found in OpenAlex: ${journalName}`);
      return [];
    }

    console.log(`Found OpenAlex source: ${source.name} (${source.id}) with ${source.worksCount} works`);

    // Calculate date range
    const now = new Date();
    const fromDate = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
    const fromDateStr = fromDate.toISOString().split('T')[0];
    const toDateStr = now.toISOString().split('T')[0];

    const allPapers: OpenAlexPaper[] = [];

    if (keywords.length > 0) {
      // Search with each keyword
      for (const keyword of keywords) {
        try {
          const result = await this.search({
            sourceId: source.id,
            query: keyword,
            fromDate: fromDateStr,
            toDate: toDateStr,
            perPage: 50,
          });
          allPapers.push(...result.papers);
        } catch (error) {
          console.error(`OpenAlex search error for keyword "${keyword}":`, error);
        }
      }
    } else {
      // Search journal without keywords
      try {
        const result = await this.search({
          sourceId: source.id,
          fromDate: fromDateStr,
          toDate: toDateStr,
          perPage: 100,
        });
        allPapers.push(...result.papers);
      } catch (error) {
        console.error(`OpenAlex search error for journal "${journalName}":`, error);
      }
    }

    // Deduplicate by id
    const seen = new Set<string>();
    return allPapers.filter(paper => {
      if (seen.has(paper.id)) {
        return false;
      }
      seen.add(paper.id);
      return true;
    });
  }

  /**
   * Parse OpenAlex API response
   */
  private parseResponse(data: any, page: number, perPage: number): OpenAlexResponse {
    const papers: OpenAlexPaper[] = [];

    for (const work of data.results || []) {
      const paper = this.parseWork(work);
      if (paper) {
        papers.push(paper);
      }
    }

    const totalCount = data.meta?.count || 0;
    const hasMore = page * perPage < totalCount;

    return {
      papers,
      totalCount,
      page,
      hasMore,
    };
  }

  /**
   * Parse a single work from OpenAlex
   */
  private parseWork(work: any): OpenAlexPaper | null {
    if (!work.id) {
      return null;
    }

    // Extract authors
    const authors: OpenAlexAuthor[] = [];
    for (const authorship of work.authorships || []) {
      const name = authorship.author?.display_name || authorship.raw_author_name;
      if (name) {
        const institutions = authorship.institutions || [];
        const affiliation = institutions[0]?.display_name;
        authors.push({ name, affiliation });
      }
    }

    // Get the landing page URL (prefer KCI link if available)
    let url = work.primary_location?.landing_page_url ||
              work.doi ? `https://doi.org/${work.doi}` :
              work.id;

    // Extract abstract from inverted index if available
    let abstract: string | undefined;
    if (work.abstract_inverted_index) {
      abstract = this.reconstructAbstract(work.abstract_inverted_index);
    }

    // Extract keywords/concepts
    const keywords: string[] = [];
    for (const concept of work.concepts || []) {
      if (concept.display_name && concept.score > 0.3) {
        keywords.push(concept.display_name);
      }
    }

    return {
      id: work.id.replace('https://openalex.org/', ''),
      doi: work.doi?.replace('https://doi.org/', ''),
      title: work.title || work.display_name || '',
      authors,
      journal: work.primary_location?.source?.display_name,
      publishedAt: work.publication_date,
      abstract,
      url,
      keywords: keywords.length > 0 ? keywords : undefined,
      language: work.language,
    };
  }

  /**
   * Reconstruct abstract from OpenAlex's inverted index format
   */
  private reconstructAbstract(invertedIndex: Record<string, number[]>): string {
    const positions: [number, string][] = [];

    for (const [word, indices] of Object.entries(invertedIndex)) {
      for (const index of indices) {
        positions.push([index, word]);
      }
    }

    positions.sort((a, b) => a[0] - b[0]);
    return positions.map(p => p[1]).join(' ');
  }
}

// Singleton instance
let openAlexScraperInstance: OpenAlexScraper | null = null;

export function getOpenAlexScraper(): OpenAlexScraper {
  if (!openAlexScraperInstance) {
    openAlexScraperInstance = new OpenAlexScraper();
  }
  return openAlexScraperInstance;
}
