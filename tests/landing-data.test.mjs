import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { publicPortfolio, publicChannel, previewImage } from '../lib/landing.mjs';

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

const NOW = Date.now();
function post(id, type, ts, extra = {}) {
  return { id, type, ts: NOW - 10000 + ts, isAdmin: true, title: 'Gerçek başlık', text: 'Kısa açıklama', img: 'https://example.com/chart.png', authorEmail: 'SECRET', entry: 'PRIVATE', tp: 'PRIVATE', sl: 'PRIVATE', comments: [{ text: 'PRIVATE' }], quote: { note: 'PRIVATE' }, ...extra };
}
test('channel previews use actual admin posts with real images, direction and status, not Notion results', () => {
  const data = { posts: [post('trade-1', 'islem', 1000, { status: 'sl' }), post('trade-2', 'islem', 2000, { status: 'aktif' }), post('bias-1', 'analiz', 3000, { bias: 'short' }), post('bias-2', 'onchain', 4000, { bias: 'long' }), post('user', 'analiz', 5000, { isAdmin: false }), post('bad', 'analiz', NaN), post('old', 'islem', -8 * 86400000), post('future', 'analiz', 86400000)] };
  const c = publicChannel(data, NOW);
  assert.equal(c.trades.count, 2);
  assert.equal(c.trades.sl, 1); assert.equal(c.trades.tp, 0);
  assert.equal(c.trades.latest[0].id, 'trade-2');
  assert.equal(c.trades.latest[0].status, 'aktif');
  assert.equal(c.biases.count, 2);
  assert.equal(c.biases.latest[0].direction, 'long');
  assert.equal(c.biases.latest[0].image, '/api/edu-shared?kind=landing&image=bias-2');
  assert.equal(c.biases.latest.length, 2);
  assert.equal(c.from, new Date(NOW - 7 * 86400000).toISOString());
  assert.equal(c.biases.latest[0].title, 'Gerçek başlık');
  assert.ok(!JSON.stringify(c).includes('SECRET'));
  assert.ok(!JSON.stringify(c).includes('PRIVATE'));
  assert.equal(c.trades.totalR, undefined);
  assert.equal(publicChannel(null, NOW).trades.count, 0);
  assert.deepEqual(publicChannel(null, NOW).biases.latest, []);
  assert.equal(publicChannel({ posts: [{ ...post('edge', 'islem', 0), ts: NOW - 7 * 86400000 }] }, NOW).trades.count, 1);
});

test('preview images permit raster images and HTTPS, never executable schemes or SVG payloads', () => {
  assert.equal(previewImage('javascript:alert(1)'), '');
  assert.equal(previewImage('data:image/svg+xml;base64,PHN2Zz4='), '');
  assert.equal(previewImage('https://user:secret@example.com/image.png'), '');
  assert.equal(previewImage('data:image/png;base64,aGVsbG8='), 'data:image/png;base64,aGVsbG8=');
});

test('anonymous landing endpoint is GET-only, reads approved sources, isolates failures and never returns the source row', async () => {
  const original = global.fetch;
  const oldKey = process.env.SUPABASE_SERVICE_ROLE;
  process.env.SUPABASE_SERVICE_ROLE = 'sb_secret_test';
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.includes('id=eq.alfa_portfoy_public')) return { ok: true, json: async () => [{ data: { startBalance: 1000, cash: 1050, positions: [], history: [{ d: '2026-10-01', v: 1000 }] }, updated_at: '2026-10-02' }] };
    if (url.includes('id=eq.alfa_trading')) return { ok: true, json: async () => [{ data: { posts: [post('trade', 'islem', 1000, { img: 'data:image/png;base64,aGVsbG8=' }), post('bias', 'analiz', 2000), post('old', 'analiz', -8 * 86400000)] } }] };
    throw new Error('unexpected URL');
  };
  const response = () => ({ headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, send(body) { this.body = body; return this; }, redirect(code, url) { this.code = code; this.url = url; return this; } });
  try {
    const { default: handler } = await import('../lib/landing.mjs?success');
    const denied = response(); await handler({ method: 'POST', headers: {} }, denied);
    assert.equal(denied.code, 405); assert.equal(calls.length, 0);
    const r = response(); await handler({ method: 'GET', headers: {} }, r);
    assert.equal(r.code, 200); assert.equal(r.body.portfolio.returnPct, 5);
    assert.equal(r.body.channel.trades.count, 1); assert.equal(r.body.channel.biases.count, 1);
    assert.deepEqual(r.body.status, { portfolio: 'ok', channel: 'ok' });
    assert.ok(!JSON.stringify(r.body).includes('cash'));
    assert.ok(!JSON.stringify(r.body).includes('SECRET'));
    assert.equal(calls.filter(x => x.url.includes('notion')).length, 0);
    const count = calls.length;
    await handler({ method: 'GET' }, response());
    assert.equal(calls.length, count);
    const image = response(); await handler({ method: 'GET', query: { image: 'trade' } }, image);
    assert.equal(image.code, 200);
    assert.equal(image.headers['Content-Type'], 'image/png');
    assert.equal(image.body.toString(), 'hello');
    const external = response(); await handler({ method: 'GET', query: { image: 'bias' } }, external);
    assert.equal(external.code, 302);
    assert.equal(external.url, 'https://example.com/chart.png');
    for (const id of ['old', 'missing']) {
      const hidden = response(); await handler({ method: 'GET', query: { image: id } }, hidden);
      assert.equal(hidden.code, 404);
    }
    const invalid = response(); await handler({ method: 'GET', query: { image: '../secret' } }, invalid);
    assert.equal(invalid.code, 400);
    assert.equal(calls.length, count);
    global.fetch = async url => {
      if (url.includes('id=eq.alfa_portfoy_public')) return { ok: true, json: async () => [{ data: { startBalance: 1000, cash: 900, positions: [] }, updated_at: '2026-10-02' }] };
      throw new Error('secret upstream error');
    };
    const { default: unavailable } = await import('../lib/landing.mjs?failed');
    const partial = response(); await unavailable({ method: 'GET' }, partial);
    assert.equal(partial.body.portfolio.returnPct, -10);
    assert.equal(partial.body.channel, null);
    assert.equal(partial.body.status.channel, 'unavailable');
    assert.ok(!JSON.stringify(partial.body).includes('secret upstream'));
  } finally {
    global.fetch = original;
    if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE; else process.env.SUPABASE_SERVICE_ROLE = oldKey;
  }
});

test('landing client reads only public endpoints and never stores raw portfolio state', () => {
  const js = fs.readFileSync(new URL('../assets/landing-live.js', import.meta.url), 'utf8');
  assert.ok(js.includes('/api/edu-shared?kind=landing'));
  for (const blocked of ['innerHTML', 'localStorage', 'ap2FetchCloud', 'setInterval', 'kind=portfolio', '/api/tg', 'totalR']) assert.ok(!js.includes(blocked), blocked);
});
