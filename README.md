# paperpulse

LLM-powered Korean academic journal summarizer with weekly email digests.

(Vibe-engineered!)

```diff
! everything below this was written by an AI.
```



(`CLAUDE/LLMS - DO NOT EDIT anything above and including this line!`)

## Features

- Scrapes Korean academic journals and extracts full text from PDFs
- Generates AI summaries using Google Gemini or OpenAI
- Sends personalized weekly email digests based on user keywords
- Issue-level trend analysis with citations and statistics

## Supported Journals

- 한국상담학회지 (Korean Counseling Journal)

## Quick Start

```bash
npm install
cp .env.example .env.local  # Configure environment variables
npx supabase db push        # Run migrations
npm run dev                 # Start dev server at http://localhost:3000
```

## Documentation

| Document | Description |
|----------|-------------|
| [SETUP.md](./SETUP.md) | Complete installation, configuration, and deployment guide |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Technical architecture, database schema, API reference, and extension guide |

## Tech Stack

Next.js 14 / Supabase / Google Gemini / OpenAI / Resend / Vercel
