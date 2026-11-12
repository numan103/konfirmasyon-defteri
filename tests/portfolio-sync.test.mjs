import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import portfolio from '../lib/portfolio.mjs';
import { reconcileCash } from '../lib/portfolio.mjs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function hydration(local, remote) {
  const storage = new Map();
  let writes = 0, renders = 0;
  const ctx = vm.createContext({
    ap2Data: local, ap2Ideas: [], AP2_KEY: 'fund', AP2_HIST_KEY: 'fund-history',
    siteIsAdmin: () => true,
    localStorage: { setItem: (k, v) => storage.set(k, v) },
    ap2FetchCloud: async () => remote,
    ap2SyncCloud: async () => { writes++; },
    renderAlfaPortfoy2: () => { renders++; }, ap2LoadPrices: () => {},
    document: {
      querySelector: () => ({ textContent: '' }),
      getElementById: () => ({ textContent: '', appendChild() {} }),
      createElement: () => ({}), createTextNode: () => ({})
    }
  });
  vm.runInContext(html.slice(html.indexOf('let ap2ReadOnlyLoaded ='), html.indexOf("let ap2Filter =")), ctx);
  return { ctx, storage, writes: () => writes, renders: () => renders };
}
test('nonempty stale phone cache is replaced by server data without a write', async () => {
  const local = { positions: [{ id: 'old' }] };
  const remote = { v: 2, positions: [{ id: 'new', cost: 2180 }], sells: [], cash: 400, history: [{d:'2026-11-02',v:1200}] };
  const h = hydration(local, remote);
  await vm.runInContext('ap2Hydrate()', h.ctx);
  assert.equal(h.ctx.ap2Data.positions[0].id, 'new');
  assert.equal(h.writes(), 0);
  assert.equal(h.renders(), 1);
  assert.deepEqual(JSON.parse(h.storage.get('fund-history')), remote.history);
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
test('failed server auth preserves and displays the real desktop copy read-only', async () => {
  const local = { positions: [{ id: 'real-current', cost: 2180 }], sells: [] };
  const h = hydration(local, null);
  h.ctx.ap2FetchCloud = async () => { throw new Error('401'); };
  await vm.runInContext('ap2Hydrate()', h.ctx);
  assert.equal(h.ctx.ap2Data.positions[0].id, 'real-current');
  assert.equal(vm.runInContext('ap2LocalPreview', h.ctx), true);
  assert.equal(vm.runInContext('ap2CloudReady', h.ctx), false);
  assert.equal(h.renders(), 1);
  assert.equal(h.writes(), 0);
});
test('siteFetch refreshes an expired session and retries 401 only once', async () => {
  let refreshes = 0;
  const sent = [];
  const ctx = vm.createContext({
    AUTH: { client: { auth: {
      getSession: async () => ({ data: { session: { access_token: 'old' } } }),
      refreshSession: async () => { refreshes++; return { data: { session: { access_token: 'renewed' } } }; }
    } } },
    fetch: async (url, opts) => { sent.push(opts.headers.Authorization); return { status: sent.length === 1 ? 401 : 200 }; }
  });
  vm.runInContext(html.slice(html.indexOf('let siteRefreshPromise'), html.indexOf('function siteApplyAccess')), ctx);
  const res = await vm.runInContext("siteFetch('/api/edu-shared?kind=portfolio')", ctx);
  assert.equal(res.status, 200);
  assert.equal(refreshes, 1);
  assert.deepEqual(sent, ['Bearer old', 'Bearer renewed']);
  sent.length = 0;
  ctx.fetch = async (url, opts) => { sent.push(opts.headers.Authorization); return { status: 401 }; };
  const failed = await vm.runInContext("siteFetch('/api/edu-shared?kind=portfolio')", ctx);
  assert.equal(failed.status, 401); assert.equal(sent.length, 2);
});
test('rendering and quote refresh never save or fill positions', () => {
  const render = html.slice(html.indexOf('function renderAlfaPortfoy2()'), html.indexOf('async function ap2LoadPrices()'));
  assert.ok(!render.includes('ap2SyncCloud()'));
  const prices = html.slice(html.indexOf('async function ap2LoadPrices()'), html.indexOf('function ap2ShareMonthlyStrip()'));
  assert.ok(!prices.includes('ap2Save()'));
  assert.ok(!prices.includes('ap2FillsCheck()'));
  assert.ok(!html.includes('function ap2RetryButton'));
  assert.ok(!html.includes("el.id = 'ap2-sync-status'"));
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

test('cash is derived from filled positions and realized profit', () => {
  const data = {
    startBalance: 1000, cash: 9999,
    positions: [
      { qty: 0.275, cost: 2180, lim: true, filled: '2026-10-30' },
      { qty: 1, cost: 100 },
      { lim: true, filled: null, qty: 1, cost: 50 },
    ],
    sells: [{ pnl: 268.58 }, { profit: -7.52 }, { pnl: '', profit: 1.5 }],
  };
  assert.equal(reconcileCash(data), Math.round((1000 - (0.275 * 2180 + 100) + 268.58 - 7.52 + 1.5) * 100) / 100);
});

test('stored cash drift is corrected on write', async () => {
  const original = global.fetch;
  const oldKey = process.env.SUPABASE_SERVICE_ROLE;
  process.env.SUPABASE_SERVICE_ROLE = 'test-key';
  let stored = null;
  global.fetch = async (url, options) => {
    if (url.endsWith('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'admin', email: process.env.ADMIN_EMAIL || 'ahmetnuman20@gmail.com' }) };
    if (url.includes('/site_access?')) return { ok: true, json: async () => [{ status: 'verified' }] };
    if (url.includes('updated_at=eq.')) return { ok: true, json: async () => [{ updated_at: 'new-revision' }] };
    if (url.includes('/rest/v1/edu_shared')) return { ok: true, json: async () => [{ data: null, updated_at: 'rev' }] };
    return { ok: true, json: async () => ({}) };
  };
  try {
    const data = { v: 2, startBalance: 1000, positions: [{ qty: 1, cost: 400 }], sells: [], cash: 1000, lastUpdate: '2026-11-12T00:00:00.000Z' };
    const write = response();
    await portfolio({ method: 'POST', headers: { authorization: 'Bearer session' }, body: JSON.stringify({ revision: 'rev', data }), query: {} }, write);
    assert.equal(write.code, 200);
    assert.equal(write.body.cash, 600);
    assert.equal(write.body.cashAdjusted, true);
  } finally {
    global.fetch = original;
    if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE; else process.env.SUPABASE_SERVICE_ROLE = oldKey;
  }
});
