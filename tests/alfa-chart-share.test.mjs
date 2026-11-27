import test from 'node:test';
import assert from 'node:assert/strict';
import { chartShareHandler, normalizeChartSnapshot } from '../lib/chart-share.mjs';

function mockRes() {
  const data = { statusCode: 200, headers: {}, body: null };
  return {
    data,
    status(code) { data.statusCode = code; return this; },
    setHeader(key, value) { data.headers[key.toLowerCase()] = value; },
    getHeader(key) { return data.headers[key.toLowerCase()]; },
    end(body) { if (body !== undefined) data.body = body; return this; },
    json(value) { data.body = value; return this; },
    send(value) { data.body = value; return this; }
  };
}

const payload = () => ({
  chart: {
    symbol: 'ethusdt', interval: '15m', chartName: 'ETH trend', sharer: 'Guest analyst',
    site: 'alfa-trader.com', date: '2026-11-27T00:00:00Z',
    indicators: [{ type: 'rsi', params: { period: 14 } }, { type: 'evil', params: {} }],
    studies: { volume: { added: true, visible: true }, evil: { added: true } },
    scripts: [{ name: 'Avg', code: 'function onBar(ctx) { ctx.plot("x", ctx.close); }', overlay: true }]
  }
});

function storage() {
  let row = null, writeHeaders = null;
  const fetcher = async (url, options = {}) => {
    const target = String(url);
    assert.match(target, /\/rest\/v1\/edu_shared/);
    if (options.method === 'POST') {
      writeHeaders = options.headers || {};
      const parsed = JSON.parse(options.body);
      row = parsed.data;
      return new Response('', { status: 201 });
    }
    return new Response(JSON.stringify(row ? [{ data: row }] : []), { status: 200 });
  };
  return { fetcher, get row() { return row; }, get writeHeaders() { return writeHeaders; } };
}

const deps = store => ({
  fetcher: store.fetcher, serviceKey: 'service-test-key', publishableKey: 'publish-test-key',
  supabaseUrl: 'https://share.test', random: () => 'abc12345', now: () => '2026-11-27T00:00:00Z'
});

test('anonymous chart links are stored in backend state and restored by id', async () => {
  const store = storage();
  const create = mockRes();
  await chartShareHandler({ method: 'POST', query: { kind: 'chart' }, headers: { 'cf-connecting-ip': '203.0.113.7' }, body: payload(), url: '/api/edu-shared?kind=chart' }, create, deps(store));
  assert.equal(create.data.statusCode, 200, JSON.stringify(create.data.body));
  assert.equal(create.data.body.id, 'abc12345');
  assert.equal(create.data.body.url, '/alfa-charts.html?share=abc12345');
  assert.equal(store.writeHeaders.Authorization, 'Bearer service-test-key', 'writes must use the server-only role');
  assert.equal(store.writeHeaders.apikey, 'service-test-key');
  assert.ok(store.row.abc12345, 'snapshot must live in backend storage');

  const restored = mockRes();
  await chartShareHandler({ method: 'GET', query: { kind: 'chart', id: 'abc12345' }, headers: {}, url: '/api/edu-shared?kind=chart&id=abc12345' }, restored, deps(store));
  assert.equal(restored.data.statusCode, 200);
  assert.equal(restored.data.body.found, true);
  const snapshot = restored.data.body.snapshot;
  assert.equal(snapshot.symbol, 'ETHUSDT');
  assert.equal(snapshot.interval, '15m');
  assert.equal(snapshot.chartName, 'ETH trend');
  assert.equal(snapshot.sharer, 'Guest analyst');
  assert.equal(snapshot.site, 'alfa-trader.com');
  assert.equal(snapshot.date, '2026-11-27');
  assert.match(snapshot.createdAt, /^2026-11-27T00:00:00(\.000)?Z$/);
  assert.deepEqual(snapshot.indicators, [{ type: 'rsi', params: { period: 14 }, visible: true, collapsed: false }]);
  assert.deepEqual(snapshot.studies, { volume: { added: true, visible: true, collapsed: false } });
  assert.equal(snapshot.scripts[0].code, 'function onBar(ctx) { ctx.plot("x", ctx.close); }');
  assert.equal(snapshot.ip, undefined);
  assert.equal(snapshot.owner, undefined);

  const missing = mockRes();
  await chartShareHandler({ method: 'GET', query: { kind: 'chart', id: 'nope' }, headers: {}, url: '/api/edu-shared?kind=chart&id=nope' }, missing, deps(store));
  assert.equal(missing.data.body.found, false);
  assert.equal(missing.data.body.snapshot, null);
});

test('chart links normalize public metadata and reject unsafe payloads', async () => {
  const clean = normalizeChartSnapshot({ ...payload().chart, symbol: 'BTCUSDT', sharer: '<img src=x>', site: 'https://evil.test/?x=1' });
  assert.equal(clean.sharer, 'img src=x');
  assert.equal(clean.site, 'evil.test');
  assert.equal(clean.date.length, 10);

  const store = storage();
  const badSymbol = mockRes();
  await chartShareHandler({ method: 'POST', query: { kind: 'chart' }, headers: {}, body: { chart: { ...payload().chart, symbol: '<script>' } }, url: '/api/edu-shared?kind=chart' }, badSymbol, deps(store));
  assert.equal(badSymbol.data.statusCode, 400);

  const bigScript = mockRes();
  await chartShareHandler({ method: 'POST', query: { kind: 'chart' }, headers: {}, body: { chart: { ...payload().chart, scripts: [{ name: 'x', code: 'x'.repeat(25000) }] } }, url: '/api/edu-shared?kind=chart' }, bigScript, deps(store));
  assert.equal(bigScript.data.statusCode, 413);

  const wrongMethod = mockRes();
  await chartShareHandler({ method: 'DELETE', query: { kind: 'chart' }, headers: {}, body: {}, url: '/api/edu-shared?kind=chart' }, wrongMethod, deps(store));
  assert.equal(wrongMethod.data.statusCode, 405);
});
