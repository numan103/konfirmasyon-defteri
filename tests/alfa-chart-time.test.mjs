import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  CHART_TIME_ZONES, normalizeChartTimeZone, chartTimeZoneKey,
  readChartTimeZone, writeChartTimeZone, createChartTimeFormatters
} from '../assets/alfa-chart-time.mjs';

const epoch = iso => Date.parse(iso) / 1000;
const format = (zone, iso) => createChartTimeFormatters(zone).dateTime(epoch(iso));

test('chart time zones use a bounded IANA allowlist and fail safely to UTC', () => {
  for (const zone of Object.keys(CHART_TIME_ZONES)) assert.equal(normalizeChartTimeZone(zone), zone);
  for (const bad of [undefined, null, '', 3, {}, '__proto__', 'Etc/Unknown', 'Europe/Istanbul<script>']) {
    assert.equal(normalizeChartTimeZone(bad), 'UTC');
  }
});

test('chart timestamps format independently of the machine time zone', () => {
  const iso = '2026-11-24T12:00:00Z';
  assert.equal(format('UTC', iso), '2026-11-24 12:00');
  assert.equal(format('Europe/Istanbul', iso), '2026-11-24 15:00');
  assert.equal(format('America/New_York', iso), '2026-11-24 07:00');
  assert.equal(format('Europe/London', iso), '2026-11-24 12:00');
  assert.equal(format('Asia/Tokyo', iso), '2026-11-24 21:00');
  assert.equal(format('Europe/Istanbul', '2026-07-01T12:00:00Z'), '2026-07-01 15:00');
  assert.equal(format('Europe/Istanbul', '2026-12-31T23:30:00Z'), '2027-01-01 02:30');
});

test('New York labels follow DST gaps and repeated hours without changing the epoch', () => {
  assert.equal(format('America/New_York', '2026-03-08T06:59:00Z'), '2026-03-08 01:59');
  assert.equal(format('America/New_York', '2026-03-08T07:00:00Z'), '2026-03-08 03:00');
  assert.equal(format('America/New_York', '2026-11-01T05:59:00Z'), '2026-11-01 01:59');
  assert.equal(format('America/New_York', '2026-11-01T06:00:00Z'), '2026-11-01 01:00');
});

test('London labels follow British summer time rather than a fixed offset', () => {
  assert.equal(format('Europe/London', '2026-03-29T00:59:00Z'), '2026-03-29 00:59');
  assert.equal(format('Europe/London', '2026-03-29T01:00:00Z'), '2026-03-29 02:00');
  assert.equal(format('Europe/London', '2026-10-25T00:59:00Z'), '2026-10-25 01:59');
  assert.equal(format('Europe/London', '2026-10-25T01:00:00Z'), '2026-10-25 01:00');
});

test('axis ticks keep year/month/day/time granularity and format midnight as 00', () => {
  const fmt = createChartTimeFormatters('Europe/Istanbul'), time = epoch('2026-12-31T21:00:05Z');
  assert.equal(fmt.tickMark(time, 'year'), '2027');
  assert.equal(fmt.tickMark(time, 'month'), 'Oca');
  assert.equal(fmt.tickMark(time, 'day'), '01');
  assert.equal(fmt.tickMark(time, 'time'), '00:00');
  assert.equal(fmt.tickMark(time, 'seconds'), '00:00:05');
  assert.equal(fmt.dateTime(time), '2027-01-01 00:00');
});

test('date-only BusinessDay keys keep their calendar date and input object intact', () => {
  const day = { year: 2026, month: 1, day: 1 }, before = structuredClone(day);
  const fmt = createChartTimeFormatters('America/New_York');
  assert.equal(fmt.dateTime(day), '2026-01-01');
  assert.equal(fmt.dateTime('2026-01-01'), '2026-01-01');
  assert.equal(fmt.tickMark(day, 'year'), '2026');
  assert.equal(fmt.tickMark(day, 'day'), '01');
  assert.deepEqual(day, before);
});

test('invalid time values never throw into chart rendering', () => {
  const fmt = createChartTimeFormatters('UTC');
  for (const time of [null, undefined, NaN, Infinity, 1e20, {}, 'bad', '2026-02-31', { year: 2026, month: 13, day: 1 }]) {
    assert.equal(fmt.dateTime(time), '—');
    assert.equal(fmt.tickMark(time), '—');
  }
});

test('time-zone preference is owner-scoped and leaves other documents untouched', () => {
  const rows = new Map([['alfa-drawings:v1:guest:BTCUSDT', 'drawing-backup']]);
  const storage = { getItem: key => rows.get(key), setItem: (key, value) => rows.set(key, value) };
  assert.equal(readChartTimeZone('guest', storage), 'UTC');
  assert.equal(writeChartTimeZone('guest', 'Europe/Istanbul', storage), true);
  assert.equal(writeChartTimeZone('user-a', 'America/New_York', storage), true);
  assert.equal(readChartTimeZone('guest', storage), 'Europe/Istanbul');
  assert.equal(readChartTimeZone('user-a', storage), 'America/New_York');
  assert.equal(readChartTimeZone('user-b', storage), 'UTC');
  assert.equal(rows.get('alfa-drawings:v1:guest:BTCUSDT'), 'drawing-backup');
  assert.equal(chartTimeZoneKey(null), chartTimeZoneKey('guest'));
});

test('corrupt or blocked preference storage keeps the chart usable', () => {
  const bad = { getItem: () => 'wrong', setItem: () => { throw new Error('quota'); } };
  assert.equal(readChartTimeZone('guest', bad), 'UTC');
  assert.equal(writeChartTimeZone('guest', 'Europe/Istanbul', bad), false);
  assert.equal(readChartTimeZone('guest', { getItem() { throw new Error('blocked'); } }), 'UTC');
});

test('UI time zones use formatters, not shifted data or new layout/cloud fields', () => {
  const code = fs.readFileSync(new URL('../assets/alfa-charts.mjs', import.meta.url), 'utf8');
  const apply = code.slice(code.indexOf('function applyChartTimeZone('), code.indexOf('function chartTimeZoneOptions('));
  assert.match(apply, /tickMarkFormatter/);
  assert.match(apply, /timeFormatter/);
  assert.doesNotMatch(apply, /setData\(|fetchHistory\(|fitContent\(|saveLayout\(/);
  const layout = code.slice(code.indexOf('function layoutSettings('), code.indexOf('function applyChartTimeZone('));
  assert.doesNotMatch(layout, /chartTimeZone/);
  const html = fs.readFileSync(new URL('../alfa-charts.html', import.meta.url), 'utf8');
  assert.match(html, /id="chart-timezone"[^>]*aria-label="Grafik saat dilimi: UTC"/);
  assert.ok(Number(html.match(/alfa-charts\.mjs\?v=(\d+)/)?.[1]) >= 58);
  assert.ok(Number(html.match(/alfa-charts\.css\?v=(\d+)/)?.[1]) >= 19);
});
