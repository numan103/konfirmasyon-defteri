import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../assets/alfa-charts.mjs', import.meta.url), 'utf8');
const fn = source.slice(source.indexOf('async function navigateHistory('), source.indexOf('// ---------- UI: indicator manager'));
function harness() {
  const applied = [];
  const s = { history: [{ time: 100 }, { time: 200 }], historyNavigation: 0, generation: 1,
    symbol: 'BTCUSDT', interval: '1h', replayMode: false, disposed: false,
    currentUserKey: () => 'alice', exhaustedHistoryEdges: new Set(), connection() {},
    withSyncApply: fn => fn(), chart: { timeScale: () => ({
      fitContent: () => applied.push('all'), setVisibleRange: range => applied.push(range),
      getVisibleLogicalRange: () => ({ from: 0, to: 50 }), setVisibleLogicalRange: range => applied.push(range)
    }) } };
  s.requestOlderHistory = async () => { s.history.unshift({ time: s.history[0].time - 50 }); };
  vm.createContext(s); vm.runInContext(fn, s);
  return { s, applied, run: options => s.navigateHistory(options) };
}
test('navigation waits for required pages before applying the selected range', async () => {
  const h = harness();
  assert.equal(await h.run({ duration: 200 }), true);
  assert.equal(h.s.history[0].time, 0);
  assert.deepEqual({ ...h.applied[0] }, { from: 0, to: 200 });
});
test('missing pages or a changed market never apply a partial preset', async () => {
  const h = harness();
  h.s.requestOlderHistory = async () => {};
  assert.equal(await h.run({ duration: 200 }), false);
  assert.equal(h.applied.length, 0);
  h.s.requestOlderHistory = async () => { h.s.generation++; };
  assert.equal(await h.run({ target: 0 }), false);
  assert.equal(h.applied.length, 0);
});
test('all requires confirmed provider exhaustion, not an arbitrary page cap', async () => {
  const h = harness();
  h.s.requestOlderHistory = async () => { h.s.exhaustedHistoryEdges.add('BTCUSDT|1h|100'); };
  assert.equal(await h.run({ all: true }), true);
  assert.deepEqual(h.applied, ['all']);
});
