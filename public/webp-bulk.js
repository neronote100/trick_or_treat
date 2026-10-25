// Shared, browser-independent migration loop. Images disappear from the
// candidate list after migration, so advance using the last SEEN key rather
// than an offset. This prevents skipping or repeatedly processing a key.
export const WEBP_BULK_SAFETY_LIMIT = 300;

export async function processWebpMigration({
  listImages,
  migrateOne,
  onProgress = () => {},
  shouldStop = () => false,
  maxAttempts = WEBP_BULK_SAFETY_LIMIT,
  pageSize = 20,
}) {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > WEBP_BULK_SAFETY_LIMIT) {
    throw new Error("変換の安全上限が不正です。");
  }
  let cursor = "";
  let attempted = 0;
  let converted = 0;
  let skipped = 0;
  let failed = 0;
  let savedBytes = 0;
  let initialPending = 0;
  let firstPage = true;
  let stoppedReason = "completed";
  let lastError = "";
  const issues = [];

  while (attempted < maxAttempts) {
    if (shouldStop()) { stoppedReason = "paused"; break; }
    const page = await listImages(cursor);
    if (firstPage) {
      initialPending = Number(page.pending || 0);
      firstPage = false;
    }
    const images = page.images || [];
    if (!images.length) break;
    for (const image of images) {
      if (shouldStop()) { stoppedReason = "paused"; break; }
      if (attempted >= maxAttempts) { stoppedReason = "safety-limit"; break; }
      cursor = image.key;
      attempted++;
      try {
        const outcome = await migrateOne(image);
        if (outcome?.migrated) {
          converted++;
          savedBytes += Number(outcome.savedBytes || 0);
        } else {
          skipped++;
          if (outcome?.reason && issues.length < 5) issues.push(outcome.reason);
        }
      } catch (error) {
        failed++;
        lastError = String(error?.message || "変換エラー");
        if (issues.length < 5) issues.push(lastError);
        // Do not keep hammering Cloudflare on a storage, quota, or auth error.
        if ([401, 403, 429, 500, 502, 503, 504].includes(error?.status)) {
          stoppedReason = "server-error";
        }
      }
      onProgress({ attempted, converted, skipped, failed, savedBytes, initialPending, maxAttempts, lastError });
      if (stoppedReason !== "completed") break;
    }
    if (stoppedReason !== "completed") break;
    if (images.length < pageSize) break;
  }
  if (stoppedReason === "completed" && attempted >= maxAttempts) stoppedReason = "safety-limit";
  // Re-query to report the actual remaining total including uncompressible
  // images, without suggesting that all PNGs have been transformed.
  let remaining = null;
  try { remaining = Number((await listImages("")).pending || 0); } catch { /* retain the task result */ }
  return {
    attempted, converted, skipped, failed, savedBytes, initialPending,
    remaining, stoppedReason, issues,
  };
}
