import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const arg=k=>process.argv.find(a=>a.startsWith('--'+k+'='))?.slice(k.length+3);
const {chromium}=await import(pathToFileURL(arg('playwright')));
const browser=await chromium.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],orders=[],uploads=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('request',r=>{
  if(/\/(order|orders|trade)(\?|$)/.test(new URL(r.url()).pathname))orders.push(r.url());
  if(r.method()==='POST'&&/storage|upload/.test(r.url()))uploads.push(r.url());
});
const report=()=>page.evaluate(()=>window.__alfaDebug.paper.lab.report);
const doc=()=>page.evaluate(()=>window.__alfaDebug.paper.lab.serialize());
const lab=()=>page.locator('#paper-panel [data-filter="lab"]').click();
const paper=()=>page.locator('#paper-panel [data-filter="paper"]').click();
const step=async(delta=1)=>{
  const clock=await page.evaluate(()=>window.__alfaDebug.replayClock);
  await page.click(delta>0?'#replay-next':'#replay-prev');
  await page.waitForFunction(c=>window.__alfaDebug.replayClock!==c,clock);
};
async function startReplay(){
  const time=await page.evaluate(()=>window.__alfaDebug.history[600].time);
  await page.click('#lab-menu summary'); await page.click('#replay-toggle');
  await page.fill('#replay-date',new Date(time*1000).toISOString().slice(0,16));
  await page.click('#replay-date-start');
  await page.waitForFunction(()=>document.body.classList.contains('replay-mode'));
  await page.click('#paper-toggle');
}
async function create(strategyId,direction='long'){
  await paper();
  const price=await page.evaluate(()=>window.__alfaDebug.history.at(-1).close);
  await page.locator('#paper-panel [data-action="new"]').click();
  const dialog=page.locator('.paper-dialog');
  await dialog.locator('[name="strategyId"]').selectOption(strategyId);
  await dialog.locator('[name="direction"]').selectOption(direction);
  await dialog.locator('[name="stopLoss"]').fill(String(price*(direction==='long'?.9:1.1)));
  await dialog.locator('[name="takeProfit"]').fill(String(price*(direction==='long'?2:.5)));
  await dialog.locator('[name="feeBps"]').fill('1');
  await dialog.locator('button[type="submit"]').click();await dialog.waitFor({state:'detached'});
  return await page.evaluate(()=>window.__alfaDebug.paper.state.trades.at(-1).id);
}
async function tag(id,values,strategyId){
  await lab();await page.locator(`[data-lab-tag="${id}"]`).click();
  const dialog=page.locator('#lab-tag-dialog');
  if(strategyId)await dialog.locator('[name="strategyId"]').selectOption(strategyId);
  for(const [name,value] of Object.entries(values))await dialog.locator(`[name="${name}"]`).fill(value);
  await dialog.locator('[type="submit"]').click();await dialog.waitFor({state:'detached'});
}
async function closeLast(){
  await paper();await step();
  await page.locator('#paper-list [data-action="close"]').last().click();await step();await lab();
}
try{
  await page.goto((arg('url')||'http://127.0.0.1:4173')+'/alfa-charts.html?debug=1');
  await page.waitForFunction(()=>window.__alfaDebug?.ready&&window.__alfaDebug.drawings.ready,null,{timeout:45000});
  await page.locator('[data-interval="15m"]').click();
  await page.waitForFunction(()=>window.__alfaDebug.ready&&document.getElementById('market-title').textContent.includes('15M'));
  await startReplay();await lab();
  assert.equal((await report()).summary.totalTrades,0);
  assert.match(await page.locator('#strategy-lab').textContent(),/Düşük örneklem/);
  const fib=await create('fib-0382');
  await tag(fib,{session:'London',htfBias:'aligned',displacement:'yes',setupType:'Retracement',entryModel:'0.382',rrTarget:'2.5',notes:'Before entry'});
  assert.equal((await doc()).annotations[fib][0].provenance,'pre-entry');
  assert.equal(await page.locator('[data-lab-tag]').count(),1);
  await closeLast();
  const ifvg=await create('ifvg','short');await closeLast();
  await tag(ifvg,{session:'New York',htfBias:'countertrend',displacement:'no',setupType:'IFVG',entryModel:'Retest',rrTarget:'3',notes:'Reviewed after close'});
  assert.equal((await doc()).annotations[ifvg][0].provenance,'retrospective');
  let r=await report();assert.equal(r.summary.totalTrades,2);assert.equal(r.cohorts.strategyId.length,2);
  assert.equal(r.cohorts.session.length,2);assert.equal(r.cohorts.htfBias.length,2);assert.equal(r.cohorts.displacement.length,2);
  const frozen=await page.evaluate(()=>window.__alfaDebug.paper.state.trades.map(t=>[t.id,t.entryPrice,t.exitPrice,t.initialRisk,t.netR]));
  // Performance values are exactly the existing Tester calculation, not another formula implementation.
  await page.locator('#paper-panel [data-filter="tester"]').click();
  const tester=await page.evaluate(()=>window.__alfaDebug.paper.tester.report.summary);
  await lab();assert.deepEqual((await report()).summary,tester);
  for(const [key,value] of [['session','London'],['htfBias','aligned'],['displacement','yes'],['direction','long'],['strategyId','fib-0382']]){
    await page.locator(`[data-lab-filter="${key}"]`).selectOption(value);
    assert.equal((await report()).summary.totalTrades,1);
    await page.locator('[data-lab-reset]').click();
  }
  await page.locator('[data-lab-filter="knowledge"]').selectOption('pre-entry');
  assert.deepEqual((await report()).rows.map(t=>t.id),[fib]);
  await page.locator('[data-lab-reset]').click();
  await page.locator('[data-lab-group]').selectOption('displacement');
  assert.match(await page.locator('#lab-comparison').textContent(),/yes.*no/s);
  // Add an entirely user-defined strategy template and apply it retrospectively.
  await page.locator('[name="templateName"]').fill('Lab custom setup');
  await page.locator('[name="templateFields"]').fill('Liquidity sweep\nConfluence');
  await page.locator('#lab-template-form [type="submit"]').click();
  const custom=(await doc()).templates.find(t=>t.name==='Lab custom setup');assert.ok(custom);
  await page.locator(`[data-lab-tag="${fib}"]`).click();
  const dialog=page.locator('#lab-tag-dialog');
  await dialog.locator('[name="strategyId"]').selectOption(custom.id);
  await dialog.locator('[data-lab-custom]').first().fill('Observed later');
  await dialog.locator('[name="notes"]').fill('Later <script>not executable</script> review');
  await dialog.locator('[type="submit"]').click();await dialog.waitFor({state:'detached'});
  assert.equal((await doc()).annotations[fib].length,2);
  assert.equal((await report()).rows.find(t=>t.id===fib).strategyId,custom.id);
  assert.deepEqual(await page.evaluate(()=>window.__alfaDebug.paper.state.trades.map(t=>[t.id,t.entryPrice,t.exitPrice,t.initialRisk,t.netR])),frozen);
  await page.locator('[data-lab-filter="knowledge"]').selectOption('pre-entry');
  assert.equal((await report()).rows[0].strategyId,'fib-0382');
  await page.locator('[data-lab-reset]').click();
  // Edits made through the existing Tester journal also create a timed Lab revision.
  await page.locator('#paper-panel [data-filter="tester"]').click();
  await page.locator(`[data-journal-trade="${fib}"]`).click();
  await page.locator('#trade-journal-dialog [name="strategyId"]').selectOption('market-structure');
  await page.locator('#trade-journal-dialog [type="submit"]').click();
  await page.locator('#trade-journal-dialog').waitFor({state:'detached'});
  await lab();
  assert.equal((await doc()).annotations[fib].length,3);
  assert.equal((await report()).rows.find(t=>t.id===fib).strategyId,'market-structure');
  await page.locator('[data-lab-filter="knowledge"]').selectOption('pre-entry');
  assert.equal((await report()).rows[0].strategyId,'fib-0382');
  await page.locator('[data-lab-reset]').click();
  // Real OHLC scenario path: original manual-close commands remain in each alternate journal.
  await page.locator('[data-lab-scenarios]').click();
  await page.waitForFunction(()=>window.__alfaDebug.paper.lab.scenarios!==null);
  let scenarios=await page.evaluate(()=>window.__alfaDebug.paper.lab.scenarios);
  assert.equal(scenarios.results.length,6);
  assert.ok(scenarios.results.every(r=>r.status==='complete'&&r.result.status==='Closed Manual'),JSON.stringify(scenarios.results));
  for(const result of scenarios.results){
    assert.equal(result.result.netR,frozen.find(t=>t[0]===result.tradeId)[4]);
  }
  assert.match(await page.locator('#lab-scenarios').textContent(),/HİPOTETİK \/ AYRI/);
  await step(-1);assert.equal((await report()).summary.totalTrades,1);
  assert.equal(await page.evaluate(()=>window.__alfaDebug.paper.lab.scenarios),null);
  await step();assert.equal((await report()).summary.totalTrades,2);
  await page.locator('[data-lab-filter="session"]').selectOption('London');
  const savedDoc=await doc(),savedReport=await report();await page.click('#replay-save');
  await page.reload();await page.waitForFunction(()=>window.__alfaDebug?.drawings.ready);
  await page.click('#lab-menu summary'); await page.click('#replay-toggle');await page.locator('#replay-saved button').first().click();
  await page.waitForFunction(()=>document.body.classList.contains('replay-mode'));await page.click('#paper-toggle');await lab();
  assert.deepEqual(await doc(),savedDoc);assert.deepEqual(await report(),savedReport);
  // Future has already been observed: a rewind and a new pending order cannot be marked pre-entry.
  await page.locator('[data-lab-reset]').click();await step(-1);await step(-1);
  const rewindOrder=await create('custom');
  await tag(rewindOrder,{session:'Asia',htfBias:'aligned'});
  assert.equal((await doc()).annotations[rewindOrder][0].provenance,'retrospective');
  await paper();await page.locator(`#paper-list [data-id="${rewindOrder}"][data-action="cancel"]`).click();
  await step();await step();await lab();await page.click('#replay-save');
  // Aggregate a separate real ETH/1h replay, preserving all user/symbol/session boundaries.
  await page.click('#replay-stop');await page.waitForFunction(()=>window.__alfaDebug.ready,null,{timeout:45000});
  await page.locator('#symbol').selectOption('ETHUSDT');
  await page.waitForFunction(()=>window.__alfaDebug.ready&&document.getElementById('market-title').textContent.includes('ETHUSDT'));
  await page.locator('[data-interval="1h"]').click();
  await page.waitForFunction(()=>window.__alfaDebug.ready&&document.getElementById('market-title').textContent.includes('1H'));
  await startReplay();const eth=await create('fib-0382');
  await tag(eth,{session:'London',htfBias:'aligned',displacement:'yes',setupType:'Retracement',entryModel:'0.382',rrTarget:'2.5'});
  await closeLast();await lab();
  assert.equal((await report()).summary.totalTrades,1);
  await page.locator('[data-lab-filter="scope"]').selectOption('saved');
  assert.equal((await report()).summary.totalTrades,3);
  assert.equal((await report()).cohorts.symbol.length,2);assert.equal((await report()).cohorts.timeframe.length,2);
  await page.locator('[data-lab-filter="symbol"]').selectOption('BTCUSDT');
  assert.equal((await report()).summary.totalTrades,2);
  await page.locator('[data-lab-reset]').click();
  await page.locator('[data-lab-filter="timeframe"]').selectOption('1h');
  assert.equal((await report()).summary.totalTrades,1);
  await page.locator('[data-lab-reset]').click();
  await step(-1);assert.equal((await report()).summary.totalTrades,2); // Active rewind overrides saved ETH close.
  await step();assert.equal((await report()).summary.totalTrades,3);
  await page.locator('[data-lab-scenarios]').click();await page.waitForFunction(()=>window.__alfaDebug.paper.lab.scenarios!==null);
  scenarios=await page.evaluate(()=>window.__alfaDebug.paper.lab.scenarios);
  assert.equal(scenarios.results.length,3);assert.ok(scenarios.results.every(r=>r.tradeId===eth));
  // Quota protection includes the Lab document.
  await page.evaluate(()=>{
    window.__labSetItem=Storage.prototype.setItem;
    Storage.prototype.setItem=function(k,v){if(k.startsWith('alfa-paper:'))throw new DOMException('Quota','QuotaExceededError');return window.__labSetItem.call(this,k,v);};
  });
  await page.locator('[data-lab-filter="direction"]').selectOption('long');
  assert.match(await page.locator('#paper-status').textContent(),/Yerel kayıt başarısız/);
  assert.equal(await page.evaluate(()=>window.__alfaDebug.paper.unsaved.size),1);
  page.once('dialog',d=>d.dismiss());await page.click('#replay-stop');
  assert.equal(await page.evaluate(()=>document.body.classList.contains('replay-mode')),true);
  await page.evaluate(()=>{Storage.prototype.setItem=window.__labSetItem;delete window.__labSetItem;});
  await page.locator('[data-lab-reset]').click();
  assert.equal(await page.evaluate(()=>window.__alfaDebug.paper.unsaved.size),0);
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.equal(await page.locator('#strategy-lab').isVisible(),true);
  await page.setViewportSize({width:1440,height:1000});
  await page.locator('#paper-panel').evaluate(n=>n.scrollTop=0);
  if(arg('screenshot'))await page.screenshot({path:arg('screenshot')});
  const isolation=await page.evaluate(()=>{
    const p=window.__alfaDebug.paper,owner=p.owner;p.owner=()=> 'different-owner';let blocked=false;
    try{p.lab.commit(p.lab.serialize());}catch{blocked=true;}
    const serialized=p.serialize();p.update();p.owner=owner;
    return {blocked,serialized,cleared:p.lab.context===null&&p.engine===null};
  });
  assert.deepEqual(isolation,{blocked:true,serialized:null,cleared:true});
  await page.click('#replay-stop');await page.waitForFunction(()=>window.__alfaDebug.ready,null,{timeout:45000});
  assert.deepEqual(errors,[]);assert.deepEqual(orders,[]);assert.deepEqual(uploads,[]);
  console.log(JSON.stringify({passed:true,source:'real Binance',manualTrades:3,symbols:['BTCUSDT','ETHUSDT'],timeframes:['15m','1h'],
    preEntryAndRetrospective:true,rewindProvenance:true,customTemplate:true,cohorts:true,filters:true,
    realOhlcRrWithOriginalManualCloses:true,testerConsistency:true,saveReload:true,archiveActiveOverride:true,quotaProtection:true,
    simulatedOwnerIsolation:true,responsive:true,pageErrors:errors,realOrderRequests:0,imageUploads:0}));
}finally{await browser.close();}
