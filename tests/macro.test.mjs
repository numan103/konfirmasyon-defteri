import test from 'node:test';
import assert from 'node:assert/strict';
import { dayKey, hash, isDue, zonedUTC, calendarEvents, splitTelegram, singleTelegram, publicUrl } from '../lib/macro/core.mjs';
import { validateReport } from '../lib/macro/report.mjs';
import { numberVariants, marketNumbers } from '../lib/macro/report.mjs';
import { reportSchema } from '../lib/macro/report.mjs';
import { macroService } from '../lib/macro/job.mjs';
import macroHandler from '../lib/macro/handler.mjs';
import { readSource } from '../lib/macro/research.mjs';
import { groq } from '../lib/macro/research.mjs';
import { sourceDate, parseDateValue } from '../lib/macro/research.mjs';
import { xmlItems, listingItems, csvHead, usDate } from '../lib/macro/research.mjs';
import { sendTelegram } from '../lib/telegram.mjs';
import { macroStore } from '../lib/macro/store.mjs';

const NOW = Date.parse('2026-11-05T06:00:00Z');
const target = { chatId: 'private-test-target', threadId: null, public: { name: 'Test hedefi', type: 'channel', targetHash: 'target-hash', warning: null } };
const draft = () => ({ cutoff: new Date(NOW).toISOString(), reportHash: 'report-hash', chunks: ['İlk parça'], text: 'Önizleme' });
function memoryStore({ enabled = false, failSave = 0 } = {}) {
  let row = null, revision = 0, saves = 0;
  let settings = { revision: 's0', payload: { enabled, approvedTargetHash: enabled ? 'target-hash' : null, testedTargetHash: enabled ? 'target-hash' : null } };
  const copy = v => v ? structuredClone(v) : null;
  return {
    read: async () => copy(row),
    create: async (day, payload) => { if (row) return null; row = { report_date: day, revision: 'r' + ++revision, payload: copy(payload) }; return copy(row); },
    save: async (old, payload) => {
      if (old.revision !== row.revision) throw new Error('macro_conflict');
      if (++saves === failSave) throw new Error('macro_storage_unavailable');
      row = { ...row, revision: 'r' + ++revision, payload: copy(payload) }; return copy(row);
    },
    previous: async () => null,
    settings: async () => copy(settings),
    saveSettings: async (old, payload) => { if (old.revision !== settings.revision) throw new Error('macro_conflict'); settings = { revision: 's' + ++revision, payload: copy(payload) }; return copy(settings); },
  };
}
function service(store, extras = {}) {
  return macroService({ store, clock: () => NOW, target: async () => target, research: async () => ({}), generate: async () => draft(), ...extras });
}
function modelKey(t) {
  const old = process.env.GROQ_API_KEY;
  process.env.GROQ_API_KEY = 'test-only';
  t.after(() => { if (old === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = old; });
}

test('failure diagnostics persist privately and can never be mistaken for a deliverable report', async t => {
  modelKey(t);
  const store = memoryStore();
  let sent = 0;
  const diagnostic = { format: 'flat-v1', draft: { invalid: true }, evidence: { sources: [] }, failure: 'model_invalid_json' };
  const svc = service(store, {
    generate: async () => { const e = new Error('model_invalid_json'); e.diagnostic = diagnostic; throw e; },
    send: async () => { sent++; },
    modelAvailability: async () => ({ available: true }),
  });
  await assert.rejects(() => svc.preview(), /model_invalid_json/);
  const row = await store.read();
  assert.equal(row.payload.phase, 'research_failed');
  assert.equal(row.payload.report, undefined);
  assert.deepEqual((await svc.failureDiagnostic()).diagnostic, diagnostic);
  const status = await svc.status();
  assert.equal(status.report.report, null);
  assert.equal(status.report.diagnostic, undefined);
  await assert.rejects(() => svc.testSend({ confirmSend: true }), /confirmation_required/);
  assert.equal(sent, 0);
});

test('editorial rejection blocks a cached report and preserves its audit copy on the next bounded attempt', async t => {
  modelKey(t);
  const store = memoryStore();
  const svc = service(store);
  await svc.preview();
  const ready = await store.read();
  await store.save(ready, { ...ready.payload, phase: 'research_failed', report: null, rejectedReport: ready.payload.report, earlierRejectedReport: { reportHash: 'earlier' }, rejectedReportHistory: [{ reportHash: 'archived' }], maintenanceReason: 'Explicit manual review', preModelRefund: true, preModelRefundReason: 'cutoff_boundary_bug_pre_model', reviewReason: 'Editorial rejection' });
  await assert.rejects(() => svc.testSend({ confirmSend: true, reportHash: 'report-hash', targetHash: 'target-hash' }), /confirmation_required/);
  await svc.preview();
  const retried = await store.read();
  assert.equal(retried.payload.attempts, 2);
  assert.equal(retried.payload.rejectedReport.reportHash, 'report-hash');
  assert.equal(retried.payload.reviewReason, 'Editorial rejection');
  assert.equal(retried.payload.earlierRejectedReport.reportHash, 'earlier');
  assert.deepEqual(retried.payload.rejectedReportHistory, [{ reportHash: 'archived' }]);
  assert.equal(retried.payload.maintenanceReason, 'Explicit manual review');
  assert.equal(retried.payload.preModelRefund, true);
  assert.equal(retried.payload.preModelRefundReason, 'cutoff_boundary_bug_pre_model');
});

test('single test sends once with correctly shifted source links and durable acknowledgement', async t => {
  modelKey(t);
  const sources = [{ url: 'https://www.bls.gov/test' }];
  const text = '🔎 Rapor\nKaynak\n' + sources[0].url;
  const telegram = singleTelegram(text, sources);
  const report = { ...draft(), text, sources, chunks: [telegram.text], telegramFormat: 'single-v1' };
  const store = memoryStore();
  const calls = [];
  const svc = service(store, { generate: async () => report, send: async (...args) => { calls.push(args); return { ok: true, result: { message_id: 123 } }; } });
  await svc.preview();
  assert.deepEqual(await svc.testSend({ confirmSend: true, reportHash: report.reportHash, targetHash: 'target-hash' }), { phase: 'sent', parts: 1 });
  assert.equal(calls.length, 1);
  const [sentText, , , , options] = calls[0];
  assert.ok(sentText.startsWith('TEST GÖNDERİMİ\n'));
  const entity = options.entities[0];
  assert.equal(sentText.slice(entity.offset, entity.offset + entity.length), 'Kaynağı aç');
  assert.equal(entity.url, sources[0].url);
  const row = await store.read();
  assert.equal(row.payload.delivery[0].messageId, 123);
  await assert.rejects(() => svc.testSend({ confirmSend: true, reportHash: report.reportHash, targetHash: 'target-hash' }), /already_claimed/);
  assert.equal(calls.length, 1);
});

test('legacy multipart drafts cannot send after switching to one-message delivery', async t => {
  modelKey(t);
  const store = memoryStore();
  let sends = 0;
  const svc = service(store, { generate: async () => ({ ...draft(), chunks: ['İlk parça', 'İkinci parça'] }), send: async () => { sends++; } });
  await svc.preview();
  await assert.rejects(() => svc.testSend({ confirmSend: true, reportHash: 'report-hash', targetHash: 'target-hash' }), /invalid_chunks/);
  assert.equal(sends, 0);
  assert.equal((await store.read()).payload.phase, 'ready');
});

test('analyst narrative sends exactly its plain text while keeping sources out of the Telegram message', async t => {
  modelKey(t);
  const store = memoryStore();
  const text = 'ALFA MAKRO\nAkıcı değerlendirme; görünür kaynak ve madde listesi yok.';
  const report = { ...draft(), text, chunks: [text], telegramFormat: 'narrative-v1', sources: [{ url: 'https://www.bls.gov/test' }] };
  const calls = [];
  const svc = service(store, { generate: async () => report, send: async (...args) => { calls.push(args); return { ok: true, result: { message_id: 123 } }; } });
  await svc.preview();
  await svc.testSend({ confirmSend: true, reportHash: report.reportHash, targetHash: 'target-hash' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'TEST GÖNDERİMİ\n' + text);
  assert.deepEqual(calls[0][4].entities, []);
  assert.ok(!calls[0][0].includes('https://'));
  assert.equal((await store.read()).payload.report.sources.length, 1);
});

async function topicCopyFixture(t, { uncertain = false, failedAck = false } = {}) {
  modelKey(t);
  const store = memoryStore();
  const text = 'Bugünkü özgün rapor; veri saati değiştirilmez.\nhttps://www.bls.gov/test';
  const report = { ...draft(), text, reportHash: hash(text), sources: [{ url: 'https://www.bls.gov/test' }] };
  let now = NOW, currentTarget = target, sendCalls = 0;
  const svc = service(store, { clock: () => now, target: async () => currentTarget, generate: async () => report,
    send: async (message, _chat, thread, _markup, options) => {
      sendCalls++;
      if (sendCalls > 1) {
        assert.equal(thread, 772);
        assert.match(message, /^KONU TESTİ · Bugünkü raporun kopyası/);
        assert.equal(Object.values((await store.settings()).payload.topicCopies)[0].phase, 'sending');
        const link = options.entities[0];
        assert.equal(message.slice(link.offset, link.offset + link.length), 'Kaynağı aç');
        if (uncertain) throw new Error('network timeout');
      }
      return { ok: true, result: { message_id: sendCalls } };
    },
  });
  await svc.preview();
  await svc.testSend({ confirmSend: true, reportHash: report.reportHash, targetHash: target.public.targetHash });
  const before = await store.read();
  currentTarget = { ...target, threadId: 772, public: { ...target.public, targetHash: 'new-topic-hash' } };
  now += 20 * 60000; // Explicit copy of today's archive, NOT a fresh-report fallback.
  if (failedAck) {
    const save = store.saveSettings;
    let saves = 0;
    store.saveSettings = async (...args) => { if (++saves === 2) throw new Error('macro_storage_unavailable'); return save(...args); };
  }
  const body = { confirmSend: true, confirmArchivedCopy: true, reportHash: report.reportHash, targetHash: currentTarget.public.targetHash };
  return { store, svc, body, before, calls: () => sendCalls, advanceDay: () => { now += 24 * 3600000; }, sameTarget: () => { currentTarget = target; } };
}

test('explicit archived topic copy is one independent claim and never resets the daily sent record', async t => {
  const f = await topicCopyFixture(t);
  const result = await f.svc.testTopicCopy(f.body);
  assert.equal(result.parts, 1);
  assert.equal(result.archivedCopy, true);
  assert.equal(result.cutoff, new Date(NOW).toISOString());
  assert.deepEqual(await f.store.read(), f.before);
  const settings = await f.store.settings();
  assert.equal(settings.payload.enabled, false);
  assert.equal(settings.payload.testedTargetHash, 'new-topic-hash');
  const entry = Object.values(settings.payload.topicCopies)[0];
  assert.equal(entry.phase, 'sent');
  assert.equal(entry.messageId, 2);
  await assert.rejects(() => f.svc.testTopicCopy(f.body), /already_claimed/);
  assert.equal(f.calls(), 2); // Original daily test + one explicitly requested topic copy.
});

test('topic copy requires explicit archive approval and a different, hash-matched target today', async t => {
  const f = await topicCopyFixture(t);
  await assert.rejects(() => f.svc.testTopicCopy({ ...f.body, confirmArchivedCopy: false }), /confirmation_required/);
  await assert.rejects(() => f.svc.testTopicCopy({ ...f.body, targetHash: 'other' }), /confirmation_required/);
  f.sameTarget();
  await assert.rejects(() => f.svc.testTopicCopy({ ...f.body, targetHash: target.public.targetHash }), /not_allowed/);
  f.advanceDay();
  await assert.rejects(() => f.svc.testTopicCopy({ ...f.body, targetHash: target.public.targetHash }), /not_allowed/);
  assert.equal(f.calls(), 1);
});

test('parallel topic-copy requests cannot acquire two delivery claims', async t => {
  const f = await topicCopyFixture(t);
  const result = await Promise.allSettled([f.svc.testTopicCopy(f.body), f.svc.testTopicCopy(f.body)]);
  assert.equal(result.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(f.calls(), 2);
});

test('uncertain topic-copy delivery is terminal and never retried', async t => {
  const f = await topicCopyFixture(t, { uncertain: true });
  await assert.rejects(() => f.svc.testTopicCopy(f.body), /delivery_unknown/);
  assert.equal(Object.values((await f.store.settings()).payload.topicCopies)[0].phase, 'delivery_unknown');
  await assert.rejects(() => f.svc.testTopicCopy(f.body), /already_claimed/);
  assert.equal(f.calls(), 2);
  assert.deepEqual(await f.store.read(), f.before);
});

test('lost topic-copy acknowledgement commit leaves a durable claim and blocks blind resend', async t => {
  const f = await topicCopyFixture(t, { failedAck: true });
  await assert.rejects(() => f.svc.testTopicCopy(f.body), /storage_unavailable/);
  assert.equal(Object.values((await f.store.settings()).payload.topicCopies)[0].phase, 'sending');
  await assert.rejects(() => f.svc.testTopicCopy(f.body), /already_claimed/);
  assert.equal(f.calls(), 2);
});

test('Istanbul date boundaries, due window and US summer/winter calendar conversion are correct', () => {
  assert.equal(dayKey(new Date('2026-11-04T22:00:00Z')), '2026-11-05');
  assert.equal(isDue(new Date(NOW)), true);
  assert.equal(isDue(new Date('2026-11-05T05:59:00Z')), false);
  assert.equal(isDue(new Date('2026-11-05T07:00:00Z')), false);
  assert.equal(zonedUTC('20261106T083000', 'US-Eastern'), '2026-11-06T13:30:00.000Z');
  assert.equal(zonedUTC('20260706T083000', 'America/New_York'), '2026-07-06T12:30:00.000Z');
  const ics = 'BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART;TZID=US-Eastern:20261106T083000\nSUMMARY:Employment Situation\nEND:VEVENT\nBEGIN:VEVENT\nDTSTART:20261106T120000\nSUMMARY:Floating time is not verified\nEND:VEVENT\nEND:VCALENDAR';
  const events = calendarEvents(ics, 'S1', NOW);
  assert.equal(events.length, 1);
  assert.equal(events[0].at, '2026-11-06T13:30:00.000Z');
});

test('Telegram splitting preserves complete URLs, emoji and plain-text formatting', () => {
  const url = 'https://www.federalreserve.gov/newsevents/pressreleases/example.htm';
  const chunks = splitTelegram(('🔎 Türkçe açıklama <b>metin</b>\n').repeat(250) + url);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every(c => c.length < 4096));
  assert.equal(chunks.filter(c => c.includes(url)).length, 1);
  assert.throws(() => splitTelegram('https://' + 'a'.repeat(4000)), /token_too_long/);
});

test('publication dates come from article metadata, nearby visible dates or nearby <time> tags', () => {
  const now = Date.parse('2026-11-05T12:00:00Z');
  assert.equal(parseDateValue('2026-11-05T04:00:00Z', now), '2026-11-05T04:00:00Z');
  assert.equal(parseDateValue('November 4, 2026', now), '2026-11-04');
  assert.equal(parseDateValue('2026-11-06T18:00:00Z', now), null); // future is not a publication date
  assert.equal(parseDateValue('2026-02-31', now), null);
  assert.equal(sourceDate('<meta property="article:published_time" content="2026-11-05T04:00:00Z">', '', now), '2026-11-05T04:00:00Z');
  const listing = '<main><h2>Latest release</h2><p>Liquidity and the dollar moved together this week.</p><time datetime="2026-11-04T08:30:00-05:00">Nov 4</time></main>';
  assert.equal(sourceDate(listing, 'Liquidity and the dollar moved together this week.', now), '2026-11-04T08:30:00-05:00');
  const visible = '<main><h1>CPI</h1><p>Transmission channel text for the dollar and rates.</p><p>October 14, 2026</p></main>';
  assert.equal(sourceDate(visible, 'Transmission channel text for the dollar and rates.', now), '2026-10-14');
  assert.equal(sourceDate('<main><time datetime="2026-11-06T18:00:00Z">Upcoming</time></main>', '', now), null);
});

test('official RSS, listing and CSV parsers keep the published date attached to the right item', () => {
  const now = Date.parse('2026-11-05T20:00:00Z');
  const fed = '<rss><channel><item><title>Board announces something material</title><link><![CDATA[https://www.federalreserve.gov/newsevents/pressreleases/enforcement20261105a.htm]]></link><description><![CDATA[Board announces something material]]></description><pubDate><![CDATA[Thu, 5 Nov 2026 16:00:00 GMT]]></pubDate></item><item><title>Old item that is not fresh</title><link>https://www.federalreserve.gov/old.htm</link><pubDate>Fri, 30 Oct 2026 15:30:00 GMT</pubDate></item></channel></rss>';
  const items = xmlItems(fed, now);
  assert.equal(items.length, 2);
  assert.equal(items[0].link, 'https://www.federalreserve.gov/newsevents/pressreleases/enforcement20261105a.htm');
  assert.equal(items[0].publishedAt, '2026-11-05T16:00:00.000Z');
  assert.ok(Date.parse(items[0].publishedAt) > Date.parse(items[1].publishedAt));

  const bea = '<table><tbody><tr class="release-row"><td><a href="/news/2026/trade-september-2026">U.S. International Trade in Goods and Services</a></td><td><time datetime="2026-11-04T08:30:00-05:00">November 4, 2026</time></td></tr><tr class="release-row"><td><a href="/news/2026/next-release">Next unrelated release headline</a></td><td><time datetime="2026-10-29T08:30:00-04:00">October 29, 2026</time></td></tr></tbody></table>';
  const beaItems = listingItems(bea, 'https://www.bea.gov', now);
  assert.equal(beaItems.length, 2);
  assert.equal(beaItems[0].url, 'https://www.bea.gov/news/2026/trade-september-2026');
  assert.equal(beaItems[0].publishedAt, '2026-11-04T08:30:00-05:00');

  const treasury = '<div><span><time datetime=2026-11-05T18:00:00Z class=datetime>November 5, 2026</time></span><h3><a href=/news/press-releases/sb0683/>Treasury Targets Global Scam Networks</a></h3></div>';
  const treasuryItems = listingItems(treasury, 'https://home.treasury.gov', now);
  assert.equal(treasuryItems.length, 1);
  assert.equal(treasuryItems[0].url, 'https://home.treasury.gov/news/press-releases/sb0683/');
  assert.equal(treasuryItems[0].title, 'Treasury Targets Global Scam Networks');

  const { header, row } = csvHead('Date,"5 YR","10 YR","30 YR"\n11/04/2026,2.39,2.64,3.08\n11/03/2026,2.35,2.65,3.09');
  assert.deepEqual(header, ['Date', '5 YR', '10 YR', '30 YR']);
  assert.equal(usDate(row[0]), '2026-11-04');
  assert.equal(row[header.indexOf('10 YR')], '2.64');

  assert.equal(listingItems('<time datetime="2026-11-06T18:00:00Z">Upcoming</time>', 'https://www.bea.gov', now).length, 0);
});

test('live source fetch refuses unsafe domains and redirects rather than following arbitrary URLs', async () => {
  assert.equal(publicUrl('https://127.0.0.1/'), null);
  assert.equal(publicUrl('http://www.bls.gov/'), null);
  assert.equal(publicUrl('https://www.bls.gov.evil.test/'), null);
  assert.ok(publicUrl('https://fred.stlouisfed.org/graph/fredgraph.csv?id=DTWEXBGS'));
  assert.ok(publicUrl('https://api.coinbase.com/v2/prices/BTC-USD/spot'));
  assert.ok(publicUrl('https://api.gold-api.com/price/XAU'));
  await assert.rejects(() => readSource('https://www.bls.gov/test', null, async () => ({ status: 302, headers: { get: () => 'http://169.254.169.254/' } })), /redirect_not_allowed/);
});

test('simultaneous previews acquire only one durable generation lease; preview sends nothing', async t => {
  modelKey(t);
  const store = memoryStore();
  let generated = 0, sent = 0;
  const svc = service(store, { generate: async () => { generated++; return draft(); }, send: async () => { sent++; } });
  const results = await Promise.allSettled([svc.preview(), svc.preview()]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(generated, 1); assert.equal(sent, 0);
  await svc.preview();
  assert.equal(generated, 1);
});

test('explicit test confirmation is required, targets one chat and consumes the same daily slot', async t => {
  modelKey(t);
  const store = memoryStore();
  const calls = [];
  const svc = service(store, { send: async (text, chat) => { calls.push({ text, chat }); return { ok: true, http: 200, result: { message_id: 1 } }; } });
  await svc.preview();
  await assert.rejects(() => svc.testSend({ confirmSend: true, reportHash: 'wrong', targetHash: 'target-hash' }), /confirmation_required/);
  const confirm = { confirmSend: true, reportHash: 'report-hash', targetHash: 'target-hash' };
  const outcomes = await Promise.allSettled([svc.testSend(confirm), svc.testSend(confirm)]);
  assert.equal(outcomes.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].chat, 'private-test-target');
  assert.match(calls[0].text, /^TEST GÖNDERİMİ/);
  const settings = await store.settings();
  assert.equal(settings.payload.enabled, false);
  await svc.setEnabled({ enabled: true, confirmEnable: true, targetHash: 'target-hash' });
  assert.equal((await svc.run()).phase, 'sent');
  assert.equal(calls.length, 1);
});

test('lost Telegram response remains unknown and is never blindly retried', async t => {
  modelKey(t);
  const store = memoryStore({ enabled: true });
  let sends = 0;
  const svc = service(store, { send: async () => { sends++; throw new Error('network failure'); } });
  await assert.rejects(() => svc.run(), /delivery_unknown/);
  assert.equal((await store.read()).payload.phase, 'delivery_unknown');
  assert.equal((await svc.run()).phase, 'delivery_unknown');
  assert.equal(sends, 1);
});

test('crash after Telegram acknowledgement but before DB commit blocks all re-sending', async t => {
  modelKey(t);
  // saves: ready, sending claim, part intent, part acknowledgement (fails).
  const store = memoryStore({ enabled: true, failSave: 4 });
  let sends = 0;
  const svc = service(store, { send: async () => { sends++; return { ok: true, http: 200, result: { message_id: 3 } }; } });
  await assert.rejects(() => svc.run(), /storage_unavailable/);
  assert.equal((await store.read()).payload.phase, 'sending');
  assert.equal((await svc.run()).phase, 'sending');
  assert.equal(sends, 1);
});

test('research failure never sends yesterday/current stale content and retries are bounded', async t => {
  modelKey(t);
  const store = memoryStore({ enabled: true });
  let research = 0, sends = 0;
  const svc = service(store, { research: async () => { research++; throw new Error('web_search_unavailable'); }, send: async () => { sends++; } });
  for (let i = 0; i < 3; i++) await assert.rejects(() => svc.run(), /web_search_unavailable/);
  await assert.rejects(() => svc.run(), /attempt_limit/);
  assert.equal(research, 3); assert.equal(sends, 0);
});

test('disabled automation and unapproved targets cannot send', async () => {
  let touched = 0;
  const svc = service(memoryStore(), { send: async () => { touched++; } });
  assert.equal((await svc.run()).phase, 'disabled');
  await assert.rejects(() => svc.setEnabled({ enabled: true, confirmEnable: true, targetHash: 'target-hash' }), /test_required/);
  assert.equal(touched, 0);
});

test('diagnostics redact upstream errors instead of leaking bot/model URLs or credentials', async () => {
  const svc = service({ settings: async () => { throw new Error('database PRIVATE_SENTINEL_VALUE'); } }, {
    target: async () => { throw new Error('https://api.telegram.org/botPRIVATE_SENTINEL_VALUE/getChat'); },
    modelAvailability: async () => { throw new Error('Bearer PRIVATE_SENTINEL_VALUE'); },
  });
  const result = await svc.status();
  assert.ok(!JSON.stringify(result).includes('PRIVATE_SENTINEL_VALUE'));
  assert.equal(result.enabled, false);
});

test('real storage adapter uses revision-filtered CAS, never blind overwrite or upsert', async t => {
  const old = process.env.SUPABASE_SERVICE_ROLE;
  process.env.SUPABASE_SERVICE_ROLE = 'sb_secret_test';
  t.after(() => { if (old === undefined) delete process.env.SUPABASE_SERVICE_ROLE; else process.env.SUPABASE_SERVICE_ROLE = old; });
  let called;
  const store = macroStore(async (url, init) => { called = { url, init }; return { ok: true, status: 200, json: async () => [] }; });
  await assert.rejects(() => store.save({ report_date: '2026-11-05', revision: 'old-revision' }, { phase: 'sending' }), /macro_conflict/);
  assert.match(called.url, /report_date=eq\.2026-11-05&revision=eq\.old-revision/);
  assert.equal(called.init.method, 'PATCH');
  assert.ok(!called.init.headers.Prefer.includes('resolution=merge'));
});

function evidenceFixture() {
  return { cutoff: new Date(NOW).toISOString(), calendarFailures: [], events: [], provider: 'test', freshCount: 3,
    sources: ['federalreserve.gov', 'bls.gov', 'bea.gov'].map((host, i) => ({ id: 'S' + (i + 1), url: 'https://' + host + '/release', title: 'Resmi kaynak', kind: 'primary', text: 'The observed rate was 4.25 on 2026-11-05.', publishedAt: '2026-11-05T05:00:00Z', fetchedAt: new Date(NOW).toISOString() })) };
}
function reportFixture() {
  const text = 'Doğrulanan veri piyasa beklentisiyle birlikte değerlendirilmeli çünkü dolar faiz likidite ve risk iştahı kanalları farklı yönlerde çalışabilir; gözlemler koşullu yorumlanmalıdır.';
  const f = n => ({ text, sourceIds: ['S' + n], asOf: null });
  const asset = () => ({ support: f(1), pressure: f(2), confirm: f(3), invalidate: f(1) });
  return { developments: [f(1), f(2), f(3)], channels: [f(1)], btc: asset(), gold: asset(), election: { ...f(2), stage: 'unknown', eventAt: null }, eventIds: [], missing: ['ETF akışlarının kesin saati doğrulanamadı'] };
}
test('reports validate provenance, dated numbers, election stage, event evidence and word limit', () => {
  const e = evidenceFixture(), d = reportFixture();
  const report = validateReport(d, e);
  assert.ok(report.wordCount >= 350 && report.wordCount <= 550);
  assert.equal(report.sources.length, 3);
  assert.ok(report.text.includes('Doğrulanmış yeni gelişme yok'));
  const bad = structuredClone(d); bad.btc.support.text = 'Kaynakta belirtilen getiri 4.25 olarak kaydedildi.';
  const undated = evidenceFixture(); undated.sources = undated.sources.map(s => ({ ...s, publishedAt: null }));
  assert.throws(() => validateReport(bad, undated), /undated_number/);
  // Publication time cannot substitute for an omitted market observation time.
  assert.throws(() => validateReport(bad, e), /undated_number/);
  bad.btc.support.asOf = '2026-11-05'; bad.btc.support.text = 'Kaynakta belirtilen getiri 99.8 olarak kaydedildi.';
  assert.throws(() => validateReport(bad, e), /unsupported_number/);
  const unknown = structuredClone(d); unknown.channels[0].sourceIds = ['S99'];
  assert.throws(() => validateReport(unknown, e), /unknown_source/);
  const event = structuredClone(d); event.eventIds = ['invented'];
  assert.throws(() => validateReport(event, e), /unverified_event/);
  const election = structuredClone(d); election.election.stage = 'certified';
  assert.throws(() => validateReport(election, e), /not_certified/);
});

test('numeric provenance accepts equivalent Turkish formatting and ignores date tokens', () => {
  assert.ok(numberVariants('76.011,2').has('76011.2'));
  assert.ok(numberVariants('4,25').has('4.25'));
  assert.ok(numberVariants('159.044').has('159044'));
  assert.ok(!numberVariants('99.8').has('4.25'));
  assert.deepEqual(marketNumbers('3 Kasım 2026 ve 09:30, getiri 4,25'), ['4,25']);
  assert.deepEqual(marketNumbers('November 5, 2026: 76011.2 USD'), ['76011.2']);
});

test('strict report schema requires all fact objects without silently repairing invalid evidence', () => {
  const walk = s => {
    if (s.type === 'object') {
      assert.equal(s.additionalProperties, false);
      assert.deepEqual(s.required, Object.keys(s.properties));
      Object.values(s.properties).forEach(walk);
    }
    if (s.items) walk(s.items);
  };
  walk(reportSchema);
  assert.equal(reportSchema.properties.developments.minItems, 3);
  assert.equal(reportSchema.properties.developments.maxItems, 3);
  const d = reportFixture();
  d.election = undefined;
  assert.throws(() => validateReport(d, evidenceFixture()), /election_status_missing/);
});

test('report generation requests strict schema and never accepts rejected provider output', async t => {
  const oldFetch = global.fetch;
  const oldKey = process.env.GROQ_API_KEY;
  process.env.GROQ_API_KEY = 'test-only';
  t.after(() => {
    global.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = oldKey;
  });
  let request;
  global.fetch = async (_url, init) => {
    request = JSON.parse(init.body);
    return { ok: true, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: '{"ok":true}' } }] }) };
  };
  assert.deepEqual(await groq([{ role: 'user', content: 'JSON' }], { schema: reportSchema }), { ok: true });
  assert.equal(request.response_format.type, 'json_schema');
  assert.equal(request.response_format.json_schema.strict, true);
  assert.deepEqual(request.response_format.json_schema.schema, reportSchema);
  global.fetch = async () => ({ ok: false, status: 400, json: async () => ({ error: { code: 'json_validate_failed', type: 'invalid_request_error', failed_generation: '{"developments":[]}' } }) });
  await assert.rejects(() => groq([], { schema: reportSchema }), e => {
    assert.equal(e.message, 'model_invalid_json');
    assert.deepEqual(e.provider.failedKeys, ['developments']);
    assert.equal(e.provider.failed_generation, undefined);
    return true;
  });
});

test('scheduler trigger rejects unauthenticated requests before any network call', async () => {
  const old = global.fetch;
  let calls = 0;
  global.fetch = async () => { calls++; throw new Error('unexpected'); };
  const res = { setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  try { await macroHandler({ method: 'GET', query: {}, headers: {} }, res); assert.equal(res.code, 401); assert.equal(calls, 0); }
  finally { global.fetch = old; }
});

test('authenticated non-admin cannot preview, send or enable the macro job', async () => {
  const old = global.fetch;
  let calls = 0;
  global.fetch = async () => { calls++; return { ok: true, json: async () => ({ id: 'member', email: 'member@example.invalid' }) }; };
  try {
    for (const action of ['macro-preview', 'macro-test-send', 'macro-enable']) {
      const res = { setHeader() {}, status(code) { this.code = code; return this; }, json() { return this; } };
      await macroHandler({ method: 'POST', headers: { authorization: 'Bearer member' }, body: { action, confirmSend: true, enabled: true } }, res);
      assert.equal(res.code, 403);
    }
    assert.equal(calls, 3);
  } finally { global.fetch = old; }
});

test('shared Telegram transport remains plain text with no webhook/polling or parse mode', async () => {
  const old = global.fetch;
  let payload;
  global.fetch = async (url, init) => { assert.ok(url.endsWith('/sendMessage')); payload = JSON.parse(init.body); return { status: 200, json: async () => ({ ok: true, result: { message_id: 4 } }) }; };
  try {
    await sendTelegram('<b>metin</b> & _test_', 'one-chat', null);
    assert.equal(payload.parse_mode, undefined);
    assert.equal(payload.chat_id, 'one-chat');
    assert.equal(payload.text, '<b>metin</b> & _test_');
    assert.equal(payload.allow_paid_broadcast, undefined);
  } finally { global.fetch = old; }
});
