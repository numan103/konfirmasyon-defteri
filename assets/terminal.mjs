import { parseWatchlist } from './terminal-model.mjs?v=4';

const page = document.getElementById('page-trading');
const KEY = 'alfa-watchlist';
const DRAW_KEY = 'alfa-terminal-drawings-v1';
const DEFAULT = ['BINANCE:BTCUSDT', 'BINANCE:ETHUSDT', 'FX:EURUSD', 'FX:GBPUSD', 'TVC:GOLD'];
let list = [], selected = DEFAULT[0], interval = '60', poll, aborter;
let version = 0, active = false, userId = '', loadedUser = '';
let alerts = [];
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
button('＋ / İçe aktar', () => { dialog.showModal(); }, sideHead);
button('Dışa aktar', () => {
  const url = URL.createObjectURL(new Blob([list.join(',')], { type: 'text/plain' }));
  const a = node('a'); a.href = url; a.download = 'alfa-watchlist.txt'; a.click(); URL.revokeObjectURL(url);
}, sideHead);
const entries = node('div'); side.append(sideHead, entries);
body.append(canvas, side);
const status = node('footer', '', 'term-foot'); status.setAttribute('role', 'status');
page.append(top, body, status);

const dialog = node('dialog', null, 'term-dialog');
dialog.append(node('h2', 'Watchlist aktar'));
dialog.append(node('p', 'TradingView .txt dosyanı seç veya BORSA:SEMBOL listesini yapıştır. Mevcut listen silinmez; yeni semboller eklenir. Spot ve vadeli ürünler ayrı tutulur.'));
const file = node('input'); file.type = 'file'; file.accept = '.txt,text/plain';
file.setAttribute('aria-label', 'TradingView watchlist dosyası');
const text = node('textarea'); text.placeholder = 'BINANCE:BTCUSDT,FX:EURUSD,TVC:GOLD'; text.setAttribute('aria-label', 'Sembol listesi');
const importMessage = node('p'); importMessage.setAttribute('role', 'status');
const sharedListButton = button('Paylaştığın Kripto listesini getir', async () => {
  try {
    const r = await fetch('/assets/watchlist-84359879.txt?v=1');
    if (!r.ok) throw new Error();
    text.value = await r.text();
    importMessage.textContent = 'Paylaştığın sayfadan okunabilen 44 sembol hazır. “Listeye ekle” ile kaydet. Otomatik TradingView senkronizasyonu değildir.';
  } catch { importMessage.textContent = 'Paylaşılan liste alınamadı.'; }
}, dialog);
sharedListButton.hidden = true;
dialog.append(file, text, importMessage);
button('Listeye ekle', async () => {
  const parsed = parseWatchlist(text.value);
  if (!parsed.symbols.length) { importMessage.textContent = 'Geçerli BORSA:SEMBOL bulunamadı. Watchlist bağlantısı yerine dosya veya sembol listesi kullan.'; return; }
  list = [...new Set([...list, ...parsed.symbols])].slice(0, 200);
  await persist(); render();
  importMessage.textContent = `${parsed.symbols.length} geçerli sembol işlendi. ${parsed.rejected.length} satır/ifade aktarılmadı.${parsed.rejected.length ? ' Geçersiz: ' + parsed.rejected.slice(0, 5).join(', ') : ''}${parsed.overflow ? ' En fazla 200 sembol tutulur.' : ''}`;
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
function chooseSymbol(symbol) { selected = symbol; render(); openChart(); searchDialog.close(); }
function paintSearch() {
  const q = searchInput.value.trim().toUpperCase(); searchResults.replaceChildren();
  const matches = [...new Set([...parseWatchlist(q).symbols, ...list, ...catalog])].filter(s => !q || s.includes(q)).slice(0, 60);
  matches.forEach(symbol => {
    const row = node('div', null, 'term-search-row');
    button(symbol, () => chooseSymbol(symbol), row);
    const add = button(list.includes(symbol) ? '✓' : '＋', async () => {
      if (list.length >= 200 && !list.includes(symbol)) { searchStatus.textContent = 'En fazla 200 sembol kaydedebilirsin.'; return; }
      list = [...new Set([...list, symbol])]; await persist(); render(); paintSearch();
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
function render() {
  entries.replaceChildren();
  list.forEach((symbol, index) => {
    const row = node('div', null, 'term-row' + (symbol === selected ? ' on' : ''));
    const select = button('', () => { selected = symbol; render(); openChart(); }, row, 'term-pair');
    select.append(node('b', symbol.split(':')[1]), node('small', symbol.split(':')[0] + (marketSource(symbol).native ? ' · Borsa verisi' : ' · TV gömülü')));
    const up = button('↑', async () => {
      if (!index) return; [list[index - 1], list[index]] = [list[index], list[index - 1]]; await persist(); render();
    }, row, 'term-action');
    up.setAttribute('aria-label', symbol + ' yukarı taşı'); up.disabled = index === 0;
    const remove = button('×', async () => {
      list = list.filter(s => s !== symbol); await persist(); render();
    }, row, 'term-action');
    remove.setAttribute('aria-label', symbol + ' kaldır');
    entries.append(row);
  });
}
function dispose() { version++; clearTimeout(poll); aborter?.abort(); canvas.replaceChildren(); }
function openChart() {
  if (!active) return;
  dispose(); heading.textContent = selected + ' ⌕';
  window._tvSym = selected;
  const m = marketSource(selected);
  const widget = node('div', null, 'tradingview-widget-container__widget'); widget.style.height = '100%';
  const container = node('div', null, 'tradingview-widget-container'); container.style.height = '100%';
  const script = node('script'); script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js'; script.async = true;
  script.textContent = JSON.stringify({
    autosize: true, symbol: selected, interval: interval === '1440' ? 'D' : interval, timezone: 'Europe/Istanbul',
    theme: 'dark', style: '1', locale: 'tr', withdateranges: true, details: true, hotlist: true, calendar: false,
    studies: ['RSI@tv-basicstudies', 'MASimple@tv-basicstudies'], allow_symbol_change: true, hide_side_toolbar: false
  });
  container.append(widget, script); canvas.append(container);
  status.textContent = `${selected} · TradingView grafiği · Çizimler, indikatörler ve alarm bu terminalde saklanır; TV hesabına bağlanmaz.`;
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
      try { const saved = JSON.parse(raw || 'null'); list = Array.isArray(saved) ? saved : [...DEFAULT]; } catch { list = [...DEFAULT]; }
      await loadDrawings();
      if (!active) return;
      loadedUser = id; selected = list[0] || DEFAULT[0]; render(); openChart();
    })();
  } else { render(); openChart(); }
}
window.loadTVChart = symbol => { if (typeof symbol === 'string' && symbol.includes(':')) { selected = symbol; if (active) openChart(); } };
window.renderWatchlist = () => { render(); syncVisibility(); };
new MutationObserver(syncVisibility).observe(page, { attributes: true, attributeFilter: ['class'] });
syncVisibility();
setTimeout(syncVisibility, 500);
