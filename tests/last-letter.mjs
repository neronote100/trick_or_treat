import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { FormData, Miniflare, Request } from "miniflare";

const mf = new Miniflare({
  modules: true,
  scriptPath: "src/index.js",
  compatibilityDate: "2026-09-21",
  d1Databases: { DB: "letter-test-db" },
  kvNamespaces: { IMAGES: "letter-test-images" },
  bindings: { ADMIN_TOKEN: "test-admin" },
});
const origin = "http://example.test";
const admin = { "x-admin-token": "test-admin" };
const visitor = { "x-note-id": "last_letter_visitor" };
const secondVisitor = { "x-note-id": "second_reader" };

async function api(path, method = "GET", headers = {}, body = null) {
  const request = new Request(origin + path, { method, headers, redirect: "manual", ...(body ? { body } : {}) });
  return mf.dispatchFetch(request);
}
async function ok(path, method, headers, body) {
  const r = await api(path, method, headers, body);
  const data = await r.json();
  assert.ok(r.ok, `${method} ${path}: ${r.status} ${JSON.stringify(data)}`);
  return data;
}
function json(value) { return JSON.stringify(value); }
function png() {
  const bytes = new Uint8Array(128);
  bytes.set([137,80,78,71,13,10,26,10]);
  return new File([bytes], "creator.png", { type: "image/png" });
}
function webp() {
  const bytes = new Uint8Array(128);
  bytes.set([82,73,70,70, 120,0,0,0, 87,69,66,80]);
  return new File([bytes], "completed-board.webp", { type: "image/webp" });
}

try {
  const db = await mf.getD1Database("DB");
  const migration = await readFile("migrations/0001_initial.sql", "utf8");
  for (const stmt of migration.split(";").map((v) => v.trim()).filter(Boolean)) await db.prepare(stmt).run();
  const visibility = await ok("/api/last-letter");
  assert.equal(visibility.published, false);
  assert.equal(visibility.cards.length, 7);
  assert.ok(visibility.cards.every((c) => !c.found && !c.letter && !c.creatorName));
  assert.equal((await api("/api/admin/last-letter")).status, 401, "Creator URLs require admin authentication");
  assert.equal((await api("/api/admin/last-letter/initialize", "POST")).status, 401);
  assert.equal((await api("/api/admin/last-letter/finale", "POST", {}, new FormData())).status, 401);
  assert.equal(visibility.finale, undefined, "Never reveal finale before completion");
  assert.equal((await api("/api/admin/last-letter/visibility", "POST",
    { "content-type": "application/json" }, json({ published: true }))).status, 401);

  const first = await ok("/api/admin/last-letter/initialize", "POST", admin);
  assert.equal(first.slots.length, 7);
  assert.equal(first.initialized, true);
  assert.equal(first.published, false);
  assert.equal(first.slots.map((c) => c.letter).join(""), "みんなの思い出");
  assert.ok(first.slots.every((c) => /^[a-f0-9]{32}$/.test(c.token)));
  assert.equal(new Set(first.slots.map((c) => c.token)).size, 7);
  const again = await ok("/api/admin/last-letter/initialize", "POST", admin);
  assert.deepEqual(again.slots.map((c) => c.token), first.slots.map((c) => c.token),
    "Re-initializing must not invalidate creators' shared links");

  await ok("/api/users", "POST", { "content-type": "application/json" }, json({ noteId: "last_letter_visitor" }));
  await ok("/api/users", "POST", { "content-type": "application/json" }, json({ noteId: "second_reader" }));
  assert.equal((await api("/api/last-letter/claim", "POST",
    { ...visitor, "content-type": "application/json" }, json({ token: first.slots[0].token }))).status, 403,
    "Claiming is forbidden until the administrator publishes");

  const denied = await api("/api/admin/last-letter/visibility", "POST",
    { ...admin, "content-type": "application/json" }, json({ published: true }));
  assert.equal(denied.status, 409, "All seven creators must be configured before launch");

  // Even a valid PNG cannot be stored as a Last Letter finished artwork.
  const badFormat = new FormData();
  badFormat.set("slot", "1");
  badFormat.set("creatorName", "PNGテスト");
  badFormat.set("image", png());
  assert.equal((await api("/api/admin/last-letter/slot", "POST", admin, badFormat)).status, 400);

  // Reject files with a misleading .webp extension or MIME.
  const deceptiveFile = new FormData();
  deceptiveFile.set("slot", "1");
  deceptiveFile.set("creatorName", "偽WebP");
  deceptiveFile.set("image", new File([await png().arrayBuffer()], "fake.webp", { type: "image/webp" }));
  assert.equal((await api("/api/admin/last-letter/slot", "POST", admin, deceptiveFile)).status, 400);
  assert.equal((await ok("/api/admin/last-letter", "GET", admin)).slots[0].characterImageUrl, null);

  for (const card of first.slots) {
    const form = new FormData();
    form.set("slot", String(card.slot));
    form.set("creatorName", `クリエイター${card.slot}`);
    form.set("creatorNoteId", "nero_notelover");
    form.set("image", webp());
    const result = await ok("/api/admin/last-letter/slot", "POST", admin, form);
    assert.equal(result.saved, true);
    const redirect = await api(card.path);
    assert.equal(redirect.status, 302);
    assert.equal(new URL(redirect.headers.get("location")).hash, `#/last-letter/${card.token}`);
  }

  const configured = await ok("/api/admin/last-letter", "GET", admin);
  assert.equal(configured.slots.length, 7);
  assert.ok(configured.slots.every((c) => c.characterImageUrl?.endsWith(".webp") && c.creatorName));
  const artResponse = await api(configured.slots[0].characterImageUrl);
  assert.equal(artResponse.status, 200);
  assert.equal(artResponse.headers.get("content-type"), "image/webp");
  assert.equal(new Uint8Array(await artResponse.arrayBuffer())[0], 82, "Stored bytes begin with RIFF");
  const metadataOnly = new FormData();
  metadataOnly.set("slot", "1");
  metadataOnly.set("creatorName", "クリエイター1");
  metadataOnly.set("creatorNoteId", "nero_notelover");
  await ok("/api/admin/last-letter/slot", "POST", admin, metadataOnly);
  assert.equal((await ok("/api/admin/last-letter", "GET", admin)).slots[0].characterImageUrl,
    configured.slots[0].characterImageUrl, "Editing name without a new image retains original WebP");
  assert.equal(configured.published, false);
  // The seven front cards are not enough to publish without the secret 4:5 art.
  assert.equal((await api("/api/admin/last-letter/visibility", "POST",
    { ...admin, "content-type": "application/json" }, json({ published: true }))).status, 409);
  const invalidFinale = new FormData();
  invalidFinale.set("headline", "お祝いメッセージ");
  invalidFinale.set("subMessage", "ありがとう");
  invalidFinale.set("image", png());
  assert.equal((await api("/api/admin/last-letter/finale", "POST", admin, invalidFinale)).status, 400);
  const fakeFinale = new FormData();
  fakeFinale.set("headline", "お祝いメッセージ");
  fakeFinale.set("image", new File([await png().arrayBuffer()], "fake.webp", { type: "image/webp" }));
  assert.equal((await api("/api/admin/last-letter/finale", "POST", admin, fakeFinale)).status, 400);
  const finaleUpload = new FormData();
  finaleUpload.set("headline", "遊んでくれてありがとう✨");
  finaleUpload.set("subMessage", "7人と過ごしたハロハロウィーンは宝物です🌙");
  finaleUpload.set("image", webp());
  const savedFinale = await ok("/api/admin/last-letter/finale", "POST", admin, finaleUpload);
  assert.equal(savedFinale.saved, true);
  assert.ok(savedFinale.imageUrl.endsWith(".webp"));
  const adminFinale = await ok("/api/admin/last-letter", "GET", admin);
  assert.equal(adminFinale.finale.imageUrl, savedFinale.imageUrl);
  assert.equal(adminFinale.finale.headline, "遊んでくれてありがとう✨");
  const servedFinale = await api(savedFinale.imageUrl);
  assert.equal(servedFinale.status, 200);
  assert.equal(servedFinale.headers.get("content-type"), "image/webp");
  // Message updates never invalidate artwork URLs, creator links, or claims.
  const textOnlyFinale = new FormData();
  textOnlyFinale.set("headline", "また会おうね！🎃");
  textOnlyFinale.set("subMessage", "ハロハロウィーンに来てくれてありがとう✨");
  await ok("/api/admin/last-letter/finale", "POST", admin, textOnlyFinale);
  const edited = await ok("/api/admin/last-letter", "GET", admin);
  assert.equal(edited.finale.imageUrl, savedFinale.imageUrl);
  assert.equal(edited.finale.headline, "また会おうね！🎃");
  assert.equal(edited.finale.subMessage, "ハロハロウィーンに来てくれてありがとう✨");
  const badEmptyText = new FormData();
  badEmptyText.set("headline", "");
  assert.equal((await api("/api/admin/last-letter/finale", "POST", admin, badEmptyText)).status, 400);
  const publicDraft = await ok("/api/last-letter");
  assert.ok(publicDraft.cards.every((c) => !c.characterImageUrl && !c.creatorName),
    "Draft must never expose private creators or board letters");
  assert.equal(publicDraft.finale, undefined, "Draft must hide final art and adjustable message");

  const activated = await ok("/api/admin/last-letter/visibility", "POST",
    { ...admin, "content-type": "application/json" }, json({ published: true }));
  assert.equal(activated.published, true);
  assert.equal((await api("/api/last-letter/claim", "POST",
    { "content-type": "application/json" }, json({ token: first.slots[0].token }))).status, 401);
  const publicBeforeClaim = await ok("/api/last-letter", "GET", visitor);
  assert.equal(publicBeforeClaim.published, true);
  assert.equal(publicBeforeClaim.count, 0);
  assert.ok(publicBeforeClaim.cards.every((c) => !c.letter && !c.creatorName));
  assert.equal(publicBeforeClaim.finale, undefined, "Incomplete visitors must never see the special art URL");

  for (const slot of first.slots) {
    const claimed = await ok("/api/last-letter/claim", "POST",
      { ...visitor, "content-type": "application/json" }, json({ token: slot.token }));
    assert.equal(claimed.newlyCollected, true);
    assert.equal(claimed.slot, slot.slot);
    assert.equal(claimed.letter, slot.letter);
    const repeat = await ok("/api/last-letter/claim", "POST",
      { ...visitor, "content-type": "application/json" }, json({ token: slot.token }));
    assert.equal(repeat.newlyCollected, false, "Reopening the same article must not duplicate a board");
    const progress = await ok("/api/last-letter", "GET", visitor);
    assert.equal(progress.count, slot.slot);
    assert.equal(progress.cards.filter((c) => c.found).length, slot.slot);
    if (slot.slot < 7) {
      assert.equal(progress.isComplete, false);
      assert.equal(progress.finale, undefined, "Final image and messages require all seven");
    }
  }
  const completed = await ok("/api/last-letter", "GET", visitor);
  assert.equal(completed.isComplete, true);
  assert.equal(completed.message, "みんなの思い出");
  assert.equal(completed.backMessage, "あつまったね🎃");
  assert.ok(completed.thanks.includes("ありがとう"));
  assert.equal(completed.finale.imageUrl, savedFinale.imageUrl);
  assert.equal(completed.finale.headline, "また会おうね！🎃");
  assert.equal(completed.finale.subMessage, "ハロハロウィーンに来てくれてありがとう✨");
  assert.equal((await ok("/api/admin/last-letter", "GET", admin)).participants, 1);

  const other = await ok("/api/last-letter", "GET", secondVisitor);
  assert.equal(other.count, 0, "Every note ID has its own collection");
  assert.equal(other.isComplete, false);
  assert.equal(other.finale, undefined, "Another visitor does not inherit the reward art");
  assert.ok(other.cards.every((c) => !c.creatorName));
  assert.equal((await api("/api/last-letter/claim", "POST",
    { ...secondVisitor, "content-type": "application/json" },
    json({ token: "a".repeat(32) }))).status, 404);
  const one = await ok("/api/last-letter/claim", "POST",
    { ...secondVisitor, "content-type": "application/json" }, json({ token: first.slots[5].token }));
  assert.equal(one.letter, "い");
  assert.equal((await ok("/api/last-letter", "GET", secondVisitor)).count, 1);

  const turnedOff = await ok("/api/admin/last-letter/visibility", "POST",
    { ...admin, "content-type": "application/json" }, json({ published: false }));
  assert.equal(turnedOff.published, false);
  const closed = await ok("/api/last-letter", "GET", visitor);
  assert.equal(closed.published, false);
  assert.ok(closed.cards.every((c) => !c.letter));
  assert.equal((await api("/api/last-letter/claim", "POST",
    { ...visitor, "content-type": "application/json" }, json({ token: first.slots[0].token }))).status, 403);
  const enabledAgain = await ok("/api/admin/last-letter/visibility", "POST",
    { ...admin, "content-type": "application/json" }, json({ published: true }));
  assert.equal(enabledAgain.published, true);
  assert.equal((await ok("/api/last-letter", "GET", visitor)).count, 7,
    "Suspending and resuming the event preserves completed collections");

  const rendered = await readFile("public/app.js", "utf8");
  assert.match(rendered, /function lastLetterBoard/);
  assert.match(rendered, /class="last-letter-finished-art"/);
  assert.ok(!rendered.slice(rendered.indexOf("function lastLetterBoard"), rendered.indexOf("function lastLetterStage"))
    .includes("last-letter-held-board"), "The entire user image is displayed without a generated letter board");
  assert.ok(rendered.includes('accept="image/webp,.webp"'));
  assert.match(rendered, /data-form="last-letter-finale"/);
  assert.match(rendered, /last-letter-final-frame/);
  assert.match(rendered, /last-letter-candy-rain/);
  assert.match(rendered, /validateLastLetterArtwork\(image, 4, 5\)/);
  assert.match(rendered, /validateLastLetterArtwork\(image, 1, 1\)/);
  assert.match(rendered, /data\.finale/);
  assert.match(rendered, /function lastLetterStage/);
  assert.match(rendered, /flip-last-letter/);
  assert.match(rendered, /last-letter-admin/);
  console.log("Last Letter smoke tests passed: seven private links, publish gate, seven claims, flip, reopening.");
} finally {
  await mf.dispose();
}
