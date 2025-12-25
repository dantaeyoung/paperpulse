# Direct Journal Scraper: 한국상담학회지

## Goal

Build a **direct scraper** for 한국상담학회지 (Korean Counseling Association) from counselors.or.kr that:
- Scrapes all articles from 2022-2025 (last 3 years, ~18 issues, ~200 articles)
- Downloads PDFs and extracts full text
- Stores in database for local keyword matching
- Later expand to 2018+ and add more journals

## User Requirements

| Requirement | Decision |
|-------------|----------|
| Journals | Start with 한국상담학회지 only, add 가족치료학회지 later |
| Time range | Last 3 years (2022-2025), expand to 2018+ eventually |
| PDF handling | Download + extract text with pdf-parse, discard PDF files |
| PDF storage | Text only in Supabase `full_text` column (~135MB) |
| Keyword matching | Match in title + abstract + full text (broad) |
| Initial backfill | Run locally (no timeout limits) |
| Ongoing updates | Vercel cron (chunked, 1-2 articles per run) |

## Why Direct Scraping is Better

| Aspect | KCI Search | Direct Scraping |
|--------|------------|-----------------|
| Relevance | Returns papers from all fields | Only target journal papers |
| Coverage | May miss recent issues | Gets all issues directly |
| PDF Access | No direct PDF | Can download & extract text |
| Reliability | Depends on KCI indexing | Direct from source |

## 한국상담학회지 Website Structure

```
Base URL: https://counselors.or.kr

Issue List: /KOR/journal/journal_year.php
  - Years: 2025 down to 1999
  - Each issue has a unique catcode

Article List: /KOR/journal/journal.php?ptype=list&catcode=[NUM]&lnb2=1
  - catcode=137 → Volume 26, Issue 5 (2025)
  - catcode=133 → Volume 26, Issue 1 (2025)
  - ~12 articles per issue

PDF Download: /admin/journal/down.php?idx=[idx]
  - Direct PDF download by article idx
```

**Catcode mapping (2022-2025):**
- 2025: catcode 133-137 (5 issues so far)
- 2024: catcode 127-132 (6 issues)
- 2023: catcode 121-126 (6 issues)
- 2022: catcode 115-120 (6 issues)
- Total: ~23 issues, ~270 articles

## Database Schema (Existing)

Papers table already supports what we need:
```sql
papers (
  source_id,        -- Link to journal source
  external_id,      -- Article idx from journal
  title,
  authors,          -- JSON array
  abstract,
  full_text,        -- Extracted PDF text
  url,              -- Article page URL
  journal_name,
  volume,
  issue,
  pages,
  published_at,
  collected_at
)
```

## Implementation Plan

### Files to Create/Modify

```
src/lib/scrapers/
├── journal-base.ts     # NEW: Base class + shared utilities
├── counselors.ts       # NEW: 한국상담학회지 scraper (extends base)
├── familytherapy.ts    # FUTURE: 한국가족치료학회지 scraper
└── pdf-extract.ts      # NEW: PDF text extraction utility

src/app/api/test/
└── scrape-journal/route.ts  # NEW: Generic test endpoint (works with any journal)

src/app/api/cron/
└── collect/route.ts    # MODIFY: Add journal scraper support
```

### Reusable Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    JournalScraper (base)                │
│  ─────────────────────────────────────────────────────  │
│  + delay(ms): Promise<void>         // Rate limiting    │
│  + fetchWithRetry(url): Promise     // Retry logic      │
│  + extractPdfText(buffer): string   // PDF parsing      │
│  + saveArticles(articles): void     // DB storage       │
│  ─────────────────────────────────────────────────────  │
│  abstract getIssues(): Issue[]      // Each journal     │
│  abstract parseArticles(html): Article[]  // implements │
│  abstract getPdfUrl(id): string     // these            │
└─────────────────────────────────────────────────────────┘
           ▲                              ▲
           │                              │
┌──────────┴──────────┐      ┌───────────┴───────────┐
│  CounselorsScraper  │      │  FamilyTherapyScraper │
│  ──────────────────  │      │  ───────────────────  │
│  baseUrl: counselors │      │  baseUrl: familyth..  │
│  parseArticles(...)  │      │  parseArticles(...)   │
│  getPdfUrl(idx)      │      │  getPdfUrl(idx)       │
└─────────────────────┘      └───────────────────────┘
```

**What's reusable (in base class):**
- Rate limiting (1 sec delay between requests)
- Retry logic (3 attempts with backoff)
- PDF text extraction
- Database storage
- Error handling & logging
- Progress tracking

**What each journal implements:**
- `baseUrl` - The journal's website
- `getIssues(yearRange)` - Parse issue list page
- `parseArticles(html)` - Extract articles from issue page
- `getPdfUrl(articleId)` - Build PDF download URL

### Step 1: Install pdf-parse

```bash
npm install pdf-parse
npm install -D @types/pdf-parse
```

### Step 2: Create Base Class

File: `src/lib/scrapers/journal-base.ts`

```typescript
import pdfParse from 'pdf-parse';

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

  // Each journal implements these
  abstract getIssues(startYear: number, endYear: number): Promise<JournalIssue[]>;
  abstract parseArticlesFromIssue(issueId: string): Promise<JournalArticle[]>;
  abstract getPdfUrl(articleId: string): string;

  // Shared utilities (inherited by all scrapers)
  protected async delay(ms: number = 1000): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  protected async fetchWithRetry(url: string, retries = 3): Promise<Response> {
    for (let i = 0; i < retries; i++) {
      try {
        const res = await fetch(url);
        if (res.ok) return res;
      } catch (err) {
        if (i === retries - 1) throw err;
        await this.delay(1000 * (i + 1)); // Exponential backoff
      }
    }
    throw new Error(`Failed to fetch ${url} after ${retries} attempts`);
  }

  protected async extractPdfText(buffer: Buffer): Promise<string> {
    const data = await pdfParse(buffer);
    return data.text;
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

    onProgress(`Found ${issues.length} issues to process`);

    for (const issue of issues) {
      onProgress(`Processing ${this.name} Vol.${issue.volume} No.${issue.issue}`);
      await this.delay();

      const issueArticles = await this.parseArticlesFromIssue(issue.id);

      for (const article of issueArticles) {
        if (extractText && article.pdfUrl) {
          try {
            const res = await this.fetchWithRetry(article.pdfUrl);
            const buffer = Buffer.from(await res.arrayBuffer());
            article.extractedText = await this.extractPdfText(buffer);
            onProgress(`  ✓ ${article.title.substring(0, 40)}...`);
          } catch (err) {
            onProgress(`  ✗ PDF failed: ${article.title.substring(0, 40)}...`);
          }
          await this.delay();
        }
        articles.push(article);
      }
    }

    return articles;
  }
}

// Registry of all journal scrapers
const scraperRegistry: Record<string, () => JournalScraperBase> = {};

export function registerScraper(key: string, factory: () => JournalScraperBase) {
  scraperRegistry[key] = factory;
}

export function getScraper(key: string): JournalScraperBase | null {
  return scraperRegistry[key]?.() || null;
}

export function getAllScrapers(): string[] {
  return Object.keys(scraperRegistry);
}
```

### Step 3: Create 한국상담학회지 Scraper

File: `src/lib/scrapers/counselors.ts`

```typescript
import { JournalScraperBase, JournalArticle, JournalIssue, registerScraper } from './journal-base';

class CounselorsScraper extends JournalScraperBase {
  readonly name = '한국상담학회지';
  readonly baseUrl = 'https://counselors.or.kr';

  // Catcode ranges by year (discovered from website)
  private catcodeRanges: Record<number, [number, number]> = {
    2025: [133, 137],
    2024: [127, 132],
    2023: [121, 126],
    2022: [115, 120],
    2021: [109, 114],
    2020: [103, 108],
    2019: [97, 102],
    2018: [91, 96],
  };

  async getIssues(startYear: number, endYear: number): Promise<JournalIssue[]> {
    const issues: JournalIssue[] = [];
    for (let year = startYear; year <= endYear; year++) {
      const range = this.catcodeRanges[year];
      if (!range) continue;

      for (let catcode = range[0]; catcode <= range[1]; catcode++) {
        issues.push({
          id: String(catcode),
          volume: String(year - 1999),  // Volume = year - 1999
          issue: String(catcode - range[0] + 1),
          year: String(year),
        });
      }
    }
    return issues;
  }

  async parseArticlesFromIssue(catcode: string): Promise<JournalArticle[]> {
    const url = `${this.baseUrl}/KOR/journal/journal.php?ptype=list&catcode=${catcode}&lnb2=1`;
    const res = await this.fetchWithRetry(url);
    const html = await res.text();

    // Parse HTML to extract articles
    // (Implementation depends on actual HTML structure)
    const articles: JournalArticle[] = [];

    // Example parsing logic - adjust based on actual HTML
    const articleRegex = /go_popup\('(\d+)'\).*?<[^>]*>([^<]+)/g;
    let match;
    while ((match = articleRegex.exec(html)) !== null) {
      articles.push({
        id: match[1],
        title: match[2].trim(),
        authors: [],  // Parse from HTML
        year: '', // Will be set from issue
        url: `${this.baseUrl}/KOR/journal/journal.php?ptype=view&idx=${match[1]}`,
        pdfUrl: this.getPdfUrl(match[1]),
      });
    }

    return articles;
  }

  getPdfUrl(articleId: string): string {
    return `${this.baseUrl}/admin/journal/down.php?idx=${articleId}`;
  }
}

// Register this scraper
let instance: CounselorsScraper | null = null;
registerScraper('counselors', () => {
  if (!instance) instance = new CounselorsScraper();
  return instance;
});

export function getCounselorsScraper(): CounselorsScraper {
  if (!instance) instance = new CounselorsScraper();
  return instance;
}
```

### Adding a New Journal (Future)

To add 한국가족치료학회지, just create a new file:

File: `src/lib/scrapers/familytherapy.ts`

```typescript
import { JournalScraperBase, registerScraper } from './journal-base';

class FamilyTherapyScraper extends JournalScraperBase {
  readonly name = '한국가족치료학회지';
  readonly baseUrl = 'https://familytherapy.or.kr';

  // Implement these 3 methods based on the website structure
  async getIssues(startYear, endYear) { /* ... */ }
  async parseArticlesFromIssue(issueId) { /* ... */ }
  getPdfUrl(articleId) { /* ... */ }
}

registerScraper('familytherapy', () => new FamilyTherapyScraper());
```

That's it! The base class handles rate limiting, retries, PDF extraction, and the collection loop.

### Step 4: Create Generic Test Endpoint

File: `src/app/api/test/scrape-journal/route.ts`

```typescript
import { getScraper, getAllScrapers } from '@/lib/scrapers/journal-base';

// Works with any registered journal scraper
GET /api/test/scrape-journal
  → List all registered scrapers: ["counselors", "familytherapy"]

GET /api/test/scrape-journal?scraper=counselors
  → List issues for 한국상담학회지

GET /api/test/scrape-journal?scraper=counselors&issue=137
  → Scrape articles from one issue

GET /api/test/scrape-journal?scraper=counselors&issue=137&extract=true
  → Scrape + extract PDF text

GET /api/test/scrape-journal?scraper=counselors&year=2024&save=true
  → Collect all 2024 articles and save to DB
```

The endpoint automatically works with any journal once you register a new scraper.

### Step 5: Create Source in Database

Add a source record for the journal:
```sql
INSERT INTO sources (name, type, is_active, is_global, config)
VALUES (
  '한국상담학회지',
  'journal',
  true,
  true,
  '{"scraper": "counselors", "startYear": 2022}'
);
```

### Step 6: Update Collection Flow

Modify `src/app/api/cron/collect/route.ts`:
```typescript
import { getCounselorsScraper } from '@/lib/scrapers/counselors';

// In the collection loop, check for journal-type sources
if (source.type === 'journal' && source.config?.scraper === 'counselors') {
  const scraper = getCounselorsScraper();
  const articles = await scraper.collectAll({
    startYear: source.config.startYear || 2022,
    extractText: true,
  });

  // Save articles to papers table
  for (const article of articles) {
    await supabase.from('papers').upsert({
      source_id: source.id,
      external_id: article.idx,
      title: article.title,
      authors: article.authors.map(name => ({ name })),
      full_text: article.extractedText,
      url: article.url,
      journal_name: '한국상담학회지',
      volume: article.volume,
      issue: article.issue,
      pages: article.pages,
      published_at: `${article.year}-01-01`,
    }, { onConflict: 'source_id,external_id' });
  }
}
```

### Step 7: Update Keyword Matching

The existing digest flow already matches keywords in title/abstract.
Update to also search `full_text`:

```typescript
// In api/cron/digest/route.ts
const scoredPapers = allPapers.map(paper => {
  let score = 0;
  const titleLower = (paper.title || '').toLowerCase();
  const abstractLower = (paper.abstract || '').toLowerCase();
  const fullTextLower = (paper.full_text || '').toLowerCase();

  for (const kw of keywords) {
    const kwLower = kw.toLowerCase();
    if (titleLower.includes(kwLower)) score += 3;
    if (abstractLower.includes(kwLower)) score += 2;
    if (fullTextLower.includes(kwLower)) score += 1;
  }
  return { ...paper, relevanceScore: score };
});
```

## Execution Order

1. **Install dependencies** - `npm install pdf-parse`
2. **Create PDF utility** - `src/lib/scrapers/pdf-extract.ts`
3. **Create scraper** - `src/lib/scrapers/counselors.ts`
4. **Create test endpoint** - Test scraping works
5. **Add source to DB** - Via Supabase dashboard or migration
6. **Update collection flow** - Integrate scraper
7. **Update keyword matching** - Include full_text in search
8. **Test end-to-end** - Run collection and verify papers saved

## Storage Estimate

- ~270 articles (2022-2025)
- Average PDF: ~500KB text extracted
- Total: ~135MB in full_text column
- Within Supabase free tier (500MB)

## Processing Architecture

### Initial Backfill (Local)
```bash
# Run from your machine - no timeout limits
npm run scrape:backfill
# Or via API: curl http://localhost:3000/api/test/scrape-counselors?collect=all
```
- Processes all ~270 articles from 2022-2025
- Takes ~30-45 minutes (1 sec delay between requests)
- Run once, then switch to Vercel cron

### Ongoing Updates (Vercel Cron)
```typescript
// vercel.json
{
  "crons": [{
    "path": "/api/cron/collect-journal",
    "schedule": "0 9 * * 1"  // Weekly on Monday 9am UTC
  }]
}
```
- Checks for new issues since last collection
- Processes 1-2 new articles per run (within 10s timeout)
- Re-runs until all new articles processed

## Future Expansion

After this works:
1. Add 2018-2021 articles (~240 more)
2. Add 한국가족치료학회지 scraper
3. Improve cron to handle larger batches if needed
