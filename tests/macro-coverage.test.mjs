import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBlsCalendarHTML, parseIbitHoldings, parseCaliforniaStage, parseSolanoStage, parseFarsideFlows, previousNewYorkWeekday, collectCoverage } from '../lib/macro/coverage.mjs';
import { istanbul } from '../lib/macro/core.mjs';
import { buildReportRequest, decodeReportDraft, proseFields } from '../lib/macro/generation.mjs';
import { validateReport } from '../lib/macro/report.mjs';
import { yieldComparison } from '../lib/macro/research.mjs';

const NOW = Date.parse('2026-11-06T06:00:00Z');
const row = (date, time, title) => `<tr><td>${date}</td><td>${time}</td><td><strong>${title}</strong></td></tr>`;
const calendar = rows => `<table class="release-list"><tbody>${rows}</tbody></table><p>NOTE: All times on calendar are Eastern Time.</p>`;
const holdings = `iShares Bitcoin Trust ETF\nFund Holdings as of,"Nov 05, 2026"\nShares Outstanding,"1,418,160,000.00"\n\nTicker,Name,Sector,Asset Class,Market Value,Weight (%),Notional Value,Quantity,Market Currency\n"BTC","BITCOIN","-","Alternative","61,162,095,916.21","100.00","61,162,095,916.21","801,241.17280","BTC"\n`;
const election = '<h1>California Secretary of State</h1><p>November 3, 2026</p><h2>Unofficial Election Results</h2><p>The Secretary will certify results on December 11, 2026.</p><a>Certified List of Candidates</a>';
const county = '<h1>Solano County</h1><p>November 3, 2026</p><h2>Unofficial Election Results</h2><p>Last updated: November 5, 2026 at 4:47 PM</p>';

test('yield direction uses two dated official observations and rejects changed order or invalid latest values', () => {
  const csv = 'Date,"10 Yr"\n11/05/2026,2.74\n11/04/2026,2.64';
  assert.deepEqual(yieldComparison(csv, NOW), { previousObservedAt: '2026-11-04', currentTenYearValue: '2.74', previousTenYearValue: '2.64', comparisonDirection: 'increase' });
  assert.equal(yieldComparison(csv.replace('2.74', '2.54'), NOW).comparisonDirection, 'decrease');
  assert.equal(yieldComparison(csv.replace('2.74', '2.64'), NOW).comparisonDirection, 'unchanged');
  assert.equal(yieldComparison('Date,"10 Yr"\n11/05/2026,2.74', NOW), null);
  assert.throws(() => yieldComparison(csv.replace('2.74', 'N/A'), NOW), /comparison_invalid/);
  assert.throws(() => yieldComparison(csv.replace('11/05/2026', '11/07/2026'), NOW), /comparison_invalid/);
  assert.throws(() => yieldComparison(csv.replace('11/04/2026', '11/06/2026'), NOW), /order_changed/);
});

test('code-owned yield comparison keeps real versus nominal distinct and verifies stored direction', () => {
  const e = { cutoff: new Date(NOW).toISOString(), events: [], sources: [
    { id: 'N1', kind: 'primary', title: 'Employment release', text: 'Official news' },
    { id: 'N2', kind: 'primary', title: 'Treasury refunding', text: 'Official news' },
    { id: 'Y', kind: 'primary', title: 'ABD reel getiri eğrisi', instrument: 'real_yield', observedAt: '2026-11-05', previousObservedAt: '2026-11-04', currentTenYearValue: '2.74', previousTenYearValue: '2.64', comparisonDirection: 'increase', text: 'Dated observations' },
  ] };
  const prose = proseFields.map(k => '[' + k + '] Kaynakların makro etkisi koşullu değerlendirilmeli; piyasa tepkisi tek başına nedensellik kanıtı sayılmaz.').join('\n');
  const d = decodeReportDraft(prose, buildReportRequest(e), e);
  assert.match(d.developments[2].text, /2026-11-05 kesitinde on yıllık reel getiri, 2026-11-04 gözlemine göre yükseldi/);
  e.sources[2].instrument = 'nominal_yield';
  assert.match(decodeReportDraft(prose, buildReportRequest(e), e).developments[2].text, /on yıllık nominal getiri/);
  e.sources[2].comparisonDirection = 'decrease';
  assert.throws(() => decodeReportDraft(prose, buildReportRequest(e), e), /invalid_observation/);
});

test('official HTML calendar converts New York winter/summer clocks and ignores untimed holidays', () => {
  const parsed = parseBlsCalendarHTML(calendar(row('Friday, November 06, 2026', '08:30 AM', 'Employment Situation for October 2026') + row('Friday, November 06, 2026', '', 'Holiday')), 'C', NOW);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].at, '2026-11-06T13:30:00.000Z');
  assert.match(istanbul(parsed[0].at), /16:30/);
  const summer = parseBlsCalendarHTML(calendar(row('Thursday, July 02, 2026', '08:30 AM', 'Employment Situation')), 'C', Date.parse('2026-07-02T06:00:00Z'));
  assert.equal(summer[0].at, '2026-07-02T12:30:00.000Z');
  assert.throws(() => parseBlsCalendarHTML(calendar('').replace('Eastern Time', 'Local time'), 'C', NOW), /timezone_missing/);
});

test('calendar retains recent scheduled releases separately from future events without claiming actual publication', () => {
  const parsed = parseBlsCalendarHTML(calendar(row('Friday, November 06, 2026', '08:30 AM', 'Employment Situation') + row('Tuesday, November 10, 2026', '08:30 AM', 'CPI')), 'C', Date.parse('2026-11-06T14:00:00Z'));
  assert.equal(parsed.length, 1);
  assert.ok(Date.parse(parsed[0].at) < Date.parse('2026-11-06T14:00:00Z'));
  assert.equal(parseBlsCalendarHTML(calendar(row('Friday, November 31, 2026', '08:30 AM', 'Bad date')), 'C', NOW).length, 0);
  assert.equal(parseBlsCalendarHTML(calendar(row('Friday, November 06, 2026', '25:30 PM', 'Bad clock')), 'C', NOW).length, 0);
});

test('issuer CSV preserves quoted numeric fields and never labels holdings as net flows', () => {
  const parsed = parseIbitHoldings(holdings, NOW);
  assert.equal(parsed.asOf, '2026-11-05');
  assert.equal(parsed.sharesOutstanding, '1,418,160,000.00');
  assert.equal(parsed.bitcoinQuantity, '801,241.17280');
  assert.equal(parsed.kind, 'holdings_not_flows');
  assert.equal(parsed.scope, 'IBIT only');
  assert.equal(parsed.netFlows, undefined);
  assert.throws(() => parseIbitHoldings(holdings.replace('Nov 05, 2026', 'Nov 07, 2026'), NOW), /date_invalid/);
  assert.throws(() => parseIbitHoldings(holdings.replace('801,241.17280', 'NaN'), NOW), /values_invalid/);
  assert.throws(() => parseIbitHoldings(holdings.replace('iShares Bitcoin Trust ETF', 'Another fund'), NOW), /identity_missing/);
});

test('official state status stays preliminary despite future certification and certified candidate links', () => {
  const parsed = parseCaliforniaStage(election);
  assert.equal(parsed.stage, 'preliminary');
  assert.equal(parsed.scope, 'California only');
  assert.ok(parsed.text.includes('ülke geneli'));
  assert.throws(() => parseCaliforniaStage(election.replace('2026</p>', '2024</p>')), /unverified/);
  assert.throws(() => parseCaliforniaStage(election.replace('Unofficial Election Results', 'Certified List of Candidates')), /unverified/);
  assert.throws(() => parseCaliforniaStage(election, Date.parse('2026-11-02')), /unverified/);
});

test('county fallback retains local scope and never invents an unspecified timezone for update time', async () => {
  const p = parseSolanoStage(county);
  assert.equal(p.scope, 'Solano County, California only');
  assert.equal(p.updatedAt, '2026-11-05');
  assert.ok(!p.updatedAt.includes('T'));
  assert.throws(() => parseSolanoStage(county.replace('November 5, 2026', 'November 8, 2026'), NOW), /date_invalid/);
  const out = await collectCoverage({ now: NOW, readSource: async url => {
    if (url.includes('apnews.com')) throw new Error('source_unavailable');
    return { url, fetchedAt: new Date(NOW).toISOString(), text: url.includes('solanocounty') ? county : url.includes('ishares') ? holdings : 'Request unsuccessful. Incapsula incident ID: example' };
  } });
  assert.equal(out.election.scope, 'Solano County, California only');
  assert.ok(out.sources.find(s => s.electionScope).url.includes('solanocounty.gov'));
  assert.ok(out.attempts.some(a => a.name === 'California' && a.error === 'source_access_challenge'));
});

test('coverage uses fresh HTTP reads and records AP failure without model calls or false corroboration', async () => {
  const calls = [];
  const out = await collectCoverage({ now: NOW, readSource: async url => {
    calls.push(url);
    if (url.includes('apnews.com')) { const e = new Error('source_unavailable'); e.status = 403; throw e; }
    return { url, fetchedAt: new Date(NOW).toISOString(), text: url.includes('ishares.com') ? holdings : election };
  } });
  assert.equal(calls.length, 4);
  assert.equal(out.sources.length, 2);
  assert.equal(out.election.stage, 'preliminary');
  assert.equal(out.etf.kind, 'holdings_not_flows');
  assert.ok(out.attempts.some(a => a.name === 'AP' && a.status === 403));
  assert.equal(out.sources.find(s => s.kind === 'issuer').publishedAt, null);
});

const flowRow = (day, values) => '<tr><td>' + day + '</td>' + values.map(v => '<td>' + v + '</td>').join('') + '</tr>';
const flowTable = rows => '<h1>Bitcoin ETF Flow (US$m)</h1><table><tr><th></th><th>Blackrock</th><th>Fidelity</th><th>Grayscale</th><th>Total</th></tr><tr><td></td><td>IBIT</td><td>FBTC</td><td>GBTC</td><td></td></tr>' + rows + '</table>';
const completeFlow = flowRow('05 Nov 2026', ['(105.0)', '(199.9)', '(49.9)', '(354.8)']);

test('dated secondary flow table excludes today and never turns pending dashes into zero', () => {
  const parsed = parseFarsideFlows(flowTable(completeFlow + flowRow('06 Nov 2026', ['-', '-', '-', '0.0'])), NOW);
  assert.equal(parsed.asOf, '2026-11-05');
  assert.equal(parsed.totalUSDM, -354.8);
  assert.equal(parsed.direction, 'outflow');
  assert.equal(parsed.kind, 'third_party_net_flows');
  assert.equal(parsed.scope, 'Farside table constituents');
  assert.equal(parsed.fundCount, 3);
});

test('latest incomplete, old, ambiguous or inconsistent flows fail closed without older-row fallback', () => {
  const old = flowRow('04 Nov 2026', ['10.0', '20.0', '30.0', '60.0']);
  assert.throws(() => parseFarsideFlows(flowTable(old + flowRow('05 Nov 2026', ['-', '20.0', '30.0', '50.0'])), NOW), /latest_incomplete/);
  assert.throws(() => parseFarsideFlows(flowTable(old), NOW), /not_latest_weekday/);
  assert.throws(() => parseFarsideFlows(flowTable(completeFlow.replace('(354.8)', '(999.0)')), NOW), /total_mismatch/);
  assert.throws(() => parseFarsideFlows(flowTable(completeFlow + completeFlow), NOW), /duplicate_day/);
  assert.throws(() => parseFarsideFlows(flowTable(completeFlow.replace('(105.0)', '1,23.0')), NOW), /latest_incomplete/);
});

test('previous-weekday check uses New York civil date, not Istanbul or UTC date, and does not guess holidays', () => {
  assert.equal(previousNewYorkWeekday(Date.parse('2026-11-07T02:00:00Z')), '2026-11-05'); // Still Friday in New York.
  assert.equal(previousNewYorkWeekday(Date.parse('2026-11-09T07:00:00Z')), '2026-11-06');
  assert.throws(() => parseFarsideFlows(flowTable(flowRow('25 Nov 2026', ['1.0', '2.0', '3.0', '6.0'])), Date.parse('2026-11-27T07:00:00Z')), /not_latest_weekday/);
});

test('complete secondary flows are optional, clearly labeled and never substituted by issuer holdings', async () => {
  const out = await collectCoverage({ now: NOW, readSource: async url => ({ url, fetchedAt: new Date(NOW).toISOString(), text: url.includes('farside') ? flowTable(completeFlow) : url.includes('ishares') ? holdings : election }) });
  assert.equal(out.etf.kind, 'holdings_not_flows');
  assert.equal(out.etfFlows.kind, 'third_party_net_flows');
  assert.notEqual(out.etf.sourceId, out.etfFlows.sourceId);
  const s = out.sources.find(s => s.id === out.etfFlows.sourceId);
  assert.equal(s.kind, 'secondary');
  assert.equal(s.publishedAt, null);
  assert.equal(s.observedAt, '2026-11-05');
});

test('calendar, scoped election and optional issuer coverage fit the source cap without entering model prose', () => {
  const sources = [
    { id: 'N1', kind: 'primary', title: 'Employment release', text: 'Official statement', publishedAt: new Date(NOW).toISOString() },
    { id: 'N2', kind: 'primary', title: 'Treasury refunding statement', text: 'Official statement', publishedAt: new Date(NOW).toISOString() },
    { id: 'Y', kind: 'primary', title: 'ABD reel getiri eğrisi', text: 'Observed levels' },
    { id: 'C', kind: 'primary', title: 'BLS resmi yayın takvimi', text: 'Official clock' },
    { id: 'E', kind: 'primary', title: 'California geçici sonuçları', text: election, electionStage: 'preliminary', electionScope: 'California only' },
    { id: 'I', kind: 'issuer', title: 'IBIT varlık kesiti', text: 'Holdings, not flows', observedAt: '2026-11-05' },
    { id: 'B', kind: 'market', title: 'Coinbase spot', text: 'Spot quote' },
  ].map(s => ({ ...s, url: 'https://www.treasury.gov/' + s.id }));
  const e = { cutoff: new Date(NOW).toISOString(), sources, events: [{ id: 'event', sourceId: 'C', at: '2026-11-06T13:30:00Z', title: 'Employment Situation' }], election: { ...parseCaliforniaStage(election), sourceIds: ['E'], eventAt: null, asOf: null }, etf: { sourceId: 'I', asOf: '2026-11-05' }, calendarFailures: [], disclosures: [], provider: 'test', freshCount: 2 };
  const request = buildReportRequest(e);
  assert.equal(request.sources.length, 6);
  const supplied = JSON.parse(request.messages[1].content);
  assert.ok(!supplied.sources.some(s => ['E', 'I', 'C'].includes(s.id)));
  const prose = proseFields.map(k => '[' + k + '] Kaynakların piyasa etkisi koşullu değerlendirilmeli; dolar faiz likidite ve risk iştahı kanalları çelişebilir, gerçek tepki ayrıca doğrulanmalıdır.').join('\n');
  const d = decodeReportDraft(prose, request, e);
  assert.equal(d.etfSourceId, 'I');
  const report = validateReport(d, e);
  assert.ok(report.text.includes('Durum özeti (yeni olay iddiası değil)'));
  assert.ok(report.text.includes('günlük net akış veya tüm spot ETF pazarı toplamı değildir'));
  assert.ok(report.text.includes('veri: 2026-11-05'));
  assert.equal(report.sources.length, 6);
  const bad = structuredClone(d); bad.election.stage = 'certified';
  assert.throws(() => validateReport(bad, e), /not_certified/);
  const wrongScope = structuredClone(d); wrongScope.election.scope = 'US nationwide';
  assert.throws(() => validateReport(wrongScope, e), /scope_unverified/);
  e.cutoff = '2026-11-06T14:00:00Z';
  e.recentEvents = e.events; e.events = [];
  const recent = decodeReportDraft(prose, buildReportRequest(e), e);
  const reviewed = validateReport(recent, e);
  assert.match(reviewed.text, /Yakın takvim:/);
  assert.match(reviewed.text, /tek başına gerçekleşmiş yayın teyidi değildir/);
  e.recentEvents[0].at = '2026-11-06T14:01:00Z';
  assert.throws(() => validateReport(recent, e), /unverified_event/);
  e.recentEvents[0].at = '2026-11-06T13:30:00Z';
  e.sources.push({ id: 'F', kind: 'secondary', flowType: 'spot_btc_etf_net_flows', flowDirection: 'outflow', title: 'Farside — ikincil kaynak', text: '2026-11-05 total -354.8 million USD', observedAt: '2026-11-05', url: 'https://farside.co.uk/btc/' });
  e.etfFlows = { sourceId: 'F' };
  const flowDraft = decodeReportDraft(prose, buildReportRequest(e), e);
  const flowReport = validateReport(flowDraft, e);
  assert.equal(flowDraft.etfSourceId, 'F');
  assert.ok(flowReport.text.includes('2026-11-05 tarihli ikincil tablosu net çıkış'));
  assert.ok(!flowReport.text.includes('İhraççı varlık ve pay kesiti yalnız tek fonu gösterir'));
  assert.equal(flowReport.sources.length, 6);
});

test('employment observations are prioritized only when the API actually has the expected reference month', () => {
  const cutoff = '2026-11-06T14:00:00Z';
  const sources = [
    { id: 'N1', title: 'Treasury refunding', kind: 'primary', text: 'Background', publishedAt: '2026-11-05' },
    { id: 'N2', title: 'Another official release', kind: 'primary', text: 'Background', publishedAt: '2026-11-05' },
    { id: 'Y', title: 'ABD reel getiri eğrisi', kind: 'primary', text: 'Levels' },
    { id: 'P', title: 'BLS API Tarım dışı istihdam', kind: 'primary', topic: 'employment', referencePeriod: '2026-10', publishedAt: null, text: 'Current and previous API values', comparisonText: 'Hesaplanan artış' },
    { id: 'U', title: 'BLS API İşsizlik oranı', kind: 'primary', topic: 'employment', referencePeriod: '2026-10', publishedAt: null, text: 'Current and previous API values', comparisonText: 'Hesaplanan düşüş' },
  ].map(s => ({ ...s, url: 'https://api.bls.gov/' + s.id }));
  const e = { cutoff, sources, events: [], recentEvents: [] };
  let request = buildReportRequest(e);
  assert.deepEqual(request.bindings.development1.map(s => s.id), ['P']);
  assert.deepEqual(request.bindings.development2.map(s => s.id), ['U']);
  const supplied = JSON.parse(request.messages[1].content);
  assert.equal(supplied.sources.find(s => s.id === 'P').comparisonText, 'Hesaplanan artış');
  e.sources.find(s => s.id === 'P').referencePeriod = '2026-09';
  e.sources.find(s => s.id === 'U').referencePeriod = '2026-09';
  request = buildReportRequest(e);
  assert.ok(!request.bindings.development1.some(s => s.topic === 'employment'));
});
