import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source = fs.readFileSync(new URL('../assets/alfa-charts.mjs', import.meta.url), 'utf8');
const fn = source.slice(source.indexOf('async function loadOlderHistory('), source.indexOf('\nfunction applyReplaySlice('));

function harness(fetchHistory) {
  const ranges = [], paints = [];
  const conn = { textContent: 'Canlı', dataset: { state: 'live' } };
  const sandbox = {
    history: [{ time: 100 }, { time: 200 }], seriesBars: [], replayMode: false, loadingOlder: false,
    disposed: false, generation: 1, symbol: 'BTCUSDT', interval: '3d', olderController: null,
    exhaustedHistoryEdges: new Set(), AbortController, fetch() {}, fetchHistory,
    $: () => conn, connection(text, state) { conn.textContent = text; conn.dataset.state = state; },
    chart: { timeScale: () => ({
      getVisibleLogicalRange: () => ({ from: -1, to: 1 }),
      setVisibleLogicalRange: range => ranges.push(range)
    }) },
    rememberHistory() {}, syncSeriesData: bars => paints.push(bars),
    withSyncApply: fn => fn(), indicators: { updateAll() {} }, studiesUI: null, sessionLevels: { render() {} },
    marketStructure: { render() {} }, fvg: { render() {} }, mtf: { render() {} }, quote() {}, console
  };
  vm.createContext(sandbox);
  vm.runInContext(fn, sandbox);
  return { sandbox, ranges, paints, load: () => vm.runInContext('loadOlderHistory()', sandbox) };
}

test('short histories prepend sorted unique bars and shift only by newly added older candles', async () => {
  const h = harness(async () => [{ time: 50 }, { time: 25 }, { time: 50 }, { time: 100 }, { time: 300 }]);
  await h.load();
  assert.deepEqual(Array.from(h.sandbox.history, c => c.time), [25, 50, 100, 200]);
  assert.deepEqual({ ...h.ranges[0] }, { from: 1, to: 3 });
  assert.equal(h.sandbox.loadingOlder, false);
  assert.equal(h.paints.length, 1);
});

test('overlapping-only or empty backfill marks the edge exhausted, never repainting or looping', async () => {
  let calls = 0;
  const h = harness(async () => { calls++; return [{ time: 100 }, { time: 200 }]; });
  await h.load(); await h.load();
  assert.equal(calls, 1);
  assert.equal(h.paints.length, 0);
  assert.equal(h.ranges.length, 0);
});

test('pending backfill retains candles/view; a market change rejects the stale response', async () => {
  let resolve;
  const h = harness(() => new Promise(done => { resolve = done; }));
  const pending = h.load();
  assert.deepEqual(Array.from(h.sandbox.history, c => c.time), [100, 200]);
  assert.equal(h.paints.length, 0);
  assert.equal(h.ranges.length, 0);
  h.sandbox.generation++;
  resolve([{ time: 50 }]);
  await pending;
  assert.equal(h.paints.length, 0);
});

test('transient failures remain retryable and the scroll trigger has no 900-candle gate', async () => {
  let calls = 0;
  const h = harness(async () => {
    if (++calls === 1) throw Object.assign(new Error('cancelled'), { name: 'AbortError' });
    return [{ time: 50 }];
  });
  await h.load(); await h.load();
  assert.equal(calls, 2);
  assert.equal(h.paints.length, 1);
  assert.doesNotMatch(source, /history\.length\s*>=\s*900/);
});
