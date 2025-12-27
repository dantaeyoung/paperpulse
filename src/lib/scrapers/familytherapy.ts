import {
  JournalScraperBase,
  JournalArticle,
  JournalIssue,
  registerScraper
} from './journal-base';

/**
 * Scraper for 가족과 가족치료 (Family and Family Therapy)
 * Published by 한국가족치료학회 (Korean Association of Family Therapy)
 *
 * This journal is hosted on Kyobo Scholar platform.
 * API endpoints:
 * - Journal info: /academy/journalExtensionsAjax/{schlrPoiNum}
 * - Volume list: /journal/volume/extensionsAjax/{schlrPoiNum}/{pubcNum}
 * - Article search: POST /external/scholarMainSearchAjax
 */
class FamilyTherapyScraper extends JournalScraperBase {
  readonly name = '가족과 가족치료';
  readonly baseUrl = 'https://scholar.kyobobook.co.kr';
  readonly scraperKey = 'familytherapy';

  // Kyobo Scholar IDs
  private readonly schlrPoiNum = '20369';  // Publisher ID
  private readonly pubcNum = '2651';        // Journal ID

  // Cache for volume list
  private volumeCache: Map<string, { year: string; volume: string; issue: string }> = new Map();

  /**
   * Parse volume/issue info from vlmNumbName like "가족과 가족치료 제33권 제3호"
   */
  private parseVolumeInfo(vlmNumbName: string): { year: string; volume: string; issue: string } {
    const volMatch = vlmNumbName.match(/제(\d+)권/);
    const issueMatch = vlmNumbName.match(/제(\d+)호/);

    const volume = volMatch ? volMatch[1] : '';
    const issue = issueMatch ? issueMatch[1] : '';

    // Calculate year: Journal started in 1993 as Vol.1
    // Vol.1 = 1993, Vol.33 = 2025
    const year = volume ? String(1992 + parseInt(volume, 10)) : '';

    return { year, volume, issue };
  }

  /**
   * Fetch and cache the volume/issue list from Kyobo Scholar
   */
  private async fetchVolumeList(): Promise<void> {
    if (this.volumeCache.size > 0) return;

    const url = `${this.baseUrl}/journal/volume/extensionsAjax/${this.schlrPoiNum}/${this.pubcNum}`;

    try {
      const res = await this.fetchWithRetry(url);
      const data = await res.json();

      if (data?.data?.resultList) {
        for (const item of data.data.resultList) {
          const pubcVlmNumbNum = String(item.pubcVlmNumbNum);
          const info = this.parseVolumeInfo(item.vlmNumbName || '');
          this.volumeCache.set(pubcVlmNumbNum, info);
        }
      }

      console.log(`[familytherapy] Cached ${this.volumeCache.size} volume entries`);
    } catch (err) {
      console.error('[familytherapy] Failed to fetch volume list:', err);
    }
  }

  async getIssues(startYear: number, endYear: number): Promise<JournalIssue[]> {
    await this.fetchVolumeList();

    const issues: JournalIssue[] = [];

    for (const [id, info] of this.volumeCache.entries()) {
      const year = parseInt(info.year, 10);
      if (!isNaN(year) && year >= startYear && year <= endYear) {
        issues.push({
          id,
          year: info.year,
          volume: info.volume,
          issue: info.issue,
        });
      }
    }

    // Sort by year desc, then by issue desc
    issues.sort((a, b) => {
      const yearDiff = parseInt(b.year, 10) - parseInt(a.year, 10);
      if (yearDiff !== 0) return yearDiff;
      return parseInt(b.issue, 10) - parseInt(a.issue, 10);
    });

    console.log(`[familytherapy] Found ${issues.length} issues between ${startYear}-${endYear}`);
    return issues;
  }

  async parseArticlesFromIssue(issueId: string, issueInfo: JournalIssue): Promise<JournalArticle[]> {
    await this.fetchVolumeList();

    // Get issue info from cache if not provided
    if (!issueInfo.year || !issueInfo.volume) {
      const cached = this.volumeCache.get(issueId);
      if (cached) {
        issueInfo = { ...issueInfo, ...cached };
      }
    }

    const url = `${this.baseUrl}/external/scholarMainSearchAjax`;
    const body = {
      keyword: issueId,
      searchTarget: 'bookCd',
      section: '008',
      pageRowCount: 100,  // Get all articles in one request
      page: 1,
    };

    console.log(`[familytherapy] Fetching articles for issue ${issueId}`);

    try {
      const res = await this.fetchWithRetry(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!data?.data?.resultList) {
        console.log(`[familytherapy] No articles found for issue ${issueId}`);
        return [];
      }

      const articles: JournalArticle[] = [];
      let paperNumber = 1;

      for (const item of data.data.resultList) {
        // Parse authors from ARTL_AUTR_CARD_HNGL_NAME like "권혜영(Hyeyoung Kwon), 조은숙(Eunsuk Cho)"
        const authors = this.parseAuthors(item.ARTL_AUTR_CARD_HNGL_NAME || item.ARTL_AUTR_HNGL_NAME || '');

        const article: JournalArticle = {
          id: item.SCHLR_CMDTCODE,  // Use the Kyobo Scholar code as ID
          title: item.ARTL_NAME || item.ARTL_ENSN_NAME || '',
          authors,
          year: item.ISSU_YR || issueInfo.year,
          volume: item.PUBC_VLM_NAME || issueInfo.volume,
          issue: item.PUBC_NUMB_NAME || issueInfo.issue,
          paperNumber: paperNumber++,
          url: `${this.baseUrl}/article/external/detail/${this.schlrPoiNum}/${item.SCHLR_CMDTCODE}`,
          pdfUrl: this.getPdfUrl(item.SCHLR_CMDTCODE, item.ARTL_NUM),
        };

        articles.push(article);
      }

      console.log(`[familytherapy] Parsed ${articles.length} articles from issue ${issueId}`);
      return articles;
    } catch (err) {
      console.error(`[familytherapy] Failed to fetch articles for issue ${issueId}:`, err);
      return [];
    }
  }

  /**
   * Parse authors from strings like "권혜영(Hyeyoung Kwon), 조은숙(Eunsuk Cho)"
   * or "권혜영, 조은숙, 한현숙 외 1명"
   */
  private parseAuthors(authorStr: string): string[] {
    if (!authorStr) return [];

    // Split by comma and clean each name
    const parts = authorStr.split(',');
    const authors: string[] = [];

    for (const part of parts) {
      let name = part.trim();

      // Remove English name in parentheses: "권혜영(Hyeyoung Kwon)" → "권혜영"
      name = name.replace(/\([^)]+\)/g, '').trim();

      // Remove "외 N명" suffix
      name = name.replace(/외\s*\d+명?/, '').trim();

      if (name.length >= 2 && name.length <= 20) {
        authors.push(name);
      }
    }

    return authors;
  }

  getPdfUrl(schlrCmdtcode: string, artlNum?: string): string {
    // Kyobo Scholar PDF access endpoint
    // Note: This may require authentication or special handling
    if (artlNum) {
      return `${this.baseUrl}/file/view?downOrView=pdf&schlrCmdtcode=${schlrCmdtcode}&artlNum=${artlNum}&mmbrId=external&termlDvsnCode=P`;
    }
    return `${this.baseUrl}/article/external/detail/${this.schlrPoiNum}/${schlrCmdtcode}`;
  }
}

// Singleton instance
let instance: FamilyTherapyScraper | null = null;

// Register this scraper
registerScraper('familytherapy', () => {
  if (!instance) instance = new FamilyTherapyScraper();
  return instance;
});

export function getFamilyTherapyScraper(): FamilyTherapyScraper {
  if (!instance) instance = new FamilyTherapyScraper();
  return instance;
}
