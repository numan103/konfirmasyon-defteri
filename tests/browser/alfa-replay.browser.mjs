import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const arg=k=>process.argv.find(a=>a.startsWith('--'+k+'='))?.slice(k.length+3);
const {chromium}=await import(pathToFileURL(arg('playwright')));
const browser=await chromium.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:950}});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')console.error(m.text());});
page.on('response',r=>{if(r.url().includes('endTime='))console.log('history request',r.status(),r.url());});
try {
  await page.goto((arg('url')||'http://127.0.0.1:4173')+'/alfa-charts.html?debug=1');
  await page.waitForFunction(()=>window.__alfaDebug?.history.length>=900,{timeout:45000});
  await page.waitForFunction(()=>window.__alfaDebug.drawings.ready);
  await page.locator('[data-interval="15m"]').click();
  await page.waitForFunction(()=>document.getElementById('market-title').textContent.includes('15M') && window.__alfaDebug.history.length>=900);
  const start=await page.evaluate(()=>window.__alfaDebug.history[0].time);
  for(let i=0;i<3;i++){
    const before=await page.evaluate(()=>window.__alfaDebug.history.length);
    console.log('prepend',i,before,await page.evaluate(()=>window.__alfaDebug.chart.timeScale().getVisibleLogicalRange()));
    await page.evaluate(()=>window.__alfaDebug.chart.timeScale().setVisibleLogicalRange({from:5,to:100}));
    try { await page.waitForFunction(n=>window.__alfaDebug.history.length>n,before,{timeout:45000}); }
    catch(e){console.log(await page.evaluate(()=>({n:window.__alfaDebug.history.length,status:document.getElementById('connection').textContent,errors:document.getElementById('message').textContent})),errors);throw e;}
    await page.waitForFunction(()=>!window.__alfaDebug.loadingOlder,{timeout:45000});
  }
  const history=await page.evaluate(()=>window.__alfaDebug.history);
  assert.ok(history.length>=3000);
  assert.equal(new Set(history.map(b=>b.time)).size,history.length);
  assert.ok(history.every((b,i)=>i===0||b.time>history[i-1].time));
  assert.ok(history[0].time<start);
  await page.click('#indicators-manage');
  await page.click('[data-add=ema]');
  await page.click('[data-cat=active]');
  await page.locator('[data-active-study] [data-study-settings]').first().click();
  await page.locator('[data-k="period"]').fill('200');
  await page.click('#is-apply');
  await page.click('#ind-close');
  await page.click('#lab-menu summary'); await page.click('#replay-toggle');
  await page.click('#replay-pick');
  const selection=await page.evaluate(()=>{
    const api=window.__alfaDebug,rect=document.getElementById('chart').getBoundingClientRect();
    const x=api.chart.timeScale().width()/2;
    return {x:rect.x+x,y:rect.y+100,time:api.chart.timeScale().coordinateToTime(x)};
  });
  await page.mouse.click(selection.x,selection.y);
  await page.waitForFunction(()=>document.body.classList.contains('replay-mode'));
  assert.equal(await page.evaluate(()=>window.__alfaDebug.history.at(-1).time),selection.time);
  const emaData=await page.evaluate(()=>window.__alfaDebug.indicators.items[0].series[0].data());
  assert.ok(emaData.length>0);
  assert.ok(emaData.every(b=>b.time<=selection.time));
  const at=await page.evaluate(()=>window.__alfaDebug.history.length);
  assert.ok(at<history.length);
  await page.click('#replay-next');
  await page.waitForFunction(n=>window.__alfaDebug.history.length===n,at+1);
  assert.equal(await page.evaluate(()=>window.__alfaDebug.history.length),at+1);
  await page.click('#replay-prev');
  assert.equal(await page.evaluate(()=>window.__alfaDebug.history.length),at);
  assert.equal(await page.evaluate(()=>window.__alfaDebug.drawings.context.remote),false);
  await page.click('#indicators-manage'); await page.click('[data-add=mtf]');
  await page.locator('.studies-dialog [data-study-settings=mtf]').click();
  await page.locator('[data-htf="1h"]').check();
  await page.locator('[data-htf="4h"]').check();
  for(const key of ['showSwings','showFvg','showBOS','showCHoCH','showProtected','showIFVG'])
    await page.locator(`[data-k="${key}"]`).check();
  await page.click('#is-apply'); await page.click('#ind-close');
  await page.waitForFunction(()=>!window.__alfaDebug.mtf.loading);
  const bounded=await page.evaluate(()=>({
    clock:window.__alfaDebug.replayClock,
    data:[...window.__alfaDebug.mtf.htfData].map(([tf,bars])=>({tf,count:bars.length,last:bars.at(-1)?.time}))
  }));
  assert.equal(bounded.data.length,2);
  for(const {tf,count,last} of bounded.data){
    assert.ok(count>0);assert.ok(last+(tf==='1h'?3600:14400)<=bounded.clock);
  }
  for (const tool of ['fibonacci','long']) {
    await page.locator(`#drawing-tools [data-group="${tool === 'fibonacci' ? 'fib' : 'positions'}"]`).click();
    await page.locator(`.tool-flyout [data-tool="${tool}"]`).click();
    const plot=await page.evaluate(()=>{
      const d=window.__alfaDebug.drawings,rect=d.host.getBoundingClientRect();
      return {x:rect.x,y:rect.y,...d.dimensions()};
    });
    for(const [x,y] of [[.3,.4],[.6,.6]])await page.mouse.click(plot.x+plot.width*x,plot.y+plot.height*y);
    assert.ok(await page.evaluate(t=>window.__alfaDebug.drawings.history.doc.drawings.some(d=>d.type===t),tool));
  }
  await page.selectOption('#replay-speed','10');
  await page.click('#replay-play');
  await page.waitForFunction(n=>window.__alfaDebug.history.length>n,at);
  await page.click('#replay-pause');
  await page.waitForFunction(()=>!window.__alfaDebug.mtf.loading);
  await page.click('#replay-save');
  const saved=await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('alfa-replay-session:')).map(k=>JSON.parse(localStorage[k])));
  assert.equal(saved.length,1);assert.equal(saved[0].drawings.drawings.length,2);
  const current=saved[0].currentTime;
  await page.reload();
  await page.waitForFunction(()=>window.__alfaDebug?.drawings.ready);
  await page.click('#lab-menu summary'); await page.click('#replay-toggle');
  await page.locator('#replay-saved button').first().click();
  await page.waitForFunction(()=>document.body.classList.contains('replay-mode'));
  assert.equal(await page.evaluate(()=>window.__alfaDebug.history.at(-1).time),current);
  assert.deepEqual(await page.evaluate(()=>window.__alfaDebug.drawings.history.doc),saved[0].drawings);
  assert.equal(await page.inputValue('#replay-speed'),'10');
  assert.ok(await page.evaluate(()=>window.__alfaDebug.indicators.items.some(i=>i.type==='ema'&&i.params.period===200)));
  await page.click('#replay-stop');
  await page.waitForFunction(()=>!document.body.classList.contains('replay-mode'));
  await page.waitForFunction(()=>window.__alfaDebug.history.length>=900,{timeout:45000});
  const date=new Date((current-9000)*1000).toISOString().slice(0,16);
  await page.click('#lab-menu summary'); await page.click('#replay-toggle');
  await page.fill('#replay-date',date);
  await page.click('#replay-date-start');
  await page.waitForFunction(()=>document.body.classList.contains('replay-mode'));
  assert.equal(await page.evaluate(()=>window.__alfaDebug.history.at(-1).time),current-9000);
  assert.ok(await page.evaluate(()=>window.__alfaDebug.history.length>=301));
  await page.click('#replay-stop');
  await page.waitForFunction(()=>window.__alfaDebug.ready,{timeout:45000});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,source:'real Binance',loadedBars:history.length,
    sorted:true,deduplicated:true,futureHidden:true,nextPrevious:true,separateDrawingContext:true,
    saved:true,restoredAfterReload:true,replayFibonacci:true,replayLong:true,playPause:true,nextBlock:true,htfBounded:true,goToDate:true,ema200Warmup:true,returnedToLive:true,errors}));
}finally{await browser.close();}
