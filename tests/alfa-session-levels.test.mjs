import test from 'node:test';
import assert from 'node:assert/strict';
import { tzParts, computeSessionLevels } from '../assets/alfa-session-levels-model.mjs';

test('tzParts converts UTC timestamp to IANA timezone components', () => {
  // 2024-03-10 07:30 UTC
  const ts = Date.UTC(2024, 2, 10, 7, 30, 0) / 1000;
  const ny = tzParts(ts, 'America/New_York');
  // EST/EDT: March 10 2024 is EDT (-4) => 03:30
  assert.equal(ny.hour, 3);
  assert.equal(ny.minute, 30);
  const ist = tzParts(ts, 'Europe/Istanbul');
  assert.equal(ist.hour, 10);
  assert.equal(ist.minute, 30);
});

test('daily open and previous day high/low are computed from bars', () => {
  const bars = [
    { time: Date.UTC(2024, 0, 1, 0, 0, 0) / 1000, open: 100, high: 105, low: 99, close: 102, volume: 1 },
    { time: Date.UTC(2024, 0, 1, 1, 0, 0) / 1000, open: 102, high: 108, low: 101, close: 107, volume: 1 },
    { time: Date.UTC(2024, 0, 2, 0, 0, 0) / 1000, open: 107, high: 110, low: 106, close: 109, volume: 1 },
  ];
  const levels = computeSessionLevels(bars, { show: { DO: true, PDH: true, PDL: true } });
  const doL = levels.find(l => l.id === 'DO');
  const pdh = levels.find(l => l.id === 'PDH');
  const pdl = levels.find(l => l.id === 'PDL');
  assert.equal(doL.price, 107);
  assert.equal(pdh.price, 108);
  assert.equal(pdl.price, 99);
});

test('NY midnight open uses America/New_York day boundary', () => {
  // bar at 2024-01-02 05:30 UTC = 2024-01-02 00:30 NY (EST)
  const bars = [
    { time: Date.UTC(2024, 0, 2, 5, 0, 0) / 1000, open: 50, high: 52, low: 49, close: 51, volume: 1 },
  ];
  const levels = computeSessionLevels(bars, { show: { NYMO: true } });
  const nymo = levels.find(l => l.id === 'NYMO');
  assert.ok(nymo);
  assert.equal(nymo.price, 50);
});

test('session high/low computed from bars inside the window', () => {
  const bars = [
    { time: Date.UTC(2024, 0, 1, 7, 0, 0) / 1000, open: 10, high: 12, low: 9, close: 11, volume: 1 },
    { time: Date.UTC(2024, 0, 1, 9, 0, 0) / 1000, open: 11, high: 15, low: 10, close: 14, volume: 1 },
    { time: Date.UTC(2024, 0, 1, 12, 0, 0) / 1000, open: 14, high: 16, low: 13, close: 15, volume: 1 },
  ];
  const levels = computeSessionLevels(bars, {
    show: { asia: true },
    sessions: [{ id: 'asia', name: 'Asia', tz: 'UTC', start: { h: 7, m: 0 }, end: { h: 10, m: 0 }, show: true }],
  });
  const h = levels.find(l => l.id === 'asia_H');
  const l = levels.find(l => l.id === 'asia_L');
  assert.equal(h.price, 15);
  assert.equal(l.price, 9);
});

test('empty bars return no levels', () => {
  assert.deepEqual(computeSessionLevels([], {}), []);
});
