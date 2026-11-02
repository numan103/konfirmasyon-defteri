import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { summarizePortfolio } from '../lib/portfolio-summary.mjs';
import portfolio from '../lib/portfolio.mjs';

test('summary uses active positions and current quotes, excluding pending orders', () => {
  const data = { startBalance: 1000, cash: 700, positions: [
    { symbol: 'ETH', qty: 1, cost: 300, price: 200, lim: true, filled: '2026-10-30' },
    { symbol: 'XAU', qty: 20, cost: 3850, lim: true, filled: null }
  ] };
  const d = summarizePortfolio(data, { ETH: 350 }, '2026-11-02T12:00:00Z');
  assert.equal(d.portfolioValue, 1050);
  assert.equal(d.pnl, 50);
  assert.equal(d.pnlPct, 5);
  assert.equal(d.live, true);
  assert.equal(d.count, 1);
  assert.deepEqual(Object.keys(d).sort(), ['portfolioValue', 'count', 'pnl', 'pnlPct', 'asOf', 'live'].sort());
});
test('quote failure is explicitly a saved valuation, not a live quote', () => {
  const d = summarizePortfolio({ startBalance: 1000, cash: 700, syncedAt: '2026-10-31', positions: [{ symbol: 'ETH', qty: 1, cost: 300, price: 250 }] }, {}, '2026-11-02');
  assert.equal(d.pnl, -50);
  assert.equal(d.live, false);
  assert.equal(d.asOf, '2026-10-31');
});
test('new members receive aggregates, never portfolio details; writes remain forbidden', async () => {
  const original = global.fetch, oldKey = process.env.SUPABASE_SERVICE_ROLE;
  process.env.SUPABASE_SERVICE_ROLE = 'sb_secret_test';
  const privateData = { positions: [], cash: 1200, startBalance: 1000, sells: [{ symbol: 'PRIVATE', note: 'private note' }], ideas: ['private idea'], history: [{v:1111}], secret: 'private token' };
  global.fetch = async url => {
    if (url.endsWith('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'new-member', email: 'new@example.com' }) };
    if (url.includes('/site_access?')) return { ok: true, json: async () => [{ status: 'pending' }] };
    return { ok: true, json: async () => [{ data: privateData, updated_at: '2026-11-02' }] };
  };
  function res() { return { setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } }; }
  try {
    const req = { headers: { authorization: 'Bearer session' }, query: { view: 'summary' } };
    const read = res(); await portfolio({ ...req, method: 'GET' }, read);
    assert.equal(read.code, 200);
    assert.equal(read.body.summary.pnl, 200);
    assert.equal(read.body.summary.pnlPct, 20);
    assert.equal(read.body.summary.count, 0);
    assert.ok(!JSON.stringify(read.body).includes('private'));
    assert.equal(read.body.data, undefined);
    assert.equal(read.body.revision, undefined);
    for (const [method, query] of [['GET', {}], ['POST', { view: 'summary' }]]) {
      const denied = res(); await portfolio({ ...req, method, query }, denied);
      assert.equal(denied.code, 403);
    }
  } finally {
    global.fetch = original;
    if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE; else process.env.SUPABASE_SERVICE_ROLE = oldKey;
  }
});
test('free home and portfolio previews fetch only the summary and retain the premium invitation', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const home = html.slice(html.indexOf('async function renderHomeTeaser()'), html.indexOf("window.addEventListener('popstate'"));
  assert.ok(home.includes('ap2FetchSummary()'));
  assert.ok(!home.includes('ap2FetchCloud('));
  const gate = html.slice(html.indexOf('function ap2ShowGate()'), html.indexOf('function ap2RenderPublicTeaser()'));
  assert.ok(gate.includes('ap2FetchSummary()'));
  assert.ok(!gate.includes('ap2Load()'));
  assert.ok(gate.includes('premium erişimini aç'));
  assert.ok(html.includes("if (page === 'portfoy') return true"));
});
