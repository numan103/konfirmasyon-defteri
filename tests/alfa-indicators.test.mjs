import test from 'node:test';
import assert from 'node:assert/strict';
import { sma, ema, rsi, atr, bollinger, macd, vwap, obv, supertrend } from '../assets/alfa-indicators-model.mjs';

const candles = [
  { time: 1, open: 10, high: 12, low: 9, close: 11, volume: 100 },
  { time: 2, open: 11, high: 13, low: 10, close: 12, volume: 120 },
  { time: 3, open: 12, high: 14, low: 11, close: 13, volume: 90 },
  { time: 4, open: 13, high: 15, low: 12, close: 14, volume: 110 },
  { time: 5, open: 14, high: 16, low: 13, close: 15, volume: 130 },
];

test('sma computes trailing average and warms up', () => {
  const v = sma(candles, 3);
  assert.equal(v[0], null);
  assert.equal(v[1], null);
  assert.equal(v[2], 12);
  assert.equal(v[4], 14);
});

test('ema seeds with SMA then applies smoothing', () => {
  const v = ema(candles, 3);
  assert.equal(v[0], null);
  assert.equal(v[1], null);
  assert.equal(v[2], 12);
  assert.ok(Math.abs(v[3] - (14 * 2/4 + 12 * 2/4)) < 1e-9);
});

test('rsi stays within 0..100 and warms up', () => {
  const v = rsi(candles, 2);
  assert.equal(v[0], null);
  assert.equal(v[1], null);
  for (const x of v) if (x != null) assert.ok(x >= 0 && x <= 100);
});

test('atr is positive', () => {
  const v = atr(candles, 2);
  assert.equal(v[0], null);
  assert.ok(v[1] > 0);
});

test('bollinger middle equals sma and bands surround it', () => {
  const b = bollinger(candles, 3, 2);
  assert.equal(b.middle[2], 12);
  assert.ok(b.upper[2] > b.middle[2]);
  assert.ok(b.lower[2] < b.middle[2]);
});

test('macd returns three aligned arrays', () => {
  const m = macd(candles, 2, 3, 2);
  assert.equal(m.macd.length, candles.length);
  assert.equal(m.signal.length, candles.length);
  assert.equal(m.hist.length, candles.length);
});

test('vwap is finite and positive', () => {
  const v = vwap(candles);
  for (const x of v) assert.ok(Number.isFinite(x) && x > 0);
});

test('obv accumulates signed volume', () => {
  const v = obv(candles);
  assert.equal(v[0], 100);
  assert.ok(v[4] > v[0]);
});

test('supertrend returns value and trend arrays', () => {
  const s = supertrend(candles, 2, 2);
  assert.equal(s.value.length, candles.length);
  assert.equal(s.trend.length, candles.length);
});
