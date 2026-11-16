import test from 'node:test';
import assert from 'node:assert/strict';
import { computeFvg } from '../assets/alfa-fvg-model.mjs';

const bullBars = [
  { time: 1, open: 10, high: 11, low: 9, close: 10.5 },
  { time: 2, open: 10.5, high: 12, low: 10.2, close: 11.8 }, // displacement middle
  { time: 3, open: 11.8, high: 13, low: 12.5, close: 12.8 }, // low (12.5) > high of first (11) => bullish FVG
  { time: 4, open: 12.8, high: 13.2, low: 12.4, close: 13.0 },
];

test('bullish FVG detected after third candle closes', () => {
  const f = computeFvg(bullBars, { displacement: false });
  const b = f.find(x => x.type === 'fvg' && x.dir === 'bull');
  assert.ok(b);
  assert.equal(b.upper, 12.5);
  assert.equal(b.lower, 11);
});

test('FVG not created before third candle', () => {
  const f = computeFvg(bullBars.slice(0, 2), { displacement: false });
  assert.equal(f.filter(x => x.type === 'fvg').length, 0);
});

test('invalidation creates IFVG of opposite direction', () => {
  const bars = [
    { time: 1, open: 10, high: 11, low: 9, close: 10.5 },
    { time: 2, open: 10.5, high: 12, low: 10.2, close: 11.8 },
    { time: 3, open: 11.8, high: 13, low: 12.5, close: 12.8 },
    { time: 4, open: 12.8, high: 13.2, low: 10.5, close: 10.6 }, // close below lower (11) => invalidate
  ];
  const f = computeFvg(bars, { displacement: false });
  const ifvg = f.find(x => x.type === 'ifvg');
  assert.ok(ifvg);
  assert.equal(ifvg.dir, 'bear');
  assert.equal(ifvg.origin, f.find(x => x.type === 'fvg' && x.dir === 'bull').id);
});

test('wick mitigation marks partial without invalidation', () => {
  const bars = [
    { time: 1, open: 10, high: 11, low: 9, close: 10.5 },
    { time: 2, open: 10.5, high: 12, low: 10.2, close: 11.8 },
    { time: 3, open: 11.8, high: 13, low: 12.5, close: 12.8 },
    { time: 4, open: 12.8, high: 13.2, low: 11.5, close: 13.0 }, // enters gap but not below 11
  ];
  const f = computeFvg(bars, { displacement: false, mitigation: 'wick' });
  const b = f.find(x => x.type === 'fvg' && x.dir === 'bull');
  assert.ok(b);
  assert.notEqual(b.mitigation, 'invalidated');
});

test('bearish FVG detected', () => {
  const bars = [
    { time: 1, open: 12, high: 13, low: 11, close: 12.5 },
    { time: 2, open: 12.5, high: 12.8, low: 11.5, close: 11.9 },
    { time: 3, open: 11.9, high: 10.5, low: 10, close: 10.2 }, // high(10.5) < low of first (11) => bearish
  ];
  const f = computeFvg(bars, { displacement: false });
  const b = f.find(x => x.type === 'fvg' && x.dir === 'bear');
  assert.ok(b);
});
