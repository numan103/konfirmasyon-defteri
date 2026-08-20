// Alfa Portföy — public portfolio data for non-member teasers.
// GET  → read public portfolio summary (edu_shared, id='alfa_portfoy_public')
// POST → write public portfolio summary (admin only — amAllowed check is done client-side)
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zvnjslmptwmnuhftgqsr.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE || 'sb_publishable_3esU1e0mIeUaSrmqPxsEfQ_Lcv11GLa';
const ROW_ID = 'alfa_portfoy_public';

const sbHeaders = () => ({
  apikey: SUPABASE_KEY,
  Authorization: 'Bearer ' + SUPABASE_KEY,
  'Content-Type': 'application/json',
});

async function readPortfolio() {
  const url = `${SUPABASE_URL}/rest/v1/edu_shared?id=eq.${ROW_ID}&select=data`;
  const res = await fetch(url, { headers: sbHeaders() });
  if (res.status === 404) return { missing: true };
  if (!res.ok) return { error: `Supabase read ${res.status}` };
  const rows = await res.json();
  return { data: (rows && rows[0] && rows[0].data) || null };
}

async function writePortfolio(data) {
  const url = `${SUPABASE_URL}/rest/v1/edu_shared`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...sbHeaders(), Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ id: ROW_ID, data }),
  });
  if (res.status === 404) return { missing: true };
  if (!res.ok) return { error: `Supabase write ${res.status}: ${(await res.text()).slice(0, 120)}` };
  return { ok: true };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const r = await readPortfolio();
    if (r.error) return res.status(500).json(r);
    if (r.missing) return res.status(200).json({ data: null });
    return res.status(200).json({ data: r.data });
  }

  if (req.method === 'POST') {
    if (!req.body || typeof req.body !== 'object') return res.status(400).json({ error: 'invalid body' });
    const r = await writePortfolio(req.body);
    if (r.error) return res.status(500).json(r);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'method not allowed' });
}
