const BASE = process.env.SUPABASE_URL;
const PUB = process.env.SUPABASE_PUBLISHABLE;

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
  const r = await fetch(`${BASE}/auth/v1/user`, { headers: { apikey: PUB, Authorization: `Bearer ${jwt}` } });
  if (!r.ok) { const t = await r.text().catch(() => ''); console.error('[AYNA] 500', r.status, t.slice(0,8)); return null; }
  const u = await r.json();
  return u && u.id ? u : null;
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
