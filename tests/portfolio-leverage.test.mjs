import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { reconcileCash, validatePortfolio, leverageOf, marginFor, reservedOf } from '../lib/portfolio.mjs';
import { summarizePortfolio } from '../lib/portfolio-summary.mjs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const personal = fs.readFileSync(new URL('../assets/my-portfolio.mjs', import.meta.url), 'utf8');
const doc = (positions, cash, startBalance = 1000) => ({
  v: 2, positions, sells: [], ideas: [], history: [], cash, startBalance
});
const short = (notional, leverage, price = notional) => ({
  id: 'eth', symbol: 'ETH', type: 'kripto', side: 'SHORT', qty: 1,
  cost: notional, price, leverage
});

test('margin is reserved instead of notional for leveraged shorts', () => {
  // 168 $ cash ile 250 $ notional ETH short: 250 / 1.49 = 167.79 marj.
  const data = doc([short(250, 1.49)], 999, 168);
  assert.equal(marginFor(250, 1.49), 167.79);
  assert.equal(reconcileCash(data), 0.21);
  assert.equal(leverageOf(short(250, 1.49)), 1.49);
});

test('10 $ margin at 100x opens a 1.000 $ position and reserves only 10 $', () => {
  const data = doc([short(1000, 100)], 999, 10);
  assert.equal(marginFor(1000, 100), 10);
  assert.equal(reservedOf(data.positions[0]), 10);
  assert.equal(reconcileCash(data), 0);
});

test('legacy positions without leverage keep full-notional cash behaviour', () => {
  const data = doc([{ id: 'p', symbol: 'ETH', qty: 1, cost: 400 }], 999, 1000);
  assert.equal(leverageOf(data.positions[0]), 1);
  assert.equal(marginFor(400, undefined), 400);
  assert.equal(reconcileCash(data), 600);
});

test('leverage validation accepts decimals and rejects impossible values', () => {
  for (const lev of [1, 1.5, 10, 100, 1000]) {
    assert.equal(validatePortfolio(doc([short(100, lev)], 99)), true, 'lev=' + lev);
  }
  for (const lev of [0, -1, NaN, Infinity, '10abc', '', 1001]) {
    assert.equal(validatePortfolio(doc([short(100, lev)], 99)), false, 'lev=' + String(lev));
  }
  assert.equal(validatePortfolio(doc([{ id: 'x', symbol: 'ETH', qty: 1, cost: 100 }], 99)), true);
  assert.equal(validatePortfolio(doc([{ id: 'x', symbol: 'ETH', qty: 1, cost: 100, leverage: null }], 99)), true);
});

test('summary keeps legacy short valuation and marks leveraged equity at margin + notional PnL', () => {
  const legacy = doc([short(100, undefined, 100)], 900);
  assert.equal(summarizePortfolio(legacy, {}, null).portfolioValue, 1000);
  const lev = doc([short(100, 10, 100)], 990);
  assert.equal(summarizePortfolio(lev, {}, null).portfolioValue, 1000, 'entry price: no equity change');
  const up = doc([short(100, 10, 110)], 990);
  assert.equal(summarizePortfolio(up, {}, null).portfolioValue, 990, 'price rise loses 10 on notional');
  const down = doc([short(100, 10, 90)], 990);
  assert.equal(summarizePortfolio(down, {}, null).portfolioValue, 1010);
});

test('shared form exposes free-form leverage, margin mode and quick presets', () => {
  for (const id of ['ap2-f-leverage', 'ap2-f-lev-presets', 'mp-f-leverage', 'mp-f-lev-presets',
    'ap2-f-amount-lbl', 'mp-f-amount-lbl']) {
    assert.ok(html.includes('id="' + id + '"'), id);
  }
  assert.ok(html.includes('data-ap2m="marj"') && html.includes('data-mpmode="marj"'));
  assert.ok(html.includes('data-ap2lev="100"') && html.includes('data-mplev="100"'));
  assert.ok(html.includes('Kaldıraç (kaç x)'));
  assert.ok(!html.includes('Harcanan tutar ($)'), 'eski tutar etiketi notional/marj olarak ayrıldı');
});

test('shared client helpers mirror server margin math inside tested slices', () => {
  const ctx = vm.createContext({});
  vm.runInContext(html.slice(html.indexOf('const AP2_MAX_LEVERAGE'), html.indexOf('function ap2Summary()')), ctx);
  assert.equal(ctx.ap2MarginFor(250, 1.49), 167.79);
  assert.equal(ctx.ap2MarginFor(1000, 100), 10);
  assert.equal(ctx.ap2ReservedOf({ qty: 1, cost: 400 }), 400);
  assert.equal(ctx.ap2LeverageOf({}), 1);
});

test('personal portfolio preserves leverage in storage, cash and cards', () => {
  assert.match(personal, /if \(lev !== 1\) rec\.leverage = lev;/);
  assert.match(personal, /reserve = positions\.reduce|const reserved = positions\.reduce/);
  assert.match(personal, /leverageOf\(x\) > 1 \? reservedOf\(x\)/);
  assert.match(personal, /ap2-lev-badge/);
  assert.match(personal, /if \(lev !== 1\) pos\.leverage = lev;|leverage: lev/);
  assert.match(personal, /formMode === 'marj' \? amount \* lev/);
});
