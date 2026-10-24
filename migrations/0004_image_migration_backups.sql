-- Persist the originals for a manual rollback window when upgrading KV images.
-- Keep at least 24h because Cloudflare KV image reads may be eventually consistent.
CREATE TABLE IF NOT EXISTS image_migration_backups (
  source_key TEXT PRIMARY KEY,
  webp_key TEXT NOT NULL UNIQUE,
  before_bytes INTEGER NOT NULL,
  after_bytes INTEGER NOT NULL,
  migrated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
