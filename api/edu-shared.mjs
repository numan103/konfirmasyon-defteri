// Alfa Edu paylaşılan içerik — Supabase üzerinden paylaşım.
// Strateji 1: edu_shared tablosu (SQL ile oluşturulmalı, RLS açık).
// Strateji 2: journals tablosuna sabit satır + SUPABASE_SERVICE_ROLE (RLS atlar).
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zvnjslmptwmnuhftgqsr.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE || 'sb_publishable_3esU1e0mIeUaSrmqPxsEfQ_Lcv11GLa';
const ROW_ID = 'v1';
const JOURNAL_UID = '00000000-0000-0000-0000-00000000e000';

const sbHeaders = (key) => ({
  apikey: key,
  Authorization: 'Bearer ' + key,
  'Content-Type': 'application/json',
});

async function readEduShared() {
  const url = `${SUPABASE_URL}/rest/v1/edu_shared?id=eq.${ROW_ID}&select=data`;
  const res = await fetch(url, { headers: sbHeaders(SUPABASE_KEY) });
  if (res.status === 404) return { missing: true };
  if (!res.ok) return { error: `Supabase read ${res.status}: ${(await res.text()).slice(0, 160)}` };
  const rows = await res.json();
  return { data: (rows && rows[0] && rows[0].data) || null };
}

async function writeEduShared(data) {
  const url = `${SUPABASE_URL}/rest/v1/edu_shared`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...sbHeaders(SUPABASE_KEY), Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ id: ROW_ID, data }),
  });
  if (res.status === 404) return { missing: true };
  if (!res.ok) return { error: `Supabase write ${res.status}: ${(await res.text()).slice(0, 160)}` };
  return { ok: true };
}

async function readJournal() {
  const key = process.env.SUPABASE_SERVICE_ROLE;
  if (!key) return { missing: true };
  const url = `${SUPABASE_URL}/rest/v1/journals?user_id=eq.${JOURNAL_UID}&select=data`;
  const res = await fetch(url, { headers: sbHeaders(key) });
  if (!res.ok) return { error: `Journal read ${res.status}` };
  const rows = await res.json();
  return { data: (rows && rows[0] && rows[0].data) || null };
}

async function writeJournal(data) {
  const key = process.env.SUPABASE_SERVICE_ROLE;
  if (!key) return { missing: true };
  const url = `${SUPABASE_URL}/rest/v1/journals`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...sbHeaders(key), Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ user_id: JOURNAL_UID, data, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) return { error: `Journal write ${res.status}: ${(await res.text()).slice(0, 160)}` };
  return { ok: true };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const r = await readEduShared();
    if (r.data) return res.status(200).json(r.data);
    if (!r.error && !r.missing) return res.status(200).json(r.data || { sections: {}, sel: {}, selVid: {} });
    const j = await readJournal();
    if (j.data) return res.status(200).json(j.data);
    const warn = r.error || (r.missing ? 'edu_shared tablosu yok (SQL kurulumu gerekli)' : null) || j.error || '';
    return res.status(200).json({ sections: {}, sel: {}, selVid: {}, _warn: warn });
  }

  if (req.method === 'POST') {
    let body;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); } catch (e) { return res.status(400).json({ error: 'Invalid JSON body' }); }
    if (!body || !body.sections) return res.status(400).json({ error: 'Missing sections in body' });
    const clean = { sections: body.sections || {}, sel: body.sel || {}, selVid: body.selVid || {} };

    const r = await writeEduShared(clean);
    if (r.ok) return res.status(200).json({ ok: true, via: 'edu_shared' });
    if (!r.missing) return res.status(500).json({ error: r.error });

    const j = await writeJournal(clean);
    if (j.ok) return res.status(200).json({ ok: true, via: 'journals' });
    if (!j.missing) return res.status(500).json({ error: j.error });

    return res.status(500).json({ error: 'Paylaşım depolaması hazır değil. Supabase SQL kurulumu veya SUPABASE_SERVICE_ROLE env gerekli.' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
