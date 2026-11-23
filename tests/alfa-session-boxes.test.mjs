import test from 'node:test';
import assert from 'node:assert/strict';
import { computeSessionBoxes, SESSION_BOX_DEFS } from '../assets/alfa-session-boxes-model.mjs';

const DAY = 86400;
// Three full days of 1m bars ending Monday 2026-01-05 23:59 UTC.
const end = Date.UTC(2026, 0, 5, 23, 59) / 1000;
const bars = [];
for (let t = end - 3 * DAY + 60; t <= end; t += 60) {
  bars.push({ time: t, open: 100, high: 101, low: 99, close: 100 });
}

test('session boxes are empty without bars', () => {
  assert.deepEqual(computeSessionBoxes([], {}), []);
  assert.deepEqual(computeSessionBoxes(null, {}), []);
});

test('session boxes cover Asia/London/NY windows with correct UTC boundaries', () => {
  const boxes = computeSessionBoxes(bars, {}, 1);
  assert.equal(boxes.length, 3);
  const asia = boxes.find(b => b.id === 'asia');
  const london = boxes.find(b => b.id === 'london');
  const ny = boxes.find(b => b.id === 'ny');
  // Tokyo 09:00-17:00 = 00:00-08:00 UTC; London 08:00-16:30 GMT; NY 08:00-17:00 EST.
  assert.equal(asia.startTs, Date.UTC(2026, 0, 5, 0, 0) / 1000);
  assert.equal(asia.endTs, Date.UTC(2026, 0, 5, 8, 0) / 1000);
  assert.equal(london.startTs, Date.UTC(2026, 0, 5, 8, 0) / 1000);
  assert.equal(london.endTs, Date.UTC(2026, 0, 5, 16, 30) / 1000);
  assert.equal(ny.startTs, Date.UTC(2026, 0, 5, 13, 0) / 1000);
  assert.equal(ny.endTs, Date.UTC(2026, 0, 5, 22, 0) / 1000);
  for (const b of boxes) {
    assert.ok(b.high >= b.low);
    assert.ok(b.startTs < b.endTs);
    assert.ok(SESSION_BOX_DEFS.some(d => d.id === b.id && d.color === b.color));
  }
});

test('session box high/low reflect only bars inside the window', () => {
  const spiked = bars.map(b => ({ ...b }));
  const target = spiked.find(b => b.time === Date.UTC(2026, 0, 5, 3, 0) / 1000);
  target.high = 150;
  const outside = spiked.find(b => b.time === Date.UTC(2026, 0, 5, 9, 0) / 1000);
  outside.high = 999; // inside London, outside Asia
  const boxes = computeSessionBoxes(spiked, {}, 1);
  const asia = boxes.find(b => b.id === 'asia');
  const london = boxes.find(b => b.id === 'london');
  assert.equal(asia.high, 150);
  assert.equal(asia.low, 99);
  assert.equal(london.high, 999);
});

test('disabled sessions are excluded and days are deduplicated', () => {
  const boxes = computeSessionBoxes(bars, { asia: false, london: false }, 5);
  assert.ok(boxes.length > 0);
  assert.ok(boxes.every(b => b.id === 'ny'));
  const starts = boxes.map(b => b.startTs);
  assert.equal(new Set(starts).size, starts.length);
  assert.ok(boxes.length <= 5);
  const sorted = [...boxes].sort((a, b) => a.startTs - b.startTs);
  assert.deepEqual(boxes, sorted);
});

test('before session open the previous window is used, not a future one', () => {
  // 2026-01-05 23:59 UTC is 08:59 Tokyo next day, before the 09:00 open.
  const boxes = computeSessionBoxes(bars, {}, 1);
  const asia = boxes.find(b => b.id === 'asia');
  assert.ok(asia.endTs <= end);
});
