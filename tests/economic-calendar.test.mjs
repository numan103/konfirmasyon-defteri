import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  parseCalendarRows, filterCalendarEvents, eventsForDay,
  formatAgenda, formatEventReminder, dueReminders, agendaWindow,
  fetchCalendarRows, parseCache, cacheUsable, cacheWriteDue,
  weekStartKey, eventsForWeek, formatWeeklyOutlook, weeklyEnabled, isWeeklyDay,
  formatWeeklyEmpty, formatAgendaEmpty, emptyNotesEnabled, isIstanbulWeekday,
} from '../lib/economic-calendar.mjs';

const row = (title, country, date, impact = 'High', forecast = '', previous = '') => ({
  title, country, date, impact, forecast, previous,
});

const at = (iso) => Date.parse(iso);

function event(key, iso, overrides = {}) {
  return {
    key,
    title: overrides.title || key,
    country: overrides.country || 'USD',
    impact: overrides.impact || 'High',
    at: at(iso),
    forecast: overrides.forecast || '',
    previous: overrides.previous || '',
  };
}

// --- Kaynak ayristirma / filtreleme ---

test('takvim satirlari normalize edilir ve ayni olay tekillestirilir', () => {
  const rows = parseCalendarRows([
    row('CPI m/m', 'USD', '2026-11-10T08:30:00-05:00', 'High', '0.3%', '0.6%'),
    row('CPI m/m', 'USD', '2026-11-10T08:30:00-05:00', 'High', '0.3%', '0.6%'), // ayni satir
    row('Core CPI m/m', 'USD', '2026-11-10T08:30:00-05:00', 'High', '0.2%', '0.3%'),
    row('CPI y/y', 'EUR', '2026-11-10T08:30:00-05:00', 'High', '2.1%', '2.0%'),
    row('', 'USD', '2026-11-10T08:30:00-05:00'), // basliksiz
    row('Bozuk tarih', 'USD', 'yarin', 'High'), // tarih yok
    { title: 'Alan yok', country: 'USD', date: '2026-11-10T08:30:00-05:00' },
  ]);

  assert.equal(rows.length, 4);
  assert.equal(rows[0].title, 'CPI m/m');
  assert.equal(rows[0].impact, 'High');
  assert.equal(rows[1].title, 'Core CPI m/m');
  assert.equal(rows[2].country, 'EUR');
  assert.equal(rows[1].forecast, '0.2%');
  assert.equal(rows[1].key, 'USD|core cpi m/m|' + Math.floor(at('2026-11-10T08:30:00-05:00') / 60000));
  assert.equal(rows[3].impact, 'Low'); // eksik etki alani varsayilan olarak Low
});

test('yalnizca USD ve High etkili veriler secilir', () => {
  const events = [
    event('cpi', '2026-11-10T13:30:00Z', { country: 'USD', impact: 'High' }),
    event('ppi', '2026-11-10T13:30:00Z', { country: 'USD', impact: 'Medium' }),
    event('eur', '2026-11-10T13:30:00Z', { country: 'EUR', impact: 'High' }),
    event('cny', '2026-11-10T13:30:00Z', { country: 'CNY', impact: 'High' }),
  ];
  const filtered = filterCalendarEvents(events);
  assert.deepEqual(filtered.map((e) => e.key), ['cpi']);

  assert.deepEqual(
    filterCalendarEvents(events, { countries: ['USD', 'EUR'], impacts: ['high', 'medium'] }).map((e) => e.key),
    ['cpi', 'ppi', 'eur'],
  );
});

test('gun siniri Istanbul saatine gore cizilir', () => {
  const events = [
    event('late', '2026-11-14T20:30:00Z'), // 23:30 TSİ, 14 Kasım
    event('midnight', '2026-11-14T21:30:00Z'), // 00:30 TSİ, 15 Kasım
  ];
  assert.deepEqual(eventsForDay(events, '2026-11-14').map((e) => e.key), ['late']);
  assert.deepEqual(eventsForDay(events, '2026-11-15').map((e) => e.key), ['midnight']);
});

// --- Haftalik on bakis ---

test('hafta pazartesi baslar ve Istanbul gun siniri kullanilir', () => {
  assert.equal(weekStartKey(new Date('2026-11-14T05:30:00Z')), '2026-11-09'); // Cumartesi
  assert.equal(weekStartKey(new Date('2026-11-15T20:00:00Z')), '2026-11-09'); // Pazar 23:00 TSİ
  assert.equal(weekStartKey(new Date('2026-11-15T21:30:00Z')), '2026-11-16'); // Pazartesi 00:30 TSİ
  assert.equal(weekStartKey(new Date('2026-11-16T09:00:00Z')), '2026-11-16'); // Pazartesi
});

test('haftalik liste yalnizca o haftanin verilerini alir', () => {
  const events = [
    event('before', '2026-11-08T13:30:00Z'), // onceki hafta
    event('mon', '2026-11-09T13:30:00Z'),
    event('sun', '2026-11-15T13:30:00Z'),
    event('next', '2026-11-16T13:30:00Z'), // sonraki hafta
  ];
  assert.deepEqual(eventsForWeek(events, '2026-11-09').map((e) => e.key), ['mon', 'sun']);
});

test('haftalik on bakis gun adi, saat, Turkce baslik ve degerleri yazar', () => {
  const now = new Date('2026-11-09T05:30:00Z'); // Pazartesi 08:30 TSİ
  const text = formatWeeklyOutlook([
    event('cpi', '2026-11-10T13:30:00Z', { title: 'CPI m/m', forecast: '0.3%', previous: '0.6%' }),
    event('nfp', '2026-11-13T13:30:00Z', { title: 'Non-Farm Employment Change' }),
  ], now);
  assert.match(text, /Bu Haftanın Ekonomik Takvimi/);
  assert.match(text, /9 Kasım 2026 – 15 Kasım 2026/);
  assert.match(text, /Salı 16:30 — ABD TÜFE \(aylık\)/);
  assert.match(text, /Beklenti: 0,3% · Önceki: 0,6%/);
  assert.match(text, /Cuma 16:30 — ABD Tarım Dışı İstihdam/);
  assert.match(text, /Kaynak: Forex Factory/);
  assert.equal(formatWeeklyOutlook([], now), null);
});

test('veri olmayan gun ve hafta icin kisa bilgi notu uretilir', () => {
  const mon = new Date('2026-11-09T05:30:00Z');
  assert.match(formatWeeklyEmpty(mon), /9 Kasım 2026 – 15 Kasım 2026/);
  assert.match(formatWeeklyEmpty(mon), /Bu hafta öne çıkan yüksek etkili ABD verisi yok/);

  const sat = new Date('2026-11-14T05:30:00Z');
  assert.match(formatAgendaEmpty(sat), /14\.11\.2026/);
  assert.match(formatAgendaEmpty(sat), /Bugün öne çıkan yüksek etkili ABD verisi yok/);

  assert.equal(emptyNotesEnabled(), true);
  assert.equal(isIstanbulWeekday(new Date('2026-11-13T05:30:00Z')), true); // Cuma
  assert.equal(isIstanbulWeekday(new Date('2026-11-14T05:30:00Z')), false); // Cumartesi
  assert.equal(isIstanbulWeekday(new Date('2026-11-15T21:30:00Z')), true); // Pazartesi 00:30
  process.env.ECON_EMPTY_NOTES = '0';
  try {
    assert.equal(emptyNotesEnabled(), false);
  } finally {
    delete process.env.ECON_EMPTY_NOTES;
  }
});

test('haftalik on bakis gunu ve acma/kapama env ile ayarlanir', () => {
  assert.equal(weeklyEnabled(), true);
  assert.equal(isWeeklyDay(new Date('2026-11-09T05:30:00Z')), true); // Pazartesi
  assert.equal(isWeeklyDay(new Date('2026-11-10T05:30:00Z')), false); // Salı
  process.env.ECON_WEEKLY_DAY = '3';
  process.env.ECON_WEEKLY_ENABLED = '0';
  try {
    assert.equal(isWeeklyDay(new Date('2026-11-11T05:30:00Z')), true); // Çarşamba
    assert.equal(weeklyEnabled(), false);
  } finally {
    delete process.env.ECON_WEEKLY_DAY;
    delete process.env.ECON_WEEKLY_ENABLED;
  }
});


// --- Mesaj formatlari ---

test('gunluk ajanda saat, ulke, Turkce baslik ve beklenti icerir', () => {
  const now = new Date('2026-11-14T05:30:00Z'); // 08:30 TSİ
  const text = formatAgenda([
    event('cpi', '2026-11-10T08:30:00-05:00', { title: 'CPI m/m', forecast: '0.3%', previous: '0.6%' }), // 16:30 TSİ
  ], now);

  assert.match(text, /📅 Ekonomik Takvim/);
  assert.match(text, /14\.11\.2026/);
  assert.match(text, /Bugünün öne çıkan verileri \(ABD\):/);
  assert.match(text, /16:30 — ABD TÜFE \(aylık\)/);
  assert.match(text, /Beklenti: 0,3% · Önceki: 0,6%/);
  assert.match(text, /Saatler TSİ\./);
  assert.doesNotMatch(text, /Gerçekleşen|actual/i);
  assert.equal(formatAgenda([], now), null);
});

test('ajanda basligi ECON_COUNTRIES ile degisir', () => {
  process.env.ECON_COUNTRIES = 'USD,EUR';
  try {
    const text = formatAgenda([event('cpi', '2026-11-10T13:30:00Z')], new Date('2026-11-14T05:30:00Z'));
    assert.match(text, /Bugünün öne çıkan verileri \(ABD, Euro Bölgesi\):/);
  } finally {
    delete process.env.ECON_COUNTRIES;
  }
});

test('tek olay hatirlatmasi kalan dakikayi ve degerleri yazar', () => {
  const now = new Date('2026-11-10T13:15:00Z'); // 16:15 TSİ
  const text = formatEventReminder([
    event('cpi', '2026-11-10T13:30:00Z', { title: 'CPI m/m', forecast: '0.3%', previous: '0.6%' }),
  ], now);

  assert.match(text, /⏰ 15 dk sonra: ABD TÜFE \(aylık\)/);
  assert.match(text, /16:30 TSİ/);
  assert.match(text, /Beklenti: 0,3%/);
  assert.match(text, /Yüksek etkili veri/);
  assert.doesNotMatch(text, /Gerçekleşen|actual/i);
});

test('birden fazla yaklasan veri tek mesajda toplanir', () => {
  const now = new Date('2026-11-10T13:15:00Z');
  const text = formatEventReminder([
    event('cpi', '2026-11-10T13:30:00Z', { title: 'CPI m/m' }),
    event('ppi', '2026-11-10T13:40:00Z', { title: 'PPI m/m' }),
  ], now);

  assert.match(text, /⏰ Yaklaşan veriler/);
  assert.match(text, /ABD TÜFE \(aylık\)/);
  assert.match(text, /ABD ÜFE \(aylık\)/);
  assert.match(text, /Yüksek etkili veriler/);
});

// --- Hatirlatma penceresi / sessiz saatler / dedupe ---

test('hatirlatma yalnizca olaydan 5-25 dk once ve bir kez gonderilir', () => {
  const now = new Date('2026-11-10T12:00:00Z'); // 15:00 TSİ
  const events = [
    event('too-soon', '2026-11-10T12:04:00Z'), // 4 dk
    event('min', '2026-11-10T12:05:00Z'), // 5 dk
    event('mid', '2026-11-10T12:15:00Z'), // 15 dk
    event('max', '2026-11-10T12:25:00Z'), // 25 dk
    event('too-far', '2026-11-10T12:26:00Z'), // 26 dk
    event('passed', '2026-11-10T11:55:00Z'), // -5 dk
    event('already-sent', '2026-11-10T12:10:00Z'),
  ];

  assert.deepEqual(
    dueReminders(events, {}, now).map((e) => e.key),
    ['min', 'already-sent', 'mid', 'max'],
  );

  const sent = { 'already-sent': new Date().toISOString() };
  assert.deepEqual(
    dueReminders(events, { sent }, now).map((e) => e.key),
    ['min', 'mid', 'max'],
  );

  const state = { sent: { min: new Date().toISOString() } };
  assert.deepEqual(
    dueReminders(events, state, now).map((e) => e.key),
    ['already-sent', 'mid', 'max'],
  );
});

test('sessiz saatlerde (23:00-08:00 TSİ) hatirlatma gitmez', () => {
  const early = event('early', '2026-11-10T05:00:00Z'); // 08:00 TSİ
  const night = event('night', '2026-11-10T04:50:00Z'); // 07:50 TSİ
  const late = event('late', '2026-11-10T20:00:00Z'); // 23:00 TSİ

  assert.deepEqual(dueReminders([night], {}, new Date('2026-11-10T04:35:00Z')).map((e) => e.key), []);
  assert.deepEqual(dueReminders([early], {}, new Date('2026-11-10T04:45:00Z')).map((e) => e.key), ['early']);
  assert.deepEqual(dueReminders([late], {}, new Date('2026-11-10T19:45:00Z')).map((e) => e.key), []);
});

test('gunluk ajanda penceresi 08:30 TSİ ve env ile ayarlanabilir', () => {
  delete process.env.ECON_AGENDA_START;
  delete process.env.ECON_AGENDA_WINDOW_MIN;
  try {
    assert.equal(agendaWindow(new Date('2026-11-14T05:30:00Z')), true); // 08:30
    assert.equal(agendaWindow(new Date('2026-11-14T06:14:00Z')), true); // 09:14
    assert.equal(agendaWindow(new Date('2026-11-14T06:15:00Z')), false); // 09:15
    assert.equal(agendaWindow(new Date('2026-11-14T05:29:00Z')), false); // 08:29

    process.env.ECON_AGENDA_START = '14:30';
    process.env.ECON_AGENDA_WINDOW_MIN = '30';
    assert.equal(agendaWindow(new Date('2026-11-14T11:30:00Z')), true); // 14:30
    assert.equal(agendaWindow(new Date('2026-11-14T12:00:00Z')), false); // 15:00
  } finally {
    delete process.env.ECON_AGENDA_START;
    delete process.env.ECON_AGENDA_WINDOW_MIN;
  }
});

// --- Rota / zamanlayici / durum ---

test('kaynak 429 verirse tekrar edilir, sonra edge-cache proxy denenir', async () => {
  process.env.ECON_CALENDAR_PROXY_URL = 'https://proxy.test/eco-cal';
  process.env.ECON_FETCH_RETRY_MS = '0';
  const real = globalThis.fetch;
  let directCalls = 0;

  globalThis.fetch = async (url) => {
    if (String(url).includes('faireconomy')) {
      directCalls++;
      return new Response('rate limited', { status: 429 });
    }
    return new Response(JSON.stringify({
      ok: true,
      items: [row('CPI m/m', 'USD', '2026-11-10T08:30:00-05:00', 'High', '0.3%', '0.6%')],
    }), { status: 200 });
  };

  try {
    const out = await fetchCalendarRows();
    assert.equal(out.ok, true);
    assert.equal(out.via, 'proxy');
    assert.equal(out.rows.length, 1);
    assert.equal(directCalls, 2); // ilk istek + 429 tekrari
  } finally {
    globalThis.fetch = real;
    delete process.env.ECON_CALENDAR_PROXY_URL;
    delete process.env.ECON_FETCH_RETRY_MS;
  }
});

test('dogrudan kaynak calisirsa proxy cagrilmaz', async () => {
  process.env.ECON_CALENDAR_PROXY_URL = 'https://proxy.test/eco-cal';
  const real = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return new Response(JSON.stringify([
      row('CPI m/m', 'USD', '2026-11-10T08:30:00-05:00', 'High', '0.3%', '0.6%'),
    ]), { status: 200 });
  };

  try {
    const out = await fetchCalendarRows();
    assert.equal(out.ok, true);
    assert.equal(out.via, 'feed');
    assert.equal(calls.some((u) => u.includes('proxy.test')), false);
  } finally {
    globalThis.fetch = real;
    delete process.env.ECON_CALENDAR_PROXY_URL;
  }
});

test('kaynak ve proxy birlikte cokerse hata doner', async () => {
  process.env.ECON_CALENDAR_PROXY_URL = 'https://proxy.test/eco-cal';
  process.env.ECON_FETCH_RETRY_MS = '0';
  const real = globalThis.fetch;

  globalThis.fetch = async (url) => new Response('down', {
    status: String(url).includes('faireconomy') ? 429 : 500,
  });

  try {
    const out = await fetchCalendarRows();
    assert.equal(out.ok, false);
    assert.match(out.error, /http_/);
  } finally {
    globalThis.fetch = real;
    delete process.env.ECON_CALENDAR_PROXY_URL;
    delete process.env.ECON_FETCH_RETRY_MS;
  }
});

test('son basarili takvim kopyasi dogrulanir ve 48 saat kullanilir', () => {
  const now = new Date('2026-11-14T05:30:00Z');
  const cache = parseCache({
    fetchedAt: '2026-11-14T04:00:00Z',
    via: 'feed',
    events: [
      { key: 'USD|cpi|1', title: 'CPI m/m', country: 'USD', impact: 'High', at: at('2026-11-14T13:30:00Z'), forecast: '0.3%', previous: '0.6%' },
      { key: 'gecersiz', title: 'Eksik alan' }, // country/impact/at yok
    ],
  });

  assert.equal(cache.events.length, 1);
  assert.equal(cache.via, 'feed');
  assert.equal(cacheUsable(cache, now), true);
  assert.equal(cacheUsable(cache, new Date('2026-11-20T05:30:00Z')), false); // > 48 saat
  assert.equal(cacheUsable(parseCache({ fetchedAt: '2026-11-14T04:00:00Z', events: [] }), now), false);
  assert.equal(parseCache(null), null);
  assert.equal(cacheWriteDue(cache, new Date('2026-11-14T04:10:00Z'), 30), false);
  assert.equal(cacheWriteDue(cache, new Date('2026-11-14T04:40:00Z'), 30), true);
  assert.equal(cacheWriteDue(null, now, 30), true);
});

test('api/ai rotasi ve GitHub Actions adimi takvimi tetikler', () => {
  const api = fs.readFileSync(new URL('../api/ai.mjs', import.meta.url), 'utf8');
  assert.match(api, /import economicCalendarHandler from '\.\.\/lib\/economic-calendar\.mjs'/);
  assert.match(api, /req\.query\?\.calendar === '1'/);

  const workflow = fs.readFileSync(new URL('../.github/workflows/news-poll.yml', import.meta.url), 'utf8');
  assert.match(workflow, /https:\/\/alfa-trader\.com\/api\/ai\?calendar=1/);
  assert.match(workflow, /x-github-oidc-token/);
});

test('takvim durumu ayri satirda tutulur ve actual sonucu iddia etmez', () => {
  const src = fs.readFileSync(new URL('../lib/economic-calendar.mjs', import.meta.url), 'utf8');
  assert.match(src, /const STATE_ROW = 'econ_calendar_state'/);
  assert.match(src, /skipped: 'source_unavailable'/);
  assert.match(src, /skipped: 'nothing_due'/);
  assert.match(src, /skipped: 'no_events_today'/);
  // Haftalik on bakis ayri bir tur olarak gonderilir ve haftada bir kez.
  assert.match(src, /kind: 'weekly'/);
  assert.match(src, /isWeeklyDay\(now\)/);
  assert.match(src, /state\.weekKey !== weekKey/);
  assert.match(src, /weekSentAt: state\.weekSentAt \|\| null/);
  // Bos gun/hafta notlari kapatilabilir.
  assert.match(src, /formatAgendaEmpty\(now\)/);
  assert.match(src, /formatWeeklyEmpty\(now\)/);
  assert.match(src, /emptyNotesEnabled\(\)/);
  // Hatirlatma, gunluk ajanda kapisini ilerletmemeli.
  assert.match(src, /day: state\.day \|\| null/);
  assert.doesNotMatch(src, /day: state\.day \|\| day/);
  // Kaynak kesintisinde son basarili kopya kullanilir.
  assert.match(src, /cacheUsable\(state\.cache, now\)/);
  assert.match(src, /filterCalendarEvents\(state\.cache\.events\)/);
  assert.match(src, /actual.*yoktur|yoktur.*actual/is);
  // Gerçekleşen veri sonrası yorum bu hatta yok.
  assert.doesNotMatch(src, /Gerçekleşen veri/);
});
