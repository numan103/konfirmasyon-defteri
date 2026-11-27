// Anonymous, backend-backed public chart links. One bounded row in edu_shared
// keeps snapshots out of the browser; service-role writes never reach clients.
import { normalizeChartSnapshot } from '../assets/alfa-share-state.mjs';

const ROW_ID = 'chartshares';
const MAX_LINKS = 250;
const ID_RE = /^[a-z0-9]{8,12}$/;
const DEFAULT_URL = 'https://fssrtlpjqbavzomynwmg.supabase.co';
const DEFAULT_KEY = 'sb_publishable_Zo8BS0jA6f0RBY0DIRUmvg_WsXngIx-';

function depsFor(overrides = {}) {
  return {
    fetcher: overrides.fetcher || globalThis.fetch,
    serviceKey: overrides.serviceKey ?? process.env.SUPABASE_SERVICE_ROLE ?? '',
    publishableKey: overrides.publishableKey ?? process.env.SUPABASE_PUBLISHABLE ?? DEFAULT_KEY,
    supabaseUrl: overrides.supabaseUrl ?? process.env.SUPABASE_URL ?? DEFAULT_URL,
    random: overrides.random || (() => {
      try { return globalThis.crypto?.randomUUID?.().replace(/-/g, '').slice(0, 10); } catch {}
      return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`.slice(0, 10);
    }),
    now: overrides.now || (() => new Date().toISOString())
  };
}

function headers(key) {
  return {
    apikey: key,
    ...(String(key).startsWith('sb_secret_') ? {} : { Authorization: 'Bearer ' + key }),
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates'
  };
}

async function readMap(deps) {
  const response = await deps.fetcher(`${deps.supabaseUrl}/rest/v1/edu_shared?id=eq.${ROW_ID}&select=data`, {
    headers: headers(deps.publishableKey), cache: 'no-store'
  });
  if (!response.ok) throw new Error(`Supabase read ${response.status}`);
  const rows = await response.json();
  const data = rows?.[0]?.data;
  return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
}

async function writeMap(map, deps) {
  if (!deps.serviceKey) return { ok: false, error: 'chart_share_unavailable' };
  const response = await deps.fetcher(`${deps.supabaseUrl}/rest/v1/edu_shared`, {
    method: 'POST',
    headers: headers(deps.serviceKey),
    body: JSON.stringify({ id: ROW_ID, data: map })
  });
  if (!response.ok) return { ok: false, error: `Supabase write ${response.status}` };
  return { ok: true };
}

function newId(map, deps) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const id = String(deps.random()).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10);
    if (id.length >= 8 && !map[id]) return id;
  }
  return '';
}

export { normalizeChartSnapshot };
export async function chartShareHandler(req, res, overrides = {}) {
  const deps = depsFor(overrides);
  if (req.method === 'GET') {
    const id = String(req.query?.id || '').trim().toLowerCase();
    if (!ID_RE.test(id)) return res.status(200).json({ ok: true, found: false, snapshot: null });
    try {
      const map = await readMap(deps);
      const raw = map[id];
      if (!raw || typeof raw !== 'object') return res.status(200).json({ ok: true, found: false, snapshot: null });
      const snapshot = normalizeChartSnapshot({ ...raw, createdAt: raw.createdAt || deps.now() }, deps);
      return res.status(200).json({ ok: true, found: true, snapshot });
    } catch (error) {
      return res.status(503).json({ ok: false, error: 'chart_share_unavailable', detail: error.message });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); }
  catch { return res.status(400).json({ ok: false, error: 'invalid_json' }); }
  if (JSON.stringify(body).length > 60000) return res.status(413).json({ ok: false, error: 'chart_share_too_large' });

  let snapshot;
  try { snapshot = normalizeChartSnapshot(body, deps); }
  catch (error) {
    const code = String(error.message || 'invalid_chart_share');
    return res.status(code === 'script_too_large' ? 413 : 400).json({ ok: false, error: code });
  }

  try {
    const map = await readMap(deps);
    let id = newId(map, deps);
    if (!id) return res.status(503).json({ ok: false, error: 'chart_share_unavailable' });
    const createdAt = deps.now();
    map[id] = { ...snapshot, createdAt };
    for (const key of Object.keys(map)) {
      if (Object.keys(map).length <= MAX_LINKS) break;
      delete map[key];
    }
    const saved = await writeMap(map, deps);
    if (!saved.ok) return res.status(503).json({ ok: false, error: saved.error });
    return res.status(200).json({ ok: true, id, url: `/alfa-charts.html?share=${id}` });
  } catch (error) {
    return res.status(503).json({ ok: false, error: 'chart_share_unavailable', detail: error.message });
  }
}
