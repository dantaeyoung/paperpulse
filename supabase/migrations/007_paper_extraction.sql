-- Add extraction column to papers table
-- Stores AI-extracted structured data for individual papers

ALTER TABLE papers
ADD COLUMN IF NOT EXISTS extraction JSONB;

COMMENT ON COLUMN papers.extraction IS 'AI-extracted structured data: research_topic, methodology, sample_size, key_findings';
