-- Migration: Refactor to Journal Picker Model
-- Sources become admin-managed journals, users just select which ones they want

-- Create user_journals junction table for user's selected journals
CREATE TABLE user_journals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, source_id)
);

CREATE INDEX idx_user_journals_user_id ON user_journals(user_id);

-- Update sources table: keep user_id for custom journals, add scraping config fields
ALTER TABLE sources
  ADD COLUMN IF NOT EXISTS kci_journal_id VARCHAR(50),
  ADD COLUMN IF NOT EXISTS riss_journal_id VARCHAR(50),
  ADD COLUMN IF NOT EXISTS issn VARCHAR(20),
  ADD COLUMN IF NOT EXISTS description TEXT;

-- Clear old sources and add the real journals
DELETE FROM sources;

INSERT INTO sources (type, name, url, is_global, is_active, kci_journal_id, description) VALUES
  ('journal', '한국가족치료학회지', 'https://www.familytherapy.or.kr', true, true, NULL, '한국가족치료학회 공식 학술지'),
  ('journal', '한국상담학회지', 'https://www.counselors.or.kr', true, true, NULL, '한국상담학회 공식 학술지'),
  ('journal', '상담학연구', NULL, true, true, NULL, '상담 분야 주요 학술지'),
  ('journal', '한국심리학회지: 상담 및 심리치료', NULL, true, true, NULL, '한국심리학회 상담 및 심리치료 분과 학술지');

-- Auto-select all journals for existing users
INSERT INTO user_journals (user_id, source_id)
SELECT u.id, s.id
FROM users u
CROSS JOIN sources s
WHERE s.is_active = true;
