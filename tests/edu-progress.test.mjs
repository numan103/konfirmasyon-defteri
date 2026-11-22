import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { sealChannels } from '../lib/edu-channel-storage.mjs';

process.env.SUPABASE_SERVICE_ROLE = 'test-service-role';
process.env.EDU_CHANNEL_SECRET = 'test-edu-secret';
process.env.SUPABASE_URL = 'https://example.supabase.co';

function channelsData() {
  return {
    traders: {
      t1: {
        id: 't1', name: 'Eğitmen', owner: 'owner@test.dev', editors: [], secMeta: [{ id: 's1', title: 'Bölüm 1' }],
        sections: {
          s1: [
            { id: 'top1', title: 'Konu', videos: [
              { id: 'v1', title: 'Ders 1', access: 'free' },
              { id: 'v2', title: 'Ders 2', access: 'paid', plans: ['video'] },
            ] },
          ],
        },
      },
    },
    order: ['t1'],
  };
}

function makeRes() {
  return {
    statusCode: 200, headers: {}, body: '',
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    end(b) { this.body = b; },
  };
}

function mkReq(method, body, token = 'user-a') {
  return { method, headers: { authorization: 'Bearer ' + token }, query: { kind: 'progress' }, body };
}

async function loadHandler(rowsRef) {
  const mod = await import('../lib/edu-progress.mjs?' + Math.random());
  return mod.default;
}

function setupFetch(t, opts = {}) {
  const rows = opts.rows || new Map();
  const calls = [];
  const users = new Proxy({}, { get(_, token){ if(String(token).startsWith('user-')){ const raw=String(token).slice(5); const id='u-'+raw.replace(/[b-z]$/,''); return {id,email:id+'@test.dev'}; } return null; } });
  const channels = opts.channels || channelsData();
  const sealedChannels = sealChannels(channels, 'channels');
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const u = String(url);
    if (u.includes('/auth/v1/user')) {
      const token = String(init.headers?.Authorization || init.headers?.authorization || '').replace('Bearer ', '');
      const user = users[token];
      if (!user) return new Response(JSON.stringify({}), { status: 401, headers: { 'content-type': 'application/json' } });
      return new Response(JSON.stringify({ id: user.id, email: user.email, user_metadata: { full_name: user.email } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (u.includes('/rest/v1/edu_shared?id=eq.channels')) {
      return new Response(JSON.stringify([{ data: sealedChannels }]), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (u.includes('/rest/v1/journals?user_id=eq.00000000-0000-0000-0000-00000000e002')) {
      return new Response(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (u.includes('/rest/v1/edu_shared?id=like.educrm_')) {
      return new Response(JSON.stringify(opts.crmRows || []), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (u.includes('/rest/v1/edu_shared?') && u.includes('eduprog_') && (!init.method || init.method === 'GET')) {
      const id = decodeURIComponent(u.split('id=eq.')[1].split('&')[0]);
      const row = rows.get(id);
      return new Response(JSON.stringify(row ? [row] : []), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (u.includes('/rest/v1/edu_shared') && init.method === 'POST') {
      const body = JSON.parse(init.body);
      if (rows.has(body.id)) return new Response(JSON.stringify({ message: 'conflict' }), { status: 409, headers: { 'content-type': 'application/json' } });
      const row = { id: body.id, data: body.data, updated_at: body.updated_at };
      rows.set(body.id, row);
      return new Response(JSON.stringify([row]), { status: 201, headers: { 'content-type': 'application/json' } });
    }
    if (u.includes('/rest/v1/edu_shared?') && init.method === 'PATCH') {
      const id = decodeURIComponent(u.split('id=eq.')[1].split('&')[0]);
      const existing = rows.get(id);
      const body = JSON.parse(init.body);
      if (!existing) return new Response(JSON.stringify([]), { status: 409, headers: { 'content-type': 'application/json' } });
      if (u.includes('updated_at=eq.') && !u.includes(encodeURIComponent(existing.updated_at))) {
        return new Response(JSON.stringify([]), { status: 409, headers: { 'content-type': 'application/json' } });
      }
      const row = { ...existing, data: body.data, updated_at: body.updated_at };
      rows.set(id, row);
      return new Response(JSON.stringify([row]), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ error: 'unexpected', url: u }), { status: 500, headers: { 'content-type': 'application/json' } });
  };
  t.after(() => { globalThis.fetch = orig; });
  return { rows, calls };
}

test('edu-progress requires auth and isolates users', async (t) => {
  const { rows } = setupFetch(t);
  const handler = await loadHandler();
  let res = makeRes();
  await handler({ method: 'GET', headers: {}, query: { kind: 'progress' } }, res);
  assert.equal(res.statusCode, 401);

  res = makeRes();
  await handler(mkReq('GET', null, 'user-a'), res);
  assert.equal(res.statusCode, 200);
  const a = JSON.parse(res.body);
  assert.equal(a.ok, true);
  assert.deepEqual(a.data.marks, {});

  res = makeRes();
  await handler(mkReq('GET', null, 'user-b'), res);
  const b = JSON.parse(res.body);
  assert.deepEqual(b.data.marks, {});
  assert.equal(a.revision, null);
  assert.equal(b.revision, null);
  // different users => different row ids
  assert.equal(rows.size, 0);
});

test('edu-progress merges marks, keeps tombstones server-side, and ignores unknown/locked keys', async (t) => {
  const { rows } = setupFetch(t);
  const handler = await loadHandler();
  const keyFree = encodeURIComponent('t1') + ':' + encodeURIComponent('s1') + ':' + encodeURIComponent('top1') + ':' + encodeURIComponent('v1');
  const keyPaid = encodeURIComponent('t1') + ':' + encodeURIComponent('s1') + ':' + encodeURIComponent('top1') + ':' + encodeURIComponent('v2');
  const keyBad = encodeURIComponent('t1') + ':' + encodeURIComponent('s1') + ':' + encodeURIComponent('top1') + ':' + encodeURIComponent('nope');

  let res = makeRes();
  await handler(mkReq('POST', { op: 'merge', marks: [{ k: keyFree, d: 1, t: 1000, src: 'user' }, { k: keyPaid, d: 1, t: 1000, src: 'user' }, { k: keyBad, d: 1, t: 1000, src: 'user' }] }, 'user-a1'), res);
  assert.equal(res.statusCode, 200);
  let body = JSON.parse(res.body);
  assert.equal(body.accepted, 1);
  assert.equal(body.ignored, 2);
  assert.equal(body.data.marks[keyFree].d, 1);
  assert.equal(body.data.marks[keyPaid], undefined);

  // tombstone: uncheck keeps server-side semantics, public response omits d:0
  await new Promise(r => setTimeout(r, 1100));
  res = makeRes();
  await handler(mkReq('POST', { op: 'merge', marks: [{ k: keyFree, d: 0, t: 2000, src: 'user' }] }, 'user-a1b'), res);
  body = JSON.parse(res.body);
  assert.equal(res.statusCode, 200);
  assert.equal(body.data.marks[keyFree], undefined);

  // older mark should not resurrect
  await new Promise(r => setTimeout(r, 1100));
  res = makeRes();
  await handler(mkReq('POST', { op: 'merge', marks: [{ k: keyFree, d: 1, t: 1500, src: 'user' }] }, 'user-a1c'), res);
  body = JSON.parse(res.body);
  assert.equal(body.ignored >= 1, true);
  assert.equal(body.data.marks[keyFree], undefined);
  assert.equal(rows.size, 1);
});

test('edu-progress fails closed on plaintext/corrupt rows and issues certificate only when complete', async (t) => {
  const { rows } = setupFetch(t);
  const handler = await loadHandler();
  const keyFree = encodeURIComponent('t1') + ':' + encodeURIComponent('s1') + ':' + encodeURIComponent('top1') + ':' + encodeURIComponent('v1');
  const course = encodeURIComponent('t1') + ':' + encodeURIComponent('s1');

  // complete free item; paid item is locked so course should not be issuable
  let res = makeRes();
  await handler(mkReq('POST', { op: 'merge', marks: [{ k: keyFree, d: 1, t: 1000, src: 'user' }] }, 'user-a2'), res);
  assert.equal(res.statusCode, 200);

  await new Promise(r => setTimeout(r, 1100));
  res = makeRes();
  await handler(mkReq('POST', { op: 'issueCertificate', course }, 'user-a2b'), res);
  assert.equal(res.statusCode, 403);

  // corrupt/plaintext row should fail closed
  const rowId = Array.from(rows.keys())[0];
  rows.set(rowId, { id: rowId, data: { marks: { [keyFree]: { d: 1, t: 1 } } }, updated_at: '2026-01-01T00:00:00.000Z' });
  await new Promise(r => setTimeout(r, 1100));
  res = makeRes();
  await handler(mkReq('GET', null, 'user-a2c'), res);
  assert.equal(res.statusCode, 503);
  const body = JSON.parse(res.body);
  assert.equal(body.ok, false);
});


test('edu-progress CAS conflict retries merge without losing another mark', async (t) => {
  const { rows } = setupFetch(t);
  const handler = await loadHandler();
  const k1 = encodeURIComponent('t1') + ':' + encodeURIComponent('s1') + ':' + encodeURIComponent('top1') + ':' + encodeURIComponent('v1');
  const kBad = encodeURIComponent('t1') + ':' + encodeURIComponent('s1') + ':' + encodeURIComponent('top1') + ':' + encodeURIComponent('nope');
  // seed with k1
  let res = makeRes();
  await handler(mkReq('POST', { op: 'merge', marks: [{ k: k1, d: 1, t: 1000, src: 'user' }] }, 'user-c1'), res);
  assert.equal(res.statusCode, 200);
  // simulate conflict once on PATCH by wrapping fetch
  const orig = globalThis.fetch;
  let conflicted = false;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (!conflicted && init.method === 'PATCH' && u.includes('eduprog_')) {
      conflicted = true;
      return new Response(JSON.stringify([]), { status: 409, headers: { 'content-type': 'application/json' } });
    }
    return orig(url, init);
  };
  t.after(() => { globalThis.fetch = orig; });
  await new Promise(r => setTimeout(r, 1100));
  res = makeRes();
  await handler(mkReq('POST', { op: 'merge', marks: [{ k: k1, d: 1, t: 1000, src: 'user' }] }, 'user-c1b'), res);
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.ok, true);
  assert.equal(body.data.marks[k1].d, 1);
  assert.equal(conflicted, true);
});

test('edu-progress migration merge is idempotent and certificate serial is stable', async (t) => {
  const rows = new Map();
  setupFetch(t, { rows, channels: { traders: { t1: { id:'t1', name:'Eğitmen', owner:'o@test.dev', editors:[], secMeta:[{id:'s1', title:'Bölüm 1'}], sections: { s1: [{ id:'top1', title:'Konu', videos:[{id:'v1', title:'D1', access:'free'}]}] } } }, order:['t1'] } });
  const handler = await loadHandler();
  const k1 = encodeURIComponent('t1') + ':' + encodeURIComponent('s1') + ':' + encodeURIComponent('top1') + ':' + encodeURIComponent('v1');
  const course = encodeURIComponent('t1') + ':' + encodeURIComponent('s1');
  let res = makeRes();
  await handler(mkReq('POST', { op: 'merge', mode:'migration', marks: [{ k: k1, d: 1, t: 1000, src: 'migration' }] }, 'user-d1'), res);
  assert.equal(res.statusCode, 200);
  await new Promise(r => setTimeout(r, 1100));
  res = makeRes();
  await handler(mkReq('POST', { op: 'merge', mode:'migration', marks: [{ k: k1, d: 1, t: 1000, src: 'migration' }] }, 'user-d1b'), res);
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.data.marks[k1].d, 1);
  await new Promise(r => setTimeout(r, 1100));
  res = makeRes();
  await handler(mkReq('POST', { op: 'issueCertificate', course }, 'user-d1c'), res);
  assert.equal(res.statusCode, 200);
  const cert1 = JSON.parse(res.body).certificate;
  assert.ok(cert1.serial);
  await new Promise(r => setTimeout(r, 1100));
  res = makeRes();
  await handler(mkReq('POST', { op: 'issueCertificate', course }, 'user-d1d'), res);
  assert.equal(res.statusCode, 200);
  const cert2 = JSON.parse(res.body).certificate;
  assert.equal(cert2.serial, cert1.serial);
  assert.equal(cert2.issuedAt, cert1.issuedAt);
});
