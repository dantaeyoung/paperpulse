# Architecture Guide

Technical architecture and design decisions for 논문 다이제스트.

## Table of Contents

1. [System Overview](#system-overview)
2. [Technology Stack](#technology-stack)
3. [Project Structure](#project-structure)
4. [Database Schema](#database-schema)
5. [Core Components](#core-components)
6. [Data Flow](#data-flow)
7. [API Reference](#api-reference)
8. [Extending the System](#extending-the-system)

---

## System Overview

논문 다이제스트 is a full-stack application that:

1. **Scrapes** Korean academic journals for papers
2. **Extracts** full text from PDFs
3. **Generates** AI summaries using Gemini/OpenAI
4. **Delivers** personalized weekly digests via email
5. **Provides** issue-level trend analysis with citations

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Layer                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐ │
│  │  Home    │  │  Issue   │  │  Papers  │  │ User Dashboard   │ │
│  │  Page    │  │  Browser │  │  Table   │  │ /u/[token]       │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       API Layer (Next.js)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ /api/cron/*  │  │ /api/issues/*│  │ /api/users/[token]/* │   │
│  │ collect      │  │ summary      │  │ keywords, journals   │   │
│  │ digest       │  │ stream       │  │ settings             │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Service Layer                               │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌───────────┐  │
│  │  Scrapers  │  │ AI Provider│  │   Email    │  │  Supabase │  │
│  │ counselors │  │ Gemini     │  │  Resend    │  │  Client   │  │
│  │ kci-web    │  │ OpenAI     │  │            │  │           │  │
│  └────────────┘  └────────────┘  └────────────┘  └───────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    External Services                             │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌───────────┐  │
│  │  Journal   │  │  Google    │  │   Resend   │  │  Supabase │  │
│  │  Websites  │  │  Gemini    │  │   SMTP     │  │  Postgres │  │
│  └────────────┘  └────────────┘  └────────────┘  └───────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

### Frontend

| Technology | Purpose |
|------------|---------|
| **Next.js 14** | React framework with App Router |
| **React 18** | UI components |
| **Tailwind CSS** | Styling |
| **react-markdown** | Markdown rendering |

### Backend

| Technology | Purpose |
|------------|---------|
| **Next.js API Routes** | REST API endpoints |
| **Server Components** | Server-side rendering |
| **Server Actions** | Form handling |

### Database

| Technology | Purpose |
|------------|---------|
| **Supabase** | Managed PostgreSQL |
| **JSONB columns** | Flexible schema for authors, config |

### External Services

| Service | Purpose |
|---------|---------|
| **Google Gemini** | Primary AI provider (free tier) |
| **OpenAI** | Fallback AI provider |
| **Resend** | Transactional email |
| **Vercel** | Hosting + cron jobs |

### Libraries

| Library | Purpose |
|---------|---------|
| `unpdf` | PDF text extraction |
| `@google/generative-ai` | Gemini SDK |
| `openai` | OpenAI SDK |
| `resend` | Email SDK |
| `@supabase/supabase-js` | Database client |

---

## Project Structure

```
article-summarizer/
├── src/
│   ├── app/                      # Next.js App Router
│   │   ├── api/                  # API Routes
│   │   │   ├── cron/             # Scheduled jobs
│   │   │   │   ├── collect/      # Paper collection
│   │   │   │   └── digest/       # Email digest sending
│   │   │   ├── issues/           # Issue summary endpoints
│   │   │   │   └── [scraper]/[issueId]/
│   │   │   │       └── summary/
│   │   │   │           ├── route.ts      # GET/POST summary
│   │   │   │           └── stream/       # SSE streaming
│   │   │   ├── journals/         # Journal listing
│   │   │   ├── test/             # Admin/debug endpoints
│   │   │   └── users/            # User management
│   │   │       └── [token]/
│   │   │           ├── keywords/
│   │   │           ├── journals/
│   │   │           └── summaries/
│   │   ├── issues/               # Issue browser UI
│   │   │   └── [scraper]/[issueId]/
│   │   ├── test/                 # Admin pages
│   │   │   └── papers/           # Papers table
│   │   ├── u/                    # User pages
│   │   │   └── [token]/
│   │   │       ├── keywords/
│   │   │       ├── sources/
│   │   │       └── settings/
│   │   ├── page.tsx              # Home page
│   │   ├── layout.tsx            # Root layout
│   │   └── globals.css           # Global styles
│   │
│   ├── components/               # Reusable components
│   │   └── PaperDetailModal.tsx  # Paper preview modal
│   │
│   └── lib/                      # Core libraries
│       ├── ai/
│       │   ├── provider.ts       # AI provider abstraction
│       │   └── issue-summary.ts  # Issue trend analysis
│       ├── email/
│       │   └── resend.ts         # Email service
│       ├── scrapers/
│       │   ├── journal-base.ts   # Base scraper class
│       │   ├── counselors.ts     # 한국상담학회지 scraper
│       │   ├── kci-web.ts        # KCI web scraper
│       │   └── openalex.ts       # OpenAlex API scraper
│       └── supabase/
│           ├── client.ts         # Supabase client
│           └── types.ts          # TypeScript types
│
├── supabase/
│   └── migrations/               # Database migrations
│       ├── 001_initial_schema.sql
│       ├── 002_journal_picker_model.sql
│       ├── 003_issue_cache.sql
│       ├── 004_issue_summaries.sql
│       └── 005_add_citation_map.sql
│
├── specs/                        # Feature specifications
├── vercel.json                   # Vercel config (crons)
└── package.json
```

---

## Database Schema

### Entity Relationship Diagram

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│   users     │       │  keywords   │       │user_journals│
├─────────────┤       ├─────────────┤       ├─────────────┤
│ id (PK)     │◄──────│ user_id(FK) │       │ user_id(FK) │──────┐
│ token       │       │ keyword     │       │ source_id   │──┐   │
│ email       │       │ is_active   │       └─────────────┘  │   │
│ name        │       └─────────────┘                        │   │
│ field_context│                                             │   │
│ digest_day  │       ┌─────────────┐                        │   │
│ digest_hour │       │  summaries  │                        │   │
└─────────────┘       ├─────────────┤       ┌─────────────┐  │   │
      │               │ paper_id(FK)│──────►│   papers    │  │   │
      │               │ user_id(FK) │       ├─────────────┤  │   │
      └──────────────►│ content     │       │ id (PK)     │  │   │
                      │ model       │       │ source_id   │◄─┼───┘
                      └─────────────┘       │ external_id │  │
                                            │ title       │  │
┌─────────────┐                             │ authors     │  │
│issue_summaries│                           │ abstract    │  │
├─────────────┤                             │ full_text   │  │
│ scraper_key │                             │ url         │  │
│ issue_id    │                             │ journal_name│  │
│ summary_content│                          └─────────────┘  │
│ extractions │                                   ▲          │
│ citation_map│                                   │          │
│ user_id(FK) │       ┌─────────────┐            │          │
└─────────────┘       │   sources   │────────────┴──────────┘
                      ├─────────────┤
┌─────────────┐       │ id (PK)     │
│ issue_cache │       │ type        │
├─────────────┤       │ name        │
│ scraper_key │       │ url         │
│ issue_id    │       │ config      │
│ journal_name│       │ is_global   │
│ issue_info  │       └─────────────┘
│ articles    │
└─────────────┘
```

### Table Details

#### `users`
Subscriber accounts with personalization settings.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `token` | VARCHAR(32) | Unique access token for dashboard |
| `email` | VARCHAR(255) | Email for digest delivery |
| `name` | VARCHAR(100) | Display name |
| `field_context` | VARCHAR(200) | Research field for AI context |
| `digest_day` | SMALLINT | Day of week (0=Sun, 6=Sat) |
| `digest_hour` | SMALLINT | Hour in KST (0-23) |
| `is_active` | BOOLEAN | Account active status |

#### `papers`
Collected academic papers with full text.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `source_id` | UUID | FK to sources |
| `external_id` | VARCHAR(255) | ID from source system |
| `title` | VARCHAR(500) | Paper title |
| `authors` | JSONB | Array of {name, affiliation} |
| `abstract` | TEXT | Paper abstract |
| `full_text` | TEXT | Extracted PDF text |
| `journal_name` | VARCHAR(200) | Journal name |
| `volume`, `issue`, `pages` | VARCHAR | Publication info |

#### `issue_summaries`
AI-generated issue trend analysis.

| Column | Type | Description |
|--------|------|-------------|
| `scraper_key` | VARCHAR(50) | Scraper identifier |
| `issue_id` | VARCHAR(100) | Issue identifier |
| `summary_content` | TEXT | Generated summary |
| `extractions` | JSONB | Per-paper AI extractions |
| `citation_map` | JSONB | Citation number → paper mapping |
| `paper_count` | INTEGER | Papers analyzed |
| `model_extraction` | VARCHAR(50) | Model used for extraction |
| `model_synthesis` | VARCHAR(50) | Model used for synthesis |

#### `issue_cache`
Cached journal issue metadata (issues don't change after publication).

| Column | Type | Description |
|--------|------|-------------|
| `scraper_key` | VARCHAR(50) | Scraper identifier |
| `issue_id` | VARCHAR(50) | Issue identifier |
| `journal_name` | VARCHAR(200) | Journal name |
| `issue_info` | JSONB | {year, volume, issue} |
| `articles` | JSONB | Array of article metadata |

---

## Core Components

### 1. Journal Scrapers

Located in `src/lib/scrapers/`, scrapers collect papers from academic journals.

#### Base Class

```typescript
// src/lib/scrapers/journal-base.ts
abstract class JournalScraperBase {
  abstract readonly name: string;        // e.g., '한국상담학회지'
  abstract readonly baseUrl: string;     // e.g., 'https://counselors.or.kr'
  abstract readonly scraperKey: string;  // e.g., 'counselors'

  // Required implementations
  abstract getIssues(startYear: number, endYear: number): Promise<JournalIssue[]>;
  abstract parseArticlesFromIssue(issueId: string, info: JournalIssue): Promise<JournalArticle[]>;
  abstract getPdfUrl(articleId: string): string;

  // Inherited utilities
  protected async delay(ms: number): Promise<void>;
  protected async fetchWithRetry(url: string, retries?: number): Promise<Response>;
  protected async extractPdfText(buffer: Buffer): Promise<string>;

  // Main collection method
  async collectAll(options: CollectOptions): Promise<JournalArticle[]>;
  async collectIssue(issueId: string, options: CollectOptions): Promise<JournalArticle[]>;
}
```

#### Scraper Registry

```typescript
// Register a scraper
registerScraper('counselors', () => new CounselorsScraper());

// Get a scraper
const scraper = getScraper('counselors');

// List all scrapers
const keys = getAllScraperKeys(); // ['counselors']
```

### 2. AI Provider

Located in `src/lib/ai/provider.ts`, abstracts AI model access.

```typescript
interface AIProvider {
  summarize(text: string, fieldContext?: string): Promise<string>;
  getModelName(): string;
}

// Auto-selects based on available API keys
const ai = getAIProvider();
const summary = await ai.summarize(paperText, 'counseling psychology');
```

**Provider Selection:**
1. If `AI_PROVIDER=gemini` → Use Gemini only
2. If `AI_PROVIDER=openai` → Use OpenAI only
3. If `AI_PROVIDER=auto` (default) → Try Gemini first, fall back to OpenAI

### 3. Issue Summary Service

Located in `src/lib/ai/issue-summary.ts`, generates issue trend analysis.

```typescript
const service = getIssueSummaryService();

// Generate summary for an issue
const result = await service.generateIssueSummary(
  papers,           // Array of {id, title, text}
  journalName,      // '한국상담학회지'
  issueInfo,        // '25권 2호 (2024)'
  customPrompt,     // Optional custom instructions
  fieldContext      // Optional user's field context
);

// Result includes:
// - summary: Generated text with citations [1][2][3]
// - extractions: Per-paper structured data
// - citationMap: {1: {paper_id, title}, 2: {...}}
// - statistics: Methodology breakdown, sample sizes, etc.
```

**Two-Phase Generation:**
1. **Extraction Phase**: Extract structured data from each paper (methodology, sample size, key findings)
2. **Synthesis Phase**: Generate cohesive summary referencing papers by citation number

### 4. Email Service

Located in `src/lib/email/resend.ts`, sends digest emails.

```typescript
await sendDigestEmail({
  user: { name, email, token },
  summaries: [
    { paper: { title, url, authors, ... }, summary: { content } },
    ...
  ]
});
```

---

## Data Flow

### 1. Paper Collection Flow

```
Vercel Cron (21:00 daily)
         │
         ▼
┌─────────────────┐
│ /api/cron/collect│
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│ Get active      │────►│ Get active      │
│ sources         │     │ keywords        │
└────────┬────────┘     └────────┬────────┘
         │                       │
         ▼                       ▼
┌─────────────────────────────────────────┐
│ For each source:                         │
│  1. Check if direct scraper configured   │
│  2. Use journal scraper OR KCI/OpenAlex  │
│  3. Extract PDF text if available        │
│  4. Upsert papers to database            │
└─────────────────────────────────────────┘
```

### 2. Digest Email Flow

```
Vercel Cron (22:00 daily)
         │
         ▼
┌─────────────────┐
│ /api/cron/digest │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│ Find users where:                        │
│   digest_day = current_day              │
│   digest_hour = current_hour            │
│   is_active = true                      │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│ For each user:                           │
│  1. Get user's keywords                  │
│  2. Get user's selected journals         │
│  3. Find papers from last 7 days         │
│  4. Score by keyword relevance           │
│  5. Generate AI summaries (if needed)    │
│  6. Send email via Resend                │
│  7. Log email status                     │
└─────────────────────────────────────────┘
```

### 3. Issue Summary Flow

```
User clicks "Generate Summary"
         │
         ▼
┌─────────────────────────────────────────┐
│ POST /api/issues/[scraper]/[id]/summary │
│           OR                             │
│ GET .../summary/stream (SSE)            │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│ 1. Get issue from cache                  │
│ 2. Get papers with full_text             │
│ 3. Phase 1: Extract each paper           │
│    - Methodology, sample size, findings  │
│ 4. Compute statistics                    │
│ 5. Phase 2: Synthesize summary           │
│    - Include citations [1][2][3]         │
│ 6. Save to issue_summaries table         │
│ 7. Return summary + citation map         │
└─────────────────────────────────────────┘
```

---

## API Reference

### Cron Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/cron/collect` | GET/POST | CRON_SECRET | Collect papers from sources |
| `/api/cron/digest` | GET/POST | CRON_SECRET | Send email digests |

### Issue Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/issues/[scraper]/[issueId]/summary` | GET | Get existing summary |
| `/api/issues/[scraper]/[issueId]/summary` | POST | Generate new summary |
| `/api/issues/[scraper]/[issueId]/summary` | OPTIONS | Get default prompt |
| `/api/issues/[scraper]/[issueId]/summary/stream` | POST | Generate with SSE streaming |

### User Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/users/[token]` | GET | Get user profile |
| `/api/users/[token]` | PUT | Update user settings |
| `/api/users/[token]/keywords` | GET/POST | List/add keywords |
| `/api/users/[token]/keywords/[id]` | PUT/DELETE | Update/delete keyword |
| `/api/users/[token]/journals` | GET | List journals with selection |
| `/api/users/[token]/journals/[id]` | PUT | Toggle journal selection |

### Admin Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/journals` | GET | List all journals with stats |
| `/api/test/papers` | GET | List papers (paginated) |
| `/api/test/all-papers` | GET | List all papers |
| `/api/test/paper/[id]` | GET | Get paper detail |
| `/api/test/paper/[id]/scrape` | POST | Scrape single paper PDF |
| `/api/test/issue-articles` | GET | Get articles for an issue |
| `/api/test/scrape-all` | POST | Start bulk scraping |
| `/api/test/scrape-all/cancel` | POST | Cancel bulk scraping |

---

## Extending the System

### Adding a New Journal Scraper

1. **Create scraper file** in `src/lib/scrapers/`:

```typescript
// src/lib/scrapers/my-journal.ts
import {
  JournalScraperBase,
  JournalArticle,
  JournalIssue,
  registerScraper
} from './journal-base';

class MyJournalScraper extends JournalScraperBase {
  readonly name = '새 학술지';
  readonly baseUrl = 'https://example.com';
  readonly scraperKey = 'my-journal';

  async getIssues(startYear: number, endYear: number): Promise<JournalIssue[]> {
    // Fetch list of issues from journal website
    // Return array of {id, year, volume, issue}
  }

  async parseArticlesFromIssue(
    issueId: string,
    issueInfo: JournalIssue
  ): Promise<JournalArticle[]> {
    // Fetch and parse articles from issue page
    // Return array of {id, title, authors, url, pdfUrl, ...}
  }

  getPdfUrl(articleId: string): string {
    // Return PDF download URL for article
    return `${this.baseUrl}/pdf/${articleId}`;
  }
}

// Register the scraper
registerScraper('my-journal', () => new MyJournalScraper());
```

2. **Import in API routes** where needed:

```typescript
// In relevant API files
import '@/lib/scrapers/my-journal';
```

3. **Add source to database**:

```sql
INSERT INTO sources (type, name, url, is_global, is_active, config)
VALUES (
  'journal',
  '새 학술지',
  'https://example.com',
  true,
  true,
  '{"scraper": "my-journal"}'
);
```

### Adding a New AI Provider

1. **Implement the interface** in `src/lib/ai/provider.ts`:

```typescript
class MyProvider implements AIProvider {
  async summarize(text: string, fieldContext?: string): Promise<string> {
    // Call your AI service
  }

  getModelName(): string {
    return 'my-model-name';
  }
}
```

2. **Add to getAIProvider()**:

```typescript
export function getAIProvider(): AIProvider {
  const provider = process.env.AI_PROVIDER || 'auto';

  switch (provider) {
    case 'my-provider':
      return new MyProvider();
    // ... existing cases
  }
}
```

### Customizing Email Templates

Edit `src/lib/email/resend.ts`:

```typescript
function generateEmailHTML(data: DigestData): string {
  // Modify HTML template
  return `<!DOCTYPE html>...`;
}
```

### Adding New Cron Jobs

1. **Create API route** in `src/app/api/cron/`:

```typescript
// src/app/api/cron/my-job/route.ts
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Your job logic
}
```

2. **Add to vercel.json**:

```json
{
  "crons": [
    { "path": "/api/cron/my-job", "schedule": "0 12 * * *" }
  ]
}
```
