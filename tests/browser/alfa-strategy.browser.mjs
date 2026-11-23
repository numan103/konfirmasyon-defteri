import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const arg=k=>process.argv.find(a=>a.startsWith('--'+k+'='))?.slice(k.length+3);
const {chromium}=await import(pathToFileURL(arg('playwright')));
const browser=await chromium.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],orderRequests=[],imageUploads=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('request',r=>{
  if(/\/(order|orders|trade)(\?|$)/.test(new URL(r.url()).pathname))orderRequests.push(r.url());
  if(r.method()==='POST'&&/storage|upload/.test(r.url()))imageUploads.push(r.url());
});
const report=()=>page.evaluate(()=>window.__alfaDebug.paper.tester.report);
const doc=()=>page.evaluate(()=>window.__alfaDebug.paper.tester.serialize());
const step=async(delta=1)=>{
  const clock=await page.evaluate(()=>window.__alfaDebug.replayClock);
  await page.click(delta>0?'#replay-next':'#replay-prev');
  await page.waitForFunction(c=>window.__alfaDebug.replayClock!==c,clock);
};
const tester=async()=>page.locator('#paper-panel [data-filter="tester"]').click();
const paper=async()=>page.locator('#paper-panel [data-filter="all"]').first().click();
async function create(strategyId,direction){
  const price=await page.evaluate(()=>window.__alfaDebug.history.at(-1).close);
  await page.locator('#paper-panel [data-action="new"]').click();
  const d=page.locator('.paper-dialog');
  await d.locator('[name="strategyId"]').selectOption(strategyId);
  await d.locator('[name="direction"]').selectOption(direction);
  await d.locator('[name="stopLoss"]').fill(String(price*(direction==='long'?.5:2)));
  await d.locator('[name="takeProfit"]').fill(String(price*(direction==='long'?2:.5)));
  await d.locator('[name="feeBps"]').fill('1');
  await d.locator('button[type="submit"]').click();await d.waitFor({state:'detached'});
  await step();
  await page.locator('#paper-list [data-action="close"]').last().click();
  await step();
}
try{
  await page.goto((arg('url')||'http://127.0.0.1:4173')+'/alfa-charts.html?debug=1');
  await page.waitForFunction(()=>window.__alfaDebug?.ready&&window.__alfaDebug.drawings.ready,null,{timeout:45000});
  await page.locator('[data-interval="15m"]').click();
  await page.waitForFunction(()=>window.__alfaDebug.ready&&document.getElementById('market-title').textContent.includes('15M'));
  const time=await page.evaluate(()=>window.__alfaDebug.history[600].time);
  await page.click('#lab-menu summary'); await page.click('#replay-toggle');
  await page.fill('#replay-date',new Date(time*1000).toISOString().slice(0,16));
  await page.click('#replay-date-start');
  await page.waitForFunction(()=>document.body.classList.contains('replay-mode'));
  await page.click('#paper-toggle');await tester();
  assert.equal((await report()).summary.totalTrades,0);
  assert.equal(await page.locator('#strategy-tester svg').count(),0);
  await paper();await create('fib-0382','long');await create('ifvg','short');await tester();
  let r=await report();
  assert.equal(r.summary.totalTrades,2);assert.equal(r.comparison.length,2);
  assert.equal(r.rows[0].strategyId,'fib-0382');assert.equal(r.rows[1].strategyId,'ifvg');
  assert.equal(await page.locator('#strategy-tester svg').count(),5);
  assert.match(await page.locator('#tester-comparison').textContent(),/0.382 Retracement.*IFVG/s);
  const original=r.rows;
  assert.ok(Math.abs(r.summary.totalNetR-original.reduce((s,t)=>s+t.netR,0))<1e-12);
  await page.locator('[data-tester-filter="direction"]').selectOption('short');
  assert.equal((await report()).summary.totalTrades,1);
  assert.equal((await report()).rows[0].direction,'short');
  await page.locator('[data-tester-reset]').click();
  await page.locator('[data-tester-filter="strategyId"]').selectOption('fib-0382');
  assert.equal((await report()).comparison.length,1);
  await page.locator('[data-tester-reset]').click();
  await page.locator('[data-tester-filter="orderType"]').selectOption('limit');
  assert.equal((await report()).summary.totalTrades,0);
  await page.locator('[data-tester-reset]').click();
  await page.locator('[data-tester-filter="exitReason"]').selectOption('Closed Manual');
  assert.equal((await report()).summary.totalTrades,2);
  await page.locator('[data-tester-reset]').click();
  await page.locator('[name="strategyName"]').fill('Browser manual setup');
  await page.locator('#strategy-tester form button[type="submit"]').click();
  const custom=(await doc()).strategies.find(s=>s.name==='Browser manual setup');
  assert.ok(custom);
  const firstId=original[0].id;
  await page.locator(`[data-journal-trade="${firstId}"]`).click();
  const journal=page.locator('#trade-journal-dialog');
  for(const [name,value] of Object.entries({setup:'Manual setup <script>not executable</script>',rationale:'Replay entry',mistakes:'No automatic trading',notes:'Persistent note'})){
    await journal.locator(`[name="${name}"]`).fill(value);
  }
  // Real canvas PNG is passed through the same bounded upload/re-encoding UI.
  const png=await page.evaluate(()=>{
    const c=document.createElement('canvas');c.width=640;c.height=360;
    const x=c.getContext('2d');x.fillStyle='#10141c';x.fillRect(0,0,640,360);x.fillStyle='#26c89c';x.fillText('Manual replay journal',30,40);
    return c.toDataURL('image/png').split(',')[1];
  });
  await journal.locator('[name="screenshot"]').setInputFiles({name:'replay.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
  await journal.locator('button[type="submit"]').click();await journal.waitFor({state:'detached'});
  let saved=await doc();
  assert.equal(saved.annotations[firstId].notes,'Persistent note');
  assert.match(saved.annotations[firstId].screenshot,/^data:image\/jpeg;base64,/);
  assert.deepEqual((await report()).rows.map(t=>[t.initialRisk,t.entryPrice,t.exitPrice,t.netR]),original.map(t=>[t.initialRisk,t.entryPrice,t.exitPrice,t.netR]));
  // Rewind removes the second close, then restores exactly once.
  await step(-1);assert.equal((await report()).summary.totalTrades,1);
  await step();assert.equal((await report()).summary.totalTrades,2);
  await page.locator('[data-tester-filter="strategyId"]').selectOption('ifvg');
  const before=await report();saved=await doc();
  await page.click('#replay-save');await page.reload();
  await page.waitForFunction(()=>window.__alfaDebug?.drawings.ready);
  await page.click('#lab-menu summary'); await page.click('#replay-toggle');await page.locator('#replay-saved button').first().click();
  await page.waitForFunction(()=>document.body.classList.contains('replay-mode'));
  await page.click('#paper-toggle');await tester();
  assert.deepEqual(await doc(),saved);assert.deepEqual(await report(),before);
  await page.locator('[data-tester-reset]').click();
  await page.locator(`[data-journal-trade="${firstId}"]`).click();
  assert.equal(await journal.locator('[name="setup"]').inputValue(),'Manual setup <script>not executable</script>');
  assert.equal(await journal.locator('.journal-image img').count(),1);
  await journal.locator('[name="strategyId"]').selectOption(custom.id);
  await journal.locator('button[type="submit"]').click();await journal.waitFor({state:'detached'});
  assert.ok((await report()).comparison.some(s=>s.strategyId===custom.id));
  // Quota failure keeps analytics in the same protected unsaved Paper payload.
  await page.evaluate(()=>{
    window.__strategySetItem=Storage.prototype.setItem;
    Storage.prototype.setItem=function(k,v){if(k.startsWith('alfa-paper:'))throw new DOMException('Quota','QuotaExceededError');return window.__strategySetItem.call(this,k,v);};
  });
  await page.locator('[data-tester-filter="direction"]').selectOption('long');
  assert.match(await page.locator('#paper-status').textContent(),/Yerel kayıt başarısız/);
  assert.equal(await page.evaluate(()=>window.__alfaDebug.paper.unsaved.size),1);
  page.once('dialog',d=>d.dismiss());await page.click('#replay-stop');
  assert.equal(await page.evaluate(()=>document.body.classList.contains('replay-mode')),true);
  await page.evaluate(()=>{Storage.prototype.setItem=window.__strategySetItem;delete window.__strategySetItem;});
  await page.locator('[data-tester-reset]').click();
  assert.equal(await page.evaluate(()=>window.__alfaDebug.paper.unsaved.size),0);
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.equal(await page.locator('#strategy-tester').isVisible(),true);
  await page.setViewportSize({width:1440,height:1000});
  if(arg('screenshot'))await page.screenshot({path:arg('screenshot')});
  // Simulated ownership guard, not a claim of authenticated account-switch testing.
  const isolation=await page.evaluate(()=>{
    const p=window.__alfaDebug.paper,owner=p.owner;p.owner=()=> 'different-test-owner';
    const serialized=p.serialize();let blocked=false;
    try{p.tester.changed(p.tester.serialize());}catch{blocked=true;}
    p.update();p.owner=owner;
    return {serialized,blocked,cleared:p.engine===null&&p.tester.context===null,hidden:p.root.hidden};
  });
  assert.deepEqual(isolation,{serialized:null,blocked:true,cleared:true,hidden:true});
  await page.click('#replay-stop');await page.waitForFunction(()=>window.__alfaDebug.ready,null,{timeout:45000});
  assert.equal(await page.evaluate(()=>window.__alfaDebug.paper.tester.context),null);
  assert.deepEqual(errors,[]);assert.deepEqual(orderRequests,[]);assert.deepEqual(imageUploads,[]);
  console.log(JSON.stringify({passed:true,source:'real Binance',strategyTaggedManualTrades:2,comparison:true,filters:true,customCategory:true,
    journal:true,localScreenshot:true,rewind:true,saveRestore:true,immutableRiskAndFills:true,quotaProtection:true,responsive:true,
    simulatedOwnerIsolation:true,realOrderRequests:0,imageUploads:0,pageErrors:errors}));
}finally{await browser.close();}
