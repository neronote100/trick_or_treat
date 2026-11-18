'use strict';
const byId = id => document.getElementById(id);
const state = {articles: []};
function safeUrl(value) {
  try {const u = new URL(value); return u.protocol === 'https:' && u.hostname === 'note.com' && /\/n\/n[A-Za-z0-9]+/.test(u.pathname) ? u.href : null;}
  catch {return null;}
}
function safeImage(value) {
  try {const u = new URL(value); return u.protocol === 'https:' ? u.href : null;}
  catch {return null;}
}
function imgNode(article, fallbackClass) {
  const url = safeImage(article.thumbnail);
  if (!url) {const node = document.createElement('span'); node.className = fallbackClass; node.textContent = '✦'; return node;}
  const img = document.createElement('img'); img.src = url; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
  img.addEventListener('error', () => {const fallback = document.createElement('span'); fallback.className = fallbackClass; fallback.textContent = '✦'; img.replaceWith(fallback);});
  return img;
}
// 90 slots, scattered so early arrivals light up different branches. Deterministic positions keep existing work steady.
function slots() {
  const coords = [];
  for (let row=0; row<12; row++) {
    const count = row + 2, y = 21 + row*4.4, radius = 2.5 + row*2.75;
    for (let j=0; j<count; j++) {
      const x = 50 + ((j/(count-1)) * 2 - 1)*radius;
      coords.push({x, y: y + (j%2 ? .8 : -.8)});
    }
  }
  // 102 slots, relatively prime stride for a natural distribution on arrival.
  return coords.map((_, index) => coords[(index*43)%coords.length]);
}
const places = slots();
function addOrnament(article, index) {
  const href = safeUrl(article.url); if (!href) return;
  const pos = places[index % places.length];
  const link = document.createElement('a'); link.className = 'ornament' + (article.picked_by ? ' featured' : '');
  link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer';
  link.setAttribute('aria-label', `${article.title}（${article.author}）のnoteを開く`);
  link.title = `${article.title}｜${article.author}${article.picked_by ? '｜おすすめ：'+article.picked_by : ''}`;
  link.style.left = `${pos.x}%`; link.style.top = `${pos.y}%`; link.style.zIndex = index+1;
  link.style.animationDelay = `${Math.min(index*.04, 1.1)}s`;
  const image = safeImage(article.thumbnail); if (!image) link.classList.add('no-image');
  link.append(imgNode(article, 'fallback')); byId('ornaments').append(link);
}
function addCard(article) {
  const href = safeUrl(article.url); if (!href) return;
  const link = document.createElement('a'); link.className = 'work'; link.href = href;
  link.target = '_blank'; link.rel = 'noopener noreferrer';
  link.append(imgNode(article, 'fallback'));
  const content = document.createElement('div'); content.className = 'work-text';
  const heading = document.createElement('strong'); heading.textContent = article.title || '無題の作品'; content.append(heading);
  const author = document.createElement('small'); author.textContent = article.author || 'noteクリエイター'; content.append(author);
  if (article.picked_by) {const pick = document.createElement('span');pick.className='pick';pick.textContent=`✦ ${article.picked_by}さんの気になる作品`;content.append(pick);}
  link.append(content); byId('work-list').append(link);
}
function render(filter='') {
  const q = filter.trim().toLocaleLowerCase('ja');
  const filtered = state.articles.filter(x => (`${x.title} ${x.author} ${x.picked_by||''}`).toLocaleLowerCase('ja').includes(q));
  byId('work-list').replaceChildren(); filtered.forEach(addCard);
  byId('empty').hidden = Boolean(filtered.length);
  if (q && !filtered.length) byId('empty').textContent = '条件に合う作品が見つかりませんでした。';
  if (!q && !filtered.length) byId('empty').textContent = '最初の作品が届くのを楽しみにしています。あなたの物語から、ツリーが始まります。🌙';
  byId('works-count').textContent = `${filtered.length} 作品`;
}
async function init() {
  byId('filter').addEventListener('input', event => render(event.target.value));
  try {
    const response = await fetch('./data/ornaments.json', {cache:'no-store'});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    state.articles = (Array.isArray(data.articles)?data.articles:[]).filter(x=>safeUrl(x.url));
    byId('count').textContent = String(state.articles.length);
    state.articles.forEach(addOrnament);
    byId('tree-message').hidden = state.articles.length > 0;
    if (data.updated_at) byId('updated').textContent = `最終更新 ${new Date(data.updated_at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})}`;
    render();
  } catch(error) {
    byId('empty').textContent = '作品データを読み込めませんでした。時間をおいてお試しください。';
    byId('tree-message').textContent = '作品データの読み込みを確認中です';
    console.warn('Ornament data unavailable', error);
  }
}
init();
