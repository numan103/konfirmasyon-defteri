import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PUBLIC_STUDY_IDS, PUBLIC_STUDY_NAMES, normalizePublicStudyConfig,
  publicStudyMarket, PublicStudiesManager
} from '../assets/alfa-public-studies.mjs';

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
  assert.equal(cfg.refresh, 30);
  assert.equal(cfg.bidColor, '#26c89c');
  assert.equal(cfg.askColor, '#ef6677');
  assert.equal(normalizePublicStudyConfig('oi', { period: 'hack' }).period, 'auto');
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
