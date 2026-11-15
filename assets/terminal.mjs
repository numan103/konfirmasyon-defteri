import { parseWatchlist, marketSource, candleRequest, normalizeCandles, backtestEMA, parseCandleCSV } from './terminal-model.mjs?v=3';
import { connectFeed, mergeLive } from './terminal-stream.mjs?v=3';

const page = document.getElementById('page-trading');
const KEY = 'alfa-watchlist';
const DEFAULT = ['BINANCE:BTCUSDT', 'BINANCE:ETHUSDT', 'FX:EURUSD', 'FX:GBPUSD', 'TVC:GOLD'];
let list = [], selected = DEFAULT[0], interval = '60', chart, candles, poll, aborter;
let version = 0, active = false, userId = '', loadedUser = '', embedded = false, libPromise;
let indicators = {}, indicatorSeries = {};
let history = [], replayIndex = null, replayTimer, drawingTool = 'cursor', drawingPoints = [], drawingBook = {}, drawn = [];
let library, chartReady = false;
let disconnectFeed, resizeObserver, liveState = 'connecting', liveAt = 0, replayNeedsReset = false, pendingOverlay;
let undoStack = [], redoStack = [], alerts = [];
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
button('↶ Geri', () => { if (window.history.length > 1) window.history.back(); else showPage('home'); }, top);
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
const fallback = button('CSV yükle', () => csvFile.click(), top);
const csvFile = node('input'); csvFile.type = 'file'; csvFile.accept = '.csv,text/csv'; csvFile.hidden = true; page.append(csvFile);
csvFile.addEventListener('change', async () => {
  const file = csvFile.files[0];
  const generation=version;
  if (!file || !chart) return;
  if (file.size > 2000000) { status.textContent = 'CSV en fazla 2 MB olmalı.'; return; }
  try {
    const data = parseCandleCSV(await file.text());
    if(generation!==version||!active)return;
    if (!data.length) throw new Error('CSV içinde geçerli mum bulunamadı.');
    version++;aborter?.abort();disconnectFeed?.(); clearTimeout(poll); history = data.slice(-10000); chartReady = true;
    canvas.querySelector('.term-help')?.remove();
    replayIndex = null; replayNeedsReset = true; paintCandles(); paintDrawings();
    status.textContent = `${selected} · CSV · ${history.length} mum · Canlı veri değildir.`;
  } catch (e) { status.textContent = e.message; }
});
const body = node('div', null, 'term-body');
button('☰ Liste', () => { body.classList.toggle('no-list'); }, top);
const workspace = node('div', null, 'term-workspace');
const tools = node('nav', null, 'term-tools'); tools.setAttribute('aria-label', 'Çizim araçları');
const toolButtons = {};
[['cursor', '↖', 'İmleç'], ['level', '━', 'Yatay seviye: grafiğe bir kez tıkla'], ['trend', '╱', 'Trend: iki noktaya tıkla'], ['risk', 'R', 'Risk/getiri: giriş, stop ve hedefe sırayla tıkla']].forEach(([tool, icon, title]) => {
  const b = button(icon, () => setTool(tool), tools); b.title = title; b.setAttribute('aria-label', title); toolButtons[tool] = b;
});
button('↶', () => undoDrawing(), tools).setAttribute('aria-label', 'Çizimi geri al');
button('↷', () => redoDrawing(), tools).setAttribute('aria-label', 'Çizimi ileri al');
button('⌖', () => chart?.scrollToRealTime(), tools).setAttribute('aria-label', 'Son muma dön');
const overlaySelect = node('select'); overlaySelect.setAttribute('aria-label', 'Diğer çizim araçları'); overlaySelect.title = 'Diğer çizim araçları';
overlaySelect.addEventListener('change', () => { if (overlaySelect.value) startOverlay(overlaySelect.value); });
tools.append(overlaySelect);
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
const searchStatus = node('p', 'Borsa, spot ve vadeli ayrımı korunur. Kripto dışındaki ürünler için şu an CSV veri yüklemek gerekir; canlı forex kaynağı henüz bağlı değil.');
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
  selected = symbol;
  render(); openChart(); searchDialog.close();
}
function paintSearch() {
  const q = searchInput.value.trim().toUpperCase(); searchResults.replaceChildren();
  const exact = parseWatchlist(q).symbols;
  const matches = [...new Set([...exact, ...list, ...catalog])].filter(s => !q || s.includes(q)).slice(0, 60);
  matches.forEach(symbol => {
    const row = node('div', null, 'term-search-row');
    button(symbol + (marketSource(symbol).native ? ' · Borsa' : ' · CSV gerekli'), () => chooseSymbol(symbol), row);
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
const indicatorSearch=node('input');indicatorSearch.type='search';indicatorSearch.placeholder='İndikatör ara: MACD, RSI, BOLL…';indicatorSearch.className='term-search-input';indicatorSearch.setAttribute('aria-label','İndikatör ara');
const indicatorOptions=node('div',null,'term-indicator-options');indicatorDialog.append(indicatorSearch,indicatorOptions);
indicatorSearch.addEventListener('input',()=>{
  [...indicatorOptions.children].forEach(label=>{label.hidden=!label.textContent.toUpperCase().includes(indicatorSearch.value.toUpperCase());});
});
function refreshIndicatorOptions(){
  indicatorOptions.replaceChildren();
  library.getSupportedIndicators().forEach(name=>{
    const label=node('label',null,'term-indicator-option'),input=node('input');input.type='checkbox';input.checked=!!indicators[name];
    input.addEventListener('change',()=>{indicators[name]=input.checked;configureIndicators();});
    label.append(input,node('span',name+({EMA:' 20',MA:' 50',RSI:' 14'}[name]||'')));indicatorOptions.append(label);
  });
}
indicatorDialog.append(node('p', 'Açık kaynak KLineChart indikatörleri. Pine Script çalıştırılmaz. Boşluğa tıklayarak veya Esc ile kapatabilirsin.'));
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

// Native dialogs dismiss on backdrop click without treating clicks in padding as outside.
[dialog,searchDialog,indicatorDialog,testDialog].forEach(d=>d.addEventListener('click',e=>{
  if(e.target!==d)return;
  const r=d.getBoundingClientRect();
  if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();
}));
const contextMenu=node('div',null,'term-context');contextMenu.hidden=true;contextMenu.setAttribute('role','menu');page.append(contextMenu);
let contextPrice=null;
const alarmDialog=node('dialog',null,'term-dialog');
alarmDialog.append(node('h2','Fiyat uyarısı'));
alarmDialog.append(node('p','Yalnızca bu terminal ve sekme açıkken, canlı kripto akışında çalışır. Sunucu alarmı veya Telegram bildirimi değildir. Replay/CSV sırasında çalışmaz.'));
const alarmPrice=node('input');alarmPrice.type='number';alarmPrice.min='0';alarmPrice.step='any';alarmPrice.className='term-search-input';alarmPrice.setAttribute('aria-label','Alarm fiyatı');
alarmDialog.append(alarmPrice);
button('Uyarı ekle',()=>{
  const price=Number(alarmPrice.value);
  if(!(price>0)||!marketSource(selected).native){status.textContent='Canlı kripto için geçerli bir fiyat gir.';return;}
  alerts.push({symbol:selected,price,triggered:false});alarmDialog.close();
  status.textContent=`${selected} · ${price} uyarısı eklendi; yalnızca sekme açıkken çalışır.`;
},alarmDialog);
button('Kapat',()=>alarmDialog.close(),alarmDialog);page.append(alarmDialog);
alarmDialog.addEventListener('click',e=>{const r=alarmDialog.getBoundingClientRect();if(e.target===alarmDialog&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom))alarmDialog.close();});
const alertNotice=node('div',null,'term-alert');alertNotice.hidden=true;page.append(alertNotice);
function checkAlerts(symbol,previous,price){
  if(!Number.isFinite(previous)||replayIndex!==null)return;
  alerts.filter(a=>a.symbol===symbol&&!a.triggered&&(previous-a.price)*(price-a.price)<=0).forEach(a=>{
    a.triggered=true;alertNotice.replaceChildren(node('strong',`${symbol} fiyat uyarısı: ${a.price} · Şu an ${price}`));
    button('Kapat',()=>{alertNotice.hidden=true;},alertNotice);alertNotice.hidden=false;
  });
}
function updateFeedStatus(){
  if(replayIndex!==null||!history.length)return;
  const fresh=liveState==='live'&&Date.now()-liveAt<30000;
  status.textContent=`${selected} · ${fresh?'● CANLI WebSocket':'Canlı akış bağlanıyor; 15 sn REST yedeği'} · ${history.at(-1).close} · ${new Date(liveAt||Date.now()).toLocaleTimeString('tr-TR')} · KLineChart`;
}
function chartPoint(e){
  if(!chartReady)return null;
  const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
  const size=chart.getSize?.('candle_pane');
  if(size?.height&&y>size.height)return null;
  const p=chart.convertFromPixel([{x,y}],{paneId:'candle_pane'});
  const point=Array.isArray(p)?p[0]:p;
  return {point:{x,y},time:(point?.timestamp||visibleCandles()[point?.dataIndex]?.time*1000)/1000,price:point?.value};
}
canvas.addEventListener('click',e=>{if(drawingTool==='risk'){const p=chartPoint(e);if(p)drawingClick(p);}});
canvas.addEventListener('contextmenu',e=>{
  e.preventDefault();if(!chartReady)return;
  const p=chartPoint(e);contextPrice=p?.price;
  contextMenu.replaceChildren();
  const item=(title,fn)=>button(title,()=>{contextMenu.hidden=true;fn();},contextMenu);
  if(contextPrice>0){
    item(`Alarm ekle · ${contextPrice.toFixed(4)}`,()=>{alarmPrice.value=contextPrice;alarmDialog.showModal();});
    item('Bu fiyata yatay seviye',()=>{rememberDrawing();currentDrawings().push({tool:'level',points:[{time:visibleCandles().at(-1).time,price:contextPrice}]});paintDrawings();saveDrawings();});
  }
  item('Çizimi geri al',undoDrawing);item('Çizimi ileri al',redoDrawing);
  item('Son çizimi sil',()=>{if(currentDrawings().length){rememberDrawing();currentDrawings().pop();paintDrawings();saveDrawings();}});
  item('Son muma dön',()=>chart.scrollToRealTime());
  contextMenu.hidden=false;
  contextMenu.style.left=Math.max(0,Math.min(e.clientX,window.innerWidth-contextMenu.offsetWidth))+'px';
  contextMenu.style.top=Math.max(44,Math.min(e.clientY,window.innerHeight-contextMenu.offsetHeight-25))+'px';
});
document.addEventListener('pointerdown',e=>{if(!contextMenu.contains(e.target))contextMenu.hidden=true;});
document.addEventListener('keydown',e=>{
  if(!active||e.target.matches('input,textarea,select'))return;
  if(e.key==='Escape'){setTool('cursor');contextMenu.hidden=true;return;}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redoDrawing():undoDrawing();}
});

function visibleCandles() { return replayIndex === null ? history : history.slice(0, replayIndex + 1); }
function stopReplayTimer() { clearInterval(replayTimer); replayTimer = null; play.textContent = '▶ Oynat'; }
function toggleReplay(enable = replayIndex === null) {
  if (!chartReady) { status.textContent = 'Önce mumların yüklenmesini bekle.'; return; }
  stopReplayTimer();
  if (enable && history.length < 3) return;
  replayIndex = enable ? Math.min(history.length - 2, Math.max(1, Math.floor(history.length / 2))) : null;
  replayBar.hidden = !enable; replayButton.setAttribute('aria-pressed', String(enable));
  if (enable) { clearTimeout(poll); aborter?.abort(); disconnectFeed?.(); }
  else { openChart(); return; }
  replayNeedsReset = true; paintCandles(); paintDrawings(); chart.scrollToRealTime();
}
function stepReplay(delta) {
  if (replayIndex === null) return;
  replayIndex = Math.max(1, Math.min(history.length - 1, replayIndex + delta));
  replayNeedsReset = true; paintCandles(); paintDrawings(); chart?.scrollToRealTime();
  if (replayIndex === history.length - 1) stopReplayTimer();
}
function configureIndicators() {
  if (!chart || !library) return;
  Object.entries(indicatorSeries).forEach(([name, pane]) => chart.removeIndicator(pane, name));
  indicatorSeries = {};
  Object.entries(indicators).forEach(([name, enabled]) => {
    if (!enabled || !library.getSupportedIndicators().includes(name)) return;
    const params = {EMA:[20],MA:[50],RSI:[14]}[name];
    const main = ['EMA','MA','SMA','BOLL','SAR','BBI'].includes(name);
    const pane = chart.createIndicator({name,...(params?{calcParams:params}:{})},true,main?{id:'candle_pane'}:{height:120});
    if (pane) indicatorSeries[name]=pane;
  });
}
function paintCandles() {
  if (!chartReady) return;
  const data = visibleCandles().map(c=>({...c,timestamp:c.time*1000}));
  if (replayNeedsReset || !chart.getDataList().length) { chart.applyNewData(data,false); replayNeedsReset=false; }
  else if (data.length) chart.updateData(data.at(-1));
  if (replayIndex !== null) {
    replaySlider.max = String(history.length - 1); replaySlider.value = String(replayIndex);
    replayLabel.textContent = new Date(data.at(-1).time * 1000).toLocaleString('tr-TR');
    status.textContent = `MUM TEKRARI · ${selected} · ${data.length}/${history.length} mum gösteriliyor · Gelecek mumlar gizli`;
  }
}
function currentDrawings() { return drawingBook[selected + '|' + interval] ||= []; }
async function saveDrawings() {
  if (!userId) return;
  await store.set(DRAW_KEY, JSON.stringify(drawingBook));
}
function setTool(tool) {
  if (pendingOverlay && chart) chart.removeOverlay(pendingOverlay);
  pendingOverlay = null;
  drawingTool = tool; drawingPoints = [];
  Object.entries(toolButtons).forEach(([key, b]) => b.setAttribute('aria-pressed', String(key === tool)));
  status.textContent = { cursor: 'İmleç', level: 'Seviye için grafiğe tıkla.', trend: 'Trend için başlangıç ve bitişe tıkla.', risk: 'Sırayla giriş, stop ve hedef seviyelerine tıkla.' }[tool];
  if (tool === 'level') startOverlay('horizontalStraightLine');
  if (tool === 'trend') startOverlay('segment');
}
function rememberDrawing() { undoStack.push(JSON.stringify(currentDrawings())); undoStack=undoStack.slice(-100);redoStack=[]; }
async function undoDrawing() {
  setTool('cursor');
  if(!undoStack.length)return;
  redoStack.push(JSON.stringify(currentDrawings()));
  drawingBook[selected+'|'+interval]=JSON.parse(undoStack.pop()); paintDrawings();await saveDrawings();
}
async function redoDrawing() {
  setTool('cursor');
  if(!redoStack.length)return;
  undoStack.push(JSON.stringify(currentDrawings()));
  drawingBook[selected+'|'+interval]=JSON.parse(redoStack.pop());paintDrawings();await saveDrawings();
}
function startOverlay(name) {
  if(!chartReady)return;
  if(currentDrawings().length>=50){status.textContent='Bu grafik için en fazla 50 çizim.';return;}
  if(pendingOverlay)chart.removeOverlay(pendingOverlay);
  drawingTool='native';drawingPoints=[];
  pendingOverlay=chart.createOverlay({name,onDrawEnd:({overlay})=>{
    rememberDrawing();
    currentDrawings().push({tool:'native',name,points:overlay.points.map(p=>({time:(p.timestamp||history[p.dataIndex]?.time*1000)/1000,price:p.value})),extendData:overlay.extendData});
    chart.removeOverlay(overlay.id);pendingOverlay=null;drawingTool='cursor';saveDrawings();paintDrawings();return true;
  }});
  status.textContent=name+' · Grafikte noktaları seç; Esc ile iptal.';
}
function paintDrawings() {
  if (!chartReady) return;
  drawn.forEach(id=>chart.removeOverlay(id));drawn=[];
  currentDrawings().forEach((d,index) => {
    if (replayIndex !== null && d.points.some(p => p.time > visibleCandles().at(-1).time)) return;
    if (d.tool === 'native' || d.tool === 'trend') {
      if(!library.getSupportedOverlays().includes(d.name||'segment'))return;
      const id=chart.createOverlay({name:d.name||'segment',points:d.points.map(p=>({timestamp:p.time*1000,value:p.price})),extendData:d.extendData,onPressedMoveEnd:({overlay})=>{
        rememberDrawing();currentDrawings()[index].points=overlay.points.map(p=>({time:(p.timestamp||history[p.dataIndex]?.time*1000)/1000,price:p.value}));saveDrawings();return true;
      }});if(id)drawn.push(id);
    } else d.points.forEach((p, i) => {
      const labels = ['Giriş', 'Stop', 'Hedef'];
      const rr = d.tool === 'risk' ? Math.abs(d.points[2].price - d.points[0].price) / Math.abs(d.points[0].price - d.points[1].price) : 0;
      const value=chart.createOverlay({name:'horizontalStraightLine',lock:true,points:[{timestamp:p.time*1000,value:p.price}],styles:{line:{color:d.tool==='risk'?['#c7d0dd','#ee6c75','#39c59b'][i]:'#8a9bff'}},extendData:d.tool==='risk'?labels[i]+(i===2?` ${rr.toFixed(2)}R`:''):'Seviye'});
      if(value)drawn.push(value);
    });
  });
}
async function drawingClick(param) {
  if (drawingTool !== 'risk' || !param.point || typeof param.time !== 'number' || !chartReady) return;
  const price = param.price;
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
  rememberDrawing();drawings.push({ tool: drawingTool, points: drawingPoints }); setTool('cursor'); paintDrawings(); await saveDrawings();
  status.textContent = 'Çizim hesabına kaydedildi.';
}

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
    select.append(node('b', symbol.split(':')[1]), node('small', symbol.split(':')[0] + (marketSource(symbol).native ? ' · Borsa verisi' : ' · CSV gerekli')));
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
  version++; clearTimeout(poll); stopReplayTimer(); disconnectFeed?.(); resizeObserver?.disconnect(); aborter?.abort();
  if(chart) library.dispose(canvas); chart = null;
  undoStack=[];redoStack=[];pendingOverlay=null;liveAt=0;liveState='connecting';
  chartReady = false; history = []; replayIndex = null; drawn = []; indicatorSeries = {}; drawingPoints = [];
  replayBar.hidden = true; replayButton.setAttribute('aria-pressed', 'false'); testOutput.replaceChildren();
  canvas.replaceChildren();
}
function loadLibrary() {
  return libPromise ||= new Promise((resolve, reject) => {
    if (window.klinecharts) return resolve(window.klinecharts);
    const s = node('script');
    s.src = '/assets/klinecharts-9.8.12.js';
    s.onload = () => resolve(window.klinecharts); s.onerror = () => { libPromise = null; reject(new Error('Grafik kütüphanesi yüklenemedi.')); };
    document.head.append(s);
  });
}
async function openChart() {
  if (!active) return;
  dispose(); heading.textContent = selected + ' ⌕';
  window._tvSym = selected;
  const m = marketSource(selected);
  indicatorButton.disabled = false; replayButton.disabled = false; testButton.disabled = false; tools.hidden = false;
  workspace.classList.remove('term-embedded'); setTool('cursor');
  const generation = version, symbol = selected, tf = interval;
  status.textContent = `${symbol} · ${m.perpetual ? 'Vadeli' : 'Spot'} · Mumlar yükleniyor…`;
  try {
    const lib = await loadLibrary();
    if (generation !== version || !active) return;
    library = lib;
    lib.registerLocale('tr-TR',{time:'Zaman',open:'Açılış',high:'Yüksek',low:'Düşük',close:'Kapanış',volume:'Hacim'});
    lib.registerOverlay({name:'rectangle',totalStep:3,needDefaultPointFigure:true,createPointFigures:({coordinates})=>coordinates.length<2?[]:[{type:'rect',attrs:{x:Math.min(coordinates[0].x,coordinates[1].x),y:Math.min(coordinates[0].y,coordinates[1].y),width:Math.abs(coordinates[0].x-coordinates[1].x),height:Math.abs(coordinates[0].y-coordinates[1].y)},styles:{style:'stroke_fill',color:'#7b78f522',borderColor:'#8d9dff'}}]});
    chart = lib.init(canvas, {locale:'tr-TR',timezone:'Europe/Istanbul',styles:'dark'});
    resizeObserver=new ResizeObserver(()=>chart?.resize());resizeObserver.observe(canvas);
    overlaySelect.replaceChildren(node('option','⋮ Araçlar'));
    overlaySelect.firstElementChild.value='';
    library.getSupportedOverlays().forEach(name=>{const option=node('option',name);option.value=name;overlaySelect.append(option);});
    refreshIndicatorOptions();
    configureIndicators();
    if(!m.native){
      status.textContent=`${selected} · Bu ürün için bağımsız canlı veri kaynağı henüz bağlı değil. CSV yükleyerek analiz ve backtest yapabilirsin; canlı fiyat gösterilmez.`;
      canvas.append(node('p','Forex/endeks için canlı kaynak bağlı değil. Üstten OHLC CSV yükleyebilirsin. Format: timestamp,open,high,low,close,volume.','term-help'));
      return;
    }
    let first = true;
    const refresh = async () => {
      if (generation !== version || !active || document.hidden) return;
      try {
        aborter = new AbortController();
        const requestStarted=Date.now();
        const response = await fetch(candleRequest(symbol, tf), { signal: AbortSignal.any([aborter.signal, AbortSignal.timeout(12000)]) });
        if (!response.ok) throw new Error('Borsa erişimi kısıtlı veya geçici olarak kullanılamıyor.');
        let data = normalizeCandles(await response.json(), m.exchange);
        if (generation !== version || !active || replayIndex !== null) return;
        if (!data.length) throw new Error('Bu sembol için mum bulunamadı.');
        if(liveAt>requestStarted && history.length)data=mergeLive(data,history.at(-1));
        history = data; chartReady = true; if(first)replayNeedsReset=true;paintCandles();
        const last = data.at(-1).close;
        const precision = last < 1 ? 8 : last < 100 ? 4 : 2;
        chart.setPriceVolumePrecision(precision,2);
        if (first) { paintDrawings();chart.scrollToRealTime(); first = false; }
        updateFeedStatus();
      } catch (e) {
        if (generation !== version || replayIndex !== null) return;
        status.textContent = `${symbol} · ${e.message} Veri güncel olmayabilir.`;
      }
      if (generation === version && active && replayIndex === null) poll = setTimeout(refresh, 15000);
    };
    await refresh();
    if(generation===version && active && replayIndex===null)disconnectFeed=connectFeed(symbol,tf,candle=>{
      if(generation!==version||!active||replayIndex!==null||!chartReady)return;
      const previous=history.at(-1)?.close;
      history=mergeLive(history,candle);liveAt=Date.now();paintCandles();checkAlerts(symbol,previous,history.at(-1).close);updateFeedStatus();
    },state=>{if(generation===version){liveState=state;updateFeedStatus();}});
  } catch (e) {
    if (generation === version) { canvas.append(node('p', e.message, 'term-help')); status.textContent = 'Grafik yüklenemedi.'; }
  }
}
async function syncVisibility() {
  const visible = !page.classList.contains('hidden');
  document.body.classList.toggle('terminal-active', visible);
  if (!visible) { if (active) dispose(); active = false; return; }
  const id = (AUTH && AUTH.user) ? AUTH.user.id : 'anonymous';
  if (active && id === userId) return;
  active = true; userId = id;
  sharedListButton.hidden = !siteIsAdmin();
  if (loadedUser !== id) {
    const raw = await store.get(KEY);
    if (!active) return;
    try { const saved = JSON.parse(raw || 'null'); list = Array.isArray(saved) ? parseWatchlist(saved.join(',')).symbols : [...DEFAULT]; } catch { list = [...DEFAULT]; }
    const drawingsRaw = await store.get(DRAW_KEY);
    if (!active) return;
    drawingBook = {};
    try {
      const saved = JSON.parse(drawingsRaw || '{}');
      Object.entries(saved).slice(0, 200).forEach(([key, values]) => {
        if (!/^[A-Z0-9_]{2,24}:[A-Z0-9_.!/-]{1,40}\|(1|5|15|60|240|1440)$/.test(key) || !Array.isArray(values)) return;
        drawingBook[key] = values.filter(d => ['level','trend','risk','native'].includes(d?.tool) && Array.isArray(d.points) &&
          (d.tool==='native'?/^[a-zA-Z]{1,50}$/.test(d.name)&&d.points.length>=1&&d.points.length<=8:d.points.length === ({level:1,trend:2,risk:3}[d.tool])) &&
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
document.addEventListener('visibilitychange', () => { if (active) { if (document.hidden) { clearTimeout(poll); disconnectFeed?.(); aborter?.abort(); stopReplayTimer(); } else if (replayIndex === null) openChart(); } });
syncVisibility();
