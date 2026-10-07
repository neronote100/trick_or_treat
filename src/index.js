const NOTE_ID_PATTERN = /^[a-z0-9_]{3,32}$/;
const IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
let schemaReady;

export default {
  async fetch(request, env) {
    try {
      return await route(request, env);
    } catch (error) {
      if (error instanceof PublicError) {
        return json({ error: error.message }, error.status);
      }
      console.error(error);
      return json({ error: "処理に失敗しました。少し待ってから、もう一度お試しください。" }, 500);
    }
  },
};

async function route(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: securityHeaders() });
  if (path.startsWith("/images/") && request.method === "GET") return serveImage(path, env);
  if (path.startsWith("/api/")) await ensureDatabase(env);

  if (path === "/api/users" && request.method === "POST") return registerUser(request, env);
  if (path === "/api/me" && request.method === "GET") return getMe(request, env);
  if (path === "/api/me/shop" && request.method === "PUT") return saveShop(request, env);
  if (path === "/api/me/shop/submit" && request.method === "POST") return submitShop(request, env);
  if (path === "/api/me/treats" && request.method === "POST") return addTreat(request, env);
  if (/^\/api\/me\/treats\/[^/]+$/.test(path) && request.method === "DELETE") {
    return deleteTreat(request, env, path.split("/").pop());
  }
  if (/^\/api\/shops\/[^/]+\/draw$/.test(path) && request.method === "POST") {
    return drawTreat(request, env, decodeURIComponent(path.split("/")[3]));
  }
  if (/^\/api\/shops\/[^/]+$/.test(path) && request.method === "GET") {
    return getShop(env, decodeURIComponent(path.split("/")[3]));
  }
  if (path === "/api/collection" && request.method === "GET") return getCollection(request, env);

  if (path === "/api/admin/shops" && request.method === "GET") return adminListShops(request, env, url);
  if (/^\/api\/admin\/shops\/[^/]+\/approve$/.test(path) && request.method === "POST") {
    return adminApproveShop(request, env, path.split("/")[4]);
  }
  if (/^\/api\/admin\/shops\/[^/]+\/suspend$/.test(path) && request.method === "POST") {
    return adminSuspendShop(request, env, path.split("/")[4]);
  }
  if (/^\/api\/admin\/shops\/[^/]+$/.test(path) && request.method === "DELETE") {
    return adminDeleteShop(request, env, path.split("/")[4]);
  }
  if (path === "/api/admin/reward" && request.method === "POST") return adminSaveReward(request, env);

  if (path.startsWith("/api/")) return json({ error: "見つかりませんでした。" }, 404);
  return env.ASSETS.fetch(request);
}

async function registerUser(request, env) {
  const body = await readJson(request);
  const noteId = normalizeNoteId(body.noteId);

  if (!NOTE_ID_PATTERN.test(noteId)) {
    return json({ error: "note IDは3〜32文字の英数字とアンダースコアで入力してください。" }, 400);
  }

  const existing = await env.DB.prepare("SELECT id FROM users WHERE note_id = ?").bind(noteId).first();
  if (!existing) {
    await env.DB.prepare(
      "INSERT INTO users (id, note_id, credential_hash, recovery_code_hash) VALUES (?, ?, '', '')",
    ).bind(crypto.randomUUID(), noteId).run();
  }

  return json({ noteId }, existing ? 200 : 201);
}

async function getMe(request, env) {
  const user = await requireUser(request, env);
  if (user.response) return user.response;
  return json(await loadMe(env, user.id));
}

async function saveShop(request, env) {
  const user = await requireUser(request, env);
  if (user.response) return user.response;

  const form = await request.formData();
  const name = cleanText(form.get("name"), 50);
  const description = cleanText(form.get("description"), 200);
  if (!name) return json({ error: "お店の名前を入力してください。" }, 400);

  const current = await env.DB.prepare(
    "SELECT id, character_image_key FROM shops WHERE owner_user_id = ?",
  ).bind(user.id).first();
  let characterKey = current?.character_image_key || null;
  const image = form.get("characterImage");
  const newKey = await storeImageIfPresent(image, env, "characters");
  if (newKey) characterKey = newKey;

  const shopId = current?.id || crypto.randomUUID();
  await env.DB.prepare(`
    INSERT INTO shops (id, owner_user_id, name, description, character_image_key)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(owner_user_id) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      character_image_key = excluded.character_image_key,
      updated_at = CURRENT_TIMESTAMP
  `).bind(shopId, user.id, name, description, characterKey).run();

  if (newKey && current?.character_image_key) await env.IMAGES.delete(current.character_image_key);
  return json(await loadMe(env, user.id));
}

async function addTreat(request, env) {
  const user = await requireUser(request, env);
  if (user.response) return user.response;
  const shop = await env.DB.prepare("SELECT id, status FROM shops WHERE owner_user_id = ?").bind(user.id).first();
  if (!shop) return json({ error: "先にお店を作ってください。" }, 400);

  const form = await request.formData();
  const name = cleanText(form.get("name"), 40);
  const rarity = ["normal", "rare", "secret"].includes(String(form.get("rarity")))
    ? String(form.get("rarity"))
    : "normal";
  const weight = rarity === "secret" ? 1 : rarity === "rare" ? 4 : 10;
  if (!name) return json({ error: "お菓子の名前を入力してください。" }, 400);
  const imageKey = await storeRequiredImage(form.get("image"), env, "treats");

  await env.DB.prepare(
    "INSERT INTO treats (id, shop_id, name, image_key, rarity, weight) VALUES (?, ?, ?, ?, ?, ?)",
  ).bind(crypto.randomUUID(), shop.id, name, imageKey, rarity, weight).run();

  return json(await loadMe(env, user.id), 201);
}

async function deleteTreat(request, env, treatId) {
  const user = await requireUser(request, env);
  if (user.response) return user.response;
  const treat = await env.DB.prepare(`
    SELECT t.id, t.image_key, s.id AS shop_id, s.status
    FROM treats t JOIN shops s ON s.id = t.shop_id
    WHERE t.id = ? AND s.owner_user_id = ?
  `).bind(treatId, user.id).first();
  if (!treat) return json({ error: "お菓子が見つかりません。" }, 404);

  await env.DB.prepare("DELETE FROM treats WHERE id = ?").bind(treat.id).run();
  await env.IMAGES.delete(treat.image_key);
  if (treat.status === "published") {
    const remaining = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM treats WHERE shop_id = ? AND is_active = 1",
    ).bind(treat.shop_id).first();
    if (!Number(remaining.count)) {
      await env.DB.prepare("UPDATE shops SET status = 'draft', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(treat.shop_id).run();
    }
  }
  return json(await loadMe(env, user.id));
}

async function submitShop(request, env) {
  const user = await requireUser(request, env);
  if (user.response) return user.response;
  const shop = await env.DB.prepare(`
    SELECT s.id, s.character_image_key, s.status,
      (SELECT COUNT(*) FROM treats t WHERE t.shop_id = s.id AND t.is_active = 1) AS treat_count
    FROM shops s WHERE s.owner_user_id = ?
  `).bind(user.id).first();
  if (!shop?.character_image_key) return json({ error: "キャラクター画像を登録してください。" }, 400);
  if (!shop.treat_count) return json({ error: "お菓子を1つ以上登録してください。" }, 400);
  if (shop.status === "suspended") {
    return json({ error: "このお店は管理者によって公開停止されています。" }, 403);
  }

  await env.DB.prepare("UPDATE shops SET status = 'published', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(shop.id).run();
  return json({ status: "published" });
}

async function getShop(env, noteIdRaw) {
  const noteId = normalizeNoteId(noteIdRaw);
  const shop = await env.DB.prepare(`
    SELECT s.id, s.name, s.description, s.character_image_key, u.note_id
    FROM shops s JOIN users u ON u.id = s.owner_user_id
    WHERE u.note_id = ? AND s.status = 'published'
  `).bind(noteId).first();
  if (!shop) return json({ error: "このお店はまだ開店していません。" }, 404);
  const treats = await env.DB.prepare(
    "SELECT id FROM treats WHERE shop_id = ? AND is_active = 1 ORDER BY created_at",
  ).bind(shop.id).all();
  return json({
    shop: publicShop({ ...shop, treat_count: treats.results.length }),
  });
}

async function drawTreat(request, env, noteIdRaw) {
  const user = await requireVisitor(request, env);
  if (user.response) return user.response;
  const noteId = normalizeNoteId(noteIdRaw);
  const shop = await env.DB.prepare(`
    SELECT s.id, s.name, u.note_id
    FROM shops s JOIN users u ON u.id = s.owner_user_id
    WHERE u.note_id = ? AND s.status = 'published'
  `).bind(noteId).first();
  if (!shop) return json({ error: "このお店はまだ開店していません。" }, 404);

  const treatRows = await env.DB.prepare(
    "SELECT id, name, image_key, rarity, weight FROM treats WHERE shop_id = ? AND is_active = 1",
  ).bind(shop.id).all();
  if (!treatRows.results.length) return json({ error: "お菓子は準備中です。" }, 409);
  const treat = weightedPick(treatRows.results);

  const before = await env.DB.prepare(
    "SELECT obtained_count FROM collection_items WHERE user_id = ? AND treat_id = ?",
  ).bind(user.id, treat.id).first();
  await env.DB.prepare(`
    INSERT INTO collection_items (user_id, treat_id)
    VALUES (?, ?)
    ON CONFLICT(user_id, treat_id) DO UPDATE SET obtained_count = obtained_count + 1
  `).bind(user.id, treat.id).run();

  const countRow = await env.DB.prepare(`
    SELECT COUNT(DISTINCT t.shop_id) AS count
    FROM collection_items c JOIN treats t ON t.id = c.treat_id
    WHERE c.user_id = ?
  `).bind(user.id).first();
  const shopCount = Number(countRow?.count || 0);
  const rewards = await env.DB.prepare(
    "SELECT id, name, required_shop_count, image_key FROM rewards WHERE is_active = 1 AND required_shop_count <= ?",
  ).bind(shopCount).all();
  const unlocked = [];
  for (const reward of rewards.results) {
    const result = await env.DB.prepare(
      "INSERT OR IGNORE INTO user_rewards (user_id, reward_id) VALUES (?, ?)",
    ).bind(user.id, reward.id).run();
    if (result.meta.changes) unlocked.push(publicReward(reward));
  }

  return json({
    treat: { id: treat.id, name: treat.name, rarity: treat.rarity, imageUrl: imageUrl(treat.image_key) },
    shop: { name: shop.name, noteId: shop.note_id },
    isNew: !before,
    obtainedCount: Number(before?.obtained_count || 0) + 1,
    shopCount,
    unlocked,
  });
}

async function getCollection(request, env) {
  const user = await requireVisitor(request, env);
  if (user.response) return user.response;
  const items = await env.DB.prepare(`
    SELECT c.first_obtained_at, c.obtained_count,
      t.id, t.name, t.rarity, t.image_key,
      s.name AS shop_name, u.note_id
    FROM collection_items c
    JOIN treats t ON t.id = c.treat_id
    JOIN shops s ON s.id = t.shop_id
    JOIN users u ON u.id = s.owner_user_id
    WHERE c.user_id = ?
    ORDER BY c.first_obtained_at DESC
  `).bind(user.id).all();
  const rewards = await env.DB.prepare(`
    SELECT r.id, r.name, r.required_shop_count, r.image_key, ur.unlocked_at
    FROM user_rewards ur JOIN rewards r ON r.id = ur.reward_id
    WHERE ur.user_id = ? ORDER BY ur.unlocked_at DESC
  `).bind(user.id).all();
  const shops = await env.DB.prepare(`
    SELECT s.name, s.character_image_key, u.note_id,
      COUNT(DISTINCT c.treat_id) AS collected_count,
      MAX(c.first_obtained_at) AS last_visited_at
    FROM collection_items c
    JOIN treats t ON t.id = c.treat_id
    JOIN shops s ON s.id = t.shop_id
    JOIN users u ON u.id = s.owner_user_id
    WHERE c.user_id = ?
    GROUP BY s.id
    ORDER BY last_visited_at DESC
  `).bind(user.id).all();
  const shopIds = new Set(items.results.map((item) => item.note_id));
  return json({
    shopCount: shopIds.size,
    goal: 10,
    shops: shops.results.map((shop) => ({
      noteId: shop.note_id,
      name: shop.name,
      characterImageUrl: imageUrl(shop.character_image_key),
      collectedCount: Number(shop.collected_count || 0),
      lastVisitedAt: shop.last_visited_at,
    })),
    items: items.results.map((item) => ({
      id: item.id,
      name: item.name,
      rarity: item.rarity,
      imageUrl: imageUrl(item.image_key),
      shopName: item.shop_name,
      noteId: item.note_id,
      obtainedCount: item.obtained_count,
      firstObtainedAt: item.first_obtained_at,
    })),
    rewards: rewards.results.map(publicReward),
  });
}

async function adminListShops(request, env, url) {
  if (!isAdmin(request, env)) return json({ error: "管理者キーが違います。" }, 401);
  const status = ["draft", "pending", "published", "suspended"].includes(url.searchParams.get("status"))
    ? url.searchParams.get("status")
    : null;
  const sql = `
    SELECT s.id, s.name, s.description, s.character_image_key, s.status, u.note_id,
      (SELECT COUNT(*) FROM treats t WHERE t.shop_id = s.id) AS treat_count
    FROM shops s JOIN users u ON u.id = s.owner_user_id
    ${status ? "WHERE s.status = ?" : ""}
    ORDER BY s.updated_at DESC
  `;
  const statement = env.DB.prepare(sql);
  const rows = status ? await statement.bind(status).all() : await statement.all();
  return json({ shops: rows.results.map(publicShop) });
}

async function adminApproveShop(request, env, shopId) {
  if (!isAdmin(request, env)) return json({ error: "管理者キーが違います。" }, 401);
  const result = await env.DB.prepare(
    "UPDATE shops SET status = 'published', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status IN ('pending', 'suspended')",
  ).bind(shopId).run();
  if (!result.meta.changes) return json({ error: "対象のお店が見つかりません。" }, 404);
  return json({ status: "published" });
}

async function adminSuspendShop(request, env, shopId) {
  if (!isAdmin(request, env)) return json({ error: "管理者キーが違います。" }, 401);
  const result = await env.DB.prepare(
    "UPDATE shops SET status = 'suspended', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
  ).bind(shopId).run();
  if (!result.meta.changes) return json({ error: "対象のお店が見つかりません。" }, 404);
  return json({ status: "suspended" });
}

async function adminDeleteShop(request, env, shopId) {
  if (!isAdmin(request, env)) return json({ error: "管理者キーが違います。" }, 401);

  const shop = await env.DB.prepare(
    "SELECT id, character_image_key FROM shops WHERE id = ?",
  ).bind(shopId).first();
  if (!shop) return json({ error: "対象のお店が見つかりません。" }, 404);

  const treats = await env.DB.prepare(
    "SELECT image_key FROM treats WHERE shop_id = ?",
  ).bind(shopId).all();

  await env.DB.batch([
    env.DB.prepare(
      "DELETE FROM collection_items WHERE treat_id IN (SELECT id FROM treats WHERE shop_id = ?)",
    ).bind(shopId),
    env.DB.prepare("DELETE FROM treats WHERE shop_id = ?").bind(shopId),
    env.DB.prepare("DELETE FROM shops WHERE id = ?").bind(shopId),
  ]);

  const imageKeys = [
    shop.character_image_key,
    ...treats.results.map((treat) => treat.image_key),
  ].filter(Boolean);
  await Promise.allSettled(imageKeys.map((key) => env.IMAGES.delete(key)));

  return json({ deleted: true });
}

async function adminSaveReward(request, env) {
  if (!isAdmin(request, env)) return json({ error: "管理者キーが違います。" }, 401);
  const form = await request.formData();
  const name = cleanText(form.get("name"), 50) || "10店舗コンプリート";
  const requiredShopCount = Math.max(1, Math.min(100, Number(form.get("requiredShopCount") || 10)));
  const imageKey = await storeRequiredImage(form.get("image"), env, "rewards");
  await env.DB.prepare("UPDATE rewards SET is_active = 0 WHERE required_shop_count = ?")
    .bind(requiredShopCount).run();
  await env.DB.prepare(
    "INSERT INTO rewards (id, name, required_shop_count, image_key) VALUES (?, ?, ?, ?)",
  ).bind(crypto.randomUUID(), name, requiredShopCount, imageKey).run();
  return json({ ok: true }, 201);
}

async function loadMe(env, userId) {
  const user = await env.DB.prepare("SELECT note_id, created_at FROM users WHERE id = ?").bind(userId).first();
  const shop = await env.DB.prepare(`
    SELECT id, name, description, character_image_key, status
    FROM shops WHERE owner_user_id = ?
  `).bind(userId).first();
  let treats = [];
  if (shop) {
    const rows = await env.DB.prepare(
      "SELECT id, name, image_key, rarity, weight FROM treats WHERE shop_id = ? ORDER BY created_at",
    ).bind(shop.id).all();
    treats = rows.results.map((treat) => ({
      id: treat.id,
      name: treat.name,
      rarity: treat.rarity,
      weight: treat.weight,
      imageUrl: imageUrl(treat.image_key),
    }));
  }
  return {
    user: { noteId: user.note_id, createdAt: user.created_at },
    shop: shop ? {
      id: shop.id,
      name: shop.name,
      description: shop.description,
      status: shop.status,
      characterImageUrl: imageUrl(shop.character_image_key),
      sharePath: `/#/shop/${user.note_id}`,
    } : null,
    treats,
  };
}

async function requireUser(request, env) {
  return requireVisitor(request, env);
}

async function requireVisitor(request, env) {
  const noteId = normalizeNoteId(request.headers.get("x-note-id"));
  if (!NOTE_ID_PATTERN.test(noteId)) {
    return { response: json({ error: "参加IDを入力してください。", code: "AUTH_REQUIRED" }, 401) };
  }
  const user = await env.DB.prepare("SELECT id, note_id FROM users WHERE note_id = ?").bind(noteId).first();
  if (!user) return { response: json({ error: "参加IDを確認してください。", code: "AUTH_INVALID" }, 401) };
  return user;
}

async function serveImage(path, env) {
  const key = path.slice("/images/".length).split("/").map(decodeURIComponent).join("/");
  const object = await env.IMAGES.getWithMetadata(key, { type: "arrayBuffer" });
  if (!object.value) return new Response("Not found", { status: 404, headers: securityHeaders() });
  const headers = securityHeaders();
  headers.set("content-type", object.metadata?.contentType || "application/octet-stream");
  headers.set("cache-control", "public, max-age=31536000, immutable");
  headers.set("x-content-type-options", "nosniff");
  return new Response(object.value, { headers });
}

async function storeRequiredImage(value, env, folder) {
  const key = await storeImageIfPresent(value, env, folder);
  if (!key) throw new PublicError("画像を選んでください。", 400);
  return key;
}

async function storeImageIfPresent(value, env, folder) {
  if (!value || typeof value.arrayBuffer !== "function" || !value.size) return null;
  if (value.size > MAX_IMAGE_BYTES) throw new PublicError("画像は5MB以下にしてください。", 400);
  const extension = IMAGE_TYPES.get(value.type);
  if (!extension) throw new PublicError("PNG・JPEG・WebP・GIFの画像を選んでください。", 400);
  const key = `${folder}/${crypto.randomUUID()}.${extension}`;
  await env.IMAGES.put(key, await value.arrayBuffer(), {
    metadata: { contentType: value.type },
  });
  return key;
}

function ensureDatabase(env) {
  if (!schemaReady) {
    const statements = [
      `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        note_id TEXT NOT NULL UNIQUE COLLATE NOCASE,
        credential_hash TEXT NOT NULL,
        recovery_code_hash TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS shops (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        character_image_key TEXT,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'published', 'suspended')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS treats (
        id TEXT PRIMARY KEY,
        shop_id TEXT NOT NULL,
        name TEXT NOT NULL,
        image_key TEXT NOT NULL,
        rarity TEXT NOT NULL DEFAULT 'normal' CHECK (rarity IN ('normal', 'rare', 'secret')),
        weight INTEGER NOT NULL DEFAULT 10 CHECK (weight BETWEEN 1 AND 100),
        is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS collection_items (
        user_id TEXT NOT NULL,
        treat_id TEXT NOT NULL,
        first_obtained_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        obtained_count INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (user_id, treat_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (treat_id) REFERENCES treats(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS rewards (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        required_shop_count INTEGER NOT NULL DEFAULT 10,
        image_key TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS user_rewards (
        user_id TEXT NOT NULL,
        reward_id TEXT NOT NULL,
        unlocked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, reward_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (reward_id) REFERENCES rewards(id) ON DELETE CASCADE
      )`,
      "CREATE INDEX IF NOT EXISTS idx_shops_status ON shops(status)",
      "CREATE INDEX IF NOT EXISTS idx_treats_shop_active ON treats(shop_id, is_active)",
      "CREATE INDEX IF NOT EXISTS idx_collection_user ON collection_items(user_id)",
    ];
    schemaReady = env.DB.batch(statements.map((statement) => env.DB.prepare(statement))).catch((error) => {
      schemaReady = undefined;
      throw error;
    });
  }
  return schemaReady;
}

function weightedPick(items) {
  const total = items.reduce((sum, item) => sum + Number(item.weight || 1), 0);
  let point = Math.random() * total;
  for (const item of items) {
    point -= Number(item.weight || 1);
    if (point <= 0) return item;
  }
  return items.at(-1);
}

function publicShop(shop) {
  return {
    id: shop.id,
    noteId: shop.note_id,
    name: shop.name,
    description: shop.description,
    characterImageUrl: imageUrl(shop.character_image_key),
    treatCount: Number(shop.treat_count || 0),
    status: shop.status,
  };
}

function publicReward(reward) {
  return {
    id: reward.id,
    name: reward.name,
    requiredShopCount: Number(reward.required_shop_count),
    imageUrl: imageUrl(reward.image_key),
    unlockedAt: reward.unlocked_at,
  };
}

function imageUrl(key) {
  if (!key) return null;
  return `/images/${key.split("/").map(encodeURIComponent).join("/")}`;
}

function normalizeNoteId(value) {
  return String(value || "").trim().toLowerCase();
}

function cleanText(value, maxLength) {
  return String(value || "").replace(/\r\n?/g, "\n").trim().slice(0, maxLength);
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new PublicError("入力内容を確認してください。", 400);
  }
}

function isAdmin(request, env) {
  const token = request.headers.get("x-admin-token");
  return Boolean(env.ADMIN_TOKEN && token && token === env.ADMIN_TOKEN);
}

function securityHeaders() {
  return new Headers({
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
  });
}

function json(data, status = 200) {
  const headers = securityHeaders();
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { status, headers });
}

class PublicError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}
