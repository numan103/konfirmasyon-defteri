import { parseWatchlist, marketSource } from './terminal-model.mjs?v=4';

const page = document.getElementById('page-trading');
const KEY = 'alfa-watchlist';
const SEED_KEY = 'alfa-watchlist-tv-seed-v1';
const DRAW_KEY = 'alfa-terminal-drawings-v1';
const FAV_KEY = 'alfa-watchlist-favs';
const SIDE_KEY = 'alfa-terminal-side';
const SAFE_DEFAULT = 'BINANCE:BTCUSDT';
// TV'ye özel (gömülü widget'ta açılmayan) semboller.
const tvOnly = symbol => symbol.endsWith('!') || symbol.startsWith('FX_IDC:');
// Kullanıcının TradingView izleme listesi (assets/watchlist-84359879.txt).
const TV_LIST = 'CME:BTC1!,OKX:USDTTRY,CBOE:VIX,FX_IDC:XAUTRYG,OKX:XAUTUSDT,BIST:XU100,CRYPTOCAP:TOTAL,CRYPTOCAP:TOTAL2,CRYPTOCAP:TOTAL3,CRYPTOCAP:BTC.D,BINANCE:ETHBTC,CRYPTOCAP:USDT.D,BINANCE:BTCUSDT.P,BINANCE:ETHUSDT,BINANCE:BTCUSDT,OKX:ETHUSDT.P,TVC:GOLD,BYBIT:BTCUSDT.P,BYBIT:ETHUSDT.P,FX:XAUUSD,FPMARKETS:US100,OKX:SOLUSDT,OKX:PEPEUSDT.P,OKX:BNBUSDT.P,OKX:DOGEUSDT,OKX:HBARUSDT.P,OKX:AVAXUSDT.P,OKX:LTCUSDT.P,OKX:XRPUSDT.P,OKX:XLMUSDT.P,OKX:SUIUSDT.P,OKX:ADAUSDT.P,OKX:UNIUSDT.P,OKX:BCHUSDT.P,OKX:DOTUSDT.P,OKX:LINKUSDT.P,OKX:TRXUSDT.P,OKX:NEARUSDT.P,OKX:WIFUSDT,OKX:INJUSDT,OKX:BONKUSDT,OKX:POPCATUSDT.P,OKX:AAVEUSDT.P,OKX:RENDERUSDT'.split(',');
const DEFAULT = [...TV_LIST];
let list = [], selected = SAFE_DEFAULT, interval = '60', poll, aborter;
let version = 0, active = false, userId = '', loadedUser = '';
let alerts = [], favs = [], sideOpen = true;
const node = (tag, text, cls) => {
  const n = document.createElement(tag);
  if (text != null) n.textContent = text;
  if (cls) n.className = cls;
  return n;
};
const button = (text, action, parent, cls) => {
  const b = node('button', text, cls); b.type = 'button'; b.addEventListener('click', action); parent.append(b); return b;
};
page.replaceChildren();
page.classList.add('terminal-screen');
const top = node('header', null, 'term-top');
button('← Site', () => showPage('home'), top);
const heading = button(selected + ' ⌕', () => { searchDialog.showModal(); searchInput.focus(); }, top, 'term-symbol');
heading.title = 'Parite ara';
const listButton = button('★ İzleme listesi', () => { renderList(); dialog.showModal(); }, top);
listButton.title = 'İzleme listesini aç, içe/dışa aktar';
const sideToggle = button('☰ Liste', () => setSide(!sideOpen), top, 'term-side-toggle');
sideToggle.title = 'Sağ izleme panelini aç/kapat';
sideToggle.setAttribute('aria-pressed', 'true');
const timeframe = node('select'); timeframe.setAttribute('aria-label', 'Zaman dilimi');
[['1', '1dk'], ['5', '5dk'], ['15', '15dk'], ['60', '1sa'], ['240', '4sa'], ['1440', '1G']].forEach(([value, text]) => {
  const o = node('option', text); o.value = value; timeframe.append(o);
});
timeframe.value = interval; top.append(timeframe);
timeframe.addEventListener('change', () => { interval = timeframe.value; openChart(); });
const body = node('div', null, 'term-body');
const canvas = node('div', null, 'term-chart');
const side = node('aside', null, 'term-side'); side.setAttribute('aria-label', 'İzleme listesi');
const sideHead = node('div', null, 'term-side-head');
sideHead.append(node('strong', 'İzleme listesi'));
button('＋ İçe aktar', () => { renderList(); dialog.showModal(); }, sideHead);
const sideClose = button('›', () => setSide(false), sideHead, 'term-side-close');
sideClose.setAttribute('aria-label', 'İzleme panelini kapat');
const sideSearch = node('input', null, 'term-side-search');
sideSearch.type = 'search'; sideSearch.placeholder = 'Sembol filtrele'; sideSearch.setAttribute('aria-label', 'İzleme listesinde filtrele');
const entries = node('div', null, 'term-entries');
side.append(sideHead, sideSearch, entries);
body.append(canvas, side);
sideSearch.addEventListener('input', () => renderList());
const status = node('footer', '', 'term-foot'); status.setAttribute('role', 'status');
const quick = node('div', null, 'term-quick');
const favQuick = button('☆', () => toggleFav(selected), quick, 'term-quick-btn');
favQuick.title = 'Favorilere ekle / çıkar'; favQuick.setAttribute('aria-label', 'Favorilere ekle veya çıkar');
const addQuick = button('＋', () => addCurrent(), quick, 'term-quick-btn');
addQuick.title = 'Grafikteki sembolü izleme listesine ekle'; addQuick.setAttribute('aria-label', 'İzleme listesine ekle');
const alarmQuick = button('⏰', () => alarmDialog.showModal(), quick, 'term-quick-btn');
alarmQuick.title = 'Fiyat uyarısı ekle'; alarmQuick.setAttribute('aria-label', 'Fiyat uyarısı ekle');
page.append(top, body, status, quick);

const dialog = node('dialog', null, 'term-dialog term-watchlist-dialog');
dialog.append(node('h2', 'İzleme listesi'));
const wlList = node('div', null, 'term-watchlist-list');
dialog.append(wlList);
const wlTools = node('div', null, 'term-wl-tools');
button('Dışa aktar', () => {
  const url = URL.createObjectURL(new Blob([list.join(',')], { type: 'text/plain' }));
  const a = node('a'); a.href = url; a.download = 'alfa-watchlist.txt'; a.click(); URL.revokeObjectURL(url);
}, wlTools);
button('Tümünü temizle', async () => {
  list = []; await persist(); renderList(); importMessage.textContent = 'Liste temizlendi.';
}, wlTools);
dialog.append(wlTools);
dialog.append(node('p', 'TradingView .txt dosyanı seç veya BORSA:SEMBOL listesini yapıştır. Spot ve vadeli ürünler ayrı tutulur.'));
const file = node('input'); file.type = 'file'; file.accept = '.txt,text/plain';
file.setAttribute('aria-label', 'TradingView watchlist dosyası');
const text = node('textarea'); text.placeholder = 'BINANCE:BTCUSDT,FX:EURUSD,TVC:GOLD'; text.setAttribute('aria-label', 'Sembol listesi');
const importMessage = node('p'); importMessage.setAttribute('role', 'status');
file.addEventListener('change', async () => {
  const f = file.files && file.files[0];
  if (!f) return;
  try { text.value = await f.text(); importMessage.textContent = `${f.name} okundu; aşağıdaki butonla aktar.`; }
  catch { importMessage.textContent = 'Dosya okunamadı.'; }
});
const sharedListButton = button('TradingView listemi getir (44)', async () => {
  try {
    const r = await fetch('/assets/watchlist-84359879.txt?v=2');
    if (!r.ok) throw new Error();
    text.value = await r.text();
    importMessage.textContent = 'Hazır TradingView listen yüklendi. “Listeyi değiştir” ile aynen aktar.';
  } catch { importMessage.textContent = 'Hazır liste alınamadı.'; }
}, dialog);
dialog.append(file, text, sharedListButton, importMessage);
function addParsed(parsed) {
  if (!parsed.symbols.length) { importMessage.textContent = 'Geçerli BORSA:SEMBOL bulunamadı. Dosya veya sembol listesi kullan.'; return false; }
  return true;
}
button('Listeye ekle', async () => {
  const parsed = parseWatchlist(text.value);
  if (!addParsed(parsed)) return;
  list = [...new Set([...list, ...parsed.symbols])].slice(0, 200);
  await persist(); renderList();
  importMessage.textContent = `${parsed.symbols.length} sembol eklendi.${parsed.rejected.length ? ' ' + parsed.rejected.length + ' satır aktarılmadı: ' + parsed.rejected.slice(0, 5).join(', ') : ''}${parsed.overflow ? ' En fazla 200 sembol tutulur.' : ''}`;
}, dialog);
button('Listeyi değiştir', async () => {
  const parsed = parseWatchlist(text.value);
  if (!addParsed(parsed)) return;
  list = [...new Set(parsed.symbols)].slice(0, 200);
  await persist(); renderList();
  importMessage.textContent = `Liste ${list.length} sembolle değiştirildi.`;
}, dialog);
button('Kapat', () => dialog.close(), dialog);
page.append(dialog);

const searchDialog = node('dialog', null, 'term-dialog');
searchDialog.append(node('h2', 'Parite ara'));
const searchInput = node('input'); searchInput.type = 'search'; searchInput.placeholder = 'BTC, ETH, EURUSD veya TVC:GOLD'; searchInput.setAttribute('aria-label', 'Parite ara');
searchInput.className = 'term-search-input';
const searchResults = node('div', null, 'term-search-results');
const searchStatus = node('p', 'Borsa, spot ve vadeli ayrımı korunur. Sembol seçince TradingView grafiği açılır.');
searchDialog.append(searchInput, searchResults, searchStatus);
button('Kapat', () => searchDialog.close(), searchDialog);
page.append(searchDialog);
const catalog = [...DEFAULT, 'FX:USDJPY', 'FX:AUDUSD', 'FX:USDCAD', 'FX:USDCHF', 'FX:NZDUSD', 'FX:XAUUSD', 'TVC:SILVER', 'TVC:DXY', 'CBOE:VIX', 'CRYPTOCAP:BTC.D', 'CRYPTOCAP:TOTAL'];
function chooseSymbol(symbol) { selected = symbol; renderList(); openChart(); searchDialog.close(); }
function paintSearch() {
  const q = searchInput.value.trim().toUpperCase(); searchResults.replaceChildren();
  const matches = [...new Set([...parseWatchlist(q).symbols, ...list, ...catalog])].filter(s => !q || s.includes(q)).slice(0, 60);
  matches.forEach(symbol => {
    const row = node('div', null, 'term-search-row');
    button(symbol, () => chooseSymbol(symbol), row);
    const add = button(list.includes(symbol) ? '✓' : '＋', async () => {
      if (list.length >= 200 && !list.includes(symbol)) { searchStatus.textContent = 'En fazla 200 sembol kaydedebilirsin.'; return; }
      list = [...new Set([...list, symbol])]; await persist(); renderList(); paintSearch();
    }, row);
    add.setAttribute('aria-label', symbol + ' listeye ekle'); searchResults.append(row);
  });
  if (!matches.length) searchResults.append(node('p', 'Eşleşme yok. Örnek: BINANCE:BTCUSDT veya FX:EURUSD.'));
}
searchInput.addEventListener('input', paintSearch);
heading.addEventListener('click', () => { paintSearch(); searchDialog.showModal(); searchInput.focus(); });

const alarmDialog = node('dialog', null, 'term-dialog');
alarmDialog.append(node('h2', 'Fiyat uyarısı'));
alarmDialog.append(node('p', 'Yalnızca bu terminal ve sekme açıkken, TradingView grafiğinin canlı fiyatıyla çalışır. Sunucu alarmı veya Telegram bildirimi değildir.'));
const alarmPrice = node('input'); alarmPrice.type = 'number'; alarmPrice.min = '0'; alarmPrice.step = 'any'; alarmPrice.className = 'term-search-input'; alarmPrice.setAttribute('aria-label', 'Alarm fiyatı');
alarmDialog.append(alarmPrice);
button('Uyarı ekle', () => {
  const price = Number(alarmPrice.value);
  if (!(price > 0)) { status.textContent = 'Geçerli bir fiyat gir.'; return; }
  alerts.push({ symbol: selected, price, triggered: false });
  alarmDialog.close();
  status.textContent = `${selected} · ${price} uyarısı eklendi; yalnızca sekme açıkken çalışır.`;
}, alarmDialog);
button('Kapat', () => alarmDialog.close(), alarmDialog);
page.append(alarmDialog);
const alertNotice = node('div', null, 'term-alert'); alertNotice.hidden = true; page.append(alertNotice);
function checkAlerts(price) {
  if (!Number.isFinite(price)) return;
  alerts.filter(a => a.symbol === selected && !a.triggered && (a.previous - a.price) * (price - a.price) <= 0).forEach(a => {
    a.triggered = true;
    alertNotice.replaceChildren(node('strong', `${selected} fiyat uyarısı: ${a.price} · Şu an ${price}`));
    button('Kapat', () => { alertNotice.hidden = true; }, alertNotice);
    alertNotice.hidden = false;
  });
  alerts.forEach(a => { if (a.symbol === selected) a.previous = price; });
}
const contextMenu = node('div', null, 'term-context'); contextMenu.hidden = true; contextMenu.setAttribute('role', 'menu'); page.append(contextMenu);
function showContext(x, y, price) {
  contextMenu.replaceChildren();
  const item = (title, fn) => button(title, () => { contextMenu.hidden = true; fn(); }, contextMenu);
  if (Number.isFinite(price)) item(`Alarm ekle · ${price.toFixed(4)}`, () => { alarmPrice.value = price; alarmDialog.showModal(); });
  item('Geri al', () => window.history.back());
  item('Canlıya dön', () => openChart());
  contextMenu.hidden = false;
  contextMenu.style.left = Math.max(0, Math.min(x, window.innerWidth - contextMenu.offsetWidth)) + 'px';
  contextMenu.style.top = Math.max(44, Math.min(y, window.innerHeight - contextMenu.offsetHeight - 25)) + 'px';
}
document.addEventListener('pointerdown', e => { if (!contextMenu.contains(e.target)) contextMenu.hidden = true; });

const drawKey = 'alfa-terminal-drawings-v1';
let drawingBook = {};
async function loadDrawings() {
  if (!AUTH.user || AUTH.user.id !== userId) return;
  try {
    const raw = await store.get(drawKey);
    const saved = JSON.parse(raw || '{}');
    drawingBook = {};
    Object.entries(saved).slice(0, 200).forEach(([key, values]) => {
      if (!/^[A-Z0-9_]{2,24}:[A-Z0-9_.!/-]{1,40}\|(1|5|15|60|240|1440)$/.test(key) || !Array.isArray(values)) return;
      drawingBook[key] = values.filter(d => Array.isArray(d.points) && d.points.length && d.points.every(p => Number.isFinite(p.time) && p.time > 0 && Number.isFinite(p.price) && p.price > 0)).slice(0, 50);
    });
  } catch { drawingBook = {}; }
}
async function saveDrawings() { if (!userId) return; await store.set(drawKey, JSON.stringify(drawingBook)); }
function currentDrawings() { return drawingBook[selected + '|' + interval] ||= []; }
function undoDrawing() { const d = currentDrawings(); if (!d.length) return; redoStack.push(d.pop()); saveDrawings(); status.textContent = 'Son çizim geri alındı.'; }
function redoDrawing() { if (!redoStack.length) return; currentDrawings().push(redoStack.pop()); saveDrawings(); status.textContent = 'Çizim ileri alındı.'; }
const redoStack = [];

async function persist() {
  if (!userId) return;
  await store.set(KEY, JSON.stringify(list));
  status.textContent = AUTH.user ? 'Liste hesabına kaydedildi; bulut eşitlemesi mevcut hesap sistemi üzerinden yapılır.' : 'Liste bu cihaza kaydedildi.';
}
function wlRow(symbol, inDialog) {
  const row = node('div', null, 'term-row' + (symbol === selected ? ' on' : ''));
  const star = button(favs.includes(symbol) ? '★' : '☆', () => toggleFav(symbol), row, 'term-action term-star');
  star.setAttribute('aria-label', symbol + ' favorilere ekle veya çıkar');
  star.setAttribute('aria-pressed', favs.includes(symbol) ? 'true' : 'false');
  const open = button('', () => { selected = symbol; renderList(); openChart(); if (inDialog) dialog.close(); }, row, 'term-pair');
  open.title = 'Grafiği aç';
  open.append(node('b', symbol.split(':')[1]), node('small',
    symbol.split(':')[0] + (marketSource(symbol).native ? ' · borsa' : '') + (tvOnly(symbol) ? ' · TV özel' : '')));
  const remove = button('×', async () => {
    list = list.filter(s => s !== symbol); await persist(); renderList();
  }, row, 'term-action');
  remove.setAttribute('aria-label', symbol + ' kaldır');
  return row;
}
function renderList() {
  const q = (sideSearch.value || '').trim().toUpperCase();
  const ordered = [...favs.filter(s => list.includes(s)), ...list.filter(s => !favs.includes(s))];
  const shown = ordered.filter(s => !q || s.toUpperCase().includes(q));
  entries.replaceChildren();
  if (!shown.length) entries.append(node('p', q ? 'Eşleşme yok.' : 'Liste boş.', 'term-empty'));
  shown.forEach(symbol => entries.append(wlRow(symbol, false)));
  wlList.replaceChildren();
  if (!list.length) wlList.append(node('p', 'Liste boş. Aşağıdan sembol ekle.'));
  list.forEach(symbol => wlList.append(wlRow(symbol, true)));
  listButton.textContent = '★ İzleme (' + list.length + ')';
  updateQuick();
}
function updateQuick() {
  const on = favs.includes(selected);
  favQuick.textContent = on ? '★' : '☆';
  favQuick.setAttribute('aria-pressed', on ? 'true' : 'false');
}
async function toggleFav(symbol) {
  if (!symbol) return;
  favs = favs.includes(symbol) ? favs.filter(s => s !== symbol) : [...favs, symbol].slice(0, 500);
  try { await store.set(FAV_KEY, JSON.stringify(favs)); } catch { /* yerel kalır */ }
  renderList();
  status.textContent = favs.includes(symbol) ? symbol + ' favorilerde (listede üstte).' : symbol + ' favorilerden çıkarıldı.';
}
async function addCurrent() {
  if (list.includes(selected)) { status.textContent = selected + ' zaten listende.'; return; }
  if (list.length >= 200) { status.textContent = 'En fazla 200 sembol tutulur.'; return; }
  list = [...list, selected]; await persist(); renderList();
  status.textContent = selected + ' izleme listesine eklendi.';
}
function setSide(open, save) {
  sideOpen = !!open;
  body.classList.toggle('no-side', !sideOpen);
  sideToggle.setAttribute('aria-pressed', sideOpen ? 'true' : 'false');
  if (save !== false) { try { store.set(SIDE_KEY, sideOpen ? '1' : '0'); } catch { /* yerel kalır */ } }
}
function dispose() { version++; clearTimeout(poll); aborter?.abort(); canvas.replaceChildren(); }
function openChart() {
  if (!active) return;
  dispose(); heading.textContent = selected + ' ⌕';
  window._tvSym = selected;
  const widget = node('div', null, 'tradingview-widget-container__widget'); widget.style.height = '100%';
  const container = node('div', null, 'tradingview-widget-container'); container.style.height = '100%';
  const script = node('script'); script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js'; script.async = true;
  script.textContent = JSON.stringify({
    autosize: true, symbol: selected, interval: interval === '1440' ? 'D' : interval, timezone: 'Europe/Istanbul',
    theme: 'dark', style: '1', locale: 'tr', withdateranges: true, details: true, hotlist: true, calendar: false,
    studies: ['RSI@tv-basicstudies', 'MASimple@tv-basicstudies'], allow_symbol_change: true, hide_side_toolbar: false
  });
  container.append(widget, script); canvas.append(container);
  status.textContent = tvOnly(selected)
    ? `${selected} · Bu sembol için canlı veri gelmeyebilir; listeden başka bir sembol seçebilirsin.`
    : `${selected} · Canlı grafik · Çizimler, indikatörler ve alarm bu terminalde saklanır.`;
  updateQuick();
  canvas.oncontextmenu = event => { event.preventDefault(); const r = canvas.getBoundingClientRect(); showContext(event.clientX, event.clientY, null); };
}
function syncVisibility() {
  const visible = !page.classList.contains('hidden');
  document.body.classList.toggle('terminal-active', visible);
  if (!visible) { if (active) dispose(); active = false; return; }
  const id = (AUTH && AUTH.user) ? AUTH.user.id : 'anonymous';
  if (active && id === userId) return;
  active = true; userId = id;
  sharedListButton.hidden = !siteIsAdmin();
  if (loadedUser !== id) {
    (async () => {
      const raw = await store.get(KEY);
      if (!active) return;
      let saved = null;
      try { saved = JSON.parse(raw || 'null'); } catch { /* bozuk kayıt yok sayılır */ }
      // TradingView listesi bir kez otomatik aktarılır; sonraki düzenlemeler korunur.
      const seeded = await store.get(SEED_KEY);
      if (!active) return;
      if (!seeded) {
        list = [...TV_LIST];
        await store.set(KEY, JSON.stringify(list));
        await store.set(SEED_KEY, '1');
      } else {
        list = Array.isArray(saved) ? saved : [...TV_LIST];
      }
      const favRaw = await store.get(FAV_KEY);
      const sideRaw = await store.get(SIDE_KEY);
      if (!active) return;
      try {
        const f = JSON.parse(favRaw || '[]');
        favs = Array.isArray(f) ? f.filter(x => typeof x === 'string' && list.includes(x)).slice(0, 500) : [];
      } catch { favs = []; }
      setSide(sideRaw !== '0', false);
      await loadDrawings();
      if (!active) return;
      loadedUser = id;
      selected = list.includes(SAFE_DEFAULT) ? SAFE_DEFAULT : (list[0] || SAFE_DEFAULT);
      renderList(); openChart();
    })();
  } else { renderList(); openChart(); }
}
window.loadTVChart = symbol => { if (typeof symbol === 'string' && symbol.includes(':')) { selected = symbol; if (active) openChart(); } };
window.renderWatchlist = () => { renderList(); syncVisibility(); };
new MutationObserver(syncVisibility).observe(page, { attributes: true, attributeFilter: ['class'] });
const waitForGlobals = () => { if (typeof store === 'undefined' || typeof AUTH === 'undefined') setTimeout(waitForGlobals, 50); else syncVisibility(); };
waitForGlobals();
setTimeout(syncVisibility, 400);
