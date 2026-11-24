import test from 'node:test';
import assert from 'node:assert/strict';
import { studyBundleKey, normalizeStudyBundle, bundleFromLayout, readStudyBundle, writeStudyBundle, resolveStudyBundle } from '../assets/alfa-study-persistence.mjs';
import { normalizeStudyState } from '../assets/alfa-chart-studies.mjs';
import { IndicatorManager } from '../assets/alfa-indicators.mjs';

function fakeStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: key => map.has(key) ? map.get(key) : null,
    setItem: (key, value) => map.set(key, String(value)),
    keys: () => [...map.keys()]
  };
}
const bars = Array.from({ length: 40 }, (_, i) => ({ time: 1700000000 + i * 3600, open: 100, high: 101, low: 99, close: 100, volume: 10 }));
function mockChart() {
  const panes = [{ series: [], height: 500, setHeight(h) { this.height = h; }, getHeight: () => this.height }];
  return {
    panes: () => panes,
    chartElement: () => ({ clientHeight: 700 }),
    addSeries(def, options, index = 0) {
      if (!panes[index]) panes.push({ series: [], height: 150, setHeight(h) { this.height = h; }, getHeight: () => this.height });
      const pane = panes[index];
      const series = { def, options, data: [], setData(d) { this.data = d; }, getPane: () => pane, createPriceLine() {} };
      pane.series.push(series); return series;
    },
    removeSeries(series) {
      const pane = series.getPane(), index = pane.series.indexOf(series);
      if (index >= 0) pane.series.splice(index, 1);
      if (pane !== panes[0] && !pane.series.length) panes.splice(panes.indexOf(pane), 1);
    }
  };
}

test('study bundles are owner and symbol scoped and reject malformed refs', () => {
  assert.equal(studyBundleKey('user-1', 'BTCUSDT'), 'alfa-studies:v1:user-1:BTCUSDT');
  assert.equal(studyBundleKey('user-1', 'BINANCE:BTCUSDT.P'), 'alfa-studies:v1:user-1:BINANCE:BTCUSDT.P');
  assert.equal(studyBundleKey('guest', '<script>'), 'alfa-studies:v1:guest:unknown');
});
test('normalization preserves indicator identity, settings and collapse state', () => {
  const bundle = normalizeStudyBundle({ indicators: [
    { type: 'ema', params: { period: 50, color: '#fff' }, visible: false, collapsed: true },
    { type: 'rsi', params: { period: 7 }, visible: true },
    { type: '<img>', params: {} }, { type: 'ema', params: { period: 9 } }
  ], overlays: {
    oi: { added: true, visible: false, collapsed: true },
    volume: { added: true, visible: true },
    evil: { added: true }
  } }, new Set(['oi', 'volume']));
  assert.deepEqual(bundle.indicators, [
    { type: 'ema', params: { period: 50, color: '#fff' }, visible: false, collapsed: true },
    { type: 'rsi', params: { period: 7 }, visible: true, collapsed: false }
  ]);
  assert.deepEqual(bundle.overlays, {
    oi: { added: true, visible: false, collapsed: true },
    volume: { added: true, visible: true, collapsed: false }
  });
  assert.equal(Object.hasOwn(bundle.overlays, 'evil'), false);
});
test('an intentionally empty saved bundle is not replaced by old per-period layouts', () => {
  const current = { found: true, bundle: normalizeStudyBundle({ indicators: [], overlays: { volume: { added: false } } }) };
  const migrated = resolveStudyBundle({ current, legacyLayouts: [{ indicators: [{ type: 'ema' }] }] });
  assert.deepEqual(migrated.indicators, []);
  assert.equal(migrated.overlays.volume.added, false);
});
test('missing bundle migrates old layout once and keeps venue-safe state', () => {
  const legacy = { indicators: [{ type: 'sma', params: { period: 21 }, visible: true }], studies: { fvg: { added: true, visible: false } } };
  const migrated = resolveStudyBundle({ current: { found: false, bundle: normalizeStudyBundle(null) }, legacyLayouts: [legacy] });
  assert.deepEqual(migrated.indicators[0], { type: 'sma', params: { period: 21 }, visible: true, collapsed: false });
  assert.deepEqual(migrated.overlays.fvg, { added: true, visible: false, collapsed: false });
  assert.deepEqual(bundleFromLayout({ indicators: [{ type: 'ema' }] }).indicators[0].type, 'ema');
});
test('read/write round trips through the supplied storage without touching other keys', () => {
  const storage = fakeStorage({ 'alfa-watchlist:v1:guest': 'keep' });
  const bundle = normalizeStudyBundle({ indicators: [{ type: 'ema', params: { period: 33 }, collapsed: true }] });
  assert.equal(writeStudyBundle(storage, 'guest', 'BTCUSDT', bundle), true);
  assert.deepEqual(readStudyBundle(storage, 'guest', 'BTCUSDT').bundle, bundle);
  assert.equal(storage.getItem('alfa-watchlist:v1:guest'), 'keep');
  assert.equal(readStudyBundle(storage, 'guest', 'ETHUSDT').found, false);
});
test('overlay collapse state normalizes alongside added/visible', () => {
  assert.deepEqual(normalizeStudyState({ fvg: { added: true, visible: false, collapsed: true } }).fvg,
    { added: true, visible: false, collapsed: true });
});
test('native collapse shrinks oscillator panes and survives serialization', () => {
  const chart = mockChart(), manager = new IndicatorManager({ chart, getBars: () => bars });
  const item = manager.add('rsi');
  assert.equal(chart.panes().length, 2);
  assert.ok(chart.panes()[1].height >= 80);
  manager.setCollapsed(item.id, true);
  assert.equal(chart.panes()[1].height, 30);
  assert.deepEqual(manager.toJSON()[0], { type: 'rsi', params: item.params, visible: true, collapsed: true });
  manager.fromJSON(manager.toJSON());
  assert.equal(manager.items[0].collapsed, true);
  assert.equal(chart.panes()[1].height, 30);
});
