-- Cache for journal issue article lists
-- Since journal issues don't change once published, we cache them permanently
CREATE TABLE issue_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scraper_key VARCHAR(50) NOT NULL,
  issue_id VARCHAR(50) NOT NULL,
  journal_name VARCHAR(200),
  issue_info JSONB DEFAULT '{}',  -- year, volume, issue
  articles JSONB DEFAULT '[]',     -- array of article metadata
  cached_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(scraper_key, issue_id)
);

CREATE INDEX idx_issue_cache_lookup ON issue_cache(scraper_key, issue_id);
