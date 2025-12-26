-- App settings table for storing global configuration
-- Includes AI prompts that can be edited from the settings page

CREATE TABLE IF NOT EXISTS app_settings (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE app_settings IS 'Global application settings (AI prompts, etc.)';
