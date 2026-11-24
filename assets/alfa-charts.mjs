import { createChart, CandlestickSeries, LineSeries, AreaSeries, BarSeries, HistogramSeries, ColorType, CrosshairMode, PriceScaleMode, TickMarkType } from './vendor/lightweight-charts-5.0.9/lightweight-charts.standalone.production.mjs';
import { TIMEFRAMES, isMarketSymbol, STREAM_ORIGINS, fetchHistory, streamURL, parseKline, mergeCandles, parseMarketRef, setMarketTokenProvider, fetchMarketQuotes } from './alfa-charts-data.mjs?v=12';
import { ALARM_SOUNDS, ALARM_CONDITIONS, ALARM_REPEATS, normalizeAlarmSettings, normalizeAlarm,
  shouldFire, markAlarmFired, alarmMessage, alarmConditionLabel, alarmPayload, alarmLevel, playAlarmSound, postAlarmWebhook,
  createPriceTracker, isAlarmMuted, muteAlarmIds, unmuteAlarmIds, recordAlarmTrigger } from './alfa-alerts.mjs?v=3';
import { DrawingEngine } from './alfa-drawings.mjs?v=15';
import { ChartWatchlist, formatMarketPrice } from './alfa-watchlist.mjs?v=7';
import { IndicatorManager, INDICATOR_CATALOG } from './alfa-indicators.mjs?v=5';
import { SessionLevelsManager } from './alfa-session-levels.mjs?v=5';
import { SessionBoxesManager } from './alfa-session-boxes.mjs?v=4';
import { MarketStructureManager } from './alfa-market-structure.mjs?v=2';
import { FvgManager } from './alfa-fvg.mjs?v=2';
import { ChartStudies, defaultStudyState } from './alfa-chart-studies.mjs?v=6';
import { icon, hydrateIcons, chartDialog, escapeHTML } from './alfa-chart-ui.mjs?v=3';
import { MtfManager } from './alfa-mtf.mjs?v=3';
import { ReplayEngine, candleCloseTime } from './alfa-replay-model.mjs?v=3';
import { replayRange } from './alfa-replay-data.mjs?v=2';
import { DrawingHistory, emptyDocument } from './alfa-drawings-model.mjs?v=7';
import { PublicStudiesManager } from './alfa-public-studies.mjs?v=3';
import { initMultiChart } from './alfa-multichart.mjs?v=5';
import { readEnvelope, createMessageGate, quantize } from './alfa-multichart-sync.mjs?v=2';
import { ChartSettingsStore, readSettingsConflict, preserveSettingsConflict } from './alfa-chart-settings-store.mjs?v=3';
import { readStudyBundle, resolveStudyBundle, writeStudyBundle } from './alfa-study-persistence.mjs?v=1';
import { PaperTradingPanel } from './alfa-paper.mjs?v=5';
import { ResearchPanel } from './alfa-research.mjs?v=4';
import { packetBars,validatePacket } from './alfa-research-model.mjs?v=2';
import { CHART_TIME_ZONES, normalizeChartTimeZone, chartTimeZoneKey, readChartTimeZone, writeChartTimeZone, createChartTimeFormatters } from './alfa-chart-time.mjs?v=1';

const $ = id => document.getElementById(id);
const AUTH_KEY = 'sb-fssrtlpjqbavzomynwmg-auth-token';
const LEGACY_AUTH_KEY = 'sb-zvnjslmptwmnuhftgqsr-auth-token';
const workspace = document.querySelector('.workspace');
const host = $('chart');
const search = new URLSearchParams(location.search);
const isEmbed = search.has('embed');
if (isEmbed) document.body.classList.add('embed-chart');
// Multi-chart panes are same-origin embedded charts. The parent is the only
// hub; panes never message each other directly.
const syncSession = search.get('mcid') || '';
const syncPaneId = Math.max(0, Math.min(1000000, Number(search.get('pane')) || 0));
const syncInstance = (() => {
  let token;
  try { token = crypto?.randomUUID?.(); } catch {}
  return `pane-${syncPaneId}-${token || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
})();
let syncApplyDepth = 0, syncReady = false, lastParentSeq = 0, parentInstance = '', lastAppliedSync = null, syncSuppressUntil = 0;
const syncTimers = new Map(), syncPending = new Map();
const syncGate = syncSession ? createMessageGate({
  session: syncSession, instance: syncInstance, paneId: syncPaneId,
  post: envelope => { try { window.parent.postMessage(envelope, location.origin); } catch {} }
}) : null;
hydrateIcons();
let studiesUI = null, watchlist = null, publicStudies = null, multiChart = null, pricePrecisionKey = '';
let pendingStudies = null, studyContext = null;
const alarmPriceTracker = createPriceTracker();
function setActiveSymbol(next) {
  if (!next) return false;
  // A watchlist row can match the hidden main chart but differ from the active pane.
  if (next === symbol) {
    if (multiChart?.state.open) multiChart.notifySymbol(next, interval);
    return false;
  }
  rememberStudies();
  alarmPriceTracker.reset(next);
  symbol = next;
  if (syncGate && syncReady && !syncApplyDepth) syncGate.send('symbol', { symbol: next });
  loadMarket();
  return true;
}
async function marketAccessToken() {
  try {
    const session = await cloudSettings.client?.auth.getSession();
    return session?.data?.session?.access_token || '';
  } catch { return ''; }
}
setMarketTokenProvider(marketAccessToken);
const priceFormat = { format: value => formatMarketPrice(value, watchlist?.info(symbol).precision) };
const chart = createChart(host, {
  layout: { background: { type: ColorType.Solid, color: '#10141c' }, textColor: '#8e9eb6', attributionLogo: false },
  grid: { vertLines: { color: '#1c243022' }, horzLines: { color: '#28334655' } },
  crosshair: { mode: CrosshairMode.Normal },
  rightPriceScale: { borderColor: '#30394b', scaleMargins: { top: 0.12, bottom: 0.22 } },
  timeScale: { borderColor: '#30394b', timeVisible: true, secondsVisible: false, rightOffset: 8 },
  handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
  handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
  localization: { locale: 'tr-TR' }
});
const candles = chart.addSeries(CandlestickSeries, {
  upColor: '#26c89c', downColor: '#ef6677', borderVisible: false, wickUpColor: '#26c89c', wickDownColor: '#ef6677'
});
const line = chart.addSeries(LineSeries, { color: '#8ea7ff', lineWidth: 2, visible: false });
const area = chart.addSeries(AreaSeries, {
  lineColor: '#8ea7ff', topColor: 'rgba(142,167,255,0.28)', bottomColor: 'rgba(142,167,255,0.02)', lineWidth: 2, visible: false
});
const bars = chart.addSeries(BarSeries, {
  upColor: '#26c89c', downColor: '#ef6677', thinBars: false, visible: false
});
const heikin = chart.addSeries(CandlestickSeries, {
  upColor: '#26c89c', downColor: '#ef6677', borderVisible: false, wickUpColor: '#26c89c', wickDownColor: '#ef6677', visible: false
});
function heikinData(barsArr) {
  const out = [];
  let prev = null;
  for (const c of (barsArr || [])) {
    const haClose = (c.open + c.high + c.low + c.close) / 4;
    const haOpen = prev ? (prev.open + prev.close) / 2 : (c.open + c.close) / 2;
    const haHigh = Math.max(c.high, haOpen, haClose);
    const haLow = Math.min(c.low, haOpen, haClose);
    const bar = { time: c.time, open: haOpen, high: haHigh, low: haLow, close: haClose };
    out.push(bar); prev = bar;
  }
  return out;
}
const volume = chart.addSeries(HistogramSeries, {
  priceFormat: { type: 'volume' },
  priceScaleId: 'vol',
  priceLineVisible: false,
  lastValueVisible: false,
});
chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
function volumeData(bars) {
  return (bars || []).map(c => ({
    time: c.time,
    value: Number(c.volume) || 0,
    color: withAlpha(c.close >= c.open ? palette.up : palette.down, .35)
  }));
}
function lineData(barsArr) { return (barsArr || []).map(c => ({ time: c.time, value: c.close })); }
function syncSeriesData(barsArr) {
  const d = barsArr || [];
  candles.setData(d);
  bars.setData(d);
  heikin.setData(heikinData(d));
  line.setData(lineData(d));
  area.setData(lineData(d));
  volume.setData(volumeData(d));
}
function syncSeriesUpdate(c, allBars) {
  const d = allBars || history;
  candles.update(c);
  bars.update(c);
  const hd = heikinData(d);
  const lastHa = hd[hd.length - 1];
  if (lastHa) heikin.update(lastHa);
  const lv = { time: c.time, value: c.close };
  line.update(lv); area.update(lv);
  volume.update(volumeData([c])[0]);
}
function activePriceSeries() {
  if (type === 'line') return line;
  if (type === 'area') return area;
  if (type === 'bars') return bars;
  if (type === 'heikin') return heikin;
  return candles;
}
function applyChartType(next) {
  type = ['candles','bars','line','area','heikin'].includes(next) ? next : 'candles';
  candles.applyOptions({ visible: type === 'candles' });
  bars.applyOptions({ visible: type === 'bars' });
  line.applyOptions({ visible: type === 'line' });
  area.applyOptions({ visible: type === 'area' });
  heikin.applyOptions({ visible: type === 'heikin' });
  const sel = $('chart-type');
  if (sel && sel.value !== type) sel.value = type;
}
let symbol = 'BTCUSDT', interval = '1h', type = 'candles';
let chartTimeZone = 'UTC', chartTimeFormats = createChartTimeFormatters('UTC');
let history = [], seriesBars = [], socket, aborter, retryTimer, pollTimer, watchdog, generation = 0, attempts = 0;
let lastReceipt = 0, disposed = false, loadingOlder = false;
const exhaustedHistoryEdges = new Set();
let olderRequest = null, historyNavigation = 0;
function requestOlderHistory() {
  if (!olderRequest) olderRequest = loadOlderHistory().finally(() => { olderRequest = null; });
  return olderRequest;
}
let replayMode = false, replayFull = [], replayIndex = 0, replayTimer = null, replaySpeed = 1;
let olderController = null;
let replayEngine = null, replayStartIndex = 0, liveDrawingState = null, replayMtfEnabled = false;
let replayRequest=null, replayBusy=false, replayPicking=false, replaySessionId=null;
// Reopened markets paint from a small in-memory cache while the live transport reconnects.
const marketHistoryCache = new Map();
const prefetchInFlight = new Set();
const HISTORY_CACHE_LIMIT = 16;
function historyCacheKey(cacheSymbol, cacheInterval) { return cacheSymbol + '|' + cacheInterval; }
function rememberHistory(cacheSymbol, cacheInterval, bars) {
  if (!bars?.length) return;
  const key = historyCacheKey(cacheSymbol, cacheInterval);
  marketHistoryCache.delete(key);
  // Keep the full backfilled tail so reopened markets restore deep history too.
  marketHistoryCache.set(key, { at: Date.now(), bars });
  while (marketHistoryCache.size > HISTORY_CACHE_LIMIT) marketHistoryCache.delete(marketHistoryCache.keys().next().value);
}
function cachedHistory(cacheSymbol, cacheInterval) { return marketHistoryCache.get(historyCacheKey(cacheSymbol, cacheInterval))?.bars || null; }
function isChartableRef(ref) { try { return parseMarketRef(ref).chartable; } catch { return false; } }
function prefetchMarket(ref, tf) {
  if (!isChartableRef(ref)) return;
  const key = historyCacheKey(ref, tf);
  if (marketHistoryCache.has(key) || prefetchInFlight.has(key)) return;
  prefetchInFlight.add(key);
  fetchHistory(ref, tf, AbortSignal.timeout(8000)).then(bars => {
    if (bars?.length) rememberHistory(ref, tf, bars);
  }).catch(() => {}).finally(() => prefetchInFlight.delete(key));
}
const observer = new ResizeObserver(([entry]) => {
  chart.resize(Math.floor(entry.contentRect.width), Math.floor(entry.contentRect.height));
});
observer.observe(host);

function withSyncApply(fn) { syncApplyDepth++; try { return fn(); } finally { syncApplyDepth--; } }
function visibleTimeRange() {
  try {
    const range = chart.timeScale().getVisibleRange();
    if (!range) return null;
    const from = Number(range.from), to = Number(range.to);
    return Number.isFinite(from) && Number.isFinite(to) ? { from, to } : null;
  } catch { return null; }
}
function applyRangePayload(payload) {
  if (!payload) return;
  const ts = chart.timeScale();
  try {
    if (payload.time) ts.setVisibleRange(payload.time);
    else if (payload.logical) ts.setVisibleLogicalRange(payload.logical);
  } catch {}
}
function applyCrosshairPayload(payload) {
  if (!payload) return;
  if (!payload.visible) { chart.clearCrosshairPosition(); return; }
  const ts = chart.timeScale();
  let x = null;
  try { if (payload.time != null) x = ts.timeToCoordinate(payload.time); } catch {}
  if (x == null) { try { if (payload.logical != null) x = ts.logicalToCoordinate(payload.logical); } catch {} }
  // Remote crosshairs carry chart-local pixels; only the time/logical anchor is
  // portable. Ignore anchors outside this pane and clamp the vertical position.
  if (x == null || x < 0 || x > host.clientWidth) { chart.clearCrosshairPosition(); return; }
  const rawY = Number.isFinite(payload.point?.y) ? payload.point.y : host.clientHeight / 2;
  const y = Math.max(0, Math.min(host.clientHeight, rawY));
  try { chart.setCrosshairPosition(x, y, activePriceSeries()); } catch {}
}
function clearSyncTimers() {
  for (const timer of syncTimers.values()) clearTimeout(timer);
  syncTimers.clear(); syncPending.clear();
}
function queueSync(type, payload, delay = 32) {
  if (!syncGate || !syncReady || syncApplyDepth || Date.now() < syncSuppressUntil) return;
  syncPending.set(type, payload);
  if (syncTimers.has(type)) return;
  syncTimers.set(type, setTimeout(() => {
    syncTimers.delete(type);
    if (syncApplyDepth || Date.now() < syncSuppressUntil) return;
    const next = syncPending.get(type); syncPending.delete(type);
    if (next) syncGate.send(type, next);
  }, delay));
}
function notifyMainSync(type, payload) {
  if (disposed || syncApplyDepth || !payload) return;
  try { multiChart?.syncFromMain?.(type, payload); } catch {}
}
function getMainSyncState() { return { range: visibleTimeRange() }; }
function reapplyLastSync() {
  if (!syncReady || !lastAppliedSync || replayMode) return;
  const { type, payload } = lastAppliedSync;
  withSyncApply(() => {
    if (type === 'range') applyRangePayload(payload);
    if (type === 'state') { applyRangePayload(payload.range); applyCrosshairPayload(payload.crosshair); }
    if (type === 'crosshair') applyCrosshairPayload(payload);
  });
}
function applyMainSync({ type, payload } = {}) {
  withSyncApply(() => {
    if (type === 'range') applyRangePayload(payload);
    if (type === 'crosshair') applyCrosshairPayload(payload);
  });
}
function onSyncMessage(event) {
  if (!syncGate || event.source !== window.parent || event.origin !== location.origin) return;
  const message = readEnvelope(event.data, {
    origin: event.origin, expectedOrigin: location.origin,
    allowedSources: new Set([window.parent]), source: event.source, session: syncSession
  });
  // Parent commands carry source paneId 0; pane-originated messages are never
  // routed directly to another pane.
  if (!message || (message.paneId !== 0 && message.paneId !== syncPaneId) || message.instance === syncInstance) return;
  if (message.instance !== parentInstance) { parentInstance = message.instance; lastParentSeq = 0; }
  if (message.seq <= lastParentSeq) return;
  lastParentSeq = message.seq;
  withSyncApply(() => {
    if (message.type === 'state' || message.type === 'symbol') {
      const raw = message.payload.symbol;
      if (raw && isMarketSymbol(raw)) {
        try {
          const ref = parseMarketRef(String(raw).toUpperCase()).key;
          if (ref !== symbol) setActiveSymbol(ref);
        } catch {}
      }
    }
    if (message.type === 'state' || message.type === 'interval') {
      const next = message.payload.interval;
      if (Object.values(TIMEFRAMES).includes(next) && next !== interval) {
        interval = next; loadMarket();
      }
    }
    if (message.type === 'state' || message.type === 'range') {
      applyRangePayload(message.type === 'range' ? message.payload : message.payload.range);
    }
    if (message.type === 'state' || message.type === 'crosshair') {
      applyCrosshairPayload(message.type === 'crosshair' ? message.payload : message.payload.crosshair);
    }
    lastAppliedSync = { type: message.type, payload: message.payload, at: Date.now() };
  });
  if (message.type === 'state') {
    syncReady = true;
    syncSuppressUntil = Date.now() + 150;
    syncPending.clear();
  }
}
window.addEventListener('message', onSyncMessage);

chart.timeScale().subscribeVisibleLogicalRangeChange(range => {
  if (range && range.from < 40 && !loadingOlder && history.length && !syncApplyDepth) requestOlderHistory();
  if (!syncApplyDepth && !replayMode && history.length && range) {
    const rangePayload = { logical: { from: quantize(range.from), to: quantize(range.to) }, time: visibleTimeRange() };
    notifyMainSync('range', rangePayload);
    queueSync('range', rangePayload, 48);
  }
});

function connection(text, state = 'waiting') {
  $('connection').textContent = text; $('connection').dataset.state = state;
}
function showMessage(text) { $('message').textContent = text; $('message').hidden = !text; }
function fmtVol(v) {
  const n = Number(v) || 0;
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K';
  return n.toFixed(2);
}
function showCandle(c) {
  if (!c) return;
  let d = c;
  if (type === 'heikin') {
    const hd = heikinData(history);
    d = hd.find(x => x.time === c.time) || c;
  }
  const ch = d.open ? ((d.close - d.open) / d.open) * 100 : 0;
  const sign = ch > 0 ? '+' : '';
  const ohlc = $('ohlc');
  ohlc.textContent = `O ${priceFormat.format(d.open)}  H ${priceFormat.format(d.high)}  L ${priceFormat.format(d.low)}  C ${priceFormat.format(d.close)}  ${sign}${ch.toFixed(2)}%  V ${fmtVol(c.volume)}`;
  ohlc.style.color = ch >= 0 ? '#26c89c' : '#ef6677';
}
async function loadOlderHistory() {
  if (replayMode) return;
  if (loadingOlder || disposed || history.length === 0) return;
  const edge = `${symbol}|${interval}|${history[0].time}`;
  if (exhaustedHistoryEdges.has(edge)) return;
  loadingOlder = true;
  const prevConn = $('connection').textContent;
  connection('Eski mumlar yükleniyor…', 'waiting');
  const requestGeneration = generation, requestSymbol = symbol, requestInterval = interval;
  const firstTime = history[0].time;
  const controller = new AbortController(); olderController = controller;
  try {
    const older = await fetchHistory(requestSymbol, requestInterval, controller.signal, fetch, firstTime * 1000 - 1);
    if (requestGeneration !== generation || replayMode || disposed) return;
    // Only strictly older bars may shift logical anchors. Overlapping/current
    // bars from an upstream page must not move the visible window.
    const newBars = older.filter(c => c.time < firstTime);
    if (!newBars.length) {
      exhaustedHistoryEdges.add(edge);
      if (exhaustedHistoryEdges.size > 200) exhaustedHistoryEdges.delete(exhaustedHistoryEdges.values().next().value);
      connection(prevConn || 'Canlı', 'live'); return;
    }
    const before = history.length;
    const merged = [...newBars, ...history];
    const deduped = [];
    const seen2 = new Set();
    for (const c of merged) { if (seen2.has(c.time)) continue; seen2.add(c.time); deduped.push(c); }
    deduped.sort((a, b) => a.time - b.time);
    const added = deduped.length - before;
    const range = chart.timeScale().getVisibleLogicalRange();
    history = deduped;
    seriesBars = deduped;
    rememberHistory(symbol, interval, history);
    syncSeriesData(history);
    if (range) withSyncApply(() => chart.timeScale().setVisibleLogicalRange({ from: range.from + added, to: range.to + added }));
    try { indicators.updateAll(history); } catch {}
    studiesUI?.updateValues();
    try { sessionLevels.render(); } catch {}
    try { marketStructure.render(); } catch {}
    try { fvg.render(); } catch {}
    try { mtf.render(); } catch {}
    quote();
    connection(prevConn || 'Canlı', $('connection').dataset.state === 'waiting' ? 'live' : $('connection').dataset.state);
  } catch (e) {
    if (e && e.name !== 'AbortError') { console.error('older history failed', e); connection(prevConn || 'Canlı', 'live'); }
  } finally {
    if (olderController === controller) { loadingOlder = false; olderController = null; }
  }
}
function applyReplaySlice() {
  const sliced = replayEngine.snapshot();
  replayIndex = sliced.length;
  history = sliced;
  seriesBars = sliced;
  sessionLevels.replayBoundary={clock:replayEngine.clock,step:candleCloseTime(0,interval)};
  syncSeriesData(history);
  try { indicators.updateAll(history); } catch {}
  studiesUI?.updateValues();
  try { sessionLevels.render(); } catch {}
  try { marketStructure.render(); } catch {}
  try { fvg.render(); } catch {}
  try { mtf.setReplayClock(replayEngine.clock); } catch {}
  quote();
  const info = $('replay-info');
  paper.update();
  const timeline = $('replay-timeline');
  if (timeline && replayEngine) {
    timeline.min = String(replayEngine.startIndex);
    timeline.max = String(replayEngine.length);
    timeline.value = String(replayIndex);
  }
  if (info) info.textContent = new Date(replayEngine.clock * 1000).toISOString() + ' · Confirmed';
  connection('REPLAY · yalnızca kapanmış mumlar', 'replay');
}
async function enterReplay({target,session=null,researchPacket=null}={}) {
  if (replayMode) return;
  if(replayBusy || !drawings.ready)return;
  if(session) {
    if(!isMarketSymbol(session.symbol) || !Object.values(TIMEFRAMES).includes(session.timeframe)){
      connection('Geçersiz kayıtlı replay','error');return;
    }
    symbol=session.symbol;interval=session.timeframe; target=session.startTime;
  }
  if(!Number.isFinite(target)){connection('Geçersiz replay tarihi','error');return;}
  const capturedOwner=currentUserKey();
  replayBusy=true; replayRequest?.abort(); replayRequest=new AbortController();
  const capturedGeneration=++generation; closeTransport();
  const seconds=candleCloseTime(0,interval);
  const offset=interval==='1w'?345600:0;
  const aligned=Math.floor((target-offset)/seconds)*seconds+offset;
  const warmup=Math.min(5000,Math.max(300,...indicators.items.flatMap(i=>Object.entries(i.params).filter(([k,v])=>typeof v==='number'&&/period|slow|fast|length/i.test(k)).map(([,v])=>v*3))));
  let data;
  try {
    const start=session?.dataStart ?? aligned-warmup*seconds;
    if(!Number.isFinite(start))throw new Error('Bu eski kayıt başlangıç verisi içermiyor');
    const end=session ? Math.max(session.currentTime,session.startTime) : aligned;
    connection('Replay geçmişi ve warm-up yükleniyor…');
    if(researchPacket?.coverage==='complete'){
      const packet=validatePacket(researchPacket);
      if(packet.replay.id!==session?.id)throw new Error('Research/replay ID mismatch');
      data=packetBars(packet).filter(b=>b.time>=start);
    }else data=await replayRange({symbol,timeframe:interval,start,end,signal:replayRequest.signal});
    if(capturedGeneration!==generation)return;
    if(currentUserKey()!==capturedOwner)throw new Error('Replay yüklenirken hesap değişti');
    await drawings.openMarket(symbol,true);
    if(capturedGeneration!==generation)return;
    if(currentUserKey()!==capturedOwner)throw new Error('Replay yüklenirken hesap değişti');
    if(session?.indicators) {
      if(!Array.isArray(session.indicators)||session.indicators.length>30)throw new Error('Geçersiz replay indikatör ayarları');
      indicators.fromJSON(session.indicators);
    }
    const engine=new ReplayEngine({symbol,timeframe:interval});
    if(session)engine.restore(data,session);else engine.load(data,aligned);
    replayEngine=engine;
    if(session?.drawings) new DrawingHistory(session.drawings); // validate before swapping live layer
  } catch(error) {
    if(capturedGeneration===generation){connection('Replay başlatılamadı: '+error.message,'error');connect(generation,false);}
    return;
  } finally {replayBusy=false;}
  replayFull = data;
  replayStartIndex=replayEngine.index;
  ++generation; closeTransport();
  liveDrawingState={context:drawings.context,history:drawings.history,histories:drawings.histories};
  drawings.histories=new Map();
  replaySessionId=session?.id||'replay-'+crypto.randomUUID();
  try{
    paper.start({sessionId:replaySessionId,symbol,exchange:'Binance',marketType:'spot',timeframe:interval},session?.paper);
    if(researchPacket){
      const parentStep=candleCloseTime(0,interval);
      const parentTimes=new Set(data.map(b=>b.time)),origin=data[0].time;
      for(const tf of Object.keys(researchPacket.priceData).filter(tf=>tf!==interval)){
        const subStep=candleCloseTime(0,tf),sub=packetBars(researchPacket,tf);
        if(subStep>=parentStep)continue;
        const groups=new Map();
        for(const b of sub){
          const start=origin+Math.floor((b.time-origin)/parentStep)*parentStep;
          if(parentTimes.has(start)){if(!groups.has(start))groups.set(start,[]);groups.get(start).push(b);}
        }
        for(const [time,window] of groups){
          if(window.length===parentStep/subStep){
            if(paper.lab.excursions.cache.size>=64)paper.lab.excursions.cache.delete(paper.lab.excursions.cache.keys().next().value);
            paper.lab.excursions.cache.set(symbol+':'+tf+':'+time,window);
          }
        }
      }
    }
  }catch(error){
    Object.assign(drawings,liveDrawingState);liveDrawingState=null;
    replayEngine=null;replayFull=[];paper.stop();
    connection('Paper oturumu açılamadı: '+error.message,'error');connect(generation,false);return;
  }
  drawings.context={owner:replaySessionId,symbol,remote:false,revision:0,doc:session?.drawings||emptyDocument()};
  drawings.history=new DrawingHistory(session?.drawings||emptyDocument()); drawings.selected=null;
  $('replay-speed').value=String([.5,1,2,5,10].includes(session?.speed)?session.speed:1);
  replayMtfEnabled=!!mtf.enabled;
  mtf.loadController?.abort(); mtf.htfData.clear(); mtf.clear();
  if(session?.mtfConfig)mtf.config={...mtf.defaultConfig(),...session.mtfConfig};
  if(session && typeof session.mtfEnabled==='boolean')mtf.enabled=session.mtfEnabled;
  replayMode = true;
  updateUI();
  document.body.classList.add('replay-mode');
  const bar = $('replay-bar');
  if (bar) bar.hidden = false;
  try { $('live').disabled = true; } catch {}
  applyReplaySlice();
  withSyncApply(() => chart.timeScale().setVisibleLogicalRange({from:Math.max(0,replayIndex-100),to:replayIndex+8}));
  drawings.refresh();
  if(aligned!==target)connection('REPLAY · en yakın mum açılışı '+new Date(aligned*1000).toISOString(),'replay');
}
function exitReplay() {
  if (!replayMode) return;
  if(!paper.canLeave())return;
  replayRequest?.abort(); replayBusy=false;
  if (replayTimer) { clearInterval(replayTimer); replayTimer = null; }
  replayMode = false;
  paper.stop();
  sessionLevels.replayBoundary=null;
  document.body.classList.remove('replay-mode');
  const bar = $('replay-bar');
  if (bar) bar.hidden = true;
  try { $('live').disabled = false; } catch {}
  history = replayFull;
  seriesBars = replayFull;
  syncSeriesData(history);
  try { indicators.updateAll(history); } catch {}
  try { sessionLevels.render(); } catch {}
  try { marketStructure.render(); } catch {}
  try { fvg.render(); } catch {}
  try { mtf.render(); } catch {}
  quote();
  replayFull = [];
  if (liveDrawingState) {
    Object.assign(drawings,liveDrawingState); liveDrawingState=null;
    drawings.selected=null; drawings.refresh();
  }
  mtf.setReplayClock(null); mtf.setEnabled(replayMtfEnabled);
  replayEngine=null;
  loadMarket();
}
async function stepReplay(delta) {
  if (!replayMode) return;
  pauseReplay();
  if(replayBusy)return;
  if(delta>0 && replayEngine.exhausted) {
    replayBusy=true;
    const engine=replayEngine, request=new AbortController(); replayRequest=request;
    try {
      connection('Replay veri bloğu yükleniyor · duraklatıldı','replay');
      const next=candleCloseTime(engine.lastTime,interval);
      const bars=await fetchHistory(symbol,interval,request.signal,fetch,Date.now()-1,next*1000);
      if(engine!==replayEngine || !replayMode)return;
      engine.now=Date.now()/1000;
      const count=engine.append(bars);
      if(!count){connection('Son kapanmış muma ulaşıldı · Durdur ile canlıya dönün','replay');return;}
    }catch(error){if(replayMode)connection('Replay duraklatıldı: '+error.message,'error');return;}
    finally{replayBusy=false;}
  }
  try { replayEngine.step(delta); applyReplaySlice(); }
  catch(error) { connection(error.message,'error'); }
}
function playReplay() {
  if (!replayMode || replayTimer || replayBusy) return;
  const speed = Number($('replay-speed').value) || 1;
  const intervalMs = Math.max(50, 1000 / speed);
  replayTimer = setInterval(() => {
    if (replayEngine.exhausted) { pauseReplay(); stepReplay(1); return; }
    try { replayEngine.step(1); applyReplaySlice(); }
    catch(error) { pauseReplay(); connection(error.message,'error'); }
  }, intervalMs);
}
function pauseReplay() {
  if (replayTimer) { clearInterval(replayTimer); replayTimer = null; }
}
function restartReplay() {
  if (!replayMode || replayBusy) return;
  pauseReplay(); replayEngine.restart();
  applyReplaySlice();
}
function quote() {
  const c = history.at(-1);
  if (!c) return;
  $('last-price').textContent = priceFormat.format(c.close);
  let market = null;
  try { market = parseMarketRef(symbol); } catch {}
  const info = watchlist?.info(symbol) || market;
  $('quote-symbol').textContent = info?.quote ? info.base + ' / ' + info.quote : symbol;
  $('quote-symbol').title = market?.label || info?.label || symbol;
  const precision = info?.precision ?? (c.close < 1 ? Math.min(10, Math.max(4, -Math.floor(Math.log10(c.close)) + 3)) : 2);
  const precisionKey = symbol + ':' + precision;
  if (pricePrecisionKey !== precisionKey) {
    for (const s of [candles, bars, heikin, line, area]) s.applyOptions({ priceFormat: { type: 'price', precision, minMove: 10 ** -precision } });
    pricePrecisionKey = precisionKey;
  }
  const live = market && !market.chartable ? watchlist?.quotes.get(symbol) : null;
  const change = live && Number.isFinite(live.change) ? live.change : c.open ? (c.close - c.open) / c.open * 100 : 0;
  $('quote-change').textContent = `${change >= 0 ? '+' : ''}${change.toFixed(2)}% · ${live ? 'canlı değer' : 'son mum'}`;
  $('quote-change').style.color = change >= 0 ? '#26c89c' : '#ef6677';
  if (!replayMode) watchlist?.updateQuote(symbol, c.close);
  updateQuoteTime();
  showCandle(c);
}
function updateQuoteTime() {
  const c = history.at(-1);
  if (c) $('price-time').textContent = `Mum: ${chartTimeFormats.dateTime(c.time)} · ${CHART_TIME_ZONES[chartTimeZone]}`;
}
function setData(data, resetView) {
  history = data;
  seriesBars = data;
  if (isChartableRef(symbol)) rememberHistory(symbol, interval, history);
  syncSeriesData(history);
  if (resetView) {
    withSyncApply(() => chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, history.length - 130), to: history.length + 8 }));
  }
  // A pane can receive parent state before its first candles arrive. Restore the
  // last accepted remote view after the data is in place so sync survives boot.
  reapplyLastSync();
  quote();
  if (pendingStudies) { try { applyStudiesBundle(pendingStudies, studyContext?.owner || currentUserKey(), symbol); } catch {} pendingStudies = null; }
  else { try { indicators.updateAll(history); } catch {} }
  studiesUI?.updateValues();
  try { sessionLevels.render(); } catch {}
  try { marketStructure.render(); } catch {}
  try { fvg.render(); } catch {}
  try { publicStudies?.updateBars(); } catch {}
}
chart.subscribeCrosshairMove(param => {
  studiesUI?.updateValues(param.time != null ? param : null);
  const bar = param.seriesData.get(activePriceSeries());
  if (!bar || !param.time) {
    showCandle(history.at(-1));
    queueSync('crosshair', { visible: false });
    notifyMainSync('crosshair', { visible: false });
    return;
  }
  showCandle(history.find(c => c.time === param.time));
  const time = Number(param.time);
  if (!Number.isFinite(time)) return;
  const payload = {
    visible: true, time,
    logical: Number.isFinite(param.logical) ? quantize(param.logical) : null,
    point: param.point ? { x: Math.round(param.point.x), y: Math.round(param.point.y) } : null
  };
  queueSync('crosshair', payload, 24);
  notifyMainSync('crosshair', payload);
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
  olderController?.abort(); olderController = null; loadingOlder = false;
  clearTimeout(retryTimer); clearInterval(pollTimer); clearInterval(watchdog);
  pollTimer = null;
  aborter?.abort();
  if (socket) { socket.onclose = socket.onmessage = socket.onopen = socket.onerror = null; socket.close(); socket = null; }
}
function updateUI() {
  $('symbol').value = symbol;
  const label = Object.keys(TIMEFRAMES).find(key => TIMEFRAMES[key] === interval);
  let market = null;
  try { market = parseMarketRef(symbol); } catch {}
  const name = market && market.venue === 'BINANCE' && market.marketType === 'spot' && market.key === symbol ? symbol : market?.label || symbol;
  $('market-title').textContent = `${name} · ${label}`;
  $('market-title').title = market?.label || symbol;
  const dataInfo = $('data-info');
  if (dataInfo) dataInfo.textContent = `Kaynak: ${market?.venue || 'BINANCE'} · ${market?.marketType === 'perp' ? 'Vadeli' : market?.marketType === 'index' ? 'Endeks' : 'Spot'} · Zaman: ${CHART_TIME_ZONES[chartTimeZone]}`;
  document.querySelectorAll('#timeframes button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.interval === interval)));
  document.querySelectorAll('.watch-row').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.symbol === symbol)));
  try {
    const url = new URL(location.href);
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('interval', interval);
    window.history.replaceState(null, '', url);
  } catch {}
}
async function loadMarket() {
  rememberStudies();
  if(replayMode&&!paper.canLeave()){
    symbol=paper.context.symbol;interval=paper.context.timeframe;updateUI();return;
  }
  if (replayMode) {
    pauseReplay(); replayMode=false; replayEngine=null;
    paper.stop();
    sessionLevels.replayBoundary=null;
    mtf.replayClock=null; mtf.loadController?.abort(); mtf.htfData.clear(); mtf.clear();
    $('replay-bar').hidden=true;
    document.body.classList.remove('replay-mode'); $('live').disabled=false;
    if(liveDrawingState){Object.assign(drawings,liveDrawingState);liveDrawingState=null;}
  }
  const id = ++generation;
  if (isChartableRef(symbol)) rememberHistory(symbol, interval, history);
  closeTransport(); attempts = 0;
  const cached = cachedHistory(symbol, interval);
  history = []; seriesBars = [];
  if (!cached) {
    // Keep the previous chart painted until the first new candle arrives.
    $('last-price').textContent = '—'; $('price-time').textContent = 'Henüz veri yok';
    const ohlc = $('ohlc'); ohlc.textContent = 'Gerçek piyasa verisi bekleniyor'; ohlc.style.color = '';
  }
  updateUI();
  try { multiChart?.notifySymbol(symbol, interval); } catch {}
  if (syncGate && syncReady && !syncApplyDepth) syncGate.send('interval', { interval });
  try { publicStudies?.setContext(symbol, interval); } catch {}
  drawings.openMarket(symbol);
  try { mtf.setSymbol(symbol); } catch {}
  try { indicators.clear(); } catch {}
  try { pendingStudies = loadStudiesFor(currentUserKey(), symbol); } catch { pendingStudies = null; }
  showMessage('');
  if (cached) {
    setData(cached.map(c => ({ ...c })), true);
    connection('Önbellekten açıldı · canlı veri yenileniyor', 'waiting');
  } else {
    connection('Piyasa bağlantısı kuruluyor', 'waiting');
  }
  connect(id, !cached);
}
function connectPolling(id, resetView, ref) {
  const controller = new AbortController(); aborter = controller;
  const quoteOnly = !ref.chartable;
  let ready = false, ended = false;
  lastReceipt = Date.now();
  const requestSignal = () => AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]);
  connection(quoteOnly ? 'Canlı değer · mum geçmişi yok' : `${ref.venue} bağlantısı kuruluyor`, 'waiting');
  showMessage('');
  async function tick() {
    if (ended || id !== generation || disposed || replayMode || controller.signal.aborted) return;
    try {
      const data = await fetchHistory(symbol, interval, requestSignal());
      if (ended || id !== generation || disposed || replayMode || controller.signal.aborted) return;
      if (!data.length) throw new Error('Piyasa verisi boş');
      let quoteData = null;
      if (quoteOnly) {
        const quotes = await fetchMarketQuotes([symbol], requestSignal());
        quoteData = quotes[symbol];
        if (quoteData && watchlist) watchlist.quotes.set(symbol, quoteData);
      }
      if (!ready) {
        setData(data, resetView);
        ready = true;
      } else {
        history = mergeCandles(history, data, Infinity);
        seriesBars = history;
        if (isChartableRef(symbol)) rememberHistory(symbol, interval, history);
        syncSeriesData(history);
        quote();
        try { indicators.updateAll(seriesBars); } catch {}
        studiesUI?.updateValues();
        try { sessionLevels.render(); } catch {}
        try { marketStructure.render(); } catch {}
        try { fvg.render(); } catch {}
      }
      attempts = 0;
      lastReceipt = Date.now();
      showMessage(quoteOnly ? 'Mum geçmişi yok · yalnızca canlı değer gösterilir.' : '');
      connection(`Canlı · ${new Date(lastReceipt).toLocaleTimeString('tr-TR')} · ${quoteOnly ? 'canlı değer · mum geçmişi yok' : ref.venue}`, 'live');
      if (quoteData && Number.isFinite(quoteData.price)) {
        $('last-price').textContent = priceFormat.format(quoteData.price);
        const change = Number(quoteData.change) || 0;
        $('quote-change').textContent = `${change >= 0 ? '+' : ''}${change.toFixed(2)}% · canlı değer`;
        $('quote-change').style.color = change >= 0 ? '#26c89c' : '#ef6677';
      }
      try { checkAlarms(history.at(-1)?.close); } catch {}
    } catch (error) {
      if (ended || id !== generation || disposed || controller.signal.aborted) return;
      attempts++;
      connection(`${error.message || 'Veri alınamadı'} · yeniden denenecek`, 'error');
      if (quoteOnly && !history.length) showMessage('Canlı değer alınamadı · yeniden deneniyor');
    }
  }
  tick();
  pollTimer = setInterval(tick, quoteOnly ? 60000 : 30000);
}
function connect(id, resetView = false) {
  if (id !== generation || disposed) return;
  let ref;
  try { ref = parseMarketRef(symbol); }
  catch (error) { connection(error.message || 'Geçersiz sembol', 'error'); return; }
  if (ref.feed !== 'binance') return connectPolling(id, resetView, ref);
  const controller = new AbortController(); aborter = controller;
  const timeout = setTimeout(() => controller.abort(), 15000);
  let buffered = [], ready = false, ended = false;
  const url = streamURL(STREAM_ORIGINS[attempts % STREAM_ORIGINS.length], ref.feedSymbol, interval);
  const ws = new WebSocket(url); socket = ws;
  lastReceipt = Date.now();
  function reconnect(reason) {
    if (ended || id !== generation || disposed) return;
    ended = true;
    clearTimeout(timeout); clearInterval(watchdog); controller.abort();
    ws.onclose = ws.onmessage = ws.onerror = ws.onopen = null; ws.close();
    attempts++;
    connection(`${reason} · yeniden bağlanılıyor`, 'error');
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
      setData(mergeCandles(history, [...data, ...buffered], Infinity), resetView);
      buffered = []; ready = true;
      showMessage('');
      connection('Canlı · geçmiş eşitlendi', 'live');
    } catch (error) {
      if (id === generation && !ended) reconnect('Geçmiş veri alınamadı');
    }
  };
  ws.onmessage = event => {
    if (replayMode) return;
    if (id !== generation || ended) return;
    try {
      const c = parseKline(event.data, ref.feedSymbol, interval);
      if (!c) return;
      lastReceipt = Date.now();
      if (!ready) { buffered.push(c); if (buffered.length > 2000) buffered.shift(); return; }
      if (c.time < history.at(-1).time) return;
      history = mergeCandles(history, [c], Infinity);
      seriesBars = history;
      rememberHistory(symbol, interval, history);
      syncSeriesUpdate(c, history);
      quote(); attempts = 0;
      try { checkAlarms(c.close); } catch {}
      try { indicators.updateAll(seriesBars); } catch {}
      studiesUI?.updateValues();
      try { sessionLevels.render(); } catch {}
      try { marketStructure.render(); } catch {}
      try { fvg.render(); } catch {}
      connection(`Canlı · ${new Date(lastReceipt).toLocaleTimeString('tr-TR')} · WebSocket`, 'live');
    } catch { reconnect('Veri doğrulanamadı'); }
  };
  ws.onclose = () => reconnect('WebSocket kesildi');
  ws.onerror = () => reconnect('WebSocket erişilemiyor');
  watchdog = setInterval(() => { if (Date.now() - lastReceipt > 60000) reconnect('Canlı veri gecikti'); }, 10000);
}
(() => {
  try {
    const p = new URLSearchParams(location.search);
    const s = String(p.get('symbol') || '').toUpperCase();
    const tf = String(p.get('interval') || p.get('tf') || '').toLowerCase();
    if (isMarketSymbol(s)) symbol = parseMarketRef(s).key;
    if (Object.values(TIMEFRAMES).includes(tf)) interval = tf;
  } catch {}
})();
const TF_FAV_KEY = 'alfa-tf-fav:v1';
const DEFAULT_TF_FAVS = ['1m','5m','15m','30m','1h','4h','1d','1w'];
function loadTfFavs() {
  try { const v = JSON.parse(localStorage.getItem(TF_FAV_KEY) || 'null'); if (Array.isArray(v) && v.length) return v.filter(x => Object.values(TIMEFRAMES).includes(x)); } catch {}
  return [...DEFAULT_TF_FAVS];
}
function saveTfFavs(favs) { try { localStorage.setItem(TF_FAV_KEY, JSON.stringify(favs)); } catch {} }
let tfFavs = loadTfFavs();
function tfLabel(value) { return Object.keys(TIMEFRAMES).find(k => TIMEFRAMES[k] === value) || value.toUpperCase(); }
function renderTimeframes() {
  const wrap = $('timeframes'); wrap.innerHTML = '';
  const all = Object.values(TIMEFRAMES);
  const show = all.filter(v => tfFavs.includes(v));
  for (const v of show) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = tfLabel(v);
    b.dataset.interval = v; b.setAttribute('aria-pressed', String(v === interval));
    b.addEventListener('click', () => { if (interval !== v) { interval = v; loadMarket(); } });
    b.addEventListener('contextmenu', e => { e.preventDefault(); toggleTfFav(v); });
    b.title = 'Sağ tık: favorilerden çıkar/ekle';
    wrap.append(b);
  }
   const more = document.createElement('button'); more.type = 'button'; more.innerHTML = icon('down'); more.title = 'Zaman dilimleri ve favoriler'; more.setAttribute('aria-label', 'Zaman dilimleri ve favoriler');
  more.addEventListener('click', openTfPicker);
  wrap.append(more);
}
function toggleTfFav(value) {
  if (tfFavs.includes(value)) { if (tfFavs.length > 1) tfFavs = tfFavs.filter(v => v !== value); }
  else tfFavs.push(value);
  tfFavs = Object.values(TIMEFRAMES).filter(v => tfFavs.includes(v));
  saveTfFavs(tfFavs); renderTimeframes();
}
function openTfPicker() {
  const all = Object.entries(TIMEFRAMES);
  const rows = all.map(([label, value]) => {
    const on = tfFavs.includes(value);
    return `<label style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #242f42;"><input type="checkbox" data-tf="${value}" ${on?'checked':''}> <span style="min-width:48px;font-weight:600">${label}</span><span style="color:#8e9eb6">${value}</span></label>`;
  }).join('');
  const m = openModal(`<h3 style="margin:0 0 8px;">Zaman Dilimleri</h3><div style="color:#8e9eb6;font-size:12px;margin-bottom:10px;">Favorilere eklediklerin araç çubuğunda görünür. Sağ tıkla da hızlı çıkar/ekle.</div><div>${rows}</div><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;"><button id="tf-close" style="padding:8px 12px;border-radius:8px;border:1px solid #30394b;background:#151b26;color:#d7e0ee;">Kapat</button></div>`);
  m.box.querySelectorAll('input[data-tf]').forEach(cb => cb.addEventListener('change', () => {
    const v = cb.dataset.tf;
    if (cb.checked) { if (!tfFavs.includes(v)) tfFavs.push(v); }
    else if (tfFavs.length > 1) tfFavs = tfFavs.filter(x => x !== v);
    tfFavs = Object.values(TIMEFRAMES).filter(x => tfFavs.includes(x));
    saveTfFavs(tfFavs); renderTimeframes(); updateUI();
  }));
  m.box.querySelector('#tf-close').addEventListener('click', m.close);
}
renderTimeframes();
watchlist = new ChartWatchlist({ getOwner: currentUserKey, getSelected: () => symbol,
  onSelect: next => setActiveSymbol(next),
  onHover: ref => prefetchMarket(ref, interval),
  getAccessToken: marketAccessToken,
  getLegacyCloud: owner => { try { return cloudSettings?.legacyWatchlist(owner) || null; } catch { return null; } },
  onStatus: connection });
$('chart-type').addEventListener('change', e => { applyChartType(e.target.value); saveLayout(); });
let logScale = false;
let autoScale = true;
const DEFAULT_VIEW_CONFIG = { grid: true, axisLabels: false, clean: false };
let viewConfig = { ...DEFAULT_VIEW_CONFIG };
try {
  const raw = JSON.parse(localStorage.getItem('alfa-chart-view:v1') || 'null');
  for (const k of Object.keys(viewConfig)) if (typeof raw?.[k] === 'boolean') viewConfig[k] = raw[k];
} catch {}
// Candle / grid / background colours are chart-level preferences, not drawings.
const DEFAULT_PALETTE = Object.freeze({
  up: '#26c89c', down: '#ef6677', wickUp: '#26c89c', wickDown: '#ef6677', border: '#ef6677',
  borderVisible: false, background: '#10141c', text: '#8e9eb6', gridVert: '#1c243022', gridHorz: '#28334655'
});
const PALETTE_COLORS = Object.keys(DEFAULT_PALETTE).filter(k => k !== 'borderVisible');
const HEX = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;
let palette = { ...DEFAULT_PALETTE };
try {
  const raw = JSON.parse(localStorage.getItem('alfa-chart-palette:v1') || 'null');
  for (const k of PALETTE_COLORS) if (HEX.test(raw?.[k])) palette[k] = raw[k];
  if (typeof raw?.borderVisible === 'boolean') palette.borderVisible = raw.borderVisible;
} catch {}
function withAlpha(hex, alpha) {
  const h = String(hex).replace('#', '');
  if (h.length !== 6) return hex;
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${alpha})`;
}
function applyPalette() {
  const seriesOptions = { upColor: palette.up, downColor: palette.down, wickUpColor: palette.wickUp,
    wickDownColor: palette.wickDown, borderVisible: palette.borderVisible,
    borderUpColor: palette.border, borderDownColor: palette.border, wickColor: palette.wickUp };
  candles.applyOptions(seriesOptions); heikin.applyOptions(seriesOptions);
  bars.applyOptions({ upColor: palette.up, downColor: palette.down });
  chart.applyOptions({
    layout: { background: { type: ColorType.Solid, color: palette.background }, textColor: palette.text },
    grid: { vertLines: { color: palette.gridVert, visible: viewConfig.grid }, horzLines: { color: palette.gridHorz, visible: viewConfig.grid } }
  });
  host.style.background = palette.background;
  if (history?.length) volume.setData(volumeData(history));
}
function persistPalette() { try { localStorage.setItem('alfa-chart-palette:v1', JSON.stringify(palette)); } catch {} }
function paletteFields() {
  const labels = { up: 'Yükselen mum', down: 'Düşen mum', wickUp: 'Yükselen fitil', wickDown: 'Düşen fitil', border: 'Mum kenarı',
    background: 'Grafik zemini', text: 'Eksen metni', gridVert: 'Dikey ızgara', gridHorz: 'Yatay ızgara' };
  return `<div class="setting-grid palette-grid">${Object.entries(labels).map(([key, label]) => {
    // Native color inputs cannot hold an alpha channel; grid colours keep 8-digit hex.
    const alpha = key === 'gridVert' || key === 'gridHorz';
    return `<label>${label}<input type="${alpha ? 'text' : 'color'}" name="${key}" value="${escapeHTML(palette[key])}" ${alpha ? 'maxlength="9" pattern="#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?"' : ''}></label>`;
  }).join('')}</div>
    <label><input type="checkbox" name="borderVisible" ${palette.borderVisible ? 'checked' : ''}> Mum kenarlığını göster</label>`;
}
function applyPaletteForm(data) {
  for (const key of PALETTE_COLORS) if (HEX.test(String(data.get(key) || ''))) palette[key] = String(data.get(key));
  palette.borderVisible = data.has('borderVisible');
  applyPalette(); persistPalette(); saveLayout();
}
function resetPalette() { palette = { ...DEFAULT_PALETTE }; applyPalette(); persistPalette(); }
function setLogScale(next, persist = true) {
  logScale = !!next;
  chart.priceScale('right').applyOptions({ mode: logScale ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal });
  const button = $('log-scale');
  if (button) { button.setAttribute('aria-pressed', String(logScale)); button.textContent = logScale ? 'Log✓' : 'Log'; }
  if (persist) saveLayout();
}
function setAutoScale(next = true, persist = true) {
  autoScale = !!next;
  chart.priceScale('right').applyOptions({ autoScale });
  const button = $('auto-scale');
  if (button) {
    button.setAttribute('aria-pressed', String(autoScale));
    button.textContent = autoScale ? 'Oto✓' : 'Oto';
  }
  if (persist) saveLayout();
}
$('log-scale').addEventListener('click', () => setLogScale(!logScale));
$('auto-scale').addEventListener('click', () => setAutoScale(!autoScale));
async function buildChartScreenshotCanvas() {
  const src = chart.takeScreenshot();
  if (!src) throw new Error('no-screenshot');
  const canvas = document.createElement('canvas');
  canvas.width = src.width;
  canvas.height = src.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(src, 0, 0);

  const svg = host.querySelector('svg.drawing-overlay');
  if (svg) {
    const rect = svg.getBoundingClientRect();
    const cssW = rect.width || host.clientWidth || src.width;
    const cssH = rect.height || host.clientHeight || src.height;
    const clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    clone.setAttribute('width', String(src.width));
    clone.setAttribute('height', String(src.height));
    if (!clone.getAttribute('viewBox')) {
      clone.setAttribute('viewBox', `0 0 ${cssW} ${cssH}`);
      clone.setAttribute('preserveAspectRatio', 'none');
    }
    const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    try {
      const img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = url;
      });
      ctx.drawImage(img, 0, 0, src.width, src.height);
    } catch {}
    finally { URL.revokeObjectURL(url); }
  }

  return canvas;
}

function chartScreenshotName() {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
  return `chart-${String(symbol).toLowerCase()}-${String(interval).toLowerCase()}-${stamp}.png`;
}

async function downloadChartScreenshot() {
  const canvas = await buildChartScreenshotCanvas();
  const name = chartScreenshotName();
  const link = document.createElement('a');
  link.download = name;
  if (canvas.toBlob) {
    await new Promise(resolve => canvas.toBlob(blob => {
      if (!blob) { link.href = canvas.toDataURL('image/png'); link.click(); resolve(); return; }
      const url = URL.createObjectURL(blob);
      link.href = url; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      resolve();
    }, 'image/png'));
  } else {
    link.href = canvas.toDataURL('image/png');
    link.click();
  }
  connection('Grafik görüntüsü indirildi', 'ok');
}

async function copyChartScreenshot() {
  const canvas = await buildChartScreenshotCanvas();
  const blob = await new Promise(resolve => canvas.toBlob ? canvas.toBlob(resolve, 'image/png') : resolve(null));
  if (!blob) throw new Error('no-blob');
  if (navigator.clipboard && window.ClipboardItem) {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    connection('Grafik görüntüsü kopyalandı', 'ok');
    return;
  }
  // fallback: copy data url as text not ideal; inform user
  throw new Error('clipboard-image-unavailable');
}

async function copyChartLink() {
  const url = new URL('/alfa-charts.html', location.origin);
  url.searchParams.set('symbol', symbol);
  url.searchParams.set('interval', interval);
  const text = url.toString();
  if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
  else {
    const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
  }
  connection('Grafik bağlantısı kopyalandı', 'ok');
}

function closeShotMenu() { const m = $('shot-menu'); if (m) m.hidden = true; }
function toggleShotMenu() { const m = $('shot-menu'); if (m) m.hidden = !m.hidden; }

$('screenshot').addEventListener('click', e => { e.stopPropagation(); toggleShotMenu(); });
$('shot-menu').addEventListener('click', async e => {
  const btn = e.target.closest('[data-shot]');
  if (!btn) return;
  e.stopPropagation();
  closeShotMenu();
  const action = btn.dataset.shot;
  const shotBtn = $('screenshot');
  if (shotBtn) shotBtn.disabled = true;
  try {
    if (action === 'download') await downloadChartScreenshot();
    else if (action === 'copy-image') await copyChartScreenshot();
    else if (action === 'copy-link') await copyChartLink();
  } catch (err) {
    console.error(err);
    if (action === 'copy-image') connection('Görüntü kopyalanamadı (tarayıcı izin vermiyor olabilir)', 'error');
    else if (action === 'copy-link') connection('Bağlantı kopyalanamadı', 'error');
    else connection('Grafik görüntüsü alınamadı', 'error');
  } finally {
    if (shotBtn) shotBtn.disabled = false;
  }
});
document.addEventListener('click', e => { if (!e.target.closest('.shot-wrap')) closeShotMenu(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeShotMenu(); });
$('reset-view').addEventListener('click', () => handleChartAction('reset-view'));
$('chart-settings').addEventListener('click', () => handleChartAction('settings'));
$('chart-timezone').addEventListener('click', openChartTimeZone);
$('fit').addEventListener('click', () => handleChartAction('fit'));
$('live').addEventListener('click', () => handleChartAction('realtime'));
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
document.addEventListener('fullscreenchange', () => { $('fullscreen').innerHTML = icon('fullscreen') + (document.fullscreenElement ? 'Tam ekrandan çık' : 'Tam ekran'); });
const drawings = new DrawingEngine({ chart, series: candles, host, getBars: () => seriesBars, getInterval: () => interval,
  onAlarm: (price, cond) => addQuickAlarm(price, cond), onAlarmManager: () => openAlarmManager(),
  onChartAction: action => handleChartAction(action),
  getChartMenuState: () => ({ ...viewConfig, logScale, fullscreen: !!document.fullscreenElement }),
  getStudies: () => studiesUI });
try {
  const magOn = localStorage.getItem('alfa-magnet:v1') === '1';
  drawings.setMagnet(magOn);
  const mb = $('magnet-toggle'); if (mb) mb.setAttribute('aria-pressed', String(magOn));
  const vis = localStorage.getItem('alfa-drawings-visible:v1') !== '0';
  drawings.setDrawingsVisible(vis);
  const vb = $('drawings-toggle'); if (vb) { vb.setAttribute('aria-pressed', String(vis)); vb.innerHTML = icon(vis ? 'eye' : 'eyeOff'); }
} catch {}
$('magnet-toggle').addEventListener('click', () => {
  const on = !drawings.magnet;
  drawings.setMagnet(on);
  $('magnet-toggle').setAttribute('aria-pressed', String(on));
  try { localStorage.setItem('alfa-magnet:v1', on ? '1' : '0'); } catch {}
});
$('drawings-toggle').addEventListener('click', () => {
  const on = !drawings.drawingsVisible;
  drawings.setDrawingsVisible(on);
  const vb = $('drawings-toggle');
  vb.setAttribute('aria-pressed', String(on));
  vb.innerHTML = icon(on ? 'eye' : 'eyeOff');
  drawings.refresh();
});
// ---------- Price alarms (local-first + optional browser/Telegram/webhook delivery) ----------
const ALARM_KEY = () => 'alfa-alarms:v1:' + currentUserKey();
const ALARM_MUTED_KEY = () => 'alfa-alarms:muted:v1:' + currentUserKey();
const ALARM_HISTORY_KEY = () => 'alfa-alarms:history:v1:' + currentUserKey();
const ALARM_SETTINGS_KEY = () => 'alfa-alarm-settings:v1:' + currentUserKey();
function loadAlarms() {
  try {
    const rows = JSON.parse(localStorage.getItem(ALARM_KEY()) || '[]');
    return Array.isArray(rows) ? rows.map(r => normalizeAlarm(r, r?.symbol || symbol, r?.price)).filter(a => a.symbol) : [];
  } catch { return []; }
}
function saveAlarms(list) { try { localStorage.setItem(ALARM_KEY(), JSON.stringify(list)); } catch {} }
function loadMuted() { try { const r = JSON.parse(localStorage.getItem(ALARM_MUTED_KEY()) || '[]'); return Array.isArray(r) ? r.map(String) : []; } catch { return []; } }
function saveMuted(list) { try { localStorage.setItem(ALARM_MUTED_KEY(), JSON.stringify(list)); } catch {} }
function loadAlarmHistory() { try { const r = JSON.parse(localStorage.getItem(ALARM_HISTORY_KEY()) || '[]'); return Array.isArray(r) ? r : []; } catch { return []; } }
function saveAlarmHistory(list) { try { localStorage.setItem(ALARM_HISTORY_KEY(), JSON.stringify(list)); } catch {} }
function loadAlarmSettings() {
  try { return normalizeAlarmSettings(JSON.parse(localStorage.getItem(ALARM_SETTINGS_KEY()) || 'null') || {}); }
  catch { return normalizeAlarmSettings({}); }
}
function saveAlarmSettings(settings) {
  const next = normalizeAlarmSettings(settings);
  try { localStorage.setItem(ALARM_SETTINGS_KEY(), JSON.stringify(next)); } catch {}
  return next;
}
let alarms = null;
function ensureAlarms() { if (!alarms) alarms = loadAlarms(); return alarms; }
async function sendAlarmTelegram(chatId, message) {
  const token = await marketAccessToken();
  if (!token) { connection('Telegram alarmı için giriş gerekli', 'error'); return; }
  try {
    const response = await fetch('/api/access', { method: 'POST', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ op: 'chart-alarm-telegram', chatId, text: message }) });
    if (!response.ok) connection('Telegram alarmı gönderilemedi', 'error');
  } catch { connection('Telegram alarmına ulaşılamadı', 'error'); }
}
async function fireAlarm(a, price) {
  markAlarmFired(a, price); saveAlarms(alarms);
  const msg = alarmMessage(a, price, priceFormat.format);
  const history = recordAlarmTrigger(loadAlarmHistory(), { id: a.id, symbol: a.symbol, price, level: alarmLevel(a), message: msg, at: new Date().toISOString() });
  saveAlarmHistory(history);
  connection(`🔔 ${a.repeat === 'once' ? '' : `#${a.count} `}Alarm: ${msg}`, 'ok');
  try { if (Notification.permission === 'granted') new Notification('ALFA Charts Alarm', { body: msg }); } catch {}
  playAlarmSound(a.sound, a.volume);
  const payload = alarmPayload(a, price, msg);
  if (a.webhook) postAlarmWebhook(a.webhook, payload).catch(() => connection('Alarm webhook’u gönderilemedi', 'error'));
  if (a.telegramChat) void sendAlarmTelegram(a.telegramChat, msg);
}
function checkAlarms(price) {
  const previous = alarmPriceTracker.update(symbol, price);
  if (!Number.isFinite(price)) return;
  const muted = loadMuted();
  for (const a of ensureAlarms()) if (a.symbol === symbol && a.enabled !== false && !isAlarmMuted(muted, a.id) && shouldFire(a, price, previous)) void fireAlarm(a, price);
}
function addQuickAlarm(price, cond) {
  if (!Number.isFinite(price) || price <= 0) return;
  const settings = loadAlarmSettings();
  ensureAlarms().push(normalizeAlarm({ ...settings, symbol, price, basePrice: price, cond,
    note: 'Grafik sağ tık' }, symbol, price));
  saveAlarms(alarms);
  try { if (Notification.permission === 'default') Notification.requestPermission(); } catch {}
  connection(`Alarm eklendi: ${symbol} ${ALARM_CONDITIONS[cond] || 'Fiyat'} ${priceFormat.format(price)}`, 'ok');
}
function openAlarmManager(editingId = null) {
  let editingAlarmId = editingId;
  const mine = ensureAlarms().filter(a => a.symbol === symbol);
  const settings = loadAlarmSettings();
  const opts = (map, selected) => Object.entries(map).map(([value, label]) =>
    `<option value="${escapeHTML(value)}" ${value === selected ? 'selected' : ''}>${escapeHTML(label)}</option>`).join('');
  const muted = loadMuted();
  const rows = mine.length ? mine.map(a => `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #242f42;">
    <span style="flex:1"><strong>${escapeHTML(alarmConditionLabel(a))}</strong>${a.enabled === false ? ' · devre dışı' : a.triggered ? ' · tetiklendi' : a.count ? ` · ${a.count} kez` : ''}${isAlarmMuted(muted, a.id) ? ' · sessiz' : ''}${a.note ? ' · ' + escapeHTML(a.note) : ''}<br><small>${escapeHTML(ALARM_SOUNDS[a.sound] || 'bip')} · ${escapeHTML(ALARM_REPEATS[a.repeat] || 'Bir kez')}${a.telegramChat ? ' · Telegram' : ''}${a.webhook ? ' · Webhook' : ''}</small></span>
    <button data-edit-alarm="${escapeHTML(a.id)}" title="Düzenle">✎</button>
    <button data-toggle-alarm="${escapeHTML(a.id)}" title="${a.enabled !== false ? 'Devre dışı bırak' : 'Etkinleştir'}">${a.enabled !== false ? '⏸' : '▶'}</button>
    <button data-mute-alarm="${escapeHTML(a.id)}" title="${isAlarmMuted(muted, a.id) ? 'Sesi aç' : 'Sessize al'}">${isAlarmMuted(muted, a.id) ? '🔇' : '🔊'}</button>
    <button data-test-alarm="${escapeHTML(a.id)}" title="Sesi dene">▶</button>
    <button data-del-alarm="${escapeHTML(a.id)}">Sil</button></div>`).join('')
    : '<p style="color:#8e9eb6">Bu sembolde alarm yok. Koşulları, sesi ve bildirim kanalını aşağıdan seçebilirsin.</p>';
  const m = openModal(`<div class="dialog-header"><div><h3>🔔 Fiyat Alarmları · ${symbol}</h3><p>Tarayıcı bildirimi, özel ses, Telegram ve webhook</p></div><button id="alarm-close-x" class="icon-button" aria-label="Kapat">${icon('close')}</button></div>
    <aside id="alarm-scope" class="chart-scope-note" role="note" aria-label="Alarmın çalışma kapsamı"><strong>Bu grafiğe bağlı yerel alarm · ${escapeHTML(symbol)}</strong>
      <p>Bu grafik açık ve canlı veri alırken yalnızca seçili sembolün alarmları kontrol edilir. Sembolü değiştirince önceki sembol bu grafikte izlenmez.</p>
      <p>Sekme/cihaz kapalıyken, bağlantı yokken veya Replay sırasında çalışmaz. Tarayıcı arka plandaki sekmeyi duraklatabilir. <strong>7/24 sunucu alarmı değildir.</strong></p>
      <p>Telegram ve webhook yalnızca bu sayfanın tetiklediği alarmı iletir; kendi başına sürekli izleme yapmaz. Alarm kayıtları bu cihazda hesabınıza özel saklanır.</p></aside>
    <form id="alarm-form" class="chart-settings-form" aria-describedby="alarm-scope">
      <fieldset><legend>KOŞUL</legend><div class="setting-grid">
        <label>Koşul<select id="alarm-cond">${opts(ALARM_CONDITIONS, 'above')}</select></label>
        <label>Fiyat<input id="alarm-price" type="number" step="any" placeholder="Fiyat"></label>
        <label>Yüzde (%)<input id="alarm-pct" type="number" min="0.01" max="100" step="0.01" value="1"></label>
        <label>Not<input id="alarm-note" maxlength="120" placeholder="Not (opsiyonel)"></label>
      </div></fieldset>
      <fieldset><legend>BİLDİRİM</legend><div class="setting-grid">
        <label>Ses<select id="alarm-sound">${opts(ALARM_SOUNDS, settings.sound)}</select></label>
        <label>Tekrar<select id="alarm-repeat">${opts(ALARM_REPEATS, settings.repeat)}</select></label>
        <label>Ses düzeyi<input id="alarm-volume" type="range" min="0" max="1" step="0.05" value="${settings.volume}"></label>
        <label><button id="alarm-test-sound" type="button">Sesi dene ▶</button></label>
        <label>Telegram sohbet ID<input id="alarm-telegram" inputmode="numeric" maxlength="15" placeholder="Örn. 123456789" value="${escapeHTML(settings.telegramChat)}"></label>
        <label>Webhook (https)<input id="alarm-webhook" type="url" placeholder="https://…" value="${escapeHTML(settings.webhook)}"></label>
      </div><small id="alarm-permission-hint">Tarayıcı bildirimi için izin, Telegram için Alfa Charts oturumu gerekir. Webhook hedefi tarayıcıdan gelen HTTPS isteğine izin vermelidir.</small></fieldset>
      <div class="settings-actions"><button id="alarm-permission" type="button">Bildirim izni ver</button><button id="alarm-add" type="submit">Alarm ekle</button></div>
    </form>
    <div id="alarm-list">${rows}</div>
    <div style="display:flex;justify-content:space-between;margin-top:12px;gap:8px;flex-wrap:wrap;">
      <button id="alarm-history" type="button" style="padding:8px 12px;border-radius:8px;border:1px solid #30394b;background:#151b26;color:#d7e0ee;">Tetikleme geçmişi (${loadAlarmHistory().length})</button>
      <button id="alarm-close" style="padding:8px 12px;border-radius:8px;border:1px solid #30394b;background:#151b26;color:#d7e0ee;">Kapat</button>
    </div>`);
  const box = m.box;
  m.overlay.setAttribute('aria-label', 'Fiyat alarmları');
  if (editingAlarmId) {
    const a = ensureAlarms().find(x => x.id === editingAlarmId);
    if (a) {
      const set = (sel, v) => { const el = box.querySelector(sel); if (el) el.value = v; };
      set('#alarm-cond', a.cond);
      set('#alarm-price', a.price);
      set('#alarm-pct', a.pct);
      set('#alarm-note', a.note || '');
      set('#alarm-sound', a.sound);
      set('#alarm-repeat', a.repeat);
      set('#alarm-volume', a.volume);
      set('#alarm-telegram', a.telegramChat || '');
      set('#alarm-webhook', a.webhook || '');
    }
  }
  const currentSettings = () => ({
    sound: box.querySelector('#alarm-sound').value, repeat: box.querySelector('#alarm-repeat').value,
    volume: Number(box.querySelector('#alarm-volume').value), telegramChat: box.querySelector('#alarm-telegram').value.trim(),
    webhook: box.querySelector('#alarm-webhook').value.trim()
  });
  box.querySelector('#alarm-close').onclick = m.close;
  box.querySelector('#alarm-close-x').onclick = m.close;
  box.querySelector('#alarm-test-sound').onclick = () => { const s = currentSettings(); playAlarmSound(s.sound, s.volume); };
  box.querySelector('#alarm-permission').onclick = async () => {
    try {
      const permission = await Notification.requestPermission();
      box.querySelector('#alarm-permission-hint').textContent = permission === 'granted' ? 'Bildirim izni verildi; alarmın çalışma kapsamı değişmez.' : 'Bildirim izni verilmedi. Diğer kanallar yalnızca kendi izinleri ve bağlantı koşulları uygunsa gönderim yapabilir.';
    } catch { box.querySelector('#alarm-permission-hint').textContent = 'Bu tarayıcı bildirim izni desteklemiyor.'; }
  };
  const submitBtn = box.querySelector('#alarm-add');
  if (editingAlarmId) { submitBtn.textContent = 'Alarmı güncelle'; }
  box.querySelector('#alarm-form').addEventListener('submit', event => {
    event.preventDefault();
    try {
    const price = Number(box.querySelector('#alarm-price').value);
    const cond = box.querySelector('#alarm-cond').value;
    const pctMode = cond === 'pctUp' || cond === 'pctDown';
    if ((!pctMode && (!Number.isFinite(price) || price <= 0)) || (pctMode && !(Number(box.querySelector('#alarm-pct').value) > 0))) {
      connection('Geçerli bir fiyat veya yüzde girin', 'error'); return;
    }
    const nextSettings = saveAlarmSettings(currentSettings());
    const current = Number(history.at(-1)?.close) || price;
    const payload = { ...nextSettings, symbol, cond,
      price: pctMode ? current : price, basePrice: current, pct: Number(box.querySelector('#alarm-pct').value),
      note: box.querySelector('#alarm-note').value.trim() };
    if (editingAlarmId) {
      const idx = ensureAlarms().findIndex(a => a.id === editingAlarmId);
      if (idx >= 0) {
        const prev = ensureAlarms()[idx];
        ensureAlarms()[idx] = normalizeAlarm({ ...payload, id: prev.id, enabled: prev.enabled, triggered: prev.triggered,
          count: prev.count, triggeredAt: prev.triggeredAt, triggerPrice: prev.triggerPrice, createdAt: prev.createdAt,
          lastAt: prev.lastAt }, symbol, current);
      }
      connection('Alarm güncellendi', 'ok');
    } else {
      ensureAlarms().push(normalizeAlarm(payload, symbol, current));
      connection('Alarm eklendi', 'ok');
    }
    saveAlarms(alarms); m.close(); openAlarmManager();
    } catch (e) { console.error('ALARM SUBMIT ERR', e && e.message); connection('Alarm kaydedilemedi: ' + (e && e.message), 'error'); }
  });
  box.querySelectorAll('[data-test-alarm]').forEach(b => b.onclick = () => {
    const a = ensureAlarms().find(x => x.id === b.dataset.testAlarm);
    if (a) playAlarmSound(a.sound, a.volume);
  });
  box.querySelectorAll('[data-del-alarm]').forEach(b => b.onclick = () => {
    alarms = ensureAlarms().filter(a => a.id !== b.dataset.delAlarm); saveAlarms(alarms);
    saveMuted(unmuteAlarmIds(loadMuted(), b.dataset.delAlarm));
    m.close(); openAlarmManager();
  });
  box.querySelectorAll('[data-edit-alarm]').forEach(b => b.onclick = () => {
    const a = ensureAlarms().find(x => x.id === b.dataset.editAlarm);
    if (!a) return;
    m.close();
    openAlarmManager(a.id);
  });
  box.querySelectorAll('[data-toggle-alarm]').forEach(b => b.onclick = () => {
    const a = ensureAlarms().find(x => x.id === b.dataset.toggleAlarm);
    if (a) { a.enabled = a.enabled === false; saveAlarms(alarms); }
    m.close(); openAlarmManager();
  });
  box.querySelectorAll('[data-mute-alarm]').forEach(b => b.onclick = () => {
    const id = b.dataset.muteAlarm;
    const muted = loadMuted();
    saveMuted(isAlarmMuted(muted, id) ? unmuteAlarmIds(muted, id) : muteAlarmIds(muted, id));
    m.close(); openAlarmManager();
  });
  const historyBtn = box.querySelector('#alarm-history');
  if (historyBtn) historyBtn.onclick = () => {
    const items = loadAlarmHistory();
    const text = items.length ? items.map(h => `${new Date(h.at).toLocaleString('tr-TR')} · ${h.symbol} · ${h.message}`).join('\\n') : 'Henüz tetiklenme yok.';
    alert(text);
  };
}
$('alarm-toggle').addEventListener('click', () => openAlarmManager());

const indicators = new IndicatorManager({ chart, getBars: () => seriesBars, onChange: () => { studiesUI?.sync(); drawings.updatePanel(); } });
const sessionLevels = new SessionLevelsManager({ series: candles, getBars: () => seriesBars });
const sessionBoxes = new SessionBoxesManager({ chart, series: candles, host, getBars: () => seriesBars, getInterval: () => interval, onChange: () => { studiesUI?.sync(); saveLayout(); } });
const marketStructure = new MarketStructureManager({ series: candles, getBars: () => seriesBars });
const fvg = new FvgManager({ chart, series: candles, host, getBars: () => seriesBars });
const mtf = new MtfManager({ chart, series: candles, host, getBars: () => seriesBars, getInterval: () => interval });
publicStudies = new PublicStudiesManager({ chart, series: candles, getBars: () => seriesBars,
  getSymbol: () => symbol, getInterval: () => interval, onStatus: connection,
  onStudyStatus: () => studiesUI?.sync() });
studiesUI = new ChartStudies({ indicators, catalog: INDICATOR_CATALOG, managers: {
  sessions: sessionBoxes, levels: sessionLevels, structure: marketStructure, fvg, mtf,
  ...publicStudies.facades,
  volume: { enabled: true, setEnabled(value) { this.enabled = value; volume.applyOptions({ visible: value }); } },
}, onChange: () => { saveLayout(); drawings.updatePanel(); } });
const paper = new PaperTradingPanel({
  series:candles,owner:currentUserKey,pause:pauseReplay,
  getReplay:()=>replayMode&&replayEngine?{bars:history,clock:replayEngine.clock}:null,
  onPersist:()=>{if(replayMode)$('replay-save').click();}
});
const research = new ResearchPanel({getOwner:currentUserKey,isReplayActive:()=>replayMode,
  onOpen:packet=>enterReplay({session:packet.replay,researchPacket:packet})});
mtf.onReplayError=(tf)=>{if(replayMode){pauseReplay();connection(tf+' replay verisi yüklenemedi · duraklatıldı','error');}};
const cloudSettings = new ChartSettingsStore(msg => { try { $('drawing-status').textContent = msg; } catch {} }, user => {
  rememberStudies(); studyContext = null;
  applyChartTimeZone(readChartTimeZone(currentUserKey()));
  watchlist.account();
  research.account(user,cloudSettings.client);
  if(paper.engine&&paper.owner()!==paper.ownerId){pauseReplay();paper.stop();}
  try { loadLayout(); } catch {}
  try { indicators.updateAll(seriesBars); } catch {}
  try { sessionLevels.render(); } catch {}
  try { marketStructure.render(); } catch {}
  try { fvg.render(); } catch {}
  try { mtf.render(); } catch {}
});
cloudSettings.start();
function dispose() {
  pauseReplay(); research.dispose(); paper.stop(); disposed = true; ++generation;
  closeTransport(); clearTimeout(cloudSaveTimer); cloudSettings.dispose();
  try { publicStudies?.dispose(); } catch {}
  clearSyncTimers(); window.removeEventListener('message', onSyncMessage);
  window.removeEventListener('storage', onChartTimeZoneStorage);
  drawings.dispose(); watchlist.dispose(); sessionBoxes.dispose(); observer.disconnect(); chart.remove();
}
window.addEventListener('pagehide', dispose, { once: true });
window.addEventListener('pageshow', e => { if (e.persisted) location.reload(); });
window.addEventListener('online', () => { if (!disposed&&!replayMode) loadMarket(); });
window.addEventListener('offline', () => { connection('İnternet bağlantısı yok · fiyat güncel değil', 'error'); });
// Yalnızca ?debug=1 ile açılan, arayüzü etkilemeyen teşhis kancası.
if (new URLSearchParams(location.search).has('debug')) {
  window.__alfaDebug = { chart, candles, line, drawings, watchlist, indicators, mtf, sessionLevels, sessionBoxes, marketStructure, fvg, studiesUI, publicStudies, paper, research,
    get multiChart() { return multiChart; },
    get multiState() { return structuredClone(multiChart?.state || {}); },
    get sync() { return { session: syncSession, paneId: syncPaneId, instance: syncInstance, ready: syncReady, seq: syncGate?.seq || 0, lastAppliedSync }; },
    get mainSync() { return multiChart?.syncState || null; },
    sendSync: (type, payload) => syncGate?.send(type, payload, { force: true }) || null,
    applyMainSync, getMainSyncState,
    get replayClock(){return replayEngine?.clock;}, get loadingOlder() { return loadingOlder; }, get history() { return history; },
    get viewConfig() { return { ...viewConfig }; }, get historyCache() { return marketHistoryCache; },
    get studyContext() { return studyContext ? { ...studyContext } : null; }, rememberStudies, loadStudiesFor,
    resetChartView, openChartSettingsModal, handleChartAction,
    get ready() { return $('connection').dataset.state === 'live'; } };
}
$('replay-toggle').addEventListener('click', () => {
  if (replayMode) { exitReplay(); return; }
  const modal=openModal(`<h3>Bar Replay</h3>
    <p>Seçilen mumun <strong>kapanışından</strong> başlanır. Tarih/saat UTC’dir.</p>
    <button id="replay-pick">Grafikten mum seç</button>
    <label>Tarih/saat gir (UTC) <input id="replay-date" type="datetime-local"></label>
    <button id="replay-date-start">Tarihten başlat</button>
    <h4>Kayıtlı oturumlar (bu kullanıcı)</h4><div id="replay-saved"></div>
    <button id="replay-cancel">Kapat</button>`);
  modal.box.querySelector('#replay-cancel').onclick=modal.close;
  modal.box.querySelector('#replay-pick').onclick=()=>{
    modal.close();replayPicking=true;drawings.cancel();
    connection('Replay: başlangıç mumuna tıklayın · Escape iptal','replay');
  };
  modal.box.querySelector('#replay-date-start').onclick=()=>{
    const value=modal.box.querySelector('#replay-date').value;
    if(!value)return;
    const target=Date.parse(value+'Z')/1000;
    modal.close();enterReplay({target});
  };
  const prefix='alfa-replay-session:v1:'+currentUserKey()+':';
  try {for(const key of Object.keys(localStorage).filter(k=>k.startsWith(prefix))){
    const session=JSON.parse(localStorage.getItem(key));
    const button=document.createElement('button');
    button.textContent=session.symbol+' '+session.timeframe+' · '+new Date(session.currentTime*1000).toISOString();
    button.onclick=()=>{modal.close();enterReplay({session});};
    modal.box.querySelector('#replay-saved').append(button);
  }}catch{connection('Kayıtlı replay okunamadı','error');}
});
chart.subscribeClick(param=>{
  if(!replayPicking || !Number.isFinite(param.time))return;
  replayPicking=false;enterReplay({target:param.time});
});
document.addEventListener('keydown',event=>{if(event.key==='Escape')replayPicking=false;});
$('replay-play').addEventListener('click', playReplay);
$('replay-pause').addEventListener('click', pauseReplay);
$('replay-prev').addEventListener('click', () => stepReplay(-1));
$('replay-next').addEventListener('click', () => stepReplay(1));
$('replay-timeline')?.addEventListener('input', () => {
  if (!replayMode || !replayEngine) return;
  pauseReplay();
  try { replayEngine.seek(Number($('replay-timeline').value)); } catch {}
  applyReplaySlice();
  withSyncApply(() => chart.timeScale().setVisibleLogicalRange({from:Math.max(0,replayIndex-100),to:replayIndex+8}));
});
$('replay-restart').addEventListener('click', restartReplay);
$('replay-stop').addEventListener('click', exitReplay);
$('paper-toggle').addEventListener('click',()=>paper.toggle());
$('research-toggle').addEventListener('click',()=>research.toggle());
$('replay-speed').addEventListener('change',()=>{ const playing=!!replayTimer;pauseReplay();if(playing)playReplay(); });
$('replay-save').addEventListener('click',()=>{
  if(!replayMode)return;
  if(paper.ownerId!==currentUserKey()){connection('Hesap değişti; önce Replay oturumunu durdurun','error');return;}
  try{
    const session={...replayEngine.serialize(),id:drawings.context.owner,speed:Number($('replay-speed').value),drawings:drawings.history.doc,indicators:indicators.toJSON(),mtfConfig:mtf.config,mtfEnabled:!!mtf.enabled,paper:paper.serialize()};
    localStorage.setItem('alfa-replay-session:v1:'+currentUserKey()+':'+symbol+':'+interval,JSON.stringify(session));
    const lowerWindows=[...paper.lab.excursions.cache].map(([key,bars])=>({timeframe:key.split(':')[1],bars}));
    research.capture(currentUserKey(),session,{bars:history,lowerWindows,watermark:paper.lab.doc.maxObservedClock});
    connection('Replay oturumu yerelde kaydedildi','replay');
  }catch{connection('Replay oturumu kaydedilemedi','error');}
});
$('goto-date-btn').addEventListener('click', async () => {
  const v = $('goto-date').value;
  if (!v) return;
  if(replayMode){connection('Önce mevcut replay oturumunu durdurun','error');return;}
  await navigateHistory({ target: Date.parse(v + 'Z') / 1000 });
});

async function navigateHistory({ target = null, duration = null, all = false } = {}) {
  if (replayMode || !history.length || (target != null && !Number.isFinite(target))) return false;
  const ticket = ++historyNavigation, stamp = generation, owner = currentUserKey();
  const valid = () => ticket === historyNavigation && stamp === generation && owner === currentUserKey() && !replayMode && !disposed;
  const end = history.at(-1).time;
  if (duration != null) target = end - duration;
  if (target != null && target > end) { connection('Seçilen tarih son mumdan ileride', 'error'); return false; }
  // Bound each user action. A partial provider response is never labelled "all".
  let complete = false;
  for (let page = 0; page < 512 && valid(); page++) {
    if (!all && history[0].time <= target) { complete = true; break; }
    const first = history[0].time;
    const edge = `${symbol}|${interval}|${first}`;
    if (exhaustedHistoryEdges.has(edge)) { complete = all; break; }
    await requestOlderHistory();
    if (!valid()) return false;
    if (history[0].time === first) {
      complete = all && exhaustedHistoryEdges.has(edge);
      break;
    }
  }
  if (!valid()) return false;
  if (!complete) {
    connection('İstenen geçmiş aralığı tamamlanamadı · görünüm korundu; yeniden deneyebilirsiniz', 'error');
    return false;
  }
  withSyncApply(() => {
    if (all) chart.timeScale().fitContent();
    else if (duration != null) chart.timeScale().setVisibleRange({ from: target, to: end });
    else {
      const index = history.findIndex(bar => bar.time >= target);
      const range = chart.timeScale().getVisibleLogicalRange();
      const half = Math.max(5, ((range?.to || 100) - (range?.from || 0)) / 2);
      chart.timeScale().setVisibleLogicalRange({ from: index - half, to: index + half });
    }
  });
  connection(all ? 'Tümü · sağlayıcının mevcut geçmişi yüklendi' : 'Tarih aralığı yüklendi', 'live');
  return true;
}

// ---------- UI: indicator manager, settings, MTF settings, persistence ----------
function currentUserKey() {
  try {
    const raw = sessionStorage.getItem(AUTH_KEY) || localStorage.getItem(AUTH_KEY)
      || sessionStorage.getItem(LEGACY_AUTH_KEY) || localStorage.getItem(LEGACY_AUTH_KEY);
    const j = raw ? JSON.parse(raw) : null;
    return (j && j.user && j.user.id) || 'guest';
  } catch { return 'guest'; }
}
function layoutKey() { return 'alfa-chart-layout:v1:' + currentUserKey() + ':' + symbol + ':' + interval; }
let cloudRevision = 0;
const cloudConflicts = new Set();
const conflictContext = (owner, ref, tf) => JSON.stringify([owner, ref, tf]);
let cloudSaveTimer = null;
function layoutSettings() {
  return structuredClone({
    chartType: type, logScale, autoScale, view: { ...viewConfig }, palette: { ...palette }, indicators: indicators.toJSON(), mtf: mtf.config,
    sessionLevels: sessionLevels.config, sessionBoxes: sessionBoxes.config,
    marketStructure: marketStructure.config, fvg: fvg.config, publicStudies: publicStudies.toJSON(), studies: studiesUI.toJSON(),
  });
}
function allowedOverlayIds() { return new Set(Object.keys(studiesUI?.state || {})); }
// Studies follow the market, not the candle period. Snapshot the current
// context before switching symbol/interval/account so nothing is lost.
function rememberStudies() {
  if (replayMode || !studyContext?.loaded || !studiesUI) return;
  writeStudyBundle(localStorage, studyContext.owner, studyContext.symbol, {
    version: 1, indicators: indicators.toJSON(), overlays: studiesUI.toJSON()
  });
}
function storedLayout(key) {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || 'null');
    if (Array.isArray(raw)) return { indicators: raw };
    return raw && typeof raw === 'object' ? raw : null;
  } catch { return null; }
}
function legacyLayoutsFor(ref, tf) {
  const owner = currentUserKey(), prefix = `alfa-chart-layout:v1:${owner}:${ref}:`, current = prefix + tf, out = [];
  const primary = storedLayout(current);
  if (primary) out.push(primary);
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith(prefix) && key !== current) {
      const layout = storedLayout(key);
      if (layout) out.push(layout);
    }
  } catch {}
  const oldIndicators = storedLayout('alfa-ind:v1:' + ref);
  if (oldIndicators) out.push(oldIndicators);
  return out;
}
function loadStudiesFor(owner, ref, layouts = legacyLayoutsFor(ref, interval)) {
  const allowed = allowedOverlayIds(), initial = defaultStudyState();
  try { initial.sessions.added = !!localStorage.getItem('alfa-sb:v1') && Object.values(sessionBoxes.config.enabled).some(Boolean); } catch {}
  return resolveStudyBundle({
    current: readStudyBundle(localStorage, owner, ref, allowed),
    legacyLayouts: layouts,
    defaults: { indicators: [], overlays: initial },
    allowedOverlays: allowed
  });
}
function applyStudiesBundle(bundle, owner, ref) {
  indicators.fromJSON(bundle.indicators);
  studiesUI.apply(bundle.overlays);
  studiesUI.sync();
  studyContext = { owner, symbol: ref, loaded: true };
}
function applyChartTimeZone(value, persist = false) {
  chartTimeZone = normalizeChartTimeZone(value);
  chartTimeFormats = createChartTimeFormatters(chartTimeZone);
  const kinds = {
    [TickMarkType.Year]: 'year', [TickMarkType.Month]: 'month', [TickMarkType.DayOfMonth]: 'day',
    [TickMarkType.Time]: 'time', [TickMarkType.TimeWithSeconds]: 'seconds'
  };
  // Only the library's label formatters change. Never offset series data or
  // drawing epochs, refetch candles, fit the view or change replay/session time.
  chart.applyOptions({
    localization: { timeFormatter: time => chartTimeFormats.dateTime(time) },
    timeScale: { tickMarkFormatter: (time, kind) => chartTimeFormats.tickMark(time, kinds[kind]) }
  });
  const label = CHART_TIME_ZONES[chartTimeZone], button = $('chart-timezone');
  button.textContent = label; button.dataset.timezone = chartTimeZone;
  button.setAttribute('aria-label', 'Grafik saat dilimi: ' + label);
  button.title = `Grafik saat dilimi: ${label} (${chartTimeZone}) · değiştirmek için tıkla`;
  updateQuoteTime(); updateUI();
  const saved = !persist || writeChartTimeZone(currentUserKey(), chartTimeZone);
  if (!saved) {
    connection('Saat dilimi uygulandı; tarayıcı tercihi kaydedilemedi', 'error');
  }
  return saved;
}
function chartTimeZoneOptions() {
  return Object.entries(CHART_TIME_ZONES).map(([value, name]) =>
    `<option value="${value}" ${value === chartTimeZone ? 'selected' : ''}>${name}${value === 'UTC' ? '' : ' · ' + value}</option>`).join('');
}
function openChartTimeZone() {
  const owner = currentUserKey();
  const modal = chartDialog(`<div class="dialog-header"><div><h3>Grafik saat dilimi</h3><p>Yalnızca saat gösterimini değiştirir.</p></div><button id="timezone-close" class="icon-button" aria-label="Kapat">${icon('close')}</button></div>
    <form id="timezone-form" class="chart-settings-form"><label>Saat dilimi<select name="timezone">${chartTimeZoneOptions()}</select></label>
      <p class="menu-note">Yaz/kış saati otomatik uygulanır. Mumlar, çizimler, seans hesapları ve replay tarih girişleri UTC kalır. Tercih bu cihazda hesabına özel saklanır.</p>
      <div class="settings-actions"><button id="timezone-cancel" type="button">Vazgeç</button><button type="submit" class="apply">Uygula</button></div></form>`);
  modal.overlay.setAttribute('aria-label', 'Grafik saat dilimi');
  modal.box.querySelector('#timezone-close').onclick = modal.close;
  modal.box.querySelector('#timezone-cancel').onclick = modal.close;
  modal.box.querySelector('#timezone-form').onsubmit = event => {
    event.preventDefault();
    if (owner !== currentUserKey()) { modal.close(); connection('Hesap değişti; saat dilimini yeniden seçin', 'error'); return; }
    applyChartTimeZone(new FormData(event.currentTarget).get('timezone'), true); modal.close();
  };
}
function onChartTimeZoneStorage(event) {
  if (event.key === chartTimeZoneKey(currentUserKey())) applyChartTimeZone(readChartTimeZone(currentUserKey()));
}
window.addEventListener('storage', onChartTimeZoneStorage);
function saveLayout() {
  if (replayMode) return; // Replay has its own session; never overwrite the live layout.
  rememberStudies();
  const settings = layoutSettings();
  try {
    localStorage.setItem(layoutKey(), JSON.stringify(settings));
  } catch {}
  scheduleCloudSave(settings);
}
function applyPaletteSettings(cfg) {
  if (!cfg || typeof cfg !== 'object') return;
  for (const key of PALETTE_COLORS) if (HEX.test(String(cfg[key] || ''))) palette[key] = String(cfg[key]);
  if (typeof cfg.borderVisible === 'boolean') palette.borderVisible = cfg.borderVisible;
  applyPalette();
}
function applyPublicStudiesConfig(cfg) { try { publicStudies.applyConfig(cfg); } catch {} }
function applySessionBoxesConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') return;
  sessionBoxes.config = { ...sessionBoxes.defaultConfig(), ...cfg, enabled: { ...sessionBoxes.defaultConfig().enabled, ...(cfg.enabled || {}) } };
  sessionBoxes.buildUI(); sessionBoxes.render();
}
async function loadLayout() {
  if(replayMode)return;
  const requestGeneration = generation;
  const requestOwner = currentUserKey();
  cloudRevision = 0;
  let localLayout = null, cloudLayout = null;
  try {
    localLayout = JSON.parse(localStorage.getItem(layoutKey()) || 'null');
    const recovery = readSettingsConflict(localStorage, requestOwner, symbol, interval);
    if (recovery) {
      cloudConflicts.add(conflictContext(requestOwner, symbol, interval));
      localLayout = recovery.settings;
    }
    const raw = localLayout;
    if (raw && typeof raw === 'object') {
      if (typeof raw.chartType === 'string') applyChartType(raw.chartType);
      if (typeof raw.logScale === 'boolean') setLogScale(raw.logScale, false);
      if (typeof raw.autoScale === 'boolean') setAutoScale(raw.autoScale, false);
      if (raw.view) applyViewSettings(raw.view);
      if (raw.palette) applyPaletteSettings(raw.palette);
      if (raw.mtf) mtf.config = { ...mtf.defaultConfig(), ...raw.mtf };
      if (raw.sessionLevels) sessionLevels.config = { ...sessionLevels.defaultConfig(), ...raw.sessionLevels };
      if (raw.sessionBoxes) applySessionBoxesConfig(raw.sessionBoxes);
      if (raw.marketStructure) marketStructure.config = { ...marketStructure.defaultConfig(), ...raw.marketStructure };
      if (raw.fvg) fvg.config = { ...fvg.defaultConfig(), ...raw.fvg };
      if (raw.publicStudies) applyPublicStudiesConfig(raw.publicStudies);
    }
  } catch {}
  if (cloudSettings.isAuthed() && !cloudConflicts.has(conflictContext(requestOwner, symbol, interval))) {
    const cloud = await cloudSettings.load(symbol, interval);
    if(replayMode || requestGeneration !== generation || requestOwner !== currentUserKey())return;
    if (cloud && cloud.settings) {
      const s = cloud.settings; cloudLayout = s;
      if (typeof s.chartType === 'string') applyChartType(s.chartType);
      if (typeof s.logScale === 'boolean') setLogScale(s.logScale, false); if (typeof s.autoScale === 'boolean') setAutoScale(s.autoScale, false); if (s.view) applyViewSettings(s.view); if (s.palette) applyPaletteSettings(s.palette);
      if (s.mtf) mtf.config = { ...mtf.defaultConfig(), ...s.mtf };
      if (s.sessionLevels) sessionLevels.config = { ...sessionLevels.defaultConfig(), ...s.sessionLevels };
      if (s.sessionBoxes) applySessionBoxesConfig(s.sessionBoxes);
      if (s.marketStructure) marketStructure.config = { ...marketStructure.defaultConfig(), ...s.marketStructure };
      if (s.fvg) fvg.config = { ...fvg.defaultConfig(), ...s.fvg };
      if (s.publicStudies) applyPublicStudiesConfig(s.publicStudies);
      cloudRevision = cloud.revision || 0;
      try { $('drawing-status').textContent = 'Bulut: yüklendi'; } catch {}
    }
  }
  // Shared owner + symbol studies win over stale per-interval snapshots. Old
  // layouts are migration sources only; they are never silently overwritten.
  const layouts = [localLayout, cloudLayout].filter(Boolean);
  applyStudiesBundle(loadStudiesFor(requestOwner, symbol, layouts), requestOwner, symbol);
  if (cloudConflicts.has(conflictContext(requestOwner, symbol, interval))) {
    $('drawing-status').textContent = 'Bulut çakışması · yerel kayıt korundu; bulut yazımı durduruldu';
  }
}
function scheduleCloudSave(settings = layoutSettings()) {
  if(replayMode)return;
  if (!cloudSettings.isAuthed()) return;
  const requestSymbol = symbol, requestInterval = interval, requestOwner = currentUserKey(), requestGeneration = generation;
  const context = conflictContext(requestOwner, requestSymbol, requestInterval);
  if (cloudConflicts.has(context)) {
    preserveSettingsConflict(localStorage, requestOwner, requestSymbol, requestInterval, settings);
    return;
  }
  const revision = cloudRevision;
  clearTimeout(cloudSaveTimer);
  cloudSaveTimer = setTimeout(async () => {
    if(replayMode || cloudSettings.user?.id !== requestOwner || cloudConflicts.has(context))return;
    const res = await cloudSettings.save(requestSymbol, requestInterval, settings, revision);
    if (requestGeneration !== generation || requestOwner !== currentUserKey()) return;
    if (res.ok) { cloudRevision = res.revision || cloudRevision; try { $('drawing-status').textContent = 'Bulut: kaydedildi'; } catch {} }
    else if (res.error && /conflict|unique/i.test(res.error)) {
      cloudConflicts.add(context);
      // Read the live local state, not the stale snapshot sent 800ms earlier.
      const kept = preserveSettingsConflict(localStorage, requestOwner, requestSymbol, requestInterval, layoutSettings());
      try { $('drawing-status').textContent = kept
        ? 'Bulut çakışması · yerel kayıt korundu; bulut yazımı durduruldu'
        : 'Bulut çakışması · bulut yazımı durduruldu; yerel yedek kaydedilemedi'; } catch {}
    } else {
      try { $('drawing-status').textContent = res.offline ? 'Çevrimdışı · yerel kayıt' : 'Bulut hatası · yerel kayıt'; } catch {}
    }
  }, 800);
}

function openModal(html) {
  return chartDialog(html);
}

function openIndicatorManager() {
  studiesUI.open();
}

function openIndicatorSettings(item) {
  studiesUI.openSettings(item.id);
}

function openMtfSettings() {
  studiesUI.openSettings('mtf');
}

// wire buttons
$('indicators-manage').addEventListener('click', openIndicatorManager);

// Restore this market's layout only while its drawing/account context is current.
const originalOpenMarket = drawings.openMarket.bind(drawings);
drawings.openMarket = async (nextSymbol, force) => {
  if(replayMode)exitReplay();
  if(replayMode)return;
  await originalOpenMarket(nextSymbol, force);
  if (disposed || replayMode || drawings.market !== nextSymbol || symbol !== nextSymbol) return;
  await loadLayout();
  try { indicators.updateAll(seriesBars); } catch {}
  try { sessionLevels.render(); } catch {}
  try { marketStructure.render(); } catch {}
  try { fvg.render(); } catch {}
  try { mtf.render(); } catch {}
};

// persist on changes
window.addEventListener('beforeunload', saveLayout);
window.openIndicatorManager = openIndicatorManager;
window.openIndicatorSettings = openIndicatorSettings;
window.openMtfSettings = openMtfSettings;

// Keep laboratory actions out of the indicator catalogue.
document.addEventListener('pointerdown', e => {
  document.querySelectorAll('.workspace-menu[open]').forEach(menu => {
    if (!menu.contains(e.target)) menu.open = false;
  });
});
document.querySelectorAll('.workspace-menu').forEach(menu => menu.addEventListener('click', e => {
  if (e.target.closest('button') && !e.target.closest('#session-boxes-tools')) menu.open = false;
}));
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.querySelectorAll('.workspace-menu[open]').forEach(menu => { menu.open = false; menu.querySelector('summary').focus(); });
  if (e.target.closest('input,textarea,select,[contenteditable=true]') || document.querySelector('dialog[open]')) return;
  if (e.altKey && e.key.toLowerCase() === 'i') { e.preventDefault(); openIndicatorManager(); }
});
$('tester-open').addEventListener('click', () => {
  if (replayMode) { paper.filter = 'tester'; paper.root.hidden = false; paper.update(); return; }
  const modal = openModal(`<div class="dialog-header"><div><h3>Strateji testleri</h3><p>Geçmiş veride, geleceği görmeden test et.</p></div><button id="tester-close" class="icon-button" aria-label="Kapat">${icon('close')}</button></div>
    <p style="line-height:1.8;color:#99aac5">İşlem günlüğü, performans ölçümleri ve strateji laboratuvarı Replay oturumunda kullanılır. Önce grafikte bir başlangıç mumu seç.</p>
    <div class="settings-actions"><button id="tester-replay" class="apply">Replay başlat</button></div>`);
  modal.box.querySelector('#tester-close').onclick = modal.close;
  modal.box.querySelector('#tester-replay').onclick = () => { modal.close(); $('replay-toggle').click(); };
});
document.querySelectorAll('[data-range]').forEach(b => b.addEventListener('click', async () => {
  if (!history.length) return;
  const ok = await navigateHistory(b.dataset.range === 'all' ? { all: true } : { duration: Number(b.dataset.range) });
  if (ok) document.querySelectorAll('[data-range]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
}));
function persistViewConfig() {
  try { localStorage.setItem('alfa-chart-view:v1', JSON.stringify(viewConfig)); } catch {}
}
function applyViewConfig() {
  applyPalette();
  if (indicators.axisLabels !== viewConfig.axisLabels) {
    indicators.axisLabels = viewConfig.axisLabels; indicators.renderAll();
  }
  for (const manager of [sessionLevels, marketStructure]) {
    manager.axisLabels = viewConfig.axisLabels; manager.render();
  }
  studiesUI.setClean(viewConfig.clean);
  $('view-grid').checked = viewConfig.grid;
  $('view-axis-labels').checked = viewConfig.axisLabels;
  $('view-clean').checked = viewConfig.clean;
}
function applyViewSettings(settings) {
  if (!settings || typeof settings !== 'object') return;
  for (const key of Object.keys(viewConfig)) if (typeof settings[key] === 'boolean') viewConfig[key] = settings[key];
  applyViewConfig();
}
function setViewOption(key, value, persist = true) {
  if (!Object.hasOwn(viewConfig, key)) return;
  viewConfig[key] = !!value;
  applyViewConfig();
  if (persist) { persistViewConfig(); saveLayout(); }
}
function resetChartView() {
  if (history.length) chart.timeScale().fitContent();
  chart.timeScale().scrollToRealTime();
  setAutoScale(true, false);
  setLogScale(false, false);
  viewConfig = { ...DEFAULT_VIEW_CONFIG };
  applyViewConfig(); persistViewConfig(); saveLayout();
  connection('Grafik görünümü sıfırlandı', 'ok');
}
function openChartSettingsModal() {
  const owner = currentUserKey();
  const intervalOptions = Object.entries(TIMEFRAMES).map(([label, value]) =>
    `<option value="${value}" ${value === interval ? 'selected' : ''}>${label} · ${value}</option>`).join('');
  const typeOptions = [...$('chart-type').options].map(o =>
    `<option value="${o.value}" ${o.value === type ? 'selected' : ''}>${o.textContent}</option>`).join('');
  const modal = openModal(`<div class="dialog-header"><div><h3>Grafik ayarları</h3><p>Görünüm, ölçek ve piyasa ayarları</p></div><button id="chart-settings-close" class="icon-button" aria-label="Kapat">${icon('close')}</button></div>
    <form id="chart-settings-form" class="chart-settings-form">
      <fieldset><legend>GRAFİK</legend><div class="setting-grid">
        <label>Zaman dilimi<select name="interval">${intervalOptions}</select></label>
        <label>Grafik türü<select name="type">${typeOptions}</select></label>
        <label>Saat dilimi<select name="timezone">${chartTimeZoneOptions()}</select></label>
      </div><small>Saat dilimi yalnızca gösterimi değiştirir; çizim koordinatları, seanslar ve replay tarih girişleri UTC kalır.</small></fieldset>
      <fieldset><legend>GÖRÜNÜM</legend>
        <label><input type="checkbox" name="grid" ${viewConfig.grid ? 'checked' : ''}> Izgara çizgileri</label>
        <label><input type="checkbox" name="axisLabels" ${viewConfig.axisLabels ? 'checked' : ''}> Fiyat ekseni etiketleri</label>
        <label><input type="checkbox" name="clean" ${viewConfig.clean ? 'checked' : ''}> Sade mod · indikatörleri geçici gizle</label>
      </fieldset>
      <fieldset><legend>MUM / RENKLER</legend>${paletteFields()}
        <small>Sağ tık menüsündeki “Mum ve zemin renkleri…” ile aynı ayarlar.</small>
      </fieldset>
      <fieldset><legend>ÖLÇEK</legend>
        <label><input type="checkbox" name="logScale" ${logScale ? 'checked' : ''}> Logaritmik fiyat ölçeği</label>
        <label><input type="checkbox" name="autoScale" ${autoScale ? 'checked' : ''}> Otomatik fiyat ölçeği</label>
      </fieldset>
      <div class="settings-actions"><button id="chart-settings-reset" type="button">Görünümü sıfırla</button><button id="chart-settings-cancel" type="button">Vazgeç</button><button class="apply" type="submit">Uygula</button></div>
    </form>`);
  const box = modal.box;
  box.querySelector('#chart-settings-close').onclick = modal.close;
  box.querySelector('#chart-settings-cancel').onclick = modal.close;
  box.querySelector('#chart-settings-reset').onclick = () => { modal.close(); handleChartAction('reset-view'); };
  box.querySelector('#chart-settings-form').addEventListener('submit', event => {
    event.preventDefault();
    if (owner !== currentUserKey()) { modal.close(); connection('Hesap değişti; grafik ayarlarını yeniden açın', 'error'); return; }
    const beforeView = JSON.stringify({ type, logScale, autoScale, viewConfig, palette });
    const data = new FormData(event.currentTarget);
    const nextInterval = String(data.get('interval'));
    const intervalChanged = Object.values(TIMEFRAMES).includes(nextInterval) && nextInterval !== interval;
    if (intervalChanged) interval = nextInterval;
    applyChartType(String(data.get('type')));
    setLogScale(data.has('logScale'), false);
    applyViewSettings({ grid: data.has('grid'), axisLabels: data.has('axisLabels'), clean: data.has('clean') });
    applyPaletteForm(data);
    setAutoScale(data.has('autoScale'), false);
    const timeZoneSaved = applyChartTimeZone(data.get('timezone'), true);
    persistViewConfig(); saveLayout(); modal.close();
    if (intervalChanged) loadMarket();
    else {
      if (beforeView !== JSON.stringify({ type, logScale, autoScale, viewConfig, palette })) chart.timeScale().fitContent();
      if (timeZoneSaved) connection('Grafik ayarları uygulandı', 'ok');
    }
  });
}
function openCandleSettingsModal() {
  const modal = openModal(`<div class="dialog-header"><div><h3>Mum ve zemin renkleri</h3><p>TradingView tarzı görünüm ayarları · yerel olarak saklanır</p></div><button id="candle-settings-close" class="icon-button" aria-label="Kapat">${icon('close')}</button></div>
    <form id="candle-settings-form" class="chart-settings-form">
      <fieldset><legend>RENKLER</legend>${paletteFields()}</fieldset>
      <div class="settings-actions"><button id="candle-settings-reset" type="button">Varsayılan renkler</button><button id="candle-settings-cancel" type="button">Vazgeç</button><button class="apply" type="submit">Uygula</button></div>
    </form>`);
  const box = modal.box;
  box.querySelector('#candle-settings-close').onclick = modal.close;
  box.querySelector('#candle-settings-cancel').onclick = modal.close;
  box.querySelector('#candle-settings-reset').onclick = () => { resetPalette(); modal.close(); connection('Renkler varsayılana döndü', 'ok'); };
  box.querySelector('#candle-settings-form').addEventListener('submit', event => {
    event.preventDefault(); applyPaletteForm(new FormData(event.currentTarget)); modal.close();
    connection('Mum renkleri uygulandı', 'ok');
  });
}
function handleChartAction(action) {
  switch (action) {
    case 'reset-view': resetChartView(); break;
    case 'candle-settings': openCandleSettingsModal(); break;
    case 'settings': openChartSettingsModal(); break;
    case 'fit':
      if (history.length) chart.timeScale().fitContent();
      connection('Görünüm ekrana sığdırıldı', 'ok'); break;
    case 'realtime':
      chart.timeScale().scrollToRealTime(); connection('Son muma dönüldü', 'ok'); break;
    case 'fullscreen': $('fullscreen').click(); break;
    case 'grid': setViewOption('grid', !viewConfig.grid); break;
    case 'axisLabels': setViewOption('axisLabels', !viewConfig.axisLabels); break;
    case 'clean': setViewOption('clean', !viewConfig.clean); break;
    case 'logScale': setLogScale(!logScale); break;
    case 'autoScale':
      setAutoScale(!autoScale);
      connection(autoScale ? 'Otomatik fiyat ölçeği açıldı' : 'Otomatik fiyat ölçeği kapatıldı', 'ok');
      break;
    case 'indicators': openIndicatorManager(); break;
    case 'drawings': drawings.manager.hidden = false; drawings.updatePanel(); break;
    case 'screenshot': downloadChartScreenshot().catch(() => connection('Grafik görüntüsü alınamadı', 'error')); break;
    case 'copy-image': copyChartScreenshot().catch(() => connection('Görüntü kopyalanamadı', 'error')); break;
    case 'copy-link': copyChartLink().catch(() => connection('Bağlantı kopyalanamadı', 'error')); break;
    default: break;
  }
}
for (const [id, key] of [['view-grid', 'grid'], ['view-axis-labels', 'axisLabels'], ['view-clean', 'clean']]) {
  $(id).addEventListener('change', e => setViewOption(key, e.target.checked));
}
document.addEventListener('keydown', event => {
  if (!event.altKey || event.target.closest('input,textarea,select,[contenteditable=true]') || document.querySelector('dialog[open]')) return;
  const shortcuts = { r: 'reset-view', f: 'fit', l: 'realtime', s: 'settings' };
  const action = shortcuts[event.key.toLowerCase()];
  if (!action) return;
  event.preventDefault(); handleChartAction(action);
});
// TradingView numeric timeframe shortcuts: 1/5/15/30 => minutes, 60/120/240/360/720 => hours, D/3D/W => day/week.
const TF_SHORTCUTS = Object.freeze({ 1: '1m', 3: '3m', 5: '5m', 15: '15m', 30: '30m', 60: '1h', 120: '2h', 240: '4h', 360: '6h', 720: '12h', d: '1d', '3d': '3d', w: '1w' });
let tfDigitBuffer = '', tfDigitTimer = null;
function setTimeframeFromShortcut(value) {
  tfDigitBuffer = '';
  if (!Object.values(TIMEFRAMES).includes(value) || value === interval) return;
  interval = value; loadMarket(); saveLayout();
}
document.addEventListener('keydown', event => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.target.closest('input,textarea,select,[contenteditable=true]') || document.querySelector('dialog[open]')) return;
  const key = event.key.toLowerCase();
  if (/^[0-9]$/.test(key)) {
    event.preventDefault(); tfDigitBuffer = (tfDigitBuffer + key).slice(-3);
    clearTimeout(tfDigitTimer);
    if (TF_SHORTCUTS[tfDigitBuffer] && tfDigitBuffer.length >= 2) { setTimeframeFromShortcut(TF_SHORTCUTS[tfDigitBuffer]); return; }
    tfDigitTimer = setTimeout(() => {
      const value = TF_SHORTCUTS[tfDigitBuffer]; tfDigitBuffer = '';
      if (value) setTimeframeFromShortcut(value);
    }, 400);
    return;
  }
  if (key === 'd' || key === 'w') {
    event.preventDefault(); clearTimeout(tfDigitTimer);
    setTimeframeFromShortcut(TF_SHORTCUTS[key === 'd' && tfDigitBuffer === '3' ? '3d' : key]);
  }
});
applyViewConfig();
applyChartTimeZone(readChartTimeZone(currentUserKey()));
if (!isEmbed) {
  try {
    multiChart = initMultiChart({ getSymbol: () => symbol, getInterval: () => interval,
      setSymbol: next => setActiveSymbol(next), onStatus: connection,
      applyMainSync, getMainSyncState });
  } catch {}
}
if (syncGate) syncGate.send('hello', { symbol, interval }, { force: true });
loadMarket();
