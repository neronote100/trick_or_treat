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
const shopOwner = { noteId: "moon_shop", secret: "a".repeat(64) };
const visitor = { noteId: "night_guest", secret: "b".repeat(64) };

try {
  const db = await mf.getD1Database("DB");
  const migration = await readFile("migrations/0001_initial.sql", "utf8");
  for (const statement of migration.split(";").map((part) => part.trim()).filter(Boolean)) {
    await db.prepare(statement).run();
  }

  await register(shopOwner);
  await register(visitor);

  const shopForm = new FormData();
  shopForm.set("name", "月夜のお菓子店");
  shopForm.set("description", "星明かりの下でどうぞ");
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

  const reset = await okFetch(`/api/admin/users/${shopOwner.noteId}/recovery`, {
    method: "POST",
    headers: { "x-admin-token": "test-admin" },
  });
  assert.match(reset.recoveryCode, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  const recoveredOwner = { noteId: shopOwner.noteId, secret: "c".repeat(64) };
  await okFetch("/api/users/recover", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      noteId: recoveredOwner.noteId,
      recoveryCode: reset.recoveryCode,
      deviceSecret: recoveredOwner.secret,
    }),
  });
  const recoveredMe = await okFetch("/api/me", {}, recoveredOwner);
  assert.equal(recoveredMe.shop.name, "月夜のお菓子店");

  const publicList = await mf.dispatchFetch(new Request(`${base}/api/shops`));
  assert.equal(publicList.status, 404);

  const directShop = await okFetch(`/api/shops/${shopOwner.noteId}`);
  assert.equal(directShop.shop.noteId, shopOwner.noteId);
  assert.equal(directShop.shop.treatCount, 1);

  const draw = await okFetch(`/api/shops/${shopOwner.noteId}/draw`, { method: "POST" }, visitor);
  assert.equal(draw.treat.name, "月のキャンディ");
  assert.equal(draw.isNew, true);
  assert.equal(draw.shopCount, 1);

  const collection = await okFetch("/api/collection", {}, visitor);
  assert.equal(collection.items.length, 1);
  assert.equal(collection.items[0].obtainedCount, 1);
  assert.equal(collection.shops.length, 1);
  assert.equal(collection.shops[0].noteId, shopOwner.noteId);
  assert.equal(collection.shops[0].collectedCount, 1);
  const image = await mf.dispatchFetch(`${base}${collection.items[0].imageUrl}`);
  assert.equal(image.status, 200);
  assert.equal(image.headers.get("content-type"), "image/png");
  console.log("Smoke test passed: register → publish → admin recovery → draw → collection");
} finally {
  await mf.dispose();
}

async function register(identity) {
  return okFetch("/api/users", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ noteId: identity.noteId, deviceSecret: identity.secret }),
  });
}

async function okFetch(path, options = {}, identity) {
  const headers = new Headers(options.headers || {});
  if (identity) {
    headers.set("x-note-id", identity.noteId);
    headers.set("x-device-secret", identity.secret);
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
