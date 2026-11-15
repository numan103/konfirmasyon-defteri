import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { reconcileCash } from '../lib/portfolio.mjs';
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function model(data) {
  const ctx = vm.createContext({
    ap2Data: data, ap2Active: () => data.positions.filter(p => !(p.lim && !p.filled)),
    ap2Calc: p => ({ totalCost: p.qty * p.cost, value: p.qty * (p.price ?? p.cost) }),
    ap2Save() {}
  });
  vm.runInContext(html.slice(html.indexOf('function ap2SaleTimestamp('), html.indexOf('function ap2Fmt(')), ctx);
  vm.runInContext(html.slice(html.indexOf('function ap2RecalcCash('), html.indexOf('function ap2Save(')), ctx);
  return ctx;
}
test('sale profit accepts old pnl and new profit, with null/empty fallback and explicit zero preserved', () => {
  const ctx = model({ positions: [], sells: [], startBalance: 1000, cash: 1000 });
  for (const [row, expected] of [
    [{ pnl: 130.62 }, 130.62], [{ profit: 7.39 }, 7.39],
    [{ pnl: null, profit: 8 }, 8], [{ pnl: '', profit: -4 }, -4],
    [{ pnl: 0, profit: 99 }, 0], [{ pnl: 'bad', profit: 2 }, 2],
    [{ pnl: Infinity, profit: -2 }, -2], [{}, 0]
  ]) assert.equal(ctx.ap2SaleProfit(row), expected);
});
test('realized profit is displayed separately, never added to an already reconciled balance twice', () => {
  const data = { positions: [
    { symbol: 'ETH', qty: 1, cost: 400, price: 430 },
    { symbol: 'XAUUSD', type: 'altin', qty: .05, cost: 4000, price: 4200 }
  ], sells: [{ pnl: 100 }, { profit: -10 }, { pnl: null, profit: 5 }],
  startBalance: 1000, cash: 495 };
  const ctx = model(data), summary = ctx.ap2Summary();
  assert.equal(summary.realizedPnl, 95);
  assert.equal(summary.portfolioValue, 1135);
  assert.equal(summary.pnl, 135, '95 realized plus 40 unrealized, not 230');
  ctx.ap2RecalcCash();
  assert.equal(data.cash, 495);
  assert.equal(data.cash, reconcileCash(data));
  assert.ok(html.includes('Geçmiş satış K/Z:'));
  assert.ok(html.includes('id="ap2-realized-pnl"'));
});
test('sale display prefers explicit legacy dates and uses sale timestamp, never purchase date, as fallback', () => {
  const ctx = model({ positions: [], sells: [], cash: 1000, startBalance: 1000 });
  const old = { date: '2026-08-20', ts: Date.parse('2025-08-20T00:00:00Z') };
  const recent = { posDate: '2026-09-05', ts: Date.parse('2026-09-07T09:00:00Z') };
  assert.equal(ctx.ap2SaleDate(old), '2026-08-20');
  assert.equal(ctx.ap2SaleDate(recent), '2026-09-07');
  assert.equal(ctx.ap2SaleDate({ posDate: '2026-09-05' }), null, 'purchase date cannot establish sale date');
  assert.equal(ctx.ap2SaleDate({ ts: 'bad' }), null);
  assert.ok(ctx.ap2SaleTimestamp(recent) > ctx.ap2SaleTimestamp(old));
  assert.ok(html.includes("var buyDate = sl.buyDate || sl.posDate || '';"));
});
test('merging gold retains quantity, exact invested amount and source lots without changing cash or sales', () => {
  const data = { positions: [
    { id: 'a', symbol: 'XAUUSD', type: 'altin', qty: .03778338, cost: 3970, date: '2026-11-12', filled: '2026-11-12', lim: true, note: 'first lot' },
    { id: 'b', symbol: 'XAUUSD', type: 'altin', qty: .03896104, cost: 3850, date: '2026-11-12', filled: '2026-11-12', lim: true, note: 'second lot' },
    { id: 'c', symbol: 'XAUUSD', type: 'altin', qty: .01, cost: 3700, lim: true, filled: null }
  ], cash: 168.58, sells: [{ pnl: 20 }] };
  const lots = structuredClone(data.positions.slice(0, 2));
  const invested = lots.reduce((s, p) => s + p.qty * p.cost, 0);
  const ctx = vm.createContext({ ap2Data: data, ap2IsPending: p => p.lim && !p.filled });
  vm.runInContext(html.slice(html.indexOf('function ap2MergeDuplicates('), html.indexOf('function ap2RebuildHistory(')), ctx);
  assert.equal(ctx.ap2MergeDuplicates(), true);
  assert.equal(data.positions.length, 2, 'pending order must not merge with filled gold');
  assert.equal(data.positions[0].qty, .07674442);
  assert.ok(Math.abs(data.positions[0].qty * data.positions[0].cost - invested) < 1e-10);
  assert.deepEqual(JSON.parse(JSON.stringify(data.positions[0].sourceLots)), lots);
  assert.equal(data.cash, 168.58);
  assert.deepEqual(data.sells, [{ pnl: 20 }]);
  assert.equal(ctx.ap2MergeDuplicates(), false, 'merge is idempotent');
});
