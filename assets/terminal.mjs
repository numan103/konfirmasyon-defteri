import { parseWatchlist, marketSource, candleRequest, normalizeCandles, ema } from './terminal-model.mjs';

const page = document.getElementById('page-trading');
const KEY = 'alfa-watchlist';
const DEFAULT = ['BINANCE:BTCUSDT', 'BINANCE:ETHUSDT', 'FX:EURUSD', 'FX:GBPUSD', 'TVC:GOLD'];
let list = [], selected = DEFAULT[0], interval = '60', chart, candles, emaSeries, poll, aborter;
let version = 0, active = false, userId = '', loadedUser = '', useEMA = false, embedded = false, libPromise;
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
const heading = node('span', selected, 'term-symbol'); top.append(heading);
const timeframe = node('select'); timeframe.setAttribute('aria-label', 'Zaman dilimi');
[['1', '1dk'], ['5', '5dk'], ['15', '15dk'], ['60', '1sa'], ['240', '4sa'], ['1440', '1G']].forEach(([value, text]) => {
  const o = node('option', text); o.value = value; timeframe.append(o);
});
timeframe.value = interval; top.append(timeframe);
timeframe.addEventListener('change', () => { interval = timeframe.value; openChart(); });
const emaButton = button('EMA 20', () => { useEMA = !useEMA; emaButton.setAttribute('aria-pressed', String(useEMA)); openChart(); }, top);
const fallback = button('TV grafiği', () => { embedded = !embedded; fallback.textContent = embedded ? 'Borsa grafiği' : 'TV grafiği'; openChart(); }, top);
const body = node('div', null, 'term-body');
button('☰ Liste', () => { body.classList.toggle('no-list'); }, top);
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
    importMessage.textContent = 'Paylaştığın sayfadan okunabilen 44 sembol hazır. Sayfa 76 sembol bildiriyor; diğerleri henüz alınamadı. “Listeye ekle” ile bu 44 sembolü kaydet. Otomatik TradingView senkronizasyonu değildir.';
  } catch { importMessage.textContent = 'Paylaşılan liste alınamadı.'; }
}, dialog);
sharedListButton.hidden = true;
file.addEventListener('change', async () => {
  const f = file.files[0]; if (!f) return;
  if (f.size > 100000) { importMessage.textContent = 'En fazla 100 KB dosya seç.'; return; }
  text.value = await f.text();
});
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

async function persist() {
  if (!userId || !AUTH.user || AUTH.user.id !== userId) return;
  await store.set(KEY, JSON.stringify(list));
  status.textContent = 'Liste hesabına kaydedildi; bulut eşitlemesi mevcut hesap sistemi üzerinden yapılır.';
}
function render() {
  entries.replaceChildren();
  list.forEach((symbol, index) => {
    const row = node('div', null, 'term-row' + (symbol === selected ? ' on' : ''));
    const select = button('', () => { selected = symbol; embedded = false; fallback.textContent = 'TV grafiği'; render(); openChart(); }, row, 'term-pair');
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
function dispose() {
  version++; clearTimeout(poll); aborter?.abort(); chart?.remove(); chart = null;
  canvas.replaceChildren();
}
function loadLibrary() {
  return libPromise ||= new Promise((resolve, reject) => {
    if (window.LightweightCharts) return resolve(window.LightweightCharts);
    const s = node('script');
    s.src = 'https://unpkg.com/lightweight-charts@5.0.8/dist/lightweight-charts.standalone.production.js';
    s.onload = () => resolve(window.LightweightCharts); s.onerror = () => { libPromise = null; reject(new Error('Grafik kütüphanesi yüklenemedi.')); };
    document.head.append(s);
  });
}
function showEmbedded() {
  const container = node('div', null, 'tradingview-widget-container');
  const widget = node('div', null, 'tradingview-widget-container__widget'); widget.style.height = 'calc(100% - 24px)';
  const attribution = node('div', null, 'tradingview-widget-copyright');
  const link = node('a', 'Grafikler TradingView tarafından sağlanmaktadır'); link.href = 'https://www.tradingview.com/'; link.target = '_blank'; link.rel = 'noopener noreferrer'; attribution.append(link);
  const script = node('script'); script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js'; script.async = true;
  script.textContent = JSON.stringify({ autosize: true, symbol: selected, interval: interval === '1440' ? 'D' : interval, timezone: 'Europe/Istanbul', theme: 'dark', style: '1', locale: 'tr', allow_symbol_change: true, hide_side_toolbar: false, details: false, hotlist: false, calendar: false, withdateranges: true });
  container.append(widget, attribution, script); canvas.append(container);
  status.textContent = `${selected} · TradingView gömülü grafik · Veri gecikmesi/kullanılabilirliği sağlayıcıya bağlıdır. Çizimler TV hesabınla otomatik eşitlenmez.`;
  emaButton.disabled = true;
}
async function openChart() {
  if (!active) return;
  dispose(); heading.textContent = selected;
  window._tvSym = selected;
  const m = marketSource(selected);
  if (!m.native || embedded) { showEmbedded(); return; }
  emaButton.disabled = false;
  const generation = version, symbol = selected, tf = interval;
  status.textContent = `${symbol} · ${m.perpetual ? 'Vadeli' : 'Spot'} · Mumlar yükleniyor…`;
  try {
    const lib = await loadLibrary();
    if (generation !== version || !active) return;
    chart = lib.createChart(canvas, { autoSize: true, layout: { background: { color: '#0d1117' }, textColor: '#a9bad0', attributionLogo: true }, grid: { vertLines: { color: '#18202d' }, horzLines: { color: '#18202d' } }, timeScale: { timeVisible: true }, localization: { locale: 'tr-TR' } });
    candles = chart.addSeries(lib.CandlestickSeries, { upColor: '#26a69a', downColor: '#ef5350', borderVisible: false, wickUpColor: '#26a69a', wickDownColor: '#ef5350' });
    if (useEMA) emaSeries = chart.addSeries(lib.LineSeries, { color: '#9e94ff', lineWidth: 2, title: 'EMA 20', priceLineVisible: false });
    let first = true;
    const refresh = async () => {
      if (generation !== version || !active || document.hidden) return;
      try {
        aborter = new AbortController();
        const response = await fetch(candleRequest(symbol, tf), { signal: AbortSignal.any([aborter.signal, AbortSignal.timeout(12000)]) });
        if (!response.ok) throw new Error('Borsa erişimi kısıtlı veya geçici olarak kullanılamıyor.');
        const data = normalizeCandles(await response.json(), m.exchange);
        if (generation !== version || !active) return;
        if (!data.length) throw new Error('Bu sembol için mum bulunamadı.');
        candles.setData(data);
        const last = data.at(-1).close;
        const precision = last < 1 ? 8 : last < 100 ? 4 : 2;
        candles.applyOptions({ priceFormat: { type: 'price', precision, minMove: 10 ** -precision } });
        if (useEMA) emaSeries.setData(ema(data));
        if (first) { chart.timeScale().fitContent(); first = false; }
        status.textContent = `${symbol} · ${m.perpetual ? 'Vadeli' : 'Spot'} · ${m.exchange} · Son kontrol: ${new Date().toLocaleTimeString('tr-TR')} · 15 sn aralık · Grafik: TradingView Lightweight Charts`;
      } catch (e) {
        if (generation !== version) return;
        status.textContent = `${symbol} · ${e.message} Veri güncel olmayabilir. Sağ üstten “TV grafiği”ni deneyebilirsin.`;
      }
      if (generation === version && active) poll = setTimeout(refresh, 15000);
    };
    await refresh();
  } catch (e) {
    if (generation === version) { canvas.append(node('p', e.message + ' Sağ üstten TV grafiğini açabilirsin.', 'term-help')); status.textContent = 'Grafik yüklenemedi.'; }
  }
}
async function syncVisibility() {
  const visible = !page.classList.contains('hidden') && typeof siteCanOpen === 'function' && siteCanOpen('trading') && !!AUTH.user;
  document.body.classList.toggle('terminal-active', visible);
  if (!visible) { if (active) dispose(); active = false; return; }
  const id = AUTH.user.id;
  if (active && id === userId) return;
  active = true; userId = id;
  sharedListButton.hidden = !siteIsAdmin();
  if (loadedUser !== id) {
    const raw = await store.get(KEY);
    if (!active || AUTH.user?.id !== id) return;
    try { const saved = JSON.parse(raw || 'null'); list = Array.isArray(saved) ? parseWatchlist(saved.join(',')).symbols : [...DEFAULT]; } catch { list = [...DEFAULT]; }
    loadedUser = id; selected = list[0] || DEFAULT[0];
  }
  render(); openChart();
}
window.loadTVChart = symbol => { if (typeof symbol === 'string' && parseWatchlist(symbol).symbols.length) selected = symbol; if (active) openChart(); };
window.renderWatchlist = () => { render(); syncVisibility(); };
new MutationObserver(syncVisibility).observe(page, { attributes: true, attributeFilter: ['class'] });
document.addEventListener('visibilitychange', () => { if (active) { if (document.hidden) { clearTimeout(poll); aborter?.abort(); } else openChart(); } });
syncVisibility();
