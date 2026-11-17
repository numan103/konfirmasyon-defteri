import test from 'node:test';
import assert from 'node:assert/strict';
import { influencerHandler as handler, INF_PACKAGE_PRICES } from '../api/ai.mjs';

const txid = 'a'.repeat(64);
async function call(req = {}) {
  let output;
  const res = { statusCode: 0, setHeader() {}, end(s) { output = JSON.parse(s); } };
  await handler({ method: 'GET', headers: { authorization: 'Bearer test' }, query: {}, ...req }, res);
  return { status: res.statusCode, body: output };
}
function fake(t, { admin = false, orders = [], storage = true } = {}) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, opts = {}) => {
    calls.push({ url, opts });
    if (url.includes('/auth/v1/user')) return Response.json({ id: '00000000-0000-0000-0000-000000000001', email: admin ? 'ahmetnuman20@gmail.com' : 'member@example.com' });
    if (url.includes('/rest/v1/')) {
      if (!storage) return Response.json({}, { status: 404 });
      if (opts.method === 'POST') return Response.json([{ id: '00000000-0000-0000-0000-000000000002', ...JSON.parse(opts.body) }]);
      if (opts.method === 'PATCH') return Response.json([{ id: 'updated' }]);
      return Response.json(orders);
    }
    if (url.includes('api.telegram.org')) return Response.json({ ok: true });
    throw new Error('Unexpected fetch');
  });
  for (const [key, value] of Object.entries({
    SUPABASE_SERVICE_ROLE: 'test', SITE_ADMIN_EMAILS: 'ahmetnuman20@gmail.com',
    TG_BOT_TOKEN: 'test', TG_ADMIN_CHAT_ID: '12345'
  })) {
    const old = process.env[key];
    process.env[key] = value;
    t.after(() => { if (old === undefined) delete process.env[key]; else process.env[key] = old; });
  }
  return calls;
}
test('anonymous requests are denied before database access', async () => {
  assert.equal((await call({ headers: {} })).status, 401);
});
test('public prices work without login even when FX is unavailable', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({}, { status: 503 }));
  const r = await call({ headers: {}, query: { op: 'prices' } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.prices, { video: 50, guided: 90, growth: 175 });
  assert.equal(r.body.currency, 'USDT');
  assert.equal(r.body.fx, null);
  assert.deepEqual(r.body.prices, INF_PACKAGE_PRICES);
});
test('public FX rejects malformed rates without inventing a TRY equivalent', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ base: 'USD', amount: 1, date: new Date().toISOString().slice(0, 10), rates: { TRY: -1 } }));
  const r = await call({ headers: {}, query: { op: 'prices' } });
  assert.equal(r.body.fx, null);
});
test('public prices include a dated source for valid FX estimates', async t => {
  const date = new Date().toISOString().slice(0, 10);
  t.mock.method(globalThis, 'fetch', async () => Response.json({ base: 'USD', amount: 1, date, rates: { TRY: 50 } }));
  const r = await call({ headers: {}, query: { op: 'prices' } });
  assert.deepEqual(r.body.fx, { usdTry: 50, date, source: 'Frankfurter / ECB' });
  assert.equal(r.body.prices.video, 50);
});
test('premium member cannot read outline, list orders or approve payments', async t => {
  const calls = fake(t);
  assert.equal((await call({ query: { op: 'outline' } })).status, 403);
  assert.equal((await call({ query: { op: 'list' } })).status, 403);
  assert.equal((await call({ method: 'POST', body: { op: 'approve', id: '0'.repeat(36) } })).status, 403);
  assert.equal(calls.filter(c => c.url.includes('/rest/v1/')).length, 0);
});
test('admin alone receives private outline even before migration', async t => {
  fake(t, { admin: true, storage: false });
  const r = await call({ query: { op: 'outline' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.outline.length, 10);
});
test('pending payment never unlocks content; approved payment does', async t => {
  fake(t, { orders: [{ status: 'pending' }] });
  assert.equal((await call()).body.unlocked, false);
});
test('approved payment unlocks content', async t => {
  fake(t, { orders: [{ status: 'approved' }] });
  assert.equal((await call()).body.unlocked, true);
});
test('invalid txid or package is rejected, not sent to Telegram', async t => {
  const calls = fake(t);
  assert.equal((await call({ method: 'POST', body: { op: 'submit', package: 'video', txid: 'no' } })).status, 400);
  assert.equal((await call({ method: 'POST', body: { op: 'submit', package: '__proto__', txid } })).status, 400);
  assert.equal(calls.filter(c => c.url.includes('api.telegram.org')).length, 0);
});
test('valid request is persisted pending, notifies admin privately without topic fallback', async t => {
  const calls = fake(t);
  const r = await call({ method: 'POST', body: { op: 'submit', package: 'guided', txid, status: 'approved', user_id: 'attacker' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'pending');
  const insert = JSON.parse(calls.find(c => c.opts.method === 'POST' && c.url.includes('/rest/v1/')).opts.body);
  assert.equal(insert.user_id, '00000000-0000-0000-0000-000000000001');
  assert.ok(!insert.status);
  const message = JSON.parse(calls.find(c => c.url.includes('api.telegram.org')).opts.body);
  assert.equal(message.chat_id, '12345');
  assert.ok(!message.message_thread_id);
  assert.match(message.text, /henüz doğrulanmadı/);
  assert.match(message.text, /90 USDT/);
});
test('storage failures do not falsely report payment success or notify admin', async t => {
  const calls = fake(t, { storage: false });
  assert.equal((await call({ method: 'POST', body: { op: 'submit', package: 'video', txid } })).status, 503);
  assert.equal(calls.filter(c => c.url.includes('api.telegram.org')).length, 0);
});
