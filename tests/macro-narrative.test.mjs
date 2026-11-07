import test from 'node:test';
import assert from 'node:assert/strict';
import { generateReport } from '../lib/macro/report.mjs';
import { buildReportRequest, decodeReportDraft } from '../lib/macro/generation.mjs';
import { validateReport } from '../lib/macro/report.mjs';

const cutoff = '2026-11-07T06:36:00Z';
const wire = '[development1] Ekim ayı işsizlik oranı önceki aya göre geriledi. Bu karşılaştırma işgücü piyasasının durumunu anlatıyor; gelecek aylarda aynı eğilimin süreceği anlamına gelmiyor.\n[development2] Tarım dışı istihdam önceki aya kıyasla artış gösterdi. Piyasa beklentisiyle bir karşılaştırma yapılmadığı için bu sonucu olumlu veya olumsuz sürpriz olarak nitelendirmek doğru olmaz.';
const evidence = () => ({ cutoff, events: [], calendarFailures: ['BLS'], disclosures: ['net ETF akışı doğrulanmadı'], provider: 'test', freshCount: 2, freshNewsCount: 0, sources: [
  { id: 'S1', title: 'BLS API İşsizlik oranı', kind: 'primary', topic: 'employment', referencePeriod: '2026-10', text: 'October 4.1; September 4.2', url: 'https://api.bls.gov/unemployment' },
  { id: 'S2', title: 'BLS API Tarım dışı istihdam', kind: 'primary', topic: 'employment', referencePeriod: '2026-10', text: 'October employment increased', url: 'https://api.bls.gov/employment' },
  { id: 'S3', title: 'ABD reel getiri eğrisi', kind: 'primary', instrument: 'real_yield', observedAt: '2026-11-06', previousObservedAt: '2026-11-05', currentTenYearValue: '2.63', previousTenYearValue: '2.60', comparisonDirection: 'increase', text: '2026-11-06: 2.63; 2026-11-05: 2.60', url: 'https://home.treasury.gov/yield' },
] });

test('analyst presentation is flowing prose without sources, citations, bullets or scenario labels', async () => {
  const e = evidence();
  const report = await generateReport(e, null, undefined, { complete: async () => wire, presentation: 'analyst-v1' });
  assert.equal(report.telegramFormat, 'narrative-v1');
  assert.equal(report.chunks.length, 1);
  assert.deepEqual(report.telegramEntities, []);
  assert.ok(report.text.length <= 3900);
  assert.ok(report.wordCount >= 350 && report.wordCount <= 550);
  assert.ok(!/https?:|\[S\d+\]|^•|Kaynaklar|Kaynağı aç|Destek:|Baskı:|Bozulma:|Eksikler:/m.test(report.text));
  assert.ok(!/BLS|Hazine|Farside/.test(report.text));
  assert.match(report.text, /BTC açısından/);
  assert.match(report.text, /Son karşılaştırmada reel getirinin yükselmesi/);
  assert.match(report.text, /güvenli liman talebi/);
  assert.match(report.text, /risk iştahının güçlenmesi ise otomatik olarak destek sayılmaz/);
  assert.match(report.text, /yeni haberden çok mevcut verilerin güncel değerlendirmesidir/);
  assert.equal(report.sources.length, 3);
  assert.deepEqual(report.disclosures, ['net ETF akışı doğrulanmadı', 'resmi takvim erişiminde eksik kapsam']);
});

test('hidden source display does not bypass provenance or observation-direction validation', async () => {
  const e = evidence();
  await assert.rejects(() => generateReport(e, null, undefined, { complete: async () => wire.replace('önceki aya göre geriledi', '99.8 olarak açıklandı') }), /numeric_claim/);
  const d = decodeReportDraft(wire, buildReportRequest(e), e, { presentation: 'analyst-v1' });
  d.developments[0].sourceIds = ['missing'];
  assert.throws(() => validateReport(d, e), /unknown_source/);
  e.sources[2].comparisonDirection = 'decrease';
  assert.throws(() => decodeReportDraft(wire, buildReportRequest(e), e, { presentation: 'analyst-v1' }), /invalid_observation/);
});

test('narrative gold commentary follows real-yield direction and never substitutes nominal yields', async () => {
  const e = evidence();
  e.sources[2].currentTenYearValue = '2.57';
  e.sources[2].comparisonDirection = 'decrease';
  let report = await generateReport(e, null, undefined, { complete: async () => wire, presentation: 'analyst-v1' });
  assert.match(report.text, /reel getirinin gerilemesi/);
  e.sources[2].instrument = 'nominal_yield';
  e.sources[2].title = 'ABD nominal getiri eğrisi';
  report = await generateReport(e, null, undefined, { complete: async () => wire, presentation: 'analyst-v1' });
  assert.ok(!report.text.includes('Son karşılaştırmada reel getirinin gerilemesi'));
  assert.match(report.text, /Spot altında asıl ayrım nominal faizden çok reel faizin/);
});
