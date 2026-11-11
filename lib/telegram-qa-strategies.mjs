// Strateji yönetimi: Supabase edu_shared 'qa_strategies' satırında saklanır.
import { requestUser } from './auth.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zvnjslmptwmnuhftgqsr.supabase.co';
const FALLBACK_PUB = 'sb_publishable_bReG5UKaWcQkU0Z9GnGiJQ_0T4_Qm9X';
const STRATEGY_ROW = 'qa_strategies';

function supabaseKey(write) {
  const secret = String(process.env.SUPABASE_SERVICE_ROLE || '').trim();
  if (write && secret) return secret;
  return String(process.env.SUPABASE_PUBLISHABLE || FALLBACK_PUB).trim();
}
function sbHeaders(key) {
  const h = { apikey: key, 'Content-Type': 'application/json' };
  if (!key.startsWith('sb_secret_')) h.Authorization = 'Bearer ' + key;
  return h;
}

export async function readStrategies() {
  const key = supabaseKey(false);
  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/edu_shared?id=eq.' + STRATEGY_ROW + '&select=data', {
      headers: sbHeaders(key), signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return [];
    const rows = await r.json();
    const data = (rows && rows[0] && rows[0].data) || {};
    return Array.isArray(data.strategies) ? data.strategies : [];
  } catch { return []; }
}

export async function saveStrategies(strategies) {
  const key = String(process.env.SUPABASE_SERVICE_ROLE || '').trim();
  if (!key) return false;
  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/edu_shared', {
      method: 'POST',
      headers: { ...sbHeaders(key), Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ id: STRATEGY_ROW, data: { strategies } }),
      signal: AbortSignal.timeout(5000),
    });
    return r.ok;
  } catch { return false; }
}

export async function addStrategy(name, description) {
  const strategies = await readStrategies();
  const idx = strategies.findIndex(s => s.name.toLowerCase() === name.toLowerCase());
  const entry = { name, description, addedAt: new Date().toISOString() };
  if (idx >= 0) strategies[idx] = entry;
  else strategies.push(entry);
  return saveStrategies(strategies);
}

export async function removeStrategy(name) {
  const strategies = await readStrategies();
  const filtered = strategies.filter(s => s.name.toLowerCase() !== name.toLowerCase());
  if (filtered.length === strategies.length) return false;
  return saveStrategies(filtered);
}

export function formatStrategiesForPrompt(strategies) {
  if (!strategies || !strategies.length) return '';
  return '\n\nKULLANICININ STRATEJİLERİ (bu stratejilere göre yorum yap):\n' +
    strategies.map(s => '- ' + s.name + ': ' + s.description).join('\n');
}
