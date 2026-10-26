-- Seven-link finale. Kept separate from treats and rewards.
-- The actual message and claim tokens are stored only in D1.
CREATE TABLE IF NOT EXISTS last_letter_slots (
  slot INTEGER PRIMARY KEY CHECK (slot BETWEEN 1 AND 7),
  letter TEXT NOT NULL,
  claim_token TEXT NOT NULL UNIQUE,
  creator_name TEXT NOT NULL DEFAULT '',
  creator_note_id TEXT NOT NULL DEFAULT '',
  character_image_key TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS last_letter_claims (
  user_id TEXT NOT NULL,
  slot INTEGER NOT NULL,
  claimed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, slot),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (slot) REFERENCES last_letter_slots(slot) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS last_letter_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  is_published INTEGER NOT NULL DEFAULT 0 CHECK (is_published IN (0, 1))
);
