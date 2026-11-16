import { createChart, CandlestickSeries, LineSeries, ColorType, CrosshairMode } from './vendor/lightweight-charts-5.0.9/lightweight-charts.standalone.production.mjs';
import { TIMEFRAMES, SYMBOLS, STREAM_ORIGINS, fetchHistory, streamURL, parseKline, mergeCandles } from './alfa-charts-data.mjs?v=1';
import { DrawingEngine } from './alfa-drawings.mjs?v=3';
import { IndicatorManager } from './alfa-indicators.mjs?v=1';
import { SessionLevelsManager } from './alfa-session-levels.mjs?v=1';
import { MarketStructureManager } from './alfa-market-structure.mjs?v=1';

const $ = id => document.getElementById(id);
const workspace = document.querySelector('.workspace');
const host = $('chart');
const priceFormat = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const chart = createChart(host, {
  layout: { background: { type: ColorType.Solid, color: '#10141c' }, textColor: '#8e9eb6', attributionLogo: true },
  grid: { vertLines: { color: '#1b2433' }, horzLines: { color: '#1b2433' } },
  crosshair: { mode: CrosshairMode.Normal },
  rightPriceScale: { borderColor: '#30394b', scaleMargins: { top: 0.12, bottom: 0.1 } },
  timeScale: { borderColor: '#30394b', timeVisible: true, secondsVisible: false, rightOffset: 8 },
  handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
  handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
  localization: { locale: 'tr-TR' }
});
const candles = chart.addSeries(CandlestickSeries, {
  upColor: '#26c89c', downColor: '#ef6677', borderVisible: false, wickUpColor: '#26c89c', wickDownColor: '#ef6677'
});
const line = chart.addSeries(LineSeries, { color: '#8ea7ff', lineWidth: 2, visible: false });
let symbol = 'BTCUSDT', interval = '1h', type = 'candles';
let history = [], seriesBars = [], socket, aborter, retryTimer, watchdog, generation = 0, attempts = 0;
let lastReceipt = 0, disposed = false, pendingIndicators = null;
const observer = new ResizeObserver(([entry]) => {
  chart.resize(Math.floor(entry.contentRect.width), Math.floor(entry.contentRect.height));
});
observer.observe(host);

function connection(text, state = 'waiting') {
  $('connection').textContent = text; $('connection').dataset.state = state;
}
function showMessage(text) { $('message').textContent = text; $('message').hidden = !text; }
function showCandle(c) {
  if (!c) return;
  $('ohlc').textContent = `O ${priceFormat.format(c.open)}  H ${priceFormat.format(c.high)}  L ${priceFormat.format(c.low)}  C ${priceFormat.format(c.close)}`;
}
function quote() {
  const c = history.at(-1);
  if (!c) return;
  $('last-price').textContent = priceFormat.format(c.close) + ' USDT';
  $('price-time').textContent = `Mum: ${new Date(c.time * 1000).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
  showCandle(c);
}
function setData(data, resetView) {
  history = data;
  seriesBars = data;
  candles.setData(history);
  line.setData(history.map(c => ({ time: c.time, value: c.close })));
  if (resetView) {
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, history.length - 130), to: history.length + 8 });
  }
  quote();
  if (pendingIndicators) { try { indicators.fromJSON(pendingIndicators); } catch {} pendingIndicators = null; }
  else { try { indicators.updateAll(history); } catch {} }
  try { sessionLevels.render(); } catch {}
  try { marketStructure.render(); } catch {}
}
chart.subscribeCrosshairMove(param => {
  const bar = param.seriesData.get(type === 'candles' ? candles : line);
  if (!bar || !param.time) { showCandle(history.at(-1)); return; }
  showCandle(history.find(c => c.time === param.time));
});
host.addEventListener('keydown', event => {
  const range = chart.timeScale().getVisibleLogicalRange();
  if (!range) return;
  const span = range.to - range.from, middle = (range.from + range.to) / 2;
  const keys = { '+': .5, '=': .5, '-': 2, ArrowLeft: -0.1, ArrowRight: 0.1 };
  const factor = keys[event.key];
  if (factor == null) return;
  event.preventDefault();
  if (event.key.startsWith('Arrow')) {
    const shift = factor * span;
    chart.timeScale().setVisibleLogicalRange({ from: range.from + shift, to: range.to + shift });
  } else {
    const half = span * factor / 2;
    chart.timeScale().setVisibleLogicalRange({ from: middle - half, to: middle + half });
  }
});
function closeTransport() {
  clearTimeout(retryTimer); clearInterval(watchdog);
  aborter?.abort();
  if (socket) { socket.onclose = socket.onmessage = socket.onopen = socket.onerror = null; socket.close(); socket = null; }
}
function updateUI() {
  $('symbol').value = symbol;
  const label = Object.keys(TIMEFRAMES).find(key => TIMEFRAMES[key] === interval);
  $('market-title').textContent = `${symbol} · ${label}`;
  document.querySelectorAll('#timeframes button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.interval === interval)));
  document.querySelectorAll('.watch-row').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.symbol === symbol)));
}
async function loadMarket() {
  const id = ++generation;
  closeTransport(); attempts = 0; history = []; seriesBars = [];
  candles.setData([]); line.setData([]);
  $('last-price').textContent = '—'; $('price-time').textContent = 'Henüz veri yok';
  $('ohlc').textContent = 'Gerçek piyasa verisi bekleniyor';
  updateUI();
  drawings.openMarket(symbol);
  try { indicators.clear(); } catch {}
  try { pendingIndicators = JSON.parse(localStorage.getItem('alfa-ind:v1:' + symbol) || 'null'); } catch { pendingIndicators = null; }
  showMessage('Binance mum verileri yükleniyor…');
  connection('Geçmiş mumlar yükleniyor');
  connect(id, true);
}
function connect(id, resetView = false) {
  if (id !== generation || disposed) return;
  const controller = new AbortController(); aborter = controller;
  const timeout = setTimeout(() => controller.abort(), 15000);
  let buffered = [], ready = false, ended = false;
  const url = streamURL(STREAM_ORIGINS[attempts % STREAM_ORIGINS.length], symbol, interval);
  const ws = new WebSocket(url); socket = ws;
  lastReceipt = Date.now();
  function reconnect(reason) {
    if (ended || id !== generation || disposed) return;
    ended = true;
    clearTimeout(timeout); clearInterval(watchdog); controller.abort();
    ws.onclose = ws.onmessage = ws.onerror = ws.onopen = null; ws.close();
    attempts++;
    connection(`${reason} · yeniden bağlanılıyor`, 'error');
    if (!history.length) showMessage('Binance verisine erişilemiyor. Otomatik yeniden denenecek; fiyat üretilmez.');
    retryTimer = setTimeout(() => connect(id, !history.length), Math.min(30000, 1000 * 2 ** Math.min(attempts, 5)));
  }
  ws.onopen = async () => {
    if (id !== generation || ended) return;
    lastReceipt = Date.now();
    connection('WebSocket açık · mum geçmişi eşitleniyor');
    try {
      // WebSocket önce açılır: REST isteği sırasında gelen mumlar kaybolmaz.
      const data = await fetchHistory(symbol, interval, controller.signal);
      if (id !== generation || ended) return;
      clearTimeout(timeout);
      setData(mergeCandles(data, buffered), resetView);
      buffered = []; ready = true;
      showMessage('');
      connection('Geçmiş yüklendi · ilk canlı mum bekleniyor');
    } catch (error) {
      if (id === generation && !ended) reconnect('Geçmiş veri alınamadı');
    }
  };
  ws.onmessage = event => {
    if (id !== generation || ended) return;
    try {
      const c = parseKline(event.data, symbol, interval);
      if (!c) return;
      lastReceipt = Date.now();
      if (!ready) { buffered.push(c); if (buffered.length > 2000) buffered.shift(); return; }
      if (c.time < history.at(-1).time) return;
      candles.update(c); line.update({ time: c.time, value: c.close });
      if (c.time > seriesBars.at(-1).time) seriesBars = [...seriesBars, c];
      history = mergeCandles(history, [c]);
      quote(); attempts = 0;
      try { indicators.updateAll(seriesBars); } catch {}
      try { sessionLevels.render(); } catch {}
      try { marketStructure.render(); } catch {}
      connection(`Canlı · ${new Date(lastReceipt).toLocaleTimeString('tr-TR')} · WebSocket`, 'live');
    } catch { reconnect('Veri doğrulanamadı'); }
  };
  ws.onclose = () => reconnect('WebSocket kesildi');
  ws.onerror = () => reconnect('WebSocket erişilemiyor');
  watchdog = setInterval(() => { if (Date.now() - lastReceipt > 30000) reconnect('Canlı veri gecikti'); }, 5000);
}
for (const [label, value] of Object.entries(TIMEFRAMES)) {
  const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
  b.dataset.interval = value; b.title = label.endsWith('M') ? `${parseInt(label)} dakika` : label;
  b.addEventListener('click', () => { if (interval !== value) { interval = value; loadMarket(); } });
  $('timeframes').append(b);
}
for (const item of SYMBOLS) {
  const b = document.createElement('button'); b.type = 'button'; b.className = 'watch-row'; b.dataset.symbol = item;
  const name = document.createElement('strong'); name.textContent = item;
  const venue = document.createElement('small'); venue.textContent = 'SPOT';
  b.append(name, venue); b.addEventListener('click', () => { if (symbol !== item) { symbol = item; loadMarket(); } });
  $('watch-rows').append(b);
}
$('symbol').addEventListener('change', e => { symbol = e.target.value; loadMarket(); });
$('chart-type').addEventListener('change', e => {
  type = e.target.value;
  candles.applyOptions({ visible: type === 'candles' });
  line.applyOptions({ visible: type === 'line' });
});
$('fit').addEventListener('click', () => chart.timeScale().fitContent());
$('live').addEventListener('click', () => chart.timeScale().scrollToRealTime());
function toggleList(show) {
  workspace.classList.toggle('no-list', !show);
  $('list-toggle').setAttribute('aria-pressed', String(show));
}
$('list-toggle').addEventListener('click', () => toggleList(workspace.classList.contains('no-list')));
toggleList(!matchMedia('(max-width:600px)').matches);
if (!document.fullscreenEnabled) $('fullscreen').hidden = true;
$('fullscreen').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await workspace.requestFullscreen();
  } catch { connection('Tarayıcı tam ekran isteğini reddetti', 'error'); }
});
document.addEventListener('fullscreenchange', () => { $('fullscreen').textContent = document.fullscreenElement ? 'Küçült' : 'Tam ekran'; });
const drawings = new DrawingEngine({ chart, series: candles, host, getBars: () => seriesBars, getInterval: () => interval });
const indicators = new IndicatorManager({ chart, getBars: () => seriesBars });
const sessionLevels = new SessionLevelsManager({ series: candles, getBars: () => seriesBars });
const marketStructure = new MarketStructureManager({ series: candles, getBars: () => seriesBars });
function dispose() { disposed = true; ++generation; closeTransport(); drawings.dispose(); observer.disconnect(); chart.remove(); }
window.addEventListener('pagehide', dispose, { once: true });
window.addEventListener('pageshow', e => { if (e.persisted) location.reload(); });
window.addEventListener('online', () => { if (!disposed) loadMarket(); });
window.addEventListener('offline', () => { connection('İnternet bağlantısı yok · fiyat güncel değil', 'error'); });
// Yalnızca ?debug=1 ile açılan, arayüzü etkilemeyen teşhis kancası.
if (new URLSearchParams(location.search).has('debug')) {
  window.__alfaDebug = { chart, candles, line, drawings, get history() { return history; }, get ready() { return $('connection').dataset.state === 'live'; } };
}
$('indicator-add').addEventListener('change', e => {
  const type = e.target.value;
  if (!type) return;
  try { indicators.add(type); localStorage.setItem('alfa-ind:v1:' + symbol, JSON.stringify(indicators.toJSON())); } catch {}
  e.target.value = '';
});
$('session-levels-toggle').addEventListener('click', () => {
  const on = $('session-levels-toggle').dataset.on !== '1';
  $('session-levels-toggle').dataset.on = on ? '1' : '0';
  $('session-levels-toggle').style.background = on ? '#2962ff' : '#151b26';
  sessionLevels.setEnabled(on);
});
$('market-structure-toggle').addEventListener('click', () => {
  const on = $('market-structure-toggle').dataset.on !== '1';
  $('market-structure-toggle').dataset.on = on ? '1' : '0';
  $('market-structure-toggle').style.background = on ? '#2962ff' : '#151b26';
  marketStructure.setEnabled(on);
});
loadMarket();
