// ALFA TRADERS - uyelik / referans erisim ucu
//
// GET  /api/access            -> kullanicinin erisim + mentorship durumu
// GET  /api/access?op=list    -> (yonetici) tum basvurular + e-posta
// POST /api/access {op:'submit', exchange:'okx'|'bybit', uid:'...'}
//                             -> UID'yi borsaya sorar, sonucu kaydeder
// POST /api/access {op:'mentor'}
//                             -> dogrulanmis uye icin davet linkini yeniler
// POST /api/access {op:'approve'|'reject'|'revoke', user_id:'...'}
//                             -> (yonetici) basvuruyu onaylar/reddeder
//
// Kimlik: Authorization: Bearer <supabase access token>
// Okuma: kullanicinin kendi JWT'si (RLS ile yalniz kendi satiri)
// Yazma: SUPABASE_SERVICE_ROLE (istemci kendini 'verified' yapamaz)
//
// Borsa API anahtarlari tanimli degilse dogrulama yapilamaz; basvuru
// 'pending' olarak kaydedilir ve elle onaylanabilir. Yanlis sonuc uretilmez.
//
// Mentorship: dogrulanan uye icin Telegram botu tek kullanimlik davet linki
// uretir (TG_MENTORSHIP_CHAT_ID). Link uretilemezse premium erisim yine acilir;
// yalnizca davet adimi "hazir degil" olarak gorunur.

import { verifyExchange, isConfigured, submitStatusFor } from '../lib/exchanges.mjs';
import {
  mentorshipConfigured,
  createMentorshipInvite,
  revokeMentorshipInvite,
  inviteIsLive
} from '../lib/mentorship.mjs';
import { sendTelegram } from '../lib/telegram.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zvnjslmptwmnuhftgqsr.supabase.co';
const PUB = process.env.SUPABASE_PUBLISHABLE || 'sb_publishable_bReG5UKaWcQkU0Z9GnGiJQ_0T4_Qm9X';

const FALLBACK_ADMIN = 'ahmetnuman20@gmail.com';
const COOLDOWN_MS = 20000;
const MAX_ATTEMPTS = 10;
const MENTOR_REFRESH_MS = 30000;

const BASE_COLS = ['exchange', 'exchange_uid', 'status', 'verified_at', 'verified_by', 'attempts', 'updated_at'];
const VOLUME_COLS = ['volume'];
const MENTOR_COLS = [
  'mentor_status', 'mentor_invite', 'mentor_invite_expires_at',
  'mentor_invited_at', 'mentor_joined_at',
  'last_checked_at', 'check_reason',
  'volume_updated_at', 'exchange_joined_at'
];

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
}

function send(res, code, obj) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}

function fail(res, code, error) {
  return send(res, code, { ok: false, error });
}

function adminEmails() {
  const raw = process.env.SITE_ADMIN_EMAILS || process.env.SITE_ADMIN_EMAIL || FALLBACK_ADMIN;
  return raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

function isAdminUser(user) {
  const mail = String((user && user.email) || '').toLowerCase();
  return !!mail && adminEmails().indexOf(mail) >= 0;
}

// Varsayilan referans linkleri (site sahibinin hesaplari). Env ile ezilebilir.
const DEFAULT_REF_LINKS = {
  okx: 'https://www.okx.com/join/CRYPTOAHMET',
  bybit: 'https://partner.bybit.com/b/cryptoahmet'
};

function links() {
  return {
    okx: process.env.SITE_OKX_REF_LINK || DEFAULT_REF_LINKS.okx,
    bybit: process.env.SITE_BYBIT_REF_LINK || DEFAULT_REF_LINKS.bybit
  };
}

// Anahtar formati sb_secret_ ise Authorization gonderilmez (yeni Supabase anahtarlari).
function svcHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE || '';
  const h = { apikey: key, 'Content-Type': 'application/json' };
  if (!key.startsWith('sb_secret_')) h.Authorization = 'Bearer ' + key;
  return h;
}

async function getUser(jwt) {
  if (!jwt) return null;
  try {
    const r = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: { apikey: PUB, Authorization: 'Bearer ' + jwt }
    });
    if (!r.ok) return null;
    const u = await r.json();
    return u && u.id ? u : null;
  } catch (e) {
    return null;
  }
}

// ---- Sema yetenekleri ----
// 005_mentorship.sql henuz calistirilmamis olabilir. Eksik kolon yuzunden
// tum uyelik kapisinin kapanmamasi icin bir kez kontrol edip onbellekleriz.
let capsPromise = null;

async function accessCaps() {
  if (capsPromise) return capsPromise;
  capsPromise = (async () => {
    const key = process.env.SUPABASE_SERVICE_ROLE || '';
    if (!key) return { volume: false, mentor: false };
    const probe = async (cols) => {
      try {
        const r = await fetch(
          SUPABASE_URL + '/rest/v1/site_access?select=' + cols.join(',') + '&limit=1',
          { headers: svcHeaders() }
        );
        return r.ok;
      } catch (e) {
        return false;
      }
    };
    const volume = await probe(VOLUME_COLS);
    const mentor = await probe(MENTOR_COLS);
    if (!volume || !mentor) {
      console.warn('[ACCESS] sema eksik: volume=' + volume + ' mentor=' + mentor + ' (005_mentorship.sql)');
    }
    return { volume, mentor };
  })();
  return capsPromise;
}

function allowedFields(caps) {
  const set = new Set(['user_id', 'exchange', 'exchange_uid', 'status', 'verified_by', 'verified_at', 'note', 'attempts']);
  if (caps && caps.volume) VOLUME_COLS.forEach((c) => set.add(c));
  if (caps && caps.mentor) MENTOR_COLS.forEach((c) => set.add(c));
  return set;
}

function pickAllowed(obj, caps) {
  const allowed = allowedFields(caps);
  const out = {};
  Object.keys(obj || {}).forEach((k) => { if (allowed.has(k)) out[k] = obj[k]; });
  return out;
}

// Kullanicinin JWT'si ile okuma: RLS yalniz kendi satirini dondurur.
async function readOwn(jwt, userId, caps) {
  const cols = BASE_COLS.slice();
  if (caps && caps.volume) cols.push(...VOLUME_COLS);
  if (caps && caps.mentor) cols.push(...MENTOR_COLS);
  const r = await fetch(
    SUPABASE_URL + '/rest/v1/site_access?user_id=eq.' + encodeURIComponent(userId) +
      '&select=' + cols.join(','),
    { headers: { apikey: PUB, Authorization: 'Bearer ' + jwt } }
  );
  if (r.status === 404) return { missing: true };
  if (!r.ok) throw new Error('read ' + r.status);
  const rows = await r.json();
  return { row: rows && rows[0] ? rows[0] : null };
}

async function writeRow(row, caps) {
  const key = process.env.SUPABASE_SERVICE_ROLE || '';
  if (!key) throw new Error('service role missing');
  const r = await fetch(SUPABASE_URL + '/rest/v1/site_access?on_conflict=user_id', {
    method: 'POST',
    headers: { ...svcHeaders(), Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([pickAllowed(row, caps)])
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    const err = new Error('write ' + r.status + ' ' + body.slice(0, 200));
    err.status = r.status;
    err.conflict = r.status === 409;
    throw err;
  }
  return true;
}

function tierOf(user, status) {
  if (isAdminUser(user)) return 'admin';
  if (status === 'verified') return 'ref';
  return 'free';
}

// ---- Mentorship ----

function mentorView(caps, row) {
  const enabled = !!(caps && caps.mentor) && mentorshipConfigured();
  const status = (row && row.mentor_status) || 'none';
  const live = !!(row && row.status === 'verified' &&
    inviteIsLive(row.mentor_invite, row.mentor_invite_expires_at));
  return {
    enabled,
    chat: enabled || (caps && caps.mentor) ? 'telegram' : null,
    status,
    invite: live ? row.mentor_invite : null,
    invite_expires_at: live ? row.mentor_invite_expires_at : null,
    invited_at: (row && row.mentor_invited_at) || null,
    joined_at: (row && row.mentor_joined_at) || null
  };
}

// Dogrulanmis uye icin gecerli bir davet linki oldugundan emin olur.
// Var olan link gecerlıyse yeniden uretmez; Telegram hatasi akisi durdurmaz.
async function ensureMentorInvite(userId, row, caps, opts) {
  const force = !!(opts && opts.force);
  if (!caps || !caps.mentor || !mentorshipConfigured()) return { row, created: false };
  if (!row || row.status !== 'verified') return { row, created: false };
  if (row.mentor_status === 'joined' || row.mentor_status === 'revoked') return { row, created: false };

  const live = inviteIsLive(row.mentor_invite, row.mentor_invite_expires_at);
  if (live && !force) return { row, created: false };
  if (live && force) {
    const last = row.mentor_invited_at ? Date.parse(row.mentor_invited_at) : 0;
    if (Number.isFinite(last) && Date.now() - last < MENTOR_REFRESH_MS) {
      return { row, created: false };
    }
  }

  if (row.mentor_invite) {
    try { await revokeMentorshipInvite(row.mentor_invite); } catch (e) { /* best-effort */ }
  }

  const label = ((row.exchange || 'alfa') + '-' + (row.exchange_uid || '')).toLowerCase();
  const inv = await createMentorshipInvite({ name: label });
  if (!inv.ok) {
    console.error('[ACCESS] mentorship davet', inv.reason, inv.detail || '');
    return { row, created: false };
  }

  const patch = {
    mentor_status: 'invited',
    mentor_invite: inv.link,
    mentor_invite_expires_at: inv.expires_at,
    mentor_invited_at: new Date().toISOString()
  };
  let next = { ...row, ...patch };
  try {
    const saved = await svcPatch(userId, patch, caps);
    if (saved) next = { ...row, ...saved };
  } catch (e) {
    console.error('[ACCESS] mentorship kayit', e && e.message);
  }
  return { row: next, created: true };
}

async function notifyAdmin(text) {
  const chatId = (process.env.TG_CHAT_ID || '').trim();
  if (!chatId || !process.env.TG_BOT_TOKEN) return;
  try {
    await sendTelegram(text, chatId, null, {
      inline_keyboard: [[{ text: 'Üyeleri gör →', url: 'https://alfa-trader.com/?page=erisim' }]]
    });
  } catch (e) { /* bildirim sessiz kalir */ }
}

// ---- Yonetici islemleri (service role gerekir) ----

async function svcRead(path) {
  const key = process.env.SUPABASE_SERVICE_ROLE || '';
  if (!key) throw new Error('service role missing');
  const r = await fetch(SUPABASE_URL + path, { headers: svcHeaders() });
  if (!r.ok) throw new Error('read ' + r.status);
  return r.json();
}

async function svcPatch(userId, patch, caps) {
  const key = process.env.SUPABASE_SERVICE_ROLE || '';
  if (!key) throw new Error('service role missing');
  const r = await fetch(
    SUPABASE_URL + '/rest/v1/site_access?user_id=eq.' + encodeURIComponent(userId),
    {
      method: 'PATCH',
      headers: { ...svcHeaders(), Prefer: 'return=representation' },
      body: JSON.stringify(pickAllowed(patch, caps))
    }
  );
  if (!r.ok) throw new Error('patch ' + r.status);
  const rows = await r.json().catch(() => []);
  return rows && rows[0] ? rows[0] : null;
}

// Kullanici e-postalari: tek istekte haritalanir (yonetici listesi icin).
async function emailMap() {
  const map = {};
  try {
    const page = await svcRead('/auth/v1/admin/users?page=1&per_page=1000');
    const list = (page && page.users) || [];
    list.forEach((u) => { if (u && u.id) map[u.id] = u.email || ''; });
  } catch (e) {
    console.error('[ACCESS] email map', e && e.message);
  }
  return map;
}

async function listHandler(res, user) {
  if (!isAdminUser(user)) return fail(res, 403, 'admin_only');
  const caps = await accessCaps();
  const cols = BASE_COLS.concat(['user_id', 'note', 'created_at']);
  if (caps.volume) cols.push(...VOLUME_COLS);
  if (caps.mentor) cols.push(...MENTOR_COLS);

  let rows;
  try {
    rows = await svcRead(
      '/rest/v1/site_access?select=' + cols.join(',') +
      '&order=created_at.desc&limit=200'
    );
  } catch (e) {
    console.error('[ACCESS] list', e && e.message);
    return fail(res, 500, 'store_error');
  }
  const mails = await emailMap();
  const out = (Array.isArray(rows) ? rows : []).map((r) => ({
    user_id: r.user_id,
    email: mails[r.user_id] || '',
    exchange: r.exchange,
    exchange_uid: r.exchange_uid,
    status: r.status,
    note: r.note,
    attempts: r.attempts,
    verified_at: r.verified_at,
    verified_by: r.verified_by,
    created_at: r.created_at,
    updated_at: r.updated_at,
    volume: r.volume === undefined ? null : r.volume,
    volume_updated_at: r.volume_updated_at || null,
    exchange_joined_at: r.exchange_joined_at || null,
    mentor_status: r.mentor_status || 'none',
    mentor_invite: r.mentor_invite || null,
    mentor_invite_expires_at: r.mentor_invite_expires_at || null,
    mentor_invited_at: r.mentor_invited_at || null,
    mentor_joined_at: r.mentor_joined_at || null,
    last_checked_at: r.last_checked_at || null,
    check_reason: r.check_reason || null
  }));
  // Aylik sistem: dogrulanan referans sayilarini ay bazinda ozetle.
  const byMonth = {};
  (Array.isArray(rows) ? rows : []).forEach((r) => {
    if (r.status !== 'verified') return;
    const d = r.created_at ? String(r.created_at).slice(0, 7) : '';
    if (!d) return;
    if (!byMonth[d]) byMonth[d] = { n: 0, v: 0 };
    byMonth[d].n = (byMonth[d].n || 0) + 1;
    byMonth[d].v = (byMonth[d].v || 0) + (Number(r.volume) || 0);
  });
  const monthList = Object.keys(byMonth).sort().map((k) => ({ month: k, verified: byMonth[k].n, volume: byMonth[k].v }));
  return send(res, 200, {
    ok: true,
    rows: out,
    open: process.env.SITE_ACCESS_OPEN === '1',
    byMonth: monthList,
    mentor_configured: mentorshipConfigured() && caps.mentor,
    schema: { volume: caps.volume, mentor: caps.mentor }
  });
}

async function adminOpHandler(res, user, body) {
  if (!isAdminUser(user)) return fail(res, 403, 'admin_only');
  const op = String(body.op || '');
  const userId = String(body.user_id || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    return fail(res, 400, 'bad_user');
  }
  if (userId === user.id) return fail(res, 400, 'self');

  const caps = await accessCaps();

  let patch;
  if (op === 'approve') {
    patch = { status: 'verified', verified_by: 'manual', verified_at: new Date().toISOString(), note: null };
  } else if (op === 'reject') {
    patch = {
      status: 'rejected', verified_by: 'manual', verified_at: null,
      note: String(body.note || 'manual reject').slice(0, 200)
    };
  } else if (op === 'setvolume') {
    const vol = Number(body.volume);
    if (!isFinite(vol) || vol < 0) return fail(res, 400, 'bad_volume');
    if (!caps.volume) return fail(res, 503, 'schema_missing');
    patch = { volume: vol, volume_updated_at: new Date().toISOString() };
  } else if (op === 'delvolume') {
    if (!caps.volume) return fail(res, 503, 'schema_missing');
    patch = { volume: null, volume_updated_at: null };
  } else if (op === 'revoke') {
    patch = { status: 'rejected', verified_by: 'manual', verified_at: null, note: 'revoked' };
    if (caps.mentor) patch.mentor_status = 'revoked';
  } else {
    return fail(res, 400, 'bad_op');
  }

  let row;
  try {
    row = await svcPatch(userId, patch, caps);
  } catch (e) {
    console.error('[ACCESS] admin op', e && e.message);
    return fail(res, 500, 'store_error');
  }
  if (!row) return fail(res, 404, 'not_found');

  if (op === 'approve') {
    const got = await ensureMentorInvite(userId, row, caps);
    row = got.row;
    await notifyAdmin(
      '🎉 Yeni bir üye premium\'a katıldı.\n\n' +
      (row.exchange ? String(row.exchange).toUpperCase() + ' · UID ' + (row.exchange_uid || '—') + '\n' : '') +
      'Mentorship daveti: ' + (got.created ? 'hazır' : (mentorView(caps, row).invite ? 'hazır' : 'bekliyor')) +
      '\n\nhttps://alfa-trader.com/?page=erisim'
    );
  }
  if (op === 'revoke' && row.mentor_invite) {
    try { await revokeMentorshipInvite(row.mentor_invite); } catch (e) { /* best-effort */ }
  }
  return send(res, 200, {
    ok: true,
    status: row.status,
    user_id: row.user_id,
    mentor: mentorView(caps, row)
  });
}

async function mentorOpHandler(res, user, jwt) {
  const caps = await accessCaps();
  if (!caps.mentor) return fail(res, 503, 'schema_missing');
  if (!mentorshipConfigured()) return fail(res, 503, 'mentor_not_configured');

  let row = null;
  try {
    const got = await readOwn(jwt, user.id, caps);
    if (got.missing) return fail(res, 500, 'access_store');
    row = got.row;
  } catch (e) {
    console.error('[ACCESS] mentor read', e && e.message);
    return fail(res, 500, 'store_error');
  }
  if (!row || row.status !== 'verified') return fail(res, 403, 'not_verified');

  const got = await ensureMentorInvite(user.id, row, caps, { force: true });
  return send(res, 200, { ok: true, mentor: mentorView(caps, got.row) });
}

async function statusHandler(res, user, jwt) {
  const admin = isAdminUser(user);
  const caps = await accessCaps();
  let row = null;
  let missing = false;
  try {
    const got = await readOwn(jwt, user.id, caps);
    missing = !!got.missing;
    row = got.row || null;
  } catch (e) {
    console.error('[ACCESS] status read', e && e.message);
    return fail(res, 500, 'store_error');
  }

  const status = admin ? 'verified' : (row ? row.status : 'none');

  // Dogrulanmis ama daveti olmayan uyeler (eski kayitlar) icin bir kez
  // davet uret. Telegram hatasi GET'i asla bozmaz.
  if (!admin && row && row.status === 'verified' && caps.mentor && mentorshipConfigured() &&
      row.mentor_status !== 'joined' && row.mentor_status !== 'revoked' &&
      !inviteIsLive(row.mentor_invite, row.mentor_invite_expires_at)) {
    try {
      const got = await ensureMentorInvite(user.id, row, caps);
      row = got.row;
    } catch (e) {
      console.error('[ACCESS] mentor ensure', e && e.message);
    }
  }

  const open = process.env.SITE_ACCESS_OPEN === '1';

  // Tablo kurulmamis ise kapi devre disidir: kimseyi yanlislikla kilitlemeyiz.
  // (Kurulum yapilinca kapi otomatik olarak devreye girer.)
  const tier = missing ? 'ref' : (open ? 'ref' : tierOf(user, status));

  return send(res, 200, {
    ok: true,
    tier,
    admin,
    gate_active: !missing,
    status: open ? 'verified' : status,
    exchange: row ? row.exchange : null,
    exchange_uid: row ? row.exchange_uid : null,
    verified_at: row ? row.verified_at : null,
    verified_by: row ? row.verified_by : null,
    volume: row && row.volume !== undefined ? row.volume : null,
    store_missing: missing,
    configured: { okx: isConfigured('okx'), bybit: isConfigured('bybit') },
    mentor: mentorView(caps, row),
    schema: { volume: caps.volume, mentor: caps.mentor },
    links: links()
  });
}

async function submitHandler(res, user, jwt, body) {
  const exchange = String(body.exchange || '').toLowerCase();
  const uid = String(body.uid || '').trim().replace(/\s+/g, '');

  if (exchange !== 'okx' && exchange !== 'bybit') return fail(res, 400, 'bad_exchange');
  if (!/^[A-Za-z0-9]{3,32}$/.test(uid)) return fail(res, 400, 'bad_uid');

  // Admin zaten tam erisimli; bosuna borsa sorgusu yapmayalim.
  if (isAdminUser(user)) {
    return send(res, 200, {
      ok: true, tier: 'admin', status: 'verified', verified: true,
      mentor: { enabled: false, status: 'none', invite: null }
    });
  }

  const caps = await accessCaps();
  let existing = null;
  try {
    const got = await readOwn(jwt, user.id, caps);
    if (got.missing) return fail(res, 500, 'access_store');
    existing = got.row;
  } catch (e) {
    console.error('[ACCESS] submit read', e && e.message);
    return fail(res, 500, 'store_error');
  }

  // Dogrulanmis kullanici yeniden basvurarak durumunu dusuremez.
  if (existing && existing.status === 'verified') {
    const got = await ensureMentorInvite(user.id, existing, caps);
    return send(res, 200, {
      ok: true, tier: 'ref', status: 'verified', verified: true,
      mentor: mentorView(caps, got.row)
    });
  }

  if (existing && existing.updated_at) {
    const waited = Date.now() - new Date(existing.updated_at).getTime();
    if (waited >= 0 && waited < COOLDOWN_MS) return fail(res, 429, 'too_soon');
  }
  if (existing && (existing.attempts || 0) >= MAX_ATTEMPTS) {
    return fail(res, 429, 'too_many_attempts');
  }

  const v = await verifyExchange(exchange, uid);

  // Anahtar yoksa veya borsa hata verdiyse dogrulama yapilamaz: 'pending'
  // birak, yanlis sonuc yazma. Yalnizca kesin 'yok' cevabi reddedilir.
  const status = submitStatusFor(v);

  const row = {
    user_id: user.id,
    exchange,
    exchange_uid: uid,
    status,
    verified_by: v.verified ? exchange + '-api' : null,
    verified_at: v.verified ? new Date().toISOString() : null,
    note: v.verified ? null : v.reason,
    attempts: ((existing && existing.attempts) || 0) + 1
  };
  if (caps.volume) {
    if (v.volume !== null && v.volume !== undefined) {
      row.volume = v.volume;
      row.volume_updated_at = new Date().toISOString();
    }
    if (v.joinedAt) row.exchange_joined_at = v.joinedAt;
  }
  if (caps.mentor) {
    row.last_checked_at = new Date().toISOString();
    row.check_reason = v.reason;
  }

  try {
    await writeRow(row, caps);
  } catch (e) {
    if (e && e.conflict) return fail(res, 409, 'uid_taken');
    console.error('[ACCESS] submit write', e && e.message);
    return fail(res, 500, 'access_store');
  }

  let saved = row;
  if (status === 'verified') {
    const got = await ensureMentorInvite(user.id, row, caps);
    saved = got.row;
    await notifyAdmin(
      '✅ UID otomatik doğrulandı.\n\n' +
      String(exchange).toUpperCase() + ' · UID ' + uid +
      (v.volume !== null && v.volume !== undefined ? '\nHacim: $' + Number(v.volume).toLocaleString('tr-TR') : '') +
      '\nMentorship daveti: ' + (mentorView(caps, saved).invite ? 'hazır' : 'bekliyor') +
      '\n\nhttps://alfa-trader.com/?page=erisim'
    );
  }

  return send(res, 200, {
    ok: true,
    tier: tierOf(user, status),
    status,
    verified: v.verified,
    manual: v.reason === 'not_configured',
    reason: v.reason,
    mentor: mentorView(caps, saved)
  });
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    return res.end();
  }

  const authHeader = req.headers.authorization || '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!jwt) return fail(res, 401, 'unauthorized');

  const user = await getUser(jwt);
  if (!user) return fail(res, 401, 'unauthorized');

  if (req.method === 'GET') {
    if (req.query && req.query.op === 'list') return listHandler(res, user);
    return statusHandler(res, user, jwt);
  }

  if (req.method === 'POST') {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const op = body.op || 'status';
    if (op === 'status') return statusHandler(res, user, jwt);
    if (op === 'submit') return submitHandler(res, user, jwt, body);
    if (op === 'mentor') return mentorOpHandler(res, user, jwt);
    if (op === 'approve' || op === 'reject' || op === 'revoke' || op === 'setvolume' || op === 'delvolume') return adminOpHandler(res, user, body);
    return fail(res, 400, 'bad_request');
  }

  return fail(res, 405, 'method_not_allowed');
}
