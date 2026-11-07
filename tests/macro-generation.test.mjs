import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReportRequest, decodeReportDraft, selectReportSources, parseReportProse, proseFields, qualitativeContext } from '../lib/macro/generation.mjs';
import { generateReport } from '../lib/macro/report.mjs';
import { researchCutoff, sourceFreshness, groq } from '../lib/macro/research.mjs';

const cutoff = '2026-11-05T06:00:00Z';
const source = (id, title, text = 'Kaynakta verilen gözlem 4.25 oranıdır.') => ({ id, title, text, kind: 'primary', publishedAt: cutoff, url: 'https://www.treasury.gov/' + id });
const evidence = () => ({ cutoff, sources: [source('S1', 'Makro haber'), source('S2', 'İkinci makro haber'), source('S3', 'Üçüncü makro haber')], events: [], calendarFailures: [], disclosures: [], provider: 'test', freshCount: 3 });
const paragraph = 'Doğrulanan veri piyasa beklentisiyle birlikte değerlendirilmeli çünkü dolar faiz likidite ve risk iştahı kanalları farklı yönlerde çalışabilir; gözlemler koşullu yorumlanmalıdır. Beklenti karşılaştırması ayrıca doğrulanmalıdır.';
const prose = () => proseFields.map(k => '[' + k + '] ' + paragraph).join('\n');

test('plain-prose request binds sections to real sources and sends each source only once', () => {
  const e = evidence();
  const request = buildReportRequest(e);
  assert.equal(request.schema, undefined);
  const supplied = JSON.parse(request.messages[1].content);
  assert.equal(supplied.sources[0].text, qualitativeContext(e.sources[0].text));
  assert.ok(!/\d/.test(supplied.sources[0].text));
  assert.ok(e.sources[0].text.includes('4.25'));
  assert.equal(supplied.sources[0].observedAt, undefined);
  assert.equal(supplied.sections.development3, undefined);
  assert.deepEqual(request.bindings.development3.map(s => s.id), ['S3']);
  assert.deepEqual(request.bindings.development1.map(s => s.id), ['S1']);
});

test('parser accepts multiline prose but rejects duplicates, absent sections and invented metadata', () => {
  const raw = prose();
  assert.equal(parseReportProse(raw).development2, paragraph);
  assert.equal(parseReportProse(raw.replace('[development2] ', '[development2]\n')).development2, paragraph);
  for (const bad of [raw + '\n[development2] ' + paragraph, raw.replace('[development2]', '[election]'), '```\n' + raw, raw.replace('[development2]', '[development2] [S99]'), '{}', 'unlabeled\n' + raw]) {
    assert.throws(() => parseReportProse(bad), /invalid_prose|missing_sections/);
  }
  assert.throws(() => parseReportProse(null), /invalid_prose/);
  assert.throws(() => parseReportProse('x'.repeat(24001)), /invalid_prose/);
});

test('source dates never become invented observation or event times', () => {
  const e = evidence();
  e.sources.forEach(s => { s.publishedAt = '2026-10-28T18:00:00Z'; });
  const d = decodeReportDraft(prose(), buildReportRequest(e), e);
  assert.equal(d.developments[0].asOf, null);
  assert.equal(d.developments[0].eventAt, null);
  assert.match(d.developments[0].text, /^Arka plan bülteni:/);
  assert.equal(d.conditionalFramework, true);
  assert.match(d.btc.support.text, /^Genişleyen likidite/);
  e.sources[2].observedAt = '2026-11-04';
  const dated = decodeReportDraft(prose(), buildReportRequest(e), e);
  assert.equal(dated.developments[2].asOf, null); // No numeric observation is quoted.
});

test('research cutoff follows collection and cannot be advanced by a future source clock', () => {
  const start = Date.parse(cutoff), finish = start + 12000;
  assert.equal(researchCutoff(start, [{ fetchedAt: new Date(start + 9000).toISOString() }], finish), new Date(finish).toISOString());
  assert.throws(() => researchCutoff(start, [{ fetchedAt: new Date(finish + 1).toISOString() }], finish), /invalid_observation_time/);
  assert.throws(() => researchCutoff(start, [], start - 1), /invalid_cutoff/);
});

test('freshness uses collection cutoff, separating live observations from newly published news', () => {
  const started = '2026-11-06T19:20:00Z';
  const ended = '2026-11-06T19:20:12Z';
  const quote = { kind: 'market', observedAt: '2026-11-06T19:20:08Z', fetchedAt: '2026-11-06T19:20:09Z' };
  assert.equal(sourceFreshness([quote], started).freshCount, 0);
  assert.deepEqual(sourceFreshness([quote], ended), { freshCount: 1, freshNewsCount: 0 });
  const old = { kind: 'primary', publishedAt: '2026-11-04T18:00:00Z', fetchedAt: ended };
  const undated = { kind: 'primary', referencePeriod: '2026-10', fetchedAt: ended };
  assert.deepEqual(sourceFreshness([old, undated], ended), { freshCount: 0, freshNewsCount: 0 });
  const future = { kind: 'market', observedAt: '2026-11-06T19:21:00Z' };
  assert.equal(sourceFreshness([future], ended).freshCount, 0);
  const news = { kind: 'primary', publishedAt: '2026-11-06T18:00:00Z' };
  assert.deepEqual(sourceFreshness([quote, news], ended), { freshCount: 2, freshNewsCount: 1 });
  const localStatus = { kind: 'primary', updatedAt: '2026-11-06', electionScope: 'Solano County, California only' };
  assert.equal(sourceFreshness([localStatus], ended).freshNewsCount, 0);
  const index = { kind: 'primary', title: 'Major Economic Indicators Latest Numbers', publishedAt: ended };
  assert.equal(sourceFreshness([index], ended).freshNewsCount, 0);
});

test('source selection caps citations while retaining official calendar provenance', () => {
  const e = evidence();
  e.sources.push(source('R', 'ABD reel getiri'), source('N', 'ABD nominal getiri'), source('B', 'Coinbase spot'), source('G', 'XAUUSD spot'), source('C', 'BLS resmi yayın takvimi'));
  e.events = [{ id: 'event', sourceId: 'C', at: '2026-11-06T13:30:00Z', title: 'Release' }];
  const ids = selectReportSources(e).map(s => s.id);
  for (const id of ['R', 'B', 'G', 'C']) assert.ok(ids.includes(id));
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.length <= 6);
  e.events[0].sourceId = 'invented';
  assert.throws(() => selectReportSources(e), /unknown_source/);
});
test('fresh policy news outranks repeating the latest monthly employment data',()=>{
  const e=evidence();e.cutoff='2026-11-07T06:00:00Z';
  e.sources.push({...source('P','BLS API Tarım dışı istihdam'),topic:'employment',referencePeriod:'2026-10',publishedAt:null});
  e.sources.push({...source('U','BLS API İşsizlik oranı'),topic:'employment',referencePeriod:'2026-10',publishedAt:null});
  e.sources.push({...source('F','FOMC monetary policy statement'),publishedAt:'2026-11-06T20:00:00Z'});
  const request=buildReportRequest(e);
  assert.deepEqual(request.bindings.development1.map(s=>s.id),['F']);
});

test('generation validates prose once, with application-owned citations and report structure', async () => {
  let calls = 0;
  const complete = async (_messages, opts) => { calls++; assert.equal(opts.format, 'text'); assert.equal(opts.schema, undefined); return prose(); };
  const report = await generateReport(evidence(), null, undefined, { complete });
  assert.ok(report.wordCount >= 150 && report.wordCount <= 200);
  assert.equal(report.sources.length, 3);
  assert.equal(calls, 1);
  assert.ok(report.text.includes('net bir makro üstünlük yok'));
  assert.ok(!report.text.includes('[S'));
  assert.equal(report.telegramFormat, 'narrative-v1');
});

test('model numbers, URLs and trading instructions still fail closed without dropping offending sentences', async () => {
  const e = evidence();
  e.sources[2].observedAt = '2026-11-04';
  const replacing = text => prose().replace('[development1] ' + paragraph, '[development1] ' + text);
  await assert.rejects(() => generateReport(e, null, undefined, { complete: async () => replacing('Kaynakta bulunmayan getiri 99.8 olarak kaydedildi.') }), /prose_numeric_claim/);
  await assert.rejects(() => generateReport(evidence(), null, undefined, { complete: async () => replacing('Kaynakta belirtilen getiri 4.25 olarak kaydedildi.') }), /prose_numeric_claim/);
  await assert.rejects(() => generateReport(e, null, undefined, { complete: async () => replacing('Kaynak adresi https://evil.test adresinde bulunabilir.') }), /inline_url/);
  await assert.rejects(() => generateReport(e, null, undefined, { complete: async () => replacing('Bu haber nedeniyle pozisyon aç ve riskini artır talimatı.') }), /trade_instruction/);
  await assert.rejects(() => generateReport(e, null, undefined, { complete: async () => replacing('Bitcoin için güçlü bir direnç bölgesi gözlemledim.') }), /trade_instruction/);
});

test('asset polarity and independent confirmation are code-owned, not selected by model prose', () => {
  const e = evidence();
  const d = decodeReportDraft(prose(), buildReportRequest(e), e);
  assert.match(d.gold.support.text, /Gerileyen reel faiz/);
  assert.match(d.gold.pressure.text, /Yükselen reel faiz/);
  assert.match(d.gold.confirm.text, /bağımsız verilerle doğrulanması/);
  assert.match(d.btc.invalidate.text, /Daralan likidite/);
  assert.match(d.developments[2].text, /yön veya trend değişimi çıkarılamaz/);
  assert.equal(proseFields.length, 2);
  assert.match(d.channels[0].text, /Risk iştahı artışı altın için otomatik destek değildir/);
  assert.match(d.channels[0].text, /güvenli liman talebi ayrıca/);
});

test('rejected live risk-appetite paragraph cannot reenter the model protocol or summaries', async () => {
  const rejected = 'İstihdam iyileşmesi dolar ve faiz baskısını artırabilir; likidite genişlemesi BTC ve spot altın üzerinde olumlu bir risk iştahı etkisi yaratabilir.';
  assert.throws(() => parseReportProse(prose() + '\n[channels] ' + rejected), /invalid_prose/);
  for (const text of [rejected, 'Risk iştahı artışı spot altını destekleyen bir etki yaratır.', 'Bitcoin için doğrudan destekleyici etki beklenebilir.', 'XAUUSD üzerinde olumlu fiyat tepkisi görülüyor.']) {
    let calls = 0;
    await assert.rejects(() => generateReport(evidence(), null, undefined, { complete: async () => {
      calls++;
      return prose().replace('[development1] ' + paragraph, '[development1] ' + text);
    } }), /prose_asset_commentary/);
    assert.equal(calls, 1);
  }
  const request = buildReportRequest(evidence());
  const sections = JSON.parse(request.messages[1].content).sections;
  assert.deepEqual(Object.keys(sections), ['development1', 'development2']);
  const d = decodeReportDraft(prose(), request, evidence());
  assert.match(d.channels[0].text, /Faiz\/dolar sıkılaşması BTC’yi baskılayabilir/);
  assert.match(d.channels[0].text, /Gerileyen reel faiz\/zayıf dolar altını destekleyebilir/);
  assert.match(d.channels[0].text, /Kısa tepki haftalık politikadan ayrılır/);
  assert.deepEqual(d.channels[0].sourceIds, request.bindings.channels.map(s => s.id));
});

test('numeric context is removed before model input without altering the underlying evidence', () => {
  const raw = 'BTC 76\u202f073 USD; getiri 2,64%; tarih 2026-11-05T09:30:00Z';
  const cleaned = qualitativeContext(raw);
  assert.ok(!/\d/.test(cleaned));
  assert.ok(raw.includes('76\u202f073'));
});

test('observations-only previews cannot silently fall back to a model call',async()=>{
  let calls=0;
  await assert.rejects(()=>generateReport(evidence(),null,undefined,{requireObservations:true,complete:async()=>{calls++;return prose();}}),/structured_observations_missing/);
  assert.equal(calls,0);
});

test('malformed prose is retained privately for replay and never returned as a valid report', async () => {
  const e = evidence();
  await assert.rejects(() => generateReport(e, null, undefined, { complete: async () => '[development1] Incomplete response.' }), caught => {
    assert.equal(caught.diagnostic.format, 'prose-v5');
    assert.equal(caught.diagnostic.evidence, e);
    assert.equal(caught.diagnostic.draft, '[development1] Incomplete response.');
    return true;
  });
});

test('plain model transport sends no JSON response_format and never retries or accepts truncation', async t => {
  const oldFetch = global.fetch, oldKey = process.env.GROQ_API_KEY;
  process.env.GROQ_API_KEY = 'test-only';
  t.after(() => { global.fetch = oldFetch; if (oldKey === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = oldKey; });
  let calls = 0, request;
  global.fetch = async (_url, init) => { calls++; request = JSON.parse(init.body); return { ok: true, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: prose() } }] }) }; };
  assert.equal(await groq([], { format: 'text' }), prose());
  assert.equal(request.response_format, undefined);
  assert.equal(request.tools, undefined);
  assert.equal(calls, 1);
  await assert.rejects(() => groq([], { format: 'text', schema: {} }), /invalid_format/);
  assert.equal(calls, 1);
  global.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ finish_reason: 'length', message: { content: prose() } }] }) });
  await assert.rejects(() => groq([], { format: 'text' }), /truncated/);
});
