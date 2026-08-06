// Topluluk Katkıları + Çalışma Panosu — Supabase üzerinden paylaşım (edu_shared tablosunun ayrı satırları).
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zvnjslmptwmnuhftgqsr.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE || 'sb_publishable_3esU1e0mIeUaSrmqPxsEfQ_Lcv11GLa';
const ROW_CONTRIB = 'contribs';
const ROW_PANO = 'panos';
const JOURNAL_UID = '00000000-0000-0000-0000-00000000e001';

const sbHeaders = (key) => ({
  apikey: key,
  Authorization: 'Bearer ' + key,
  'Content-Type': 'application/json',
});

async function readShared(rowId) {
  const url = `${SUPABASE_URL}/rest/v1/edu_shared?id=eq.${rowId}&select=data`;
  const res = await fetch(url, { headers: sbHeaders(SUPABASE_KEY) });
  if (res.status === 404) return { missing: true };
  if (!res.ok) return { error: `Supabase read ${res.status}: ${(await res.text()).slice(0, 160)}` };
  const rows = await res.json();
  return { data: (rows && rows[0] && rows[0].data) || null };
}

async function writeShared(rowId, data) {
  const url = `${SUPABASE_URL}/rest/v1/edu_shared`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...sbHeaders(SUPABASE_KEY), Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ id: rowId, data }),
  });
  if (res.status === 404) return { missing: true };
  if (!res.ok) return { error: `Supabase write ${res.status}: ${(await res.text()).slice(0, 160)}` };
  return { ok: true };
}

async function readJournal(select) {
  const key = process.env.SUPABASE_SERVICE_ROLE;
  if (!key) return { missing: true };
  const url = `${SUPABASE_URL}/rest/v1/journals?user_id=eq.${JOURNAL_UID}&select=data`;
  const res = await fetch(url, { headers: sbHeaders(key) });
  if (!res.ok) return { error: `Journal read ${res.status}` };
  const rows = await res.json();
  return { data: (rows && rows[0] && rows[0].data) || null };
}

async function writeJournal(data, extra) {
  const key = process.env.SUPABASE_SERVICE_ROLE;
  if (!key) return { missing: true };
  const url = `${SUPABASE_URL}/rest/v1/journals`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...sbHeaders(key), Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ user_id: JOURNAL_UID, data, updated_at: new Date().toISOString(), ...extra }),
  });
  if (!res.ok) return { error: `Journal write ${res.status}: ${(await res.text()).slice(0, 160)}` };
  return { ok: true };
}

function cleanRoom(r) {
  return String(r || 'alfa').replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'alfa';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const store = req.query.store === 'pano' ? 'pano' : 'contrib';
  const rowId = store === 'pano' ? ROW_PANO : ROW_CONTRIB;
  const room = cleanRoom(req.query.room);

  if (req.method === 'GET') {
    const r = await readShared(rowId);
    if (store === 'pano') {
      const map = r.data && typeof r.data === 'object' && !Array.isArray(r.data) ? r.data : {};
      if (map[room]) return res.status(200).json({ ok: true, room, data: map[room] });
      if (r.error && !r.missing) return res.status(500).json({ error: r.error });
      const j = await readJournal();
      const jmap = j.data && typeof j.data === 'object' && !Array.isArray(j.data) ? j.data : {};
      if (jmap[room]) return res.status(200).json({ ok: true, room, data: jmap[room] });
      return res.status(200).json({ ok: true, room, data: null });
    }
    if (r.data) return res.status(200).json(r.data);
    if (!r.error && !r.missing) return res.status(200).json([]);
    const j = await readJournal();
    const jdata = Array.isArray(j.data) ? j.data : [];
    return res.status(200).json(jdata);
  }

  if (req.method === 'POST') {
    let body;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); } catch (e) { return res.status(400).json({ error: 'Invalid JSON body' }); }

    if (store === 'pano') {
      const board = body.data;
      if (board === undefined || board === null) return res.status(400).json({ error: 'data required' });
      const cur = await readShared(rowId);
      if (cur.error && !cur.missing) return res.status(500).json({ error: cur.error });
      const map = cur.data && typeof cur.data === 'object' && !Array.isArray(cur.data) ? cur.data : {};
      map[room] = board;
      const w = await writeShared(rowId, map);
      if (w.ok) return res.status(200).json({ ok: true, via: 'edu_shared', room });
      if (!w.missing) return res.status(500).json({ error: w.error });
      const jr = await readJournal();
      const jmap = jr.data && typeof jr.data === 'object' && !Array.isArray(jr.data) ? jr.data : {};
      jmap[room] = board;
      const jw = await writeJournal(jmap);
      if (jw.ok) return res.status(200).json({ ok: true, via: 'journals', room });
      if (!jw.missing) return res.status(500).json({ error: jw.error });
      return res.status(500).json({ error: 'Pano depolaması hazır değil.' });
    }

    const { title, url, author } = body || {};
    if (!url) return res.status(400).json({ error: 'url required' });

    const item = {
      id: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
      title: String(title || '').slice(0, 140),
      url: String(url).slice(0, 300),
      author: String(author || '').slice(0, 60),
      time: new Date().toISOString(),
    };

    const cur = await readShared(rowId);
    if (cur.error && !cur.missing) return res.status(500).json({ error: cur.error });
    const list = Array.isArray(cur.data) ? cur.data : [];
    list.push(item);
    if (list.length > 200) list.splice(0, list.length - 200);

    const w = await writeShared(rowId, list);
    if (w.ok) return res.status(200).json({ ok: true, via: 'edu_shared', item });
    if (!w.missing) return res.status(500).json({ error: w.error });

    const jr = await readJournal();
    const jdata = Array.isArray(jr.data) ? jr.data : [];
    jdata.push(item);
    if (jdata.length > 200) jdata.splice(0, jdata.length - 200);
    const jw = await writeJournal(jdata);
    if (jw.ok) return res.status(200).json({ ok: true, via: 'journals', item });
    if (!jw.missing) return res.status(500).json({ error: jw.error });

    return res.status(500).json({ error: 'Paylaşım depolaması hazır değil.' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
