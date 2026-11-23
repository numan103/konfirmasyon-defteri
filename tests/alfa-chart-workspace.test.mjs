import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { defaultStudyState, normalizeStudyState, OVERLAY_CATALOG } from '../assets/alfa-chart-studies.mjs';
import { IndicatorManager } from '../assets/alfa-indicators.mjs';
import { escapeHTML, icon } from '../assets/alfa-chart-ui.mjs';
import { visibleFvgRegions } from '../assets/alfa-fvg.mjs';

test('fresh workspace opts into overlays, never auto-enables price-line clutter', () => {
  const state = defaultStudyState();
  assert.deepEqual(Object.keys(state), OVERLAY_CATALOG.map(d => d.id));
  assert.deepEqual(Object.entries(state).filter(([, s]) => s.added).map(([id]) => id), ['volume']);
  state.volume.added = false;
  assert.equal(defaultStudyState().volume.added, true, 'defaults are independent');
});
test('study visibility persistence keeps hidden overlays installed and ignores invalid/unknown entries', () => {
  const state = normalizeStudyState({ fvg: { added: true, visible: false }, levels: { added: 'true' }, evil: { added: true } });
  assert.deepEqual(state.fvg, { added: true, visible: false });
  assert.equal(state.levels.added, false);
  assert.equal(Object.hasOwn(state, 'evil'), false);
  assert.deepEqual(normalizeStudyState(JSON.parse(JSON.stringify(state))), state);
});
test('UI safely escapes saved values and uses decorative vector icons', () => {
  assert.equal(escapeHTML('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  assert.match(icon('brush'), /aria-hidden="true"/);
  assert.doesNotMatch(icon('unknown<svg>'), /unknown/);
});
function mockChart() {
  const panes = [{ series: [], getHeight: () => 500, paneIndex: () => 0 }];
  return {
    panes: () => panes, chartElement: () => ({ clientHeight: 700 }),
    addSeries(def, options, index = 0) {
      if (!panes[index]) panes.push({ series: [], setHeight() {}, paneIndex: () => index, getHeight: () => 150 });
      const pane = panes[index];
      const s = { def, options, data: [], setData(data) { this.data = data; }, getPane: () => pane, createPriceLine() {}, applyOptions(opts) { Object.assign(this.options, opts); } };
      pane.series.push(s); return s;
    },
    removeSeries(s) {
      const pane = s.getPane(), idx = pane.series.indexOf(s);
      assert.notEqual(idx, -1, 'series is not removed twice');
      pane.series.splice(idx, 1);
      if (pane !== panes[0] && !pane.series.length) panes.splice(panes.indexOf(pane), 1);
    },
  };
}
const sampleBars = Array.from({ length: 100 }, (_, i) => ({ time: 1700000000 + 3600 * i, open: 100 + i, high: 104 + i, low: 99 + i, close: 102 + i, volume: 1000 + i }));
test('oscillators use separate panes; hide/remove collapses the pane without losing parameters', () => {
  const chart = mockChart(), manager = new IndicatorManager({ chart, getBars: () => sampleBars });
  const ema = manager.add('ema'), rsi = manager.add('rsi'), macd = manager.add('macd');
  assert.equal(chart.panes().length, 3);
  assert.equal(macd.series[2].def.type, 'Histogram');
  assert.equal(ema.series[0].options.priceLineVisible, false);
  assert.equal(ema.series[0].options.lastValueVisible, false);
  manager.setVisible(rsi.id, false);
  assert.equal(chart.panes().length, 2);
  assert.equal(rsi.params.period, 14);
  manager.setVisible(rsi.id, true);
  assert.equal(chart.panes().length, 3);
  manager.remove(macd.id);
  assert.equal(chart.panes().length, 2);
  manager.clear();
  assert.equal(chart.panes().length, 1);
});
test('indicator rerender does not leak series and serialization preserves eye-toggle state', () => {
  const chart = mockChart(), manager = new IndicatorManager({ chart, getBars: () => sampleBars });
  const ema = manager.add('ema', { period: 50 });
  manager.renderAll(); manager.renderAll();
  assert.equal(chart.panes()[0].series.length, 1);
  manager.updateParams(ema.id, { period: 100 });
  assert.equal(manager.items[0].id, ema.id, 'settings retain indicator identity');
  manager.setVisible(ema.id, false);
  const saved = manager.toJSON();
  manager.fromJSON(saved);
  assert.equal(manager.items[0].params.period, 100);
  assert.equal(manager.items[0].visible, false);
  assert.equal(chart.panes()[0].series.length, 0);
  manager.setSuppressed(true); manager.setSuppressed(false);
  assert.equal(manager.items[0].visible, false);
});
test('workspace places only indicators in the catalogue, and lab tools in their own menu', () => {
  const html = fs.readFileSync(new URL('../alfa-charts.html', import.meta.url), 'utf8');
  const header = html.split('<header class="toolbar">')[1].split('</header>')[0];
  assert.match(header, /id="indicators-manage"/);
  assert.match(header, /id="lab-menu"/);
  assert.doesNotMatch(header, /id="(?:fvg-toggle|mtf-toggle|market-structure-toggle|session-levels-toggle|indicator-add)"/);
  assert.match(html, /id="drawing-selection"/);
  assert.match(html, /id="view-axis-labels"/);
});
test('FVG presentation excludes filled/invalidated history, keeps recent active zones and caps the count', () => {
  const base = { type: 'fvg', dir: 'bull', lower: 100, upper: 110, mitigation: 'unmitigated' };
  const regions = [
    { ...base, id: 'old', confirmedAt: 1 },
    { ...base, id: 'filled', confirmedAt: 5, mitigation: 'full' },
    { ...base, id: 'invalid', confirmedAt: 6, mitigation: 'invalidated' },
    { ...base, id: 'recent', confirmedAt: 10 },
    { ...base, id: 'latest', confirmedAt: 20 },
  ];
  const cfg = { showBull: true, showBear: true, showIfvg: true, maxRegions: 2 };
  assert.deepEqual(visibleFvgRegions(regions, [], cfg).map(r => r.id), ['recent', 'latest']);
  const inverse = { ...base, type: 'ifvg', id: 'inverse', invertedAt: 30 };
  assert.equal(visibleFvgRegions([inverse], [{ time: 31, close: 90 }], cfg).length, 0);
  assert.equal(visibleFvgRegions([inverse], [{ time: 29, close: 90 }], cfg).length, 1, 'do not invalidate using candles from before inversion');
  assert.equal(visibleFvgRegions(regions, [], { ...cfg, showMitigated: true, maxRegions: 20 }).length, 5);
});
