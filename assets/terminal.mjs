import { parseWatchlist, marketSource, candleRequest, normalizeCandles, ema, sma, rsi, backtestEMA } from './terminal-model.mjs?v=2';

const page = document.getElementById('page-trading');
const KEY = 'alfa-watchlist';
const DEFAULT = ['BINANCE:BTCUSDT', 'BINANCE:ETHUSDT', 'FX:EURUSD', 'FX:GBPUSD', 'TVC:GOLD'];
let list = [], selected = DEFAULT[0], interval = '60', chart, candles, poll, aborter;
let version = 0, active = false, userId = '', loadedUser = '', embedded = false, libPromise;
let indicators = { ema: false, sma: false, rsi: false }, indicatorSeries = {};
let history = [], replayIndex = null, replayTimer, drawingTool = 'cursor', drawingPoints = [], drawingBook = {}, drawn = [];
let library, chartReady = false;
const DRAW_KEY = 'alfa-terminal-drawings-v1';
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
const indicatorButton = button('İndikatörler', () => indicatorDialog.showModal(), top);
const replayButton = button('Mum tekrarı', () => toggleReplay(), top);
const testButton = button('Strateji testi', () => { testDialog.showModal(); }, top);
const fallback = button('TV grafiği', () => { embedded = !embedded; fallback.textContent = embedded ? 'Borsa grafiği' : 'TV grafiği'; openChart(); }, top);
const body = node('div', null, 'term-body');
button('☰ Liste', () => { body.classList.toggle('no-list'); }, top);
const workspace = node('div', null, 'term-workspace');
const tools = node('nav', null, 'term-tools'); tools.setAttribute('aria-label', 'Çizim araçları');
const toolButtons = {};
[['cursor', '↖', 'İmleç'], ['level', '━', 'Yatay seviye: grafiğe bir kez tıkla'], ['trend', '╱', 'Trend: iki noktaya tıkla'], ['risk', 'R', 'Risk/getiri: giriş, stop ve hedefe sırayla tıkla']].forEach(([tool, icon, title]) => {
  const b = button(icon, () => setTool(tool), tools); b.title = title; b.setAttribute('aria-label', title); toolButtons[tool] = b;
});
button('↶', async () => {
  const drawings = currentDrawings(); drawings.pop(); await saveDrawings(); paintDrawings();
}, tools).setAttribute('aria-label', 'Son çizimi kaldır');
button('⌖', () => chart?.timeScale().fitContent(), tools).setAttribute('aria-label', 'Grafiği sığdır');
const canvas = node('div', null, 'term-chart');
const replayBar = node('div', null, 'term-replay'); replayBar.hidden = true;
button('◀', () => stepReplay(-1), replayBar).setAttribute('aria-label', 'Önceki mum');
const play = button('▶ Oynat', () => {
  if (replayTimer) stopReplayTimer();
  else { play.textContent = 'Ⅱ Duraklat'; replayTimer = setInterval(() => stepReplay(1), 800); }
}, replayBar);
button('Sonraki ▶', () => stepReplay(1), replayBar);
const replaySlider = node('input'); replaySlider.type = 'range'; replaySlider.min = '1'; replaySlider.setAttribute('aria-label', 'Tekrar oynatma mumu');
replaySlider.addEventListener('input', () => { replayIndex = Number(replaySlider.value); paintCandles(); paintDrawings(); });
const replayLabel = node('span');
replayBar.append(replaySlider, replayLabel);
button('Canlıya dön', () => toggleReplay(false), replayBar);
workspace.append(tools, canvas, replayBar);
const side = node('aside', null, 'term-side'); side.setAttribute('aria-label', 'İzleme listesi');
const sideHead = node('div', null, 'term-side-head');
sideHead.append(node('strong', 'İzleme listesi'));
button('＋ / İçe aktar', () => { dialog.showModal(); }, sideHead);
button('Dışa aktar', () => {
  const url = URL.createObjectURL(new Blob([list.join(',')], { type: 'text/plain' }));
  const a = node('a'); a.href = url; a.download = 'alfa-watchlist.txt'; a.click(); URL.revokeObjectURL(url);
}, sideHead);
const entries = node('div'); side.append(sideHead, entries);
body.append(workspace, side);
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

const searchDialog = node('dialog', null, 'term-dialog');
searchDialog.append(node('h2', 'Parite ara'));
const searchInput = node('input'); searchInput.type = 'search'; searchInput.placeholder = 'BTC, ETH, EURUSD veya TVC:GOLD'; searchInput.setAttribute('aria-label', 'Parite ara');
searchInput.className = 'term-search-input';
const searchResults = node('div', null, 'term-search-results');
const searchStatus = node('p', 'Borsa, spot ve vadeli ayrımı korunur. Diğer ürünler TV gömülü grafiğinde açılır.');
searchDialog.append(searchInput, searchResults, searchStatus);
button('Kapat', () => searchDialog.close(), searchDialog);
page.append(searchDialog);
let catalog = [...DEFAULT, 'FX:USDJPY', 'FX:AUDUSD', 'FX:USDCAD', 'FX:USDCHF', 'FX:NZDUSD', 'FX:XAUUSD', 'TVC:SILVER', 'TVC:DXY', 'CBOE:VIX', 'CRYPTOCAP:BTC.D', 'CRYPTOCAP:TOTAL'], catalogPromise;
async function loadCatalog() {
  return catalogPromise ||= Promise.allSettled([
    fetch('https://api.binance.com/api/v3/exchangeInfo', { signal: AbortSignal.timeout(10000) }).then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(d => (d.symbols || []).filter(s => s.status === 'TRADING' && s.quoteAsset === 'USDT').map(s => 'BINANCE:' + s.symbol)),
    fetch('https://www.okx.com/api/v5/public/instruments?instType=SWAP', { signal: AbortSignal.timeout(10000) }).then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(d => (d.data || []).filter(s => s.state === 'live' && /^[A-Z0-9]+-USDT-SWAP$/.test(s.instId)).map(s => 'OKX:' + s.instId.replace('-USDT-SWAP', 'USDT.P')))
  ]).then(results => {
    catalog = [...new Set([...catalog, ...results.flatMap(r => r.status === 'fulfilled' ? r.value : [])])];
    if (results.every(r => r.status === 'rejected')) searchStatus.textContent = 'Borsa kataloğu alınamadı. Kayıtlı semboller veya BORSA:SEMBOL ile arayabilirsin.';
    paintSearch();
  });
}
function chooseSymbol(symbol) {
  selected = symbol; embedded = false; fallback.textContent = 'TV grafiği';
  render(); openChart(); searchDialog.close();
}
function paintSearch() {
  const q = searchInput.value.trim().toUpperCase(); searchResults.replaceChildren();
  const exact = parseWatchlist(q).symbols;
  const matches = [...new Set([...exact, ...list, ...catalog])].filter(s => !q || s.includes(q)).slice(0, 60);
  matches.forEach(symbol => {
    const row = node('div', null, 'term-search-row');
    button(symbol + (marketSource(symbol).native ? ' · Borsa' : ' · TV'), () => chooseSymbol(symbol), row);
    const add = button(list.includes(symbol) ? '✓' : '＋', async () => {
      if (list.length >= 200 && !list.includes(symbol)) { searchStatus.textContent = 'En fazla 200 sembol kaydedebilirsin.'; return; }
      list = [...new Set([...list, symbol])]; await persist(); render(); paintSearch();
    }, row);
    add.setAttribute('aria-label', symbol + ' listeye ekle'); searchResults.append(row);
  });
  if (!matches.length) searchResults.append(node('p', 'Eşleşme yok. Veri kaynağıyla yaz: ör. FX:EURUSD veya BYBIT:BTCUSDT.P. Yeni sembolün kullanılabilirliği sağlayıcı tarafından doğrulanır.'));
}
searchInput.addEventListener('input', paintSearch);
heading.addEventListener('click', () => { paintSearch(); loadCatalog(); });

const indicatorDialog = node('dialog', null, 'term-dialog');
indicatorDialog.append(node('h2', 'İndikatörler'));
[['ema', 'EMA 20'], ['sma', 'SMA 50'], ['rsi', 'RSI 14 (ayrı panel)']].forEach(([key, title]) => {
  const label = node('label', null, 'term-indicator-option');
  const input = node('input'); input.type = 'checkbox';
  input.addEventListener('change', () => { indicators[key] = input.checked; configureIndicators(); paintCandles(); });
  label.append(input, node('span', title)); indicatorDialog.append(label);
});
indicatorDialog.append(node('p', 'Borsa grafiği içindir. Forex/TV grafiğinde indikatörleri grafiğin kendi menüsünden ekle. Pine Script çalıştırılmaz.'));
button('Kapat', () => indicatorDialog.close(), indicatorDialog); page.append(indicatorDialog);

const testDialog = node('dialog', null, 'term-dialog term-test-dialog');
testDialog.append(node('h2', 'EMA kesişim strateji testi'));
testDialog.append(node('p', 'Yalnızca long: hızlı EMA yukarı kesince al, aşağı kesince çık. Sinyal kapalı mumdan; işlem sonraki mumun açılışında. Kaldıraç yok. Bu sürüm borsaya göre yüklü son 300–500 mumla sınırlıdır. Replay açıksa yalnızca o ana kadar görülen mumlar kullanılır.'));
const testFields = {};
[['fast', 'Hızlı EMA', 9], ['slow', 'Yavaş EMA', 21], ['feePct', 'Her yön komisyon (%)', 0.1], ['slippagePct', 'Her yön kayma (%)', 0.02]].forEach(([key, title, value]) => {
  const label = node('label', title, 'term-test-field'), input = node('input');
  input.type = 'number'; input.value = value; input.step = key.endsWith('Pct') ? '0.01' : '1'; input.min = key.endsWith('Pct') ? '0' : '2'; input.max = key.endsWith('Pct') ? '5' : '200';
  label.append(input); testFields[key] = input; testDialog.append(label);
});
const testOutput = node('div', null, 'term-test-output'); testOutput.setAttribute('role', 'status');
button('Testi çalıştır', () => {
  try {
    const data = visibleCandles().filter(c => c.time + Number(interval) * 60 <= Date.now() / 1000);
    const options = Object.fromEntries(Object.entries(testFields).map(([key, input]) => [key, Number(input.value)]));
    const result = backtestEMA(data, options);
    const date = t => new Date(t * 1000).toLocaleString('tr-TR');
    const num = n => Number(n).toFixed(2);
    testOutput.replaceChildren();
    testOutput.append(node('p', `${selected} · ${data.length} kapalı mum · ${date(data[0].time)} → ${date(data.at(-1).time)}`));
    testOutput.append(node('strong', `${result.trades.length} kapanmış işlem · Net: %${num(result.netReturnPct)} · Kazanma: ${result.winRate === null ? '—' : '%' + num(result.winRate)}`));
    testOutput.append(node('p', `Kapanmış işlemler bazlı en büyük düşüş: %${num(result.maxDrawdownPct)}. ${result.openPosition ? 'Açık pozisyon var; gerçekleşmiş sonuca dahil değil.' : 'Açık pozisyon yok.'}`));
    result.trades.slice(-50).forEach(t => testOutput.append(node('p', `${date(t.entryTime)} → ${date(t.exitTime)} · ${num(t.entry)} → ${num(t.exit)} · %${num(t.returnPct)}`)));
    testOutput.append(node('p', 'Sınırlı mum geçmişinde simülasyondur; gerçekleşmiş kazanç veya gelecek getiri vaadi değildir. Fonlama, spread değişimi ve likidite etkileri modellenmez. İntratrade düşüş ölçülmez.'));
  } catch (e) { testOutput.textContent = e.message; }
}, testDialog);
button('Kapat', () => testDialog.close(), testDialog); testDialog.append(testOutput); page.append(testDialog);

function visibleCandles() { return replayIndex === null ? history : history.slice(0, replayIndex + 1); }
function stopReplayTimer() { clearInterval(replayTimer); replayTimer = null; play.textContent = '▶ Oynat'; }
function toggleReplay(enable = replayIndex === null) {
  if (!chartReady) { status.textContent = 'Önce mumların yüklenmesini bekle.'; return; }
  stopReplayTimer();
  if (enable && history.length < 3) return;
  replayIndex = enable ? Math.min(history.length - 2, Math.max(1, Math.floor(history.length / 2))) : null;
  replayBar.hidden = !enable; replayButton.setAttribute('aria-pressed', String(enable));
  if (enable) { clearTimeout(poll); aborter?.abort(); }
  else { openChart(); return; }
  paintCandles(); paintDrawings(); chart.timeScale().fitContent();
}
function stepReplay(delta) {
  if (replayIndex === null) return;
  replayIndex = Math.max(1, Math.min(history.length - 1, replayIndex + delta));
  paintCandles(); paintDrawings(); chart?.timeScale().scrollToRealTime();
  if (replayIndex === history.length - 1) stopReplayTimer();
}
function configureIndicators() {
  if (!chart || !library) return;
  Object.values(indicatorSeries).forEach(s => chart.removeSeries(s));
  indicatorSeries = {};
  [['ema', 'EMA 20', '#a99bff'], ['sma', 'SMA 50', '#f5b84c'], ['rsi', 'RSI 14', '#61ccf7']].forEach(([key, title, color]) => {
    if (!indicators[key]) return;
    indicatorSeries[key] = chart.addSeries(library.LineSeries, { title, color, lineWidth: 2, priceLineVisible: false, lastValueVisible: key === 'rsi' }, key === 'rsi' ? 1 : 0);
    if (key === 'rsi') {
      indicatorSeries[key].createPriceLine({ price: 70, color: '#665e73', lineStyle: 2, axisLabelVisible: true, title: '70' });
      indicatorSeries[key].createPriceLine({ price: 30, color: '#665e73', lineStyle: 2, axisLabelVisible: true, title: '30' });
      chart.panes()[1]?.setHeight(120);
    }
  });
}
function paintCandles() {
  if (!chartReady) return;
  const data = visibleCandles(); candles.setData(data);
  if (indicatorSeries.ema) indicatorSeries.ema.setData(ema(data, 20));
  if (indicatorSeries.sma) indicatorSeries.sma.setData(sma(data, 50));
  if (indicatorSeries.rsi) indicatorSeries.rsi.setData(rsi(data, 14));
  if (replayIndex !== null) {
    replaySlider.max = String(history.length - 1); replaySlider.value = String(replayIndex);
    replayLabel.textContent = new Date(data.at(-1).time * 1000).toLocaleString('tr-TR');
    status.textContent = `MUM TEKRARI · ${selected} · ${data.length}/${history.length} mum gösteriliyor · Gelecek mumlar gizli`;
  }
}
function currentDrawings() { return drawingBook[selected + '|' + interval] ||= []; }
async function saveDrawings() {
  if (!AUTH.user || AUTH.user.id !== userId) return;
  await store.set(DRAW_KEY, JSON.stringify(drawingBook));
}
function setTool(tool) {
  drawingTool = tool; drawingPoints = [];
  Object.entries(toolButtons).forEach(([key, b]) => b.setAttribute('aria-pressed', String(key === tool)));
  status.textContent = { cursor: 'İmleç', level: 'Seviye için grafiğe tıkla.', trend: 'Trend için başlangıç ve bitişe tıkla.', risk: 'Sırayla giriş, stop ve hedef seviyelerine tıkla.' }[tool];
}
function paintDrawings() {
  if (!chartReady) return;
  drawn.forEach(d => { if (d.kind === 'price') candles.removePriceLine(d.value); else chart.removeSeries(d.value); }); drawn = [];
  currentDrawings().forEach(d => {
    if (replayIndex !== null && d.points.some(p => p.time > visibleCandles().at(-1).time)) return;
    if (d.tool === 'trend') {
      const pts = [...d.points].sort((a,b) => a.time - b.time);
      if (pts[0].time === pts[1].time || (replayIndex !== null && pts[1].time > visibleCandles().at(-1).time)) return;
      const s = chart.addSeries(library.LineSeries, { color: '#e9c36a', lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      s.setData(pts.map(p => ({ time: p.time, value: p.price }))); drawn.push({ kind: 'series', value: s });
    } else d.points.forEach((p, i) => {
      const labels = ['Giriş', 'Stop', 'Hedef'];
      const rr = d.tool === 'risk' ? Math.abs(d.points[2].price - d.points[0].price) / Math.abs(d.points[0].price - d.points[1].price) : 0;
      const value = candles.createPriceLine({ price: p.price, color: d.tool === 'risk' ? ['#c7d0dd','#ee6c75','#39c59b'][i] : '#8a9bff', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: d.tool === 'risk' ? labels[i] + (i === 2 ? ` · ${rr.toFixed(2)}R` : '') : 'Seviye' });
      drawn.push({ kind: 'price', value });
    });
  });
}
async function drawingClick(param) {
  if (drawingTool === 'cursor' || !param.point || typeof param.time !== 'number' || !chartReady || param.paneIndex > 0) return;
  const price = candles.coordinateToPrice(param.point.y);
  if (!(price > 0)) return;
  drawingPoints.push({ time: param.time, price });
  const needed = { level:1, trend:2, risk:3 }[drawingTool];
  if (drawingPoints.length < needed) { status.textContent = `Çizim: ${drawingPoints.length}/${needed} nokta seçildi.`; return; }
  if (drawingTool === 'risk') {
    const [entry, stop, target] = drawingPoints.map(p=>p.price);
    if (entry === stop || (target-entry)*(entry-stop) <= 0) { drawingPoints = []; status.textContent = 'Hedef ve stop girişin zıt taraflarında olmalı. Yeniden seç.'; return; }
  }
  if (drawingTool === 'trend' && drawingPoints[0].time === drawingPoints[1].time) { drawingPoints = []; status.textContent = 'Trend için iki farklı mum seç.'; return; }
  const drawings = currentDrawings();
  if (drawings.length >= 50) { status.textContent = 'Bu grafik için en fazla 50 çizim kaydedebilirsin.'; drawingPoints = []; return; }
  drawings.push({ tool: drawingTool, points: drawingPoints }); setTool('cursor'); paintDrawings(); await saveDrawings();
  status.textContent = 'Çizim hesabına kaydedildi.';
}

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
  version++; clearTimeout(poll); stopReplayTimer(); aborter?.abort(); chart?.remove(); chart = null;
  chartReady = false; history = []; replayIndex = null; drawn = []; indicatorSeries = {}; drawingPoints = [];
  replayBar.hidden = true; replayButton.setAttribute('aria-pressed', 'false'); testOutput.replaceChildren();
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
  indicatorButton.disabled = true; replayButton.disabled = true; testButton.disabled = true; tools.hidden = true;
  workspace.classList.add('term-embedded');
}
async function openChart() {
  if (!active) return;
  dispose(); heading.textContent = selected + ' ⌕';
  window._tvSym = selected;
  const m = marketSource(selected);
  fallback.disabled = !m.native;
  if (!m.native || embedded) { showEmbedded(); return; }
  indicatorButton.disabled = false; replayButton.disabled = false; testButton.disabled = false; tools.hidden = false;
  workspace.classList.remove('term-embedded'); setTool('cursor');
  const generation = version, symbol = selected, tf = interval;
  status.textContent = `${symbol} · ${m.perpetual ? 'Vadeli' : 'Spot'} · Mumlar yükleniyor…`;
  try {
    const lib = await loadLibrary();
    if (generation !== version || !active) return;
    library = lib;
    chart = lib.createChart(canvas, { autoSize: true, layout: { background: { color: '#0d1117' }, textColor: '#a9bad0', attributionLogo: true }, grid: { vertLines: { color: '#18202d' }, horzLines: { color: '#18202d' } }, timeScale: { timeVisible: true }, localization: { locale: 'tr-TR' } });
    candles = chart.addSeries(lib.CandlestickSeries, { upColor: '#26a69a', downColor: '#ef5350', borderVisible: false, wickUpColor: '#26a69a', wickDownColor: '#ef5350' });
    configureIndicators();
    chart.subscribeClick(drawingClick);
    let first = true;
    const refresh = async () => {
      if (generation !== version || !active || document.hidden) return;
      try {
        aborter = new AbortController();
        const response = await fetch(candleRequest(symbol, tf), { signal: AbortSignal.any([aborter.signal, AbortSignal.timeout(12000)]) });
        if (!response.ok) throw new Error('Borsa erişimi kısıtlı veya geçici olarak kullanılamıyor.');
        const data = normalizeCandles(await response.json(), m.exchange);
        if (generation !== version || !active || replayIndex !== null) return;
        if (!data.length) throw new Error('Bu sembol için mum bulunamadı.');
        history = data; chartReady = true; paintCandles();
        const last = data.at(-1).close;
        const precision = last < 1 ? 8 : last < 100 ? 4 : 2;
        candles.applyOptions({ priceFormat: { type: 'price', precision, minMove: 10 ** -precision } });
        paintDrawings();
        if (first) { chart.timeScale().fitContent(); first = false; }
        status.textContent = `${symbol} · ${m.perpetual ? 'Vadeli' : 'Spot'} · ${m.exchange} · Son kontrol: ${new Date().toLocaleTimeString('tr-TR')} · 15 sn aralık · Grafik: TradingView Lightweight Charts`;
      } catch (e) {
        if (generation !== version || replayIndex !== null) return;
        status.textContent = `${symbol} · ${e.message} Veri güncel olmayabilir. Sağ üstten “TV grafiği”ni deneyebilirsin.`;
      }
      if (generation === version && active && replayIndex === null) poll = setTimeout(refresh, 15000);
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
    const drawingsRaw = await store.get(DRAW_KEY);
    if (!active || AUTH.user?.id !== id) return;
    drawingBook = {};
    try {
      const saved = JSON.parse(drawingsRaw || '{}');
      Object.entries(saved).slice(0, 200).forEach(([key, values]) => {
        if (!/^[A-Z0-9_]{2,24}:[A-Z0-9_.!/-]{1,40}\|(1|5|15|60|240|1440)$/.test(key) || !Array.isArray(values)) return;
        drawingBook[key] = values.filter(d => ['level','trend','risk'].includes(d?.tool) && Array.isArray(d.points) &&
          d.points.length === ({level:1,trend:2,risk:3}[d.tool]) &&
          d.points.every(p => Number.isFinite(p.time) && p.time > 0 && Number.isFinite(p.price) && p.price > 0) &&
          (d.tool !== 'risk' || (d.points[2].price-d.points[0].price)*(d.points[0].price-d.points[1].price)>0)).slice(0,50);
      });
    } catch { /* Invalid saved drawing data is ignored. */ }
    loadedUser = id; selected = list[0] || DEFAULT[0];
  }
  render(); openChart();
}
window.loadTVChart = symbol => { if (typeof symbol === 'string' && parseWatchlist(symbol).symbols.length) selected = symbol; if (active) openChart(); };
window.renderWatchlist = () => { render(); syncVisibility(); };
new MutationObserver(syncVisibility).observe(page, { attributes: true, attributeFilter: ['class'] });
document.addEventListener('visibilitychange', () => { if (active) { if (document.hidden) { clearTimeout(poll); aborter?.abort(); stopReplayTimer(); } else if (replayIndex === null) openChart(); } });
syncVisibility();
