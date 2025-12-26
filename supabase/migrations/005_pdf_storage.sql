-- Create storage bucket for PDFs
INSERT INTO storage.buckets (id, name, public)
VALUES ('pdfs', 'pdfs', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to PDFs
CREATE POLICY "Public read access for PDFs"
ON storage.objects FOR SELECT
USING (bucket_id = 'pdfs');

-- Allow authenticated uploads (service role)
CREATE POLICY "Service role upload access for PDFs"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'pdfs');

-- Allow service role to update/delete
CREATE POLICY "Service role manage access for PDFs"
ON storage.objects FOR ALL
USING (bucket_id = 'pdfs');
