import test from 'node:test';
import assert from 'node:assert/strict';
import { collectEventAgenda, FORECAST_URL, parseSecondaryEvents } from '../lib/macro/event-sources.mjs';
import { eventReport } from '../lib/macro/event-report.mjs';

const fetchedAt = '2026-11-06T06:00:00Z';
const feed = () => JSON.stringify([
  { title: 'Non-Farm Employment Change', country: 'USD', date: '2026-11-06T08:30:00-05:00', impact: 'High', forecast: '65K', previous: '60K' },
  { title: 'Unemployment Rate', country: 'USD', date: '2026-11-06T08:30:00-05:00', impact: 'High', forecast: '4.2%', previous: '4.2%' },
  { title: 'Non-Farm Employment Change', country: 'CAD', date: '2026-11-06T08:30:00-05:00', impact: 'High', forecast: '99K', previous: '1K' },
  { title: 'CPI m/m', country: 'USD', date: '2026-11-10T08:30:00-05:00', impact: 'High', forecast: '0.3%', previous: '0.2%' },
  { title: 'Core CPI m/m', country: 'USD', date: '2026-11-10T08:30:00-05:00', impact: 'High', forecast: '0.2%', previous: '0.2%' },
  { title: 'Advance GDP q/q', country: 'USD', date: '2026-11-19T08:30:00-05:00', impact: 'High', forecast: '2.1%', previous: '2.0%' },
  { title: 'Unemployment Claims', country: 'USD', date: '2026-11-12T08:30:00-05:00', impact: 'Medium', forecast: '200K', previous: '195K' },
]);

test('secondary timings cover only supported US indicators and preserve reference periods and GDP phases', () => {
  const out = parseSecondaryEvents(feed(), fetchedAt);
  assert.deepEqual(out.map(e => e.kind).sort(), ['cpi', 'employment', 'gdp']);
  const employment = out.find(e => e.kind === 'employment');
  assert.equal(employment.at, '2026-11-06T13:30:00.000Z');
  assert.equal(employment.referencePeriod, '2026-10');
  assert.equal(employment.timeSource, 'secondary_calendar');
  assert.equal(employment.source.kind, 'secondary_calendar');
  assert.equal(employment.source.url, FORECAST_URL);
  const gdp = out.find(e => e.kind === 'gdp');
  assert.equal(gdp.officialTitle, 'Gross Domestic Product (Advance Estimate)');
  assert.equal(gdp.referencePeriod, null);
  assert.equal(out.find(e => e.kind === 'cpi').at, '2026-11-10T13:30:00.000Z');
});

test('conflicting secondary times for the same indicator/day are rejected', () => {
  const rows = JSON.parse(feed());
  rows.push({ ...rows[0], date: '2026-11-06T09:30:00-05:00' });
  assert.throws(() => parseSecondaryEvents(JSON.stringify(rows), fetchedAt), /calendar_conflict/);
});

test('secondary timing fills only the failed official authority and is clearly labelled before release', async () => {
  const out = await collectEventAgenda({ now: Date.parse(fetchedAt), read: async url => {
    if (url.includes('bea.gov')) return { url, text: 'BEGIN:VCALENDAR\nEND:VCALENDAR', fetchedAt };
    if (url === FORECAST_URL) return { url, text: feed(), fetchedAt };
    const e = new Error('source_unavailable'); e.status = 403; throw e;
  } });
  assert.deepEqual(out.failures.map(f => f.name), ['BLS']);
  assert.deepEqual(out.authorities, ['BEA']);
  assert.deepEqual(out.events.map(e => e.kind).sort(), ['cpi', 'employment']);
  assert.equal(out.secondaryCount, 2);
  assert.ok(!out.events.some(e => e.kind === 'gdp')); // BEA was reachable: no secondary GDP timing
  const employment = out.events.find(e => e.kind === 'employment');
  assert.equal(employment.timeSource, 'secondary_calendar');
  const report = eventReport({ event: employment, stage: 'pre', forecasts: {}, now: Date.parse('2026-11-06T13:15:00Z') });
  assert.match(report.text, /ikincil takviminden/);
  assert.match(report.text, /yaklaşık olabilir/);
  assert.match(report.text, /resmî saat diye sunulmaz/);
});

test('a working official calendar is never supplemented or overridden by the secondary feed', async () => {
  const out = await collectEventAgenda({ now: Date.parse(fetchedAt), read: async url => {
    if (url === FORECAST_URL) throw new Error('must_not_be_read');
    return { url, text: 'BEGIN:VCALENDAR\nEND:VCALENDAR', fetchedAt };
  } });
  assert.deepEqual(out.events, []);
  assert.deepEqual(out.failures, []);
  assert.equal(out.secondaryCount, 0);
});

test('post-release verification still requires official release evidence for a secondary-timed event', () => {
  const event = { id: 'employment-2026-11-06', kind: 'employment', title: 'ABD istihdam verisi', at: '2026-11-06T13:30:00.000Z', referencePeriod: '2026-10', timeSource: 'secondary_calendar' };
  const actual = {
    eventId: event.id, eventAt: event.at, releaseDate: '2026-11-06', observedAt: '2026-11-06T13:35:00.000Z', verification: 'release_and_api',
    metrics: { payrolls: { value: 165, previous: 29, unit: 'bin kişi', referencePeriod: '2026-10' }, unemployment: { value: 4.1, previous: 4.2, unit: '%', referencePeriod: '2026-10' } },
    sources: [{ url: 'https://www.bls.gov/news.release/empsit.nr0.htm', kind: 'primary', text: 'release', fetchedAt: '2026-11-06T13:35:00.000Z' }],
  };
  assert.throws(() => eventReport({ event, stage: 'post', actual: { ...actual, sources: [{ ...actual.sources[0], url: 'https://nfs.faireconomy.media/ff_calendar_thisweek.json' }] }, now: Date.parse('2026-11-06T13:36:00Z') }), /unconfirmed/);
  const ok = eventReport({ event, stage: 'post', actual, now: Date.parse('2026-11-06T13:36:00Z') });
  assert.match(ok.text, /resmî sonuç erişimi esas alınmıştır/);
});
