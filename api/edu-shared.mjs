// Alfa Edu paylaşılan içerik — Supabase üzerinden paylaşım.
// Strateji 1: edu_shared tablosu (SQL ile oluşturulmalı, RLS açık).
// Strateji 2: journals tablosuna sabit satır + SUPABASE_SERVICE_ROLE (RLS atlar).
//
// İki veri kategorisi aynı uçtan servis edilir (Hobby plan 12 fonksiyon limiti):
//  - ?kind=channel  => trader kanalları (id='channels', journals ...e002)
//  - varsayılan     => Alfa Edu kurs içeriği (id='v1', journals ...e000)
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zvnjslmptwmnuhftgqsr.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE || 'sb_publishable_3esU1e0mIeUaSrmqPxsEfQ_Lcv11GLa';
const ROWS = {
  shared: { rowId: 'v1', journalUid: '00000000-0000-0000-0000-00000000e000' },
  channel: { rowId: 'channels', journalUid: '00000000-0000-0000-0000-00000000e002' },
};

const sbHeaders = (key) => ({
  apikey: key,
  Authorization: 'Bearer ' + key,
  'Content-Type': 'application/json',
});

async function readEduShared(rowId) {
  const url = `${SUPABASE_URL}/rest/v1/edu_shared?id=eq.${rowId}&select=data`;
  const res = await fetch(url, { headers: sbHeaders(SUPABASE_KEY) });
  if (res.status === 404) return { missing: true };
  if (!res.ok) return { error: `Supabase read ${res.status}: ${(await res.text()).slice(0, 160)}` };
  const rows = await res.json();
  return { data: (rows && rows[0] && rows[0].data) || null };
}

async function writeEduShared(rowId, data) {
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

async function readJournal(journalUid) {
  const key = process.env.SUPABASE_SERVICE_ROLE;
  if (!key) return { missing: true };
  const url = `${SUPABASE_URL}/rest/v1/journals?user_id=eq.${journalUid}&select=data`;
  const res = await fetch(url, { headers: sbHeaders(key) });
  if (!res.ok) return { error: `Journal read ${res.status}` };
  const rows = await res.json();
  return { data: (rows && rows[0] && rows[0].data) || null };
}

async function writeJournal(journalUid, data) {
  const key = process.env.SUPABASE_SERVICE_ROLE;
  if (!key) return { missing: true };
  const url = `${SUPABASE_URL}/rest/v1/journals`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...sbHeaders(key), Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ user_id: journalUid, data, updated_at: new Date().toISOString() }),
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
  const editors = Array.isArray(c.editors)
    ? Array.from(new Set(c.editors.map(e => String(e || '').trim().toLowerCase().slice(0, 120)).filter(Boolean))).slice(0, 20)
    : [];
  const clean = {
    id,
    name,
    bio,
    editors,
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
        ? t.videos.slice(0, 200).map(v => {
            const vtype = String((v && v.type) || 'video').toLowerCase();
            // video dışındaki tüm içerik türleri (article/post/foto) zengin "not"a normalleştirilir;
            // foto kayıtları URL'sini notun foto listesinin ilk fotoğrafı olarak taşır.
            const isNote = (vtype === 'article' || vtype === 'post' || vtype === 'not' || vtype === 'foto');
            const photos = [];
            if (isNote) {
              if (vtype === 'foto' && v && v.url) photos.push({ url: String(v.url).trim().slice(0, 600), caption: '' });
              if (Array.isArray(v && v.photos)) {
                v.photos.slice(0, 10).forEach(p => {
                  const u = String((p && p.url) || '').trim().slice(0, 600);
                  if (!u) return;
                  if (photos.some(x => x.url === u)) return;
                  photos.push({ url: u, caption: String((p && p.caption) || '').trim().slice(0, 300) });
                });
              }
            }
            return {
              id: String((v && v.id) || '').slice(0, 60),
              title: String((v && v.title) || '').slice(0, 200),
              url: String((v && v.url) || '').slice(0, 600),
              type: isNote ? 'not' : 'video',
              body: isNote ? String((v && v.body) || '').slice(0, 40000) : '',
              photos,
            };
          })
        : [],
    })).filter(t => t.id);
  });
  return clean;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const isChannel = String(req.query && req.query.kind) === 'channel';
  const meta = isChannel ? ROWS.channel : ROWS.shared;

  // Ortak oku/yaz katmanı
  const load = async () => {
    const r = await readEduShared(meta.rowId);
    if (r.data) return { data: r.data, warn: '' };
    if (!r.error && !r.missing) return { data: isChannel ? emptyChannels() : null, warn: '' };
    const j = await readJournal(meta.journalUid);
    if (j.data) return { data: j.data, warn: '' };
    return { data: isChannel ? emptyChannels() : null, warn: r.error || (r.missing ? 'edu_shared tablosu yok (SQL kurulumu gerekli)' : '') || j.error || '' };
  };
  const store = async (data) => {
    const r = await writeEduShared(meta.rowId, data);
    if (r.ok) return { ok: true };
    if (!r.missing) return { ok: false, error: r.error };
    const j = await writeJournal(meta.journalUid, data);
    if (j.ok) return { ok: true };
    return { ok: false, error: j.error || 'Paylaşım depolaması hazır değil.' };
  };

  if (req.method === 'GET') {
    if (isChannel) {
      const cur = await load();
      const base = cur.data && cur.data.traders ? cur.data : emptyChannels();
      return res.status(200).json({ ok: true, data: base, _warn: cur.warn || undefined });
    }
    const r = await load();
    if (r.data) return res.status(200).json(r.data);
    const warn = r.warn;
    return res.status(200).json({ sections: {}, sel: {}, selVid: {}, _warn: warn || undefined });
  }

  if (req.method === 'POST') {
    let body;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); } catch (e) { return res.status(400).json({ error: 'Invalid JSON body' }); }

    if (isChannel || body.trader || body.channel || body.remove) {
      const cur = await load();
      const base = (cur.data && cur.data.traders) ? JSON.parse(JSON.stringify(cur.data)) : emptyChannels();
      if (!base.traders || typeof base.traders !== 'object') base.traders = {};
      if (!Array.isArray(base.order)) base.order = [];

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

      const ch = sanitizeChannel(body.trader || body.channel);
      if (!ch) return res.status(400).json({ error: 'trader (id + name) gerekli' });
      if (base.traders[ch.id]) {
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

    if (!body || !body.sections) return res.status(400).json({ error: 'Missing sections in body' });
    const clean = { sections: body.sections || {}, sel: body.sel || {}, selVid: body.selVid || {} };
    const r = await store(clean);
    if (r.ok) return res.status(200).json({ ok: true, via: 'edu_shared' });
    return res.status(500).json({ error: r.error || 'Paylaşım depolaması hazır değil. Supabase SQL kurulumu veya SUPABASE_SERVICE_ROLE env gerekli.' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
