-- One organizer-uploaded 3:1 artwork, with three 1:1 crops made automatically in the browser.
-- 10 shops = left, 20 shops = right, 30 shops = center + full illustration.
CREATE TABLE IF NOT EXISTS triptych_illustrations (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL,
  full_image_key TEXT NOT NULL,
  left_image_key TEXT NOT NULL,
  center_image_key TEXT NOT NULL,
  right_image_key TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
