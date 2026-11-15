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
  vm.runInContext(html.slice(html.indexOf('function ap2SaleProfit('), html.indexOf('function ap2Fmt(')), ctx);
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
