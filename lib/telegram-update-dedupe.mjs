// Telegram webhook tekrarlarını sürekli (durable) olarak engeller.
// Süreç içi Set, worker yeniden başladığında sıfırlanır; gerçek kayıt yeni
// Supabase projesindeki edu_shared satırında tutulur. Yeni API/fonksiyon açılmaz.
// Satır CAS (updated_at) ile güncellenir; eşzamanlı teslimatlarda kayıp yoktur.
const BASE = process.env.SUPABASE_URL || 'https://fssrtlpjqbavzomynwmg.supabase.co';
const LEGACY_REF = 'zvnjslmptwmnuhftgqsr';
export const DEDUPE_ROW = 'tg_update_dedupe';
export const MAX_SEEN = 500;

// Aynı worker içindeki hızlı yol. DB geçici olarak erişilemezse en azından
// aynı süreçte tekrar işleme olmaz; kalıcı kayıt yine DB'de tutulur.
const localSeen = new Set();
const rememberLocal = id => {
  localSeen.add(id);
  while (localSeen.size > MAX_SEEN) localSeen.delete(localSeen.values().next().value);
};

function headers(extra = {}) {
  const key = (process.env.SUPABASE_SERVICE_ROLE || '').trim();
  if (!key) throw new Error('dedupe_not_configured');
  return {
    apikey: key,
    ...(key.startsWith('sb_secret_') ? {} : { Authorization: 'Bearer ' + key }),
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function db(query, method = 'GET', body, prefer) {
  if (BASE.includes(LEGACY_REF)) throw new Error('legacy_project_blocked');
  const r = await fetch(BASE + '/rest/v1/edu_shared' + query, {
    method,
    headers: headers(prefer ? { Prefer: prefer } : {}),
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error('dedupe_storage_unavailable');
  return r.status === 204 ? [] : r.json();
}

async function readRow() {
  const rows = await db('?id=eq.' + DEDUPE_ROW + '&select=data,updated_at&limit=1');
  const row = Array.isArray(rows) ? rows[0] : null;
  return { data: row?.data || {}, revision: row?.updated_at || null };
}

function prune(seen) {
  const entries = Object.entries(seen).filter(([, at]) => Number.isFinite(at));
  if (entries.length <= MAX_SEEN) return seen;
  entries.sort((a, b) => b[1] - a[1]);
  return Object.fromEntries(entries.slice(0, MAX_SEEN));
}

export async function wasProcessed(id) {
  if (!id || !Number.isSafeInteger(id)) return false;
  // Do not fail a webhook because the dedupe store is temporarily down; the
  // durable ingestion paths below still use their own CAS/retry contracts.
  if (localSeen.has(id)) return true;
  if (!process.env.SUPABASE_SERVICE_ROLE) return false;
  try {
    const { data } = await readRow();
    return Number.isFinite(data?.seen?.[id]);
  } catch { return false; }
}

export async function markProcessed(id) {
  if (!id || !Number.isSafeInteger(id)) return false;
  rememberLocal(id);
  if (!process.env.SUPABASE_SERVICE_ROLE) return true;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { data, revision } = await readRow();
      const seen = { ...(data?.seen || {}) };
      if (Number.isFinite(seen[id])) return true;
      seen[id] = Date.now();
      const next = { seen: prune(seen) };
      const stamp = new Date().toISOString();
      const query = revision ? '?id=eq.' + DEDUPE_ROW + '&updated_at=eq.' + encodeURIComponent(revision) : '';
      const saved = await db(query, revision ? 'PATCH' : 'POST',
        { ...(revision ? {} : { id: DEDUPE_ROW }), data: next, updated_at: stamp },
        revision ? 'return=representation' : 'resolution=merge-duplicates,return=representation');
      if (Array.isArray(saved) && saved.length) return true;
    } catch { break; }
  }
  return false;
}

export function resetDedupeState() {
  localSeen.clear();
}

export function storedUpdateIds(data) {
  return Object.keys(data?.seen || {}).filter(id => /^\d+$/.test(id));
}
