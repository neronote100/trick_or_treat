import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { FormData, Miniflare, Request } from "miniflare";

const mf = new Miniflare({
  modules: true,
  scriptPath: "src/index.js",
  compatibilityDate: "2026-09-21",
  d1Databases: { DB: "test-db" },
  kvNamespaces: { IMAGES: "test-images" },
  bindings: { ADMIN_TOKEN: "test-admin" },
});

const base = "http://example.test";
const shopOwner = { noteId: "moon_shop" };
const visitor = { noteId: "night_guest" };

try {
  // The public event entry point and social preview must use the new name/art.
  const html = await readFile("public/index.html", "utf8");
  const front = await readFile("public/app.js", "utf8");
  const banner = await readFile("public/halo-oka-rally-banner.webp");
  assert.match(html, /<title>ハロハロおかしラリー/);
  assert.match(html, /<span>ハロハロおかしラリー<\/span>/);
  assert.match(html, /property="og:image" content="https:\/\/trick-or-treat\.nero-prince\.workers\.dev\/halo-oka-rally-banner\.webp"/);
  assert.match(front, /function renderWelcome\(\)/);
  assert.match(front, /rallyHero\(\)/);
  assert.equal(banner.subarray(0, 4).toString(), "RIFF", "The actual hero image is committed");
  const db = await mf.getD1Database("DB");
  const migration = await readFile("migrations/0001_initial.sql", "utf8");
  for (const statement of migration.split(";").map((part) => part.trim()).filter(Boolean)) {
    await db.prepare(statement).run();
  }

  const ownerRegistration = await register(shopOwner);
  const visitorRegistration = await register(visitor);
  assert.equal(ownerRegistration.noteId, shopOwner.noteId);
  assert.equal(visitorRegistration.noteId, visitor.noteId);

  const shopForm = new FormData();
  shopForm.set("name", "月夜のお菓子店");
  shopForm.set("description", "星明かりの下でどうぞ\n何度でも遊びに来てね");
  shopForm.set("characterImage", pngFile("character.png"));
  await okFetch("/api/me/shop", { method: "PUT", body: shopForm }, shopOwner);

  const treatForm = new FormData();
  treatForm.set("name", "月のキャンディ");
  treatForm.set("rarity", "rare");
  treatForm.set("image", pngFile("treat.png"));
  await okFetch("/api/me/treats", { method: "POST", body: treatForm }, shopOwner);
  const published = await okFetch("/api/me/shop/submit", { method: "POST" }, shopOwner);
  assert.equal(published.status, "published");

  const allShops = await okFetch("/api/admin/shops", {
    headers: { "x-admin-token": "test-admin" },
  });
  assert.equal(allShops.shops.length, 1);
  assert.equal(allShops.shops[0].status, "published");

  const publicList = await mf.dispatchFetch(new Request(`${base}/api/shops`));
  assert.equal(publicList.status, 404);

  const directShop = await okFetch(`/api/shops/${shopOwner.noteId}`);
  assert.equal(directShop.shop.noteId, shopOwner.noteId);
  assert.equal(directShop.shop.treatCount, 1);
  assert.equal(directShop.shop.description, "星明かりの下でどうぞ\n何度でも遊びに来てね");

  const ownerMe = await okFetch("/api/me", {}, shopOwner);
  assert.equal(ownerMe.shop.sharePath, `/shop/${shopOwner.noteId}`);

  const repeatLogin = await register({ noteId: visitor.noteId });
  assert.equal(repeatLogin.noteId, visitor.noteId);
  const visitorOnly = { noteId: visitor.noteId };
  const visitorMe = await okFetch("/api/me", {}, visitorOnly);
  assert.equal(visitorMe.user.noteId, visitor.noteId);

  const draw = await okFetch(`/api/shops/${shopOwner.noteId}/draw`, { method: "POST" }, visitorOnly);
  assert.equal(draw.treat.name, "月のキャンディ");
  assert.equal(draw.isNew, true);
  assert.equal(draw.shopCount, 1);

  const collection = await okFetch("/api/collection", {}, visitorOnly);
  assert.equal(collection.items.length, 1);
  assert.equal(collection.items[0].obtainedCount, 1);
  assert.equal(collection.shops.length, 1);
  assert.equal(collection.shops[0].noteId, shopOwner.noteId);
  assert.equal(collection.shops[0].collectedCount, 1);
  assert.equal(collection.shops[0].isComplete, true, "A shop with one treat completes after collecting it");
  assert.equal(Object.hasOwn(collection.shops[0], "totalTreats"), false, "Never reveal shop treat totals");
  const image = await mf.dispatchFetch(`${base}${collection.items[0].imageUrl}`);
  assert.equal(image.status, 200);
  assert.equal(image.headers.get("content-type"), "image/png");

  // Completion is a persistent achievement, not invalidated by new candies.
  const extraTreat = new FormData();
  extraTreat.set("name", "星屑マカロン");
  extraTreat.set("image", pngFile("second-treat.png"));
  await okFetch("/api/me/treats", { method: "POST", body: extraTreat }, shopOwner);
  const unchangedAchievement = await okFetch("/api/collection", {}, visitorOnly);
  assert.equal(unchangedAchievement.shops[0].isComplete, true, "Adding a treat cannot revoke an earned badge");
  assert.equal(unchangedAchievement.shops[0].collectedCount, 1);
  const currentTreats = await db.prepare(
    "SELECT t.id, t.name FROM treats t JOIN shops s ON s.id = t.shop_id JOIN users u ON u.id = s.owner_user_id WHERE u.note_id = ? ORDER BY t.name",
  ).bind(shopOwner.noteId).all();
  assert.equal(currentTreats.results.length, 2);
  const oldTreat = currentTreats.results.find((t) => t.name === "月のキャンディ");
  const newTreat = currentTreats.results.find((t) => t.name === "星屑マカロン");

  // A different collector has only one of two treats: no completion.
  await db.prepare(
    "INSERT INTO collection_items (user_id, treat_id) SELECT id, ? FROM users WHERE note_id = ?",
  ).bind(oldTreat.id, shopOwner.noteId).run();
  const partial = await okFetch("/api/collection", {}, shopOwner);
  assert.equal(partial.shops.length, 1);
  assert.equal(partial.shops[0].collectedCount, 1);
  assert.equal(partial.shops[0].isComplete, false, "One of two treats is not complete");
  await db.prepare(
    "INSERT INTO collection_items (user_id, treat_id) SELECT id, ? FROM users WHERE note_id = ?",
  ).bind(newTreat.id, shopOwner.noteId).run();
  const newlyCompleted = await okFetch("/api/collection", {}, shopOwner);
  assert.equal(newlyCompleted.shops[0].isComplete, true, "Existing collection is recognized without a new draw");
  const storedCompletion = await db.prepare(
    "SELECT COUNT(*) AS count FROM shop_completions WHERE user_id = (SELECT id FROM users WHERE note_id = ?)",
  ).bind(shopOwner.noteId).first();
  assert.equal(storedCompletion.count, 1);
  // Reopening the collection doesn't duplicate completion records.
  await okFetch("/api/collection", {}, shopOwner);
  assert.equal((await db.prepare(
    "SELECT COUNT(*) AS count FROM shop_completions WHERE user_id = (SELECT id FROM users WHERE note_id = ?)",
  ).bind(shopOwner.noteId).first()).count, 1);
  // Prove older users who were already complete are repaired on opening the book.
  await db.prepare(
    "DELETE FROM shop_completions WHERE user_id = (SELECT id FROM users WHERE note_id = ?)",
  ).bind(visitorOnly.noteId).run();
  assert.equal((await okFetch("/api/collection", {}, visitorOnly)).shops[0].isComplete, false,
    "An old collector remains incomplete when newer treats are still missing");
  await db.prepare(
    "INSERT INTO collection_items (user_id, treat_id) SELECT id, ? FROM users WHERE note_id = ?",
  ).bind(newTreat.id, visitorOnly.noteId).run();
  assert.equal((await okFetch("/api/collection", {}, visitorOnly)).shops[0].isComplete, true,
    "Backfill recognizes already-complete existing collection records");

  // Private dashboard includes non-collectors and uses persisted draw counts.
  const noAdmin = await mf.dispatchFetch(new Request(`${base}/api/admin/participants`));
  assert.equal(noAdmin.status, 401);
  const badAdmin = await mf.dispatchFetch(new Request(`${base}/api/admin/participants`, {
    headers: { "x-admin-token": "wrong" },
  }));
  assert.equal(badAdmin.status, 401);
  const participantHeaders = { "x-admin-token": "test-admin" };
  const firstParticipants = await okFetch("/api/admin/participants", { headers: participantHeaders });
  assert.deepEqual(firstParticipants.totals, { registered: 2, collectors: 1 });
  assert.equal(firstParticipants.matchingCount, 2);
  assert.equal(firstParticipants.totalPages, 1);
  assert.deepEqual(firstParticipants.participants.map((p) => p.noteId), ["night_guest", "moon_shop"]);
  assert.deepEqual(
    [firstParticipants.participants[0].shopCount, firstParticipants.participants[0].treatTypes, firstParticipants.participants[0].obtainedTotal],
    [1, 1, 1],
  );
  assert.deepEqual(
    [firstParticipants.participants[1].shopCount, firstParticipants.participants[1].treatTypes, firstParticipants.participants[1].obtainedTotal],
    [0, 0, 0],
  );
  assert.equal(firstParticipants.participants[1].shopStatus, "published");
  const ownerSearch = await okFetch("/api/admin/participants?q=MOON_SHOP", { headers: participantHeaders });
  assert.equal(ownerSearch.matchingCount, 1);
  assert.equal(ownerSearch.participants[0].noteId, "moon_shop");
  const missingSearch = await okFetch("/api/admin/participants?q=not_here", { headers: participantHeaders });
  assert.equal(missingSearch.matchingCount, 0);
  assert.equal(missingSearch.page, 1);
  assert.deepEqual(missingSearch.participants, []);
  const badPage = await mf.dispatchFetch(new Request(`${base}/api/admin/participants?page=0`, {
    headers: participantHeaders,
  }));
  assert.equal(badPage.status, 400);
  await db.prepare(
    "UPDATE collection_items SET obtained_count = 4 WHERE user_id = (SELECT id FROM users WHERE note_id = ?)",
  ).bind(visitorOnly.noteId).run();
  const duplicate = await okFetch("/api/admin/participants", { headers: participantHeaders });
  assert.equal(duplicate.participants[0].obtainedTotal, 4);
  assert.equal(duplicate.participants[0].treatTypes, 1);
  assert.equal(duplicate.participants[0].shopCount, 1);
  await db.prepare(
    "UPDATE collection_items SET obtained_count = 1 WHERE user_id = (SELECT id FROM users WHERE note_id = ?)",
  ).bind(visitorOnly.noteId).run();

  const deleted = await okFetch(`/api/admin/shops/${allShops.shops[0].id}`, {
    method: "DELETE",
    headers: { "x-admin-token": "test-admin" },
  });
  assert.equal(deleted.deleted, true);

  const ownerAfterDelete = await okFetch("/api/me", {}, shopOwner);
  assert.equal(ownerAfterDelete.shop, null);
  assert.equal(ownerAfterDelete.treats.length, 0);

  const visitorAfterDelete = await okFetch("/api/collection", {}, visitorOnly);
  assert.equal(visitorAfterDelete.items.length, 0);
  assert.equal(visitorAfterDelete.shops.length, 0);
  const afterShopDeletion = await okFetch("/api/admin/participants", { headers: participantHeaders });
  assert.equal(afterShopDeletion.totals.registered, 2);
  assert.equal(afterShopDeletion.totals.collectors, 0);
  assert.equal(afterShopDeletion.participants.find((p) => p.noteId === visitorOnly.noteId).treatTypes, 0);

  const deletedShopResponse = await mf.dispatchFetch(
    new Request(`${base}/api/shops/${shopOwner.noteId}`),
  );
  assert.equal(deletedShopResponse.status, 404);

  const rebuiltShopForm = new FormData();
  rebuiltShopForm.set("name", "新しい月夜のお菓子店");
  rebuiltShopForm.set("description", "一から作り直しました");
  rebuiltShopForm.set("characterImage", pngFile("new-character.png"));
  const rebuilt = await okFetch(
    "/api/me/shop",
    { method: "PUT", body: rebuiltShopForm },
    shopOwner,
  );
  assert.equal(rebuilt.shop.name, "新しい月夜のお菓子店");

  await testHalloweenGates(db, visitorOnly, okFetch, pngFile, mf);
  console.log("Smoke test passed: note ID login → publish/rebuild → 6 progressive gates → retroactive rewards");
} finally {
  await mf.dispose();
}

async function register(identity) {
  return okFetch("/api/users", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ noteId: identity.noteId }),
  });
}

async function okFetch(path, options = {}, identity) {
  const headers = new Headers(options.headers || {});
  if (identity) {
    headers.set("x-note-id", identity.noteId);
  }
  const request = new Request(`${base}${path}`, { ...options, headers });
  const response = await mf.dispatchFetch(request);
  const body = await response.json();
  assert.equal(response.ok, true, `${response.status}: ${JSON.stringify(body)}`);
  return body;
}

function pngFile(name) {
  const bytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return new File([bytes], name, { type: "image/png" });
}

async function testHalloweenGates(db, visitor, okFetch, pngFile, mf) {
  const thresholds = [10, 20, 30, 50, 75, 100];
  const seeds = [];
  for (let n = 1; n <= 100; n++) {
    const suffix = String(n).padStart(3, "0");
    seeds.push(
      db.prepare("INSERT INTO users (id, note_id, credential_hash, recovery_code_hash) VALUES (?, ?, '', '')")
        .bind(`test_owner_${suffix}`, `stage_shop_${suffix}`),
      db.prepare("INSERT INTO shops (id, owner_user_id, name, status) VALUES (?, ?, ?, 'published')")
        .bind(`test_shop_${suffix}`, `test_owner_${suffix}`, `ハロウィン店 ${suffix}`),
      db.prepare("INSERT INTO treats (id, shop_id, name, image_key) VALUES (?, ?, ?, ?)")
        .bind(`test_treat_${suffix}`, `test_shop_${suffix}`, `お菓子 ${suffix}`, `treats/test_${suffix}.png`),
    );
  }
  for (let n = 0; n < seeds.length; n += 30) await db.batch(seeds.slice(n, n + 30));
  const adminHeaders = { "x-admin-token": "test-admin" };
  const rewardForm = (count, name) => {
    const form = new FormData();
    form.set("requiredShopCount", String(count));
    form.set("name", name);
    form.set("image", pngFile(`stage_${count}.png`));
    return form;
  };
  // Simulate a previously configured independent reward: the triptych
  // registration must supersede it without deleting historical records.
  await okFetch("/api/admin/reward", {
    method: "POST", headers: adminHeaders, body: rewardForm(20, "旧・魔女の森"),
  });
  const legacy = await db.prepare(
    "SELECT id FROM rewards WHERE required_shop_count = 20 AND is_active = 1",
  ).first();
  const artworkForm = (name) => {
    const form = new FormData();
    form.set("name", name);
    form.set("image", pngFile("full-3x1.png"));
    form.set("leftImage", pngFile("left-1x1.png"));
    form.set("centerImage", pngFile("center-1x1.png"));
    form.set("rightImage", pngFile("right-1x1.png"));
    return form;
  };
  const initialUpload = await okFetch("/api/admin/triptych", {
    method: "POST", headers: adminHeaders, body: artworkForm("王子の秘密パノラマ"),
  });
  assert.deepEqual(initialUpload.syncedGateCounts, [10, 20, 30]);
  const firstAdmin = await okFetch("/api/admin/shops", { headers: adminHeaders });
  for (const [count, field] of [[10, "leftImageUrl"], [20, "rightImageUrl"], [30, "centerImageUrl"]]) {
    const reward = firstAdmin.rewardSlots.find((entry) => entry.requiredShopCount === count);
    assert.ok(reward, `Gate ${count} has an automatically synchronized image`);
    assert.equal(reward.imageUrl, firstAdmin.triptychArtwork[field]);
  }
  const oldReward = await db.prepare("SELECT is_active FROM rewards WHERE id = ?").bind(legacy.id).first();
  assert.equal(oldReward.is_active, 0, "Legacy manual reward is superseded, not deleted");
  const conflictResponse = await mf.dispatchFetch(new Request(`${base}/api/admin/reward`, {
    method: "POST", headers: adminHeaders, body: rewardForm(20, "競合する手動登録"),
  }));
  assert.equal(conflictResponse.status, 409, "Cannot manually replace an auto-synced triptych reward");
  const beforeGates = await okFetch("/api/collection", {}, visitor);
  assert.equal(beforeGates.triptych.isConfigured, true);
  assert.equal(beforeGates.triptych.fullImageUrl, null, "Do not reveal the full image before 30 shops");
  assert.deepEqual(beforeGates.triptych.panels.map((panel) => panel.requiredShopCount), [10, 30, 20]);
  assert.ok(beforeGates.triptych.panels.every((panel) => !panel.imageUrl));

  // An old 3:1 upload predating this fix had no corresponding reward rows.
  // A subsequent collection/admin request must repair all three slots.
  await db.prepare("UPDATE rewards SET is_active = 0 WHERE id IN ('triptych-gate-10', 'triptych-gate-20', 'triptych-gate-30')").run();
  const repairedAdmin = await okFetch("/api/admin/shops", { headers: adminHeaders });
  assert.deepEqual(repairedAdmin.rewardSlots.filter((r) => [10, 20, 30].includes(r.requiredShopCount))
    .map((r) => r.requiredShopCount), [10, 20, 30]);
  // No duplicate rewards on repeated reconciliation.
  await okFetch("/api/admin/shops", { headers: adminHeaders });
  const activeSlots = await db.prepare(
    "SELECT COUNT(*) AS count FROM rewards WHERE is_active = 1 AND required_shop_count IN (10, 20, 30)",
  ).first();
  assert.equal(activeSlots.count, 3);
  let previousCompletedUrl = null;
  for (let n = 1; n <= 100; n++) {
    const suffix = String(n).padStart(3, "0");
    if (n === 40) {
      await okFetch("/api/admin/triptych", {
        method: "POST", headers: adminHeaders, body: artworkForm("新しい秘密パノラマ"),
      });
      const replaced = await okFetch("/api/collection", {}, visitor);
      assert.equal(replaced.triptych.name, "新しい秘密パノラマ");
      assert.ok(replaced.triptych.fullImageUrl);
      assert.notEqual(replaced.triptych.fullImageUrl, previousCompletedUrl);
      const afterReplace = await okFetch("/api/admin/shops", { headers: adminHeaders });
      const gate20 = afterReplace.rewardSlots.find((r) => r.requiredShopCount === 20);
      assert.equal(gate20.imageUrl, afterReplace.triptychArtwork.rightImageUrl);
      const obtained = replaced.rewards.find((r) => r.requiredShopCount === 20);
      assert.equal(obtained.imageUrl, gate20.imageUrl, "Existing user's reward image updates automatically");
    }
    if (thresholds.includes(n)) {
      const result = await okFetch(`/api/shops/stage_shop_${suffix}/draw`, { method: "POST" }, visitor);
      assert.equal(result.shopCount, n);
      assert.equal(result.goal, 100);
      assert.deepEqual(result.clearedStages.map((stage) => stage.requiredShopCount), [n]);
      const atGate = await okFetch("/api/collection", {}, visitor);
      assert.equal(atGate.shopCount, n);
      assert.equal(atGate.goal, 100);
      assert.equal(atGate.stages.find((stage) => stage.requiredShopCount === n).isCleared, true);
      assert.deepEqual(atGate.triptych.panels.map((panel) => panel.position), ["left", "center", "right"]);
      const unlockedPieces = atGate.triptych.panels.filter((panel) => panel.imageUrl).map((panel) => panel.requiredShopCount);
      if (n === 10) assert.deepEqual(unlockedPieces, [10], "Only left unlocked at 10");
      if (n === 20) assert.deepEqual(unlockedPieces, [10, 20], "Right unlocked at 20; center remains hidden");
      if (n === 30) {
        assert.deepEqual(unlockedPieces, [10, 30, 20], "Center completes the triptych at 30");
        assert.ok(atGate.triptych.fullImageUrl, "Full panorama unlocked at 30");
        previousCompletedUrl = atGate.triptych.fullImageUrl;
        assert.equal(result.triptych.fullImageUrl, previousCompletedUrl);
      }
      const next = atGate.stages.find((stage) => stage.requiredShopCount > n);
      if (next) assert.equal(next.isRevealed, true);
      if (n === 10 || n === 20) {
        assert.equal(atGate.stages.find((stage) => stage.requiredShopCount === 50).isRevealed, false);
      }
      if (n === 20) {
        assert.equal(atGate.rewards.some((reward) => reward.requiredShopCount === 20), true);
        const rightReward = atGate.rewards.find((reward) => reward.requiredShopCount === 20);
        assert.equal(rightReward.imageUrl, atGate.triptych.panels.find((p) => p.position === "right").imageUrl);
      }
      if (n === 30) {
        assert.equal(result.unlocked.some((reward) => reward.requiredShopCount === 30), true);
      }
      if (n === 100) assert.equal(atGate.stages.every((stage) => stage.isCleared), true);
      if (n === 10) {
        const repeat = await okFetch(`/api/shops/stage_shop_${suffix}/draw`, { method: "POST" }, visitor);
        assert.equal(repeat.shopCount, 10);
        assert.equal(repeat.clearedStages.length, 0);
      }
    } else {
      await db.prepare("INSERT INTO collection_items (user_id, treat_id) VALUES ((SELECT id FROM users WHERE note_id = ?), ?)")
        .bind(visitor.noteId, `test_treat_${suffix}`).run();
    }
  }
  const admin = await okFetch("/api/admin/shops", { headers: adminHeaders });
  assert.equal(admin.triptychArtwork.name, "新しい秘密パノラマ");
  assert.ok(admin.triptychArtwork.leftImageUrl);
  assert.ok(admin.triptychArtwork.centerImageUrl);
  assert.ok(admin.triptychArtwork.rightImageUrl);
  assert.equal(admin.rewardSlots.some((reward) => reward.requiredShopCount === 20), true);
  assert.equal(admin.rewardSlots.some((reward) => reward.requiredShopCount === 30), true);
  // With 100 new owners, a page returns at most 25 rows and search stays admin-only.
  const allParticipants = await okFetch("/api/admin/participants", { headers: adminHeaders });
  assert.equal(allParticipants.totals.registered, 102);
  assert.equal(allParticipants.totals.collectors, 1);
  assert.equal(allParticipants.matchingCount, 102);
  assert.equal(allParticipants.pageSize, 25);
  assert.equal(allParticipants.totalPages, 5);
  assert.equal(allParticipants.participants.length, 25);
  assert.equal(allParticipants.participants[0].noteId, visitor.noteId);
  assert.equal(allParticipants.participants[0].shopCount, 100);
  assert.equal(allParticipants.participants[0].treatTypes, 100);
  assert.equal(allParticipants.participants[0].obtainedTotal, 101);
  const searchedOwners = await okFetch("/api/admin/participants?q=stage_shop_&page=4", { headers: adminHeaders });
  assert.equal(searchedOwners.matchingCount, 100);
  assert.equal(searchedOwners.totalPages, 4);
  assert.equal(searchedOwners.page, 4);
  assert.equal(searchedOwners.participants.length, 25);
  assert.equal(searchedOwners.participants[0].shopCount, 0);
  const pageClamped = await okFetch("/api/admin/participants?q=stage_shop_&page=5", { headers: adminHeaders });
  assert.equal(pageClamped.page, 4);
  assert.equal(pageClamped.participants.length, 25);
  const completed = await okFetch("/api/collection", {}, visitor);
  assert.equal(completed.shopCount, 100);
  assert.equal(completed.rewards.length, 3);
  assert.deepEqual(completed.rewards.map((reward) => reward.requiredShopCount), [10, 20, 30]);
}
