const app = document.querySelector("#app");
const overlay = document.querySelector("#overlay");
const toast = document.querySelector("#toast");
const accountLabel = document.querySelector("#account-label");
const IDENTITY_KEY = "trick-or-treat.identity.v1";

const state = {
  identity: loadIdentity(),
  me: null,
  collection: null,
  adminParticipantPage: 1,
  adminParticipantQuery: "",
  webpCursor: "",
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
      if (error.code === "AUTH_INVALID" || error.code === "AUTH_REQUIRED") {
        logout(false);
      }
    }
  }
  if (!location.hash && !cleanShopPath()) location.hash = "#/collection";
  await renderRoute();
  const page = routeParts()[0] || "collection";
  // Visitors can enjoy the event banner first. Registration is required when collecting or opening a shop.
}

function cleanShopPath() {
  return location.pathname.match(/^\/shop\/([a-z0-9_]{3,32})\/?$/i);
}

function routeParts() {
  const hashParts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (hashParts.length) return hashParts;
  const shopMatch = cleanShopPath();
  if (shopMatch) return ["shop", shopMatch[1].toLowerCase()];
  return ["collection"];
}

async function renderRoute() {
  const parts = routeParts();
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
  if (!ensureOwner()) return;
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
        <p class="image-hint">キャラクター画像：横4:3推奨（例 1200×900px）・顔や文字は中央へ</p>
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
          <p class="image-hint">お菓子画像：正方形1:1推奨（例 1200×1200px）</p>
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
      <a class="admin-link" href="/#/admin">管理者はこちら</a>
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
      <a class="text-button" href="/#/collection">← 図鑑へ</a>
      <div class="shop-stage">
        <img class="shop-stage-image" src="${escapeAttr(shop.characterImageUrl)}" alt="${escapeAttr(shop.name)}">
        <div class="shop-stage-body">
          <p class="eyebrow">@${escapeHtml(shop.noteId)}</p>
          <h1>${escapeHtml(shop.name)}</h1>
          ${shop.description ? `<p class="subtle preserve-lines">${escapeHtml(shop.description)}</p>` : ""}
          <div class="mystery-row" aria-hidden="true">${Array.from({ length: 3 }, () => `<span class="mystery">?</span>`).join("")}</div>
          <button class="btn btn-primary draw-button" data-action="draw" data-note-id="${escapeAttr(shop.noteId)}">トリック・オア・トリート！</button>
        </div>
      </div>
    </section>`;
}

function rallyHero() {
  return `<div class="rally-hero">
    <img src="/halo-oka-rally-banner.webp" alt="ハロハロおかしラリー。ハロウィンの街を王子と仲間たちが駆け抜けるイラスト" width="1536" height="804" decoding="async" fetchpriority="high">
  </div>`;
}

function renderWelcome() {
  app.innerHTML = `<section class="page rally-welcome">
    ${rallyHero()}
    <div class="page-head"><div><p class="eyebrow">HALO HALO CANDY RALLY</p><h1>ハロハロおかしラリー</h1></div></div>
    <p class="quest-intro">ハロウィンの街のお菓子屋さんを巡って、お菓子図鑑を集めよう。10店舗の先にも、新しい世界が待っているよ！</p>
    <div class="panel rally-welcome-panel">
      <h2>🎃 お菓子ラリーに参加しよう！</h2>
      <p class="subtle">note IDを登録すると、お店巡りの記録や集めたお菓子が図鑑に残ります。</p>
      <button class="btn btn-primary" type="button" data-action="show-join">note IDではじめる</button>
      <p class="subtle">登録済みの人は同じnote IDで続きから参加できます。</p>
    </div>
  </section>`;
}

async function renderCollection() {
  if (!state.identity) return renderWelcome();
  showLoader();
  state.collection = await api("/api/collection");
  const data = state.collection;
  const stages = data.stages || [];
  const currentStage = stages.find((stage) => !stage.isCleared);
  const target = currentStage?.requiredShopCount || data.goal || 100;
  const displayedCount = Math.min(data.shopCount, target);
  const percent = Math.min(100, (displayedCount / target) * 100);
  const visibleStages = stages.filter((stage) => stage.isRevealed);
  const hasHiddenStages = stages.some((stage) => !stage.isRevealed);
  app.innerHTML = `
    <section class="page">
      ${rallyHero()}
      <div class="page-head"><div><p class="eyebrow">COLLECTION QUEST</p><h1>お菓子図鑑</h1></div></div>
      <p class="quest-intro">10店舗はゴールじゃない。扉の向こうに、まだ知らないハロウィンの世界が待っている。</p>
      <div class="progress-card">
        <div class="progress-ring" style="--progress:${percent}%"><strong>${displayedCount}/${target}</strong></div>
        <div class="progress-copy">
          <p class="progress-kicker">🍬 ${Math.min(data.shopCount, data.goal)} / ${data.goal} 店舗の冒険</p>
          <h2>${currentStage ? `次のゲートまであと ${target - data.shopCount} 店` : "全ステージ制覇！"}</h2>
          <p>${currentStage ? `次の世界：${escapeHtml(currentStage.name || "？？？")}` : "100店舗の冒険を達成！ おめでとうございます。"}</p>
        </div>
      </div>
      <p class="section-label">🗝️ ハロウィンのゲート</p>
      <div class="stage-trail">
        ${visibleStages.map(stageGateCard).join("")}
        ${hasHiddenStages ? `<div class="stage-gate stage-gate-mystery">
          <span class="stage-gate-symbol">✦</span>
          <div class="stage-gate-body"><p class="stage-gate-kicker">SECRET AREA</p><h3>？？？</h3><p>ゲートを突破すると、新たな世界が現れる……</p></div>
        </div>` : ""}
      </div>
      ${renderTriptych(data.triptych)}
      ${data.rewards.length ? `<p class="section-label">🎁 その他の特別報酬</p>${data.rewards.map(rewardCard).join("")}` : ""}
      <p class="section-label">訪れたお店 ${data.shops.length}</p>
      ${data.shops.length ? `<div class="shop-grid">${data.shops.map(visitedShopCard).join("")}</div>` : `
        <div class="empty-state compact"><div><span class="empty-icon">☾</span>お店のURLが届いたら訪ねてみよう</div></div>`}
      <p class="section-label">見つけたお菓子 ${data.items.length}</p>
      ${data.items.length ? `<div class="collection-grid">${data.items.map(collectionCard).join("")}</div>` : `
        <div class="empty-state"><div><span class="empty-icon">◇</span>まだ見つけていません</div></div>`}
    </section>`;
}

function triptychPanelCard(panel) {
  const labels = { left: "左", center: "中央", right: "右" };
  const slot = labels[panel.position] || "謎";
  return `<div class="triptych-panel ${panel.isUnlocked ? "unlocked" : "locked"}">
    <div class="triptych-panel-image">
      ${panel.isUnlocked && panel.imageUrl
        ? `<img src="${escapeAttr(panel.imageUrl)}" alt="${slot}のイラストの欠片">`
        : `<span class="triptych-lock" aria-label="${panel.isUnlocked ? "画像準備中" : "未解放"}">${panel.isUnlocked ? "✦" : "🔒"}</span>`}
    </div>
    <div class="triptych-panel-caption"><strong>${panel.requiredShopCount}店舗</strong><span>${slot}の欠片</span></div>
  </div>`;
}

function renderTriptych(triptych) {
  if (!triptych?.panels) return "";
  const completed = triptych.isComplete && triptych.fullImageUrl;
  return `<section class="triptych-quest" aria-label="三つの欠片の秘密イラスト">
    <div class="triptych-header">
      <p class="eyebrow">THREE SECRET PIECES</p>
      <h2>三つの欠片を集めよう</h2>
      <p>10店舗で左、20店舗で右、最後の30店舗で中央が解放！</p>
    </div>
    <div class="triptych-panel-grid">
      ${triptych.panels.map(triptychPanelCard).join("")}
    </div>
    <div class="triptych-final ${completed ? "triptych-final-complete" : ""}">
      ${completed
        ? `<img src="${escapeAttr(triptych.fullImageUrl)}" alt="${escapeAttr(triptych.name)}">`
        : `<div class="triptych-final-placeholder"><span>${triptych.isComplete ? "✧" : "🔒"}</span><strong>${triptych.isComplete ? "完成イラストを準備中" : "完成イラストはまだ秘密"}</strong><small>${triptych.isComplete ? "王子がイラストを登録するとここに現れます。" : "30店舗で3つの欠片がそろうと、特別な3:1イラストが現れる！"}</small></div>`}
      ${completed ? `<div class="triptych-final-caption">✦ 完成！ ${escapeHtml(triptych.name)} ✦</div>` : ""}
    </div>
  </section>`;
}

function stageGateCard(stage) {
  const status = stage.isCleared ? "突破！" : "挑戦中";
  return `<div class="stage-gate ${stage.isCleared ? "stage-gate-cleared" : "stage-gate-current"} ${stage.isSecret ? "stage-gate-secret" : ""}">
    <span class="stage-gate-symbol">${stage.isCleared ? "✦" : "♜"}</span>
    <div class="stage-gate-body">
      <p class="stage-gate-kicker">${stage.isSecret ? "SECRET STAGE" : "HALLOWEEN GATE"} · ${stage.requiredShopCount}店舗</p>
      <h3>${escapeHtml(stage.name)} <span class="stage-gate-state">${status}</span></h3>
      <p>${escapeHtml(stage.description)}</p>
    </div>
  </div>`;
}

function visitedShopCard(shop) {
  return `<a class="shop-card" href="/shop/${encodeURIComponent(shop.noteId)}">
    ${shop.characterImageUrl ? `<img class="card-image" src="${escapeAttr(shop.characterImageUrl)}" alt="${escapeAttr(shop.name)}">` : `<div class="card-image"></div>`}
    ${shop.isComplete ? `<span class="shop-complete-badge" aria-label="このお店のお菓子をコンプリート">✦ コンプリート！</span>` : ""}
    <div class="card-body">
      <h3>${escapeHtml(shop.name)}</h3>
      <p class="card-meta"><span>@${escapeHtml(shop.noteId)}</span><b class="candy-count">${shop.collectedCount} 🍬</b></p>
    </div>
  </a>`;
}

function collectionCard(item) {
  return `<a class="collection-card" href="/shop/${encodeURIComponent(item.noteId)}">
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
        <label class="field"><span>王子専用パスワード</span><input name="token" type="password" required autocomplete="current-password"></label>
        <button class="btn btn-primary" type="submit">確認する</button>
      </form>
    </section>`;
}

function participantCard(person) {
  const shopStatus = person.shopStatus
    ? (person.shopStatus === "published" ? "出店中" : shopStatusLabel(person.shopStatus))
    : "未出店";
  return `<div class="participant-card">
    <div class="participant-card-head">
      <div class="participant-person">
        <a href="https://note.com/${encodeURIComponent(person.noteId)}" target="_blank" rel="noopener noreferrer">@${escapeHtml(person.noteId)} ↗</a>
        <small>登録日：${escapeHtml((person.registeredAt || "").slice(0, 10))}</small>
        <small>${escapeHtml(shopStatus)}${person.shopName ? ` · ${escapeHtml(person.shopName)}` : ""}</small>
      </div>
      <span class="participant-stage">${person.shopCount >= 100 ? "100店舗達成" : person.shopCount >= 75 ? "75店舗達成" : person.shopCount >= 50 ? "50店舗達成" : person.shopCount >= 30 ? "30店舗達成" : person.shopCount >= 20 ? "20店舗達成" : person.shopCount >= 10 ? "10店舗達成" : person.shopCount ? "ラリー中" : "これから"}</span>
    </div>
    <div class="participant-metrics">
      <div><strong>${person.shopCount.toLocaleString("ja-JP")}</strong><span>訪問店舗</span></div>
      <div><strong>${person.treatTypes.toLocaleString("ja-JP")}</strong><span>お菓子の種類</span></div>
      <div><strong>${person.obtainedTotal.toLocaleString("ja-JP")}</strong><span>取得回数</span></div>
    </div>
  </div>`;
}

function renderAdminParticipants(data, token) {
  const first = data.matchingCount ? (data.page - 1) * data.pageSize + 1 : 0;
  const last = data.matchingCount ? first + data.participants.length - 1 : 0;
  return `<section class="panel admin-participants" id="admin-participants">
    <h2>🍬 参加者・お菓子収集状況</h2>
    <p class="subtle">登録されたnote IDの一覧です。未出店・未収集の人も含みます。</p>
    <div class="participant-summary">
      <div><strong>${data.totals.registered.toLocaleString("ja-JP")}</strong><span>登録ID数</span></div>
      <div><strong>${data.totals.collectors.toLocaleString("ja-JP")}</strong><span>収集開始ID数</span></div>
    </div>
    <form class="participant-search" data-form="participant-search" data-token="${escapeAttr(token)}">
      <label class="field"><span>note IDで検索</span><input type="search" name="query" maxlength="33" value="${escapeAttr(data.query)}" placeholder="例：nero_notelover" autocomplete="off"></label>
      <button class="btn btn-secondary" type="submit">検索</button>
    </form>
    <p class="participant-result-count">${data.matchingCount.toLocaleString("ja-JP")} ID中 ${first}〜${last} 件を表示 ・ 訪問店舗数が多い順</p>
    ${data.participants.length
      ? `<div class="participant-list">${data.participants.map(participantCard).join("")}</div>`
      : `<div class="participant-empty">該当するnote IDはありません。</div>`}
    <div class="participant-pagination">
      <button class="btn btn-secondary" type="button" data-action="participant-page" data-token="${escapeAttr(token)}" data-page="${data.page - 1}" ${data.page <= 1 ? "disabled" : ""}>← 前へ</button>
      <span>${data.page} / ${data.totalPages} ページ</span>
      <button class="btn btn-secondary" type="button" data-action="participant-page" data-token="${escapeAttr(token)}" data-page="${data.page + 1}" ${data.page >= data.totalPages ? "disabled" : ""}>次へ →</button>
    </div>
    <p class="subtle participant-note">数値は現在の図鑑に残る記録の集計です。お店やお菓子が削除された場合は減少します。note IDの本人確認は行っていません。</p>
  </section>`;
}

async function showAdmin(token, page = state.adminParticipantPage, query = state.adminParticipantQuery) {
  const requestedQuery = String(query || "").trim().replace(/^@/, "").toLowerCase();
  const [data, participants, migration] = await Promise.all([
    api("/api/admin/shops", { adminToken: token, auth: false }),
    api(`/api/admin/participants?page=${encodeURIComponent(page)}&q=${encodeURIComponent(requestedQuery)}`, { adminToken: token, auth: false }),
    api("/api/admin/image-migration", { adminToken: token, auth: false }),
  ]);
  state.adminParticipantPage = participants.page;
  state.adminParticipantQuery = participants.query;
  const gates = [
    [10, "最初の城門"], [20, "魔女の森"], [30, "月影の古城"],
    [50, "秘密の魔法街"], [75, "幻の月夜宮殿"], [100, "王子の秘密宝物庫"],
  ];
  app.innerHTML = `
    <section class="page">
      <div class="page-head"><div><p class="eyebrow">OWNER</p><h1>管理</h1></div><span class="status">${data.shops.length} 店</span></div>
      ${renderAdminParticipants(participants, token)}
      <section class="panel admin-inventory" aria-label="管理者専用お菓子登録数">
        <h2>🍬 登録済みのお菓子</h2>
        <p class="subtle">全店舗・全公開状態の登録数です。参加者向け画面には表示されません。</p>
        <div class="inventory-metrics">
          <div><strong>${data.candyInventory.registered.toLocaleString("ja-JP")}</strong><span>登録総数</span></div>
          <div><strong>${data.candyInventory.active.toLocaleString("ja-JP")}</strong><span>有効なお菓子</span></div>
          <div><strong>${data.candyInventory.largestShopCount.toLocaleString("ja-JP")}</strong><span>1店舗の最多</span></div>
        </div>
        <p class="subtle">登録のある店舗：${data.candyInventory.shopsWithCandy.toLocaleString("ja-JP")}店。各店舗の登録数は下の「みんなのお店」で確認できます。</p>
      </section>
      <section class="panel webp-admin-panel" id="webp-migration">
        <p class="eyebrow">STORAGE OPTIMIZATION</p>
        <h2>🖼️ 既存画像のWebP軽量化</h2>
        <p class="subtle">PNG・JPEGの登録済み画像をWebPに変換して置き換えます。お菓子、店舗キャラクター、特別報酬が対象。GIF・既存WebPはそのままです。</p>
        <p class="subtle">図鑑の記録と画像の関連付けは維持します。処理できた画像だけ新しいキーに切り替え、元画像はその後で削除します。</p>
        <p class="webp-pending-count">WebP化の対象：<strong>${migration.pending.toLocaleString("ja-JP")}枚</strong></p>
        <button class="btn btn-secondary" data-action="migrate-webp" data-token="${escapeAttr(token)}" type="button" ${migration.pending ? "" : "disabled"}>既存画像を20枚まで軽量化する</button>
        <p class="subtle" id="webp-migration-status" role="status">無料枠への負担を抑えるため、1回20枚まで・順番に処理します。元画像より大きくなる場合は変換しません。</p>
        <div class="webp-backups">
          <h3>元画像のバックアップ</h3>
          <p class="subtle">一時保存中：${migration.backups.retained}枚（${(migration.backups.retainedBytes / 1024 / 1024).toFixed(1)}MB）。元画像は変換後24時間以上保持し、手動で整理するまで削除しません。</p>
          ${migration.backups.recent.map((backup) => `<div class="webp-backup-item">
            <span><strong>${escapeHtml(backup.sourceKey)}</strong><small>${escapeHtml(backup.migratedAt)} · ${(backup.beforeBytes / 1024 / 1024).toFixed(2)}MB → ${(backup.afterBytes / 1024 / 1024).toFixed(2)}MB</small></span>
            <button class="btn btn-secondary" data-action="restore-webp" data-token="${escapeAttr(token)}" data-source-key="${escapeAttr(backup.sourceKey)}" type="button">元に戻す</button>
          </div>`).join("")}
          <button class="btn btn-secondary" data-action="cleanup-webp" data-token="${escapeAttr(token)}" type="button" ${migration.backups.readyToCleanup ? "" : "disabled"}>24時間以上経過したバックアップを1枚整理</button>
          <p class="subtle">整理可能：${migration.backups.readyToCleanup}枚。先にWebP画像が保存されていることと、元画像が使用されていないことを確認します。</p>
        </div>
      </section>
      <div class="panel triptych-admin-panel">
        <p class="eyebrow">3-PANEL SECRET ART</p>
        <h2>🖼️ 3枚合体イラスト（3:1）</h2>
        <p class="subtle">横長の完成画像を1枚登録するだけ。サイトが自動で正方形3枚へ分割します。10店舗で左・20店舗で右・30店舗で中央と全体を解放。</p>
        ${data.triptychArtwork ? `<p class="triptych-admin-status">✦ 登録済み：${escapeHtml(data.triptychArtwork.name)}</p>
          <div class="triptych-admin-composite"><img src="${escapeAttr(data.triptychArtwork.fullImageUrl)}" alt="現在の完成イラスト"></div>
          <p class="subtle">現在の自動分割プレビュー（左・中央・右）</p>
          <div class="triptych-admin-slices">
            <img src="${escapeAttr(data.triptychArtwork.leftImageUrl)}" alt="左の欠片">
            <img src="${escapeAttr(data.triptychArtwork.centerImageUrl)}" alt="中央の欠片">
            <img src="${escapeAttr(data.triptychArtwork.rightImageUrl)}" alt="右の欠片">
          </div>` : `<p class="triptych-admin-status">未登録：完成イラストを追加してください。</p>`}
        <form data-form="triptych" data-token="${escapeAttr(token)}">
          <label class="field"><span>イラスト名</span><input name="name" maxlength="50" placeholder="王子のハロウィン・シークレット"></label>
          <label class="field"><span>完成画像（必須：横3:縦1、5MB以下）</span><input name="image" type="file" required accept="image/png,image/jpeg,image/webp,image/gif"></label>
          <button class="btn btn-primary" type="submit">${data.triptychArtwork ? "完成イラストを差し替える" : "3:1画像を登録して3分割する"}</button>
        </form>
        <p class="subtle">登録・差し替えすると、下の10店舗＝左・20店舗＝右・30店舗＝中央の報酬枠へ自動同期します。すでに登録済みの画像もこの管理画面を開くだけで同期されます。</p>
      </div>
      <div class="panel">
        <h2>🎁 ゲート別・特別報酬</h2>
        <p class="subtle">10・20・30店舗の報酬枠は3枚合体イラストから自動同期されます。50・75・100店舗の画像はここで個別に登録できます。</p>
        <div class="reward-slot-grid">${gates.map(([count, name]) => {
          const reward = (data.rewardSlots || []).find((entry) => entry.requiredShopCount === count);
          return `<div class="reward-slot">
            ${reward ? `<img src="${escapeAttr(reward.imageUrl)}" alt="${escapeAttr(reward.name)}">` : `<span class="reward-slot-placeholder">🎁</span>`}
            <div><strong>${count}店舗 · ${escapeHtml(name)}</strong><small>${reward ? (count <= 30 && data.triptychArtwork ? "合体イラストから自動同期済み" : `登録済み：${escapeHtml(reward.name)}`) : "画像未登録"}</small></div>
          </div>`;
        }).join("")}</div>
      </div>
      <form class="panel" data-form="reward" data-token="${escapeAttr(token)}">
        <h2>特別報酬を登録・差し替え</h2>
        <label class="field"><span>到達店舗数（報酬枠）</span>
          <select name="requiredShopCount" required>
            ${gates.filter(([count]) => !data.triptychArtwork || count > 30).map(([count, name]) => `<option value="${count}">${count}店舗：${escapeHtml(name)}</option>`).join("")}
          </select>
        </label>
        <label class="field"><span>特別報酬の名前（省略するとステージ名）</span><input name="name" maxlength="50" placeholder="秘密のハロウィンカード"></label>
        <label class="field"><span>画像（正方形1:1推奨・例 1200×1200px）</span><input name="image" type="file" required accept="image/png,image/jpeg,image/webp,image/gif"></label>
        <p class="subtle">3:1合体画像の登録後、10・20・30店舗の個別画像は編集できません。50・75・100店舗は引き続き差し替え可能です。</p>
        <button class="btn btn-secondary" type="submit">この枠に登録する</button>
      </form>
      <p class="section-label">みんなのお店 ${data.shops.length}</p>
      ${data.shops.length ? data.shops.map((shop) => `<div class="panel">
        <div class="panel-head"><div><h2>${escapeHtml(shop.name)}</h2><p class="subtle">@${escapeHtml(shop.noteId)} ・ ${shop.treatCount} 🍬</p><span class="status ${escapeAttr(shop.status)}">${shopStatusLabel(shop.status)}</span></div>${shop.characterImageUrl ? `<img src="${escapeAttr(shop.characterImageUrl)}" alt="" style="width:64px;height:64px;border-radius:14px;object-fit:cover">` : ""}</div>
        <p class="subtle preserve-lines">${escapeHtml(shop.description || "")}</p>
        <div class="button-row">
          ${shop.status === "published" ? `<a class="btn btn-secondary" href="/shop/${encodeURIComponent(shop.noteId)}">お店を見る</a><button class="btn btn-secondary" data-action="suspend-shop" data-id="${escapeAttr(shop.id)}" data-token="${escapeAttr(token)}">公開停止</button>` : ""}
          ${["pending", "suspended"].includes(shop.status) ? `<button class="btn btn-primary" data-action="publish-shop" data-id="${escapeAttr(shop.id)}" data-token="${escapeAttr(token)}">再公開する</button>` : ""}
          <button class="btn btn-danger" data-action="delete-shop" data-id="${escapeAttr(shop.id)}" data-name="${escapeAttr(shop.name)}" data-token="${escapeAttr(token)}">削除する</button>
        </div>
      </div>`).join("") : `<div class="empty-state">お店はまだありません</div>`}
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
    if (kind === "shop") {
      const body = new FormData(form);
      await optimizeImageField(body, "characterImage", 1600);
      state.me = await api("/api/me/shop", { method: "PUT", body });
      notify("保存しました");
      await renderStudio();
    }
    if (kind === "treat") {
      const body = new FormData(form);
      await optimizeImageField(body, "image", 1400);
      state.me = await api("/api/me/treats", { method: "POST", body });
      notify("お菓子を追加しました");
      await renderStudio();
    }
    if (kind === "admin-login") await showAdmin(new FormData(form).get("token"), 1, "");
    if (kind === "participant-search") await showAdmin(form.dataset.token, 1, new FormData(form).get("query"));
    if (kind === "reward") {
      const body = new FormData(form);
      await optimizeImageField(body, "image", 1600);
      await api("/api/admin/reward", { method: "POST", body, adminToken: form.dataset.token, auth: false });
      notify("特別画像を登録しました");
      await showAdmin(form.dataset.token);
    }
    if (kind === "triptych") {
      const body = await prepareTriptychUpload(form);
      await api("/api/admin/triptych", { method: "POST", body, adminToken: form.dataset.token, auth: false });
      notify("合体イラストと3枚の欠片を登録しました！");
      await showAdmin(form.dataset.token);
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
  if (action === "show-join") return openJoin();
  if (action === "logout") return logout();
  if (action === "share") return copyText(new URL(button.dataset.path, location.origin).href, "URLをコピーしました");

  const adminAction = ["publish-shop", "suspend-shop", "delete-shop", "participant-page", "migrate-webp", "restore-webp", "cleanup-webp"].includes(action);
  if (!adminAction && !ensureAuth()) return;
  setBusy(button, true);
  try {
    if (action === "migrate-webp") await runImageMigration(button.dataset.token);
    if (action === "restore-webp") {
      if (!confirm("この画像を元のPNG/JPEGへ戻しますか？")) return;
      await api("/api/admin/image-migration/restore", {
        method: "POST", body: JSON.stringify({ sourceKey: button.dataset.sourceKey }),
        headers: { "content-type": "application/json" },
        adminToken: button.dataset.token, auth: false,
      });
      notify("元画像へ戻しました");
      await showAdmin(button.dataset.token);
    }
    if (action === "cleanup-webp") {
      if (!confirm("24時間以上経過し、WebPが正常に表示されるバックアップを1枚削除します。よろしいですか？")) return;
      const result = await api("/api/admin/image-migration/cleanup", {
        method: "POST", adminToken: button.dataset.token, auth: false,
      });
      notify(result.cleaned ? "古い画像を1枚整理しました" : "整理対象がありません");
      await showAdmin(button.dataset.token);
    }
    if (action === "participant-page") {
      await showAdmin(button.dataset.token, Number(button.dataset.page), state.adminParticipantQuery);
      document.querySelector("#admin-participants")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
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
      if (!confirm("このお店を公開停止しますか？\n再公開するまで利用できなくなります。")) return;
      await api(`/api/admin/shops/${encodeURIComponent(button.dataset.id)}/suspend`, { method: "POST", adminToken: button.dataset.token, auth: false });
      notify("公開を停止しました");
      await showAdmin(button.dataset.token);
    }
    if (action === "delete-shop") {
      const shopName = button.dataset.name || "このお店";
      if (!confirm(`${shopName}を削除しますか？\n\nお店・登録したお菓子・画像は削除されます。\n同じnote IDで新しく一からお店を作れます。\nこの操作は元に戻せません。`)) return;
      await api(`/api/admin/shops/${encodeURIComponent(button.dataset.id)}`, { method: "DELETE", adminToken: button.dataset.token, auth: false });
      notify("お店を削除しました");
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
  const result = await api("/api/users", {
    method: "POST",
    body: JSON.stringify({ noteId }),
    auth: false,
  });
  state.identity = { noteId: result.noteId };
  saveIdentity();
  state.me = await api("/api/me");
  updateAccount();
  closeOverlay();
  await renderRoute();
}

async function prepareTriptychUpload(form) {
  const body = new FormData(form);
  const image = body.get("image");
  if (!image || !image.size) throw new Error("3:1画像を選んでください。");
  if (image.size > 5 * 1024 * 1024) throw new Error("画像は5MB以下にしてください。");
  let bitmap;
  try {
    bitmap = await createImageBitmap(image);
  } catch {
    throw new Error("画像を読み込めませんでした。PNG・JPEG・WebP形式などで保存し直してください。");
  }
  try {
    const ratio = bitmap.width / bitmap.height;
    if (!Number.isFinite(ratio) || Math.abs(ratio - 3) > 0.15) {
      throw new Error("完成画像は横3:縦1の比率で作ってください。（例：3600×1200px）");
    }
    const sliceSize = Math.max(1, Math.min(1200, Math.floor(bitmap.width / 3), bitmap.height));
    const widthPerPanel = bitmap.width / 3;
    const panels = [["left", 0], ["center", 1], ["right", 2]];
    for (const [position, index] of panels) {
      const canvas = document.createElement("canvas");
      canvas.width = sliceSize;
      canvas.height = sliceSize;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("画像を分割できませんでした。");
      context.drawImage(bitmap, widthPerPanel * index, 0, widthPerPanel, bitmap.height, 0, 0, sliceSize, sliceSize);
      const blob = await new Promise((resolve, reject) =>
        canvas.toBlob((value) => value ? resolve(value) : reject(new Error("画像の分割に失敗しました。")), "image/webp", 0.9),
      );
      const field = position + "Image";
      body.set(field, new File([blob], position + (blob.type === "image/webp" ? ".webp" : ".png"), { type: blob.type || "image/png" }));
    }
    await optimizeImageField(body, "image", 3000);
    return body;
  } finally {
    bitmap.close?.();
  }
}

// Canvas conversion runs before upload, keeping Cloudflare transform charges at
// zero and retaining transparent pixels. Animated GIFs are left unchanged.
async function optimizedWebpFile(file, maxDimension = 1400, quality = 0.82) {
  if (!file || !file.size || file.type === "image/gif" || file.type === "image/webp") return file;
  if (!["image/png", "image/jpeg"].includes(file.type)) return file;
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvasが利用できません。");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve, reject) =>
      canvas.toBlob((result) => result ? resolve(result) : reject(new Error("変換に失敗しました。")), "image/webp", quality),
    );
    if (blob.type !== "image/webp" || blob.size >= file.size) return file;
    const fileName = (file.name || "image").replace(/\.[^.]+$/, "") + ".webp";
    return new File([blob], fileName, { type: "image/webp" });
  } finally {
    bitmap?.close?.();
  }
}

async function optimizeImageField(body, field, maxDimension) {
  const original = body.get(field);
  if (!original || !original.size) return;
  const output = await optimizedWebpFile(original, maxDimension);
  if (output !== original) body.set(field, output);
}

async function runImageMigration(token) {
  const status = document.querySelector("#webp-migration-status");
  const progress = (message) => { if (status) status.textContent = message; };
  let converted = 0, skipped = 0, attempted = 0, saved = 0, after = state.webpCursor;
  progress("変換対象の画像を確認しています…");
  while (attempted < 20) {
    const next = await api(`/api/admin/image-migration?after=${encodeURIComponent(after)}`, {
      adminToken: token, auth: false,
    });
    if (!next.images?.length) {
      state.webpCursor = "";
      if (!attempted) progress(next.pending ? "一巡しました。圧縮できない画像が残っています。" : "すべての対象画像を確認済みです。");
      break;
    }
    for (const image of next.images) {
      if (attempted >= 20) break;
      after = image.key;
      state.webpCursor = after;
      attempted++;
      progress(`${attempted}/20枚を確認中：${converted}枚変換、${skipped}枚スキップ`);
      try {
        const res = await fetch(image.imageUrl, { cache: "no-store" });
        if (!res.ok) throw new Error("元画像を読み込めませんでした");
        const source = await res.blob();
        const file = new File([source], "original" + (image.key.split(".").pop() === "png" ? ".png" : ".jpg"), { type: source.type });
        const maxDimension = image.key.startsWith("triptych/") ? 3000 : image.key.startsWith("characters/") ? 1600 : 1400;
        const optimized = await optimizedWebpFile(file, maxDimension);
        if (optimized.type !== "image/webp") { skipped++; continue; }
        const body = new FormData();
        body.set("sourceKey", image.key);
        body.set("image", optimized);
        const result = await api("/api/admin/image-migration", {
          method: "POST", body, adminToken: token, auth: false,
        });
        converted++;
        saved += result.savedBytes;
      } catch (error) {
        skipped++;
        progress(`${attempted}/20枚：${escapeMigrationStatus(error.message)}（処理を続行します）`);
      }
    }
    if (next.images.length < 20) { state.webpCursor = ""; break; }
  }
  const savedMB = (saved / 1024 / 1024).toFixed(2);
  progress(`今回：${converted}枚をWebP化、${skipped}枚スキップ／失敗。軽量化分 ${savedMB}MB。元画像はバックアップとして保持中で、実際の保存容量の削減は整理後です。`);
  // We intentionally keep the page and results visible rather than refreshing
  // or claiming that images have been migrated without an admin-initiated run.
}

function escapeMigrationStatus(message) {
  return String(message || "変換をスキップしました").slice(0, 90);
}

async function draw(noteId) {
  const result = await api(`/api/shops/${encodeURIComponent(noteId)}/draw`, { method: "POST" });
  const clearedStages = result.clearedStages || [];
  const unlocked = result.unlocked || [];
  overlay.hidden = false;
  overlay.innerHTML = `<div class="dialog">
    <p class="sparkle">${result.isNew ? "✦ NEW COLLECTION ✦" : "WELCOME BACK"}</p>
    <img class="result-image" src="${escapeAttr(result.treat.imageUrl)}" alt="${escapeAttr(result.treat.name)}">
    <h2 class="result-title">${escapeHtml(result.treat.name)}</h2>
    <p class="result-meta">${rarityLabel(result.treat.rarity)} ・ ${escapeHtml(result.shop.name)} ${result.obtainedCount > 1 ? `・ ×${result.obtainedCount}` : ""}</p>
    ${clearedStages.map((stage) => `<div class="gate-celebration"><strong>🗝️ ${stage.requiredShopCount === 100 ? "全ステージ制覇！" : "新しい世界が開いた！"}</strong><span>${stage.requiredShopCount}店舗達成 · ${escapeHtml(stage.name)}</span><p>${escapeHtml(stage.description)}</p></div>`).join("")}
    ${(result.triptych?.panels || []).filter((panel) => clearedStages.some((stage) => stage.requiredShopCount === panel.requiredShopCount) && panel.imageUrl).map((panel) =>
      `<div class="triptych-draw-piece"><p class="sparkle">✦ イラストの欠片を発見！ ✦</p><img src="${escapeAttr(panel.imageUrl)}" alt="新たに解放されたイラストの欠片"></div>`).join("")}
    ${result.triptych?.isComplete && clearedStages.some((stage) => stage.requiredShopCount === 30) && result.triptych.fullImageUrl
      ? `<div class="triptych-draw-complete"><p>🎉 三つの欠片がそろった！</p><img src="${escapeAttr(result.triptych.fullImageUrl)}" alt="${escapeAttr(result.triptych.name)}"></div>` : ""}
    ${unlocked.map((reward) => `<div class="reward-card"><img src="${escapeAttr(reward.imageUrl)}" alt="${escapeAttr(reward.name)}"><div class="reward-label">${reward.requiredShopCount}店舗達成 ✦ ${escapeHtml(reward.name)}</div></div>`).join("")}
    <div class="dialog-actions"><button class="btn btn-secondary" data-action="close-overlay">閉じる</button><a class="btn btn-primary" href="/#/collection" data-action="close-overlay">図鑑を見る</a></div>
  </div>`;
}

function openJoin() {
  overlay.hidden = false;
  overlay.innerHTML = `<div class="dialog">
    <p class="eyebrow">JOIN</p><h2>note IDではじめる</h2>
    <form data-form="join">
      <label class="field"><span>note ID</span><input name="noteId" required minlength="3" maxlength="32" pattern="[A-Za-z0-9_]+" autocomplete="username" placeholder="noteID"></label>
      <button class="btn btn-primary" type="submit">このIDではじめる</button>
    </form>
    ${state.identity ? `<div class="dialog-actions"><button class="text-button" data-action="close-overlay">閉じる</button></div>` : ""}
  </div>`;
}

function openAccount() {
  if (!state.identity) return openJoin();
  overlay.hidden = false;
  overlay.innerHTML = `<div class="dialog">
    <p class="eyebrow">ACCOUNT</p><h2>@${escapeHtml(state.identity.noteId)}</h2>
    <p class="subtle">このnote IDで参加中です。別のブラウザでも同じIDを入力すれば利用できます。</p>
    <div class="dialog-actions"><button class="btn btn-secondary" data-action="close-overlay">閉じる</button><button class="btn btn-danger" data-action="logout">この端末から解除</button></div>
  </div>`;
}

function ensureAuth() {
  if (state.identity) return true;
  openJoin();
  return false;
}

function ensureOwner() {
  return ensureAuth();
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
