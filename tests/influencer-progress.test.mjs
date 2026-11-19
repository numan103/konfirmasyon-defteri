import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../lib/influencer-content.mjs';
import { cleanProgress, progressState } from '../assets/topic-progress.mjs';
test('recurring completion becomes due without losing the last completion date', () => {
  assert.deepEqual(progressState({doneAt:1000,intervalDays:1},1001), {done:true,due:false,nextAt:86401000});
  assert.equal(progressState({doneAt:1000,intervalDays:1},86401000).due,true);
  assert.equal(progressState({doneAt:0,intervalDays:7},1001).due,true);
  assert.equal(progressState({doneAt:1000,intervalDays:0},Number.MAX_SAFE_INTEGER).due,false);
  assert.throws(() => cleanProgress({topics:{a:{doneAt:0,intervalDays:2}}}),/invalid_content/);
  assert.throws(() => cleanProgress({topics:{a:{doneAt:Date.now()+120000,intervalDays:1}}}),/invalid_content/);
});
function fixture(t) {
  const key = process.env.SUPABASE_SERVICE_ROLE; process.env.SUPABASE_SERVICE_ROLE = 'progress-test-key';
  t.after(() => { if (key === undefined) delete process.env.SUPABASE_SERVICE_ROLE; else process.env.SUPABASE_SERVICE_ROLE = key; });
  const rows = new Map(); let conflict = false;
  t.mock.method(globalThis,'fetch',async(url,options={}) => {
    const u = new URL(url);
    if (u.pathname.endsWith('/auth/v1/user')) {
      const token = options.headers.Authorization?.replace('Bearer ','');
      if (['a','b','free'].includes(token)) return Response.json({id:'user-'+token,email:token+'@example.test'});
      return Response.json({}, {status:401});
    }
    if (u.pathname.endsWith('/influencer_orders')) return Response.json(u.searchParams.get('user_id')==='eq.user-free'?[]:[{id:'approved'}]);
    const id = u.searchParams.get('id')?.slice(3);
    if (!options.method || options.method==='GET') return Response.json(rows.has(id)?[rows.get(id)]:[]);
    const body = JSON.parse(options.body);
    if (conflict) return Response.json([]);
    if (options.method==='POST' && rows.has(body.id)) return Response.json({}, {status:409});
    if (options.method==='PATCH' && u.searchParams.get('updated_at')!=='eq.'+rows.get(id)?.updated_at) return Response.json([]);
    const next = {...rows.get(id),...body}; rows.set(id||body.id,next); return Response.json([next]);
  });
  async function request(token,body) {
    let status,result;
    const res={setHeader(){},status(n){status=n;return this;},json(j){result=j;}};
    await handler({method:body?'POST':'GET',query:{kind:'influencer-progress'},headers:token?{authorization:'Bearer '+token}:{},body},res);
    return {status,body:result};
  }
  return {request,rows,conflict:()=>{conflict=true;}};
}
test('personal progress is authenticated, product-gated, encrypted and isolated between users',async t=>{
  const f=fixture(t);
  assert.equal((await f.request('')).status,401);
  assert.equal((await f.request('free')).status,403);
  assert.equal((await f.request('a',{topicId:'viral',op:'complete',userId:'user-b'})).status,200);
  const a=await f.request('a'), b=await f.request('b');
  assert.ok(a.body.data.topics.viral.doneAt>0);
  assert.deepEqual(b.body.data.topics,{});
  assert.equal(JSON.stringify([...f.rows.values()]).includes('viral'),false);
  assert.equal((await f.request('a',{topicId:'viral',op:'schedule',intervalDays:7})).body.data.topics.viral.intervalDays,7);
  const unchecked=await f.request('a',{topicId:'viral',op:'uncheck'});
  assert.equal(unchecked.body.data.topics.viral.doneAt,0);
  assert.equal(unchecked.body.data.topics.viral.intervalDays,7);
});
test('bad schedules and CAS conflicts cannot fake a successful reminder save',async t=>{
  const f=fixture(t);
  assert.equal((await f.request('a',{topicId:'viral',op:'schedule',intervalDays:2})).status,400);
  assert.equal((await f.request('a',{topicId:'__proto__',op:'complete'})).status,400);
  await f.request('a',{topicId:'viral',op:'complete'});
  f.conflict();
  assert.equal((await f.request('a',{topicId:'viral',op:'uncheck'})).status,409);
});
