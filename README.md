# paperpulse

LLM-powered Korean academic journal summarizer with weekly email digests.


```diff
! Everything below was written by an AI!
```


## Features

- **Journal Scraping**: Scrapes Korean academic journals and extracts full text from PDFs
- **AI Summaries**: Generates paper summaries using Gemini or OpenAI
- **Weekly Digests**: Sends personalized email digests based on user keywords
- **Issue Trend Analysis**: AI-generated issue summaries with citations, statistics, and methodology breakdowns
- **Extensible Architecture**: Easy to add new journal scrapers

## Currently Supported Journals

- 한국상담학회지 (Korean Counseling Journal)

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Database**: Supabase (PostgreSQL)
- **AI**: Google Gemini / OpenAI
- **Email**: Resend
- **PDF Extraction**: unpdf
- **Styling**: Tailwind CSS

## Getting Started

### Prerequisites

- Node.js 18+
- Supabase project
- Resend account (for emails)
- Gemini or OpenAI API key

### Environment Variables

Create a `.env.local` file:

```bash
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# AI Provider (at least one)
GEMINI_API_KEY=your-gemini-key
OPENAI_API_KEY=your-openai-key

# Email (Resend)
RESEND_API_KEY=re_xxxxx
EMAIL_FROM=digest@yourdomain.com

# Cron Security
CRON_SECRET=your-secret-here

# App URL
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

### Database Setup

Run the Supabase migrations:

```bash
npx supabase db push
```

### Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── cron/          # Scheduled jobs (collect, digest)
│   │   ├── issues/        # Issue summary endpoints
│   │   ├── journals/      # Journal listing
│   │   └── users/         # User management
│   ├── issues/            # Issue browser UI
│   ├── test/              # Admin tools (papers table, scraper)
│   └── u/[token]/         # User dashboard
├── components/            # Reusable components
└── lib/
    ├── ai/                # AI providers and summary services
    ├── email/             # Resend email service
    ├── scrapers/          # Journal scraper implementations
    └── supabase/          # Database client and types
```

## Deployment

Deploy to Vercel for automatic cron job support:

```bash
vercel deploy
```

Cron jobs (configured in `vercel.json`):
- `/api/cron/collect` - Daily at 21:00 KST (paper collection)
- `/api/cron/digest` - Daily at 22:00 KST (email digests)

## Adding a New Journal Scraper

1. Create a new file in `src/lib/scrapers/`
2. Extend `JournalScraperBase` class
3. Implement required methods: `getIssues()`, `parseArticlesFromIssue()`, `getPdfUrl()`
4. Register with `registerScraper()`

See `src/lib/scrapers/counselors.ts` for reference.
