import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import portfolio, { validatePortfolio } from '../lib/portfolio.mjs';
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const document = () => ({ v:2, positions:[{id:'p1',symbol:'ETH',qty:1,cost:300}], sells:[], ideas:[], history:[], cash:700, startBalance:1000 });
const response = () => ({ code:0, body:null, headers:{}, setHeader(k,v){this.headers[k]=v;},
  status(c){this.code=c;return this;},json(b){this.body=b;return this;} });
async function withServer(run, storage) {
  const before = global.fetch, oldKey = process.env.SUPABASE_SERVICE_ROLE;
  process.env.SUPABASE_SERVICE_ROLE = 'sb_secret_test_only';
  const calls = [];
  global.fetch = async (url, init = {}) => {
    if (url.endsWith('/auth/v1/user')) return { ok:true,json:async()=>({ id:'11111111-1111-4111-8111-111111111111',email:'ahmetnuman20@gmail.com' }) };
    calls.push({url,init});
    return storage(url,init);
  };
  try { await run(calls); } finally {
    global.fetch=before;
    if(oldKey===undefined)delete process.env.SUPABASE_SERVICE_ROLE;else process.env.SUPABASE_SERVICE_ROLE=oldKey;
  }
}
const req = body => ({method:'POST',query:{},headers:{authorization:'Bearer test'},body:{revision:'2026-11-16T01:00:00Z',...body}});
test('portfolio schema rejects empty objects, duplicate ids, string quantities and oversized documents', () => {
  assert.equal(validatePortfolio(document()),true);
  for(const data of [{}, {...document(),cash:NaN}, {...document(),history:null},
    {...document(),positions:[{id:'p1',symbol:'ETH',qty:'1',cost:300}]},
    {...document(),positions:[document().positions[0],document().positions[0]]},
    {...document(),note:'x'.repeat(262145)}]) assert.equal(validatePortfolio(data),false);
});
test('successful write requires an atomic DB backup acknowledgement and a version id', async () => {
  await withServer(async calls => {
    const res=response();await portfolio(req({data:document()}),res);
    assert.equal(res.code,200);assert.equal(res.body.versionId,12);assert.equal(res.body.backedUp,true);
    assert.equal(calls.length,1);assert.match(calls[0].url,/rpc\/portfolio_commit$/);
    const payload=JSON.parse(calls[0].init.body);
    assert.equal(payload.p_revision,'2026-11-16T01:00:00Z');
    assert.equal(payload.p_actor,'11111111-1111-4111-8111-111111111111');
  },async()=>({ok:true,json:async()=>({revision:'new',versionId:12,backedUp:true,cash:700})}));
});
test('missing backup infrastructure never falls back to raw table PATCH', async () => {
  for(const upstream of [
    {ok:false,json:async()=>({code:'PGRST202',message:'missing function'})},
    {ok:true,json:async()=>({revision:'new',cash:700})}
  ]) await withServer(async calls=>{
    const res=response();await portfolio(req({data:document()}),res);
    assert.equal(res.code,503);assert.equal(calls.length,1);
    assert.ok(calls.every(c=>c.init.method!=='PATCH'));
  },async()=>upstream);
});
test('DB safety rejection is explicit and does not retry a damaging write', async () => {
  await withServer(async calls=>{
    const res=response();await portfolio(req({data:document()}),res);
    assert.equal(res.code,422);assert.equal(res.body.reason,'portfolio_position_removal_blocked');assert.equal(calls.length,1);
  },async()=>({ok:false,json:async()=>({code:'23514',message:'portfolio_position_removal_blocked'})}));
});
test('reset/restore require exact confirmation; restore selects the server snapshot, not browser data', async () => {
  await withServer(async calls=>{
    for(const body of [{action:'reset'}, {action:'restore',versionId:3},
      {action:'restore',confirmation:'RESTORE',versionId:'3&select=*'}]){
      const res=response();await portfolio(req(body),res);assert.equal(res.code,400);
    }
    assert.equal(calls.length,0);
    const res=response();await portfolio(req({action:'restore',confirmation:'RESTORE',versionId:3,data:{malicious:true}}),res);
    assert.equal(res.code,200);
    const payload=JSON.parse(calls[0].init.body);
    assert.equal(payload.p_restore_id,3);assert.equal(payload.p_data,null);
    assert.equal(payload.p_action,'restore');
  },async()=>({ok:true,json:async()=>({revision:'new',versionId:13,backedUp:true,cash:700})}));
});
test('history list selects only bounded metadata; single-version reads validate identifiers', async () => {
  await withServer(async calls=>{
    const reqBase={method:'GET',headers:{authorization:'Bearer test'}};
    const list=response();await portfolio({...reqBase,query:{versions:'1'}},list);
    assert.equal(list.code,200);assert.match(calls[0].url,/limit=20/);assert.doesNotMatch(calls[0].url,/select=[^&]*\bdata\b/);
    const bad=response();await portfolio({...reqBase,query:{version:'1&x=2'}},bad);
    assert.equal(bad.code,400);assert.equal(calls.length,1);
  },async()=>({ok:true,json:async()=>[]}));
});
test('network failure preserves unsaved data, blocks edits and cannot trigger automatic hydration', async () => {
  const data=document(), saved=[];
  const ctx=vm.createContext({
    ap2Data:data,ap2Ideas:[],ap2SaveSeq:1,ap2Dirty:true,ap2SyncBlocked:false,ap2CloudReady:true,
    ap2LocalPreview:false,ap2ReadOnly:false,ap2PendingWrites:0,ap2WriteQueue:Promise.resolve(),
    ap2Revision:'old',siteIsAdmin:()=>true,ap2CloudSummary:()=>({history:[]}),
    ap2SafetyControls(){},ap2Status(){},ap2PreserveRecovery:d=>saved.push(structuredClone(d)),
    siteFetch:async()=>{throw new Error('offline');},ap2Hydrating:false,ap2FetchCloud:()=>{throw new Error('must not hydrate');}
  });
  vm.runInContext(html.slice(html.indexOf('function ap2BlockSync('),html.indexOf('async function ap2ReloadServerSafely(')),ctx);
  vm.runInContext(html.slice(html.indexOf('function ap2SyncCloud('),html.indexOf('async function ap2FetchCloud(')),ctx);
  vm.runInContext(html.slice(html.indexOf('async function ap2Hydrate('),html.indexOf('let ap2Filter')),ctx);
  await assert.rejects(ctx.ap2SyncCloud(),/offline/);
  assert.equal(ctx.ap2SyncBlocked,true);assert.equal(ctx.ap2CloudReady,false);
  assert.equal(ctx.ap2Dirty,true);assert.equal(ctx.ap2LocalPreview,true);assert.equal(ctx.ap2PendingWrites,0);
  assert.deepEqual(saved[0],data);
  await ctx.ap2Hydrate();assert.deepEqual(ctx.ap2Data,data);
  await assert.rejects(ctx.ap2SyncCloud(),/hazır değil/);
});
test('cancelled or failed reset does not erase local positions or claim success', async () => {
  const data=document();let calls=0,success=0,blocked=0;
  const ctx=vm.createContext({ap2Data:data,ap2CanEdit:()=>true,prompt:()=> 'wrong',
    ap2HasActivity:()=>true,ap2PreserveRecovery:()=>true,ap2Status(){},ap2Restoring:false,
    ap2Revision:'rev',siteFetch:async()=>{calls++;return {ok:false,json:async()=>({})};},
    ap2BlockSync:()=>{blocked++;},ap2SafetyControls(){},alert:()=>{success++;}});
  vm.runInContext(html.slice(html.indexOf('async function ap2ResetAll('),html.indexOf('function renderAlfaPortfoy2(')),ctx);
  await ctx.ap2ResetAll();assert.equal(calls,0);assert.equal(success,0);
  ctx.prompt=()=> 'PORTFOYU SIFIRLA';
  await ctx.ap2ResetAll();assert.equal(calls,1);assert.equal(blocked,1);assert.equal(success,0);
  assert.deepEqual(ctx.ap2Data,data);
});
test('loading cache is read-only and DB migration owns atomic versioning/security/retention', () => {
  const load=html.slice(html.indexOf('function ap2Load()'),html.indexOf('function ap2MergeDuplicates('));
  assert.doesNotMatch(load,/ap2Save\(|ap2RebuildHistory\(|ap2MergeDuplicates\(/);
  const sql=fs.readFileSync(new URL('../supabase/site/009_portfolio_versions.sql',import.meta.url),'utf8');
  assert.match(sql,/for update;/i);assert.match(sql,/portfolio_server_only/);
  assert.match(sql,/portfolio_sales_removal_blocked/);assert.match(sql,/portfolio_position_removal_blocked/);
  assert.match(sql,/offset 100/);assert.match(sql,/enable row level security/);
  assert.match(sql,/grant execute[\s\S]*to service_role/);
  assert.match(sql,/before insert or update or delete on public\.edu_shared/);
});
