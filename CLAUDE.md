# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**paperpulse** - LLM-powered Korean academic journal summarizer with weekly email digests.

For detailed documentation, see:
- [SETUP.md](./SETUP.md) - Installation and configuration guide
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Technical architecture and design

## Quick Reference

### Tech Stack
- **Framework**: Next.js 14 (App Router)
- **Database**: Supabase (PostgreSQL)
- **AI**: Google Gemini / OpenAI
- **Email**: Resend
- **Hosting**: Vercel

### Key Directories
```
src/lib/scrapers/     # Journal scraper implementations
src/lib/ai/           # AI provider and issue summary service
src/lib/email/        # Email service (Resend)
src/app/api/cron/     # Scheduled jobs (collect, digest)
src/app/api/issues/   # Issue summary endpoints
src/app/issues/       # Issue browser UI
```

### Common Commands
```bash
npm run dev           # Start development server
npm run build         # Production build
npx supabase db push  # Run database migrations
```

---

## Development Workflow: Spec → Code

THESE INSTRUCTIONS ARE CRITICAL!

They dramatically improve the quality of the work you create.

### Phase 1: Requirements First

When asked to implement any feature or make changes, ALWAYS start by asking:
"Should I create a Spec for this task first?"

IFF user agrees:

- Create a markdown file in `specs/FeatureName.md`
- Interview the user to clarify:
- Purpose & user problem
- Success criteria
- Scope & constraints
- Technical considerations
- Out of scope items

### Phase 2: Review & Refine

After drafting the Spec:

- Present it to the user
- Ask: "Does this capture your intent? Any changes needed?"
- Iterate until user approves
- End with: "Spec looks good? Type 'GO!' when ready to implement"

### Phase 3: Implementation

ONLY after user types "GO!" or explicitly approves:

- Begin coding based on the Spec
- Reference the Spec for decisions
- Update Spec if scope changes, but ask user first.

---

## Codebase Conventions

### Adding a New Journal Scraper

1. Create file in `src/lib/scrapers/`
2. Extend `JournalScraperBase` class
3. Implement: `getIssues()`, `parseArticlesFromIssue()`, `getPdfUrl()`
4. Register with `registerScraper()`
5. Import in relevant API routes

See `src/lib/scrapers/counselors.ts` for reference.

### Database Migrations

- Migrations live in `supabase/migrations/`
- Name format: `XXX_description.sql`
- Run with `npx supabase db push`

### API Route Patterns

- Cron jobs require `CRON_SECRET` authentication
- Use `createServerClient()` for Supabase access
- SSE streaming for long-running operations (see `summary/stream/route.ts`)
