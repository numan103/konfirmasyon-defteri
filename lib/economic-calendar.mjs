// Ekonomik takvim uyarilari.
//
// Kaynak: ForexFactory haftalik JSON (ucretsiz, herkese acik):
// https://nfs.faireconomy.media/ff_calendar_thisweek.json
//
// Bu hat yalnizca onceden planlanmis veri saatlerini ve beklenti/onceki
// degerleri kullanir. "Actual" (gerceklesen) veri bu akista yoktur; veri
// sonrasi yorum market-news hattinin isidir. Boylece AI'nin rakam uydurma
// riski olmadan, deterministik bir takvim bildirimi uretilir.

import { sendTelegram } from './telegram.mjs';
import { istanbulDateKey, istanbulClock } from './market-news.mjs';

const FEED = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
const DEFAULT_PROXY_FEED = 'https://alfa-trader.com/api/eco-cal';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zvnjslmptwmnuhftgqsr.supabase.co';
const FALLBACK_PUB = 'sb_publishable_bReG5UKaWcQkU0Z9GnGiJQ_0T4_Qm9X';
const STATE_ROW = 'econ_calendar_state';

const DEFAULT_AGENDA_START = '08:30';
const DEFAULT_AGENDA_WINDOW = 45;
const DEFAULT_REMINDER_MIN = 5;
const DEFAULT_REMINDER_MAX = 25;
const DEFAULT_REMINDER_START_HOUR = 8;
const DEFAULT_REMINDER_END_HOUR = 23;

const TITLE_TR = [
  [/^Core CPI m\/m$/i, 'Çekirdek TÜFE (aylık)'],
  [/^CPI m\/m$/i, 'TÜFE (aylık)'],
  [/^Core CPI y\/y$/i, 'Çekirdek TÜFE (yıllık)'],
  [/^CPI y\/y$/i, 'TÜFE (yıllık)'],
  [/^Core PPI m\/m$/i, 'Çekirdek ÜFE (aylık)'],
  [/^PPI m\/m$/i, 'ÜFE (aylık)'],
  [/^Core PPI y\/y$/i, 'Çekirdek ÜFE (yıllık)'],
  [/^PPI y\/y$/i, 'ÜFE (yıllık)'],
  [/^Non-Farm Employment Change$/i, 'Tarım Dışı İstihdam'],
  [/^Unemployment Rate$/i, 'İşsizlik Oranı'],
  [/^Average Hourly Earnings m\/m$/i, 'Ortalama Saatlik Kazanç (aylık)'],
  [/^Federal Funds Rate$/i, 'Fed Faiz Kararı'],
  [/^FOMC Statement$/i, 'FOMC Açıklaması'],
  [/^FOMC Economic Projections$/i, 'FOMC Ekonomik Projeksiyonları'],
  [/^Fed Chair Powell Speaks$/i, 'Fed Başkanı Powell Konuşuyor'],
  [/^GDP q\/q$/i, 'GSYH (çeyreklik)'],
  [/^Retail Sales m\/m$/i, 'Perakende Satışlar (aylık)'],
  [/^ISM Manufacturing PMI$/i, 'ISM İmalat PMI'],
  [/^ISM Services PMI$/i, 'ISM Hizmet PMI'],
  [/^Initial Jobless Claims$/i, 'Haftalık İşsizlik Başvuruları'],
  [/^PCE Price Index m\/m$/i, 'PCE Enflasyonu (aylık)'],
  [/^Core PCE Price Index m\/m$/i, 'Çekirdek PCE (aylık)'],
];

function clean(value) {
  return String(value == null ? '' : value).trim();
}

function csvEnv(name, fallback) {
  const raw = clean(process.env[name]);
  const list = (raw ? raw.split(/[,\s]+/) : []).map((x) => x.trim()).filter(Boolean);
  return list.length ? list : fallback;
}

function countries() {
  return csvEnv('ECON_COUNTRIES', ['USD']).map((x) => x.toUpperCase());
}

function impacts() {
  return csvEnv('ECON_IMPACTS', ['High']).map((x) => x.toLowerCase());
}

function intEnv(name, fallback, min, max) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : fallback;
}

function countryLabel(country) {
  const c = clean(country).toUpperCase();
  if (c === 'USD') return 'ABD';
  if (c === 'EUR') return 'Euro Bölgesi';
  if (c === 'CNY') return 'Çin';
  if (c === 'ALL') return 'Global';
  return c || 'Piyasa';
}

function turkishTitle(title) {
  const t = clean(title);
  for (const [re, tr] of TITLE_TR) if (re.test(t)) return tr;
  return t;
}

function formatValue(value) {
  const s = clean(value);
  if (!s) return '';
  // 0.3% -> 0,3%; 250K -> 250K
  return /^-?\d+(?:\.\d+)?%$/.test(s) ? s.replace('.', ',') : s;
}

function hhmm(at) {
  try {
    return new Intl.DateTimeFormat('tr-TR', {
      timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).format(new Date(at));
  } catch {
    return '--:--';
  }
}

function dayLabel(now) {
  try {
    return new Intl.DateTimeFormat('tr-TR', {
      timeZone: 'Europe/Istanbul', dateStyle: 'short',
    }).format(now);
  } catch {
    return istanbulDateKey(now);
  }
}

function valueLine(event) {
  const parts = [];
  if (event.forecast) parts.push('Beklenti: ' + formatValue(event.forecast));
  if (event.previous) parts.push('Önceki: ' + formatValue(event.previous));
  return parts.join(' · ');
}

// Ajanda basligi ECON_COUNTRIES ile degisir; "ABD" sabit yazilmaz.
function agendaScopeLabel() {
  const list = countries().map(countryLabel).filter(Boolean);
  return list.length ? list.join(', ') : 'piyasa';
}

// FF JSON satirlarini tekilleştirip normalize eder.
export function parseCalendarRows(rows) {
  if (!Array.isArray(rows)) return [];
  const unique = new Map();
  for (const row of rows) {
    const title = clean(row && row.title);
    const country = clean(row && row.country).toUpperCase();
    const impact = clean(row && row.impact) || 'Low';
    const at = Date.parse(clean(row && row.date));
    if (!title || !country || !Number.isFinite(at)) continue;
    const minute = Math.floor(at / 60000);
    const key = country + '|' + title.toLowerCase() + '|' + minute;
    if (unique.has(key)) continue;
    unique.set(key, {
      key,
      title,
      country,
      impact,
      at,
      forecast: clean(row.forecast),
      previous: clean(row.previous),
    });
  }
  return [...unique.values()].sort((a, b) => a.at - b.at);
}

export function filterCalendarEvents(events, opts = {}) {
  const countryList = (opts.countries || countries()).map((x) => x.toUpperCase());
  const impactList = (opts.impacts || impacts()).map((x) => x.toLowerCase());
  return (events || []).filter((e) => {
    return e && countryList.includes(clean(e.country).toUpperCase())
      && impactList.includes(clean(e.impact).toLowerCase());
  });
}

export function eventsForDay(events, dayKey = istanbulDateKey()) {
  return (events || [])
    .filter((e) => Number.isFinite(e.at) && istanbulDateKey(new Date(e.at)) === dayKey)
    .sort((a, b) => a.at - b.at);
}

const WEEKDAY_TR = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

// Haftanin ilk gunu (Pazartesi) Istanbul tarihine gore.
export function weekStartKey(now = new Date()) {
  const key = istanbulDateKey(now);
  const d = new Date(key + 'T00:00:00Z');
  const wd = d.getUTCDay(); // 0 = Pazar
  const back = wd === 0 ? 6 : wd - 1;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

function weekEndKey(startKey) {
  const d = new Date(startKey + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().slice(0, 10);
}

export function eventsForWeek(events, startKey = weekStartKey()) {
  const endKey = weekEndKey(startKey);
  return (events || [])
    .filter((e) => {
      if (!e || !Number.isFinite(e.at)) return false;
      const k = istanbulDateKey(new Date(e.at));
      return k >= startKey && k <= endKey;
    })
    .sort((a, b) => a.at - b.at);
}

function weekdayTr(at) {
  const key = istanbulDateKey(new Date(at));
  return WEEKDAY_TR[new Date(key + 'T00:00:00Z').getUTCDay()];
}

function dayKeyLabel(key) {
  try {
    return new Intl.DateTimeFormat('tr-TR', {
      timeZone: 'Europe/Istanbul', day: 'numeric', month: 'long', year: 'numeric',
    }).format(new Date(key + 'T12:00:00Z'));
  } catch {
    return key;
  }
}

// Haftalik on bakis: hafta basinda o haftanin one cikan verileri.
export function formatWeeklyOutlook(events, now = new Date()) {
  const list = (events || [])
    .filter((e) => e && Number.isFinite(e.at))
    .slice()
    .sort((a, b) => a.at - b.at);
  if (!list.length) return null;
  const startKey = weekStartKey(now);
  const lines = [
    '🗓️ Bu Haftanın Ekonomik Takvimi',
    dayKeyLabel(startKey) + ' – ' + dayKeyLabel(weekEndKey(startKey)) + ' · TSİ',
    '',
    'Bu hafta öne çıkan ' + agendaScopeLabel() + ' verileri:',
  ];
  const MAX = 18;
  for (const e of list.slice(0, MAX)) {
    lines.push('• ' + weekdayTr(e.at) + ' ' + hhmm(e.at) + ' — ' + countryLabel(e.country) + ' ' + turkishTitle(e.title));
    const values = valueLine(e);
    if (values) lines.push('  ' + values);
  }
  if (list.length > MAX) lines.push('• … ve ' + (list.length - MAX) + ' veri daha');
  lines.push('');
  lines.push('Saatler TSİ. Kaynak: Forex Factory; resmî kurum tahmini değildir.');
  return lines.join('\n');
}

// Haftada/hic veri yoksa kisa bilgi notu (varsayilan acik).
export function formatWeeklyEmpty(now = new Date()) {
  const startKey = weekStartKey(now);
  return [
    '🗓️ Bu Haftanın Ekonomik Takvimi',
    dayKeyLabel(startKey) + ' – ' + dayKeyLabel(weekEndKey(startKey)) + ' · TSİ',
    '',
    'Bu hafta öne çıkan yüksek etkili ' + agendaScopeLabel() + ' verisi yok.',
  ].join('\n');
}

// Gunluk ajanda: bugun kalan onemli veriler.
export function formatAgenda(events, now = new Date()) {
  const list = (events || []).slice().sort((a, b) => a.at - b.at);
  if (!list.length) return null;
  const lines = [
    '📅 Ekonomik Takvim',
    dayLabel(now) + ' · TSİ',
    '',
    'Bugünün öne çıkan verileri (' + agendaScopeLabel() + '):',
  ];
  for (const e of list) {
    lines.push('• ' + hhmm(e.at) + ' — ' + countryLabel(e.country) + ' ' + turkishTitle(e.title));
    const values = valueLine(e);
    if (values) lines.push('  ' + values);
  }
  lines.push('');
  lines.push('Saatler TSİ. Beklenti/önceki değerler Forex Factory takviminden; resmî kurum tahmini değildir.');
  return lines.join('\n');
}

export function formatAgendaEmpty(now = new Date()) {
  return [
    '📅 Ekonomik Takvim',
    dayLabel(now) + ' · TSİ',
    '',
    'Bugün öne çıkan yüksek etkili ' + agendaScopeLabel() + ' verisi yok.',
  ].join('\n');
}

// 15 dakika oncesi hatirlatmasi. Tek olayda kalan dakika yazilir.
export function formatEventReminder(events, now = new Date()) {
  const list = (events || []).slice().sort((a, b) => a.at - b.at);
  if (!list.length) return null;
  const lines = [];
  if (list.length === 1) {
    const mins = Math.max(1, Math.round((list[0].at - now.getTime()) / 60000));
    lines.push('⏰ ' + mins + ' dk sonra: ' + countryLabel(list[0].country) + ' ' + turkishTitle(list[0].title));
    lines.push(hhmm(list[0].at) + ' TSİ');
    const values = valueLine(list[0]);
    if (values) lines.push(values);
  } else {
    lines.push('⏰ Yaklaşan veriler');
    for (const e of list) {
      lines.push('• ' + hhmm(e.at) + ' — ' + countryLabel(e.country) + ' ' + turkishTitle(e.title));
      const values = valueLine(e);
      if (values) lines.push('  ' + values);
    }
  }
  lines.push('');
  lines.push(list.length === 1
    ? 'Yüksek etkili veri; BTC ve altında oynaklık artabilir.'
    : 'Yüksek etkili veriler; BTC ve altında oynaklık artabilir.');
  return lines.join('\n');
}

function sentMap(state) {
  return state && state.sent && typeof state.sent === 'object' && !Array.isArray(state.sent)
    ? state.sent
    : {};
}

// Pencere: olaydan 5-25 dk once, 08:00-23:00 TSİ arasinda, daha once
// gonderilmemis olmali. Ayni calistirmada birden fazla olay varsa hepsi
// tek mesajda toplanir.
export function dueReminders(events, state = {}, now = new Date(), opts = {}) {
  const minLead = opts.minLeadMin == null ? DEFAULT_REMINDER_MIN : Number(opts.minLeadMin);
  const maxLead = opts.maxLeadMin == null ? DEFAULT_REMINDER_MAX : Number(opts.maxLeadMin);
  const startHour = opts.startHour == null ? intEnv('ECON_REMINDER_START_HOUR', DEFAULT_REMINDER_START_HOUR, 0, 23) : Number(opts.startHour);
  const endHour = opts.endHour == null ? intEnv('ECON_REMINDER_END_HOUR', DEFAULT_REMINDER_END_HOUR, 1, 24) : Number(opts.endHour);
  const sent = sentMap(state);
  const t = now.getTime();
  return (events || []).filter((e) => {
    if (!e || !Number.isFinite(e.at) || sent[e.key]) return false;
    const lead = (e.at - t) / 60000;
    if (lead < minLead || lead > maxLead) return false;
    const hour = istanbulClock(new Date(e.at)).hour;
    return hour >= startHour && hour < endHour;
  }).sort((a, b) => a.at - b.at);
}

function parseClock(text, fallback) {
  const m = clean(text).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return fallback;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return fallback;
  return h * 60 + min;
}

export function agendaWindow(now = new Date()) {
  const start = parseClock(process.env.ECON_AGENDA_START || DEFAULT_AGENDA_START, 8 * 60 + 30);
  const span = intEnv('ECON_AGENDA_WINDOW_MIN', DEFAULT_AGENDA_WINDOW, 5, 180);
  const diff = istanbulClock(now).minutes - start;
  return diff >= 0 && diff < span;
}

export function weeklyEnabled() {
  return clean(process.env.ECON_WEEKLY_ENABLED) !== '0';
}

// Veri olmayan gun/hafta icin kisa "veri yok" notu (varsayilan acik).
export function emptyNotesEnabled() {
  return clean(process.env.ECON_EMPTY_NOTES) !== '0';
}

// Istanbul'da Pazartesi-Cuma mi?
export function isIstanbulWeekday(now = new Date()) {
  const key = istanbulDateKey(now);
  const wd = new Date(key + 'T00:00:00Z').getUTCDay();
  return wd >= 1 && wd <= 5;
}

// Haftalik on bakis gunu: ISO 1 = Pazartesi ... 7 = Pazar.
export function isWeeklyDay(now = new Date()) {
  const key = istanbulDateKey(now);
  const wd = new Date(key + 'T00:00:00Z').getUTCDay();
  const iso = wd === 0 ? 7 : wd;
  return iso === intEnv('ECON_WEEKLY_DAY', 1, 1, 7);
}

// ---- Durum (Supabase edu_shared) ----

function stateKey(write) {
  const secret = clean(process.env.SUPABASE_SERVICE_ROLE);
  if (write && secret) return secret;
  return clean(process.env.SUPABASE_PUBLISHABLE || FALLBACK_PUB);
}

function sbHeaders(key) {
  const h = { apikey: key, 'Content-Type': 'application/json' };
  if (!key.startsWith('sb_secret_')) h.Authorization = 'Bearer ' + key;
  return h;
}

function pruneSent(sent, now = new Date()) {
  const out = {};
  const cutoff = now.getTime() - 3 * 86400000;
  for (const [key, iso] of Object.entries(sent || {})) {
    const t = Date.parse(iso);
    if (Number.isFinite(t) && t >= cutoff) out[key] = iso;
  }
  const keys = Object.keys(out);
  if (keys.length > 200) {
    for (const key of keys.slice(0, keys.length - 200)) delete out[key];
  }
  return out;
}

function cacheMaxAgeHours() {
  return intEnv('ECON_CACHE_MAX_AGE_HOURS', 48, 1, 168);
}

function cacheWriteMin() {
  return intEnv('ECON_CACHE_WRITE_MIN', 30, 0, 1440);
}

// Supabase'de saklanan son basarili takvim kopyasini dogrular.
export function parseCache(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const fetched = Date.parse(raw.fetchedAt);
  if (!Number.isFinite(fetched)) return null;
  const byKey = new Map();
  for (const e of Array.isArray(raw.events) ? raw.events : []) {
    const at = Number(e && e.at);
    if (!e || typeof e.key !== 'string' || !e.key) continue;
    if (typeof e.title !== 'string' || !e.title) continue;
    if (typeof e.country !== 'string' || !e.country) continue;
    if (typeof e.impact !== 'string' || !e.impact) continue;
    if (!Number.isFinite(at)) continue;
    byKey.set(e.key, {
      key: e.key,
      title: e.title,
      country: e.country,
      impact: e.impact,
      at,
      forecast: typeof e.forecast === 'string' ? e.forecast : '',
      previous: typeof e.previous === 'string' ? e.previous : '',
    });
  }
  return {
    fetchedAt: new Date(fetched).toISOString(),
    via: typeof raw.via === 'string' ? raw.via : 'cache',
    events: [...byKey.values()].sort((a, b) => a.at - b.at).slice(0, 500),
  };
}

export function cacheUsable(cache, now = new Date(), maxAgeHours = cacheMaxAgeHours()) {
  if (!cache || !Array.isArray(cache.events) || !cache.events.length) return false;
  const age = now.getTime() - Date.parse(cache.fetchedAt);
  return Number.isFinite(age) && age >= -5 * 60000 && age <= maxAgeHours * 3600000;
}

export function cacheWriteDue(cache, now = new Date(), minMinutes = cacheWriteMin()) {
  if (!cache) return true;
  const age = now.getTime() - Date.parse(cache.fetchedAt);
  if (!Number.isFinite(age)) return true;
  if (age < -5 * 60000) return true; // saat kaymasi: yeniden yaz
  return age >= minMinutes * 60000;
}

export async function readCalendarState() {
  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/edu_shared?id=eq.' + STATE_ROW + '&select=data', {
      headers: sbHeaders(stateKey(false)),
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return { day: null, agendaSentAt: null, sent: {}, weekKey: null, weekSentAt: null };
    const rows = await r.json();
    const data = (rows && rows[0] && rows[0].data) || {};
    return {
      day: typeof data.day === 'string' ? data.day : null,
      agendaSentAt: typeof data.agendaSentAt === 'string' ? data.agendaSentAt : null,
      sent: sentMap(data),
      cache: parseCache(data.cache),
      weekKey: typeof data.weekKey === 'string' ? data.weekKey : null,
      weekSentAt: typeof data.weekSentAt === 'string' ? data.weekSentAt : null,
    };
  } catch {
    return { day: null, agendaSentAt: null, sent: {}, cache: null, weekKey: null, weekSentAt: null };
  }
}

async function saveCalendarState(state) {
  const key = clean(process.env.SUPABASE_SERVICE_ROLE);
  if (!key) return false;
  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/edu_shared', {
      method: 'POST',
      headers: { ...sbHeaders(key), Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({
        id: STATE_ROW,
        data: {
          day: state.day || null,
          agendaSentAt: state.agendaSentAt || null,
          sent: pruneSent(state.sent),
          cache: parseCache(state.cache) || null,
          weekKey: state.weekKey || null,
          weekSentAt: state.weekSentAt || null,
          updatedAt: new Date().toISOString(),
        },
      }),
      signal: AbortSignal.timeout(6000),
    });
    return r.ok;
  } catch {
    return false;
  }
}

function proxyFeed() {
  return clean(process.env.ECON_CALENDAR_PROXY_URL) || DEFAULT_PROXY_FEED;
}

function retryDelayMs() {
  const n = Number(process.env.ECON_FETCH_RETRY_MS);
  return Number.isFinite(n) && n >= 0 && n <= 5000 ? Math.round(n) : 1200;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchOnce(url) {
  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AlfaTraders/1.0',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(9000),
    });
    if (!r.ok) return { ok: false, status: r.status, error: 'http_' + r.status };
    let body;
    try { body = await r.json(); } catch { return { ok: false, status: r.status, error: 'invalid_json' }; }
    return { ok: true, status: r.status, body };
  } catch {
    return { ok: false, status: 0, error: 'network' };
  }
}

// Kaynak onceligi:
// 1) ForexFactory dogrudan (varsa 429/5xx icin tek tekrar)
// 2) Site ici edge-cache'li proxy (`api/eco-cal`); farkli fonksiyon/IP uzerinden
//    calistigi icin dogrudan istek engellendiginde kurtarir.
// 3) Ikisi de olmezse cagiran taraf Supabase'deki son basarili kopyayi kullanir.
export async function fetchCalendarRows() {
  let lastError = 'source_unavailable';

  const direct = await fetchOnce(FEED);
  if (direct.ok && Array.isArray(direct.body)) return { ok: true, rows: direct.body, via: 'feed' };
  if (direct.ok) lastError = 'invalid_payload';
  else lastError = direct.error;

  if (!direct.ok && (direct.status === 429 || direct.status >= 500)) {
    await sleep(retryDelayMs());
    const retry = await fetchOnce(FEED);
    if (retry.ok && Array.isArray(retry.body)) return { ok: true, rows: retry.body, via: 'feed' };
    if (!retry.ok) lastError = retry.error;
  }

  const proxy = await fetchOnce(proxyFeed());
  if (proxy.ok && proxy.body && proxy.body.ok === true && Array.isArray(proxy.body.items)) {
    return { ok: true, rows: proxy.body.items, via: 'proxy' };
  }
  if (!proxy.ok) lastError = proxy.error;
  else if (lastError === 'source_unavailable') lastError = 'invalid_payload';

  return { ok: false, error: lastError };
}

function targetChat() {
  const chat = clean(
    process.env.ECON_CHAT_ID || process.env.NEWS_CHAT_ID || process.env.TG_TRADE_CHAT_ID || process.env.TG_CHAT_ID
  );
  const raw = process.env.ECON_THREAD != null ? process.env.ECON_THREAD
    : process.env.NEWS_THREAD != null ? process.env.NEWS_THREAD
    : process.env.TG_TRADE_THREAD != null ? process.env.TG_TRADE_THREAD
    : process.env.MACRO_TARGET_THREAD != null ? process.env.MACRO_TARGET_THREAD
    : process.env.TG_THREAD;
  const n = raw == null || clean(raw) === '' || clean(raw) === '0' ? null : Number(clean(raw));
  return { chat, thread: Number.isSafeInteger(n) && n > 0 ? n : null };
}

async function isAdmin(req) {
  try {
    const { requestUser } = await import('./auth.mjs');
    const user = await requestUser(req);
    return !!(user && user.admin);
  } catch {
    return false;
  }
}

async function sendMessage(text) {
  const { chat, thread } = targetChat();
  if (!process.env.TG_BOT_TOKEN || !chat) return { ok: false, error: 'telegram_not_configured' };
  try {
    const out = await sendTelegram(text, chat, thread, null, { preview: false, timeout: 20000 });
    if (!(out && out.ok && out.result && out.result.message_id)) {
      return { ok: false, error: 'telegram_rejected', detail: out && out.description ? out.description : null };
    }
    return { ok: true, messageId: out.result.message_id };
  } catch (e) {
    return { ok: false, error: 'telegram_network' };
  }
}

export default async function economicCalendarHandler(req, res) {
  const url = new URL(req.url || '/api/ai', 'http://localhost');
  const secret = clean(process.env.ECON_ALERT_SECRET || process.env.NEWS_ALERT_SECRET || process.env.MACRO_CRON_SECRET || process.env.CRON_SECRET);
  const auth = String(req.headers?.authorization || '');
  const secretOk = !!secret && auth === 'Bearer ' + secret;
  const queryOk = !!secret && url.searchParams.get('key') === secret;
  const ua = String(req.headers?.['user-agent'] || '');
  const cronHeader = String(req.headers?.['x-vercel-cron'] || '') === '1' || /^vercel-cron\//i.test(ua);

  const oidcToken = String(req.headers?.['x-github-oidc-token'] || '').trim();
  let oidc = null;
  let oidcReason = null;
  if (oidcToken) {
    try {
      const { verifyGithubOidc } = await import('./github-oidc.mjs');
      oidc = await verifyGithubOidc(oidcToken, { onError: (r) => { oidcReason = r; } });
    } catch (e) {
      oidcReason = 'verify_exception:' + String(e?.message || e).slice(0, 60);
    }
  }
  const oidcOk = !!oidc;
  const admin = !secretOk && !queryOk && !cronHeader && !oidcOk ? await isAdmin(req) : false;

  console.log('econ-calendar poll ' + JSON.stringify({
    ua: ua.slice(0, 90),
    secretOk, queryOk, cronHeader,
    oidcHeader: !!oidcToken, oidcOk,
    oidcReason: oidcReason || null,
    dryRun: url.searchParams.get('dryRun') === '1',
    force: url.searchParams.get('force') === '1',
    weekly: url.searchParams.get('weekly') === '1',
  }));

  if (!secretOk && !queryOk && !cronHeader && !oidcOk && !admin) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const dryRun = url.searchParams.get('dryRun') === '1';
  const force = url.searchParams.get('force') === '1';
  const now = new Date();
  const day = istanbulDateKey(now);

  const state = await readCalendarState();
  const feed = await fetchCalendarRows();
  let events = [];
  let source = 'feed';
  let stale = false;

  if (feed.ok) {
    events = filterCalendarEvents(parseCalendarRows(feed.rows));
    source = feed.via || 'feed';
    // Basarili veriyi Supabase'e kopyala. Kaynak 429/kesinti verirse son
    // basarili kopya ECON_CACHE_MAX_AGE_HOURS (varsayilan 48) saat kullanilir.
    if (!dryRun && clean(process.env.SUPABASE_SERVICE_ROLE) && cacheWriteDue(state.cache, now)) {
      const cache = { fetchedAt: now.toISOString(), via: source, events: events.slice(-300) };
      const cached = await saveCalendarState({ ...state, cache });
      if (cached) state.cache = cache;
    }
  } else if (cacheUsable(state.cache, now)) {
    // Kopya, olusturuldugu andaki filtreyle saklanir; guncel ECON_* filtresi
    // tekrar uygulanir.
    events = filterCalendarEvents(state.cache.events);
    source = 'cache';
    stale = true;
    console.warn('econ-calendar source down, cache used:', feed.error, state.cache.fetchedAt);
  } else {
    console.error('econ-calendar source:', feed.error);
    return res.status(200).json({ ok: true, skipped: 'source_unavailable', error: feed.error, day });
  }

  // Ajanda yalnizca henuz gerceklesmemis verileri listeler; 5 dk once
  // gecmis bir veri "bugunun kalan verileri" gibi gosterilmez.
  const today = eventsForDay(events, day).filter((e) => e.at >= now.getTime());

  // Haftalik on bakis: hafta basinda (varsayilan Pazartesi) o haftanin
  // one cikan verileri. Yalnizca henuz gerceklesmemis veriler listelenir.
  const weekKey = weekStartKey(now);
  const weekEvents = eventsForWeek(events, weekKey).filter((e) => e.at >= now.getTime());
  const weeklyText = weeklyEnabled() ? formatWeeklyOutlook(weekEvents, now) : null;
  const weeklyParam = url.searchParams.get('weekly') === '1';
  const weeklyScheduled = weeklyParam
    || ((force || agendaWindow(now)) && isWeeklyDay(now) && state.weekKey !== weekKey);
  const weeklyDue = weeklyEnabled() && weeklyScheduled && (!!weeklyText || emptyNotesEnabled());
  const weeklyBody = weeklyText || (weeklyEnabled() ? formatWeeklyEmpty(now) : null);

  if (dryRun) {
    const due = dueReminders(events, state, now);
    return res.status(200).json({
      ok: true,
      dryRun: true,
      day,
      weekKey,
      source,
      stale,
      cacheFetchedAt: state.cache ? state.cache.fetchedAt : null,
      agenda: agendaWindow(now) ? formatAgenda(today, now) : null,
      agendaEmpty: agendaWindow(now) && !today.length && emptyNotesEnabled() && isIstanbulWeekday(now)
        ? formatAgendaEmpty(now) : null,
      weekly: weeklyText,
      weeklyEmpty: weeklyEnabled() ? formatWeeklyEmpty(now) : null,
      weeklyDue,
      weeklyEnabled: weeklyEnabled(),
      weeklyDay: isWeeklyDay(now),
      emptyNotes: emptyNotesEnabled(),
      weekSentAt: state.weekSentAt,
      reminders: due.map((e) => formatEventReminder([e], now)),
      events: today,
      agendaWindow: agendaWindow(now),
      windows: {
        agenda: clean(process.env.ECON_AGENDA_START || DEFAULT_AGENDA_START),
        reminderLeadMin: [DEFAULT_REMINDER_MIN, DEFAULT_REMINDER_MAX],
      },
    });
  }

  if (!clean(process.env.SUPABASE_SERVICE_ROLE)) {
    return res.status(503).json({ error: 'state_not_configured' });
  }

  // 1) Haftalik on bakis (varsayilan Pazartesi 08:30 penceresi).
  if (weeklyDue) {
    const out = await sendMessage(weeklyBody);
    if (!out.ok) return res.status(502).json({ error: out.error, detail: out.detail || null });
    const iso = new Date().toISOString();
    const covered = today.filter((e) => e.at <= now.getTime() + DEFAULT_REMINDER_MAX * 60000);
    const sent = { ...sentMap(state) };
    for (const e of covered) sent[e.key] = iso;
    // Haftalik mesaj gunun verilerini de icerdigi icin ayni gun ayrica
    // gunluk ajanda gonderilmez.
    const saved = await saveCalendarState({
      day, agendaSentAt: iso, sent,
      weekKey, weekSentAt: iso,
      cache: state.cache || null,
    });
    return res.status(200).json({
      ok: true,
      kind: 'weekly',
      messageId: out.messageId,
      day,
      weekKey,
      source,
      stale,
      events: weekEvents.length,
      coveredByWeekly: covered.length,
      stateSaved: saved,
      text: weeklyBody,
    });
  }

  // 2) Gunluk ajanda (varsayilan 08:30, 45 dk pencere).
  if ((force || agendaWindow(now)) && state.day !== day) {
    const agenda = formatAgenda(today, now)
      || (emptyNotesEnabled() && isIstanbulWeekday(now) ? formatAgendaEmpty(now) : null);
    if (!agenda) {
      return res.status(200).json({ ok: true, skipped: 'no_events_today', day, source, stale, events: today.length });
    }
    const out = await sendMessage(agenda);
    if (!out.ok) return res.status(502).json({ error: out.error, detail: out.detail || null });
    const iso = new Date().toISOString();
    const covered = today.filter((e) => e.at <= now.getTime() + DEFAULT_REMINDER_MAX * 60000);
    const sent = { ...sentMap(state) };
    for (const e of covered) sent[e.key] = iso;
    const saved = await saveCalendarState({
      day, agendaSentAt: iso, sent,
      weekKey: state.weekKey || weekKey, weekSentAt: state.weekSentAt || null,
      cache: state.cache || null,
    });
    return res.status(200).json({
      ok: true,
      kind: 'agenda',
      messageId: out.messageId,
      day,
      source,
      stale,
      events: today.length,
      coveredByAgenda: covered.length,
      stateSaved: saved,
      text: agenda,
    });
  }

  // 3) Veriden 5-25 dk once hatirlatma (08:00-23:00 TSİ).
  const due = dueReminders(events, state, now);
  if (!due.length) {
    return res.status(200).json({ ok: true, skipped: 'nothing_due', day, source, stale, events: today.length });
  }
  const text = formatEventReminder(due, now);
  const out = await sendMessage(text);
  if (!out.ok) return res.status(502).json({ error: out.error, detail: out.detail || null });
  const iso = new Date().toISOString();
  const sent = { ...sentMap(state) };
  for (const e of due) sent[e.key] = iso;
  // Hatirlatma, gunluk ajanda kapisini (`state.day`) ilerletmez; aksi halde
  // 08:30'dan once giden bir hatirlatma o gunun ajandasini engeller.
  const saved = await saveCalendarState({
    day: state.day || null, agendaSentAt: state.agendaSentAt || null, sent,
    weekKey: state.weekKey || weekKey, weekSentAt: state.weekSentAt || null,
    cache: state.cache || null,
  });
  return res.status(200).json({
    ok: true,
    kind: 'reminder',
    messageId: out.messageId,
    day,
    source,
    stale,
    events: due.map((e) => e.key),
    stateSaved: saved,
    text,
  });
}
