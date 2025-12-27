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
 * Uses POST /external/scholarMainSearchAjax with reSrchQry parameter
 */
class FamilyTherapyScraper extends JournalScraperBase {
  readonly name = '가족과 가족치료';
  readonly baseUrl = 'https://scholar.kyobobook.co.kr';
  readonly scraperKey = 'familytherapy';

  // Kyobo Scholar IDs
  private readonly schlrPoiNum = '20369';  // Publisher ID
  private readonly pubcNum = '2651';        // Journal ID

  /**
   * Search for articles using Kyobo Scholar API
   */
  private async searchArticles(options: {
    issueId?: string;
    page?: number;
    pageSize?: number;
  } = {}): Promise<{ articles: KyoboArticle[]; totalCount: number }> {
    const { issueId, page = 1, pageSize = 50 } = options;

    const url = `${this.baseUrl}/external/scholarMainSearchAjax`;

    // Use the actual request format from familytherapy.or.kr
    const body = {
      page: String(page),
      pageRowCount: pageSize,
      keyword: this.pubcNum,           // Journal ID: 2651
      searchTarget: 'journalCd',
      sqnc: 'startNo',
      reSrchYsno: '',
      reSrchTrgtCode: '',
      reSearchTerm: '',
      reSrchQry: '',
      cmdtClstCode: '',
      issuYr: '',
      srchFldCode: '',
      srchTypeCode: 'including',
      schlrPoiNum: '',
      pubcNum: '',
      excludeSchlrCmdtcode: '',
      section: '008',
      init: false,
      pubcVlmNumbNum: issueId || 'all',  // Specific issue or all
    };

    console.log(`[familytherapy] Searching journal ${this.pubcNum}, issue: ${issueId || 'all'}, page ${page}`);

    const res = await this.fetchWithRetry(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!data?.data?.resultList) {
      return { articles: [], totalCount: 0 };
    }

    return {
      articles: data.data.resultList as KyoboArticle[],
      totalCount: data.data.totalCount || 0,
    };
  }

  async getIssues(startYear: number, endYear: number): Promise<JournalIssue[]> {
    // Fetch all issues from the volume list endpoint
    const url = `${this.baseUrl}/journal/volume/extensionsAjax/${this.schlrPoiNum}/${this.pubcNum}`;

    console.log(`[familytherapy] Fetching issue list from ${url}`);

    const res = await this.fetchWithRetry(url);
    const data = await res.json();

    if (!data?.data?.resultList) {
      console.log(`[familytherapy] No issues found`);
      return [];
    }

    const issues: JournalIssue[] = [];

    for (const item of data.data.resultList) {
      // Parse volume and issue from vlmNumbName like "가족과 가족치료 제33권 제3호"
      const { volume, issue } = this.parseVolumeInfo(item.vlmNumbName || '');

      // Calculate year from volume (Vol.1 = 1993)
      const volumeNum = parseInt(volume, 10);
      const year = isNaN(volumeNum) ? '' : String(1992 + volumeNum);
      const yearNum = parseInt(year, 10);

      // Filter by year range
      if (!isNaN(yearNum) && yearNum >= startYear && yearNum <= endYear) {
        issues.push({
          id: String(item.pubcVlmNumbNum),
          year,
          volume,
          issue,
        });
      }
    }

    // Sort by year desc, volume desc, issue desc
    issues.sort((a, b) => {
      const yearDiff = parseInt(b.year, 10) - parseInt(a.year, 10);
      if (yearDiff !== 0) return yearDiff;
      const volDiff = parseInt(b.volume, 10) - parseInt(a.volume, 10);
      if (volDiff !== 0) return volDiff;
      return parseInt(b.issue, 10) - parseInt(a.issue, 10);
    });

    console.log(`[familytherapy] Found ${issues.length} issues between ${startYear}-${endYear}`);
    return issues;
  }

  /**
   * Parse volume and issue from strings like "가족과 가족치료 제33권 제3호"
   */
  private parseVolumeInfo(vlmNumbName: string): { volume: string; issue: string } {
    const volMatch = vlmNumbName.match(/제(\d+)권/);
    const issueMatch = vlmNumbName.match(/제(\d+)호/);

    return {
      volume: volMatch ? volMatch[1] : '',
      issue: issueMatch ? issueMatch[1] : '',
    };
  }

  async parseArticlesFromIssue(issueId: string, issueInfo: JournalIssue): Promise<JournalArticle[]> {
    const { articles } = await this.searchArticles({ issueId, pageSize: 100 });

    const result: JournalArticle[] = [];
    let paperNumber = 1;

    for (const item of articles) {
      const authors = this.parseAuthors(item.ARTL_AUTR_HNGL_NAME || '');

      const article: JournalArticle = {
        id: item.SCHLR_CMDTCODE,
        title: item.ARTL_NAME || item.ARTL_ENSN_NAME || '',
        authors,
        year: item.ISSU_YR || issueInfo.year,
        volume: item.PUBC_VLM_NAME || issueInfo.volume,
        issue: item.PUBC_NUMB_NAME || issueInfo.issue,
        paperNumber: paperNumber++,
        url: `${this.baseUrl}/article/external/detail/${this.schlrPoiNum}/${item.SCHLR_CMDTCODE}`,
        pdfUrl: this.getPdfUrl(item.SCHLR_CMDTCODE, item.ARTL_NUM),
      };

      result.push(article);
    }

    console.log(`[familytherapy] Parsed ${result.length} articles from issue ${issueId}`);
    return result;
  }

  /**
   * Parse authors from strings like "권혜영, 조은숙, 한현숙 외 1명"
   */
  private parseAuthors(authorStr: string): string[] {
    if (!authorStr) return [];

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
    if (artlNum) {
      return `${this.baseUrl}/file/view?downOrView=pdf&schlrCmdtcode=${schlrCmdtcode}&artlNum=${artlNum}&mmbrId=external&termlDvsnCode=P`;
    }
    return `${this.baseUrl}/article/external/detail/${this.schlrPoiNum}/${schlrCmdtcode}`;
  }
}

// Kyobo Scholar article response type
interface KyoboArticle {
  SCHLR_CMDTCODE: string;
  ARTL_NAME: string;
  ARTL_ENSN_NAME?: string;
  ARTL_AUTR_HNGL_NAME: string;
  ARTL_NUM: string;
  ISSU_YR: string;
  PUBC_VLM_NAME: string;
  PUBC_NUMB_NAME: string;
  PUBC_VLM_NUMB_NUM: string;
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
