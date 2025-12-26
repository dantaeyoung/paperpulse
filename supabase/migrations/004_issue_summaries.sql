-- Issue Trend Summaries
-- Stores AI-generated trend analysis for journal issues

CREATE TABLE issue_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scraper_key VARCHAR(50) NOT NULL,
  issue_id VARCHAR(100) NOT NULL,

  -- Generated content
  summary_content TEXT NOT NULL,
  extractions JSONB,              -- Raw paper extractions for debugging
  paper_count INTEGER NOT NULL,

  -- Custom prompt used (if different from default)
  custom_prompt TEXT,

  -- User context
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  field_context TEXT,             -- User's field context at generation time

  -- Model tracking
  model_extraction VARCHAR(50) DEFAULT 'gemini-1.5-flash',
  model_synthesis VARCHAR(50) DEFAULT 'gemini-1.5-pro',
  tokens_used_extraction INTEGER,
  tokens_used_synthesis INTEGER,
  cost_estimate DECIMAL(10, 4),

  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- One summary per issue per user (allows personalized summaries)
  UNIQUE(scraper_key, issue_id, user_id)
);

-- Index for quick lookups
CREATE INDEX idx_issue_summaries_lookup ON issue_summaries(scraper_key, issue_id);
CREATE INDEX idx_issue_summaries_user ON issue_summaries(user_id);
