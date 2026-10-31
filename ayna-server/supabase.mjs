// Match the site's existing project defaults when optional Vercel vars are absent.
const BASE = process.env.SUPABASE_URL || 'https://zvnjslmptwmnuhftgqsr.supabase.co';
const PUB = process.env.SUPABASE_PUBLISHABLE || 'sb_publishable_bReG5UKaWcQkU0Z9GnGiJQ_0T4_Qm9X';

function authHeaders(auth) {
  if (auth && auth.service) {
    const key = process.env.SUPABASE_SERVICE_ROLE || '';
    const h = { apikey: key };
    if (!key.startsWith('sb_secret_')) h.Authorization = `Bearer ${key}`;
    return h;
  }
  return { apikey: PUB, Authorization: `Bearer ${auth.jwt}` };
}

export async function getUser(jwt) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const r = await fetch(`${BASE}/auth/v1/user`, { signal: ctrl.signal, headers: { apikey: PUB, Authorization: `Bearer ${jwt}` } });
    const data = await r.json().catch(() => null);
    if (!r.ok) {
      // An invalid project key / auth outage is NOT an expired user session.
      if (/api.?key|publishable key/i.test(String(data?.message || data?.msg || ''))) throw new Error('auth_unavailable');
      if (r.status === 401 || r.status === 403) return null;
      throw new Error('auth_unavailable');
    }
    if (!data?.id) throw new Error('auth_unavailable');
    return data;
  } finally { clearTimeout(timer); }
}

export async function db(auth, method, path, body, prefer) {
  const headers = { ...authHeaders(auth), 'Content-Type': 'application/json' };
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(`${BASE}/rest/v1/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await r.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch (e) { data = text; }
  }
  if (!r.ok) {
    const err = new Error(`db ${method} ${path.split('?')[0]} ${r.status}`);
    err.status = r.status;
    err.code = data && data.code;
    throw err;
  }
  return data;
}

export const q = encodeURIComponent;
