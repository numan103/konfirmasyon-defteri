import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseNumber, parsePlan, validatePlan, describePlanErrors, stripPlanLines } from '../lib/trade-plan.mjs';
import { planTopic } from '../lib/telegram-qa.mjs';
import { fibLevel, fibSet, pivots, lastImpulse, fvgs, nearestLevels, inIfvgWindow, istanbulTime, structureFromCandles } from '../lib/market-structure.mjs';

const BAD_REPORTED = `**Plan**

- **Yön:** BEARISH
- **Giriş:** $73 970
- **Stop:** $73 100
- **Hedef:** $76 400

**Gerekçe:** Spot CVD negatif ve fiyat 24 saat içinde düşüşte.

**Verdict:** BEARISH`;

const plan = (direction, entry, stop, target, verdict = direction) =>
  `**Yön:** ${direction}\n**Giriş:** $${entry}\n**Stop:** $${stop}\n**Hedef:** $${target}\n**Gerekçe:** test\n**Verdict:** ${verdict}`;

test('parses Turkish thousands separators as full prices', () => {
  assert.equal(parseNumber('73.970'), 73970);
  assert.equal(parseNumber('73 970'), 73970);
  assert.equal(parseNumber('73,970'), 73970);
  assert.equal(parseNumber('$76.400'), 76400);
  assert.equal(parseNumber('0,065'), 0.065);
  assert.equal(parseNumber('0.00000522'), 0.00000522);
  assert.equal(parseNumber('100,5'), 100.5);
  assert.equal(parseNumber('1.234,56'), 1234.56);
  assert.equal(parseNumber('1,234.56'), 1234.56);
});

test('rejected reported plan is parsed as a broken short', () => {
  const p = parsePlan(BAD_REPORTED);
  assert.equal(p.direction, 'SHORT');
  assert.equal(p.verdict, 'SHORT');
  assert.equal(p.entry, 73970);
  assert.equal(p.stop, 73100);
  assert.equal(p.target, 76400);
  assert.equal(p.hasPlan, true);

  const v = validatePlan(p, { price: 100000, atr: 800 });
  assert.equal(v.ok, false);
  assert.ok(v.errors.includes('short_stop_not_above_entry'));
  assert.ok(v.errors.includes('short_target_not_below_entry'));
  assert.ok(v.errors.includes('entry_far_from_market'));
  const text = describePlanErrors(v.errors);
  assert.match(text, /SHORT planda stop girişin ÜSTÜNDE/);
  assert.match(text, /SHORT planda hedef girişin ALTINDA/);
});

test('coherent long and short plans pass', () => {
  assert.equal(validatePlan(parsePlan(plan('BULLISH', '100.000', '98.000', '106.000')), { price: 100000, atr: 800 }).ok, true);
  assert.equal(validatePlan(parsePlan(plan('LONG', '100.000', '98.000', '106.000')), { price: 100000, atr: 800 }).ok, true);
  assert.equal(validatePlan(parsePlan(plan('BEARISH', '100.000', '102.000', '94.000')), { price: 100000, atr: 800 }).ok, true);
  assert.equal(validatePlan(parsePlan(plan('SHORT', '100.000', '102.000', '94.000')), { price: 100000, atr: 800 }).ok, true);
});

test('swapped long plan is rejected on both stop and target sides', () => {
  const v = validatePlan(parsePlan(plan('BULLISH', '100.000', '102.000', '94.000')), { price: 100000, atr: 800 });
  assert.equal(v.ok, false);
  assert.ok(v.errors.includes('long_stop_not_below_entry'));
  assert.ok(v.errors.includes('long_target_not_above_entry'));
});

test('reward below 1R is rejected', () => {
  const v = validatePlan(parsePlan(plan('LONG', '100.000', '99.000', '100.500')), { price: 100000, atr: 800 });
  assert.equal(v.ok, false);
  assert.ok(v.errors.includes('rr_below_1'));
});

test('stop inside ATR noise is rejected', () => {
  const v = validatePlan(parsePlan(plan('LONG', '100.000', '99.900', '101.000')), { price: 100000, atr: 800 });
  assert.equal(v.ok, false);
  assert.ok(v.errors.includes('stop_inside_noise'));
});

test('entry far from live price is rejected', () => {
  const v = validatePlan(parsePlan(plan('LONG', '108.000', '105.000', '114.000')), { price: 100000, atr: 800 });
  assert.equal(v.ok, false);
  assert.ok(v.errors.includes('entry_far_from_market'));
  assert.equal(v.errors.includes('stop_too_wide'), false);
});

test('direction and verdict conflict is rejected', () => {
  const v = validatePlan(parsePlan(plan('BULLISH', '100.000', '98.000', '106.000', 'BEARISH')), { price: 100000, atr: 800 });
  assert.equal(v.ok, false);
  assert.ok(v.errors.includes('direction_conflict'));
});

test('missing direction is rejected when levels exist', () => {
  const v = validatePlan(parsePlan('**Giriş:** $100.000\n**Stop:** $98.000\n**Hedef:** $106.000'), { price: 100000, atr: 800 });
  assert.equal(v.ok, false);
  assert.ok(v.errors.includes('direction_unknown'));
});

test('neutral answer without levels is allowed through', () => {
  const v = validatePlan(parsePlan('**Yön:** NÖTR\n**Gerekçe:** Net setup yok.\n**Verdict:** NÖTR'), { price: 100000, atr: 800 });
  assert.equal(v.ok, true);
});

test('stripPlanLines removes only level lines', () => {
  const kept = stripPlanLines(BAD_REPORTED);
  assert.equal(/Giriş|Stop|Hedef/.test(kept), false);
  assert.match(kept, /Yön/);
  assert.match(kept, /Gerekçe/);
  assert.match(kept, /Verdict/);
});

test('1h structure is derived from candles and needs enough history', () => {
  const candles = Array.from({ length: 100 }, (_, i) => ({ h: 100 + i, l: 90 + i, c: 95 + i }));
  const st = structureFromCandles(candles);
  assert.equal(st.atr14, 10);
  assert.equal(st.high24, 199);
  assert.equal(st.low24, 166);
  assert.equal(st.swingHigh, 199);
  assert.equal(st.swingLow, 140);
  assert.equal(st.trend, 'yukarı');
  assert.equal(structureFromCandles(candles.slice(0, 59)), null);
  assert.equal(structureFromCandles(null), null);
});

test('fib retracement levels follow impulse direction', () => {
  assert.equal(fibLevel(100, 200, 0.382), 161.8);
  assert.equal(fibLevel(200, 100, 0.382), 138.2);
  const up = fibSet(100, 200);
  assert.equal(up.direction, 'up');
  assert.equal(up.r5, 150);
  assert.equal(up.r805, 119.5);
  assert.equal(fibLevel(0, 100, 0.5), null);
});

test('last impulse and nearest liquidity come from pivots', () => {
  const c = [
    { h: 11, l: 9, c: 10 }, { h: 21, l: 19, c: 20 },
    { h: 15, l: 13, c: 14 }, { h: 19, l: 17, c: 18 },
    { h: 18, l: 16, c: 17 },
  ];
  const p = pivots(c, { left: 1, right: 1 });
  assert.deepEqual(p.highs.map(x => x.price), [21, 19]);
  assert.deepEqual(p.lows.map(x => x.price), [13]);
  const leg = lastImpulse(c, { left: 1, right: 1 });
  assert.equal(leg.start, 13);
  assert.equal(leg.end, 19);
  assert.equal(leg.direction, 'up');
  assert.deepEqual(nearestLevels(c, 16, { left: 1, right: 1 }), { high: 19, low: 13 });
});

test('FVG detection marks inverted gaps as IFVG', () => {
  const bull = [
    { h: 10, l: 8, c: 9 }, { h: 12, l: 9, c: 11 },
    { h: 15, l: 12, c: 14 }, { h: 16, l: 13, c: 15 },
  ];
  const g = fvgs(bull);
  assert.equal(g.length, 2);
  assert.equal(g[0].type, 'bull');
  assert.equal(g[0].bottom, 10);
  assert.equal(g[0].top, 12);
  assert.equal(g[0].inverted, false);

  const failedBull = [...bull.slice(0, 3), { h: 11, l: 8, c: 9 }];
  assert.equal(fvgs(failedBull).at(-1).inverted, true);

  const bear = [
    { h: 12, l: 10, c: 11 }, { h: 11, l: 9, c: 9.5 },
    { h: 8, l: 6, c: 7 }, { h: 11, l: 9, c: 10.5 },
  ];
  const bg = fvgs(bear).at(-1);
  assert.equal(bg.type, 'bear');
  assert.equal(bg.bottom, 8);
  assert.equal(bg.top, 10);
  assert.equal(bg.inverted, true);
});

test('IFVG window is 08:00-12:00 Istanbul time', () => {
  assert.deepEqual(istanbulTime(new Date('2026-11-12T05:05:00Z')), { hour: 8, minute: 5 });
  assert.equal(inIfvgWindow(new Date('2026-11-12T05:30:00Z')), true);
  assert.equal(inIfvgWindow(new Date('2026-11-12T08:59:00Z')), true);
  assert.equal(inIfvgWindow(new Date('2026-11-12T09:00:00Z')), false);
});

test('user-reported tight-stop plan is rejected', () => {
  const text = `**Strateji:** 0.382
**Yön:** BEARISH
**Giriş:** $73.000
**Stop:** $73.300
**Hedef:** $70.000
**Gerekçe:** test
**Verdict:** BEARISH`;
  const p = parsePlan(text);
  assert.equal(p.strategy, '0.382');
  const v = validatePlan(p, { price: 71943, atr: 474, requireStrategy: true });
  assert.equal(v.ok, false);
  assert.ok(v.errors.includes('stop_inside_noise'));
  assert.match(describePlanErrors(v.errors), /en az 1×ATR/);
});

test('a plan without a named strategy is rejected when strategy is required', () => {
  const p = parsePlan(plan('BEARISH', '72.500', '73.500', '70.500'));
  const v = validatePlan(p, { price: 71943, atr: 474, requireStrategy: true });
  assert.equal(v.ok, false);
  assert.ok(v.errors.includes('strategy_missing'));
});

test('question topic picks the instrument the user actually asked about', () => {
  assert.equal(planTopic('BTC yönü ne?'), 'btc');
  assert.equal(planTopic('altın ons analizi'), 'gold');
  assert.equal(planTopic('ETH için plan ver'), 'eth');
  assert.equal(planTopic('BTC ve altın birlikte nasıl?'), 'btc');
  assert.equal(planTopic('piyasa nasıl?'), 'btc');
});

test('QA bot feeds live price/structure and validates plans before answering', () => {
  const src = fs.readFileSync(new URL('../lib/telegram-qa.mjs', import.meta.url), 'utf8');
  assert.match(src, /getSpotPrices\(\)/);
  assert.match(src, /getStructure\('BTC'\)/);
  assert.match(src, /getStructure\('XAUT'\)/);
  assert.match(src, /okx\.com\/api\/v5\/market\/candles/);
  assert.match(src, /api\.bybit\.com\/v5\/market\/kline/);
  assert.match(src, /api\.exchange\.coinbase\.com\/products/);
  assert.match(src, /ATR\/swing satırı eksikse 24s yüksek\/düşük ile kur/);
  assert.match(src, /formatStrategyContext\(/);
  assert.match(src, /planRefFor\(/);
  assert.match(src, /requireStrategy: true/);
  assert.match(src, /BTC’de 5m IFVG kullanılmıyor/);
  assert.match(src, /Eski notlardaki fiyatlar/);
  assert.match(src, /LONG Stop < Giriş < Hedef/);
  assert.match(src, /SHORT Hedef < Giriş < Stop/);
  assert.match(src, /validatePlan\(firstPlan, planRefFor\(firstPlan, ref\)\)/);
  assert.match(src, /planFallback\(/);
  assert.match(src, /formatMarketContext\(marketData, spot, \{ BTC: btcStructure, ETH: ethStructure, XAU: goldStructure \}\)/);
});
