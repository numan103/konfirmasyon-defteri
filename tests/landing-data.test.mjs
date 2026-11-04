import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { publicPortfolio, publicTradeResults } from '../lib/landing.mjs';

test('public portfolio projection exposes only percentages and dates, never money or positions', () => {
  const data = { startBalance: 1000, cash: 123456, positions: [{ symbol: 'SECRET', qty: 99 }], note: 'PRIVATE', sells: [{ price: 999 }], history: [
    { d: '2026-10-02', v: 900 }, { d: '2026-10-01', v: 1000 }, { d: '2026-10-02', v: 950 }, { d: 'bad', v: 900 }, { d: '2026-10-03', v: null },
  ] };
  const p = publicPortfolio(data, { pnlPct: -5, portfolioValue: 950, pnl: -50, asOf: '2026-10-02', live: false }, '2026-10-02');
  assert.equal(p.returnPct, -5);
  assert.equal(p.live, false);
  assert.deepEqual(p.series, [{ date: '2026-10-01', pct: 0 }, { date: '2026-10-02', pct: -5 }]);
  assert.deepEqual(Object.keys(p).sort(), ['returnPct', 'asOf', 'recordedAt', 'live', 'series', 'from', 'to'].sort());
  for (const secret of ['SECRET', 'PRIVATE', '123456', 'portfolioValue', 'startBalance', 'cash', 'positions', 'sells', '"v"']) assert.ok(!JSON.stringify(p).includes(secret), secret);
  assert.equal(publicPortfolio({ startBalance: 0 }, { pnlPct: 0 }), null);
  assert.equal(publicPortfolio({ startBalance: 1000, positions: [{ id: 'eth-sep5' }] }, { pnlPct: 99 }), null);
});

function record(id, date, r, market = 'Kripto') {
  return { market, page: { id, properties: { Tarih: { date: { start: date } }, Profit: { number: r }, Not: { rich_text: [{ plain_text: 'SECRET' }] }, Pair: { select: { name: 'PRIVATE' } } } } };
}
test('trade aggregates include losses and zero, deduplicate, exclude open/invalid records and publish no private fields', () => {
  const rows = [record('win', '2026-10-01', 2), record('loss', '2026-10-02', -1, 'Fx'), record('zero', '2026-10-03', 0), record('open', '2026-10-04', null), record('bad', null, 8), record('win', '2026-10-01', 2)];
  const t = publicTradeResults(rows);
  assert.equal(t.count, 3);
  assert.equal(t.totalR, 1);
  assert.equal(t.wins, 1); assert.equal(t.losses, 1); assert.equal(t.breakeven, 1);
  assert.equal(t.from, '2026-10-01'); assert.equal(t.to, '2026-10-03');
  assert.equal(t.latest[0].r, 0);
  assert.deepEqual(Object.keys(t.latest[0]).sort(), ['date', 'market', 'r']);
  assert.ok(!JSON.stringify(t).includes('SECRET'));
  assert.ok(!JSON.stringify(t).includes('PRIVATE'));
  assert.equal(publicTradeResults([record('open', '2026-10-04', null)]), null);
});

test('anonymous landing endpoint is GET-only, reads approved sources, isolates failures and never returns the source row', async () => {
  const original = global.fetch;
  const oldKey = process.env.SUPABASE_SERVICE_ROLE, oldNotion = process.env.NOTION_TOKEN;
  process.env.SUPABASE_SERVICE_ROLE = 'sb_secret_test';
  process.env.NOTION_TOKEN = 'notion-test';
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.includes('/edu_shared?')) return { ok: true, json: async () => [{ data: { startBalance: 1000, cash: 1050, positions: [], history: [{ d: '2026-10-01', v: 1000 }] }, updated_at: '2026-10-02' }] };
    if (url.includes('/databases/')) return { ok: true, json: async () => ({ results: [record(url, '2026-10-02', -1).page], has_more: false }) };
    throw new Error('unexpected URL');
  };
  const response = () => ({ headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
  try {
    const { default: handler } = await import('../lib/landing.mjs?success');
    const denied = response(); await handler({ method: 'POST', headers: {} }, denied);
    assert.equal(denied.code, 405); assert.equal(calls.length, 0);
    const r = response(); await handler({ method: 'GET', headers: {} }, r);
    assert.equal(r.code, 200); assert.equal(r.body.portfolio.returnPct, 5);
    assert.equal(r.body.trades.count, 3); assert.equal(r.body.trades.totalR, -3);
    assert.deepEqual(r.body.status, { portfolio: 'ok', trades: 'ok' });
    assert.ok(!JSON.stringify(r.body).includes('cash'));
    assert.ok(!JSON.stringify(r.body).includes('SECRET'));
    assert.equal(calls.filter(x => x.url.includes('/databases/')).length, 3);
    const count = calls.length;
    await handler({ method: 'GET' }, response());
    assert.equal(calls.length, count);
    global.fetch = async url => {
      if (url.includes('/edu_shared?')) return { ok: true, json: async () => [{ data: { startBalance: 1000, cash: 900, positions: [] }, updated_at: '2026-10-02' }] };
      throw new Error('secret upstream error');
    };
    const { default: unavailable } = await import('../lib/landing.mjs?failed');
    const partial = response(); await unavailable({ method: 'GET' }, partial);
    assert.equal(partial.body.portfolio.returnPct, -10);
    assert.equal(partial.body.trades, null);
    assert.equal(partial.body.status.trades, 'unavailable');
    assert.ok(!JSON.stringify(partial.body).includes('secret upstream'));
  } finally {
    global.fetch = original;
    if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE; else process.env.SUPABASE_SERVICE_ROLE = oldKey;
    if (oldNotion === undefined) delete process.env.NOTION_TOKEN; else process.env.NOTION_TOKEN = oldNotion;
  }
});

test('landing client reads only public endpoints and never stores raw portfolio state', () => {
  const js = fs.readFileSync(new URL('../assets/landing-live.js', import.meta.url), 'utf8');
  assert.ok(js.includes('/api/edu-shared?kind=landing'));
  for (const blocked of ['innerHTML', 'localStorage', 'ap2FetchCloud', 'setInterval', 'kind=portfolio']) assert.ok(!js.includes(blocked), blocked);
});
