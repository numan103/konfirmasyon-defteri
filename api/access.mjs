// ALFA TRADERS - uyelik / referans erisim ucu
//
// GET  /api/access            -> kullanicinin erisim durumu
// POST /api/access {op:'submit', exchange:'okx'|'bybit', uid:'...'}
//                             -> UID'yi borsaya sorar, sonucu kaydeder
//
// Kimlik: Authorization: Bearer <supabase access token>
// Okuma: kullanicinin kendi JWT'si (RLS ile yalniz kendi satiri)
// Yazma: SUPABASE_SERVICE_ROLE (istemci kendini 'verified' yapamaz)
//
// Borsa API anahtarlari tanimli degilse dogrulama yapilamaz; basvuru
// 'pending' olarak kaydedilir ve elle onaylanabilir. Yanlis sonuc uretilmez.

import { verifyExchange, isConfigured } from '../lib/exchanges.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zvnjslmptwmnuhftgqsr.supabase.co';
const PUB = process.env.SUPABASE_PUBLISHABLE || 'sb_publishable_3esU1e0mIeUaSrmqPxsEfQ_Lcv11GLa';

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

  if (req.method === 'GET') return statusHandler(res, user, jwt);

  if (req.method === 'POST') {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const op = body.op || 'status';
    if (op === 'status') return statusHandler(res, user, jwt);
    if (op === 'submit') return submitHandler(res, user, jwt, body);
    return fail(res, 400, 'bad_request');
  }

  return fail(res, 405, 'method_not_allowed');
}
