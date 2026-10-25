import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { processWebpMigration, WEBP_BULK_SAFETY_LIMIT } from "../public/webp-bulk.js";

function fakeInventory(count) {
  const remaining = new Set(Array.from({ length: count }, (_, i) =>
    `treats/candy_${String(i + 1).padStart(4, "0")}.png`));
  let pageCalls = 0;
  const listImages = async (after = "") => {
    pageCalls++;
    return {
      pending: remaining.size,
      images: [...remaining].sort().filter((key) => key > after).slice(0, 20).map((key) => ({ key })),
    };
  };
  return { remaining, listImages, getPageCalls: () => pageCalls };
}

// More than 20 images should need only one user action and scan all pages.
{
  const store = fakeInventory(57);
  let updates = 0;
  const result = await processWebpMigration({
    listImages: store.listImages,
    migrateOne: async ({ key }) => {
      if (key.endsWith("0013.png")) return { migrated: false, reason: "WebP would be larger" };
      store.remaining.delete(key);
      return { migrated: true, savedBytes: 2048 };
    },
    onProgress: () => updates++,
  });
  assert.equal(result.attempted, 57);
  assert.equal(result.converted, 56);
  assert.equal(result.skipped, 1);
  assert.equal(result.failed, 0);
  assert.equal(result.remaining, 1, "Do not claim completion for incompressible image");
  assert.equal(result.stoppedReason, "completed");
  assert.equal(updates, 57);
  assert.ok(store.getPageCalls() >= 4, "Fetch subsequent pages using last-seen key");
}

// Do not exhaust Cloudflare's daily writes when inventory is very large.
{
  const store = fakeInventory(370);
  const result = await processWebpMigration({
    listImages: store.listImages,
    migrateOne: async ({ key }) => {
      store.remaining.delete(key);
      return { migrated: true, savedBytes: 1000 };
    },
  });
  assert.equal(result.attempted, WEBP_BULK_SAFETY_LIMIT);
  assert.equal(result.converted, WEBP_BULK_SAFETY_LIMIT);
  assert.equal(result.remaining, 70);
  assert.equal(result.stoppedReason, "safety-limit");
}

// User's pause request takes effect before the next image.
{
  const store = fakeInventory(14);
  let stop = false;
  const result = await processWebpMigration({
    listImages: store.listImages,
    shouldStop: () => stop,
    migrateOne: async ({ key }) => { store.remaining.delete(key); return { migrated: true }; },
    onProgress: ({ attempted }) => { if (attempted === 4) stop = true; },
  });
  assert.equal(result.attempted, 4);
  assert.equal(result.remaining, 10);
  assert.equal(result.stoppedReason, "paused");
}

// Storage/auth/quota errors trigger immediate safe stop rather than retry loops.
{
  const store = fakeInventory(30);
  const seen = [];
  const result = await processWebpMigration({
    listImages: store.listImages,
    migrateOne: async ({ key }) => {
      seen.push(key);
      if (seen.length === 3) {
        const error = new Error("Cloudflare image capacity reached");
        error.status = 500;
        throw error;
      }
      store.remaining.delete(key);
      return { migrated: true };
    },
  });
  assert.equal(result.attempted, 3);
  assert.equal(result.converted, 2);
  assert.equal(result.failed, 1);
  assert.equal(result.stoppedReason, "server-error");
  assert.equal(result.remaining, 28);
}

{
  const empty = fakeInventory(0);
  const result = await processWebpMigration({
    listImages: empty.listImages, migrateOne: async () => { throw new Error("Should not execute"); },
  });
  assert.equal(result.converted, 0);
  assert.equal(result.remaining, 0);
  assert.equal(result.stoppedReason, "completed");
}

await assert.rejects(() => processWebpMigration({
  listImages: async () => ({ images: [] }), migrateOne: async () => {},
  maxAttempts: WEBP_BULK_SAFETY_LIMIT + 1,
}), /安全上限/);

// Ensure public admin interface exposes an explicit full-run and pause action.
{
  const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  assert.ok(app.includes('data-action="migrate-webp-all"'));
  assert.ok(app.includes('data-action="stop-webp"'));
  assert.ok(app.includes('data-action="cleanup-webp-all"'));
  assert.ok(app.includes("processWebpMigration({"));
}
console.log("WebP bulk migration unit tests passed");
