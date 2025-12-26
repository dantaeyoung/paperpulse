-- Add citation_map column to issue_summaries
-- Maps citation numbers [1], [2], etc. to paper IDs and titles

ALTER TABLE issue_summaries
ADD COLUMN IF NOT EXISTS citation_map JSONB;

COMMENT ON COLUMN issue_summaries.citation_map IS 'Maps citation numbers to paper_id and title for rendering clickable citations';
