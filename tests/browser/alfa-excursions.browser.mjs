import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const arg=k=>process.argv.find(a=>a.startsWith('--'+k+'='))?.slice(k.length+3);
const {chromium}=await import(pathToFileURL(arg('playwright')));
const browser=await chromium.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],orders=[],lowerRequests=[],lowerResponses=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('request',r=>{if(/\/(order|orders|trade)(\?|$)/.test(new URL(r.url()).pathname))orders.push(r.url());});
page.on('request',r=>{const u=new URL(r.url());if(u.pathname.endsWith('/klines')&&u.searchParams.get('interval')==='1m')lowerRequests.push(r.url());});
page.on('response',r=>{const u=new URL(r.url());if(u.pathname.endsWith('/klines')&&u.searchParams.get('interval')==='1m')lowerResponses.push(r.status());});
const report=()=>page.evaluate(()=>window.__alfaDebug.paper.lab.excursions.report);
const waitReport=async n=>page.waitForFunction(n=>window.__alfaDebug.paper.lab.excursions.report?.summary.total===n,n);
const lab=()=>page.locator('#paper-panel [data-filter="lab"]').click();
const step=async(delta=1)=>{
  const clock=await page.evaluate(()=>window.__alfaDebug.replayClock);
  await page.click(delta>0?'#replay-next':'#replay-prev');
  await page.waitForFunction(c=>window.__alfaDebug.replayClock!==c,clock);
};
async function start(){
  const time=await page.evaluate(()=>window.__alfaDebug.history[600].time);
  await page.click('#replay-toggle');await page.fill('#replay-date',new Date(time*1000).toISOString().slice(0,16));
  await page.click('#replay-date-start');await page.waitForFunction(()=>document.body.classList.contains('replay-mode'));
  await page.click('#paper-toggle');
}
async function create(strategyId,direction){
  await page.locator('#paper-panel [data-filter="paper"]').click();
  const price=await page.evaluate(()=>window.__alfaDebug.history.at(-1).close);
  await page.locator('#paper-panel [data-action="new"]').click();
  const d=page.locator('.paper-dialog');
  await d.locator('[name="strategyId"]').selectOption(strategyId);
  await d.locator('[name="direction"]').selectOption(direction);
  await d.locator('[name="stopLoss"]').fill(String(price*(direction==='long'?.9:1.1)));
  await d.locator('[name="takeProfit"]').fill(String(price*(direction==='long'?2:.5)));
  await d.locator('[name="feeBps"]').fill('1');
  await d.locator('[type="submit"]').click();await d.waitFor({state:'detached'});
  await step();await page.locator('#paper-list [data-action="close"]').last().click();await step();
}
try{
  await page.goto((arg('url')||'http://127.0.0.1:4173')+'/alfa-charts.html?debug=1');
  await page.waitForFunction(()=>window.__alfaDebug?.ready&&window.__alfaDebug.drawings.ready,null,{timeout:45000});
  await page.locator('[data-interval="15m"]').click();
  await page.waitForFunction(()=>window.__alfaDebug.ready&&document.getElementById('market-title').textContent.includes('15M'));
  await start();await create('fib-0382','long');await create('ifvg','short');await lab();
  const frozen=await page.evaluate(()=>window.__alfaDebug.paper.state);
  await page.locator('[data-excursions-toggle]').click();await waitReport(2);
  let r=await report();assert.equal(r.summary.exact,2);assert.equal(r.summary.measured,2);
  assert.equal(r.groups.strategyId.length,2);
  // Independent check against full active entry candle plus ONLY the manual exit open.
  const expected=await page.evaluate(()=>window.__alfaDebug.paper.state.trades.map(t=>{
    const bars=window.__alfaDebug.history,entry=bars.find(b=>b.time===t.entryTime),exit=bars.find(b=>b.time===t.exitTime);
    const high=Math.max(t.entryPrice,entry.high,exit.open),low=Math.min(t.entryPrice,entry.low,exit.open);
    return {id:t.id,mae:(t.direction==='long'?t.entryPrice-low:high-t.entryPrice)/t.initialRiskPerUnit,
      mfe:(t.direction==='long'?high-t.entryPrice:t.entryPrice-low)/t.initialRiskPerUnit};
  }));
  for(const t of r.rows){
    const e=expected.find(e=>e.id===t.id);
    assert.ok(Math.abs(t.excursion.mae.r.lower-e.mae)<1e-12);assert.ok(Math.abs(t.excursion.mfe.r.lower-e.mfe)<1e-12);
    assert.equal(t.excursion.mae.r.lower,t.excursion.mae.r.upper);assert.equal(t.excursion.exitBoundary,'open');
  }
  assert.deepEqual(await page.evaluate(()=>window.__alfaDebug.paper.state),frozen);
  assert.equal(await page.locator('#lab-excursion-results svg').count(),9);
  assert.match(await page.locator('#excursion-trades').textContent(),/Closed Manual/);
  for(const strategyId of ['fib-0382','ifvg']){
    await page.locator('[data-lab-filter="strategyId"]').selectOption(strategyId);await waitReport(1);
    assert.equal((await report()).rows[0].strategyId,strategyId);
  }
  await page.locator('[data-lab-filter="strategyId"]').selectOption('');await waitReport(2);
  await step(-1);await waitReport(1);await step();await waitReport(2);
  // Exact primary measurements do not require unnecessary lower-timeframe requests.
  await page.locator('[data-excursions-precision]').selectOption('lower');await waitReport(2);
  assert.equal((await report()).summary.exact,2);
  r=await report();await page.click('#replay-save');await page.reload();
  await page.waitForFunction(()=>window.__alfaDebug?.drawings.ready);
  await page.click('#replay-toggle');await page.locator('#replay-saved button').first().click();
  await page.waitForFunction(()=>document.body.classList.contains('replay-mode'));await page.click('#paper-toggle');await lab();await waitReport(2);
  assert.deepEqual(await report(),r);
  // Explicit POST-HOC test design using an already-visible historical candle.
  // Rewind does not access hidden future data, and the lab watermark retains the retrospective provenance.
  await page.locator('[data-excursions-precision]').selectOption('primary');await waitReport(2);
  const planned=await page.evaluate(()=>[...window.__alfaDebug.history.slice(-6)].reverse().find(b=>b.high>b.open&&b.low<b.open));
  assert.ok(planned);
  while(await page.evaluate(()=>window.__alfaDebug.replayClock)>planned.time)await step(-1);
  await page.locator('#paper-panel [data-filter="paper"]').click();
  await page.locator('#paper-panel [data-action="new"]').click();
  const d=page.locator('.paper-dialog');
  await d.locator('[name="strategyId"]').selectOption('fib-0382');
  await d.locator('[name="entry"]').fill(String(planned.open));
  await d.locator('[name="stopLoss"]').fill(String(planned.low-planned.open*.001));
  await d.locator('[name="takeProfit"]').fill(String((planned.high+planned.open)/2));
  await d.locator('[type="submit"]').click();await d.waitFor({state:'detached'});
  const boundaryId=await page.evaluate(()=>window.__alfaDebug.paper.state.trades.at(-1).id);
  await step();await lab();
  await page.waitForFunction(id=>window.__alfaDebug.paper.lab.excursions.report?.rows.some(t=>t.id===id&&t.excursion.mae),boundaryId);
  const baseBoundary=(await report()).rows.find(t=>t.id===boundaryId).excursion;
  assert.equal(baseBoundary.exitReason,'Closed TP');assert.equal(baseBoundary.status,'bounded');
  assert.equal(baseBoundary.mae.exact,false);
  assert.ok(await page.locator('#lab-excursion-results rect[stroke="#e9ad50"]').count()>0);
  const beforeRefinement=await page.evaluate(()=>window.__alfaDebug.paper.state);
  await page.locator('[data-excursions-precision]').selectOption('lower');
  await page.waitForFunction(id=>window.__alfaDebug.paper.lab.excursions.report?.rows.some(t=>t.id===id&&
    (t.excursion.mae||t.excursion.status==='boundary-conflict')),boundaryId);
  const refined=(await report()).rows.find(t=>t.id===boundaryId).excursion;
  assert.ok(lowerRequests.length>0);assert.ok(lowerResponses.includes(200));
  if(refined.mae){
    assert.ok(refined.mae.r.lower>=baseBoundary.mae.r.lower-1e-10);
    assert.ok(refined.mae.r.upper<=baseBoundary.mae.r.upper+1e-10);
  }else{assert.equal(refined.status,'boundary-conflict');assert.equal(refined.mfe,null);}
  const horizon=await page.evaluate(()=>window.__alfaDebug.replayClock);
  for(const url of lowerRequests)assert.ok(Number(new URL(url).searchParams.get('endTime'))<horizon*1000);
  assert.deepEqual(await page.evaluate(()=>window.__alfaDebug.paper.state),beforeRefinement);
  const archivedCount=(await report()).summary.total;
  await page.click('#replay-save');
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.setViewportSize({width:1440,height:1000});
  await page.locator('#lab-excursion-analysis').scrollIntoViewIfNeeded();
  if(arg('screenshot'))await page.screenshot({path:arg('screenshot')});
  // A saved financial snapshot is not a price path and must not borrow the current symbol's candles.
  await page.click('#replay-stop');await page.waitForFunction(()=>window.__alfaDebug.ready,null,{timeout:45000});
  await page.locator('#symbol').selectOption('ETHUSDT');
  await page.waitForFunction(()=>window.__alfaDebug.ready&&document.getElementById('market-title').textContent.includes('ETHUSDT'));
  await start();await lab();await page.locator('[data-lab-filter="scope"]').selectOption('saved');
  await page.locator('[data-excursions-toggle]').click();await waitReport(archivedCount);
  assert.equal((await report()).summary.measured,0);assert.equal((await report()).summary.unavailable,archivedCount);
  assert.match(await page.locator('#lab-excursion-results').textContent(),/OHLC içermez/);
  const isolation=await page.evaluate(()=>{
    const p=window.__alfaDebug.paper,owner=p.owner;p.owner=()=> 'different-owner';p.update();p.owner=owner;
    return {context:p.lab.context,report:p.lab.excursions.report,cache:p.lab.excursions.cache.size};
  });
  assert.deepEqual(isolation,{context:null,report:null,cache:0});
  await page.click('#replay-stop');
  assert.deepEqual(errors,[]);assert.deepEqual(orders,[]);
  console.log(JSON.stringify({passed:true,source:'real Binance',manualTrades:2,postHocBoundaryTestTrade:1,longShort:true,strategyFilters:true,
    independentActiveOhlcCheck:true,immutableTradingState:true,graphs:9,rewind:true,saveRestore:true,archiveNoFabrication:true,
    lowerModeExactNoExtraFetch:true,realLowerTimeframeFetch:true,noFutureRequests:true,boundedScatter:true,
    responsive:true,simulatedOwnerIsolation:true,pageErrors:errors,realOrderRequests:0}));
}finally{await browser.close();}
