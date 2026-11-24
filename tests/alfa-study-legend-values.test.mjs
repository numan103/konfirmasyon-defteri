import test from 'node:test';
import assert from 'node:assert/strict';
import { studyLegendParams, studyLegendValues } from '../assets/alfa-chart-studies.mjs';

test('legend exposes all numeric parameters, including MACD fast/slow/signal, without styling noise', () => {
  assert.equal(studyLegendParams({ fast: 12, slow: 26, signal: 9, color: '#fff', source: 'close' }),
    'fast=12, slow=26, signal=9, source=close');
});
test('legend reads current native series outputs without recomputing indicators', () => {
  const a = { data: () => [{ value: 10 }, { value: 12.5 }] };
  const b = { data: () => [{ value: 0 }] };
  assert.equal(studyLegendValues([a, b]), '12,5 · 0');
  assert.equal(studyLegendValues([a, b], { seriesData: new Map([[a, { value: 11 }]]) }), '11 · —');
});
test('missing/warmup/hidden series never substitute a fabricated last-bar value at the cursor', () => {
  assert.equal(studyLegendValues([]), '—');
  assert.equal(studyLegendValues([{ data: () => [] }]), '—');
  assert.equal(studyLegendValues([{ data: () => [{ value: NaN }] }]), '—');
});
