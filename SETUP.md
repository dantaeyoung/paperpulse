# Setup Guide

Complete guide to setting up 논문 다이제스트 for development and production.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Local Development Setup](#local-development-setup)
3. [Environment Variables](#environment-variables)
4. [Database Setup](#database-setup)
5. [Running the Application](#running-the-application)
6. [Production Deployment](#production-deployment)
7. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software

- **Node.js 18+** - JavaScript runtime
- **npm** or **pnpm** - Package manager
- **Git** - Version control

### Required Accounts

| Service | Purpose | Free Tier |
|---------|---------|-----------|
| [Supabase](https://supabase.com) | PostgreSQL database | Yes (500MB) |
| [Google AI Studio](https://aistudio.google.com) | Gemini API for AI summaries | Yes (limited) |
| [Resend](https://resend.com) | Email delivery | Yes (100/day) |
| [Vercel](https://vercel.com) | Hosting & cron jobs | Yes |

### Optional Accounts

| Service | Purpose | Notes |
|---------|---------|-------|
| [OpenAI](https://platform.openai.com) | Fallback AI provider | Paid only |

---

## Local Development Setup

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/article-summarizer.git
cd article-summarizer
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Create Environment File

```bash
cp .env.example .env.local
```

Or create `.env.local` manually (see [Environment Variables](#environment-variables)).

### 4. Set Up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to **Settings > API** to get your credentials
3. Add credentials to `.env.local`

### 5. Run Database Migrations

```bash
# Install Supabase CLI if not installed
npm install -g supabase

# Link to your project
npx supabase link --project-ref YOUR_PROJECT_REF

# Run migrations
npx supabase db push
```

### 6. Start Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Environment Variables

Create a `.env.local` file with the following variables:

### Required Variables

```bash
# ===================
# SUPABASE (Required)
# ===================
# Get these from: Supabase Dashboard > Settings > API
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# ===================
# AI PROVIDER (At least one required)
# ===================
# Gemini (recommended - has free tier)
# Get from: https://aistudio.google.com/apikey
GEMINI_API_KEY=AIzaSy...

# OpenAI (optional fallback)
# Get from: https://platform.openai.com/api-keys
OPENAI_API_KEY=sk-...

# ===================
# EMAIL (Required for digests)
# ===================
# Get from: https://resend.com/api-keys
RESEND_API_KEY=re_...

# Sender email (must be verified in Resend)
EMAIL_FROM=digest@yourdomain.com
```

### Optional Variables

```bash
# ===================
# AI CONFIGURATION
# ===================
# Force specific provider: 'gemini', 'openai', or 'auto' (default)
AI_PROVIDER=auto

# ===================
# SECURITY
# ===================
# Secret for cron job authentication (generate a random string)
CRON_SECRET=your-random-secret-string-here

# ===================
# APP CONFIG
# ===================
# Your deployed app URL (for email links)
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

### Generating Secrets

```bash
# Generate a random CRON_SECRET
openssl rand -hex 32
```

---

## Database Setup

### Supabase Project Setup

1. **Create Project**
   - Go to [supabase.com](https://supabase.com)
   - Click "New Project"
   - Choose organization, name, password, region
   - Wait for project to initialize (~2 minutes)

2. **Get Credentials**
   - Go to **Settings > API**
   - Copy "Project URL" → `SUPABASE_URL`
   - Copy "service_role" key → `SUPABASE_SERVICE_ROLE_KEY`

### Running Migrations

The project includes 5 migration files:

| File | Purpose |
|------|---------|
| `001_initial_schema.sql` | Core tables: users, keywords, sources, papers, summaries |
| `002_journal_picker_model.sql` | User journal selection, default journals |
| `003_issue_cache.sql` | Caching for scraped journal issues |
| `004_issue_summaries.sql` | AI-generated issue trend summaries |
| `005_add_citation_map.sql` | Citation mapping for summaries |

Run all migrations:

```bash
npx supabase db push
```

Or run manually via Supabase SQL Editor.

### Database Schema Overview

```
users              - Subscriber accounts with digest preferences
  ├── keywords     - User's search keywords
  ├── user_journals - User's selected journals
  └── summaries    - Per-user paper summaries

sources            - Global journal definitions
  └── papers       - Collected papers with full text

issue_cache        - Cached journal issue article lists
issue_summaries    - AI trend analysis per issue
email_logs         - Email delivery tracking
scrape_status      - Bulk scraping job progress
```

---

## Running the Application

### Development Mode

```bash
npm run dev
```

- Hot reload enabled
- Available at http://localhost:3000
- API routes at http://localhost:3000/api/*

### Production Build

```bash
npm run build
npm start
```

### Key URLs

| URL | Description |
|-----|-------------|
| `/` | Home page |
| `/issues` | Journal browser (3-column Miller layout, mobile-friendly) |
| `/issues/[scraper]/[issueId]` | Issue view with AI summary |
| `/papers` | All papers table |
| `/u/[token]` | User dashboard |
| `/u/[token]/keywords` | Manage keywords |
| `/u/[token]/sources` | Select journals |

### Testing Cron Jobs Locally

Cron endpoints require authentication. Test with:

```bash
# Test paper collection
curl -X POST http://localhost:3000/api/cron/collect \
  -H "Authorization: Bearer YOUR_CRON_SECRET"

# Test digest sending
curl -X POST http://localhost:3000/api/cron/digest \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

---

## Production Deployment

### Deploying to Vercel

1. **Connect Repository**
   ```bash
   # Install Vercel CLI
   npm i -g vercel

   # Deploy
   vercel
   ```

2. **Configure Environment Variables**
   - Go to Vercel Dashboard > Project > Settings > Environment Variables
   - Add all variables from `.env.local`

3. **Verify Cron Jobs**
   - Crons are defined in `vercel.json`
   - Check Vercel Dashboard > Project > Settings > Crons

### Cron Job Schedule

Defined in `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/collect",
      "schedule": "0 21 * * *"
    },
    {
      "path": "/api/cron/digest",
      "schedule": "0 22 * * *"
    }
  ]
}
```

- **Collect**: Daily at 21:00 UTC (06:00 KST next day)
- **Digest**: Daily at 22:00 UTC (07:00 KST next day)

Adjust times by modifying `vercel.json`.

### Email Domain Setup (Resend)

For production emails:

1. Go to [Resend Dashboard](https://resend.com/domains)
2. Add your domain
3. Add DNS records (SPF, DKIM, DMARC)
4. Verify domain
5. Update `EMAIL_FROM` to use your domain

---

## Troubleshooting

### Common Issues

#### "No AI provider available"

**Cause**: Neither `GEMINI_API_KEY` nor `OPENAI_API_KEY` is set.

**Fix**: Add at least one API key to `.env.local`.

#### "Unauthorized" on cron endpoints

**Cause**: `CRON_SECRET` mismatch or missing.

**Fix**:
- Ensure `CRON_SECRET` is set in environment
- Include `Authorization: Bearer YOUR_SECRET` header

#### Database connection errors

**Cause**: Invalid Supabase credentials.

**Fix**:
- Verify `SUPABASE_URL` format: `https://xxx.supabase.co`
- Use `service_role` key, not `anon` key
- Check project is not paused (free tier pauses after inactivity)

#### PDF extraction fails

**Cause**: PDF is scanned/image-based or protected.

**Note**: The `unpdf` library extracts text from text-based PDFs only. Scanned PDFs return empty text.

#### Gemini quota exceeded

**Cause**: Free tier limit reached.

**Fix**:
- Wait for quota reset (daily)
- Add `OPENAI_API_KEY` as fallback
- Or upgrade Gemini plan

### Debug Mode

Enable verbose logging:

```bash
DEBUG=* npm run dev
```

### Getting Help

- Check existing issues: [GitHub Issues](https://github.com/your-username/article-summarizer/issues)
- Review logs in Vercel Dashboard
- Check Supabase logs: Dashboard > Logs
