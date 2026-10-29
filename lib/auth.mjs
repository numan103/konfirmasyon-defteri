// Ortak kimlik / erisim yardimcilari.
//
// requestUser(req)  -> { id, email, jwt, admin } | null
// requestTier(user)  -> 'admin' | 'ref' | 'free' | null
//
// Kural: tablo (site_access) kurulu degilse kapi devre disidir ve herkes
// 'ref' sayilir (kimse yanlislikla kilitlenmesin). Tablo kurulunca kapi
// kendiliginden devreye girer.

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zvnjslmptwmnuhftgqsr.supabase.co';
const PUB = process.env.SUPABASE_PUBLISHABLE || 'sb_publishable_3esU1e0mIeUaSrmqPxsEfQ_Lcv11GLa';

const FALLBACK_ADMIN = 'ahmetnuman20@gmail.com';

export function adminEmails() {
  const raw = process.env.SITE_ADMIN_EMAILS || process.env.SITE_ADMIN_EMAIL || FALLBACK_ADMIN;
  return raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export function isAdminEmail(email) {
  const mail = String(email || '').toLowerCase();
  return !!mail && adminEmails().indexOf(mail) >= 0;
}

export function bearer(req) {
  const raw = (req && req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  return String(raw).replace(/^Bearer\s+/i, '').trim();
}

export async function requestUser(req) {
  const jwt = bearer(req);
  if (!jwt) return null;
  try {
    const r = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: { apikey: PUB, Authorization: 'Bearer ' + jwt }
    });
    if (!r.ok) return null;
    const u = await r.json();
    if (!u || !u.id) return null;
    return { id: u.id, email: String(u.email || ''), jwt, admin: isAdminEmail(u.email) };
  } catch (e) {
    return null;
  }
}

export async function requestTier(user) {
  if (!user) return null;
  if (user.admin) return 'admin';
  if (process.env.SITE_ACCESS_OPEN === '1') return 'ref';
  try {
    const r = await fetch(
      SUPABASE_URL + '/rest/v1/site_access?user_id=eq.' + encodeURIComponent(user.id) + '&select=status',
      { headers: { apikey: PUB, Authorization: 'Bearer ' + user.jwt } }
    );
    if (r.status === 404) return 'ref'; // tablo yok -> kapi kapali
    if (!r.ok) return 'free';
    const rows = await r.json();
    const st = rows && rows[0] && rows[0].status;
    return st === 'verified' ? 'ref' : 'free';
  } catch (e) {
    return 'free';
  }
}

// Kisa vadeli istek siniri (ayni surec icinde; Vercel'de instance basina).
const buckets = new Map();
export function throttle(key, ms) {
  const now = Date.now();
  const last = buckets.get(key) || 0;
  if (now - last < ms) return false;
  buckets.set(key, now);
  if (buckets.size > 5000) {
    for (const [k, t] of buckets) if (now - t > ms * 4) buckets.delete(k);
  }
  return true;
}
