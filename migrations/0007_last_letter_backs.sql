-- Add seven independent reverse-side illustrations without touching existing fronts,
-- final artwork, issued links, or existing visitor claims.
CREATE TABLE IF NOT EXISTS last_letter_backs (
  slot INTEGER PRIMARY KEY CHECK (slot BETWEEN 1 AND 7),
  image_key TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (slot) REFERENCES last_letter_slots(slot) ON DELETE CASCADE
);
