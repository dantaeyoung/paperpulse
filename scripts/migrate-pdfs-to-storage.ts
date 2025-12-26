#!/usr/bin/env npx tsx
/**
 * Migration script to upload existing local PDFs to Supabase Storage
 *
 * Usage:
 *   npx tsx scripts/migrate-pdfs-to-storage.ts
 *
 * This script:
 * 1. Scans public/pdfs directory for existing PDFs
 * 2. Uploads each PDF to Supabase Storage
 * 3. Reports success/failure for each file
 */

import { createClient } from '@supabase/supabase-js';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const PDF_BUCKET = 'pdfs';

async function main() {
  // Check environment variables
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing environment variables:');
    console.error('  NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✓' : '✗');
    console.error('  SUPABASE_SERVICE_ROLE_KEY:', supabaseKey ? '✓' : '✗');
    console.error('\nMake sure to run with environment variables loaded:');
    console.error('  npx dotenv -e .env.local -- npx tsx scripts/migrate-pdfs-to-storage.ts');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const pdfsDir = join(process.cwd(), 'public', 'pdfs');

  if (!existsSync(pdfsDir)) {
    console.log('No public/pdfs directory found. Nothing to migrate.');
    return;
  }

  // Get all scraper directories
  const scraperDirs = await readdir(pdfsDir, { withFileTypes: true });
  const scraperKeys = scraperDirs
    .filter(d => d.isDirectory())
    .map(d => d.name);

  if (scraperKeys.length === 0) {
    console.log('No scraper directories found in public/pdfs/');
    return;
  }

  console.log(`Found ${scraperKeys.length} scraper(s): ${scraperKeys.join(', ')}`);

  let totalUploaded = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  for (const scraperKey of scraperKeys) {
    const scraperDir = join(pdfsDir, scraperKey);
    const files = await readdir(scraperDir);
    const pdfFiles = files.filter(f => f.endsWith('.pdf'));

    console.log(`\n📁 ${scraperKey}: ${pdfFiles.length} PDFs`);

    for (const pdfFile of pdfFiles) {
      const paperId = pdfFile.replace('.pdf', '');
      const filePath = join(scraperDir, pdfFile);
      const storagePath = `${scraperKey}/${paperId}.pdf`;

      try {
        // Check if already exists in storage
        const { data: existingFiles } = await supabase.storage
          .from(PDF_BUCKET)
          .list(scraperKey, { search: `${paperId}.pdf` });

        if (existingFiles?.some(f => f.name === `${paperId}.pdf`)) {
          console.log(`  ⏭ ${paperId} - already in storage`);
          totalSkipped++;
          continue;
        }

        // Read and upload
        const fileBuffer = await readFile(filePath);
        const { error } = await supabase.storage
          .from(PDF_BUCKET)
          .upload(storagePath, fileBuffer, {
            contentType: 'application/pdf',
            upsert: true,
          });

        if (error) {
          console.error(`  ✗ ${paperId} - ${error.message}`);
          totalFailed++;
        } else {
          console.log(`  ✓ ${paperId}`);
          totalUploaded++;
        }

        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 100));
      } catch (err) {
        console.error(`  ✗ ${paperId} - ${err instanceof Error ? err.message : 'Unknown error'}`);
        totalFailed++;
      }
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('Migration complete:');
  console.log(`  ✓ Uploaded: ${totalUploaded}`);
  console.log(`  ⏭ Skipped (already exists): ${totalSkipped}`);
  console.log(`  ✗ Failed: ${totalFailed}`);

  if (totalUploaded > 0) {
    console.log('\nPDFs are now available at:');
    console.log(`  ${supabaseUrl}/storage/v1/object/public/${PDF_BUCKET}/<scraper>/<paperId>.pdf`);
  }
}

main().catch(console.error);
