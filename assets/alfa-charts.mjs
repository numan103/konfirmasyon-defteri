import { createChart, CandlestickSeries, LineSeries, AreaSeries, BarSeries, HistogramSeries, ColorType, CrosshairMode, PriceScaleMode } from './vendor/lightweight-charts-5.0.9/lightweight-charts.standalone.production.mjs';
import { TIMEFRAMES, SYMBOLS, STREAM_ORIGINS, fetchHistory, streamURL, parseKline, mergeCandles } from './alfa-charts-data.mjs?v=4';
import { DrawingEngine } from './alfa-drawings.mjs?v=4';
import { IndicatorManager, INDICATOR_CATALOG } from './alfa-indicators.mjs?v=2';
import { SessionLevelsManager } from './alfa-session-levels.mjs?v=4';
import { MarketStructureManager } from './alfa-market-structure.mjs?v=1';
import { FvgManager } from './alfa-fvg.mjs?v=1';
import { MtfManager } from './alfa-mtf.mjs?v=2';
import { ReplayEngine, candleCloseTime } from './alfa-replay-model.mjs?v=3';
import { replayRange } from './alfa-replay-data.mjs?v=1';
import { DrawingHistory, emptyDocument } from './alfa-drawings-model.mjs?v=2';
import { ChartSettingsStore } from './alfa-chart-settings-store.mjs?v=1';
import { PaperTradingPanel } from './alfa-paper.mjs?v=4';
import { ResearchPanel } from './alfa-research.mjs?v=3';
import { packetBars,validatePacket } from './alfa-research-model.mjs?v=1';

const $ = id => document.getElementById(id);
const workspace = document.querySelector('.workspace');
const host = $('chart');
const priceFormat = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const chart = createChart(host, {
  layout: { background: { type: ColorType.Solid, color: '#10141c' }, textColor: '#8e9eb6', attributionLogo: true },
  grid: { vertLines: { color: '#1b2433' }, horzLines: { color: '#1b2433' } },
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
let history = [], seriesBars = [], socket, aborter, retryTimer, watchdog, generation = 0, attempts = 0;
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
    if(!SYMBOLS.includes(session.symbol) || !Object.values(TIMEFRAMES).includes(session.timeframe)){
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
  $('last-price').textContent = priceFormat.format(c.close) + ' USDT';
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
    if (SYMBOLS.includes(s)) symbol = s;
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
  const more = document.createElement('button'); more.type = 'button'; more.textContent = 'TF+'; more.title = 'Zaman dilimi favorileri ve özel periyotlar';
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
for (const item of SYMBOLS) {
  const b = document.createElement('button'); b.type = 'button'; b.className = 'watch-row'; b.dataset.symbol = item;
  const name = document.createElement('strong'); name.textContent = item;
  const venue = document.createElement('small'); venue.textContent = 'SPOT';
  b.append(name, venue); b.addEventListener('click', () => { if (symbol !== item) { symbol = item; loadMarket(); } });
  $('watch-rows').append(b);
}
$('symbol').addEventListener('change', e => { symbol = e.target.value; loadMarket(); });
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
  chart.timeScale().fitContent();
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
document.addEventListener('fullscreenchange', () => { $('fullscreen').textContent = document.fullscreenElement ? 'Küçült' : 'Tam ekran'; });
const drawings = new DrawingEngine({ chart, series: candles, host, getBars: () => seriesBars, getInterval: () => interval });
try {
  const magOn = localStorage.getItem('alfa-magnet:v1') === '1';
  drawings.setMagnet(magOn);
  const mb = $('magnet-toggle'); if (mb) mb.setAttribute('aria-pressed', String(magOn));
  const vis = localStorage.getItem('alfa-drawings-visible:v1') !== '0';
  drawings.setDrawingsVisible(vis);
  const vb = $('drawings-toggle'); if (vb) { vb.setAttribute('aria-pressed', String(vis)); vb.textContent = vis ? '👁 Çizimler' : '👁‍🗨 Gizli'; }
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
  vb.textContent = on ? '👁 Çizimler' : '👁‍🗨 Gizli';
});
const indicators = new IndicatorManager({ chart, getBars: () => seriesBars });
const sessionLevels = new SessionLevelsManager({ series: candles, getBars: () => seriesBars });
const marketStructure = new MarketStructureManager({ series: candles, getBars: () => seriesBars });
const fvg = new FvgManager({ chart, series: candles, host, getBars: () => seriesBars });
const mtf = new MtfManager({ chart, series: candles, host, getBars: () => seriesBars, getInterval: () => interval });
const paper = new PaperTradingPanel({
  series:candles,owner:currentUserKey,pause:pauseReplay,
  getReplay:()=>replayMode&&replayEngine?{bars:history,clock:replayEngine.clock}:null,
  onPersist:()=>{if(replayMode)$('replay-save').click();}
});
const research = new ResearchPanel({getOwner:currentUserKey,isReplayActive:()=>replayMode,
  onOpen:packet=>enterReplay({session:packet.replay,researchPacket:packet})});
mtf.onReplayError=(tf)=>{if(replayMode){pauseReplay();connection(tf+' replay verisi yüklenemedi · duraklatıldı','error');}};
const cloudSettings = new ChartSettingsStore(msg => { try { $('drawing-status').textContent = msg; } catch {} }, user => {
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
function dispose() { pauseReplay(); research.dispose(); paper.stop(); disposed = true; ++generation; closeTransport(); drawings.dispose(); observer.disconnect(); chart.remove(); }
window.addEventListener('pagehide', dispose, { once: true });
window.addEventListener('pageshow', e => { if (e.persisted) location.reload(); });
window.addEventListener('online', () => { if (!disposed&&!replayMode) loadMarket(); });
window.addEventListener('offline', () => { connection('İnternet bağlantısı yok · fiyat güncel değil', 'error'); });
// Yalnızca ?debug=1 ile açılan, arayüzü etkilemeyen teşhis kancası.
if (new URLSearchParams(location.search).has('debug')) {
  window.__alfaDebug = { chart, candles, line, drawings, indicators, mtf, sessionLevels, paper, research, get replayClock(){return replayEngine?.clock;}, get loadingOlder() { return loadingOlder; }, get history() { return history; }, get ready() { return $('connection').dataset.state === 'live'; } };
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
$('indicator-add').addEventListener('change', e => {
  const type = e.target.value;
  if (!type) return;
  try { indicators.add(type); localStorage.setItem('alfa-ind:v1:' + symbol, JSON.stringify(indicators.toJSON())); } catch {}
  e.target.value = '';
});
$('goto-date-btn').addEventListener('click', async () => {
  const v = $('goto-date').value;
  if (!v) return;
  if(replayMode){connection('Önce mevcut replay oturumunu durdurun','error');return;}
  await enterReplay({target:Date.parse(v+'Z')/1000});
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
$('fvg-toggle').addEventListener('click', () => {
  const on = $('fvg-toggle').dataset.on !== '1';
  $('fvg-toggle').dataset.on = on ? '1' : '0';
  $('fvg-toggle').style.background = on ? '#2962ff' : '#151b26';
  fvg.setEnabled(on);
});
$('mtf-toggle').addEventListener('click', () => {
  const on = $('mtf-toggle').dataset.on !== '1';
  $('mtf-toggle').dataset.on = on ? '1' : '0';
  $('mtf-toggle').style.background = on ? '#2962ff' : '#151b26';
  mtf.setEnabled(on);
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
function saveLayout() {
  try {
    localStorage.setItem(layoutKey(), JSON.stringify({
      chartType: type,
      logScale,
      indicators: indicators.toJSON(),
      mtf: mtf.config,
      sessionLevels: sessionLevels.config,
      marketStructure: marketStructure.config,
      fvg: fvg.config,
    }));
  } catch {}
  scheduleCloudSave();
}
async function loadLayout() {
  if(replayMode)return;
  try {
    const raw = JSON.parse(localStorage.getItem(layoutKey()) || 'null');
    if (raw) {
      if (typeof raw.chartType === 'string') applyChartType(raw.chartType);
      if (typeof raw.logScale === 'boolean') {
        logScale = raw.logScale;
        chart.priceScale('right').applyOptions({ mode: logScale ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal });
        const lb = $('log-scale'); if (lb) { lb.setAttribute('aria-pressed', String(logScale)); lb.textContent = logScale ? 'Log✓' : 'Log'; }
      }
      if (Array.isArray(raw.indicators)) { indicators.clear(); for (const e of raw.indicators) indicators.add(e.type, e.params); }
      if (raw.mtf) mtf.config = { ...mtf.defaultConfig(), ...raw.mtf };
      if (raw.sessionLevels) sessionLevels.config = { ...sessionLevels.defaultConfig(), ...raw.sessionLevels };
      if (raw.marketStructure) marketStructure.config = { ...marketStructure.defaultConfig(), ...raw.marketStructure };
      if (raw.fvg) fvg.config = { ...fvg.defaultConfig(), ...raw.fvg };
    }
  } catch {}
  if (cloudSettings.isAuthed()) {
    const cloud = await cloudSettings.load(symbol, interval);
    if(replayMode)return;
    if (cloud && cloud.settings) {
      const s = cloud.settings;
      if (typeof s.chartType === 'string') applyChartType(s.chartType);
      if (typeof s.logScale === 'boolean') { logScale = s.logScale; chart.priceScale('right').applyOptions({ mode: logScale ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal }); const lb=$('log-scale'); if(lb){lb.setAttribute('aria-pressed',String(logScale)); lb.textContent=logScale?'Log✓':'Log';} }
      if (Array.isArray(s.indicators)) { indicators.clear(); for (const e of s.indicators) indicators.add(e.type, e.params); }
      if (s.mtf) mtf.config = { ...mtf.defaultConfig(), ...s.mtf };
      if (s.sessionLevels) sessionLevels.config = { ...sessionLevels.defaultConfig(), ...s.sessionLevels };
      if (s.marketStructure) marketStructure.config = { ...marketStructure.defaultConfig(), ...s.marketStructure };
      if (s.fvg) fvg.config = { ...fvg.defaultConfig(), ...s.fvg };
      cloudRevision = cloud.revision || 0;
      try { $('drawing-status').textContent = 'Bulut: yüklendi'; } catch {}
    }
  }
}
function scheduleCloudSave() {
  if(replayMode)return;
  if (!cloudSettings.isAuthed()) return;
  clearTimeout(cloudSaveTimer);
  cloudSaveTimer = setTimeout(async () => {
    if(replayMode)return;
    const settings = {
      chartType: type,
      logScale,
      indicators: indicators.toJSON(),
      mtf: mtf.config,
      sessionLevels: sessionLevels.config,
      marketStructure: marketStructure.config,
      fvg: fvg.config,
    };
    const res = await cloudSettings.save(symbol, interval, settings, cloudRevision);
    if (res.ok) { cloudRevision = res.revision || cloudRevision; try { $('drawing-status').textContent = 'Bulut: kaydedildi'; } catch {} }
    else if (res.error && /conflict|unique/i.test(res.error)) {
      // reload cloud and apply
      const cloud = await cloudSettings.load(symbol, interval);
      if (cloud && cloud.settings) {
        const s = cloud.settings;
        if (typeof s.chartType === 'string') applyChartType(s.chartType);
        if (typeof s.logScale === 'boolean') { logScale = s.logScale; chart.priceScale('right').applyOptions({ mode: logScale ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal }); const lb=$('log-scale'); if(lb){lb.setAttribute('aria-pressed',String(logScale)); lb.textContent=logScale?'Log✓':'Log';} }
        if (Array.isArray(s.indicators)) { indicators.clear(); for (const e of s.indicators) indicators.add(e.type, e.params); }
        if (s.mtf) mtf.config = { ...mtf.defaultConfig(), ...s.mtf };
        if (s.sessionLevels) sessionLevels.config = { ...sessionLevels.defaultConfig(), ...s.sessionLevels };
        if (s.marketStructure) marketStructure.config = { ...marketStructure.defaultConfig(), ...s.marketStructure };
        if (s.fvg) fvg.config = { ...fvg.defaultConfig(), ...s.fvg };
        cloudRevision = cloud.revision || cloudRevision;
        try { $('drawing-status').textContent = 'Çakışma çözüldü · bulut sürümü uygulandı'; } catch {}
      }
    } else {
      try { $('drawing-status').textContent = res.offline ? 'Çevrimdışı · yerel kayıt' : 'Bulut hatası · yerel kayıt'; } catch {}
    }
  }, 800);
}

function openModal(html) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px;';
  const box = document.createElement('div');
  box.style.cssText = 'background:#151b26;border:1px solid #30394b;border-radius:12px;padding:16px;max-width:720px;width:100%;max-height:80vh;overflow:auto;color:#d7e0ee;';
  box.innerHTML = html;
  overlay.append(box);
  document.body.append(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  return { overlay, box, close };
}

function openIndicatorManager() {
  const favs = JSON.parse(localStorage.getItem('alfa-ind-fav:v1') || '[]');
  const recent = JSON.parse(localStorage.getItem('alfa-ind-recent:v1') || '[]');
  const cats = ['Trend', 'Momentum', 'Volatility', 'Volume'];
  const list = INDICATOR_CATALOG;
  const modal = openModal(`
    <h3 style="margin:0 0 10px;">İndikatörler</h3>
    <input id="ind-search" placeholder="Ara (ema, rsi, macd...)" style="width:100%;padding:8px;border-radius:8px;border:1px solid #30394b;background:#0b1018;color:#d7e0ee;margin-bottom:10px;">
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">
      <button data-cat="all" class="ind-cat">Tümü</button>
      ${cats.map(c => `<button data-cat="${c}" class="ind-cat">${c}</button>`).join('')}
      <button data-cat="fav" class="ind-cat">Favoriler</button>
      <button data-cat="recent" class="ind-cat">Son kullanılan</button>
    </div>
    <div id="ind-list" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:6px;"></div>
    <h4 style="margin:12px 0 6px;">Aktif indikatörler</h4>
    <div id="ind-active"></div>
    <div style="margin-top:12px;text-align:right;"><button id="ind-close">Kapat</button></div>
  `);
  const search = modal.box.querySelector('#ind-search');
  const listEl = modal.box.querySelector('#ind-list');
  const activeEl = modal.box.querySelector('#ind-active');
  let cat = 'all';
  function renderList() {
    const q = search.value.trim().toLowerCase();
    let items = list;
    if (cat === 'fav') items = list.filter(i => favs.includes(i.id));
    else if (cat === 'recent') items = list.filter(i => recent.includes(i.id));
    else if (cat !== 'all') items = list.filter(i => i.category === cat);
    if (q) items = items.filter(i => i.name.toLowerCase().includes(q) || i.id.toLowerCase().includes(q));
    listEl.innerHTML = items.map(i => `<button data-add="${i.id}" style="padding:8px;border-radius:8px;border:1px solid #30394b;background:#1a2230;color:#d7e0ee;text-align:left;">${i.name}<br><small style="color:#8e9eb6;">${i.category}</small></button>`).join('');
    listEl.querySelectorAll('[data-add]').forEach(b => {
      b.onclick = () => {
        indicators.add(b.dataset.add);
        if (!recent.includes(b.dataset.add)) { recent.unshift(b.dataset.add); recent.splice(10); localStorage.setItem('alfa-ind-recent:v1', JSON.stringify(recent)); }
        saveLayout();
        renderActive();
      };
    });
  }
  function renderActive() {
    activeEl.innerHTML = indicators.list().map(i => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #2a3444;">
        <span>${i.type.toUpperCase()} ${JSON.stringify(i.params).slice(0,40)}</span>
        <span>
          <button data-edit="${i.id}">⚙</button>
          <button data-dup="${i.id}">⧉</button>
          <button data-del="${i.id}">✕</button>
        </span>
      </div>`).join('') || '<small style="color:#8e9eb6;">Aktif indikatör yok.</small>';
    activeEl.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { indicators.remove(b.dataset.del); saveLayout(); renderActive(); });
    activeEl.querySelectorAll('[data-dup]').forEach(b => b.onclick = () => {
      const it = indicators.items.find(x => x.id === b.dataset.dup);
      if (it) { indicators.add(it.type, { ...it.params }); saveLayout(); renderActive(); }
    });
    activeEl.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => { const it = indicators.items.find(x => x.id === b.dataset.edit); if (it) openIndicatorSettings(it); });
  }
  search.addEventListener('input', renderList);
  modal.box.querySelectorAll('.ind-cat').forEach(b => b.onclick = () => { cat = b.dataset.cat; renderList(); });
  modal.box.querySelector('#ind-close').onclick = modal.close;
  renderList(); renderActive();
}

function openIndicatorSettings(item) {
  const params = item.params;
  const inputs = Object.keys(params).map(k => {
    const v = params[k];
    if (k === 'source') {
      const opts = ['open','high','low','close','hl2','hlc3','ohlc4'].map(x => `<option value="${x}" ${v===x?'selected':''}>${x.toUpperCase()}</option>`).join('');
      return `<label style="display:block;margin:6px 0;">${k} <select data-k="${k}" style="padding:4px;border-radius:6px;border:1px solid #30394b;background:#0b1018;color:#d7e0ee;">${opts}</select></label>`;
    }
    if (typeof v === 'boolean') return `<label style="display:block;margin:6px 0;"><input type="checkbox" data-k="${k}" ${v ? 'checked' : ''}> ${k}</label>`;
    if (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) return `<label style="display:block;margin:6px 0;">${k} <input type="color" data-k="${k}" value="${v}"></label>`;
    return `<label style="display:block;margin:6px 0;">${k} <input type="number" step="any" data-k="${k}" value="${v}" style="padding:4px;border-radius:6px;border:1px solid #30394b;background:#0b1018;color:#d7e0ee;"></label>`;
  }).join('');
  const modal = openModal(`
    <h3 style="margin:0 0 10px;">${item.type.toUpperCase()} Ayarları</h3>
    ${inputs}
    <div style="margin-top:12px;text-align:right;">
      <button id="is-cancel">İptal</button>
      <button id="is-apply">Uygula</button>
    </div>
  `);
  modal.box.querySelector('#is-cancel').onclick = modal.close;
  modal.box.querySelector('#is-apply').onclick = () => {
    modal.box.querySelectorAll('[data-k]').forEach(inp => {
      const k = inp.dataset.k;
      if (inp.type === 'checkbox') params[k] = inp.checked;
      else if (inp.type === 'color') params[k] = inp.value;
      else if (inp.tagName === 'SELECT') params[k] = inp.value;
      else params[k] = Number(inp.value);
    });
    indicators.remove(item.id);
    indicators.add(item.type, { ...params });
    saveLayout();
    modal.close();
  };
}

function openMtfSettings() {
  const cfg = mtf.config;
  const htfOpts = ['15m','30m','1h','4h','1d','1w'];
  const modal = openModal(`
    <h3 style="margin:0 0 10px;">Multi-Timeframe Ayarları</h3>
    <label>HTF seçimi (çoklu):</label>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 12px;">
      ${htfOpts.map(t => `<label style="padding:4px 8px;border:1px solid #30394b;border-radius:6px;"><input type="checkbox" data-htf="${t}" ${cfg.htf.includes(t)?'checked':''}> ${t.toUpperCase()}</label>`).join('')}
    </div>
    <label><input type="checkbox" id="mtf-swings" ${cfg.showSwings?'checked':''}> Swing göster</label><br>
    <label><input type="checkbox" id="mtf-fvg" ${cfg.showFvg?'checked':''}> FVG göster</label><br>
    <label><input type="checkbox" id="mtf-ms" ${cfg.showMS?'checked':''}> Market Structure göster</label><br>
    <label><input type="checkbox" id="mtf-protected" ${cfg.showProtected?'checked':''}> Protected Levels</label><br>
    <label><input type="checkbox" id="mtf-bos" ${cfg.showBOS?'checked':''}> BOS</label><br>
    <label><input type="checkbox" id="mtf-choch" ${cfg.showCHoCH?'checked':''}> CHoCH</label><br>
    <label><input type="checkbox" id="mtf-ifvg" ${cfg.showIFVG?'checked':''}> IFVG</label><br>
    <label><input type="checkbox" id="mtf-confirmed" ${cfg.confirmedOnly?'checked':''}> Yalnızca onaylanmış (confirmed)</label><br>
    <label><input type="checkbox" id="mtf-extend" ${cfg.extend?'checked':''}> Bölgeyi sağa uzat</label>
    <div style="margin-top:12px;text-align:right;">
      <button id="mtf-cancel">İptal</button>
      <button id="mtf-apply">Uygula</button>
    </div>
  `);
  modal.box.querySelector('#mtf-cancel').onclick = modal.close;
  modal.box.querySelector('#mtf-apply').onclick = () => {
    const htf = [...modal.box.querySelectorAll('[data-htf]')].filter(x => x.checked).map(x => x.dataset.htf);
    mtf.updateConfig({
      htf: htf.length ? htf : ['1h'],
      showSwings: modal.box.querySelector('#mtf-swings').checked,
      showFvg: modal.box.querySelector('#mtf-fvg').checked,
      showMS: modal.box.querySelector('#mtf-ms').checked,
      showProtected: modal.box.querySelector('#mtf-protected').checked,
      showBOS: modal.box.querySelector('#mtf-bos').checked,
      showCHoCH: modal.box.querySelector('#mtf-choch').checked,
      showIFVG: modal.box.querySelector('#mtf-ifvg').checked,
      confirmedOnly: modal.box.querySelector('#mtf-confirmed').checked,
      extend: modal.box.querySelector('#mtf-extend').checked,
    });
    saveLayout();
    modal.close();
  };
}

// wire buttons
$('indicators-manage').addEventListener('click', () => { console.log('INDICATORS BUTTON CLICKED'); openIndicatorManager(); });
// replace MTF toggle behavior: open settings instead of just toggle
const mtfBtn = $('mtf-toggle');
mtfBtn.onclick = () => openMtfSettings();

// load layout after first data load: hook into setData by wrapping? We'll load in loadMarket before fetch.
const _origLoadMarket = loadMarket;
// patch: load layout when symbol changes
const _origOpenMarket = drawings.openMarket.bind(drawings);
drawings.openMarket = async (symbol, force) => {
  if(replayMode)exitReplay();
  if(replayMode)return;
  await _origOpenMarket(symbol, force);
  await loadLayout();
  cloudRevision = 0;
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

loadMarket();
