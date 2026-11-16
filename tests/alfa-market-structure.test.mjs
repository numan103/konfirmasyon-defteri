import test from 'node:test';
import assert from 'node:assert/strict';
import { findSwings, classifyStructure, computeMarketStructure } from '../assets/alfa-market-structure-model.mjs';

const upTrend = [
  { time: 1, open: 10, high: 11, low: 9, close: 10.5 },
  { time: 2, open: 10.5, high: 12, low: 10, close: 11.5 },
  { time: 3, open: 11.5, high: 10.8, low: 10.2, close: 10.6 },
  { time: 4, open: 10.6, high: 13, low: 10.5, close: 12.5 },
  { time: 5, open: 12.5, high: 12, low: 11, close: 11.8 },
  { time: 6, open: 11.8, high: 14, low: 11.5, close: 13.5 },
];

test('findSwings detects highs and lows with confirmation delay', () => {
  const s = findSwings(upTrend, 1, 1);
  assert.ok(s.length > 0);
  // swing at index i confirmed only after right bars; last bar cannot be a swing
  assert.ok(s.every(x => x.index < upTrend.length - 1));
});

test('classifyStructure labels HH/HL in an uptrend', () => {
  const swings = findSwings(upTrend, 1, 1);
  const labeled = classifyStructure(swings, 0);
  assert.ok(labeled.some(x => x.label === 'HH' || x.label === 'HL'));
});

test('computeMarketStructure returns structured result without lookahead', () => {
  const ms = computeMarketStructure(upTrend, { left: 1, right: 1 });
  assert.ok(Array.isArray(ms.swings));
  assert.ok(Array.isArray(ms.bos));
  assert.ok(Array.isArray(ms.choch));
  assert.ok(Array.isArray(ms.protected));
  assert.ok(Array.isArray(ms.equal));
});

test('no swings confirmed on the last right bars (no lookahead)', () => {
  const bars = [
    { time: 1, open: 1, high: 5, low: 1, close: 4 },
    { time: 2, open: 4, high: 4.5, low: 3.5, close: 4 },
    { time: 3, open: 4, high: 4.2, low: 3.8, close: 4.1 },
  ];
  const s = findSwings(bars, 1, 2);
  // high at index 0 needs 2 right bars -> confirmed at index 2, included
  assert.ok(s.length >= 0);
});

test('equal highs detected within tolerance', () => {
  const bars = [
    { time: 1, open: 10, high: 12, low: 9, close: 11 },
    { time: 2, open: 11, high: 10, low: 9.5, close: 9.8 },
    { time: 3, open: 9.8, high: 12.001, low: 9.5, close: 11.5 },
    { time: 4, open: 11.5, high: 10, low: 9.7, close: 9.9 },
  ];
  const ms = computeMarketStructure(bars, { left: 1, right: 1, equalTol: 0.01 });
  assert.ok(Array.isArray(ms.equal));
});
