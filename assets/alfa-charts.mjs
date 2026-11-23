import { createChart, CandlestickSeries, LineSeries, AreaSeries, BarSeries, HistogramSeries, ColorType, CrosshairMode, PriceScaleMode } from './vendor/lightweight-charts-5.0.9/lightweight-charts.standalone.production.mjs';
import { TIMEFRAMES, isMarketSymbol, STREAM_ORIGINS, fetchHistory, streamURL, parseKline, mergeCandles, parseMarketRef, setMarketTokenProvider, fetchMarketQuotes } from './alfa-charts-data.mjs?v=6';
import { DrawingEngine } from './alfa-drawings.mjs?v=9';
import { ChartWatchlist, formatMarketPrice } from './alfa-watchlist.mjs?v=2';
import { IndicatorManager, INDICATOR_CATALOG } from './alfa-indicators.mjs?v=3';
import { SessionLevelsManager } from './alfa-session-levels.mjs?v=5';
import { SessionBoxesManager } from './alfa-session-boxes.mjs?v=4';
import { MarketStructureManager } from './alfa-market-structure.mjs?v=2';
import { FvgManager } from './alfa-fvg.mjs?v=2';
import { ChartStudies, defaultStudyState } from './alfa-chart-studies.mjs?v=1';
import { icon, hydrateIcons, chartDialog, escapeHTML } from './alfa-chart-ui.mjs?v=2';
import { MtfManager } from './alfa-mtf.mjs?v=3';
import { ReplayEngine, candleCloseTime } from './alfa-replay-model.mjs?v=3';
import { replayRange } from './alfa-replay-data.mjs?v=2';
import { DrawingHistory, emptyDocument } from './alfa-drawings-model.mjs?v=6';
import { ChartSettingsStore } from './alfa-chart-settings-store.mjs?v=1';
import { PaperTradingPanel } from './alfa-paper.mjs?v=5';
import { ResearchPanel } from './alfa-research.mjs?v=4';
import { packetBars,validatePacket } from './alfa-research-model.mjs?v=2';

const $ = id => document.getElementById(id);
const workspace = document.querySelector('.workspace');
const host = $('chart');
hydrateIcons();
let studiesUI = null, watchlist = null, pricePrecisionKey = '';
async function marketAccessToken() {
  try {
    const session = await cloudSettings.client?.auth.getSession();
    return session?.data?.session?.access_token || '';
  } catch { return ''; }
}
setMarketTokenProvider(marketAccessToken);
const priceFormat = { format: value => formatMarketPrice(value, watchlist?.info(symbol).precision) };
const chart = createChart(host, {
  layout: { background: { type: ColorType.Solid, color: '#10141c' }, textColor: '#8e9eb6', attributionLogo: true },
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
    color: c.close >= c.open ? 'rgba(38,200,156,0.35)' : 'rgba(239,102,119,0.35)'
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
let history = [], seriesBars = [], socket, aborter, retryTimer, pollTimer, watchdog, generation = 0, attempts = 0;
let lastReceipt = 0, disposed = false, pendingIndicators = null, loadingOlder = false;
let replayMode = false, replayFull = [], replayIndex = 0, replayTimer = null, replaySpeed = 1;
let olderController = null;
let replayEngine = null, replayStartIndex = 0, liveDrawingState = null, replayMtfEnabled = false;
let replayRequest=null, replayBusy=false, replayPicking=false, replaySessionId=null;
const observer = new ResizeObserver(([entry]) => {
  chart.resize(Math.floor(entry.contentRect.width), Math.floor(entry.contentRect.height));
});
observer.observe(host);
chart.timeScale().subscribeVisibleLogicalRangeChange(range => {
  if (range && range.from < 40 && !loadingOlder && history.length >= 900) loadOlderHistory();
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
  loadingOlder = true;
  const prevConn = $('connection').textContent;
  connection('Eski mumlar yükleniyor…', 'waiting');
  const requestGeneration = generation, requestSymbol = symbol, requestInterval = interval;
  const firstTime = history[0].time;
  const controller = new AbortController(); olderController = controller;
  try {
    const older = await fetchHistory(requestSymbol, requestInterval, controller.signal, fetch, firstTime * 1000 - 1);
    if (requestGeneration !== generation || replayMode || disposed) return;
    if (!older.length) { loadingOlder = false; connection(prevConn || 'Canlı', 'live'); return; }
    const seen = new Set(history.map(c => c.time));
    const newBars = older.filter(c => !seen.has(c.time));
    if (!newBars.length) { loadingOlder = false; connection(prevConn || 'Canlı', 'live'); return; }
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
    syncSeriesData(history);
    if (range) chart.timeScale().setVisibleLogicalRange({ from: range.from + added, to: range.to + added });
    try { indicators.updateAll(history); } catch {}
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
  try { sessionLevels.render(); } catch {}
  try { marketStructure.render(); } catch {}
  try { fvg.render(); } catch {}
  try { mtf.setReplayClock(replayEngine.clock); } catch {}
  quote();
  const info = $('replay-info');
  paper.update();
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
  chart.timeScale().setVisibleLogicalRange({from:Math.max(0,replayIndex-100),to:replayIndex+8});
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
  $('price-time').textContent = `Mum: ${new Date(c.time * 1000).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
  showCandle(c);
}
function setData(data, resetView) {
  history = data;
  seriesBars = data;
  syncSeriesData(history);
  if (resetView) {
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, history.length - 130), to: history.length + 8 });
  }
  quote();
  if (pendingIndicators) { try { indicators.fromJSON(pendingIndicators); } catch {} pendingIndicators = null; }
  else { try { indicators.updateAll(history); } catch {} }
  try { sessionLevels.render(); } catch {}
  try { marketStructure.render(); } catch {}
  try { fvg.render(); } catch {}
}
chart.subscribeCrosshairMove(param => {
  const bar = param.seriesData.get(activePriceSeries());
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
  closeTransport(); attempts = 0; history = []; seriesBars = [];
  syncSeriesData([]);
  $('last-price').textContent = '—'; $('price-time').textContent = 'Henüz veri yok';
  const ohlc = $('ohlc'); ohlc.textContent = 'Gerçek piyasa verisi bekleniyor'; ohlc.style.color = '';
  updateUI();
  drawings.openMarket(symbol);
  try { mtf.setSymbol(symbol); } catch {}
  try { indicators.clear(); } catch {}
  try {
    const layout=JSON.parse(localStorage.getItem(layoutKey())||'null');
    pendingIndicators=layout?.indicators ?? JSON.parse(localStorage.getItem('alfa-ind:v1:'+symbol)||'null');
  } catch { pendingIndicators = null; }
  showMessage('Piyasa verileri yükleniyor…');
  connection('Geçmiş mumlar yükleniyor');
  connect(id, true);
}
function connectPolling(id, resetView, ref) {
  const controller = new AbortController(); aborter = controller;
  const quoteOnly = !ref.chartable;
  let ready = false, ended = false;
  lastReceipt = Date.now();
  const requestSignal = () => AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]);
  connection(quoteOnly ? 'TradingView canlı değer · mum geçmişi yok' : `${ref.venue} verisi bekleniyor`, 'waiting');
  showMessage(quoteOnly ? 'Bu sembol için mum geçmişi yok; yalnızca canlı değer gösterilir.' : `${ref.venue} verisi yükleniyor…`);
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
        syncSeriesData(history);
        quote();
        try { indicators.updateAll(seriesBars); } catch {}
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
      if (!history.length) showMessage(quoteOnly ? 'Canlı değer alınamadı. Otomatik yeniden denenecek.' :
        `${ref.venue} verisine erişilemiyor. Otomatik yeniden denenecek; fiyat üretilmez.`);
    }
  }
  tick();
  pollTimer = setInterval(tick, quoteOnly ? 30000 : 15000);
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
      setData(mergeCandles(history, [...data, ...buffered], Infinity), resetView);
      buffered = []; ready = true;
      showMessage('');
      connection('Geçmiş yüklendi · ilk canlı mum bekleniyor');
    } catch (error) {
      if (id === generation && !ended) reconnect('Geçmiş veri alınamadı');
    }
  };
  ws.onmessage = event => {
    if (replayMode) return;
    if (id !== generation || ended) return;
    try {
      const c = parseKline(event.data, symbol, interval);
      if (!c) return;
      lastReceipt = Date.now();
      if (!ready) { buffered.push(c); if (buffered.length > 2000) buffered.shift(); return; }
      if (c.time < history.at(-1).time) return;
      history = mergeCandles(history, [c], Infinity);
      seriesBars = history;
      syncSeriesUpdate(c, history);
      quote(); attempts = 0;
      try { checkAlarms(c.close); } catch {}
      try { indicators.updateAll(seriesBars); } catch {}
      try { sessionLevels.render(); } catch {}
      try { marketStructure.render(); } catch {}
      try { fvg.render(); } catch {}
      connection(`Canlı · ${new Date(lastReceipt).toLocaleTimeString('tr-TR')} · WebSocket`, 'live');
    } catch { reconnect('Veri doğrulanamadı'); }
  };
  ws.onclose = () => reconnect('WebSocket kesildi');
  ws.onerror = () => reconnect('WebSocket erişilemiyor');
  watchdog = setInterval(() => { if (Date.now() - lastReceipt > 30000) reconnect('Canlı veri gecikti'); }, 5000);
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
  onSelect: next => { if (symbol !== next) { symbol = next; loadMarket(); } },
  getAccessToken: marketAccessToken,
  onStatus: connection });
$('chart-type').addEventListener('change', e => { applyChartType(e.target.value); saveLayout(); });
let logScale = false;
$('log-scale').addEventListener('click', () => {
  logScale = !logScale;
  chart.priceScale('right').applyOptions({ mode: logScale ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal });
  $('log-scale').setAttribute('aria-pressed', String(logScale));
  $('log-scale').textContent = logScale ? 'Log✓' : 'Log';
  saveLayout();
});
$('auto-scale').addEventListener('click', () => {
  chart.priceScale('right').applyOptions({ autoScale: true });
  $('auto-scale').setAttribute('aria-pressed', 'true');
});
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

  const pad = Math.max(12, Math.round(canvas.width * 0.012));
  ctx.save();
  ctx.font = `600 ${Math.max(12, Math.round(canvas.width * 0.013))}px system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = 'rgba(215,224,238,0.78)';
  ctx.textBaseline = 'top';
  const stampLabel = new Date().toLocaleString('tr-TR');
  ctx.fillText(`ALFA CHARTS · ${symbol} · ${String(interval).toUpperCase()} · ${stampLabel}`, pad, pad);
  ctx.restore();
  return canvas;
}

function chartScreenshotName() {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
  return `alfa-charts-${String(symbol).toLowerCase()}-${String(interval).toLowerCase()}-${stamp}.png`;
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
document.addEventListener('fullscreenchange', () => { $('fullscreen').innerHTML = icon('fullscreen') + (document.fullscreenElement ? 'Tam ekrandan çık' : 'Tam ekran'); });
const drawings = new DrawingEngine({ chart, series: candles, host, getBars: () => seriesBars, getInterval: () => interval,
  onAlarm: (price, cond) => addQuickAlarm(price, cond), onAlarmManager: () => openAlarmManager(), getStudies: () => studiesUI });
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
// ---------- Price alarms (local-first) ----------
const ALARM_KEY = () => 'alfa-alarms:v1:' + currentUserKey();
function loadAlarms() { try { const v = JSON.parse(localStorage.getItem(ALARM_KEY()) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } }
function saveAlarms(list) { try { localStorage.setItem(ALARM_KEY(), JSON.stringify(list)); } catch {} }
let alarms = null;
function ensureAlarms() { if (!alarms) alarms = loadAlarms(); return alarms; }
function fireAlarm(a, price) {
  a.triggered = true; a.triggeredAt = Date.now(); a.triggerPrice = price;
  saveAlarms(alarms);
  const msg = `${a.symbol} ${a.cond === 'above' ? '≥' : '≤'} ${a.price} · şu an ${priceFormat.format(price)}${a.note ? ' · ' + a.note : ''}`;
  connection('🔔 Alarm: ' + msg, 'ok');
  try { if (Notification.permission === 'granted') new Notification('ALFA Charts Alarm', { body: msg }); } catch {}
  try { const ctx = new (window.AudioContext || window.webkitAudioContext)(); const o = ctx.createOscillator(); const g = ctx.createGain(); o.connect(g); g.connect(ctx.destination); o.frequency.value = 880; g.gain.value = .08; o.start(); setTimeout(() => { o.stop(); ctx.close(); }, 250); } catch {}
}
function checkAlarms(price) {
  if (!Number.isFinite(price)) return;
  for (const a of ensureAlarms()) {
    if (a.triggered || a.symbol !== symbol) continue;
    if ((a.cond === 'above' && price >= a.price) || (a.cond === 'below' && price <= a.price)) fireAlarm(a, price);
  }
}
function addQuickAlarm(price, cond) {
  if (!Number.isFinite(price) || price <= 0) return;
  ensureAlarms().push({ id: crypto.randomUUID(), symbol, price, cond, note: 'Grafik sağ tık', triggered: false, createdAt: Date.now() });
  saveAlarms(alarms);
  try { if (Notification.permission === 'default') Notification.requestPermission(); } catch {}
  connection(`Alarm eklendi: ${symbol} ${cond === 'above' ? '≥' : '≤'} ${priceFormat.format(price)}`, 'ok');
}
function openAlarmManager() {
  const mine = ensureAlarms().filter(a => a.symbol === symbol);
  const rows = mine.length ? mine.map(a => `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #242f42;"><span style="flex:1">${a.cond === 'above' ? '≥' : '≤'} ${escapeHTML(a.price)} ${a.triggered ? '· tetiklendi' : ''}${a.note ? ' · ' + escapeHTML(a.note) : ''}</span><button data-del-alarm="${escapeHTML(a.id)}">Sil</button></div>`).join('') : '<p style="color:#8e9eb6">Bu sembolde alarm yok.</p>';
  const m = openModal(`<h3 style="margin:0 0 8px;">🔔 Fiyat Alarmları · ${symbol}</h3>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
      <select id="alarm-cond" style="padding:8px;border-radius:8px;border:1px solid #30394b;background:#0b1018;color:#d7e0ee;"><option value="above">Fiyat ≥</option><option value="below">Fiyat ≤</option></select>
      <input id="alarm-price" type="number" step="any" placeholder="Fiyat" style="flex:1;min-width:120px;padding:8px;border-radius:8px;border:1px solid #30394b;background:#0b1018;color:#d7e0ee;">
      <input id="alarm-note" placeholder="Not (opsiyonel)" style="flex:1;min-width:120px;padding:8px;border-radius:8px;border:1px solid #30394b;background:#0b1018;color:#d7e0ee;">
      <button id="alarm-add" style="padding:8px 12px;border-radius:8px;border:1px solid #30394b;background:#2962ff;color:#fff;">Ekle</button>
    </div>
    <div id="alarm-list">${rows}</div>
    <div style="display:flex;justify-content:flex-end;margin-top:12px;"><button id="alarm-close" style="padding:8px 12px;border-radius:8px;border:1px solid #30394b;background:#151b26;color:#d7e0ee;">Kapat</button></div>`);
  m.box.querySelector('#alarm-add').addEventListener('click', async () => {
    const price = Number(m.box.querySelector('#alarm-price').value);
    if (!Number.isFinite(price) || price <= 0) { connection('Geçerli bir fiyat girin', 'error'); return; }
    const cond = m.box.querySelector('#alarm-cond').value;
    const note = m.box.querySelector('#alarm-note').value.trim().slice(0, 120);
    try { if (Notification.permission === 'default') await Notification.requestPermission(); } catch {}
    ensureAlarms().push({ id: crypto.randomUUID(), symbol, price, cond, note, triggered: false, createdAt: Date.now() });
    saveAlarms(alarms); m.close(); openAlarmManager();
    connection('Alarm eklendi', 'ok');
  });
  m.box.querySelectorAll('[data-del-alarm]').forEach(b => b.addEventListener('click', () => {
    alarms = ensureAlarms().filter(a => a.id !== b.dataset.delAlarm); saveAlarms(alarms); m.close(); openAlarmManager();
  }));
  m.box.querySelector('#alarm-close').addEventListener('click', m.close);
}
$('alarm-toggle').addEventListener('click', openAlarmManager);

const indicators = new IndicatorManager({ chart, getBars: () => seriesBars, onChange: () => { studiesUI?.sync(); drawings.updatePanel(); } });
const sessionLevels = new SessionLevelsManager({ series: candles, getBars: () => seriesBars });
const sessionBoxes = new SessionBoxesManager({ chart, series: candles, host, getBars: () => seriesBars, getInterval: () => interval, onChange: () => { studiesUI?.sync(); saveLayout(); } });
const marketStructure = new MarketStructureManager({ series: candles, getBars: () => seriesBars });
const fvg = new FvgManager({ chart, series: candles, host, getBars: () => seriesBars });
const mtf = new MtfManager({ chart, series: candles, host, getBars: () => seriesBars, getInterval: () => interval });
studiesUI = new ChartStudies({ indicators, catalog: INDICATOR_CATALOG, managers: {
  sessions: sessionBoxes, levels: sessionLevels, structure: marketStructure, fvg, mtf,
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
  drawings.dispose(); watchlist.dispose(); sessionBoxes.dispose(); observer.disconnect(); chart.remove();
}
window.addEventListener('pagehide', dispose, { once: true });
window.addEventListener('pageshow', e => { if (e.persisted) location.reload(); });
window.addEventListener('online', () => { if (!disposed&&!replayMode) loadMarket(); });
window.addEventListener('offline', () => { connection('İnternet bağlantısı yok · fiyat güncel değil', 'error'); });
// Yalnızca ?debug=1 ile açılan, arayüzü etkilemeyen teşhis kancası.
if (new URLSearchParams(location.search).has('debug')) {
  window.__alfaDebug = { chart, candles, line, drawings, watchlist, indicators, mtf, sessionLevels, sessionBoxes, marketStructure, fvg, studiesUI, paper, research, get replayClock(){return replayEngine?.clock;}, get loadingOlder() { return loadingOlder; }, get history() { return history; }, get ready() { return $('connection').dataset.state === 'live'; } };
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
  await enterReplay({target:Date.parse(v+'Z')/1000});
});

// ---------- UI: indicator manager, settings, MTF settings, persistence ----------
function currentUserKey() {
  try {
    const raw = sessionStorage.getItem('sb-zvnjslmptwmnuhftgqsr-auth-token') || localStorage.getItem('sb-zvnjslmptwmnuhftgqsr-auth-token');
    const j = raw ? JSON.parse(raw) : null;
    return (j && j.user && j.user.id) || 'guest';
  } catch { return 'guest'; }
}
function layoutKey() { return 'alfa-chart-layout:v1:' + currentUserKey() + ':' + symbol + ':' + interval; }
let cloudRevision = 0;
let cloudSaveTimer = null;
function layoutSettings() {
  return structuredClone({
    chartType: type, logScale, indicators: indicators.toJSON(), mtf: mtf.config,
    sessionLevels: sessionLevels.config, sessionBoxes: sessionBoxes.config,
    marketStructure: marketStructure.config, fvg: fvg.config, studies: studiesUI.toJSON(),
  });
}
function saveLayout() {
  if (replayMode) return; // Replay has its own session; never overwrite the live layout.
  const settings = layoutSettings();
  try {
    localStorage.setItem(layoutKey(), JSON.stringify(settings));
  } catch {}
  scheduleCloudSave(settings);
}
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
  let appliedStudies = false;
  try {
    const raw = JSON.parse(localStorage.getItem(layoutKey()) || 'null');
    if (raw) {
      if (typeof raw.chartType === 'string') applyChartType(raw.chartType);
      if (typeof raw.logScale === 'boolean') {
        logScale = raw.logScale;
        chart.priceScale('right').applyOptions({ mode: logScale ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal });
        const lb = $('log-scale'); if (lb) { lb.setAttribute('aria-pressed', String(logScale)); lb.textContent = logScale ? 'Log✓' : 'Log'; }
      }
      if (Array.isArray(raw.indicators)) indicators.fromJSON(raw.indicators);
      if (raw.mtf) mtf.config = { ...mtf.defaultConfig(), ...raw.mtf };
      if (raw.sessionLevels) sessionLevels.config = { ...sessionLevels.defaultConfig(), ...raw.sessionLevels };
      if (raw.sessionBoxes) applySessionBoxesConfig(raw.sessionBoxes);
      if (raw.marketStructure) marketStructure.config = { ...marketStructure.defaultConfig(), ...raw.marketStructure };
      if (raw.fvg) fvg.config = { ...fvg.defaultConfig(), ...raw.fvg };
      if (raw.studies) { studiesUI.apply(raw.studies); appliedStudies = true; }
    }
  } catch {}
  if (cloudSettings.isAuthed()) {
    const cloud = await cloudSettings.load(symbol, interval);
    if(replayMode || requestGeneration !== generation || requestOwner !== currentUserKey())return;
    if (cloud && cloud.settings) {
      const s = cloud.settings;
      if (typeof s.chartType === 'string') applyChartType(s.chartType);
      if (typeof s.logScale === 'boolean') { logScale = s.logScale; chart.priceScale('right').applyOptions({ mode: logScale ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal }); const lb=$('log-scale'); if(lb){lb.setAttribute('aria-pressed',String(logScale)); lb.textContent=logScale?'Log✓':'Log';} }
      if (Array.isArray(s.indicators)) { indicators.fromJSON(s.indicators); pendingIndicators = null; }
      if (s.mtf) mtf.config = { ...mtf.defaultConfig(), ...s.mtf };
      if (s.sessionLevels) sessionLevels.config = { ...sessionLevels.defaultConfig(), ...s.sessionLevels };
      if (s.sessionBoxes) applySessionBoxesConfig(s.sessionBoxes);
      if (s.marketStructure) marketStructure.config = { ...marketStructure.defaultConfig(), ...s.marketStructure };
      if (s.fvg) fvg.config = { ...fvg.defaultConfig(), ...s.fvg };
      if (s.studies) { studiesUI.apply(s.studies); appliedStudies = true; }
      cloudRevision = cloud.revision || 0;
      try { $('drawing-status').textContent = 'Bulut: yüklendi'; } catch {}
    }
  }
  if (!appliedStudies) {
    const initial = defaultStudyState();
    // Existing session preferences remain available, without auto-enabling the
    // old, very noisy market-structure and price-line layers.
    try { initial.sessions.added = !!localStorage.getItem('alfa-sb:v1') && Object.values(sessionBoxes.config.enabled).some(Boolean); } catch {}
    studiesUI.apply(initial);
  }
  studiesUI.sync();
}
function scheduleCloudSave(settings = layoutSettings()) {
  if(replayMode)return;
  if (!cloudSettings.isAuthed()) return;
  const requestSymbol = symbol, requestInterval = interval, requestOwner = currentUserKey(), requestGeneration = generation;
  const revision = cloudRevision;
  clearTimeout(cloudSaveTimer);
  cloudSaveTimer = setTimeout(async () => {
    if(replayMode || cloudSettings.user?.id !== requestOwner)return;
    const res = await cloudSettings.save(requestSymbol, requestInterval, settings, revision);
    if (requestGeneration !== generation || requestOwner !== currentUserKey()) return;
    if (res.ok) { cloudRevision = res.revision || cloudRevision; try { $('drawing-status').textContent = 'Bulut: kaydedildi'; } catch {} }
    else if (res.error && /conflict|unique/i.test(res.error)) {
      // reload cloud and apply
      const cloud = await cloudSettings.load(requestSymbol, requestInterval);
      if (requestGeneration !== generation || requestOwner !== currentUserKey() || replayMode) return;
      if (cloud && cloud.settings) {
        const s = cloud.settings;
        if (typeof s.chartType === 'string') applyChartType(s.chartType);
        if (typeof s.logScale === 'boolean') { logScale = s.logScale; chart.priceScale('right').applyOptions({ mode: logScale ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal }); const lb=$('log-scale'); if(lb){lb.setAttribute('aria-pressed',String(logScale)); lb.textContent=logScale?'Log✓':'Log';} }
        if (Array.isArray(s.indicators)) indicators.fromJSON(s.indicators);
        if (s.mtf) mtf.config = { ...mtf.defaultConfig(), ...s.mtf };
        if (s.sessionLevels) sessionLevels.config = { ...sessionLevels.defaultConfig(), ...s.sessionLevels };
        if (s.sessionBoxes) applySessionBoxesConfig(s.sessionBoxes);
        if (s.marketStructure) marketStructure.config = { ...marketStructure.defaultConfig(), ...s.marketStructure };
        if (s.fvg) fvg.config = { ...fvg.defaultConfig(), ...s.fvg };
        if (s.studies) studiesUI.apply(s.studies);
        cloudRevision = cloud.revision || cloudRevision;
        try { $('drawing-status').textContent = 'Çakışma çözüldü · bulut sürümü uygulandı'; } catch {}
      }
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
document.querySelectorAll('[data-range]').forEach(b => b.addEventListener('click', () => {
  if (!history.length) return;
  document.querySelectorAll('[data-range]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  if (b.dataset.range === 'all') { chart.timeScale().fitContent(); return; }
  const count = Number(b.dataset.range) / candleCloseTime(0, interval);
  chart.timeScale().setVisibleLogicalRange({ from: history.length - Math.max(10, count), to: history.length + 3 });
}));
let viewConfig = { grid: true, axisLabels: false, clean: false };
try {
  const raw = JSON.parse(localStorage.getItem('alfa-chart-view:v1') || 'null');
  for (const k of Object.keys(viewConfig)) if (typeof raw?.[k] === 'boolean') viewConfig[k] = raw[k];
} catch {}
function applyViewConfig() {
  chart.applyOptions({ grid: { vertLines: { visible: viewConfig.grid }, horzLines: { visible: viewConfig.grid } } });
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
for (const [id, key] of [['view-grid', 'grid'], ['view-axis-labels', 'axisLabels'], ['view-clean', 'clean']]) {
  $(id).addEventListener('change', e => {
    viewConfig[key] = e.target.checked; applyViewConfig();
    try { localStorage.setItem('alfa-chart-view:v1', JSON.stringify(viewConfig)); } catch {}
  });
}
applyViewConfig();
loadMarket();
