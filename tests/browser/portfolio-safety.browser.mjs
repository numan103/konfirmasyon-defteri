// Quiet normal UI and isolated failure checks. All portfolio API requests are mocked.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const arg = key => process.argv.find(s => s.startsWith(`--${key}=`))?.slice(key.length + 3);
const { chromium } = await import(pathToFileURL(path.resolve(arg('playwright'))));
const browser = await chromium.launch({ executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true });
const page = await browser.newPage(), errors=[], calls=[];
let mode='ok', data={v:2,positions:[{id:'safety-test',symbol:'ETH',type:'kripto',side:'LONG',qty:1,cost:300,price:350,date:'2026-11-01'}],
  sells:[],ideas:[],history:[{d:'2026-11-01',v:1000}],cash:700,startBalance:1000}, revision='2026-11-16T01:00:00Z';
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/api/edu-shared?kind=portfolio**',async route=>{
  const req=route.request(), url=new URL(req.url());calls.push({method:req.method(),url:url.search});
  if(req.method()==='POST'){
    const body=req.postDataJSON();calls.at(-1).body=body;
    if(mode==='offline'){await route.abort();return;}
    revision='2026-11-16T02:00:00Z';
    if(body.action==='save')data=body.data;
    await route.fulfill({json:{ok:true,revision,backedUp:true,versionId:3,cash:data.cash}});return;
  }
  if(url.searchParams.has('versions')){
    await route.fulfill({json:{versions:[{id:1,revision,position_count:1,sale_count:0,action:'baseline'}],nextBefore:null}});return;
  }
  if(url.searchParams.has('version')){
    await route.fulfill({json:{version:{id:1,revision,data}}});return;
  }
  await route.fulfill({json:{data,revision}});
});
try{
  await page.goto((arg('url')||'http://localhost:4173')+'/?page=home');
  await page.waitForFunction(()=>typeof ap2SafetyControls==='function'&&typeof AUTH!=='undefined'&&AUTH.client);
  await page.evaluate(({data,revision})=>{
    siteIsAdmin=()=>true;ap2IsMember=()=>true;refUnlocked=()=>true;ap2LoadPrices=()=>{};
    // Mock API uses no real credentials; do not change server authorization.
    siteFetch=(url,init)=>fetch(url,init);
    ap2Data=data;ap2Ideas=[];ap2Revision=revision;ap2CloudData=data;ap2CloudReady=true;ap2SyncBlocked=false;ap2Dirty=false;ap2LocalPreview=false;
    currentPage='portfoy';document.body.dataset.page='portfoy';document.body.classList.remove('landed');
    const landing=document.getElementById('landing');if(landing)landing.style.display='none';
    document.getElementById('page-home').classList.add('hidden');
    document.getElementById('page-portfoy').classList.remove('hidden');
    renderAlfaPortfoy2();
  },{data,revision});
  await page.waitForFunction(()=>ap2CloudReady&&!ap2Hydrating);
  assert.equal(await page.locator('#ap2-safety-controls').count(),0);
  assert.equal(await page.getByRole('button',{name:'Sunucu sürüm geçmişi',exact:true}).count(),0);
  await page.evaluate(()=>{ap2Data.positions[0].note='saved safety test';ap2Save();});
  await page.waitForFunction(()=>ap2PendingWrites===0&&!ap2Dirty);
  assert.equal(await page.locator('#ap2-safety-controls').count(),0,'successful saves must stay visually quiet');
  mode='offline';
  await page.evaluate(()=>{ap2Data.positions[0].note='unsaved safety test';ap2Save();});
  await page.waitForFunction(()=>ap2SyncBlocked&&ap2PendingWrites===0);
  const reads=calls.filter(c=>c.method==='GET'&&!/version/.test(c.url)).length;
  const state=await page.evaluate(()=>{
    const canEdit=ap2CanEdit();showPage('home');showPage('portfoy');
    return{canEdit,blocked:ap2SyncBlocked,dirty:ap2Dirty,note:ap2Data.positions[0].note,ready:ap2CloudReady};
  });
  assert.equal(state.canEdit,false);assert.equal(state.blocked,true);assert.equal(state.dirty,true);
  assert.equal(state.note,'unsaved safety test');assert.equal(state.ready,false);
  assert.equal(calls.filter(c=>c.method==='GET'&&!/version/.test(c.url)).length,reads,'navigation must not erase unsaved edits with a cloud reload');
  assert.match(await page.locator('#ap2-durable-status').textContent(),/düzenleme kilitli/);
  const download=page.waitForEvent('download');
  await page.getByRole('button',{name:'JSON yedeğini indir',exact:true}).click();
  const file=await download;
  const exported=JSON.parse(fs.readFileSync(await file.path(),'utf8'));
  assert.equal(exported.positions[0].note,'unsaved safety test');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,mockedPortfolioAPI:true,quietNormalUI:true,quietSuccessfulSave:true,
    recoveryOnlyOnFailure:true,offlineEditsPreserved:true,editingBlockedAfterFailure:true,noAutomaticReload:true,pageErrors:errors}));
}finally{await browser.close();}
