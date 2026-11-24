import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { readSettingsConflict, preserveSettingsConflict } from '../assets/alfa-chart-settings-store.mjs';

function storage() {
  const rows = new Map();
  return { getItem: key => rows.get(key) ?? null, setItem: (key, value) => rows.set(key, value) };
}

test('conflict recovery is isolated by owner, venue, market type and timeframe', () => {
  const local = storage();
  const settings = { chartType: 'line', indicators: [{ type: 'ema', params: { period: 50 } }] };
  assert.equal(preserveSettingsConflict(local, 'alice', 'BTCUSDT', '1h', settings), true);
  assert.deepEqual(readSettingsConflict(local, 'alice', 'BTCUSDT', '1h').settings, settings);
  for (const [owner, symbol, interval] of [
    ['bob', 'BTCUSDT', '1h'], ['alice', 'BINANCE:BTCUSDT.P', '1h'], ['alice', 'BTCUSDT', '5m']
  ]) assert.equal(readSettingsConflict(local, owner, symbol, interval), null);
});

test('unavailable storage reports failure without deleting any existing recovery', () => {
  assert.equal(preserveSettingsConflict({ setItem() { throw Error('quota'); } }, 'alice', 'BTCUSDT', '1h', {}), false);
  assert.equal(readSettingsConflict({ getItem() { throw Error('denied'); } }, 'alice', 'BTCUSDT', '1h'), null);
});

test('actual cloud-save handler preserves current local settings and blocks automatic retries', async () => {
  const source = fs.readFileSync(new URL('../assets/alfa-charts.mjs', import.meta.url), 'utf8');
  const fn = source.slice(source.indexOf('function scheduleCloudSave('), source.indexOf('\nfunction openModal('));
  const local = storage(), status = { textContent: '' };
  let timer, saves = 0;
  const sandbox = {
    replayMode: false, symbol: 'BTCUSDT', interval: '1h', generation: 1, cloudRevision: 7, cloudSaveTimer: null,
    cloudConflicts: new Set(), conflictContext: (...args) => JSON.stringify(args),
    localStorage: local, currentUserKey: () => 'alice',
    layoutSettings: () => ({ chartType: 'line', indicators: [{ type: 'ema', params: { period: 50 } }] }),
    preserveSettingsConflict, $: () => status, clearTimeout() {}, setTimeout(fn) { timer = fn; },
    cloudSettings: {
      user: { id: 'alice' }, isAuthed: () => true,
      async save() { saves++; return { ok: false, error: 'revision conflict' }; },
      async load() { throw Error('must not fetch or apply cloud over local settings'); }
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(fn + '\nscheduleCloudSave({chartType:"candles"});', sandbox);
  await timer();
  assert.equal(saves, 1);
  assert.match(status.textContent, /yerel kayıt korundu/);
  assert.equal(readSettingsConflict(local, 'alice', 'BTCUSDT', '1h').settings.chartType, 'line');
  vm.runInContext('scheduleCloudSave({chartType:"bars"});', sandbox);
  assert.equal(saves, 1);
  assert.equal(readSettingsConflict(local, 'alice', 'BTCUSDT', '1h').settings.chartType, 'bars');
});

test('actual layout loader restores conflict recovery without silently hydrating cloud', async () => {
  const source = fs.readFileSync(new URL('../assets/alfa-charts.mjs', import.meta.url), 'utf8');
  const fn = source.slice(source.indexOf('async function loadLayout('), source.indexOf('\nfunction scheduleCloudSave('));
  const local = storage(), status = { textContent: '' };
  preserveSettingsConflict(local, 'alice', 'BTCUSDT', '1h', { chartType: 'line', view: { grid: false } });
  let type, view;
  const sandbox = {
    replayMode: false, generation: 1, symbol: 'BTCUSDT', interval: '1h', cloudRevision: 0,
    currentUserKey: () => 'alice', localStorage: local, layoutKey: () => 'layout', readSettingsConflict,
    cloudConflicts: new Set(), conflictContext: (...args) => JSON.stringify(args), $: () => status,
    applyChartType: value => { type = value; }, applyViewSettings: value => { view = value; },
    applyStudiesBundle() {}, loadStudiesFor() { return {}; },
    cloudSettings: { isAuthed: () => true, async load() { throw Error('cloud overwrite forbidden'); } }
  };
  vm.createContext(sandbox);
  vm.runInContext(fn, sandbox);
  await vm.runInContext('loadLayout()', sandbox);
  assert.equal(type, 'line');
  assert.equal(view.grid, false);
  assert.match(status.textContent, /yerel kayıt korundu/);
});
