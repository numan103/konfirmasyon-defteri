// Alfa Edu paylaşılan içerik — Supabase database (Vercel Blob yerine)
// Tek satırlık bir tabloda (edu_shared) tüm eğitim JSON'u tutulur.
const SUPABASE_URL = 'https://zvnjslmptwmnuhftgqsr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_3esU1e0mIeUaSrmqPxsEfQ_Lcv11GLa';
const ROW_ID = 'v1';

const sbHeaders = {
  apikey: SUPABASE_KEY,
  Authorization: 'Bearer ' + SUPABASE_KEY,
  'Content-Type': 'application/json',
};

async function readData() {
  const url = `${SUPABASE_URL}/rest/v1/edu_shared?id=eq.${ROW_ID}&select=data`;
  const res = await fetch(url, { headers: sbHeaders });
  if (!res.ok) return { error: `Supabase read ${res.status}: ${await res.text()}` };
  const rows = await res.json();
  return { data: (rows && rows[0] && rows[0].data) || null };
}

async function writeData(data) {
  const url = `${SUPABASE_URL}/rest/v1/edu_shared`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...sbHeaders, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ id: ROW_ID, data }),
  });
  if (!res.ok) return { error: `Supabase write ${res.status}: ${await res.text()}` };
  return { ok: true };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const r = await readData();
    if (r.error) return res.status(200).json({ sections: {}, sel: {}, selVid: {}, _warn: r.error });
    return res.status(200).json(r.data || { sections: {}, sel: {}, selVid: {} });
  }

  // POST: full replace — body tüm veriyi içerir
  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    if (!body || !body.sections) {
      return res.status(400).json({ error: 'Missing sections in body' });
    }
    const r = await writeData(body);
    if (r.error) return res.status(500).json({ error: r.error });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
