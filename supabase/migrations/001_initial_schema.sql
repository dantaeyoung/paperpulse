-- Users: Each user has a unique access token
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token VARCHAR(32) UNIQUE NOT NULL,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(100),
  field_context VARCHAR(200),
  digest_day SMALLINT DEFAULT 1 CHECK (digest_day BETWEEN 0 AND 6),
  digest_hour SMALLINT DEFAULT 9 CHECK (digest_hour BETWEEN 0 AND 23),
  timezone VARCHAR(50) DEFAULT 'Asia/Seoul',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Keywords: User's search terms
CREATE TABLE keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  keyword VARCHAR(100) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, keyword)
);

-- Sources: Paper sources (KCI, RISS, journals)
CREATE TABLE sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL CHECK (type IN ('kci', 'riss', 'journal', 'custom')),
  name VARCHAR(100) NOT NULL,
  url VARCHAR(500),
  config JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  is_global BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Papers: Collected papers (global, not per-user)
CREATE TABLE papers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  external_id VARCHAR(255) NOT NULL,
  title VARCHAR(500) NOT NULL,
  title_en VARCHAR(500),
  authors JSONB DEFAULT '[]',
  abstract TEXT,
  abstract_en TEXT,
  full_text TEXT,
  url VARCHAR(500) NOT NULL,
  doi VARCHAR(100),
  journal_name VARCHAR(200),
  volume VARCHAR(20),
  issue VARCHAR(20),
  pages VARCHAR(50),
  published_at DATE,
  collected_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source_id, external_id)
);

-- Summaries: AI-generated summaries (per user for personalization)
CREATE TABLE summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_id UUID NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  model VARCHAR(50) DEFAULT 'gemini-1.5-flash',
  tokens_used INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(paper_id, user_id)
);

-- Email Logs: Track sent emails
CREATE TABLE email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  paper_count INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  error_message TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_papers_published_at ON papers(published_at DESC);
CREATE INDEX idx_papers_source_id ON papers(source_id);
CREATE INDEX idx_papers_collected_at ON papers(collected_at DESC);
CREATE INDEX idx_keywords_user_id ON keywords(user_id);
CREATE INDEX idx_summaries_user_paper ON summaries(user_id, paper_id);
CREATE INDEX idx_users_token ON users(token);
CREATE INDEX idx_users_digest_schedule ON users(digest_day, digest_hour) WHERE is_active = true;

-- Insert default global sources
INSERT INTO sources (type, name, url, is_global, is_active) VALUES
  ('kci', 'KCI (한국학술지인용색인)', 'https://www.kci.go.kr', true, true),
  ('riss', 'RISS (학술연구정보서비스)', 'https://www.riss.kr', true, true);
