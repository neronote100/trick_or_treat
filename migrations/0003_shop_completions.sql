-- Persist each user's first completion of a shop's currently active candy set.
-- New candies do not revoke an existing completion.
CREATE TABLE IF NOT EXISTS shop_completions (
  user_id TEXT NOT NULL,
  shop_id TEXT NOT NULL,
  completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, shop_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE
);
