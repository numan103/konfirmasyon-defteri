import test from 'node:test';
import assert from 'node:assert/strict';
import { dayKey, isDue, zonedUTC, calendarEvents, splitTelegram, publicUrl } from '../lib/macro/core.mjs';
import { validateReport } from '../lib/macro/report.mjs';
import { macroService } from '../lib/macro/job.mjs';
import macroHandler from '../lib/macro/handler.mjs';
import { readSource } from '../lib/macro/research.mjs';
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

test('live source fetch refuses unsafe domains and redirects rather than following arbitrary URLs', async () => {
  assert.equal(publicUrl('https://127.0.0.1/'), null);
  assert.equal(publicUrl('http://www.bls.gov/'), null);
  assert.equal(publicUrl('https://www.bls.gov.evil.test/'), null);
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
