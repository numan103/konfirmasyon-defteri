// Alfa Edu Eğitsel Kanal — trader kanalları — Supabase üzerinden paylaşım.
// Tek satır (id='channels') içinde tüm trader kanalları: { traders: { [userId]: channel }, order: [userId...] }.
// POST ile tek trader gönderilir, sunucu mevcut haritaya merge eder (çakışma riskini azaltır).
// Strateji 1: edu_shared tablosu. Strateji 2: journals sabit satır + SUPABASE_SERVICE_ROLE.
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zvnjslmptwmnuhftgqsr.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE || 'sb_publishable_3esU1e0mIeUaSrmqPxsEfQ_Lcv11GLa';
const ROW_ID = 'channels';
const JOURNAL_UID = '00000000-0000-0000-0000-00000000e002';

const sbHeaders = (key) => ({
  apikey: key,
  Authorization: 'Bearer ' + key,
  'Content-Type': 'application/json',
});

async function readShared() {
  const url = `${SUPABASE_URL}/rest/v1/edu_shared?id=eq.${ROW_ID}&select=data`;
  const res = await fetch(url, { headers: sbHeaders(SUPABASE_KEY) });
  if (res.status === 404) return { missing: true };
  if (!res.ok) return { error: `Supabase read ${res.status}: ${(await res.text()).slice(0, 160)}` };
  const rows = await res.json();
  return { data: (rows && rows[0] && rows[0].data) || null };
}

async function writeShared(data) {
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

function emptyChannels() { return { traders: {}, order: [] }; }

function sanitizeChannel(c) {
  if (!c || typeof c !== 'object') return null;
  const id = String(c.id || '').trim().slice(0, 120);
  if (!id) return null;
  const name = String(c.name || '').trim().slice(0, 80);
  if (!name) return null;
  const bio = String(c.bio || '').trim().slice(0, 500);
  const clean = {
    id,
    name,
    bio,
    createdAt: typeof c.createdAt === 'number' ? c.createdAt : Date.now(),
    sections: {},
    secMeta: Array.isArray(c.secMeta)
      ? c.secMeta.map(s => ({ id: String((s && s.id) || '').slice(0, 60), title: String((s && s.title) || '').slice(0, 120) })).filter(s => s.id)
      : null,
  };
  const secs = (c.sections && typeof c.sections === 'object') ? c.sections : {};
  Object.keys(secs).forEach(sid => {
    const arr = Array.isArray(secs[sid]) ? secs[sid] : [];
    clean.sections[String(sid).slice(0, 60)] = arr.slice(0, 200).map(t => ({
      id: String((t && t.id) || '').slice(0, 60),
      title: String((t && t.title) || '').slice(0, 200),
      videos: Array.isArray(t && t.videos)
        ? t.videos.slice(0, 200).map(v => ({
            id: String((v && v.id) || '').slice(0, 60),
            title: String((v && v.title) || '').slice(0, 200),
            url: String((v && v.url) || '').slice(0, 600),
          }))
        : [],
    })).filter(t => t.id);
  });
  return clean;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Ortak: mevcut veriyi oku (edu_shared -> journals yedeği)
  const load = async () => {
    const r = await readShared();
    if (r.data) return { data: r.data, warn: '' };
    if (!r.error && !r.missing) return { data: emptyChannels(), warn: '' };
    const j = await readJournal();
    if (j.data) return { data: j.data, warn: '' };
    return { data: emptyChannels(), warn: r.error || (r.missing ? 'edu_shared tablosu yok (SQL kurulumu gerekli)' : '') || j.error || '' };
  };
  const store = async (data) => {
    const r = await writeShared(data);
    if (r.ok) return { ok: true };
    if (!r.missing) return { ok: false, error: r.error };
    const j = await writeJournal(data);
    if (j.ok) return { ok: true };
    return { ok: false, error: j.error || 'Paylaşım depolaması hazır değil.' };
  };

  if (req.method === 'GET') {
    const cur = await load();
    const base = cur.data && cur.data.traders ? cur.data : emptyChannels();
    return res.status(200).json({ ok: true, data: base, _warn: cur.warn || undefined });
  }

  if (req.method === 'POST') {
    let body;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); } catch (e) { return res.status(400).json({ error: 'Invalid JSON body' }); }

    const cur = await load();
    const base = (cur.data && cur.data.traders) ? JSON.parse(JSON.stringify(cur.data)) : emptyChannels();
    if (!base.traders || typeof base.traders !== 'object') base.traders = {};
    if (!Array.isArray(base.order)) base.order = [];

    // Silme
    if (body.remove) {
      const id = String(body.remove);
      if (base.traders[id]) {
        delete base.traders[id];
        base.order = base.order.filter(x => x !== id);
        const s = await store(base);
        if (!s.ok) return res.status(500).json({ error: s.error });
      }
      return res.status(200).json({ ok: true, data: base });
    }

    // Merge et: tek trader gönderilir
    const ch = sanitizeChannel(body.trader || body.channel);
    if (!ch) return res.status(400).json({ error: 'trader (id + name) gerekli' });
    if (base.traders[ch.id]) {
      // mevcut createdAt korunur, güncellenen içerik merge edilir
      const old = base.traders[ch.id];
      ch.createdAt = old.createdAt || ch.createdAt;
    } else {
      base.order.push(ch.id);
    }
    base.traders[ch.id] = ch;
    const s = await store(base);
    if (!s.ok) return res.status(500).json({ error: s.error });
    return res.status(200).json({ ok: true, data: base });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
