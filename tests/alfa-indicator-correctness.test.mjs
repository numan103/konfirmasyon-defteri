import test from 'node:test';
import assert from 'node:assert/strict';
import { sma, ema, rsi, macd, paneIndicatorLabel } from '../assets/alfa-indicators-model.mjs';
import { normalizeStudyBundle } from '../assets/alfa-study-persistence.mjs';

const candles = length => Array.from({ length }, (_, i) => ({
  time: i * 60, open: i, high: i + 1, low: i - 1, close: i, volume: 10 + i
}));

test('SMA and EMA match their published reference values', () => {
  const bars = candles(5);
  assert.deepEqual(sma(bars, 3), [null, null, 1, 2, 3]);
  const e = ema(bars, 3);
  assert.equal(e[2], 1);
  assert.ok(Math.abs(e[3] - 2) < 1e-12);
  assert.ok(Math.abs(e[4] - 3) < 1e-12);
});

test('RSI treats a flat market as neutral, not overbought', () => {
  const flat = Array.from({ length: 30 }, (_, i) => ({ time: i, open: 100, high: 100, low: 100, close: 100, volume: 1 }));
  assert.equal(rsi(flat, 14).at(-1), 50);
  const rising = candles(30);
  assert.equal(rsi(rising, 14).at(-1), 100);
});

test('MACD signal starts once after its full seed window', () => {
  const m = macd(candles(50));
  assert.equal(m.signal[31], null);
  assert.equal(m.signal[32], null);
  assert.ok(Number.isFinite(m.signal[33]), 'signal must start at slow+signal-2');
  assert.ok(Number.isFinite(m.hist[33]));
});

test('native pane captions have one label source', () => {
  assert.equal(paneIndicatorLabel('RSI', { period: 14 }), 'RSI 14');
  assert.equal(paneIndicatorLabel('MACD', { fast: 12 }), 'MACD 12');
  assert.equal(paneIndicatorLabel('Stochastic', { k: 14 }), 'Stochastic 14');
  assert.equal(paneIndicatorLabel('OBV', {}), 'OBV');
});

test('shared links sanitize native study types and parameters', async () => {
  const studies = await import('../assets/alfa-chart-studies.mjs');
  assert.equal(typeof studies.studyFieldLabel, 'function');
  assert.equal(studies.studyFieldLabel('rsi', 'period'), 'Periyot');
  assert.equal(studies.studyFieldLabel('oi', 'period'), 'Veri periyodu');

  const bundle = normalizeStudyBundle({ indicators: [
    { type: 'ema', params: { period: 999999, source: 'close', color: 'javascript:alert(1)' } },
    { type: 'rsi', params: { period: -10 } },
    { type: 'evil', params: { period: 5 } },
    { type: 'sma', params: { period: '20', source: 'close', color: '#fff' } }
  ] });
  assert.deepEqual(bundle.indicators.map(item => item.type), ['ema', 'rsi', 'sma']);
  assert.ok(bundle.indicators[0].params.period <= 500);
  assert.match(bundle.indicators[0].params.color, /^#[0-9a-f]{3,8}$/i);
  assert.ok(bundle.indicators[1].params.period >= 1);
  assert.deepEqual(bundle.indicators[2].params, { period: 20, source: 'close', color: '#fff' });
});
