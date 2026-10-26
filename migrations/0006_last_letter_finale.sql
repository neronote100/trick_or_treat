-- One administrator-uploaded WebP finale per Last Letter campaign.
-- Keep this in a new table to preserve pre-existing card URLs and claims.
CREATE TABLE IF NOT EXISTS last_letter_finale (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  image_key TEXT,
  headline TEXT NOT NULL DEFAULT '遊んでくれてありがとう✨',
  sub_message TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
