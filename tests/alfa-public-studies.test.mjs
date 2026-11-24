import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PUBLIC_STUDY_IDS, PUBLIC_STUDY_NAMES, normalizePublicStudyConfig,
  publicStudyMarket, PublicStudiesManager
} from '../assets/alfa-public-studies.mjs';
import { PUBLIC_MARKET_SOURCES } from '../assets/alfa-market-data-public.mjs';

test('public studies keep each reference on its own venue and sanitize settings', () => {
  assert.equal(PUBLIC_STUDY_IDS.length, 7);
  assert.match(PUBLIC_STUDY_NAMES.heatmap, /Likidite/);
  assert.deepEqual(publicStudyMarket('BTCUSDT', 'auto'), { symbol: 'BTCUSDT', market: 'spot' });
  assert.deepEqual(publicStudyMarket('BINANCE:ETHUSDT.P', 'auto'), { symbol: 'ETHUSDT', market: 'perp' });
  assert.equal(publicStudyMarket('BINANCE:BTCUSDT.P', 'spot').market, 'spot');
  assert.equal(publicStudyMarket('OKX:BTCUSDT', 'auto'), null);
  assert.equal(publicStudyMarket('CRYPTOCAP:TOTAL', 'auto'), null);
  const cfg = normalizePublicStudyConfig('heatmap', { levels: 999, refresh: 1, bidColor: 'red', askColor: '#ef6677' });
  assert.equal(cfg.levels, 60);
  assert.equal(cfg.refresh, 60);
  assert.equal(cfg.bidColor, '#26c89c');
  assert.equal(cfg.askColor, '#ef6677');
  assert.equal(normalizePublicStudyConfig('oi', { period: 'hack' }).period, 'auto');
  for (const period of ['2h', '6h', '12h']) assert.equal(normalizePublicStudyConfig('oi', { period }).period, period);
});

function fixture(options = {}) {
  const added = [], removed = [], states = [];
  const chart = {
    panes: () => [{}], chartElement: () => ({ clientHeight: 600 }),
    addSeries: (_ctor, opts) => {
      const series = { opts, setData(values) { if (options.renderError) throw new Error('render failed'); this.values = values; },
        getPane: () => ({ setHeight() {} }) };
      added.push(series); return series;
    },
    removeSeries: series => removed.push(series)
  };
  const manager = new PublicStudiesManager({ chart, getBars: () => [], onStatus: () => {},
    onStudyStatus: (id, status) => states.push({ id, ...status }) });
  manager.setContext('BTCUSDT', '1h');
  // Enable without starting an implicit request so tests can await each refresh.
  manager.enabled.oi = true;
  manager.load = async () => [{ time: 1700000000, value: 1000 }];
  return { manager, added, removed, states };
}

test('open interest auto uses 1h on a 1H spot chart and names the futures source', async () => {
  const originalFetch = globalThis.fetch, urls = [];
  const { manager, added } = fixture();
  delete manager.load;
  globalThis.fetch = async url => {
    urls.push(String(url));
    return { ok: true, json: async () => [{ timestamp: 1700000000000, sumOpenInterest: '1000', sumOpenInterestValue: '60000000' }] };
  };
  try {
    await manager.refresh('oi', true);
    assert.equal(new URL(urls[0]).searchParams.get('period'), '1h');
    assert.match(urls[0], /fapi\.binance\.com\/futures\/data\/openInterestHist/);
    assert.equal(added[0].values[0].value, 1000);
    assert.equal(manager.facades.oi.status.state, 'ready');
    assert.match(manager.facades.oi.status.message, /Futures.*1h/);
    assert.equal(manager.context.symbol, 'BTCUSDT', 'the price-chart reference stays Spot');
    assert.ok(PUBLIC_MARKET_SOURCES.oi);
  } finally { manager.dispose(); globalThis.fetch = originalFetch; }
});

test('empty and failed statistics stay explicit and can be retried without removing the study', async () => {
  const { manager, added } = fixture();
  try {
    manager.load = async () => [];
    await manager.refresh('oi');
    assert.equal(manager.facades.oi.status.state, 'empty');
    assert.equal(added.length, 0);
    assert.ok(manager.timers.has('oi'), 'empty responses still have a bounded scheduled retry');
    manager.load = async () => { throw new Error('public-market-400'); };
    await manager.facades.oi.retry();
    assert.equal(manager.facades.oi.status.state, 'error');
    assert.match(manager.facades.oi.status.message, /HTTP 400/);
    manager.load = async () => [{ time: 1700000000, value: 1234 }];
    await manager.facades.oi.retry();
    assert.equal(manager.facades.oi.status.state, 'ready');
    assert.equal(added.at(-1).values[0].value, 1234);
    assert.equal(manager.facades.oi.enabled, true);
  } finally { manager.dispose(); }
});

test('render failures are not swallowed as self-aborted requests or left as empty panes', async () => {
  const { manager, added, removed } = fixture({ renderError: true });
  try {
    await manager.refresh('oi');
    assert.equal(manager.facades.oi.status.state, 'error');
    assert.equal(manager.seriesById.oi.length, 0);
    assert.deepEqual(removed, added, 'partially created series are cleaned up');
  } finally { manager.dispose(); }
});

test('a temporary refresh failure preserves the last series and flags it as stale', async () => {
  const { manager, added, removed } = fixture();
  try {
    await manager.refresh('oi');
    const previous = manager.seriesById.oi[0];
    manager.load = async () => { throw new Error('public-market-503'); };
    await manager.facades.oi.retry();
    assert.equal(manager.seriesById.oi[0], previous);
    assert.match(manager.facades.oi.status.message, /HTTP 503.*son veri korunuyor/);
    assert.equal(removed.length, 0);
    assert.equal(added.length, 1);
  } finally { manager.dispose(); }
});

test('a late request cannot recreate a disabled study or replace the next market status', async () => {
  const { manager, added } = fixture();
  let complete;
  manager.load = () => new Promise(resolve => { complete = resolve; });
  try {
    const pending = manager.refresh('oi');
    manager.setEnabled('oi', false);
    complete([{ time: 1700000000, value: 1000 }]);
    await pending;
    assert.equal(manager.facades.oi.status.state, 'idle');
    assert.equal(added.length, 0);
    manager.setContext('OKX:BTCUSDT', '1h');
    manager.setEnabled('oi', true);
    assert.equal(manager.facades.oi.status.state, 'unsupported');
    assert.equal(added.length, 0);
  } finally { manager.dispose(); }
});

test('repainting a cached study does not extend its fetch TTL indefinitely', async () => {
  const { manager } = fixture();
  try {
    await manager.refresh('oi');
    manager.cache.get('oi').at -= 1000;
    const at = manager.cache.get('oi').at;
    manager.load = () => { throw new Error('cached data should be reused'); };
    await manager.refresh('oi');
    assert.equal(manager.cache.get('oi').at, at);
    assert.equal(manager.facades.oi.status.state, 'ready');
  } finally { manager.dispose(); }
});

test('new study panes use a stable stretch factor before native heights are measured', async () => {
  const { manager } = fixture(), factors = [];
  const pane = {
    getHeight: () => 0,
    setHeight() { assert.fail('unmeasured pane pixels must not size other panes'); },
    setStretchFactor: factor => factors.push(factor)
  };
  manager.chart.panes = () => [{ getStretchFactor: () => 2000 }, pane];
  manager.chart.addSeries = () => ({ setData() {}, getPane: () => pane });
  try {
    await manager.refresh('oi');
    assert.deepEqual(factors, [500]);
    assert.equal(manager.facades.oi.status.state, 'ready');
  } finally { manager.dispose(); }
});

test('enabling a public study renders one real-data pane and removes it on disable', async () => {
  const originalFetch = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async url => {
    urls.push(String(url));
    return { ok: true, status: 200, json: async () => [
      [1700000000000, '0', '0', '0', '0', '10', '1700000300000', '0', 12, '7', '0', '0']
    ] };
  };
  const added = [], removed = [];
  const chart = {
    panes: () => [{}],
    chartElement: () => ({ clientHeight: 600 }),
    addSeries: (_ctor, opts) => {
      const s = { opts, setData(values) { this.values = values; }, getPane: () => ({ setHeight() {} }) };
      added.push(s); return s;
    },
    removeSeries: s => removed.push(s)
  };
  const series = { createPriceLine: () => ({}), removePriceLine() {} };
  const manager = new PublicStudiesManager({ chart, series, getBars: () => [], getSymbol: () => 'BTCUSDT',
    getInterval: () => '5m', onStatus: () => {} });
  try {
    manager.setContext('BTCUSDT', '5m');
    manager.facades.marketDelta.setEnabled(true);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(urls.length, 1);
    assert.match(urls[0], /api\.binance\.com\/api\/v3\/klines/);
    assert.equal(added.length, 1);
    assert.equal(added[0].values[0].value, 4);
    manager.facades.marketDelta.setEnabled(false);
    assert.equal(removed.length, 1);
  } finally {
    manager.dispose();
    globalThis.fetch = originalFetch;
  }
});
