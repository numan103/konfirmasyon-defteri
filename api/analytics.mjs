// Alfa Traders — ziyaretçi analitiği
//
// POST /api/analytics            -> anonim/üye oturum verisi yazar (beacon/fetch)
// GET  /api/analytics?days=7     -> (yalnızca yönetici) özet + oturum listesi
// GET  /api/analytics?...&prune=1 -> 90 günden eski kayıtları siler
//
// Depolama: mevcut edu_shared tablosu (id = "visit_<sid>"). Böylece yeni tablo
// açmadan (DDL gerekmeden) oturum başına tek JSON satırı tutulur.
// edu_shared anon anahtarıyla okunabildiği için satır içeriği AES-256-GCM ile
// şifrelenir; anahtar yalnızca sunucudaki servis anahtarından türetilir.
//
// Gizlilik:
//  - Ham IP adresi okunmaz/saklanmaz.
//  - Ülke yalnızca Vercel'in kaba "x-vercel-ip-country" başlığından gelir.
//  - Üye kimliği yalnızca geçerli Supabase access token doğrulanırsa eklenir.
//    İstemcinin gönderdiği "member" alanı asla güvenilmez.
//  - E-posta adresi satıra yazılmaz; yönetici özetinde auth kullanıcılarından
//    eşlenir ve yalnızca yönetici yanıtında görünür.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { requestUser } from '../lib/auth.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zvnjslmptwmnuhftgqsr.supabase.co';
const PUB = process.env.SUPABASE_PUBLISHABLE || 'sb_publishable_bReG5UKaWcQkU0Z9GnGiJQ_0T4_Qm9X';

const VISIT_PREFIX = 'visit_';
const ONLINE_MS = 90 * 1000;
const MAX_DAYS = 90;
const MAX_ACTIVE_MS = 12 * 60 * 60 * 1000;
const MAX_BODY_CHARS = 24000;
const MAX_PAGES = 80;
const MAX_CLICKS = 60;
const MAX_ROWS = 5000;
const PAGE_SIZE = 1000;

const SID_RE = /^[A-Za-z0-9_-]{6,64}$/;
const PAGE_RE = /^[A-Za-z0-9_-]{1,40}$/;
const BOT_RE = /(bot|crawler|spider|slurp|bingpreview|facebookexternalhit|telegrambot|whatsapp|discord|headless|python-requests|curl\/|wget\/|lighthouse|pagespeed)/i;

const PAGE_LABELS = {
  home: 'Ana Menü',
  butce: 'Gelir/Gider',
  sosyalmetre: 'Sosyalmetre',
  uyap: 'Real Estate',
  zaman: 'Zaman',
  strateji: 'Strateji',
  trading: 'Trading',
  alfatrading: 'İşlem Kanalı',
  portfoy: 'Portföy Yönetimi',
  defter: 'Check List',
  data: 'Trade Günlüğü',
  review: 'Haftalık Değerlendirme',
  karne: 'Günün Karnesi',
  news: 'AlfaNews',
  ek: 'Ek',
  egitim: 'Alfa Edu',
  strategies: 'Stratejiler',
  analiz: 'Analiz Köşesi',
  mentoring: 'Mentoring',
  pano: 'Çalışma Panosu',
  indicators: 'İndikatörler',
  designer: 'Alfa Designer',
  onchain: 'Onchain',
  calendar: 'Ekonomik Takvim',
  basvuru: 'Alfa Ol',
  'chat-admin': 'Alfa Chat',
  calc: 'Alfa Calculator',
  alfa: 'Alfa Man',
  apps: 'Başvurular',
  ayna: 'Kişisel Günlük',
  erisim: 'Erişim',
  analitik: 'Ziyaretçi Analitiği',
  landing: 'Giriş / Tanıtım',
};

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Cache-Control', 'no-store');
}

function send(res, code, obj) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.end(JSON.stringify(obj));
}

function serviceKey() {
  return process.env.SUPABASE_SERVICE_ROLE || '';
}

function sbHeaders(key, json) {
  const h = { apikey: key };
  if (key && !String(key).startsWith('sb_secret_')) h.Authorization = 'Bearer ' + key;
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

function storageKey() {
  return serviceKey() || PUB;
}

// edu_shared anon anahtarıyla okunabildiği için ziyaretçi verisi şifreli tutulur.
// Anahtar yalnızca sunucuda bulunan servis anahtarından türetilir; istemciye
// veya genel okuma anahtarına asla sızmaz.
function visitKey() {
  const secret = process.env.ANALYTICS_SECRET || serviceKey() || 'alfa-analytics-local';
  return createHash('sha256').update('visit:' + secret).digest();
}

export function encryptVisit(obj) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', visitKey(), iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()]);
  return {
    enc: 'a1',
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ct: ct.toString('base64'),
  };
}

export function decryptVisit(data) {
  if (!data || typeof data !== 'object') return null;
  if (data.enc !== 'a1') return data; // eski düz satırlar (okuma uyumluluğu)
  try {
    const decipher = createDecipheriv('aes-256-gcm', visitKey(), Buffer.from(data.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(data.tag, 'base64'));
    const out = Buffer.concat([decipher.update(Buffer.from(data.ct, 'base64')), decipher.final()]);
    return JSON.parse(out.toString('utf8'));
  } catch (e) {
    return null;
  }
}

function str(value, max) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

function num(value, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, max);
}

function iso(value, fallback) {
  const t = typeof value === 'number' ? value : Date.parse(String(value || ''));
  if (!Number.isFinite(t) || t <= 0) return fallback || '';
  return new Date(t).toISOString();
}

function clampDate(value, now) {
  const t = typeof value === 'number' ? value : Date.parse(String(value || ''));
  if (!Number.isFinite(t)) return '';
  const lo = now - 30 * 864e5;
  const hi = now + 60 * 1000;
  return new Date(Math.max(lo, Math.min(hi, t))).toISOString();
}

// Istanbul sabit UTC+3 (2016'dan beri yaz saati yok).
export function dayKey(value) {
  const t = typeof value === 'number' ? value : Date.parse(String(value || ''));
  if (!Number.isFinite(t)) return '';
  return new Date(t + 3 * 3600 * 1000).toISOString().slice(0, 10);
}

export function parseDevice(uaRaw) {
  const ua = String(uaRaw || '');
  const bot = BOT_RE.test(ua);
  let device = 'Masaüstü';
  if (/ipad|tablet|kindle|silk/i.test(ua)) device = 'Tablet';
  else if (/mobi|iphone|ipod|android.*mobile|windows phone/i.test(ua)) device = 'Mobil';
  else if (/android/i.test(ua)) device = 'Tablet';
  else if (!ua) device = 'Bilinmiyor';

  let os = 'Bilinmiyor';
  if (/windows nt/i.test(ua)) os = 'Windows';
  else if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';
  else if (/android/i.test(ua)) os = 'Android';
  else if (/mac os x|macintosh/i.test(ua)) os = 'macOS';
  else if (/linux/i.test(ua)) os = 'Linux';

  let browser = 'Diğer';
  if (/edg\//i.test(ua)) browser = 'Edge';
  else if (/opr\/|opera/i.test(ua)) browser = 'Opera';
  else if (/samsungbrowser/i.test(ua)) browser = 'Samsung';
  else if (/firefox|fxios/i.test(ua)) browser = 'Firefox';
  else if (/chrome|crios/i.test(ua)) browser = 'Chrome';
  else if (/safari/i.test(ua)) browser = 'Safari';

  return { bot, device, os, browser };
}

export function sourceOf(refRaw) {
  const ref = String(refRaw || '').trim();
  if (!ref) return 'Doğrudan';
  let host = '';
  try { host = new URL(ref).hostname.toLowerCase().replace(/^www\./, ''); } catch (e) { return 'Diğer'; }
  if (!host) return 'Doğrudan';
  if (/alfa-trader\.com$/.test(host)) return 'Site içi';
  if (/(^|\.)t\.me$|(^|\.)telegram\.(me|org)$/.test(host)) return 'Telegram';
  if (/(^|\.)google\./.test(host)) return 'Google';
  if (/(^|\.)youtube\.|(^|\.)youtu\.be$/.test(host)) return 'YouTube';
  if (/(^|\.)instagram\./.test(host)) return 'Instagram';
  if (/(^|\.)facebook\.|(^|\.)fb\./.test(host)) return 'Facebook';
  if (/(^|\.)x\.com$|(^|\.)twitter\./.test(host)) return 'X / Twitter';
  if (/(^|\.)whatsapp\./.test(host)) return 'WhatsApp';
  if (/(^|\.)bing\./.test(host)) return 'Bing';
  if (/(^|\.)yandex\./.test(host)) return 'Yandex';
  return host.slice(0, 80);
}

export function sanitizePayload(body, now) {
  const b = body && typeof body === 'object' ? body : {};
  const sid = str(b.sid, 64);
  if (!SID_RE.test(sid)) return null;
  const vid = SID_RE.test(str(b.vid, 64)) ? str(b.vid, 64) : '';
  const page = PAGE_RE.test(str(b.page, 40)) ? str(b.page, 40) : '';
  const entry = str(b.entry, 300);
  const ref = str(b.ref, 500);
  const utm = {};
  const u = b.utm && typeof b.utm === 'object' ? b.utm : {};
  ['source', 'medium', 'campaign', 'content', 'term'].forEach(function (k) {
    const v = str(u[k], 100);
    if (v) utm[k] = v;
  });

  const pages = {};
  const srcPages = b.pages && typeof b.pages === 'object' ? b.pages : {};
  Object.keys(srcPages).slice(0, MAX_PAGES).forEach(function (k) {
    if (!PAGE_RE.test(k)) return;
    const p = srcPages[k] || {};
    const v = Math.round(num(p.v, 1000000));
    const ms = Math.round(num(p.ms, MAX_ACTIVE_MS));
    const s = Math.round(num(p.s, 100));
    if (!v && !ms && !s) return;
    pages[k] = { v: v, ms: ms, s: s };
  });

  const days = {};
  const srcDays = b.days && typeof b.days === 'object' ? b.days : {};
  Object.keys(srcDays).slice(0, MAX_DAYS + 5).forEach(function (k) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) return;
    const d = srcDays[k] || {};
    const ms = Math.round(num(d.ms, MAX_ACTIVE_MS));
    const pv = Math.round(num(d.pv, 1000000));
    if (!ms && !pv) return;
    days[k] = { ms: ms, pv: pv };
  });

  const clicks = [];
  const seen = new Set();
  (Array.isArray(b.clicks) ? b.clicks : []).slice(-MAX_CLICKS).forEach(function (c) {
    if (!c || typeof c !== 'object') return;
    const kind = str(c.kind, 20).toLowerCase();
    if (!/^(affiliate|telegram|external|cta|download)$/.test(kind)) return;
    const item = {
      t: iso(c.t, ''),
      kind: kind,
      label: str(c.label, 80),
      url: str(c.url, 180),
      page: PAGE_RE.test(str(c.page, 40)) ? str(c.page, 40) : '',
    };
    if (!item.t || (!item.label && !item.url)) return;
    const key = [item.t, kind, item.label, item.url].join('|');
    if (seen.has(key)) return;
    seen.add(key);
    clicks.push(item);
  });

  let scroll = Math.round(num(b.scroll, 100));
  const first = clampDate(b.first, now);
  return {
    sid: sid,
    vid: vid,
    first: first || new Date(now).toISOString(),
    last: new Date(now).toISOString(),
    page: page,
    entry: entry,
    ref: ref,
    utm: utm,
    lang: str(b.lang, 30),
    tz: str(b.tz, 60),
    screen: str(b.screen, 30),
    mobile: b.mobile === true,
    activeMs: Math.round(num(b.activeMs, MAX_ACTIVE_MS)),
    scroll: scroll,
    pages: pages,
    days: days,
    clicks: clicks,
  };
}

function mergeClicks(oldClicks, newClicks) {
  const seen = new Set();
  const out = [];
  (Array.isArray(oldClicks) ? oldClicks : []).concat(Array.isArray(newClicks) ? newClicks : []).forEach(function (c) {
    if (!c || !c.t) return;
    const key = [c.t, c.kind, c.label, c.url].join('|');
    if (seen.has(key)) return;
    seen.add(key);
    out.push(c);
  });
  out.sort(function (a, b) { return Date.parse(a.t) - Date.parse(b.t); });
  return out.slice(-MAX_CLICKS);
}

export function mergeVisit(existing, incoming, ctx) {
  const old = existing && typeof existing === 'object' ? existing : {};
  const inc = incoming || {};
  const c = ctx || {};
  const now = c.now || Date.now();

  const pages = {};
  const mergePages = function (src) {
    if (!src || typeof src !== 'object') return;
    Object.keys(src).forEach(function (k) {
      const p = src[k] || {};
      const cur = pages[k] || { v: 0, ms: 0, s: 0 };
      cur.v = Math.max(cur.v, Math.round(num(p.v, 1000000)));
      cur.ms = Math.max(cur.ms, Math.round(num(p.ms, MAX_ACTIVE_MS)));
      cur.s = Math.max(cur.s, Math.round(num(p.s, 100)));
      pages[k] = cur;
    });
  };
  mergePages(old.pages);
  mergePages(inc.pages);

  const days = {};
  const mergeDays = function (src) {
    if (!src || typeof src !== 'object') return;
    Object.keys(src).forEach(function (k) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) return;
      const d = src[k] || {};
      const cur = days[k] || { ms: 0, pv: 0 };
      cur.ms = Math.max(cur.ms, Math.round(num(d.ms, MAX_ACTIVE_MS)));
      cur.pv = Math.max(cur.pv, Math.round(num(d.pv, 1000000)));
      days[k] = cur;
    });
  };
  mergeDays(old.days);
  mergeDays(inc.days);

  const firstCandidates = [old.first, inc.first, new Date(now).toISOString()].filter(Boolean).map(Date.parse).filter(Number.isFinite);
  const lastCandidates = [old.last, inc.last, new Date(now).toISOString()].filter(Boolean).map(Date.parse).filter(Number.isFinite);

  const member = c.member && c.member.id
    ? { id: String(c.member.id).slice(0, 64) }
    : (old.member && old.member.id ? { id: String(old.member.id).slice(0, 64) } : null);

  return {
    sid: inc.sid || old.sid,
    vid: old.vid || inc.vid || '',
    first: new Date(Math.min.apply(null, firstCandidates)).toISOString(),
    last: new Date(Math.max.apply(null, lastCandidates)).toISOString(),
    page: inc.page || old.page || '',
    entry: old.entry || inc.entry || '',
    ref: old.ref || inc.ref || '',
    utm: (old.utm && Object.keys(old.utm).length ? old.utm : inc.utm) || {},
    lang: old.lang || inc.lang || '',
    tz: old.tz || inc.tz || '',
    screen: old.screen || inc.screen || '',
    mobile: old.mobile === true || inc.mobile === true,
    activeMs: Math.max(Math.round(num(old.activeMs, MAX_ACTIVE_MS)), Math.round(num(inc.activeMs, MAX_ACTIVE_MS))),
    scroll: Math.max(Math.round(num(old.scroll, 100)), Math.round(num(inc.scroll, 100))),
    pages: pages,
    days: days,
    clicks: mergeClicks(old.clicks, inc.clicks),
    country: str(c.country, 2).toUpperCase() || str(old.country, 2).toUpperCase() || '',
    device: c.device || old.device || 'Bilinmiyor',
    browser: c.browser || old.browser || 'Diğer',
    os: c.os || old.os || 'Bilinmiyor',
    bot: c.bot === true || old.bot === true,
    admin: c.admin === true || old.admin === true,
    member: member,
  };
}

function normalizeSession(row) {
  const d = row && row.data && typeof row.data === 'object' ? row.data : null;
  if (!d) return null;
  const id = String(row.id || '');
  const sid = SID_RE.test(str(d.sid, 64)) ? str(d.sid, 64) : id.replace(VISIT_PREFIX, '');
  if (!SID_RE.test(sid)) return null;

  const pages = {};
  const srcPages = d.pages && typeof d.pages === 'object' ? d.pages : {};
  Object.keys(srcPages).slice(0, MAX_PAGES).forEach(function (k) {
    if (!PAGE_RE.test(k)) return;
    const p = srcPages[k] || {};
    pages[k] = {
      v: Math.round(num(p.v, 1000000)),
      ms: Math.round(num(p.ms, MAX_ACTIVE_MS)),
      s: Math.round(num(p.s, 100)),
    };
  });

  const days = {};
  const srcDays = d.days && typeof d.days === 'object' ? d.days : {};
  Object.keys(srcDays).slice(0, MAX_DAYS + 5).forEach(function (k) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) return;
    const x = srcDays[k] || {};
    days[k] = { ms: Math.round(num(x.ms, MAX_ACTIVE_MS)), pv: Math.round(num(x.pv, 1000000)) };
  });

  let pageviews = 0;
  Object.keys(pages).forEach(function (k) { pageviews += pages[k].v; });

  const member = d.member && d.member.id
    ? { id: str(d.member.id, 64), name: str(d.member.name, 80) }
    : null;

  return {
    sid: sid,
    vid: SID_RE.test(str(d.vid, 64)) ? str(d.vid, 64) : '',
    first: iso(d.first, iso(row.updated_at, '')),
    last: iso(d.last, iso(row.updated_at, '')),
    activeMs: Math.round(num(d.activeMs, MAX_ACTIVE_MS)),
    pages: pages,
    days: days,
    pageviews: pageviews,
    clicks: Array.isArray(d.clicks) ? d.clicks.slice(-MAX_CLICKS) : [],
    page: PAGE_RE.test(str(d.page, 40)) ? str(d.page, 40) : '',
    entry: str(d.entry, 300),
    ref: str(d.ref, 500),
    utm: d.utm && typeof d.utm === 'object' ? d.utm : {},
    lang: str(d.lang, 30),
    tz: str(d.tz, 60),
    screen: str(d.screen, 30),
    scroll: Math.round(num(d.scroll, 100)),
    country: str(d.country, 2).toUpperCase(),
    device: str(d.device, 20) || 'Bilinmiyor',
    browser: str(d.browser, 20) || 'Diğer',
    os: str(d.os, 20) || 'Bilinmiyor',
    bot: d.bot === true,
    admin: d.admin === true,
    member: member,
  };
}

export function summarizeSessions(rows, opts) {
  const o = opts || {};
  const now = o.now || Date.now();
  const days = Math.max(1, Math.min(MAX_DAYS, Number(o.days) || 7));
  const includeAdmin = !!o.includeAdmin;
  const emailMap = o.emailMap || {};
  const since = now - days * 864e5;

  const totals = {
    onlineNow: 0,
    uniqueVisitors: 0,
    sessions: 0,
    pageviews: 0,
    avgActiveMs: 0,
    memberSessions: 0,
    anonymousSessions: 0,
    adminSessions: 0,
    botSessions: 0,
  };
  const visitors = new Set();
  const online = new Set();
  let activeSum = 0;
  let activeCount = 0;

  const pageMap = new Map();
  const refMap = new Map();
  const deviceMap = new Map();
  const browserMap = new Map();
  const osMap = new Map();
  const countryMap = new Map();

  const dayMap = new Map();
  const dayKeys = [];
  for (let i = days - 1; i >= 0; i--) {
    const k = dayKey(now - i * 864e5);
    dayKeys.push(k);
    dayMap.set(k, { date: k, sessions: 0, visitors: 0, pageviews: 0, ms: 0, _s: new Set(), _v: new Set() });
  }

  const list = [];

  (Array.isArray(rows) ? rows : []).forEach(function (row) {
    const s = normalizeSession(row);
    if (!s) return;
    if (s.bot) { totals.botSessions++; return; }
    if (s.admin && !includeAdmin) { totals.adminSessions++; return; }
    if (Date.parse(s.last) < since) return;

    totals.sessions++;
    totals.pageviews += s.pageviews;
    if (s.member) totals.memberSessions++;
    else totals.anonymousSessions++;
    if (s.admin) totals.adminSessions++;

    const vKey = s.vid || s.sid;
    visitors.add(vKey);
    if (now - Date.parse(s.last) <= ONLINE_MS) online.add(vKey);

    if (s.activeMs > 0) { activeSum += s.activeMs; activeCount++; }

    Object.keys(s.pages).forEach(function (page) {
      const p = s.pages[page];
      let e = pageMap.get(page);
      if (!e) {
        e = { page: page, views: 0, ms: 0, scroll: 0, _s: new Set(), _v: new Set() };
        pageMap.set(page, e);
      }
      e.views += p.v;
      e.ms += p.ms;
      e.scroll = Math.max(e.scroll, p.s);
      e._s.add(s.sid);
      e._v.add(vKey);
    });

    const source = sourceOf(s.ref);
    const r = refMap.get(source) || { source: source, sessions: 0, _v: new Set() };
    r.sessions++;
    r._v.add(vKey);
    refMap.set(source, r);

    [[deviceMap, s.device], [browserMap, s.browser], [osMap, s.os], [countryMap, s.country || 'Bilinmiyor']].forEach(function (pair) {
      const m = pair[0];
      const key = pair[1];
      const cur = m.get(key) || { key: key, sessions: 0 };
      cur.sessions++;
      m.set(key, cur);
    });

    const daySrc = Object.keys(s.days).length ? s.days : null;
    if (daySrc) {
      Object.keys(daySrc).forEach(function (k) {
        const bucket = dayMap.get(k);
        if (!bucket) return;
        bucket.ms += daySrc[k].ms;
        bucket.pageviews += daySrc[k].pv;
        bucket._s.add(s.sid);
        bucket._v.add(vKey);
      });
    } else {
      const k = dayKey(s.last);
      const bucket = dayMap.get(k);
      if (bucket) {
        bucket.ms += s.activeMs;
        bucket.pageviews += s.pageviews;
        bucket._s.add(s.sid);
        bucket._v.add(vKey);
      }
    }

    const info = s.member ? (emailMap[s.member.id] || {}) : {};
    const memberView = s.member
      ? { id: s.member.id, name: s.member.name || str(info.name, 80), email: str(info.email, 120) }
      : null;
    const label = memberView
      ? (memberView.name || memberView.email || 'Üye')
      : 'Ziyaretçi ' + (s.vid ? s.vid.slice(-4).toUpperCase() : s.sid.slice(-4).toUpperCase());

    const pageList = Object.keys(s.pages).map(function (page) {
      return {
        page: page,
        label: PAGE_LABELS[page] || page,
        views: s.pages[page].v,
        ms: s.pages[page].ms,
        scroll: s.pages[page].s,
      };
    }).sort(function (a, b) { return b.ms - a.ms || b.views - a.views; });

    list.push({
      sid: s.sid,
      vid: s.vid,
      label: label,
      member: memberView,
      admin: s.admin,
      first: s.first,
      last: s.last,
      activeMs: s.activeMs,
      pageviews: s.pageviews,
      pages: pageList,
      clicks: s.clicks,
      currentPage: s.page,
      currentPageLabel: PAGE_LABELS[s.page] || s.page,
      entry: s.entry,
      ref: s.ref,
      source: source,
      utm: s.utm,
      lang: s.lang,
      tz: s.tz,
      screen: s.screen,
      scroll: s.scroll,
      country: s.country,
      device: s.device,
      browser: s.browser,
      os: s.os,
      live: now - Date.parse(s.last) <= ONLINE_MS,
    });
  });

  totals.uniqueVisitors = visitors.size;
  totals.onlineNow = online.size;
  totals.avgActiveMs = activeCount ? Math.round(activeSum / activeCount) : 0;

  list.sort(function (a, b) { return Date.parse(b.last) - Date.parse(a.last); });

  const topPages = Array.from(pageMap.values()).map(function (e) {
    return {
      page: e.page,
      label: PAGE_LABELS[e.page] || e.page,
      views: e.views,
      visitors: e._v.size,
      sessions: e._s.size,
      avgMs: e._s.size ? Math.round(e.ms / e._s.size) : 0,
      scroll: e.scroll,
    };
  }).sort(function (a, b) { return b.views - a.views || b.visitors - a.visitors; }).slice(0, 30);

  const collapse = function (m) {
    return Array.from(m.values()).map(function (x) {
      return { key: x.key, label: x.label || x.source || x.key, sessions: x.sessions, visitors: x._v ? x._v.size : undefined };
    }).sort(function (a, b) { return b.sessions - a.sessions; });
  };

  const referrers = Array.from(refMap.values()).map(function (x) {
    return { source: x.source, sessions: x.sessions, visitors: x._v.size };
  }).sort(function (a, b) { return b.sessions - a.sessions; }).slice(0, 20);

  const daily = dayKeys.map(function (k) {
    const b = dayMap.get(k);
    return {
      date: k,
      sessions: b._s.size,
      visitors: b._v.size,
      pageviews: b.pageviews,
      ms: b.ms,
    };
  });

  return {
    range: { days: days, since: new Date(since).toISOString() },
    totals: totals,
    online: list.filter(function (s) { return s.live; }).slice(0, 50),
    topPages: topPages,
    referrers: referrers,
    devices: collapse(deviceMap),
    browsers: collapse(browserMap),
    os: collapse(osMap),
    countries: collapse(countryMap).slice(0, 20),
    daily: daily,
    sessions: list.slice(0, 500),
  };
}

async function readVisit(sid) {
  const id = VISIT_PREFIX + sid;
  const url = SUPABASE_URL + '/rest/v1/edu_shared?id=eq.' + encodeURIComponent(id) + '&select=data';
  const r = await fetch(url, { headers: sbHeaders(storageKey()), signal: AbortSignal.timeout(8000) });
  if (!r.ok) return null;
  const rows = await r.json().catch(function () { return []; });
  return rows && rows[0] && rows[0].data ? decryptVisit(rows[0].data) : null;
}

async function writeVisit(sid, data) {
  const id = VISIT_PREFIX + sid;
  const key = storageKey();
  if (!key) return false;
  const r = await fetch(SUPABASE_URL + '/rest/v1/edu_shared?on_conflict=id', {
    method: 'POST',
    headers: Object.assign(sbHeaders(key, true), { Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify([{ id: id, data: encryptVisit(data), updated_at: new Date().toISOString() }]),
    signal: AbortSignal.timeout(8000),
  });
  return r.ok;
}

async function readVisitRows(sinceIso) {
  const key = serviceKey();
  if (!key) return { error: 'service_role_missing', rows: [] };
  const out = [];
  for (let page = 0; page < Math.ceil(MAX_ROWS / PAGE_SIZE); page++) {
    const url = SUPABASE_URL + '/rest/v1/edu_shared?id=like.' + VISIT_PREFIX + '*' +
      '&updated_at=gte.' + encodeURIComponent(sinceIso) +
      '&select=id,data,updated_at&order=updated_at.desc&limit=' + PAGE_SIZE + '&offset=' + (page * PAGE_SIZE);
    const r = await fetch(url, { headers: sbHeaders(key), signal: AbortSignal.timeout(12000) });
    if (!r.ok) return { error: 'read_' + r.status, rows: out };
    const rows = await r.json().catch(function () { return []; });
    if (!Array.isArray(rows) || !rows.length) break;
    rows.forEach(function (x) {
      out.push({ id: x.id, updated_at: x.updated_at, data: decryptVisit(x.data) });
    });
    if (rows.length < PAGE_SIZE) break;
  }
  return { rows: out };
}

async function pruneRows(cutoffIso) {
  const key = serviceKey();
  if (!key) return false;
  const url = SUPABASE_URL + '/rest/v1/edu_shared?id=like.' + VISIT_PREFIX + '*' +
    '&updated_at=lt.' + encodeURIComponent(cutoffIso);
  const r = await fetch(url, {
    method: 'DELETE',
    headers: Object.assign(sbHeaders(key), { Prefer: 'return=minimal' }),
    signal: AbortSignal.timeout(15000),
  });
  return r.ok;
}

async function memberEmailMap() {
  const key = serviceKey();
  if (!key) return {};
  const map = {};
  try {
    const r = await fetch(SUPABASE_URL + '/auth/v1/admin/users?per_page=1000', {
      headers: sbHeaders(key),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return map;
    const body = await r.json().catch(function () { return {}; });
    (body.users || []).forEach(function (u) {
      if (!u || !u.id) return;
      map[u.id] = {
        email: str(u.email, 120),
        name: str((u.user_metadata && (u.user_metadata.name || u.user_metadata.full_name)) || '', 80),
      };
    });
  } catch (e) { /* eşleme opsiyonel */ }
  return map;
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'POST') {
    let body = req.body;
    try { if (typeof body === 'string') body = JSON.parse(body); } catch (e) { return send(res, 400, { ok: false, error: 'bad_json' }); }
    if (!body || typeof body !== 'object') return send(res, 400, { ok: false, error: 'bad_body' });
    if (JSON.stringify(body).length > MAX_BODY_CHARS) return send(res, 413, { ok: false, error: 'too_large' });

    const now = Date.now();
    const clean = sanitizePayload(body, now);
    if (!clean) return send(res, 400, { ok: false, error: 'bad_sid' });

    const ua = req.headers && (req.headers['user-agent'] || '');
    const dev = parseDevice(ua);
    const country = str(req.headers && (req.headers['x-vercel-ip-country'] || req.headers['x-country-code']), 2).toUpperCase();

    // Üye kimliği yalnızca geçerli token ile; istemci alanı yok sayılır.
    let member = null;
    let admin = false;
    if (req.headers && (req.headers.authorization || req.headers.Authorization)) {
      const user = await requestUser(req);
      if (user) {
        member = { id: user.id, name: str(user.name || (user.email || '').split('@')[0], 80) };
        admin = user.admin === true;
      }
    }

    const existing = await readVisit(clean.sid).catch(function () { return null; });
    const data = mergeVisit(existing, clean, {
      now: now,
      country: country,
      device: dev.device,
      browser: dev.browser,
      os: dev.os,
      bot: dev.bot,
      member: member,
      admin: admin,
    });
    data.sid = clean.sid;

    const ok = await writeVisit(clean.sid, data).catch(function () { return false; });
    if (!ok) return send(res, 503, { ok: false, error: 'store_unavailable' });
    return send(res, 200, { ok: true });
  }

  if (req.method === 'GET') {
    const user = await requestUser(req);
    if (!user || !user.admin) return send(res, 401, { ok: false, error: 'unauthorized' });

    const q = req.query || {};
    const days = Math.max(1, Math.min(MAX_DAYS, Number(q.days) || 7));
    const includeAdmin = String(q.includeAdmin || '') === '1';
    const now = Date.now();

    let pruned = false;
    if (String(q.prune || '') === '1') {
      pruned = await pruneRows(new Date(now - MAX_DAYS * 864e5).toISOString()).catch(function () { return false; });
    }

    const out = await readVisitRows(new Date(now - days * 864e5).toISOString());
    if (out.error) return send(res, 503, { ok: false, error: out.error });

    const emailMap = await memberEmailMap();
    const summary = summarizeSessions(out.rows, {
      now: now,
      days: days,
      includeAdmin: includeAdmin,
      emailMap: emailMap,
    });

    return send(res, 200, Object.assign({
      ok: true,
      generatedAt: new Date(now).toISOString(),
      includeAdmin: includeAdmin,
      pruned: pruned,
      store: serviceKey() ? 'service' : 'publishable',
    }, summary));
  }

  return send(res, 405, { ok: false, error: 'method_not_allowed' });
}
