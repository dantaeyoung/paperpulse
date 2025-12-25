# Academic Paper Digest - Technical Specification

## 1. Overview

### 1.1 Purpose
A **field-agnostic** automated system to collect academic papers from Korean scholarly databases and journals, summarize them using AI, and deliver weekly email digests to subscribers. Users can configure any academic field, journals, and keywords.

### 1.2 Goals
- **Zero-cost operation** using free tiers of all services
- **Multi-user support** (~5 users) with personalized keywords and preferences
- **Automated weekly delivery** of paper summaries
- **Field-agnostic design** - works for any academic discipline
- **Flexible source management** - users add their own journals/sources

### 1.3 Initial Use Case
Korean family therapy and counseling journals (한국가족치료학회지, 한국상담학회지), but the architecture supports any field.

### 1.4 Non-Goals
- User authentication (using obfuscated URLs instead)
- Real-time notifications
- Mobile app
- Paper storage/archival

---

## 2. User Stories

### 2.1 Primary User: Academic Researcher/Practitioner
```
As an academic researcher or practitioner,
I want to receive weekly summaries of new papers in my field,
So that I can stay updated without manually checking multiple sources.
```

**Applicable to any field:** Family therapy, psychology, computer science, medicine, law, etc.

### 2.2 User Flows

#### Initial Setup (Admin creates user)
1. Admin generates unique token for new user
2. Admin sends user their personalized URL: `app.com/u/{token}`
3. User accesses URL and configures:
   - Their academic field (optional, for AI context)
   - Keywords to track
   - Sources (KCI, RISS, specific journals)
   - Email preferences (day/time)

#### Weekly Digest Flow
1. User receives email every week at their chosen time
2. Email contains summaries of papers matching their keywords
3. Each summary links to original paper

#### Dashboard Usage
1. User visits their URL
2. Views past summaries
3. Adds/removes keywords
4. Toggles sources on/off
5. Changes email schedule

---

## 3. Technical Architecture

### 3.1 System Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Vercel (Next.js)                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ /u/[token]   │  │ /api/cron/   │  │ /api/cron/digest         │  │
│  │ Dashboard UI │  │ collect      │  │ Summarize + Email        │  │
│  └──────────────┘  └──────┬───────┘  └────────────┬─────────────┘  │
│                           │                        │                 │
│  ┌────────────────────────┴────────────────────────┴─────────────┐  │
│  │                    Vercel Cron (vercel.json)                   │  │
│  │                    Daily 6AM, 12PM, 6PM KST                    │  │
│  └────────────────────────────────────────────────────────────────┘  │
└───────────────────────────┬────────────────────────┬─────────────────┘
                            │                        │
          ┌─────────────────┼────────────────────────┼───────────┐
          │                 ▼                        ▼           │
          │  ┌──────────────────────┐  ┌─────────────────────┐  │
          │  │ Scrapers             │  │ Gemini API          │  │
          │  │ - KCI                │  │ (Summarization)     │  │
          │  │ - RISS               │  └─────────────────────┘  │
          │  │ - Journal sites      │                           │
          │  └──────────────────────┘  ┌─────────────────────┐  │
          │                            │ Resend              │  │
          │                            │ (Email Delivery)    │  │
          │                            └─────────────────────┘  │
          └─────────────────────────────────────────────────────┘
                            │
                            ▼
          ┌─────────────────────────────────────────────────────┐
          │                    Supabase                          │
          │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌───────────┐  │
          │  │ users   │ │keywords │ │ sources │ │  papers   │  │
          │  └─────────┘ └─────────┘ └─────────┘ └───────────┘  │
          │  ┌──────────┐ ┌────────────┐                        │
          │  │summaries │ │ email_logs │                        │
          │  └──────────┘ └────────────┘                        │
          └─────────────────────────────────────────────────────┘
```

### 3.2 Technology Stack

| Component | Technology | Justification |
|-----------|------------|---------------|
| Frontend + API | Next.js 14 (App Router) | SSR, API routes, Vercel optimized |
| Styling | Tailwind CSS | Rapid UI development |
| Database | Supabase (PostgreSQL) | Free tier, real-time, type generation |
| AI | Gemini API | Free tier (60 RPM), Korean support |
| Email | Resend | Free tier (3K/month), simple API |
| Hosting + Cron | Vercel | Free tier, auto-deploy, built-in cron |
| Language | TypeScript | Type safety, better DX |

**Total services: 4** (Vercel, Supabase, Gemini, Resend)

---

## 4. Data Models

### 4.1 Database Schema

```sql
-- Users: Each user has a unique access token
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token VARCHAR(32) UNIQUE NOT NULL,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(100),
  field_context VARCHAR(200),                -- e.g., "가족치료 및 상담", "컴퓨터 공학" (optional, for AI prompt)
  digest_day SMALLINT DEFAULT 1 CHECK (digest_day BETWEEN 0 AND 6),
  digest_hour SMALLINT DEFAULT 9 CHECK (digest_hour BETWEEN 0 AND 23),
  timezone VARCHAR(50) DEFAULT 'Asia/Seoul',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Keywords: User's search terms
CREATE TABLE keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  keyword VARCHAR(100) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, keyword)
);

-- Sources: Paper sources (KCI, RISS, journals)
CREATE TABLE sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL CHECK (type IN ('kci', 'riss', 'journal', 'custom')),
  name VARCHAR(100) NOT NULL,
  url VARCHAR(500),
  config JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  is_global BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Papers: Collected papers (global, not per-user)
CREATE TABLE papers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  external_id VARCHAR(255) NOT NULL,
  title VARCHAR(500) NOT NULL,
  title_en VARCHAR(500),
  authors JSONB DEFAULT '[]',
  abstract TEXT,
  abstract_en TEXT,
  full_text TEXT,
  url VARCHAR(500) NOT NULL,
  doi VARCHAR(100),
  journal_name VARCHAR(200),
  volume VARCHAR(20),
  issue VARCHAR(20),
  pages VARCHAR(50),
  published_at DATE,
  collected_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source_id, external_id)
);

-- Summaries: AI-generated summaries (per user for personalization)
CREATE TABLE summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_id UUID NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  model VARCHAR(50) DEFAULT 'gemini-1.5-flash',
  tokens_used INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(paper_id, user_id)
);

-- Email Logs: Track sent emails
CREATE TABLE email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  paper_count INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  error_message TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_papers_published_at ON papers(published_at DESC);
CREATE INDEX idx_papers_source_id ON papers(source_id);
CREATE INDEX idx_keywords_user_id ON keywords(user_id);
CREATE INDEX idx_summaries_user_paper ON summaries(user_id, paper_id);
```

### 4.2 TypeScript Types

```typescript
interface User {
  id: string;
  token: string;
  email: string;
  name: string | null;
  field_context: string | null; // User's academic field for AI context
  digest_day: number; // 0=Sun, 1=Mon, ..., 6=Sat
  digest_hour: number; // 0-23
  timezone: string;
  is_active: boolean;
  created_at: string;
}

interface Keyword {
  id: string;
  user_id: string;
  keyword: string;
  is_active: boolean;
}

interface Source {
  id: string;
  user_id: string | null;
  type: 'kci' | 'riss' | 'journal' | 'custom';
  name: string;
  url: string | null;
  config: Record<string, unknown>;
  is_active: boolean;
  is_global: boolean;
}

interface Paper {
  id: string;
  source_id: string;
  external_id: string;
  title: string;
  title_en: string | null;
  authors: { name: string; affiliation?: string }[];
  abstract: string | null;
  abstract_en: string | null;
  full_text: string | null;
  url: string;
  doi: string | null;
  journal_name: string | null;
  volume: string | null;
  issue: string | null;
  pages: string | null;
  published_at: string | null;
  collected_at: string;
}

interface Summary {
  id: string;
  paper_id: string;
  user_id: string;
  content: string;
  model: string;
  tokens_used: number | null;
  created_at: string;
}
```

---

## 5. API Specification

### 5.1 User Dashboard APIs

#### GET /api/users/[token]
Get user profile and settings.

**Response:**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "홍길동",
    "digest_day": 1,
    "digest_hour": 9,
    "timezone": "Asia/Seoul"
  }
}
```

#### PATCH /api/users/[token]
Update user settings.

**Request:**
```json
{
  "name": "홍길동",
  "digest_day": 5,
  "digest_hour": 17,
  "timezone": "Asia/Seoul"
}
```

### 5.2 Keywords APIs

#### GET /api/users/[token]/keywords
List user's keywords.

**Response:**
```json
{
  "keywords": [
    { "id": "uuid", "keyword": "가족치료", "is_active": true },
    { "id": "uuid", "keyword": "부부상담", "is_active": true }
  ]
}
```

#### POST /api/users/[token]/keywords
Add new keyword.

**Request:**
```json
{ "keyword": "아동상담" }
```

#### PATCH /api/users/[token]/keywords/[id]
Update keyword (toggle active).

**Request:**
```json
{ "is_active": false }
```

#### DELETE /api/users/[token]/keywords/[id]
Delete keyword.

### 5.3 Sources APIs

#### GET /api/users/[token]/sources
List available sources (global + user's custom).

**Response:**
```json
{
  "sources": [
    { "id": "uuid", "type": "kci", "name": "KCI", "is_active": true, "is_global": true },
    { "id": "uuid", "type": "riss", "name": "RISS", "is_active": false, "is_global": true },
    { "id": "uuid", "type": "journal", "name": "한국가족치료학회지", "is_active": true, "is_global": true }
  ]
}
```

#### POST /api/users/[token]/sources
Add custom source.

#### PATCH /api/users/[token]/sources/[id]
Toggle source active status.

### 5.4 Summaries APIs

#### GET /api/users/[token]/summaries
List past summaries.

**Query params:**
- `limit`: number (default 20)
- `offset`: number (default 0)
- `from`: ISO date
- `to`: ISO date

**Response:**
```json
{
  "summaries": [
    {
      "id": "uuid",
      "paper": {
        "title": "가족치료의 최신 동향",
        "authors": [{ "name": "김철수" }],
        "journal_name": "한국가족치료학회지",
        "published_at": "2024-12-20",
        "url": "https://..."
      },
      "content": "이 연구는 가족치료의 최신 동향을 분석했습니다...",
      "created_at": "2024-12-23T09:00:00Z"
    }
  ],
  "total": 45,
  "has_more": true
}
```

### 5.5 Cron APIs (Internal)

#### POST /api/cron/collect
Trigger paper collection. Called by GitHub Actions.

**Headers:**
```
Authorization: Bearer {CRON_SECRET}
```

**Response:**
```json
{
  "collected": 15,
  "sources": [
    { "name": "KCI", "count": 8 },
    { "name": "RISS", "count": 7 }
  ]
}
```

#### POST /api/cron/digest
Trigger digest generation and email sending.

**Headers:**
```
Authorization: Bearer {CRON_SECRET}
```

**Query params:**
- `hour`: current hour (0-23) to match users' digest_hour

**Response:**
```json
{
  "processed": 3,
  "emails_sent": 2,
  "emails_skipped": 1,
  "errors": []
}
```

---

## 6. Scraper Specifications

### 6.1 Scraper Interface

```typescript
interface ScraperResult {
  papers: Paper[];
  errors: string[];
  metadata: {
    source: string;
    query: string;
    total_found: number;
    scraped: number;
    duration_ms: number;
  };
}

interface Scraper {
  name: string;
  search(keywords: string[], options?: SearchOptions): Promise<ScraperResult>;
}

interface SearchOptions {
  from_date?: Date;
  to_date?: Date;
  max_results?: number;
}
```

### 6.2 KCI Scraper

**Target:** https://www.kci.go.kr

**Strategy:**
1. Use KCI's search API/page
2. Search by keyword with date filter (last 7 days)
3. Extract paper metadata from search results
4. Fetch individual paper pages for abstract

**Search URL Pattern:**
```
https://www.kci.go.kr/kciportal/po/search/poArtiSearList.kci
?poSearchVal={keyword}
&poSearchKind=10
&poFromDate={YYYYMMDD}
&poToDate={YYYYMMDD}
```

**Extracted Fields:**
- title, title_en
- authors (name, affiliation)
- abstract (Korean, English if available)
- journal name, volume, issue, pages
- publication date
- KCI article ID (for deduplication)
- URL to paper

### 6.3 RISS Scraper

**Target:** https://www.riss.kr

**Strategy:**
1. Use RISS search with filters
2. Filter by: 학술논문, 최근 7일, 주제어
3. Parse search result pages
4. Follow links for full metadata

**Search URL Pattern:**
```
https://www.riss.kr/search/Search.do
?query={keyword}
&searchType=thesis
&period=7d
```

**Note:** RISS may require handling JavaScript-rendered content. Consider using:
- Direct API if available
- Puppeteer/Playwright for JS-heavy pages
- Request with proper headers to get server-rendered content

### 6.4 Custom Journal Scrapers

Users can add any Korean academic journal. Common patterns:

**Journal hosted on DBpia/KCI:**
- Check for RSS feed or recent issues page
- Scrape table of contents for new issues
- Use journal ISSN or ID for precise targeting

**Journal with dedicated website:**
- Identify "latest issues" or "recent articles" page
- Parse HTML structure for article listings
- Follow links for abstract/metadata

**Example journals (initial use case):**
- 한국가족치료학회지 (Korean Family Therapy)
- 한국상담학회지 (Korean Counseling)

**Adding a new journal:**
1. User provides journal name and URL
2. System attempts auto-detection of structure
3. Falls back to generic KCI/RISS search if direct scraping fails

### 6.5 Rate Limiting & Ethics

```typescript
const SCRAPER_CONFIG = {
  request_delay_ms: 1000,      // 1 second between requests
  max_concurrent: 1,           // Sequential requests
  max_retries: 3,
  retry_delay_ms: 5000,
  user_agent: 'PaperDigest/1.0 (Academic Research Tool)',
  respect_robots_txt: true,
};
```

---

## 7. AI Summarization Specification

### 7.1 Provider Interface

```typescript
interface AIProvider {
  summarize(paper: Paper, options?: SummarizeOptions): Promise<string>;
  estimateCost(text: string): number;
}

interface SummarizeOptions {
  language: 'ko' | 'en';
  max_length: number;
  style: 'academic' | 'casual';
}
```

### 7.2 Summarization Prompt

The prompt is **field-agnostic** and adapts to any academic discipline:

```typescript
const SUMMARIZATION_PROMPT = `
당신은 학술 논문 요약 전문가입니다.
다음 학술 논문을 연구자와 실무자가 빠르게 이해할 수 있도록 한국어로 요약해주세요.

요약에는 다음 내용을 포함해주세요:
1. **연구 목적**: 이 연구가 해결하고자 하는 문제나 질문
2. **연구 방법**: 사용된 연구 방법론 (참여자 수, 분석 방법 등)
3. **주요 결과**: 핵심 발견 사항 2-3가지
4. **시사점**: 해당 분야 연구자나 실무자가 적용할 수 있는 점

길이: 300-400자
어조: 전문적이지만 이해하기 쉽게

---
논문 제목: {title}
저자: {authors}
학술지: {journal}

초록:
{abstract}

{full_text_if_available}
`;

// Optional: Users can set a custom prompt context for their field
interface UserPreferences {
  // ...
  ai_context?: string; // e.g., "가족치료 및 상담 분야", "컴퓨터 공학", etc.
}
```

### 7.3 Gemini Configuration

```typescript
const GEMINI_CONFIG = {
  model: 'gemini-1.5-flash',
  temperature: 0.3,           // Lower for factual accuracy
  max_output_tokens: 1024,
  top_p: 0.8,
};
```

### 7.4 OpenAI Fallback (for easy swap)

```typescript
const OPENAI_CONFIG = {
  model: 'gpt-4o-mini',       // Cost-effective option
  temperature: 0.3,
  max_tokens: 1024,
};
```

---

## 8. Email Specification

### 8.1 Email Template Structure

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>주간 논문 요약</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">

  <header style="border-bottom: 2px solid #2563eb; padding-bottom: 16px; margin-bottom: 24px;">
    <h1 style="color: #1e40af; margin: 0;">📚 주간 논문 다이제스트</h1>
    <p style="color: #6b7280; margin: 8px 0 0;">{{date_range}}</p>
  </header>

  <p>안녕하세요 {{user_name}}님,</p>
  <p>이번 주 <strong>{{paper_count}}편</strong>의 새 논문이 발견되었습니다.</p>

  {{#each summaries}}
  <article style="background: #f9fafb; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
    <h2 style="font-size: 16px; margin: 0 0 8px; color: #1f2937;">
      <a href="{{paper.url}}" style="color: #2563eb; text-decoration: none;">{{paper.title}}</a>
    </h2>
    <p style="font-size: 13px; color: #6b7280; margin: 0 0 12px;">
      {{paper.authors}} · {{paper.journal_name}} · {{paper.published_at}}
    </p>
    <p style="font-size: 14px; line-height: 1.6; color: #374151; margin: 0;">
      {{summary.content}}
    </p>
  </article>
  {{/each}}

  <footer style="border-top: 1px solid #e5e7eb; padding-top: 16px; margin-top: 24px; font-size: 12px; color: #9ca3af;">
    <p>
      <a href="{{dashboard_url}}" style="color: #2563eb;">설정 변경</a> ·
      <a href="{{unsubscribe_url}}" style="color: #2563eb;">수신 거부</a>
    </p>
    <p>이 이메일은 자동 발송되었습니다.</p>
  </footer>

</body>
</html>
```

### 8.2 Email Sending Logic

```typescript
async function sendDigest(user: User, summaries: Summary[]): Promise<void> {
  if (summaries.length === 0) {
    await logEmail(user.id, 0, 'skipped');
    return;
  }

  const html = renderTemplate('digest', {
    user_name: user.name || '회원',
    paper_count: summaries.length,
    date_range: getDateRangeString(),
    summaries: summaries.map(s => ({
      paper: s.paper,
      summary: s,
    })),
    dashboard_url: `${BASE_URL}/u/${user.token}`,
    unsubscribe_url: `${BASE_URL}/u/${user.token}/settings`,
  });

  await resend.emails.send({
    from: 'PaperDigest <digest@yourdomain.com>',
    to: user.email,
    subject: `[논문요약] ${summaries.length}편의 새 논문 (${getWeekString()})`,
    html,
  });

  await logEmail(user.id, summaries.length, 'sent');
}
```

---

## 9. Scheduling & Cron Jobs

### 9.1 Vercel Cron Configuration

```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/collect",
      "schedule": "0 21 * * *"
    },
    {
      "path": "/api/cron/digest?hour=6",
      "schedule": "0 21 * * *"
    },
    {
      "path": "/api/cron/digest?hour=12",
      "schedule": "0 3 * * *"
    },
    {
      "path": "/api/cron/digest?hour=18",
      "schedule": "0 9 * * *"
    }
  ]
}
```

**Note:** Vercel cron uses UTC. The schedules above correspond to:
- `0 21 * * *` → 6 AM KST (collect + 6AM digests)
- `0 3 * * *` → 12 PM KST
- `0 9 * * *` → 6 PM KST

**Free tier limit:** 2 cron jobs on Hobby plan. For more, Pro plan ($20/mo) allows unlimited.
Alternative: Combine into single daily job that handles all hours.

### 9.2 Cron Job Logic

```typescript
// /api/cron/digest
export async function POST(request: Request) {
  // Verify cron secret
  const auth = request.headers.get('Authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const currentHour = parseInt(url.searchParams.get('hour') || '9');
  const currentDay = new Date().getDay(); // 0=Sun, 1=Mon, ...

  // Find users who should receive digest now
  const users = await supabase
    .from('users')
    .select('*')
    .eq('is_active', true)
    .eq('digest_day', currentDay)
    .eq('digest_hour', currentHour);

  const results = await Promise.allSettled(
    users.data.map(user => processUserDigest(user))
  );

  return Response.json({
    processed: results.length,
    emails_sent: results.filter(r => r.status === 'fulfilled').length,
    errors: results
      .filter(r => r.status === 'rejected')
      .map(r => r.reason.message),
  });
}
```

---

## 10. Security Considerations

### 10.1 Token Generation
```typescript
import { randomBytes } from 'crypto';

function generateUserToken(): string {
  return randomBytes(16).toString('hex'); // 32 character hex string
}
```

### 10.2 Rate Limiting
- Dashboard API: 100 requests/minute per token
- Cron APIs: Only accept requests with valid CRON_SECRET

### 10.3 Input Validation
- Keywords: Max 100 characters, alphanumeric + Korean + common punctuation
- Email: Valid email format
- URLs: Valid URL format for custom sources

### 10.4 Data Privacy
- No password storage
- Token is the only authentication
- Users can delete their data via dashboard

---

## 11. Error Handling

### 11.1 Scraper Errors
```typescript
class ScraperError extends Error {
  constructor(
    message: string,
    public source: string,
    public recoverable: boolean = true
  ) {
    super(message);
  }
}

// Retry logic
async function scrapeWithRetry(scraper: Scraper, keywords: string[]) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await scraper.search(keywords);
    } catch (error) {
      if (attempt === 3 || !error.recoverable) throw error;
      await sleep(5000 * attempt); // Exponential backoff
    }
  }
}
```

### 11.2 AI Errors
- Rate limit: Queue and retry with backoff
- Invalid response: Log and skip paper
- Timeout: Retry once, then skip

### 11.3 Email Errors
- Bounce: Log and mark user for review
- Rate limit: Queue for next cycle
- Invalid email: Mark user as inactive

---

## 12. Monitoring & Logging

### 12.1 Key Metrics
- Papers collected per day
- Summaries generated per day
- Emails sent per day
- Error rates by component
- API latency

### 12.2 Logging Strategy
```typescript
const logger = {
  info: (msg: string, data?: object) => console.log(JSON.stringify({ level: 'info', msg, ...data })),
  error: (msg: string, error: Error, data?: object) => console.error(JSON.stringify({
    level: 'error',
    msg,
    error: error.message,
    stack: error.stack,
    ...data
  })),
};
```

---

## 13. Testing Strategy

### 13.1 Unit Tests
- Scraper parsing logic
- AI prompt generation
- Email template rendering
- Token generation

### 13.2 Integration Tests
- Database operations
- API endpoints
- Full digest flow (mock external services)

### 13.3 E2E Tests
- User dashboard flow
- Keyword management
- Settings update

---

## 14. Deployment Checklist

### 14.1 Pre-deployment
- [ ] Supabase project created
- [ ] Database schema applied
- [ ] Resend domain verified (or use default sender)
- [ ] Gemini API key obtained
- [ ] GitHub repository connected to Vercel

### 14.2 Environment Variables

| Variable | Description | Where |
|----------|-------------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Vercel |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | Vercel |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service key | Vercel |
| `GEMINI_API_KEY` | Google Gemini API key | Vercel |
| `RESEND_API_KEY` | Resend API key | Vercel |
| `CRON_SECRET` | Secret for cron endpoints | Vercel |

### 14.3 Post-deployment
- [ ] Verify all API endpoints
- [ ] Create initial test user
- [ ] Test paper collection manually
- [ ] Test email delivery
- [ ] Verify Vercel cron jobs are running (check Vercel dashboard)

---

## 15. Future Enhancements (Out of Scope)

- RSS feed output
- Slack/Discord integration
- Paper recommendation based on reading history
- Full-text search across summaries
- Collaboration features (shared keywords)
- Mobile app
