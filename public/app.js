const app = document.querySelector("#app");
const overlay = document.querySelector("#overlay");
const toast = document.querySelector("#toast");
const accountLabel = document.querySelector("#account-label");
const IDENTITY_KEY = "trick-or-treat.identity.v1";

const state = {
  identity: loadIdentity(),
  me: null,
  collection: null,
  busy: false,
};

window.addEventListener("hashchange", renderRoute);
document.querySelector("#account-button").addEventListener("click", openAccount);
document.addEventListener("submit", handleSubmit);
document.addEventListener("click", handleClick);
document.addEventListener("change", handleChange);

boot();

async function boot() {
  updateAccount();
  if (state.identity) {
    try {
      state.me = await api("/api/me");
    } catch (error) {
      if (error.code === "AUTH_INVALID" || error.code === "AUTH_REQUIRED") logout(false);
    }
  }
  if (!location.hash) location.hash = "#/collection";
  await renderRoute();
  const page = location.hash.replace(/^#\/?/, "").split("/")[0];
  if (!state.identity && page !== "admin") openJoin();
}

async function renderRoute() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const page = parts[0] || "collection";
  setActiveNav(page === "shop" ? "collection" : page);
  window.scrollTo({ top: 0, behavior: "smooth" });

  try {
    if (page === "studio") return renderStudio();
    if (page === "collection") return renderCollection();
    if (page === "shop" && parts[1]) return renderShop(parts[1]);
    if (page === "admin") return renderAdmin();
    location.hash = "#/collection";
  } catch (error) {
    app.innerHTML = errorState(error.message);
  }
}

async function renderStudio() {
  if (!ensureAuth()) return;
  showLoader();
  state.me = await api("/api/me");
  const { shop, treats } = state.me;
  const status = shop?.status || "draft";
  const statusLabel = { draft: "準備中", pending: "旧申請", published: "公開中", suspended: "停止中" }[status];
  app.innerHTML = `
    <section class="page">
      <div class="page-head"><div><p class="eyebrow">MY SHOP</p><h1>お店をひらく</h1></div><span class="status ${status}">${statusLabel}</span></div>
      <form class="panel" data-form="shop">
        <div class="panel-head"><h2>お店</h2></div>
        <label class="image-picker">
          ${shop?.characterImageUrl ? `<img data-preview="character" src="${escapeAttr(shop.characterImageUrl)}" alt="キャラクター画像">` : `<span class="image-placeholder" data-preview="character"><b>＋</b>キャラクター画像</span>`}
          <input type="file" name="characterImage" accept="image/png,image/jpeg,image/webp,image/gif" data-preview-target="character">
        </label>
        <label class="field"><span>店名</span><input name="name" required maxlength="50" value="${escapeAttr(shop?.name || "")}" placeholder="月夜のお菓子店"></label>
        <label class="field"><span>ひとこと</span><textarea name="description" maxlength="200" placeholder="お店からのメッセージ">${escapeHtml(shop?.description || "")}</textarea></label>
        <button class="btn btn-primary" type="submit">保存する</button>
      </form>

      <form class="panel" data-form="treat">
        <div class="panel-head"><h2>お菓子</h2><span class="status">${treats.length} 個</span></div>
        ${shop ? `
          <label class="image-picker">
            <span class="image-placeholder" data-preview="treat"><b>＋</b>お菓子画像</span>
            <input type="file" name="image" required accept="image/png,image/jpeg,image/webp,image/gif" data-preview-target="treat">
          </label>
          <label class="field"><span>お菓子の名前</span><input name="name" required maxlength="40" placeholder="星降るキャンディ"></label>
          <label class="field"><span>レア度</span><select name="rarity"><option value="normal">ノーマル</option><option value="rare">レア</option><option value="secret">シークレット</option></select></label>
          <button class="btn btn-secondary" type="submit">追加する</button>` : `<p class="subtle">先にお店を保存してください。</p>`}
      </form>

      ${treats.length ? `<div class="panel"><div class="treat-list">${treats.map(treatRow).join("")}</div></div>` : ""}

      ${shop ? `<div class="panel">
        <div class="button-row">
          ${status === "published" ? `<button class="btn btn-secondary" data-action="share" data-path="${escapeAttr(shop.sharePath)}">URLをコピー</button>` : status === "suspended" ? "" : `<button class="btn btn-primary" data-action="submit-shop" ${!shop.characterImageUrl || !treats.length ? "disabled" : ""}>出店する</button>`}
        </div>
        ${status === "suspended" ? `<p class="subtle">このお店は管理者によって公開停止されています。</p>` : ""}
      </div>` : ""}
      <a class="admin-link" href="#/admin">管理者はこちら</a>
    </section>`;
}

function treatRow(treat) {
  return `<div class="treat-row">
    <img src="${escapeAttr(treat.imageUrl)}" alt="${escapeAttr(treat.name)}">
    <div><h3>${escapeHtml(treat.name)}</h3><p>${rarityLabel(treat.rarity)}</p></div>
    <button class="icon-button" type="button" data-action="delete-treat" data-id="${escapeAttr(treat.id)}" aria-label="${escapeAttr(treat.name)}を削除">×</button>
  </div>`;
}

async function renderShop(noteId) {
  showLoader();
  const data = await api(`/api/shops/${encodeURIComponent(noteId)}`, { auth: false });
  const shop = data.shop;
  app.innerHTML = `
    <section class="page">
      <a class="text-button" href="#/collection">← 図鑑へ</a>
      <div class="shop-stage">
        <img class="shop-stage-image" src="${escapeAttr(shop.characterImageUrl)}" alt="${escapeAttr(shop.name)}">
        <div class="shop-stage-body">
          <p class="eyebrow">@${escapeHtml(shop.noteId)}</p>
          <h1>${escapeHtml(shop.name)}</h1>
          ${shop.description ? `<p class="subtle">${escapeHtml(shop.description)}</p>` : ""}
          <div class="mystery-row">${Array.from({ length: Math.min(shop.treatCount, 6) }, () => `<span class="mystery">?</span>`).join("")}</div>
          <button class="btn btn-primary draw-button" data-action="draw" data-note-id="${escapeAttr(shop.noteId)}">トリック・オア・トリート！</button>
        </div>
      </div>
    </section>`;
}

async function renderCollection() {
  if (!ensureAuth()) return;
  showLoader();
  state.collection = await api("/api/collection");
  const data = state.collection;
  const percent = Math.min(100, (data.shopCount / data.goal) * 100);
  app.innerHTML = `
    <section class="page">
      <div class="page-head"><div><p class="eyebrow">COLLECTION</p><h1>お菓子図鑑</h1></div></div>
      <div class="progress-card">
        <div class="progress-ring" style="--progress:${percent}%"><strong>${data.shopCount}/${data.goal}</strong></div>
        <div class="progress-copy"><h2>${data.shopCount >= data.goal ? "コンプリート！" : "あと " + (data.goal - data.shopCount) + " 店"}</h2><p>ちがうお店のお菓子を集めよう</p></div>
      </div>
      ${data.rewards.map(rewardCard).join("")}
      <p class="section-label">訪れたお店 ${data.shops.length}</p>
      ${data.shops.length ? `<div class="shop-grid">${data.shops.map(visitedShopCard).join("")}</div>` : `
        <div class="empty-state compact"><div><span class="empty-icon">☾</span>お店のURLが届いたら訪ねてみよう</div></div>`}
      <p class="section-label">見つけたお菓子 ${data.items.length}</p>
      ${data.items.length ? `<div class="collection-grid">${data.items.map(collectionCard).join("")}</div>` : `
        <div class="empty-state"><div><span class="empty-icon">◇</span>まだ見つけていません</div></div>`}
    </section>`;
}

function visitedShopCard(shop) {
  return `<a class="shop-card" href="#/shop/${encodeURIComponent(shop.noteId)}">
    ${shop.characterImageUrl ? `<img class="card-image" src="${escapeAttr(shop.characterImageUrl)}" alt="${escapeAttr(shop.name)}">` : `<div class="card-image"></div>`}
    <div class="card-body">
      <h3>${escapeHtml(shop.name)}</h3>
      <p class="card-meta"><span>@${escapeHtml(shop.noteId)}</span><b class="candy-count">${shop.collectedCount} 🍬</b></p>
    </div>
  </a>`;
}

function collectionCard(item) {
  return `<a class="collection-card" href="#/shop/${encodeURIComponent(item.noteId)}">
    <img src="${escapeAttr(item.imageUrl)}" alt="${escapeAttr(item.name)}">
    ${item.obtainedCount > 1 ? `<span class="count-badge">×${item.obtainedCount}</span>` : ""}
    <div class="collection-info"><span class="rarity">${rarityLabel(item.rarity)}</span><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.shopName)}</p></div>
  </a>`;
}

function rewardCard(reward) {
  return `<div class="reward-card"><img src="${escapeAttr(reward.imageUrl)}" alt="${escapeAttr(reward.name)}"><div class="reward-label">✦ ${escapeHtml(reward.name)}</div></div>`;
}

async function renderAdmin() {
  setActiveNav("");
  app.innerHTML = `
    <section class="page">
      <div class="page-head"><div><p class="eyebrow">OWNER</p><h1>管理</h1></div></div>
      <form class="panel" data-form="admin-login">
        <label class="field"><span>管理者キー</span><input name="token" type="password" required autocomplete="current-password"></label>
        <button class="btn btn-primary" type="submit">確認する</button>
      </form>
    </section>`;
}

async function showAdmin(token) {
  const data = await api("/api/admin/shops", { adminToken: token, auth: false });
  app.innerHTML = `
    <section class="page">
      <div class="page-head"><div><p class="eyebrow">OWNER</p><h1>みんなのお店</h1></div><span class="status">${data.shops.length} 店</span></div>
      <form class="panel" data-form="admin-recovery" data-token="${escapeAttr(token)}">
        <h2>引き継ぎコード再発行</h2>
        <p class="subtle">紛失した参加者のnote IDを入力します。以前のコードは無効になります。</p>
        <label class="field"><span>note ID</span><input name="noteId" required minlength="3" maxlength="32" pattern="[A-Za-z0-9_]+" autocomplete="off" placeholder="neronote100"></label>
        <button class="btn btn-secondary" type="submit">新しいコードを発行</button>
      </form>
      ${data.shops.length ? data.shops.map((shop) => `<div class="panel">
        <div class="panel-head"><div><h2>${escapeHtml(shop.name)}</h2><p class="subtle">@${escapeHtml(shop.noteId)} ・ ${shop.treatCount} 🍬</p><span class="status ${escapeAttr(shop.status)}">${shopStatusLabel(shop.status)}</span></div>${shop.characterImageUrl ? `<img src="${escapeAttr(shop.characterImageUrl)}" alt="" style="width:64px;height:64px;border-radius:14px;object-fit:cover">` : ""}</div>
        <p class="subtle">${escapeHtml(shop.description || "")}</p>
        <div class="button-row">
          ${shop.status === "published" ? `<a class="btn btn-secondary" href="#/shop/${encodeURIComponent(shop.noteId)}">お店を見る</a><button class="btn btn-secondary" data-action="suspend-shop" data-id="${escapeAttr(shop.id)}" data-token="${escapeAttr(token)}">公開停止</button>` : ""}
          ${["pending", "suspended"].includes(shop.status) ? `<button class="btn btn-primary" data-action="publish-shop" data-id="${escapeAttr(shop.id)}" data-token="${escapeAttr(token)}">再公開する</button>` : ""}
        </div>
      </div>`).join("") : `<div class="empty-state">お店はまだありません</div>`}
      <form class="panel" data-form="reward" data-token="${escapeAttr(token)}">
        <h2>特別画像</h2>
        <label class="field"><span>名前</span><input name="name" maxlength="50" value="10店舗コンプリート"></label>
        <label class="field"><span>必要店舗数</span><input name="requiredShopCount" type="number" min="1" max="100" value="10"></label>
        <label class="field"><span>画像</span><input name="image" type="file" required accept="image/png,image/jpeg,image/webp,image/gif"></label>
        <button class="btn btn-secondary" type="submit">登録する</button>
      </form>
    </section>`;
}

async function handleSubmit(event) {
  const form = event.target.closest("form[data-form]");
  if (!form) return;
  event.preventDefault();
  const kind = form.dataset.form;
  const submit = form.querySelector("button[type=submit]");
  setBusy(submit, true);
  try {
    if (kind === "join") await register(new FormData(form));
    if (kind === "recover") await recover(new FormData(form));
    if (kind === "shop") {
      state.me = await api("/api/me/shop", { method: "PUT", body: new FormData(form) });
      notify("保存しました");
      await renderStudio();
    }
    if (kind === "treat") {
      state.me = await api("/api/me/treats", { method: "POST", body: new FormData(form) });
      notify("お菓子を追加しました");
      await renderStudio();
    }
    if (kind === "admin-login") await showAdmin(new FormData(form).get("token"));
    if (kind === "admin-recovery") {
      const noteId = String(new FormData(form).get("noteId") || "").trim().toLowerCase();
      const result = await api(`/api/admin/users/${encodeURIComponent(noteId)}/recovery`, {
        method: "POST",
        adminToken: form.dataset.token,
        auth: false,
      });
      showRecoveryCode(result.recoveryCode);
    }
    if (kind === "reward") {
      await api("/api/admin/reward", { method: "POST", body: new FormData(form), adminToken: form.dataset.token, auth: false });
      notify("特別画像を登録しました");
    }
  } catch (error) {
    notify(error.message, true);
  } finally {
    setBusy(submit, false);
  }
}

async function handleClick(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  if (action === "close-overlay") return closeOverlay();
  if (action === "show-recover") return openRecover();
  if (action === "show-join") return openJoin();
  if (action === "logout") return logout();
  if (action === "copy-recovery") return copyText(button.dataset.code, "コードをコピーしました");
  if (action === "share") return copyText(new URL(button.dataset.path, location.origin).href, "URLをコピーしました");

  const adminAction = ["publish-shop", "suspend-shop"].includes(action);
  if (!adminAction && !ensureAuth()) return;
  setBusy(button, true);
  try {
    if (action === "draw") await draw(button.dataset.noteId);
    if (action === "delete-treat") {
      if (!confirm("このお菓子を削除しますか？")) return;
      state.me = await api(`/api/me/treats/${encodeURIComponent(button.dataset.id)}`, { method: "DELETE" });
      notify("削除しました");
      await renderStudio();
    }
    if (action === "submit-shop") {
      await api("/api/me/shop/submit", { method: "POST" });
      notify("お店を公開しました");
      await renderStudio();
    }
    if (action === "publish-shop") {
      await api(`/api/admin/shops/${encodeURIComponent(button.dataset.id)}/approve`, { method: "POST", adminToken: button.dataset.token, auth: false });
      notify("再公開しました");
      await showAdmin(button.dataset.token);
    }
    if (action === "suspend-shop") {
      if (!confirm("このお店を公開停止しますか？")) return;
      await api(`/api/admin/shops/${encodeURIComponent(button.dataset.id)}/suspend`, { method: "POST", adminToken: button.dataset.token, auth: false });
      notify("公開を停止しました");
      await showAdmin(button.dataset.token);
    }
  } catch (error) {
    notify(error.message, true);
  } finally {
    setBusy(button, false);
  }
}

function handleChange(event) {
  const input = event.target.closest("input[type=file][data-preview-target]");
  if (!input?.files?.[0]) return;
  const holder = document.querySelector(`[data-preview="${input.dataset.previewTarget}"]`);
  if (!holder) return;
  const img = document.createElement("img");
  img.dataset.preview = input.dataset.previewTarget;
  img.src = URL.createObjectURL(input.files[0]);
  img.alt = "選択した画像";
  holder.replaceWith(img);
}

async function register(form) {
  const noteId = String(form.get("noteId") || "").trim().toLowerCase();
  const deviceSecret = randomSecret();
  const result = await api("/api/users", { method: "POST", body: JSON.stringify({ noteId, deviceSecret }), auth: false });
  state.identity = { noteId: result.noteId, deviceSecret };
  saveIdentity();
  state.me = await api("/api/me");
  updateAccount();
  showRecoveryCode(result.recoveryCode);
  await renderRoute();
}

async function recover(form) {
  const noteId = String(form.get("noteId") || "").trim().toLowerCase();
  const deviceSecret = randomSecret();
  const result = await api("/api/users/recover", {
    method: "POST",
    body: JSON.stringify({ noteId, recoveryCode: form.get("recoveryCode"), deviceSecret }),
    auth: false,
  });
  state.identity = { noteId: result.noteId, deviceSecret };
  saveIdentity();
  state.me = await api("/api/me");
  updateAccount();
  showRecoveryCode(result.recoveryCode);
  await renderRoute();
}

async function draw(noteId) {
  const result = await api(`/api/shops/${encodeURIComponent(noteId)}/draw`, { method: "POST" });
  const reward = result.unlocked?.[0];
  overlay.hidden = false;
  overlay.innerHTML = `<div class="dialog">
    <p class="sparkle">${result.isNew ? "✦ NEW COLLECTION ✦" : "WELCOME BACK"}</p>
    <img class="result-image" src="${escapeAttr(result.treat.imageUrl)}" alt="${escapeAttr(result.treat.name)}">
    <h2 class="result-title">${escapeHtml(result.treat.name)}</h2>
    <p class="result-meta">${rarityLabel(result.treat.rarity)} ・ ${escapeHtml(result.shop.name)} ${result.obtainedCount > 1 ? `・ ×${result.obtainedCount}` : ""}</p>
    ${reward ? `<div class="reward-card"><img src="${escapeAttr(reward.imageUrl)}" alt="${escapeAttr(reward.name)}"><div class="reward-label">10店舗達成 ✦ ${escapeHtml(reward.name)}</div></div>` : ""}
    <div class="dialog-actions"><button class="btn btn-secondary" data-action="close-overlay">閉じる</button><a class="btn btn-primary" href="#/collection" data-action="close-overlay">図鑑を見る</a></div>
  </div>`;
}

function openJoin() {
  overlay.hidden = false;
  overlay.innerHTML = `<div class="dialog">
    <p class="eyebrow">JOIN</p><h2>参加IDではじめる</h2>
    <form data-form="join">
      <label class="field"><span>note ID</span><input name="noteId" required minlength="3" maxlength="32" pattern="[A-Za-z0-9_]+" autocomplete="username" placeholder="neronote100"></label>
      <button class="btn btn-primary" type="submit">このIDではじめる</button>
    </form>
    <div class="dialog-actions"><button class="text-button" data-action="show-recover">引き継ぐ</button>${state.identity ? `<button class="text-button" data-action="close-overlay">閉じる</button>` : ""}</div>
  </div>`;
}

function openRecover() {
  overlay.hidden = false;
  overlay.innerHTML = `<div class="dialog">
    <p class="eyebrow">TRANSFER</p><h2>引き継ぐ</h2>
    <form data-form="recover">
      <label class="field"><span>note ID</span><input name="noteId" required minlength="3" maxlength="32" autocomplete="username"></label>
      <label class="field"><span>引き継ぎコード</span><input name="recoveryCode" required autocomplete="one-time-code" placeholder="XXXX-XXXX-XXXX"></label>
      <button class="btn btn-primary" type="submit">引き継ぐ</button>
    </form>
    <div class="dialog-actions"><button class="text-button" data-action="show-join">戻る</button></div>
  </div>`;
}

function showRecoveryCode(code) {
  overlay.hidden = false;
  overlay.innerHTML = `<div class="dialog">
    <p class="eyebrow">SAVE THIS CODE</p><h2>引き継ぎコード</h2>
    <p class="subtle">機種変更に使います。スクリーンショットで保存してください。</p>
    <div class="recovery-code">${escapeHtml(code)}</div>
    <div class="dialog-actions"><button class="btn btn-secondary" data-action="copy-recovery" data-code="${escapeAttr(code)}">コピー</button><button class="btn btn-primary" data-action="close-overlay">保存した</button></div>
  </div>`;
}

function openAccount() {
  if (!state.identity) return openJoin();
  overlay.hidden = false;
  overlay.innerHTML = `<div class="dialog">
    <p class="eyebrow">ACCOUNT</p><h2>@${escapeHtml(state.identity.noteId)}</h2>
    <div class="dialog-actions"><button class="btn btn-secondary" data-action="close-overlay">閉じる</button><button class="btn btn-danger" data-action="logout">この端末から解除</button></div>
  </div>`;
}

function ensureAuth() {
  if (state.identity) return true;
  openJoin();
  return false;
}

function logout(render = true) {
  localStorage.removeItem(IDENTITY_KEY);
  state.identity = null;
  state.me = null;
  state.collection = null;
  updateAccount();
  closeOverlay();
  if (render) {
    location.hash = "#/collection";
    renderRoute();
    openJoin();
  }
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.auth !== false && state.identity) {
    headers.set("x-note-id", state.identity.noteId);
    headers.set("x-device-secret", state.identity.deviceSecret);
  }
  if (options.adminToken) headers.set("x-admin-token", options.adminToken);
  if (typeof options.body === "string") headers.set("content-type", "application/json");
  const response = await fetch(path, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "処理に失敗しました。");
    error.code = data.code;
    throw error;
  }
  return data;
}

function randomSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function loadIdentity() {
  try { return JSON.parse(localStorage.getItem(IDENTITY_KEY)); } catch { return null; }
}
function saveIdentity() { localStorage.setItem(IDENTITY_KEY, JSON.stringify(state.identity)); }
function updateAccount() { accountLabel.textContent = state.identity ? `@${state.identity.noteId}` : "参加する"; }
function closeOverlay() { overlay.hidden = true; overlay.innerHTML = ""; }

function setActiveNav(page) {
  document.querySelectorAll("[data-nav]").forEach((item) => item.classList.toggle("active", item.dataset.nav === page));
}

function showLoader() { app.innerHTML = `<div class="page-loader"><span></span><span></span><span></span></div>`; }
function setBusy(button, busy) { if (button) button.disabled = busy; }
function rarityLabel(value) { return { normal: "NORMAL", rare: "RARE ✦", secret: "SECRET ✦✦" }[value] || "NORMAL"; }
function shopStatusLabel(value) { return { draft: "準備中", pending: "旧申請", published: "公開中", suspended: "停止中" }[value] || value; }
function errorState(message) { return `<div class="empty-state"><div><span class="empty-icon">!</span>${escapeHtml(message)}</div></div>`; }

let toastTimer;
function notify(message, isError = false) {
  toast.textContent = message;
  toast.style.borderColor = isError ? "rgba(255,113,134,.35)" : "";
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

async function copyText(value, message) {
  await navigator.clipboard.writeText(value);
  notify(message);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}
function escapeAttr(value) { return escapeHtml(value); }
