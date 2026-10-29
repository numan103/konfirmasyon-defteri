// ALFA TRADERS - uyelik / referans erisim ucu
//
// GET  /api/access            -> kullanicinin erisim durumu
// GET  /api/access?op=list    -> (yonetici) tum basvurular + e-posta
// POST /api/access {op:'submit', exchange:'okx'|'bybit', uid:'...'}
//                             -> UID'yi borsaya sorar, sonucu kaydeder
// POST /api/access {op:'approve'|'reject'|'revoke', user_id:'...'}
//                             -> (yonetici) basvuruyu onaylar/reddeder
//
// Kimlik: Authorization: Bearer <supabase access token>
// Okuma: kullanicinin kendi JWT'si (RLS ile yalniz kendi satiri)
// Yazma: SUPABASE_SERVICE_ROLE (istemci kendini 'verified' yapamaz)
//
// Borsa API anahtarlari tanimli degilse dogrulama yapilamaz; basvuru
// 'pending' olarak kaydedilir ve elle onaylanabilir. Yanlis sonuc uretilmez.

import { verifyExchange, isConfigured } from '../lib/exchanges.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zvnjslmptwmnuhftgqsr.supabase.co';
const PUB = process.env.SUPABASE_PUBLISHABLE || 'sb_publishable_bReG5UKaWcQkU0Z9GnGiJQ_0T4_Qm9X';

const FALLBACK_ADMIN = 'ahmetnuman20@gmail.com';
const COOLDOWN_MS = 20000;
const MAX_ATTEMPTS = 10;

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

// Kullanicinin JWT'si ile okuma: RLS yalniz kendi satirini dondurur.
async function readOwn(jwt, userId) {
  const r = await fetch(
    SUPABASE_URL + '/rest/v1/site_access?user_id=eq.' + encodeURIComponent(userId) +
      '&select=exchange,exchange_uid,status,verified_at,verified_by,attempts,updated_at',
    { headers: { apikey: PUB, Authorization: 'Bearer ' + jwt } }
  );
  if (r.status === 404) return { missing: true };
  if (!r.ok) throw new Error('read ' + r.status);
  const rows = await r.json();
  return { row: rows && rows[0] ? rows[0] : null };
}

async function writeRow(row) {
  const key = process.env.SUPABASE_SERVICE_ROLE || '';
  if (!key) throw new Error('service role missing');
  const r = await fetch(SUPABASE_URL + '/rest/v1/site_access?on_conflict=user_id', {
    method: 'POST',
    headers: { ...svcHeaders(), Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([row])
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

// ---- Yonetici islemleri (service role gerekir) ----

async function svcRead(path) {
  const key = process.env.SUPABASE_SERVICE_ROLE || '';
  if (!key) throw new Error('service role missing');
  const r = await fetch(SUPABASE_URL + path, { headers: svcHeaders() });
  if (!r.ok) throw new Error('read ' + r.status);
  return r.json();
}

async function svcPatch(userId, patch) {
  const key = process.env.SUPABASE_SERVICE_ROLE || '';
  if (!key) throw new Error('service role missing');
  const r = await fetch(
    SUPABASE_URL + '/rest/v1/site_access?user_id=eq.' + encodeURIComponent(userId),
    {
      method: 'PATCH',
      headers: { ...svcHeaders(), Prefer: 'return=representation' },
      body: JSON.stringify(patch)
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
  let rows;
  try {
    rows = await svcRead(
      '/rest/v1/site_access?select=user_id,exchange,exchange_uid,status,note,attempts,' +
      'verified_at,verified_by,created_at,updated_at,volume&order=created_at.desc&limit=200'
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
    updated_at: r.updated_at
  }));
  // Aylık sistem: dogrulanan referans sayilarini ay bazinda ozetle.
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
  return send(res, 200, { ok: true, rows: out, open: process.env.SITE_ACCESS_OPEN === '1', byMonth: monthList });
}

async function adminOpHandler(res, user, body) {
  if (!isAdminUser(user)) return fail(res, 403, 'admin_only');
  const op = String(body.op || '');
  const userId = String(body.user_id || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    return fail(res, 400, 'bad_user');
  }
  if (userId === user.id) return fail(res, 400, 'self');

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
    patch = { volume: vol };
  } else if (op === 'revoke') {
    patch = { status: 'rejected', verified_by: 'manual', verified_at: null, note: 'revoked' };
  } else {
    return fail(res, 400, 'bad_op');
  }

  let row;
  try {
    row = await svcPatch(userId, patch);
  } catch (e) {
    console.error('[ACCESS] admin op', e && e.message);
    return fail(res, 500, 'store_error');
  }
  if (!row) return fail(res, 404, 'not_found');
  // Onay sonrasi yoneticiye bilgilendirme (best-effort).
  if (op === 'approve') {
    try {
      const tgb = process.env.TG_BOT_TOKEN;
      const tgc = process.env.TG_CHAT_ID;
      if (tgb && tgc) {
        await fetch('https://api.telegram.org/bot' + tgb + '/sendMessage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: tgc,
            text: 'Referans onaylandi: ' + (user.email || 'yonetici') + ' adli hesabin UID onaylandi.'
          })
        });
      }
    } catch (e) { /* bildirim sessiz kalir */ }
  }
  return send(res, 200, { ok: true, status: row.status, user_id: row.user_id });
}

async function statusHandler(res, user, jwt) {
  const admin = isAdminUser(user);
  let row = null;
  let missing = false;
  try {
    const got = await readOwn(jwt, user.id);
    missing = !!got.missing;
    row = got.row || null;
  } catch (e) {
    console.error('[ACCESS] status read', e && e.message);
    return fail(res, 500, 'store_error');
  }

  const status = admin ? 'verified' : (row ? row.status : 'none');
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
    store_missing: missing,
    configured: { okx: isConfigured('okx'), bybit: isConfigured('bybit') },
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
    return send(res, 200, { ok: true, tier: 'admin', status: 'verified', verified: true });
  }

  let existing = null;
  try {
    const got = await readOwn(jwt, user.id);
    if (got.missing) return fail(res, 500, 'access_store');
    existing = got.row;
  } catch (e) {
    console.error('[ACCESS] submit read', e && e.message);
    return fail(res, 500, 'store_error');
  }

  // Dogrulanmis kullanici yeniden basvurarak durumunu dusuremez.
  if (existing && existing.status === 'verified') {
    return send(res, 200, { ok: true, tier: 'ref', status: 'verified', verified: true });
  }

  if (existing && existing.updated_at) {
    const waited = Date.now() - new Date(existing.updated_at).getTime();
    if (waited >= 0 && waited < COOLDOWN_MS) return fail(res, 429, 'too_soon');
  }
  if (existing && (existing.attempts || 0) >= MAX_ATTEMPTS) {
    return fail(res, 429, 'too_many_attempts');
  }

  const v = await verifyExchange(exchange, uid);

  // Anahtar yoksa dogrulama yapilamaz: 'pending' birak, yanlis sonuc yazma.
  const status = v.verified ? 'verified' : (v.reason === 'not_configured' ? 'pending' : 'rejected');

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

  try {
    await writeRow(row);
  } catch (e) {
    if (e && e.conflict) return fail(res, 409, 'uid_taken');
    console.error('[ACCESS] submit write', e && e.message);
    return fail(res, 500, 'access_store');
  }

  return send(res, 200, {
    ok: true,
    tier: tierOf(user, status),
    status,
    verified: v.verified,
    manual: v.reason === 'not_configured',
    reason: v.reason
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
    if (op === 'approve' || op === 'reject' || op === 'revoke') return adminOpHandler(res, user, body);
    return fail(res, 400, 'bad_request');
  }

  return fail(res, 405, 'method_not_allowed');
}
