import test from 'node:test';
import assert from 'node:assert/strict';

const storage = new Map();
globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
globalThis.sessionStorage = { getItem: () => null };
globalThis.location = { search: '', origin: 'https://alfa.test' };
globalThis.document = {
  getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  body: { classList: { toggle() {} } }
};
globalThis.window = { addEventListener() {}, dispatchEvent() {} };
const { initMultiChart } = await import('../assets/alfa-multichart.mjs');
const key = 'alfa-chart-tabs:v1:guest';
const init = () => initMultiChart({ getSymbol: () => 'BTCUSDT', getInterval: () => '1h' });

test('symbol sync preserves four independent timeframes and survives reload', () => {
  storage.clear();
  const m = init();
  m.setPaneInterval(m.state.panes[0].id, '4h');
  for (const tf of ['1h', '15m', '5m']) assert.equal(m.addPane('BTCUSDT', tf), true);
  assert.equal(m.state.panes.length, 4);
  m.setSync('symbol', true);
  m.setOpen(true);
  m.notifySymbol('ETHUSDT', '1h');
  assert.deepEqual(m.state.panes.map(p => p.symbol), Array(4).fill('ETHUSDT'));
  assert.deepEqual(m.state.panes.map(p => p.interval), ['4h', '1h', '15m', '5m']);
  const restored = init();
  assert.deepEqual(restored.state, m.state);
});

test('sync off replaces only the active pane without adding tabs or conflating markets', () => {
  storage.clear();
  const m = init();
  m.addPane('BINANCE:BTCUSDT.P', '5m');
  const active = m.state.active;
  m.setOpen(true);
  m.notifySymbol('OKX:BTCUSDT.P', '1h');
  assert.equal(m.state.active, active);
  assert.equal(m.state.panes.length, 2);
  assert.deepEqual(m.state.panes.map(p => p.symbol), ['BTCUSDT', 'OKX:BTCUSDT.P']);
  assert.deepEqual(m.state.panes.map(p => p.interval), ['1h', '5m']);
});

test('interval sync is opt-in; invalid intervals cannot overwrite persisted state', () => {
  storage.clear();
  const m = init();
  m.addPane('ETHUSDT', '5m');
  m.setPaneInterval(m.state.active, '15m');
  assert.deepEqual(m.state.panes.map(p => p.interval), ['1h', '15m']);
  m.setSync('interval', true);
  m.setPaneInterval(m.state.active, '4h');
  assert.deepEqual(m.state.panes.map(p => p.interval), ['4h', '4h']);
  const before = storage.get(key);
  assert.equal(m.setPaneInterval(m.state.active, 'invalid'), false);
  assert.equal(storage.get(key), before);
});

test('legacy workspace retains panes, layout and active id while adopting a safe interval', () => {
  storage.clear();
  storage.set(key, JSON.stringify({ panes: [{ id: 7, symbol: 'ETHUSDT' }], active: 7, layout: 4, open: false }));
  const m = init();
  assert.deepEqual(m.state.panes, [{ id: 7, symbol: 'ETHUSDT', interval: '1h' }]);
  assert.equal(m.state.active, 7);
  assert.equal(m.state.layout, 4);
  assert.deepEqual(m.state.sync, { symbol: false, crosshair: true, range: true, interval: false });
});

test('late auth on a fresh device still restores remote workspace, not a boot-created local default', async () => {
  storage.clear();
  const remote = { panes: [{ id: 8, symbol: 'ETHUSDT', interval: '15m' }], active: 8, layout: 1, open: false,
    sync: { symbol: true, crosshair: false, range: false, interval: false } };
  const store = {
    user: null,
    loadWorkspace: async () => ({ ok: true, workspace: remote, revision: 5 }),
    saveWorkspace: async () => { throw Error('fresh device must not upload boot defaults'); }
  };
  const m = initMultiChart({ getSymbol: () => 'BTCUSDT', getInterval: () => '1h', getOwner: () => 'alice', cloudStore: store });
  store.user = { id: 'alice' };
  m.account();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(m.state, remote);
  assert.ok(storage.has('alfa-chart-tabs:v1:alice'));
  assert.equal(storage.has('alfa-chart-tabs:v1:guest'), false);
});
