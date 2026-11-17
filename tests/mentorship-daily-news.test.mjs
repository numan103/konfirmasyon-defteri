import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  mentorHighImpact, formatMentorDailyBrief, mentorshipDailyNewsHandler,
} from '../lib/economic-calendar.mjs';
import { istanbulDateKey } from '../lib/market-news.mjs';

const day = istanbulDateKey();
const nextDay = istanbulDateKey(new Date(Date.parse(day + 'T12:00:00Z') + 86400000));
const at = (key) => key + 'T12:00:00+03:00';

const row = (title, country, date, impact = 'High', forecast = '', previous = '') => ({
  title, country, date, impact, forecast, previous,
});

function response() {
  const out = { statusCode: null, body: null };
  out.status = (code) => { out.statusCode = code; return out; };
  out.json = (body) => { out.body = body; return out; };
  return out;
}

function req(query = '?mentorNews=1') {
  return { url: '/api/ai' + query, headers: { 'x-vercel-cron': '1' }, method: 'GET' };
}

function stubFetch(overrides = {}) {
  const real = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, init });
    if (u.includes('faireconomy')) {
      return new Response(JSON.stringify([
        row('CPI m/m', 'USD', at(day), 'High', '0.3%', '0.6%'),
        row('FOMC Statement', 'USD', at(day), 'High'),
        row('Retail Sales', 'EUR', at(day), 'Medium'),
        row('Nonfarm Payrolls', 'USD', at(nextDay), 'High'),
      ]), { status: 200 });
    }
    if (u.includes('mentorship_daily_news_state')) {
      return new Response(JSON.stringify([{ data: overrides.mentorState || { day: null, sentAt: null, count: 0 } }]), { status: 200 });
    }
    if (u.includes('econ_calendar_state')) {
      return new Response(JSON.stringify([{ data: {} }]), { status: 200 });
    }
    if (u.includes('api.telegram.org')) {
      return new Response(JSON.stringify({ ok: true, result: { message_id: 4242 } }), { status: 200 });
    }
    if (u.includes('rest/v1/edu_shared') && init.method === 'POST') {
      return new Response(null, { status: 201 });
    }
    return new Response('unexpected ' + u, { status: 500 });
  };
  return {
    calls,
    restore() { globalThis.fetch = real; },
    telegram() { return calls.filter((c) => c.url.includes('api.telegram.org')); },
  };
}

function env(values) {
  const keys = Object.keys(values);
  const old = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(values)) {
    if (v == null) delete process.env[k];
    else process.env[k] = v;
  }
  return () => {
    for (const k of keys) {
      if (old[k] == null) delete process.env[k];
      else process.env[k] = old[k];
    }
  };
}

test('3 yıldız brifi tüm ülkelerin sadece o günün yüksek etkili verilerini alır', () => {
  const events = [
    { key: 'usd-cpi', country: 'USD', title: 'CPI m/m', impact: 'High', at: Date.parse(at(day)), forecast: '0.3%', previous: '0.6%' },
    { key: 'eur-retail', country: 'EUR', title: 'Retail Sales', impact: 'Medium', at: Date.parse(at(day)) },
    { key: 'usd-nfp', country: 'USD', title: 'Nonfarm Payrolls', impact: 'High', at: Date.parse(at(nextDay)) },
  ];
  const high = mentorHighImpact(events, day);
  assert.deepEqual(high.map((e) => e.key), ['usd-cpi']);
  assert.deepEqual(mentorHighImpact([], day), []);
});

test('mentörlük brifi sadece haber, saat ve beklenti yazar', () => {
  const text = formatMentorDailyBrief([
    { country: 'USD', title: 'CPI m/m', impact: 'High', at: Date.parse(at(day)), forecast: '0.3%', previous: '0.6%' },
  ], new Date(), day);
  assert.match(text, /📅 3 Yıldız Haberler/);
  assert.match(text, /TSİ/);
  assert.match(text, /TÜFE \(aylık\)/);
  assert.match(text, /Beklenti: 0,3%/);
  assert.doesNotMatch(text, /Önceki|Forex Factory|haber kısıtı|gerçekleşti|actual/i);
});

test('yüksek etkili takvim başlıkları ve ülkeler Türkçe yazılır', () => {
  const titles = [
    'BOE Gov Bailey Speaks', 'Core Retail Sales m/m', 'Employment Change',
    'Fed Chairman Warsh Speaks', 'FOMC Meeting Minutes', 'Inflation Expectations q/q',
    'Median CPI y/y', 'RBA Gov Bullock Speaks', 'Trimmed CPI y/y',
  ];
  const text = formatMentorDailyBrief(titles.map((title, i) => ({
    country: ['GBP', 'USD', 'USD', 'USD', 'USD', 'NZD', 'USD', 'AUD', 'USD'][i],
    title, impact: 'High', at: Date.parse(at(day)) + i * 60000, forecast: '0,3%',
  })), new Date(), day);
  for (const expected of [
    'İngiltere Merkez Bankası Başkanı Bailey Konuşuyor',
    'Çekirdek Perakende Satışlar (aylık)', 'İstihdam Değişimi',
    'Fed Başkanı Warsh Konuşuyor', 'FOMC Toplantı Tutanakları',
    'Enflasyon Beklentileri (çeyreklik)', 'Medyan TÜFE (yıllık)',
    'Avustralya Merkez Bankası Başkanı Bullock Konuşuyor', 'Kırpılmış TÜFE (yıllık)',
    'Yeni Zelanda', 'Avustralya', 'İngiltere',
  ]) assert.ok(text.includes(expected), 'missing: ' + expected);
  assert.doesNotMatch(text, /\b(Speaks|Retail Sales|Employment Change|Expectations|Median|Trimmed|Minutes)\b/);
});

test('route ve cron 07:00 TSİ için mentorNews yolunu kullanır', () => {
  const api = fs.readFileSync(new URL('../api/ai.mjs', import.meta.url), 'utf8');
  assert.match(api, /mentorshipDailyNewsHandler/);
  assert.match(api, /req\.query\?\.mentorNews === '1'/);
  const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.ok(vercel.crons.some((c) => c.path === '/api/ai?mentorNews=1' && c.schedule === '0 4 * * *'));
});

test('dryRun takvimden brif üretir ama Telegrama yazmaz', async () => {
  const restoreEnv = env({
    TG_BOT_TOKEN: 'test-token', TG_MENTORSHIP_CHAT_ID: '-100999',
    SUPABASE_SERVICE_ROLE: 'sb_secret_test', ECON_ALERT_SECRET: 'cron-secret',
  });
  const stub = stubFetch();
  try {
    const out = response();
    await mentorshipDailyNewsHandler(req('?mentorNews=1&dryRun=1'), out);
    assert.equal(out.statusCode, 200);
    assert.equal(out.body.ok, true);
    assert.equal(out.body.dryRun, true);
    assert.equal(out.body.day, day);
    assert.equal(out.body.events.length, 2);
    assert.match(out.body.text, /FOMC/);
    assert.deepEqual(stub.telegram(), []);
  } finally {
    stub.restore();
    restoreEnv();
  }
});

test('aynı gün ikinci çağrı Telegrama yazmadan atlanır', async () => {
  const restoreEnv = env({
    TG_BOT_TOKEN: 'test-token', TG_MENTORSHIP_CHAT_ID: '-100999',
    SUPABASE_SERVICE_ROLE: 'sb_secret_test', ECON_ALERT_SECRET: 'cron-secret',
  });
  const stub = stubFetch({ mentorState: { day, sentAt: '2026-11-17T04:00:00.000Z', count: 2 } });
  try {
    const out = response();
    await mentorshipDailyNewsHandler(req(), out);
    assert.equal(out.statusCode, 200);
    assert.equal(out.body.skipped, 'already_sent');
    assert.deepEqual(stub.telegram(), []);
  } finally {
    stub.restore();
    restoreEnv();
  }
});

test('gönderim yalnızca TG_MENTORSHIP_CHAT_ID hedefini kullanır ve durumu kaydeder', async () => {
  const restoreEnv = env({
    TG_BOT_TOKEN: 'test-token', TG_MENTORSHIP_CHAT_ID: '-100999',
    TG_MENTORSHIP_THREAD: '77', TG_CHAT_ID: '-100111', NEWS_CHAT_ID: '-100222',
    ECON_CHAT_ID: '-100333', TG_TRADE_CHAT_ID: '-100444',
    SUPABASE_SERVICE_ROLE: 'sb_secret_test', ECON_ALERT_SECRET: 'cron-secret',
  });
  const stub = stubFetch();
  try {
    const out = response();
    await mentorshipDailyNewsHandler(req(), out);
    assert.equal(out.statusCode, 200);
    assert.equal(out.body.messageId, 4242);
    assert.equal(out.body.stateSaved, true);
    const sends = stub.telegram();
    assert.equal(sends.length, 1);
    const payload = JSON.parse(sends[0].init.body);
    assert.equal(payload.chat_id, '-100999');
    assert.equal(payload.message_thread_id, 77);
    assert.match(payload.text, /3 Yıldız Haberler/);
    assert.ok(stub.calls.some((c) => c.url.includes('rest/v1/edu_shared') && c.init.method === 'POST'
      && JSON.parse(c.init.body).id === 'mentorship_daily_news_state'));
  } finally {
    stub.restore();
    restoreEnv();
  }
});

test('mentorNews yetkisiz isteği reddeder', async () => {
  const restoreEnv = env({ ECON_ALERT_SECRET: 'cron-secret' });
  const realFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => { called = true; return new Response('[]', { status: 200 }); };
  try {
    const out = response();
    await mentorshipDailyNewsHandler({ url: '/api/ai?mentorNews=1', headers: {} }, out);
    assert.equal(out.statusCode, 401);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = realFetch;
    restoreEnv();
  }
});
