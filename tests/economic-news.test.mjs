import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { calendarTitleTr } from '../lib/calendar-titles.mjs';
import { todayEvents, istanbulDay, istanbulTime } from '../assets/economic-news-model.mjs';
import handler from '../api/eco-cal.mjs';

test('calendar translations are deterministic and unknown names are not invented', () => {
  assert.equal(calendarTitleTr('Core CPI m/m'), 'Çekirdek TÜFE (aylık)');
  assert.equal(calendarTitleTr('CPI y/y'), 'TÜFE (yıllık)');
  assert.equal(calendarTitleTr('Advance GDP q/q'), 'Öncü GSYH (çeyreklik)');
  assert.equal(calendarTitleTr('Non-Farm Employment Change'), 'Tarım Dışı İstihdam Değişimi');
  assert.equal(calendarTitleTr('Fed Chair Powell Speaks'), 'Fed Başkanı Powell Konuşması');
  assert.equal(calendarTitleTr('Unknown Release'), null);
  assert.equal(calendarTitleTr('constructor'), null);
  assert.equal(calendarTitleTr(null), null);
});
test('today is determined in Istanbul independent of browser timezone and US DST', () => {
  assert.equal(istanbulDay('2026-11-17T21:01:00Z'), '2026-11-18');
  assert.equal(istanbulDay('2026-11-18T21:01:00Z'), '2026-11-19');
  assert.equal(istanbulTime('2026-11-18T08:30:00-05:00'), '16:30');
  assert.equal(istanbulTime('2026-07-18T08:30:00-04:00'), '15:30');
  assert.equal(istanbulDay('bad'), '');
});
test('today list filters impact, rejects ambiguous timestamps, sorts and deduplicates without actual claims', () => {
  const event = { title: 'CPI m/m', titleTr: 'TÜFE (aylık)', country: 'USD', date: '2026-11-18T08:30:00-05:00', impact: 'High', forecast: '0', previous: '0.3%', actual: 'fake' };
  const items = [event, event, { ...event, title: 'Earlier', date: '2026-11-17T22:00:00Z' },
    { ...event, title: 'Low', impact: 'Low' }, { ...event, title: 'Next day', date: '2026-11-18T22:00:00Z' },
    { ...event, date: 'bad' }, { ...event, date: '2026-11-18T10:00:00' }, null];
  const high = todayEvents(items, { now: Date.parse('2026-11-18T12:00:00Z') });
  assert.deepEqual(high.map(e => e.title), ['Earlier', 'CPI m/m']);
  assert.equal(high[1].forecast, '0');
  assert.equal(Object.hasOwn(high[1], 'actual'), false);
  assert.equal(todayEvents(items, { now: Date.parse('2026-11-18T12:00:00Z'), highOnly: false }).length, 3);
});
async function request(t, response) {
  t.mock.method(globalThis, 'fetch', async () => response);
  const headers = {};
  const res = { setHeader(k, v) { headers[k] = v; }, status(n) { this.code = n; return this; }, json(body) { this.body = body; return this; } };
  await handler({ method: 'GET' }, res);
  return { ...res, headers };
}
test('existing calendar API adds bilingual labels without pretending FF supplies actuals', async t => {
  const result = await request(t, Response.json([{ title: 'CPI m/m', country: 'USD', impact: 'High',
    date: '2026-11-18T08:30:00-05:00', forecast: '0.2%', previous: '0.3%', actual: 'fake' }]));
  assert.equal(result.body.ok, true);
  assert.equal(result.body.items[0].titleTr, 'TÜFE (aylık)');
  assert.equal(result.body.actualAvailable, false);
  assert.equal(Object.hasOwn(result.body.items[0], 'actual'), false);
  assert.match(result.headers['Cache-Control'], /s-maxage=300/);
});
test('source failures remain failures, not a cached empty calendar', async t => {
  const result = await request(t, new Response('', { status: 403 }));
  assert.equal(result.body.ok, false);
  assert.equal(result.headers['Cache-Control'], 'no-store');
  assert.equal(Object.hasOwn(result.body, 'items'), false);
});
test('top news panel is global and sources remain independent with an official lazy embed', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const client = fs.readFileSync(new URL('../assets/economic-news.mjs', import.meta.url), 'utf8');
  assert.ok(html.indexOf('id="economic-news"') < html.indexOf('id="page-home"'));
  assert.match(html, /data-econ-high checked/);
  assert.match(client, /widgets\.tradingview-widget\.com\/w\/tr\/tv-economic-calendar\.js/);
  assert.match(client, /!popup\.hidden && !document\.hidden/);
  assert.match(client, /trigger\.setAttribute\('aria-expanded', 'false'\)/);
  assert.ok(!client.includes("localStorage.setItem('alfa-economic-news-open'"));
  assert.match(html, /id="economic-news-popover"[^>]*hidden/);
  assert.match(client, /event\.key === 'Escape'/);
  assert.ok(!client.includes('innerHTML'));
  assert.ok(!client.includes('contentWindow'));
  assert.ok(!client.includes('Telegram'));
  for (const key of ['title', 'high', 'refresh', 'agenda', 'results', 'agendaNote', 'resultsNote']) {
    assert.ok(html.includes("'econ." + key + "': { tr:"));
  }
});
