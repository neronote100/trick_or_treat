PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL UNIQUE COLLATE NOCASE,
  credential_hash TEXT NOT NULL,
  recovery_code_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE shops (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  character_image_key TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending', 'published', 'suspended')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE treats (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL,
  name TEXT NOT NULL,
  image_key TEXT NOT NULL,
  rarity TEXT NOT NULL DEFAULT 'normal'
    CHECK (rarity IN ('normal', 'rare', 'secret')),
  weight INTEGER NOT NULL DEFAULT 10 CHECK (weight BETWEEN 1 AND 100),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE
);

CREATE TABLE collection_items (
  user_id TEXT NOT NULL,
  treat_id TEXT NOT NULL,
  first_obtained_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  obtained_count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, treat_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (treat_id) REFERENCES treats(id) ON DELETE CASCADE
);

CREATE TABLE rewards (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  required_shop_count INTEGER NOT NULL DEFAULT 10,
  image_key TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_rewards (
  user_id TEXT NOT NULL,
  reward_id TEXT NOT NULL,
  unlocked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, reward_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (reward_id) REFERENCES rewards(id) ON DELETE CASCADE
);

CREATE INDEX idx_shops_status ON shops(status);
CREATE INDEX idx_treats_shop_active ON treats(shop_id, is_active);
CREATE INDEX idx_collection_user ON collection_items(user_id);
