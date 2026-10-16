-- Top-level event cover image stored in Cloudflare KV.
-- The database only records the stable reference, so swapping the cover
-- does not affect shops, collections, or gate rewards.
CREATE TABLE IF NOT EXISTS site_branding (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  hero_image_key TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
