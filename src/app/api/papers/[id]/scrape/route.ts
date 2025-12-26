import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { getScraper } from '@/lib/scrapers/journal-base';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import '@/lib/scrapers/counselors';

interface CachedArticle {
  id: string;
  title: string;
  authors: string[];
  year: string;
  volume: string;
  issue: string;
  url: string;
  pdfUrl: string;
}

// Scrape a single paper by ID
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: paperId } = await params;

  const supabase = createServerClient();

  try {
    // Find the article in issue_cache to get scraper info and PDF URL
    const { data: cachedIssues } = await supabase
      .from('issue_cache')
      .select('scraper_key, issue_id, journal_name, issue_info, articles');

    let cachedArticle: CachedArticle | null = null;
    let scraperKey = '';
    let issueId = '';
    let journalName = '';
    let issueInfo: { year?: string; volume?: string; issue?: string } = {};

    for (const cache of cachedIssues || []) {
      const articles = cache.articles as CachedArticle[] || [];
      const found = articles.find(a => a.id === paperId);
      if (found) {
        cachedArticle = found;
        scraperKey = cache.scraper_key;
        issueId = cache.issue_id;
        journalName = cache.journal_name;
        issueInfo = cache.issue_info as { year?: string; volume?: string; issue?: string } || {};
        break;
      }
    }

    if (!cachedArticle) {
      return NextResponse.json({ error: 'Paper not found in cache' }, { status: 404 });
    }

    const scraper = getScraper(scraperKey);
    if (!scraper) {
      return NextResponse.json({ error: `Scraper '${scraperKey}' not found` }, { status: 404 });
    }

    // Download and extract PDF
    let extractedText = '';

    if (cachedArticle.pdfUrl) {
      try {
        console.log(`[scrape] Downloading PDF for ${paperId}: ${cachedArticle.pdfUrl}`);

        const res = await fetch(cachedArticle.pdfUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          },
        });

        const contentType = res.headers.get('content-type') || '';
        const buffer = await res.arrayBuffer();
        const uint8Array = new Uint8Array(buffer);

        // Check if it's a PDF
        const isPdf = contentType.includes('pdf') ||
                      contentType.includes('octet-stream') ||
                      contentType.includes('file/unknown') ||
                      (uint8Array[0] === 0x25 && uint8Array[1] === 0x50 && uint8Array[2] === 0x44 && uint8Array[3] === 0x46);

        if (isPdf && uint8Array.length > 100) {
          // Save PDF locally
          const pdfDir = path.join(process.cwd(), 'public', 'pdfs', scraperKey);
          if (!existsSync(pdfDir)) {
            await mkdir(pdfDir, { recursive: true });
          }
          const pdfPath = path.join(pdfDir, `${paperId}.pdf`);
          await writeFile(pdfPath, Buffer.from(buffer));
          console.log(`[scrape] Saved PDF to ${pdfPath}`);

          // Extract text
          const { extractText } = await import('unpdf');
          const { text } = await extractText(uint8Array);
          extractedText = Array.isArray(text) ? text.join('\n\n') : String(text || '');
          console.log(`[scrape] Extracted ${extractedText.length} characters`);
        } else {
          console.log(`[scrape] Not a valid PDF (content-type: ${contentType})`);
        }
      } catch (err) {
        console.error(`[scrape] PDF extraction failed:`, err);
      }
    }

    // Get or create source
    let { data: source } = await supabase
      .from('sources')
      .select('id')
      .eq('name', journalName)
      .eq('type', 'journal')
      .single();

    if (!source) {
      const { data: newSource } = await supabase
        .from('sources')
        .insert({
          name: journalName,
          type: 'journal',
          url: scraper.baseUrl,
          is_active: true,
          is_global: true,
          config: { scraper: scraperKey },
        })
        .select('id')
        .single();
      source = newSource;
    }

    // Save to papers table
    const { error: upsertError } = await supabase
      .from('papers')
      .upsert({
        source_id: source!.id,
        external_id: paperId,
        title: cachedArticle.title,
        authors: cachedArticle.authors.map(name => ({ name })),
        full_text: extractedText || null,
        url: cachedArticle.url,
        journal_name: journalName,
        volume: cachedArticle.volume || issueInfo.volume,
        issue: cachedArticle.issue || issueInfo.issue,
        published_at: cachedArticle.year ? `${cachedArticle.year}-01-01` : null,
      }, {
        onConflict: 'source_id,external_id',
      });

    if (upsertError) {
      console.error('[scrape] Upsert error:', upsertError);
      return NextResponse.json({ error: 'Failed to save paper' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      paperId,
      extractedTextLength: extractedText.length,
      localPdfUrl: extractedText.length > 0 ? `/pdfs/${scraperKey}/${paperId}.pdf` : null,
    });

  } catch (error) {
    console.error('Scrape error:', error);
    return NextResponse.json({
      error: 'Scrape failed',
      details: error instanceof Error ? error.message : 'Unknown',
    }, { status: 500 });
  }
}
