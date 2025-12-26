import { createServerClient } from './client';

const PDF_BUCKET = 'pdfs';

/**
 * Upload a PDF to Supabase Storage
 * @param scraperKey - The scraper identifier (e.g., 'counselors')
 * @param paperId - The paper/article ID
 * @param pdfBuffer - The PDF file buffer
 * @returns The public URL of the uploaded PDF, or null on failure
 */
export async function uploadPdf(
  scraperKey: string,
  paperId: string,
  pdfBuffer: Buffer | ArrayBuffer
): Promise<string | null> {
  const supabase = createServerClient();
  const filePath = `${scraperKey}/${paperId}.pdf`;

  const { error } = await supabase.storage
    .from(PDF_BUCKET)
    .upload(filePath, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (error) {
    console.error('[storage] Upload failed:', error);
    return null;
  }

  return getPdfUrl(scraperKey, paperId);
}

/**
 * Get the public URL for a PDF
 * @param scraperKey - The scraper identifier
 * @param paperId - The paper/article ID
 * @returns The public URL
 */
export function getPdfUrl(scraperKey: string, paperId: string): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  return `${supabaseUrl}/storage/v1/object/public/${PDF_BUCKET}/${scraperKey}/${paperId}.pdf`;
}

/**
 * Check if a PDF exists in storage
 * @param scraperKey - The scraper identifier
 * @param paperId - The paper/article ID
 * @returns True if the PDF exists
 */
export async function pdfExists(
  scraperKey: string,
  paperId: string
): Promise<boolean> {
  const supabase = createServerClient();
  const filePath = `${scraperKey}/${paperId}.pdf`;

  const { data, error } = await supabase.storage
    .from(PDF_BUCKET)
    .list(scraperKey, {
      search: `${paperId}.pdf`,
    });

  if (error) {
    console.error('[storage] Check failed:', error);
    return false;
  }

  return data?.some(f => f.name === `${paperId}.pdf`) ?? false;
}

/**
 * Delete a PDF from storage
 * @param scraperKey - The scraper identifier
 * @param paperId - The paper/article ID
 */
export async function deletePdf(
  scraperKey: string,
  paperId: string
): Promise<boolean> {
  const supabase = createServerClient();
  const filePath = `${scraperKey}/${paperId}.pdf`;

  const { error } = await supabase.storage
    .from(PDF_BUCKET)
    .remove([filePath]);

  if (error) {
    console.error('[storage] Delete failed:', error);
    return false;
  }

  return true;
}
