-- Cloudflare D1: apply once before enabling registrations.
CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL CHECK (project_id IN ('letter','confession','card','santa')),
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  thumbnail TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  consent_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TEXT,
  featured_by TEXT NOT NULL DEFAULT '',
  UNIQUE (project_id, url)
);
CREATE INDEX IF NOT EXISTS idx_submissions_approved ON submissions (project_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_submissions_pending ON submissions (status, created_at);
CREATE TABLE IF NOT EXISTS request_limits (
  client_hash TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  attempts INTEGER NOT NULL
);
