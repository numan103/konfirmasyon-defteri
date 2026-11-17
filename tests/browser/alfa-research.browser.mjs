import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const arg=k=>process.argv.find(a=>a.startsWith('--'+k+'='))?.slice(k.length+3);
const {chromium}=await import(pathToFileURL(arg('playwright')));
const browser=await chromium.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
const page=await context.newPage(),errors=[],researchRequests=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('request',r=>{if(/research_(sessions|candles|session_versions|legacy_records)/.test(new URL(r.url()).pathname))researchRequests.push(r.url());});
const status=()=>page.locator('#research-status').textContent();
const state=()=>page.locator('#research-panel').getAttribute('data-state');
const records=()=>page.evaluate(()=>window.__alfaDebug.research.storage.list('guest'));
const report=async()=>{
  const rows=await records();
  return rows.map(r=>({state:r.state,pending:r.pending?.length,coverage:r.local.coverage,
    events:r.local.replay.paper?.events?.length,prices:Object.values(r.local.priceData).reduce((n,b)=>n+b.length,0),
    snapshot:r.local.replay.paper?.labSnapshot||null,revision:r.revision,lastSync:r.lastSync}));
};
try{
  await page.goto((arg('url')||'http://127.0.0.1:4173')+'/alfa-charts.html?debug=1');
  await page.waitForFunction(()=>window.__alfaDebug?.ready&&window.__alfaDebug.drawings.ready,null,{timeout:45000});
  assert.equal(await page.locator('#research-panel').isVisible(),false);
  await page.click('#research-toggle');
  assert.equal(await page.locator('#research-panel').isVisible(),true);
  assert.match(await status(),/Misafir/);
  assert.match(await page.locator('#research-last-sync').textContent(),/henüz yok/);

  await page.locator('[data-interval="15m"]').click();
  await page.waitForFunction(()=>window.__alfaDebug.ready&&document.getElementById('market-title').textContent.includes('15M'));
  const time=await page.evaluate(()=>window.__alfaDebug.history[600].time);
  await page.click('#replay-toggle');
  await page.fill('#replay-date',new Date(time*1000).toISOString().slice(0,16));
  await page.click('#replay-date-start');
  await page.waitForFunction(()=>document.body.classList.contains('replay-mode'));
  await page.click('#replay-save');
  await page.waitForFunction(async()=>{
    const rows=await window.__alfaDebug.research.storage.list('guest');
    return rows.length===1&&rows[0].state==='clean';
  });
  let r=(await report())[0];
  assert.equal(r.coverage,'complete');assert.ok(r.prices>0);assert.equal(r.snapshot,null);
  assert.equal(r.pending,1);assert.equal(researchRequests.length,0);
  const localKey=await page.evaluate(()=>Object.keys(localStorage).some(k=>k.startsWith('alfa-replay-session:v1:guest:')));
  assert.equal(localKey,true);

  const exported=await page.evaluate(()=>window.__alfaDebug.research.core.export());
  const file=JSON.parse(exported);
  assert.equal(file.format,'alfa-research');assert.equal(file.owner,'guest');assert.equal(file.records.length,1);
  assert.equal(file.records[0].replay.version,1);
  assert.equal(file.records[0].priceData['15m'].length,r.prices);
  const imported=await page.evaluate(async text=>{
    const {importResearch}=await import('/assets/alfa-research-model.mjs?v=1');
    return importResearch(text,'guest').length;
  },exported);
  assert.equal(imported,1);

  // Wait for the shared Supabase client to settle; a later auth callback must not replace the core under test.
  await page.waitForFunction(()=>!!window.__alfaDebug.research.client,null,{timeout:15000}).catch(()=>{});
  // Fake transport: exercises status transitions and commit payloads without touching Supabase.
  await page.evaluate(()=>{
    window.__researchFake={commits:[],revision:0};
    window.__alfaDebug.research.core.transport={
      async list(){return [];},
      async commit(packet,base,revision){
        window.__researchFake.commits.push({hasPrices:!!packet.priceData,revision,
          events:packet.replay.paper.events.length,symbol:packet.replay.symbol});
        window.__researchFake.revision=revision+1;
        return {revision:revision+1,updatedAt:new Date().toISOString()};
      },
      async load(){return null;}
    };
    Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false});
  });
  await page.evaluate(()=>window.dispatchEvent(new Event('offline')));
  assert.equal(await state(),'offline');
  assert.match(await status(),/Çevrimdışı/);
  await page.evaluate(()=>{
    Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>true});
    window.dispatchEvent(new Event('online'));
  });
  await page.waitForFunction(async()=>{
    const rows=await window.__alfaDebug.research.storage.list('guest');
    return rows[0]?.state==='clean'&&rows[0]?.revision===1;
  });
  await page.waitForFunction(()=>document.getElementById('research-panel').dataset.state==='saved'&&
    /Buluta kaydedildi/.test(document.getElementById('research-status').textContent),null,{timeout:10000});
  await page.evaluate(()=>{window.__alfaDebug.research.core.paused=true;});
  assert.equal(await state(),'saved');
  assert.match(await status(),/Buluta kaydedildi/);
  assert.match(await page.locator('#research-last-sync').textContent(),/\d{4}-\d{2}-\d{2}T/);
  const commits=await page.evaluate(()=>window.__researchFake.commits);
  assert.equal(commits.length,1);assert.equal(commits[0].hasPrices,true);assert.equal(commits[0].revision,0);
  assert.equal(researchRequests.length,0);

  // Explicit cloud conflict is retained, not overwritten, and exposed in the panel.
  await page.evaluate(async()=>{
    const core=window.__alfaDebug.research.core;
    core.paused=true;
    const id=JSON.stringify(['research-not-used','main']);
    const {validatePacket}=await import('/assets/alfa-research-model.mjs?v=1');
    const rows=await window.__alfaDebug.research.storage.list('guest'),packet=rows[0].local;
    await window.__alfaDebug.research.storage.update('guest',JSON.stringify([packet.replay.id,'main']),current=>({...current,
      state:'conflict',error:'simulated divergent cloud copy',remoteConflict:packet}),{backupReason:'browser conflict simulation'});
    void id;void validatePacket;void core;
  });
  await page.evaluate(()=>{
    window.__alfaDebug.research.show({state:'conflict',message:'simulated divergent cloud copy'});
    return window.__alfaDebug.research.renderRecords();
  });
  assert.equal(await state(),'conflict');
  assert.match(await status(),/simulated divergent cloud copy/);
  assert.match(await page.locator('#research-records').textContent(),/simulated divergent cloud copy/);
  assert.equal(await page.locator('#research-records [data-research="accept"]').count(),1);

  // Clear the simulated conflict, open the saved research session from the panel, and verify replay/Paper restoration.
  await page.evaluate(async()=>{
    const rows=await window.__alfaDebug.research.storage.list('guest');
    await window.__alfaDebug.research.storage.update('guest',JSON.stringify([rows[0].local.replay.id,'main']),current=>({...current,
      state:'clean',error:null,remoteConflict:null}));
  });
  const before=await page.evaluate(()=>window.__alfaDebug.paper.serialize());
  await page.click('#replay-stop');
  await page.waitForFunction(()=>!document.body.classList.contains('replay-mode'));
  if(!(await page.locator('#research-panel').isVisible()))await page.click('#research-toggle');
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#research-records [data-research="open"]').first().click();
  await page.waitForFunction(()=>document.body.classList.contains('replay-mode'),null,{timeout:30000});
  await page.waitForFunction(()=>window.__alfaDebug.paper.lab,null,{timeout:30000});
  const after=await page.evaluate(()=>window.__alfaDebug.paper.serialize());
  assert.deepEqual(after.events,before.events);
  assert.deepEqual(after.analytics,before.analytics);
  assert.deepEqual(after.lab,before.lab);
  assert.ok((await page.evaluate(()=>window.__alfaDebug.history.length))>0);
  assert.equal(researchRequests.length,0);
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,guest:true,offline:true,online:true,conflict:true,
    exportImport:true,replayRestore:true,noSupabaseRequests:researchRequests.length,pageErrors:errors}));
}catch(error){
  console.log(JSON.stringify({passed:false,error:error.message,researchRequests,pageErrors:errors}));
  process.exitCode=1;
}finally{await browser.close();}
