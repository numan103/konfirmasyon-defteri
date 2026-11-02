import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import portfolio from '../lib/portfolio.mjs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function hydration(local, remote) {
  const storage = new Map();
  let writes = 0, renders = 0;
  const ctx = vm.createContext({
    ap2Data: local, ap2Ideas: [], AP2_KEY: 'fund',
    siteIsAdmin: () => true,
    localStorage: { setItem: (k, v) => storage.set(k, v) },
    ap2FetchCloud: async () => remote,
    ap2SyncCloud: async () => { writes++; },
    renderAlfaPortfoy2: () => { renders++; }, ap2LoadPrices: () => {},
    document: { getElementById: () => ({ textContent: '' }) }
  });
  vm.runInContext(html.slice(html.indexOf('let ap2ReadOnlyLoaded ='), html.indexOf("let ap2Filter =")), ctx);
  return { ctx, storage, writes: () => writes, renders: () => renders };
}
test('nonempty stale phone cache is replaced by server data without a write', async () => {
  const local = { positions: [{ id: 'old' }] };
  const remote = { v: 2, positions: [{ id: 'new', cost: 2180 }], sells: [], cash: 400 };
  const h = hydration(local, remote);
  await vm.runInContext('ap2Hydrate()', h.ctx);
  assert.equal(h.ctx.ap2Data.positions[0].id, 'new');
  assert.equal(h.writes(), 0);
  assert.equal(h.renders(), 1);
  assert.equal(JSON.parse(h.storage.get('alfa-fund-recovery-v1')).positions[0].id, 'old');
});
test('empty shared portfolio loads once, not an infinite hydration loop', async () => {
  const h = hydration({ positions: [] }, { v: 2, positions: [], sells: [], cash: 1000 });
  await vm.runInContext('ap2Hydrate()', h.ctx);
  assert.equal(vm.runInContext('ap2CloudReady', h.ctx), true);
  assert.equal(h.renders(), 1);
  assert.equal(h.writes(), 0);
});
test('legacy injected ETH seed is never displayed as a current portfolio', async () => {
  const seed = { positions: [{ id: 'eth-sep5' }], lastUpdate: '2026-09-05' };
  const h = hydration(seed, seed);
  await vm.runInContext('ap2Hydrate()', h.ctx);
  assert.equal(vm.runInContext('ap2CloudReady', h.ctx), false);
  assert.equal(h.renders(), 0);
  assert.equal(h.writes(), 0);
  assert.ok(!html.includes("localStorage.setItem('_ap_v',v)"));
});
test('rendering and quote refresh never save or fill positions', () => {
  const render = html.slice(html.indexOf('function renderAlfaPortfoy2()'), html.indexOf('async function ap2LoadPrices()'));
  assert.ok(!render.includes('ap2SyncCloud()'));
  const prices = html.slice(html.indexOf('async function ap2LoadPrices()'), html.indexOf('function ap2ShareMonthlyStrip()'));
  assert.ok(!prices.includes('ap2Save()'));
  assert.ok(!prices.includes('ap2FillsCheck()'));
});

function response() {
  return { code: null, body: null, setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
}
test('portfolio writes authenticate admin and compare the exact loaded revision', async () => {
  const original = global.fetch;
  const oldKey = process.env.SUPABASE_SERVICE_ROLE;
  process.env.SUPABASE_SERVICE_ROLE = 'test-key';
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'admin', email: 'ahmetnuman20@gmail.com' }) };
    return { ok: true, json: async () => [] }; // CAS didn't match: stale device
  };
  try {
    const res = response();
    await portfolio({ method: 'POST', headers: { authorization: 'Bearer session' }, body: { revision: '2026-11-02T00:00:00Z', data: { v: 2, positions: [], sells: [] } } }, res);
    assert.equal(res.code, 409);
    assert.match(calls[1].url, /updated_at=eq\.2026-11-02T00%3A00%3A00Z/);
    assert.equal(calls[1].options.method, 'PATCH');
  } finally {
    global.fetch = original;
    if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE; else process.env.SUPABASE_SERVICE_ROLE = oldKey;
  }
});
test('unauthenticated portfolio writes are denied without touching storage', async () => {
  const res = response();
  await portfolio({ method: 'POST', headers: {} }, res);
  assert.equal(res.code, 401);
});
test('premium can read but cannot write; free users cannot read positions', async () => {
  const original = global.fetch;
  const oldKey = process.env.SUPABASE_SERVICE_ROLE;
  process.env.SUPABASE_SERVICE_ROLE = 'test-key';
  let verified = true, writes = 0;
  global.fetch = async (url, options) => {
    if (url.endsWith('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'member', email: 'member@example.com' }) };
    if (url.includes('/site_access?')) return { ok: true, json: async () => [{ status: verified ? 'verified' : 'pending' }] };
    if (options.method) writes++;
    return { ok: true, json: async () => [{ data: { v: 2, positions: [{ id: 'current' }] }, updated_at: 'revision' }] };
  };
  try {
    const req = { headers: { authorization: 'Bearer session' } };
    const read = response(); await portfolio({ ...req, method: 'GET' }, read);
    assert.equal(read.code, 200); assert.equal(read.body.data.positions[0].id, 'current');
    const write = response(); await portfolio({ ...req, method: 'POST' }, write);
    assert.equal(write.code, 403); assert.equal(writes, 0);
    verified = false;
    const free = response(); await portfolio({ ...req, method: 'GET' }, free);
    assert.equal(free.code, 403);
  } finally {
    global.fetch = original;
    if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE; else process.env.SUPABASE_SERVICE_ROLE = oldKey;
  }
});
