import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const code = fs.readFileSync(new URL('../assets/portfolio-recovery.js', import.meta.url), 'utf8');
const context = vm.createContext({}); vm.runInContext(code, context);
const api = context.AlfaPortfolioRecovery;
function storage() {
  const map = new Map();
  return { map, getItem: k => map.get(k) || null, setItem: (k, v) => map.set(k, v) };
}
test('empty documents can never erase the last known nonempty recovery', () => {
  const s = storage(), good = { positions: [{ id: 'user-trade', symbol: 'BTC' }], sells: [] };
  assert.equal(api.preserve(s, good), true);
  assert.equal(api.preserve(s, { positions: [], sells: [] }), false);
  assert.deepEqual(JSON.parse(s.getItem('alfa-fund-recovery-v1')), good);
  const newer = { positions: [{ id: 'new-trade', symbol: 'ETH' }], sells: [] };
  api.preserve(s, newer);
  assert.deepEqual(JSON.parse(s.getItem('alfa-fund-recovery-v1')), good);
  assert.deepEqual(JSON.parse(s.getItem('alfa-fund-recovery-latest-v1')), newer);
});
test('closed trades count as data; simulations, auth tokens and malformed documents are not recovery sources', () => {
  const s = storage();
  s.setItem('alfa-fund-recovery-v1', JSON.stringify({ positions: [], sells: [{ id: 'closed-trade' }] }));
  s.setItem('defter-portfoy-sim-v3', JSON.stringify({ positions: [{ id: 'simulation' }] }));
  s.setItem('sb-auth-token', 'not-a-portfolio');
  s.setItem('alfa-fund-v1', '{"positions":[null]}');
  const copies = api.scan(s);
  assert.equal(copies.length, 1); assert.equal(copies[0].active, true); assert.equal(copies[0].data.sells.length, 1);
  assert.equal(api.preserve(s, { positions: [{ id: 'eth-sep5' }], lastUpdate: '2026-09-05' }), false);
});
test('read-only scan and quota errors do not modify or delete any stored data', () => {
  const s = storage(); s.setItem('alfa-fund-v1', JSON.stringify({ positions: [{ id: 'trade' }] }));
  const before = JSON.stringify([...s.map]);
  api.scan(s); assert.equal(JSON.stringify([...s.map]), before);
  assert.equal(api.preserve({ getItem: s.getItem, setItem() { throw new Error('QuotaExceeded'); } }, { positions: [{ id: 'trade' }] }), false);
  assert.equal(JSON.stringify([...s.map]), before);
  const html = fs.readFileSync(new URL('../portfoy-kurtarma.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /fetch\(|\.setItem\(|\.removeItem\(/);
});
