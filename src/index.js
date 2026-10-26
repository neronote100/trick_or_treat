const NOTE_ID_PATTERN = /^[a-z0-9_]{3,32}$/;
const IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
// The collection's final milestone is 100 unique shops; draws remain unlimited.
const HALLOWEEN_STAGES = [
  { requiredShopCount: 10, name: "最初の城門", description: "最初のご褒美を受け取り、次の世界へ！" },
  { requiredShopCount: 20, name: "魔女の森", description: "森の奥へ続く道が開かれた。" },
  { requiredShopCount: 30, name: "月影の古城", description: "ここから先には秘密のエリアが……。" },
  { requiredShopCount: 50, name: "秘密の魔法街", description: "隠された魔法の街を発見！" },
  { requiredShopCount: 75, name: "幻の月夜宮殿", description: "最後の扉が姿を現す。" },
  { requiredShopCount: 100, name: "王子の秘密宝物庫", description: "すべての世界をめぐった、最高の冒険者へ！" },
];
const FINAL_SHOP_GOAL = 100;
// Seven characters, seven independently claimable boards. The answer is kept
// on the Worker, never embedded in public JavaScript or unclaimed API records.
const LAST_LETTER_CHARS = ["み", "ん", "な", "の", "思", "い", "出"];
const LAST_LETTER_BACK = ["あ", "つ", "ま", "っ", "た", "ね", "🎃"];
// Stable IDs make syncing idempotent: each crop always owns the same reward slot.
const TRIPTYCH_GATE_REWARDS = [
  { id: "triptych-gate-10", count: 10, name: "10店舗・左の欠片", imageColumn: "left_image_key" },
  { id: "triptych-gate-20", count: 20, name: "20店舗・右の欠片", imageColumn: "right_image_key" },
  { id: "triptych-gate-30", count: 30, name: "30店舗・中央の欠片", imageColumn: "center_image_key" },
];
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

  const shopPageMatch = path.match(/^\/shop\/([a-z0-9_]{3,32})\/?$/i);
  if (shopPageMatch && request.method === "GET") {
    await ensureDatabase(env);
    return serveShopPage(request, env, shopPageMatch[1]);
  }

  const letterPageMatch = path.match(/^\/letter\/([a-f0-9]{32})\/?$/i);
  if (letterPageMatch && request.method === "GET") {
    const destination = new URL("/#/last-letter/" + letterPageMatch[1].toLowerCase(), request.url);
    return Response.redirect(destination.toString(), 302);
  }

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
  if (path === "/api/last-letter" && request.method === "GET") return getLastLetterCollection(request, env);
  if (path === "/api/last-letter/claim" && request.method === "POST") return claimLastLetter(request, env);
  if (path === "/api/admin/last-letter" && request.method === "GET") return adminGetLastLetter(request, env);
  if (path === "/api/admin/last-letter/initialize" && request.method === "POST") return adminInitializeLastLetter(request, env);
  if (path === "/api/admin/last-letter/slot" && request.method === "POST") return adminSaveLastLetterSlot(request, env);
  if (path === "/api/admin/last-letter/finale" && request.method === "POST") return adminSaveLastLetterFinale(request, env);
  if (path === "/api/admin/last-letter/visibility" && request.method === "POST") return adminSetLastLetterVisibility(request, env);

  if (path === "/api/admin/shops" && request.method === "GET") return adminListShops(request, env, url);
  if (path === "/api/admin/participants" && request.method === "GET") return adminListParticipants(request, env, url);
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
  if (path === "/api/admin/triptych" && request.method === "POST") return adminSaveTriptych(request, env);
  if (path === "/api/admin/image-migration" && request.method === "GET") return adminListImageMigration(request, env, url);
  if (path === "/api/admin/image-migration" && request.method === "POST") return adminMigrateImage(request, env);
  if (path === "/api/admin/image-migration/restore" && request.method === "POST") return adminRestoreMigratedImage(request, env);
  if (path === "/api/admin/image-migration/cleanup" && request.method === "POST") return adminCleanupImageBackups(request, env);

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
  // Keep the full candy count a secret on the public drawing screen.
  // Owner/admin endpoints may still report it for managing their shops.
  return json({
    shop: {
      noteId: shop.note_id,
      name: shop.name,
      description: shop.description,
      characterImageUrl: imageUrl(shop.character_image_key),
    },
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
  const visitedShopBefore = await env.DB.prepare(`
    SELECT 1 FROM collection_items c
    JOIN treats t ON t.id = c.treat_id
    WHERE c.user_id = ? AND t.shop_id = ? LIMIT 1
  `).bind(user.id, shop.id).first();

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
  const previousShopCount = shopCount - (visitedShopBefore ? 0 : 1);
  const clearedStages = HALLOWEEN_STAGES.filter(
    (stage) => previousShopCount < stage.requiredShopCount && shopCount >= stage.requiredShopCount,
  );
  if (shopCount >= 10) await syncTriptychGateRewards(env);
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

  const triptychRow = clearedStages.some((stage) => stage.requiredShopCount <= 30)
    ? await env.DB.prepare("SELECT * FROM triptych_illustrations WHERE id = 1").first()
    : null;
  return json({
    ...(triptychRow ? { triptych: publicTriptych(triptychRow, shopCount) } : {}),
    treat: { id: treat.id, name: treat.name, rarity: treat.rarity, imageUrl: imageUrl(treat.image_key) },
    shop: { name: shop.name, noteId: shop.note_id },
    isNew: !before,
    obtainedCount: Number(before?.obtained_count || 0) + 1,
    shopCount,
    goal: FINAL_SHOP_GOAL,
    clearedStages,
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
  // Heal pre-existing triptych uploads and retroactively grant gate rewards.
  const shopCount = new Set(items.results.map((item) => item.note_id)).size;
  if (shopCount >= 10) await syncTriptychGateRewards(env);
  await env.DB.prepare(`
    INSERT OR IGNORE INTO user_rewards (user_id, reward_id)
    SELECT ?, id FROM rewards WHERE is_active = 1 AND required_shop_count <= ?
  `).bind(user.id, shopCount).run();
  const rewards = await env.DB.prepare(`
    SELECT r.id, r.name, r.required_shop_count, r.image_key, ur.unlocked_at
    FROM user_rewards ur JOIN rewards r ON r.id = ur.reward_id
    WHERE ur.user_id = ? AND r.is_active = 1
    ORDER BY r.required_shop_count ASC
  `).bind(user.id).all();
  const triptych = await env.DB.prepare(
    "SELECT * FROM triptych_illustrations WHERE id = 1",
  ).first();
  const shops = await env.DB.prepare(`
    SELECT s.name, s.character_image_key, u.note_id,
      COUNT(DISTINCT c.treat_id) AS collected_count,
      MAX(c.first_obtained_at) AS last_visited_at,
      (
        EXISTS (
          SELECT 1 FROM treats active_t
          WHERE active_t.shop_id = s.id AND active_t.is_active = 1
        )
        AND NOT EXISTS (
          SELECT 1 FROM treats missing_t
          WHERE missing_t.shop_id = s.id AND missing_t.is_active = 1
          AND NOT EXISTS (
            SELECT 1 FROM collection_items owned_c
            WHERE owned_c.user_id = ? AND owned_c.treat_id = missing_t.id
          )
        )
      ) AS is_complete
    FROM collection_items c
    JOIN treats t ON t.id = c.treat_id
    JOIN shops s ON s.id = t.shop_id
    JOIN users u ON u.id = s.owner_user_id
    WHERE c.user_id = ?
    GROUP BY s.id
    ORDER BY last_visited_at DESC
  `).bind(user.id, user.id).all();
  return json({
    shopCount,
    goal: FINAL_SHOP_GOAL,
    stages: visibleStages(shopCount),
    triptych: publicTriptych(triptych, shopCount),
    shops: shops.results.map((shop) => ({
      noteId: shop.note_id,
      name: shop.name,
      characterImageUrl: imageUrl(shop.character_image_key),
      collectedCount: Number(shop.collected_count || 0),
      isComplete: Boolean(shop.is_complete),
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

// Dashboard data is admin-only. Registration uses a note ID without verification,
// so this is a list of registered IDs, not a verified list of human identities.
// Each page is bounded to 25 rows; database-side aggregation prevents an N+1 query.

async function adminGetLastLetter(request, env) {
  if (!isAdmin(request, env)) return json({ error: "管理者キーが違います。" }, 401);
  const [settings, slots, totalClaims, finale] = await Promise.all([
    env.DB.prepare("SELECT is_published FROM last_letter_settings WHERE id = 1").first(),
    env.DB.prepare(`SELECT l.slot, l.letter, l.claim_token, l.creator_name, l.creator_note_id,
      l.character_image_key, b.image_key AS back_image_key
      FROM last_letter_slots l LEFT JOIN last_letter_backs b ON b.slot = l.slot
      ORDER BY l.slot`).all(),
    env.DB.prepare("SELECT COUNT(DISTINCT user_id) AS participants FROM last_letter_claims").first(),
    env.DB.prepare("SELECT image_key, headline, sub_message FROM last_letter_finale WHERE id = 1").first(),
  ]);
  return json({
    initialized: slots.results.length === 7,
    published: Boolean(settings?.is_published),
    finale: {
      imageUrl: imageUrl(finale?.image_key),
      headline: finale?.headline || "遊んでくれてありがとう✨",
      subMessage: finale?.sub_message ?? "みんなで集めてくれて、ありがとう。あなたと過ごしたハロハロウィーンの思い出は、王子の宝物です🌙",
    },
    slots: slots.results.map((row) => ({
      slot: row.slot,
      letter: row.letter,
      token: row.claim_token,
      creatorName: row.creator_name,
      creatorNoteId: row.creator_note_id,
      characterImageUrl: imageUrl(row.character_image_key),
      backImageUrl: imageUrl(row.back_image_key),
      path: `/letter/${row.claim_token}`,
    })),
    participants: Number(totalClaims?.participants || 0),
  });
}

async function adminInitializeLastLetter(request, env) {
  if (!isAdmin(request, env)) return json({ error: "管理者キーが違います。" }, 401);
  // Idempotent: calling twice must never invalidate an already shared link.
  await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO last_letter_settings (id, is_published) VALUES (1, 0)"),
    ...LAST_LETTER_CHARS.map((letter, index) => env.DB.prepare(
      "INSERT OR IGNORE INTO last_letter_slots (slot, letter, claim_token) VALUES (?, ?, ?)",
    ).bind(index + 1, letter, crypto.randomUUID().replace(/-/g, ""))),
  ]);
  return adminGetLastLetter(request, env);
}

async function adminSaveLastLetterSlot(request, env) {
  if (!isAdmin(request, env)) return json({ error: "管理者キーが違います。" }, 401);
  const form = await request.formData();
  const slot = Number(form.get("slot"));
  if (!Number.isInteger(slot) || slot < 1 || slot > 7) {
    return json({ error: "ボード番号は1〜7を指定してください。" }, 400);
  }
  const creatorName = cleanText(form.get("creatorName"), 50);
  const creatorNoteId = normalizeNoteId(form.get("creatorNoteId"));
  if (!creatorName) return json({ error: "クリエイター名を入力してください。" }, 400);
  if (creatorNoteId && !NOTE_ID_PATTERN.test(creatorNoteId)) {
    return json({ error: "note IDは英数字・アンダースコア3〜32文字です。" }, 400);
  }
  const existing = await env.DB.prepare(
    "SELECT character_image_key FROM last_letter_slots WHERE slot = ?",
  ).bind(slot).first();
  if (!existing) return json({ error: "先に7つのURLを発行してください。" }, 409);
  // Letter cards are *finished square artworks* including the character and
  // the letter board. Store WebP only so they display exactly as uploaded.
  // Metadata-only edits keep the previously uploaded image unchanged.
  const uploadedImage = form.get("image");
  const uploadedBack = form.get("backImage");
  async function saveWebpFile(file, label) {
    if (!file || !file.size) return null;
    if (file.type !== "image/webp" || file.size > MAX_IMAGE_BYTES) {
      throw new PublicError(`${label}は5MB以下のWebP形式にしてください。`, 400);
    }
    const bytes = await file.arrayBuffer();
    const header = new Uint8Array(bytes.slice(0, 12));
    if (header.length < 12 || String.fromCharCode(...header.slice(0, 4)) !== "RIFF"
      || String.fromCharCode(...header.slice(8, 12)) !== "WEBP") {
      throw new PublicError(`${label}のWebP画像データを確認できません。`, 400);
    }
    const key = `letters/${crypto.randomUUID()}.webp`;
    await env.IMAGES.put(key, bytes, { metadata: { contentType: "image/webp" } });
    return key;
  }

  const keysToClean = [];
  try {
    const newFrontKey = await saveWebpFile(uploadedImage, "表面イラスト");
    if (newFrontKey) keysToClean.push(newFrontKey);
    const newBackKey = await saveWebpFile(uploadedBack, "裏面イラスト");
    if (newBackKey) keysToClean.push(newBackKey);
    const statements = [env.DB.prepare(`UPDATE last_letter_slots
      SET creator_name = ?, creator_note_id = ?, character_image_key = ?, updated_at = CURRENT_TIMESTAMP
      WHERE slot = ?`).bind(creatorName, creatorNoteId, newFrontKey || existing.character_image_key, slot)];
    if (newBackKey) {
      statements.push(env.DB.prepare(`
        INSERT INTO last_letter_backs (slot, image_key) VALUES (?, ?)
        ON CONFLICT(slot) DO UPDATE SET image_key = excluded.image_key, updated_at = CURRENT_TIMESTAMP
      `).bind(slot, newBackKey));
    }
    await env.DB.batch(statements);
  } catch (error) {
    await Promise.all(keysToClean.map((key) => env.IMAGES.delete(key).catch(() => {})));
    throw error;
  }
  // Do not delete previously referenced images: edges may still have cached URLs.
  return json({ saved: true, slot });
}

async function adminSaveLastLetterFinale(request, env) {
  if (!isAdmin(request, env)) return json({ error: "管理者キーが違います。" }, 401);
  const form = await request.formData();
  const headline = cleanText(form.get("headline"), 80);
  const subMessage = cleanText(form.get("subMessage"), 240);
  if (!headline) return json({ error: "最後に表示するメッセージを入力してください。" }, 400);

  // Never discard an existing artwork for a text-only edit.
  const existing = await env.DB.prepare(
    "SELECT image_key FROM last_letter_finale WHERE id = 1",
  ).first();
  const artwork = form.get("image");
  let newKey = null;
  if (artwork && artwork.size) {
    if (artwork.type !== "image/webp" || artwork.size > MAX_IMAGE_BYTES) {
      return json({ error: "特別イラストは5MB以下のWebP形式で登録してください。" }, 400);
    }
    const bytes = await artwork.arrayBuffer();
    const header = new Uint8Array(bytes.slice(0, 12));
    if (header.length < 12 || String.fromCharCode(...header.slice(0, 4)) !== "RIFF"
      || String.fromCharCode(...header.slice(8, 12)) !== "WEBP") {
      return json({ error: "WebP形式の画像データを確認できません。" }, 400);
    }
    newKey = `letters/${crypto.randomUUID()}.webp`;
    await env.IMAGES.put(newKey, bytes, { metadata: { contentType: "image/webp" } });
  }
  try {
    await env.DB.prepare(`
      INSERT INTO last_letter_finale (id, image_key, headline, sub_message)
      VALUES (1, ?, ?, ?)
      ON CONFLICT (id) DO UPDATE SET
        image_key = excluded.image_key, headline = excluded.headline,
        sub_message = excluded.sub_message, updated_at = CURRENT_TIMESTAMP
    `).bind(newKey || existing?.image_key || null, headline, subMessage).run();
  } catch (error) {
    if (newKey) await env.IMAGES.delete(newKey).catch(() => {});
    throw error;
  }
  // An older image remains in KV: viewers may still have cached its URL.
  return json({ saved: true, imageUrl: imageUrl(newKey || existing?.image_key), headline, subMessage });
}

async function adminSetLastLetterVisibility(request, env) {
  if (!isAdmin(request, env)) return json({ error: "管理者キーが違います。" }, 401);
  const input = await readJson(request);
  if (typeof input.published !== "boolean") return json({ error: "公開設定が不正です。" }, 400);
  const [slots, finale] = await Promise.all([
    env.DB.prepare(`SELECT l.slot, l.creator_name, l.character_image_key,
      b.image_key AS back_image_key FROM last_letter_slots l
      LEFT JOIN last_letter_backs b ON b.slot = l.slot ORDER BY l.slot`).all(),
    env.DB.prepare("SELECT image_key FROM last_letter_finale WHERE id = 1").first(),
  ]);
  if (input.published && (slots.results.length !== 7 ||
    slots.results.some((card) => !card.creator_name || !card.character_image_key || !card.back_image_key)
    || !finale?.image_key)) {
    return json({ error: "表7枚・裏7枚・最後の特別イラストの全15枚を登録してから公開してください。" }, 409);
  }
  await env.DB.prepare("INSERT INTO last_letter_settings (id, is_published) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET is_published = excluded.is_published")
    .bind(Number(input.published)).run();
  return json({ published: input.published });
}

async function getLastLetterCollection(request, env) {
  const published = await env.DB.prepare(
    "SELECT is_published FROM last_letter_settings WHERE id = 1",
  ).first();
  const isPublished = Boolean(published?.is_published);
  const userNoteId = normalizeNoteId(request.headers.get("x-note-id"));
  let user = null;
  if (isPublished && NOTE_ID_PATTERN.test(userNoteId)) {
    user = await env.DB.prepare("SELECT id FROM users WHERE note_id = ?").bind(userNoteId).first();
  }
  // Draft campaign reveals no creator names, images, claim tokens, or message.
  const rows = isPublished ? await env.DB.prepare(`
    SELECT l.slot, l.creator_name, l.creator_note_id, l.character_image_key,
      b.image_key AS back_image_key,
      CASE WHEN c.slot IS NULL THEN NULL ELSE l.letter END AS found_letter,
      c.claimed_at
    FROM last_letter_slots l
    LEFT JOIN last_letter_backs b ON b.slot = l.slot
    LEFT JOIN last_letter_claims c ON c.slot = l.slot AND c.user_id = ?
    ORDER BY l.slot
  `).bind(user?.id || "").all() : { results: [] };
  const cards = Array.from({ length: 7 }, (_, index) => {
    const card = rows.results[index];
    const isFound = Boolean(card?.found_letter);
    return {
      slot: index + 1,
      found: isFound,
      letter: isFound ? card.found_letter : null,
      creatorName: isFound ? card.creator_name : null,
      creatorNoteId: isFound ? card.creator_note_id : null,
      characterImageUrl: isFound ? imageUrl(card.character_image_key) : null,
      // Do not reveal the back artwork before this visitor completes all 7.
      backImageUrl: null,
      claimedAt: isFound ? card.claimed_at : null,
    };
  });
  const count = cards.filter((card) => card.found).length;
  if (isPublished && count === 7) {
    for (let index = 0; index < 7; index++) {
      cards[index].backImageUrl = imageUrl(rows.results[index]?.back_image_key);
    }
  }
  // The finale is hidden until this particular visitor has all seven.
  const finale = isPublished && count === 7
    ? await env.DB.prepare("SELECT image_key, headline, sub_message FROM last_letter_finale WHERE id = 1").first()
    : null;
  return json({
    published: isPublished,
    count,
    total: 7,
    isComplete: isPublished && count === 7,
    cards,
    ...(isPublished && count === 7
      ? {
        message: cards.map((card) => card.letter).join(""),
        backMessage: LAST_LETTER_BACK.join(""),
        thanks: finale?.sub_message || "みんなで集めてくれて、ありがとう🌙",
        finale: {
          imageUrl: imageUrl(finale?.image_key),
          headline: finale?.headline || "遊んでくれてありがとう✨",
          subMessage: finale?.sub_message || "",
        },
      }
      : {}),
  });
}

async function claimLastLetter(request, env) {
  const user = await requireVisitor(request, env);
  if (user.response) return user.response;
  const settings = await env.DB.prepare(
    "SELECT is_published FROM last_letter_settings WHERE id = 1",
  ).first();
  if (!settings?.is_published) return json({ error: "ラストレターはまだ準備中です。" }, 403);
  const input = await readJson(request);
  const token = String(input.token || "").toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(token)) return json({ error: "文字のURLを確認してください。" }, 404);
  const item = await env.DB.prepare(
    "SELECT slot, letter, creator_name, creator_note_id, character_image_key FROM last_letter_slots WHERE claim_token = ?",
  ).bind(token).first();
  if (!item) return json({ error: "この文字は見つかりません。" }, 404);
  if (!item.creator_name || !item.character_image_key) {
    return json({ error: "この文字はまだ準備中です。" }, 409);
  }
  const outcome = await env.DB.prepare(
    "INSERT OR IGNORE INTO last_letter_claims (user_id, slot) VALUES (?, ?)",
  ).bind(user.id, item.slot).run();
  return json({
    slot: item.slot,
    letter: item.letter,
    creatorName: item.creator_name,
    creatorNoteId: item.creator_note_id,
    characterImageUrl: imageUrl(item.character_image_key),
    newlyCollected: Boolean(outcome.meta.changes),
  });
}

async function adminListParticipants(request, env, url) {
  if (!isAdmin(request, env)) return json({ error: "管理者キーが違います。" }, 401);
  const pageSize = 25;
  const rawPage = url.searchParams.get("page") || "1";
  if (!/^[1-9][0-9]{0,5}$/.test(rawPage)) return json({ error: "ページ番号が正しくありません。" }, 400);
  const requestedPage = Number(rawPage);
  const query = String(url.searchParams.get("q") || "").trim().replace(/^@/, "").toLowerCase();
  if (query.length > 32 || !/^[a-z0-9_]*$/.test(query)) {
    return json({ error: "note IDは英数字とアンダースコアで検索してください。" }, 400);
  }

  const [summary, filtered] = await Promise.all([
    env.DB.prepare(`
      SELECT
        (SELECT COUNT(*) FROM users) AS registered_count,
        (SELECT COUNT(DISTINCT user_id) FROM collection_items) AS collector_count
    `).first(),
    env.DB.prepare(
      "SELECT COUNT(*) AS count FROM users WHERE instr(lower(note_id), ?) > 0",
    ).bind(query).first(),
  ]);
  const matchingCount = Number(filtered?.count || 0);
  const totalPages = Math.max(1, Math.ceil(matchingCount / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const offset = (page - 1) * pageSize;
  const rows = await env.DB.prepare(`
    WITH collection_stats AS (
      SELECT c.user_id,
        COUNT(*) AS treat_types,
        COUNT(DISTINCT t.shop_id) AS shop_count,
        SUM(c.obtained_count) AS obtained_total
      FROM collection_items c
      JOIN treats t ON t.id = c.treat_id
      GROUP BY c.user_id
    )
    SELECT u.note_id, u.created_at,
      s.name AS shop_name, s.status AS shop_status,
      COALESCE(cs.shop_count, 0) AS shop_count,
      COALESCE(cs.treat_types, 0) AS treat_types,
      COALESCE(cs.obtained_total, 0) AS obtained_total
    FROM users u
    LEFT JOIN shops s ON s.owner_user_id = u.id
    LEFT JOIN collection_stats cs ON cs.user_id = u.id
    WHERE instr(lower(u.note_id), ?) > 0
    ORDER BY shop_count DESC, treat_types DESC, obtained_total DESC,
      u.note_id COLLATE NOCASE ASC
    LIMIT ? OFFSET ?
  `).bind(query, pageSize, offset).all();

  return json({
    totals: {
      registered: Number(summary?.registered_count || 0),
      collectors: Number(summary?.collector_count || 0),
    },
    query,
    page,
    pageSize,
    totalPages,
    matchingCount,
    participants: rows.results.map((row) => ({
      noteId: row.note_id,
      registeredAt: row.created_at,
      shopName: row.shop_name || null,
      shopStatus: row.shop_status || null,
      shopCount: Number(row.shop_count || 0),
      treatTypes: Number(row.treat_types || 0),
      obtainedTotal: Number(row.obtained_total || 0),
    })),
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
  // Count every uploaded candy, including draft and suspended shops. A candy
  // remains stored even when disabled, so it still counts toward capacity.
  const candyInventory = await env.DB.prepare(`
    SELECT COUNT(*) AS registered_count,
      COALESCE(SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END), 0) AS active_count,
      COUNT(DISTINCT shop_id) AS shops_with_candy,
      (
        SELECT COALESCE(MAX(candy_count), 0)
        FROM (SELECT COUNT(*) AS candy_count FROM treats GROUP BY shop_id)
      ) AS largest_shop_count
    FROM treats
  `).first();
  // Opening admin also synchronizes images uploaded before this feature shipped.
  await syncTriptychGateRewards(env);
  const rewards = await env.DB.prepare(
    "SELECT id, name, required_shop_count, image_key FROM rewards WHERE is_active = 1 ORDER BY required_shop_count",
  ).all();
  const triptych = await env.DB.prepare(
    "SELECT name, full_image_key, left_image_key, center_image_key, right_image_key, updated_at FROM triptych_illustrations WHERE id = 1",
  ).first();
  return json({
    shops: rows.results.map(publicShop),
    candyInventory: {
      registered: Number(candyInventory?.registered_count || 0),
      active: Number(candyInventory?.active_count || 0),
      shopsWithCandy: Number(candyInventory?.shops_with_candy || 0),
      largestShopCount: Number(candyInventory?.largest_shop_count || 0),
    },
    rewardSlots: rewards.results.map(publicReward),
    triptychArtwork: triptych ? {
      name: triptych.name,
      fullImageUrl: imageUrl(triptych.full_image_key),
      leftImageUrl: imageUrl(triptych.left_image_key),
      centerImageUrl: imageUrl(triptych.center_image_key),
      rightImageUrl: imageUrl(triptych.right_image_key),
      updatedAt: triptych.updated_at,
    } : null,
  });
}

// Keep source keys in one place. These columns are never provided by the client,
// and updating all of them also keeps triptych reward references in sync.
const IMAGE_REFERENCES = [
  ["last_letter_slots", "character_image_key"],
  ["last_letter_backs", "image_key"],
  ["last_letter_finale", "image_key"],
  ["shops", "character_image_key"],
  ["treats", "image_key"],
  ["rewards", "image_key"],
  ["triptych_illustrations", "full_image_key"],
  ["triptych_illustrations", "left_image_key"],
  ["triptych_illustrations", "center_image_key"],
  ["triptych_illustrations", "right_image_key"],
];
// SQLite/D1 sets a low maximum for compound SELECT clauses. Use four UNION
// branches (one per table) and expand the four triptych columns via JSON1.
const ALL_IMAGE_KEYS_SQL = `
  SELECT character_image_key AS image_key FROM shops
  UNION SELECT character_image_key FROM last_letter_slots
  UNION SELECT image_key FROM last_letter_backs
  UNION SELECT image_key FROM last_letter_finale
  UNION SELECT image_key FROM treats
  UNION SELECT image_key FROM rewards
  UNION SELECT slot.value AS image_key
  FROM triptych_illustrations t,
    json_each(json_array(t.full_image_key, t.left_image_key, t.center_image_key, t.right_image_key)) slot
`;
const MIGRATABLE_IMAGES_SQL = `FROM (${ALL_IMAGE_KEYS_SQL}) refs
  WHERE (lower(image_key) LIKE '%.png' OR lower(image_key) LIKE '%.jpg' OR lower(image_key) LIKE '%.jpeg')`;

async function adminListImageMigration(request, env, url) {
  if (!isAdmin(request, env)) return json({ error: "管理者キーが違います。" }, 401);
  const after = url.searchParams.get("after") || "";
  if (after.length > 255) return json({ error: "画像キーが不正です。" }, 400);
  const [pending, rows, backups, recentBackups] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS count ${MIGRATABLE_IMAGES_SQL}`).first(),
    env.DB.prepare(`SELECT image_key ${MIGRATABLE_IMAGES_SQL}
      AND image_key > ? ORDER BY image_key LIMIT 20`).bind(after).all(),
    env.DB.prepare(`SELECT
      COUNT(*) AS retained,
      COALESCE(SUM(before_bytes), 0) AS retained_bytes,
      COALESCE(SUM(CASE WHEN migrated_at <= datetime('now', '-24 hours') THEN 1 ELSE 0 END), 0) AS ready
      FROM image_migration_backups`).first(),
    env.DB.prepare(`SELECT source_key, webp_key, before_bytes, after_bytes, migrated_at
      FROM image_migration_backups ORDER BY migrated_at DESC, source_key DESC LIMIT 10`).all(),
  ]);
  return json({
    pending: Number(pending?.count || 0),
    backups: {
      retained: Number(backups?.retained || 0),
      retainedBytes: Number(backups?.retained_bytes || 0),
      readyToCleanup: Number(backups?.ready || 0),
      recent: recentBackups.results.map((row) => ({
        sourceKey: row.source_key,
        webpKey: row.webp_key,
        beforeBytes: Number(row.before_bytes),
        afterBytes: Number(row.after_bytes),
        migratedAt: row.migrated_at,
      })),
    },
    images: rows.results.map((item) => ({
      key: item.image_key,
      imageUrl: imageUrl(item.image_key),
    })),
  });
}

async function adminMigrateImage(request, env) {
  if (!isAdmin(request, env)) return json({ error: "管理者キーが違います。" }, 401);
  const form = await request.formData();
  const sourceKey = String(form.get("sourceKey") || "");
  if (!/^(characters|treats|rewards|triptych|letters)\/[a-zA-Z0-9-]+\.(png|jpg|jpeg)$/i.test(sourceKey)) {
    return json({ error: "変換対象の画像キーが不正です。" }, 400);
  }
  const active = await env.DB.prepare(
    `SELECT image_key FROM (${ALL_IMAGE_KEYS_SQL}) WHERE image_key = ? LIMIT 1`,
  ).bind(sourceKey).first();
  if (!active) return json({ error: "この画像は既に移行済み、または削除されています。" }, 409);
  const file = form.get("image");
  if (!file || file.type !== "image/webp" || !file.size || file.size > MAX_IMAGE_BYTES) {
    return json({ error: "5MB以下のWebP画像を指定してください。" }, 400);
  }
  const bytes = await file.arrayBuffer();
  const header = new Uint8Array(bytes.slice(0, 12));
  const isWebp = String.fromCharCode(...header.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...header.slice(8, 12)) === "WEBP";
  if (!isWebp) return json({ error: "WebP画像として読み込めません。" }, 400);

  const old = await env.IMAGES.getWithMetadata(sourceKey, { type: "arrayBuffer" });
  if (!old.value) return json({ error: "元画像が見つかりません。" }, 404);
  const beforeBytes = old.value.byteLength;
  if (bytes.byteLength >= beforeBytes) {
    return json({ error: "変換後の画像が元画像より大きいため、元画像を維持します。" }, 422);
  }

  const folder = sourceKey.split("/")[0];
  const newKey = `${folder}/${crypto.randomUUID()}.webp`;
  await env.IMAGES.put(newKey, bytes, { metadata: { contentType: "image/webp" } });
  try {
    // D1 operations are atomic. Log the recovery path in the same batch as
    // every reference change; keep the original KV object for at least 24h.
    await env.DB.batch([
      ...IMAGE_REFERENCES.map(([table, column]) =>
        env.DB.prepare(`UPDATE ${table} SET ${column} = ? WHERE ${column} = ?`).bind(newKey, sourceKey),
      ),
      env.DB.prepare(`INSERT INTO image_migration_backups
        (source_key, webp_key, before_bytes, after_bytes) VALUES (?, ?, ?, ?)`)
        .bind(sourceKey, newKey, beforeBytes, bytes.byteLength),
    ]);
  } catch (error) {
    await env.IMAGES.delete(newKey).catch(() => {});
    throw error;
  }
  return json({
    ok: true, beforeBytes, afterBytes: bytes.byteLength,
    savedBytes: beforeBytes - bytes.byteLength,
    backupRetained: true,
  });
}

// Undo an image migration while its original KV image is retained.
// Only a server-recorded pair can be restored: the client cannot select keys.
async function adminRestoreMigratedImage(request, env) {
  if (!isAdmin(request, env)) return json({ error: "管理者キーが違います。" }, 401);
  const input = await readJson(request);
  const sourceKey = String(input.sourceKey || "");
  const backup = await env.DB.prepare(
    "SELECT source_key, webp_key FROM image_migration_backups WHERE source_key = ?",
  ).bind(sourceKey).first();
  if (!backup) return json({ error: "復元可能な元画像がありません。" }, 404);
  const [original, current] = await Promise.all([
    env.IMAGES.get(backup.source_key, "arrayBuffer"),
    env.DB.prepare(`SELECT image_key FROM (${ALL_IMAGE_KEYS_SQL}) WHERE image_key = ? LIMIT 1`)
      .bind(backup.webp_key).first(),
  ]);
  if (!original) return json({ error: "元画像のバックアップが見つかりません。" }, 409);
  if (!current) return json({ error: "元の画像を参照しているデータがありません。" }, 409);
  await env.DB.batch([
    ...IMAGE_REFERENCES.map(([table, column]) =>
      env.DB.prepare(`UPDATE ${table} SET ${column} = ? WHERE ${column} = ?`)
        .bind(backup.source_key, backup.webp_key),
    ),
    env.DB.prepare("DELETE FROM image_migration_backups WHERE source_key = ?").bind(sourceKey),
  ]);
  // Keep the new WebP as a harmless orphan rather than deleting something
  // clients may still be requesting during KV's eventual-consistency window.
  return json({ ok: true, restored: sourceKey });
}

// Backups are removed only after the propagation grace period, and only if no
// live DB reference points to the original. One operation handles one image.
async function adminCleanupImageBackups(request, env) {
  if (!isAdmin(request, env)) return json({ error: "管理者キーが違います。" }, 401);
  const candidate = await env.DB.prepare(`
    SELECT source_key, webp_key FROM image_migration_backups
    WHERE migrated_at <= datetime('now', '-24 hours')
    ORDER BY migrated_at, source_key LIMIT 1
  `).first();
  if (!candidate) return json({ cleaned: 0, message: "24時間を経過したバックアップはありません。" });
  const referenced = await env.DB.prepare(
    `SELECT image_key FROM (${ALL_IMAGE_KEYS_SQL}) WHERE image_key = ? LIMIT 1`,
  ).bind(candidate.source_key).first();
  if (referenced) return json({ error: "元画像がまだ使用中のため削除できません。" }, 409);
  // New WebP must still exist before removing the only original.
  const newImage = await env.IMAGES.get(candidate.webp_key, "arrayBuffer");
  if (!newImage) return json({ error: "変換済み画像を確認できないため元画像を保持します。" }, 409);
  await env.IMAGES.delete(candidate.source_key);
  await env.DB.prepare("DELETE FROM image_migration_backups WHERE source_key = ?")
    .bind(candidate.source_key).run();
  return json({ cleaned: 1, oldKey: candidate.source_key });
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
  const requiredShopCount = Number(form.get("requiredShopCount"));
  const stage = HALLOWEEN_STAGES.find((entry) => entry.requiredShopCount === requiredShopCount);
  if (!stage) return json({ error: "10・20・30・50・75・100店舗のいずれかを選んでください。" }, 400);
  // Triptych crops are the canonical source for these three milestones.
  if (TRIPTYCH_GATE_REWARDS.some((gate) => gate.count === requiredShopCount)) {
    const triptych = await env.DB.prepare(
      "SELECT id FROM triptych_illustrations WHERE id = 1",
    ).first();
    if (triptych) return json({ error: "10・20・30店舗の画像は「3枚合体イラスト」から自動同期されます。" }, 409);
  }
  const name = cleanText(form.get("name"), 50) || stage.name;
  const imageKey = await storeRequiredImage(form.get("image"), env, "rewards");
  await env.DB.prepare("UPDATE rewards SET is_active = 0 WHERE required_shop_count = ?")
    .bind(requiredShopCount).run();
  await env.DB.prepare(
    "INSERT INTO rewards (id, name, required_shop_count, image_key) VALUES (?, ?, ?, ?)",
  ).bind(crypto.randomUUID(), name, requiredShopCount, imageKey).run();
  return json({ ok: true }, 201);
}

// A single 3:1 original is divided by the admin browser into 3 square panels.
// The Worker stores each slice separately so the full artwork is never sent to
// a visitor before all three gates have been cleared.
async function adminSaveTriptych(request, env) {
  if (!isAdmin(request, env)) return json({ error: "管理者キーが違います。" }, 401);
  const form = await request.formData();
  const name = cleanText(form.get("name"), 50) || "三つの欠片がそろった！";
  const uploads = [
    ["full_image_key", "image"],
    ["left_image_key", "leftImage"],
    ["center_image_key", "centerImage"],
    ["right_image_key", "rightImage"],
  ];
  const imageKeys = {};
  try {
    for (const [column, field] of uploads) {
      imageKeys[column] = await storeRequiredImage(form.get(field), env, "triptych");
    }
    const old = await env.DB.prepare(
      "SELECT full_image_key, left_image_key, center_image_key, right_image_key FROM triptych_illustrations WHERE id = 1",
    ).first();
    // D1 batch is atomic: replace the illustration and all three gate reward
    // slots together, then (and only then) discard the old KV objects.
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO triptych_illustrations (
          id, name, full_image_key, left_image_key, center_image_key, right_image_key
        ) VALUES (1, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          full_image_key = excluded.full_image_key,
          left_image_key = excluded.left_image_key,
          center_image_key = excluded.center_image_key,
          right_image_key = excluded.right_image_key,
          updated_at = CURRENT_TIMESTAMP
      `).bind(name, imageKeys.full_image_key, imageKeys.left_image_key, imageKeys.center_image_key, imageKeys.right_image_key),
      ...triptychGateRewardStatements(env, imageKeys),
    ]);
    if (old) {
      await Promise.allSettled(
        uploads.map(([column]) => old[column]).filter(Boolean).map((key) => env.IMAGES.delete(key)),
      );
    }
  } catch (error) {
    await Promise.allSettled(Object.values(imageKeys).map((key) => env.IMAGES.delete(key)));
    throw error;
  }
  return json({ ok: true, name, syncedGateCounts: [10, 20, 30] }, 201);
}

function triptychGateRewardStatements(env, artwork) {
  return TRIPTYCH_GATE_REWARDS.flatMap(({ id, count, name, imageColumn }) => [
    // Old manually registered reward rows remain in DB but become inactive.
    env.DB.prepare(
      "UPDATE rewards SET is_active = 0 WHERE required_shop_count = ? AND id <> ? AND is_active = 1",
    ).bind(count, id),
    env.DB.prepare(`
      INSERT INTO rewards (id, name, required_shop_count, image_key, is_active)
      VALUES (?, ?, ?, ?, 1)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        required_shop_count = excluded.required_shop_count,
        image_key = excluded.image_key,
        is_active = 1
    `).bind(id, name, count, artwork[imageColumn]),
  ]);
}

// Reconciles artwork registered before automatic reward synchronization existed.
// Read-only after initial healing; no extra writes on subsequent page loads.
async function syncTriptychGateRewards(env) {
  const artwork = await env.DB.prepare(
    "SELECT left_image_key, center_image_key, right_image_key FROM triptych_illustrations WHERE id = 1",
  ).first();
  if (!artwork) return;
  const active = await env.DB.prepare(
    "SELECT id, required_shop_count, image_key FROM rewards WHERE is_active = 1 AND required_shop_count IN (10, 20, 30)",
  ).all();
  const correctlySynced = active.results.length === TRIPTYCH_GATE_REWARDS.length
    && TRIPTYCH_GATE_REWARDS.every(({ id, count, imageColumn }) =>
      active.results.some((reward) =>
        reward.id === id && reward.required_shop_count === count && reward.image_key === artwork[imageColumn],
      ),
    );
  if (!correctlySynced) {
    await env.DB.batch(triptychGateRewardStatements(env, artwork));
  }
}

function publicTriptych(art, shopCount) {
  const panels = [
    { position: "left", requiredShopCount: 10, imageKey: art?.left_image_key },
    { position: "center", requiredShopCount: 30, imageKey: art?.center_image_key },
    { position: "right", requiredShopCount: 20, imageKey: art?.right_image_key },
  ];
  return {
    isConfigured: Boolean(art),
    name: shopCount >= 30 && art ? art.name : "秘密の完成イラスト",
    isComplete: shopCount >= 30,
    fullImageUrl: art && shopCount >= 30 ? imageUrl(art.full_image_key) : null,
    panels: panels.map((panel) => ({
      position: panel.position,
      requiredShopCount: panel.requiredShopCount,
      isUnlocked: shopCount >= panel.requiredShopCount,
      imageUrl: art && shopCount >= panel.requiredShopCount ? imageUrl(panel.imageKey) : null,
    })),
  };
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
      sharePath: `/shop/${user.note_id}`,
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

async function serveShopPage(request, env, noteIdRaw) {
  const noteId = normalizeNoteId(noteIdRaw);
  if (!NOTE_ID_PATTERN.test(noteId)) {
    return new Response("Not found", { status: 404, headers: securityHeaders() });
  }

  const shop = await env.DB.prepare(`
    SELECT s.name, s.description, s.character_image_key, u.note_id
    FROM shops s JOIN users u ON u.id = s.owner_user_id
    WHERE u.note_id = ? AND s.status = 'published'
  `).bind(noteId).first();

  if (!shop) {
    return new Response("Not found", { status: 404, headers: securityHeaders() });
  }

  const indexUrl = new URL("/index.html", request.url);
  const assetResponse = await env.ASSETS.fetch(new Request(indexUrl.toString(), {
    method: "GET",
    headers: request.headers,
  }));
  if (!assetResponse.ok) return assetResponse;

  const origin = new URL(request.url).origin;
  const title = `${shop.name} | ハロハロおかしラリー`;
  const description = String(shop.description || `@${shop.note_id}のお菓子屋さんへ遊びに行こう。`)
    .replace(/\s+/g, " ")
    .trim();
  const pageUrl = `${origin}/shop/${encodeURIComponent(shop.note_id)}`;
  const image = shop.character_image_key
    ? `${origin}${imageUrl(shop.character_image_key)}`
    : null;

  const ogTags = [
    `<meta property="og:site_name" content="ハロハロおかしラリー">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:url" content="${escapeHtml(pageUrl)}">`,
    image ? `<meta property="og:image" content="${escapeHtml(image)}">` : "",
    image ? `<meta property="og:image:alt" content="${escapeHtml(shop.name)}">` : "",
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escapeHtml(title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(description)}">`,
    image ? `<meta name="twitter:image" content="${escapeHtml(image)}">` : "",
    `<link rel="canonical" href="${escapeHtml(pageUrl)}">`,
  ].filter(Boolean).join("\n    ");

  let html = await assetResponse.text();
  html = html
    .replace(
      /<meta name="description" content="[^"]*">/,
      `<meta name="description" content="${escapeHtml(description)}">`,
    )
    .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`)
    .replace(/<!-- SITE_OGP_START -->[\s\S]*?<!-- SITE_OGP_END -->/, "")
    .replace("<!-- SHOP_OGP -->", ogTags);

  const headers = new Headers(assetResponse.headers);
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("cache-control", "no-cache");
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  return new Response(html, { status: 200, headers });
}

async function serveImage(path, env) {
  const key = path.slice("/images/".length).split("/").map(decodeURIComponent).join("/");
  let object = await env.IMAGES.getWithMetadata(key, { type: "arrayBuffer" });
  if (!object.value && key.endsWith(".webp")) {
    // KV keys may take 60s+ to reach every edge. During this propagation
    // window the retained original can still satisfy the image request.
    const migration = await env.DB.prepare(
      "SELECT source_key FROM image_migration_backups WHERE webp_key = ?",
    ).bind(key).first();
    if (migration) {
      object = await env.IMAGES.getWithMetadata(migration.source_key, { type: "arrayBuffer" });
    }
  }
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
      `CREATE TABLE IF NOT EXISTS shop_completions (
        user_id TEXT NOT NULL,
        shop_id TEXT NOT NULL,
        completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, shop_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS last_letter_slots (
        slot INTEGER PRIMARY KEY CHECK (slot BETWEEN 1 AND 7),
        letter TEXT NOT NULL,
        claim_token TEXT NOT NULL UNIQUE,
        creator_name TEXT NOT NULL DEFAULT '',
        creator_note_id TEXT NOT NULL DEFAULT '',
        character_image_key TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS last_letter_backs (
        slot INTEGER PRIMARY KEY CHECK (slot BETWEEN 1 AND 7),
        image_key TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (slot) REFERENCES last_letter_slots(slot) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS last_letter_finale (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        image_key TEXT,
        headline TEXT NOT NULL DEFAULT '遊んでくれてありがとう✨',
        sub_message TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS last_letter_claims (
        user_id TEXT NOT NULL,
        slot INTEGER NOT NULL,
        claimed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, slot),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (slot) REFERENCES last_letter_slots(slot) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS last_letter_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        is_published INTEGER NOT NULL DEFAULT 0 CHECK (is_published IN (0, 1))
      )`,
      `CREATE TABLE IF NOT EXISTS triptych_illustrations (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        name TEXT NOT NULL,
        full_image_key TEXT NOT NULL,
        left_image_key TEXT NOT NULL,
        center_image_key TEXT NOT NULL,
        right_image_key TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS image_migration_backups (
        source_key TEXT PRIMARY KEY,
        webp_key TEXT NOT NULL UNIQUE,
        before_bytes INTEGER NOT NULL,
        after_bytes INTEGER NOT NULL,
        migrated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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

function visibleStages(shopCount) {
  return HALLOWEEN_STAGES.map((stage, index) => {
    const revealed = index === 0 || shopCount >= HALLOWEEN_STAGES[index - 1].requiredShopCount;
    return {
      requiredShopCount: stage.requiredShopCount,
      name: revealed ? stage.name : null,
      description: revealed ? stage.description : null,
      isRevealed: revealed,
      isCleared: shopCount >= stage.requiredShopCount,
      isSecret: index >= 3,
    };
  });
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

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
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
