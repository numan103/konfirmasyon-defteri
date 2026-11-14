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

export async function readCalendarState() {
  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/edu_shared?id=eq.' + STATE_ROW + '&select=data', {
      headers: sbHeaders(stateKey(false)),
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return { day: null, agendaSentAt: null, sent: {} };
    const rows = await r.json();
    const data = (rows && rows[0] && rows[0].data) || {};
    return {
      day: typeof data.day === 'string' ? data.day : null,
      agendaSentAt: typeof data.agendaSentAt === 'string' ? data.agendaSentAt : null,
      sent: sentMap(data),
    };
  } catch {
    return { day: null, agendaSentAt: null, sent: {} };
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

async function fetchCalendar() {
  try {
    const r = await fetch(FEED, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AlfaTraders/1.0',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) return { ok: false, error: 'http_' + r.status };
    const rows = await r.json();
    if (!Array.isArray(rows) || rows.length > 3000) return { ok: false, error: 'invalid_payload' };
    return { ok: true, rows };
  } catch (e) {
    return { ok: false, error: 'network' };
  }
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
  }));

  if (!secretOk && !queryOk && !cronHeader && !oidcOk && !admin) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const dryRun = url.searchParams.get('dryRun') === '1';
  const force = url.searchParams.get('force') === '1';
  const now = new Date();
  const day = istanbulDateKey(now);

  const feed = await fetchCalendar();
  if (!feed.ok) {
    console.error('econ-calendar source:', feed.error);
    return res.status(200).json({ ok: true, skipped: 'source_unavailable', error: feed.error, day });
  }

  const all = parseCalendarRows(feed.rows);
  const events = filterCalendarEvents(all);
  // Ajanda yalnizca henuz gerceklesmemis verileri listeler; 5 dk once
  // gecmis bir veri "bugunun kalan verileri" gibi gosterilmez.
  const today = eventsForDay(events, day).filter((e) => e.at >= now.getTime());
  const state = await readCalendarState();

  if (dryRun) {
    const due = dueReminders(events, state, now);
    return res.status(200).json({
      ok: true,
      dryRun: true,
      day,
      agenda: agendaWindow(now) ? formatAgenda(today, now) : null,
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

  // 1) Gunluk ajanda (varsayilan 08:30, 45 dk pencere).
  if ((force || agendaWindow(now)) && state.day !== day) {
    const agenda = formatAgenda(today, now);
    if (!agenda) {
      return res.status(200).json({ ok: true, skipped: 'no_events_today', day, events: today.length });
    }
    const out = await sendMessage(agenda);
    if (!out.ok) return res.status(502).json({ error: out.error, detail: out.detail || null });
    const iso = new Date().toISOString();
    const covered = today.filter((e) => e.at <= now.getTime() + DEFAULT_REMINDER_MAX * 60000);
    const sent = { ...sentMap(state) };
    for (const e of covered) sent[e.key] = iso;
    const saved = await saveCalendarState({ day, agendaSentAt: iso, sent });
    return res.status(200).json({
      ok: true,
      kind: 'agenda',
      messageId: out.messageId,
      day,
      events: today.length,
      coveredByAgenda: covered.length,
      stateSaved: saved,
      text: agenda,
    });
  }

  // 2) Veriden 5-25 dk once hatirlatma (08:00-23:00 TSİ).
  const due = dueReminders(events, state, now);
  if (!due.length) {
    return res.status(200).json({ ok: true, skipped: 'nothing_due', day, events: today.length });
  }
  const text = formatEventReminder(due, now);
  const out = await sendMessage(text);
  if (!out.ok) return res.status(502).json({ error: out.error, detail: out.detail || null });
  const iso = new Date().toISOString();
  const sent = { ...sentMap(state) };
  for (const e of due) sent[e.key] = iso;
  // Hatirlatma, gunluk ajanda kapisini (`state.day`) ilerletmez; aksi halde
  // 08:30'dan once giden bir hatirlatma o gunun ajandasini engeller.
  const saved = await saveCalendarState({ day: state.day || null, agendaSentAt: state.agendaSentAt || null, sent });
  return res.status(200).json({
    ok: true,
    kind: 'reminder',
    messageId: out.messageId,
    day,
    events: due.map((e) => e.key),
    stateSaved: saved,
    text,
  });
}
