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

-- Cache for year issue lists (which issues exist for a given year)
CREATE TABLE year_issues_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scraper_key VARCHAR(50) NOT NULL,
  year INTEGER NOT NULL,
  journal_name VARCHAR(200),
  issues JSONB DEFAULT '[]',  -- array of {id, year, volume, issue}
  cached_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(scraper_key, year)
);

CREATE INDEX idx_year_issues_cache_lookup ON year_issues_cache(scraper_key, year);

-- Track scraping job status for UI progress
CREATE TABLE scrape_status (
  id VARCHAR(50) PRIMARY KEY,  -- e.g., 'bulk-scrape-counselors'
  status VARCHAR(20) NOT NULL DEFAULT 'idle',  -- idle, running, completed, error
  progress TEXT,  -- current progress message
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  result JSONB  -- final stats
);
