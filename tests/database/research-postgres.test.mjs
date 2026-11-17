// Local PostgreSQL engine test, NOT a real Supabase/JWT/device verification.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const modulePath=process.env.RESEARCH_PGLITE_MODULE;
if(!modulePath)throw new Error('Set RESEARCH_PGLITE_MODULE to the external test-only PGlite dist/index.js');
const {PGlite}=await import(pathToFileURL(modulePath));
const db=new PGlite();
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
const migration=await readFile(new URL('../../supabase/site/014_cloud_research.sql',import.meta.url),'utf8');
await db.exec(`create role anon nologin; create role authenticated nologin;
  create schema auth; create table auth.users(id uuid primary key);
  insert into auth.users values('${a}'),('${b}');
  create function auth.uid() returns uuid language sql stable as
  'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
  grant usage on schema public,auth to authenticated,anon;
  grant execute on function auth.uid() to authenticated,anon;`);
await db.exec(migration);
const actor=async uid=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid||'']);await db.exec('set role '+(uid?'authenticated':'anon'));};
const payload=()=>({version:1,watermark:3600,replay:{version:1,id:'sql-research-test',symbol:'BTCUSDT',timeframe:'15m',exchange:'Binance',
  marketType:'spot',dataStart:900,startTime:900,currentTime:1800,paper:{version:1,context:{sessionId:'sql-research-test',
    symbol:'BTCUSDT',timeframe:'15m'},events:[{id:'t1',type:'create',at:1800,order:{entry:100,stopLoss:90}}],
    analytics:{annotations:{}},lab:{annotations:{},templates:[]}}}});
let p=payload(),revision=0;
const commit=async (packet=p,candles=[],expected=revision,user=a)=>
  db.query('select * from public.research_commit_session($1::uuid,$2,$3,$4,$5::jsonb,$6::jsonb)',
    [user,packet.replay.id,'main',expected,JSON.stringify(packet),JSON.stringify(candles)]);
const count=async table=>Number((await db.query(`select count(*) as n from public.${table}`)).rows[0].n);
await test('local PostgreSQL research migration and RLS (simulated auth.uid only)',async t=>{
  await t.test('migration is additive/idempotent and RLS is enabled/forced',async()=>{
    await db.exec(migration);
    const {rows}=await db.query("select relname,relrowsecurity,relforcerowsecurity from pg_class where relname in ('research_sessions','research_session_versions','research_candles','research_legacy_records')");
    assert.equal(rows.length,4);assert.ok(rows.every(r=>r.relrowsecurity&&r.relforcerowsecurity));
  });
  await t.test('anonymous has no read or RPC execution grant',async()=>{
    await actor(null);await assert.rejects(()=>count('research_sessions'),/permission denied/);
    await assert.rejects(()=>commit(),/permission denied/);
  });
  await t.test('own session/candles/version are committed atomically',async()=>{
    await actor(a);const result=await commit(p,[{tf:'15m',t:900,o:100,h:110,l:95,c:105}]);
    revision=Number(result.rows[0].revision);assert.equal(revision,1);
    assert.equal(await count('research_sessions'),1);assert.equal(await count('research_candles'),1);assert.equal(await count('research_session_versions'),1);
  });
  await t.test('different user cannot read or update the first user rows',async()=>{
    await actor(b);assert.equal(await count('research_sessions'),0);assert.equal(await count('research_candles'),0);assert.equal(await count('research_session_versions'),0);
    const changed=await db.query('update public.research_sessions set revision=revision+1 where user_id=$1 returning session_id',[a]);assert.equal(changed.rows.length,0);
    await assert.rejects(()=>commit(p,[],1,a),/owner_required/);
  });
  await t.test('cannot insert a row impersonating the other user',async()=>{
    await actor(b);
    await assert.rejects(()=>db.query('insert into public.research_candles(user_id,session_id,branch_id,timeframe,time,open,high,low,close) values($1,$2,$3,$4,900,100,110,95,105)',
      [a,p.replay.id,'main','15m']),/row-level security|outside_observed_clock/);
  });
  await t.test('concurrent stale expected revision is rejected, including null CAS',async()=>{
    await actor(a);await assert.rejects(()=>commit(p,[],0),/revision_conflict/);assert.equal(await count('research_session_versions'),1);
    await assert.rejects(()=>commit(p,[],null),/expected_revision_required/);
  });
  await t.test('immutable event body and prefix cannot be changed or removed',async()=>{
    const altered=structuredClone(p);altered.replay.paper.events[0].order.stopLoss=95;
    await assert.rejects(()=>commit(altered),/event_log_immutable/);
    altered.replay.paper.events=[];await assert.rejects(()=>commit(altered),/event_log_immutable/);
    assert.equal(await count('research_session_versions'),1);
  });
  await t.test('duplicate event IDs are rejected',async()=>{
    const altered=structuredClone(p);altered.replay.paper.events.push(altered.replay.paper.events[0]);
    await assert.rejects(()=>commit(altered),/event_log_invalid/);
  });
  await t.test('identity/timeframe/session cannot be reassigned',async()=>{
    const altered=structuredClone(p);altered.replay.dataStart=800;
    await assert.rejects(()=>commit(altered),/identity_immutable/);
  });
  await t.test('append command and rewind preserve immutable events and add a version',async()=>{
    p.replay.paper.events.push({id:'close1',type:'close',at:2700,tradeId:'t1'});p.replay.currentTime=900;
    const ack=await commit(p,[{tf:'15m',t:900,o:100,h:110,l:95,c:105}]);revision=Number(ack.rows[0].revision);
    assert.equal(revision,2);assert.equal(await count('research_candles'),1);assert.equal(await count('research_session_versions'),2);
  });
  await t.test('price change and duplicate conflicting candles roll back the whole revision',async()=>{
    await assert.rejects(()=>commit(p,[{tf:'15m',t:900,o:100,h:999,l:95,c:105}]),/candle_immutable/);
    await assert.rejects(()=>commit(p,[{tf:'15m',t:1800,o:100,h:110,l:95,c:105},{tf:'15m',t:1800,o:100,h:111,l:95,c:105}]),/duplicate_conflict/);
    assert.equal(await count('research_session_versions'),2);
    const head=await db.query('select revision from public.research_sessions');assert.equal(Number(head.rows[0].revision),2);
  });
  await t.test('own candles and versions cannot be updated/deleted directly',async()=>{
    await assert.rejects(()=>db.exec('update public.research_candles set open=101'),/permission denied/);
    await assert.rejects(()=>db.exec('delete from public.research_session_versions'),/permission denied/);
  });
  await t.test('future OHLC and decreasing observation watermark are rejected',async()=>{
    await assert.rejects(()=>commit(p,[{tf:'15m',t:3600,o:100,h:110,l:95,c:105}]),/outside_observed_clock/);
    const altered=structuredClone(p);altered.watermark=2700;
    await assert.rejects(()=>commit(altered),/watermark_immutable/);
  });
  await t.test('Lab observation history and template content cannot be overwritten',async()=>{
    p.replay.paper.lab.annotations.t1=[{revision:1,values:{session:'London'}}];
    p.replay.paper.lab.templates=[{id:'fib',name:'Fib',fields:[]}];
    revision=Number((await commit()).rows[0].revision);
    const altered=structuredClone(p);altered.replay.paper.lab.annotations.t1[0].values.session='NY';
    await assert.rejects(()=>commit(altered),/history_immutable/);
    altered.replay.paper.lab.annotations=structuredClone(p.replay.paper.lab.annotations);altered.replay.paper.lab.templates=[];
    await assert.rejects(()=>commit(altered),/template_immutable/);
  });
  await t.test('Tester note revisions require increasing revision; cloud retains prior version',async()=>{
    p.replay.paper.analytics.annotations.t1={revision:1,notes:'before'};
    revision=Number((await commit()).rows[0].revision);
    const altered=structuredClone(p);altered.replay.paper.analytics.annotations.t1.notes='changed';
    await assert.rejects(()=>commit(altered),/revision_required/);
    altered.replay.paper.analytics.annotations.t1.revision=2;
    revision=Number((await commit(altered)).rows[0].revision);p=altered;
    const rows=await db.query("select payload->'replay'->'paper'->'analytics'->'annotations'->'t1'->>'notes' as note from public.research_session_versions order by revision");
    assert.ok(rows.rows.some(r=>r.note==='before'));assert.equal(rows.rows.at(-1).note,'changed');
  });
  await t.test('raw legacy records are owner isolated and append-only',async()=>{
    await db.query('insert into public.research_legacy_records(user_id,record_key,digest,document) values($1,$2,$3,$4::jsonb)',
      [a,'owned-paper-key','a'.repeat(64),JSON.stringify({events:['unchanged']})]);
    await assert.rejects(()=>db.exec('delete from public.research_legacy_records'),/permission denied/);
    await actor(b);assert.equal(await count('research_legacy_records'),0);
  });
});
await db.close();
