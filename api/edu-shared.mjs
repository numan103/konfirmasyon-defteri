// Alfa Edu paylaşılan içerik — Supabase üzerinden paylaşım.
// Strateji 1: edu_shared tablosu (SQL ile oluşturulmalı, RLS açık).
// Strateji 2: journals tablosuna sabit satır + SUPABASE_SERVICE_ROLE (RLS atlar).
//
// İki veri kategorisi aynı uçtan servis edilir (Hobby plan 12 fonksiyon limiti):
//  - ?kind=channel  => trader kanalları (id='channels', journals ...e002)
//  - varsayılan     => Alfa Edu kurs içeriği (id='v1', journals ...e000)
import portfolio from '../lib/portfolio.mjs';
import landing from '../lib/landing.mjs';
import podcast from '../lib/podcast.mjs';
import youtubeLatest from '../lib/youtube-latest.mjs';
import eduFeedback from '../lib/edu-feedback.mjs';
import influencerContent from '../lib/influencer-content.mjs';
import { sendTelegram } from '../lib/telegram.mjs';
import { FEATURES, isNew } from '../assets/site-features.mjs';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zvnjslmptwmnuhftgqsr.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE || 'sb_publishable_bReG5UKaWcQkU0Z9GnGiJQ_0T4_Qm9X';
const ROWS = {
  shared: { rowId: 'v1', journalUid: '00000000-0000-0000-0000-00000000e000' },
  channel: { rowId: 'channels', journalUid: '00000000-0000-0000-0000-00000000e002' },
  short: { rowId: 'shortlinks', journalUid: '00000000-0000-0000-0000-00000000e003' },
  features: { rowId: 'site-features' },
};

const sbHeaders = (key) => ({
  apikey: key,
  Authorization: 'Bearer ' + key,
  'Content-Type': 'application/json',
});

async function readEduShared(rowId, key = SUPABASE_KEY) {
  const url = `${SUPABASE_URL}/rest/v1/edu_shared?id=eq.${rowId}&select=data`;
  const res = await fetch(url, { headers: sbHeaders(key) });
  if (res.status === 404) return { missing: true };
  if (!res.ok) return { error: `Supabase read ${res.status}: ${(await res.text()).slice(0, 160)}` };
  const rows = await res.json();
  return { data: (rows && rows[0] && rows[0].data) || null };
}

// AlfaNews — haftalık dergi. Salt okunur, herkese açık, kişisel veri taşımaz.
async function alfaNews(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'read_only' });
  try {
    const url = `${SUPABASE_URL}/rest/v1/alfanews?id=eq.1&select=data,updated_at`;
    const response = await fetch(url, { headers: sbHeaders(SUPABASE_KEY), cache: 'no-store' });
    if (!response.ok) return res.status(200).json({ ok: false, data: null, _warn: `Supabase read ${response.status}` });
    const rows = await response.json();
    const raw = rows && rows[0] && rows[0].data;
    if (!raw || typeof raw !== 'object') return res.status(200).json({ ok: true, data: null });
    const text = (value, max) => String(value == null ? '' : value).slice(0, max);
    const entries = Array.isArray(raw.entries) ? raw.entries.slice(0, 60).map(e => ({
      id: text(e && e.id, 80),
      title: text(e && e.title, 200),
      body: text(e && e.body, 40000),
      type: e && e.type === 'update' ? 'update' : '',
      relId: text(e && e.relId, 80),
      result: text(e && e.result, 200),
      authorId: text(e && e.authorId, 80),
      images: (function () {
        const own = Array.isArray(e && e.images) ? e.images.slice(0, 12).map(u => text(u, 600)).filter(Boolean) : [];
        const tg = Array.isArray(e && e.photoIds)
          ? e.photoIds.slice(0, 3).map(id => text(id, 250)).filter(Boolean)
            .map(id => '/api/tg?magPhoto=' + encodeURIComponent(id))
          : [];
        return own.concat(tg).slice(0, 12);
      })(),
      beforeImg: text(e && e.beforeImg, 600),
      afterImg: text(e && e.afterImg, 600),
      ctaUrl: text(e && e.ctaUrl, 600),
      category: (e && e.category === 'Haber') ? 'Haber' : ((e && e.category === 'Teknik Analiz') ? 'Teknik Analiz' : ''),
      sourceLink: text(e && e.sourceLink, 300),
      publishedAt: text(e && e.publishedAt, 40),
    })) : [];
    const authors = Array.isArray(raw.authors) ? raw.authors.slice(0, 20).map(a => ({
      id: text(a && a.id, 80),
      name: text(a && a.name, 120),
      specialty: text(a && a.specialty, 120),
      photo: text(a && a.photo, 600),
    })) : [];
    return res.status(200).json({ ok: true, updatedAt: rows[0].updated_at || null, data: {
      issueNo: Number.isFinite(raw.issueNo) ? raw.issueNo : 1,
      weekLabel: text(raw.weekLabel, 120),
      coverBg: text(raw.coverBg, 600),
      ctaLabel: text(raw.ctaLabel, 120),
      ctaUrl: text(raw.ctaUrl, 600),
      rosterVer: 2,
      authorsSeeded: true,
      authors,
      entries,
    } });
  } catch (error) {
    return res.status(200).json({ ok: false, data: null, _warn: 'alfanews okunamadı' });
  }
}

async function writeEduShared(rowId, data, key = SUPABASE_KEY) {
  const url = `${SUPABASE_URL}/rest/v1/edu_shared`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...sbHeaders(key), Prefer: 'resolution=merge-duplicates' },
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
              if (vtype === 'foto' && v && v.url) photos.push({ url: String(v.url).trim().slice(0, 500000), caption: '' });
              if (Array.isArray(v && v.photos)) {
                v.photos.slice(0, 10).forEach(p => {
                  const u = String((p && p.url) || '').trim().slice(0, 500000);
                  if (!u) return;
                  if (photos.some(x => x.url === u)) return;
                  photos.push({ url: u, caption: String((p && p.caption) || '').trim().slice(0, 500) });
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
              // içeriğe gömülü ek videolar ({{video:N}} işaretleri bunlara bakar)
              vids: Array.isArray(v && v.vids)
                ? v.vids.slice(0, 30).map(x => {
                    const vu = String((typeof x === 'string' ? x : (x && x.url)) || '').trim().slice(0, 600);
                    return vu ? { url: vu } : null;
                  }).filter(Boolean)
                : [],
            };
          })
        : [],
    })).filter(t => t.id);
  });
  return clean;
}

// Yeni özellik bildirimi: kayıt defterindeki "yeni" satırları Telegram'a gönderir.
// edu_shared içinde hangi id'lerin bildirildiği tutulur; aynı özellik iki kez haber olmaz.
async function siteFeatures(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      features: FEATURES.filter(f => isNew(f)).map(f => ({ id: f.id, label: f.label, since: f.since })),
    });
  }
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const token = (process.env.TG_BOT_TOKEN || '').trim();
  const chat = (process.env.TG_CHAT_ID || '').trim();
  if (!token || !chat) return res.status(200).json({ ok: true, skipped: true, reason: 'telegram_not_configured' });

  let body = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); } catch { /* boş gövde */ }
  const requested = Array.isArray(body && body.features)
    ? body.features.map(x => String(x || '').slice(0, 80))
    : null;

  // Bildirim durumu RLS'e takılmasın; service-role varsa onunla oku/yaz.
  const stateKey = (process.env.SUPABASE_SERVICE_ROLE || SUPABASE_KEY).trim();
  const cur = await readEduShared(ROWS.features.rowId, stateKey);
  if (cur.error) return res.status(200).json({ ok: false, error: cur.error });
  const data = cur.data && typeof cur.data === 'object' ? cur.data : {};
  const announced = Array.isArray(data.announced) ? data.announced.map(x => String(x)) : [];
  const pending = FEATURES.filter(f =>
    isNew(f) && !announced.includes(f.id) && (!requested || requested.includes(f.id))
  );
  if (!pending.length) return res.status(200).json({ ok: true, sent: 0, announced });

  const lines = pending.map(f => '• ' + (f.icon || '✦') + ' ' + f.label + ' — ' + (f.desc || '')).join('\n');
  const text = '🆕 Alfa Traders — yeni özellik\n\n' + lines + '\n\n#yeniözellik';
  const sent = await sendTelegram(text, chat);
  if (sent.http !== 200 || !sent.ok) {
    return res.status(200).json({ ok: false, error: 'telegram_send_failed', status: sent.http });
  }

  const next = {
    announced: announced.concat(pending.map(f => f.id)).slice(-200),
    updatedAt: new Date().toISOString(),
  };
  const saved = await writeEduShared(ROWS.features.rowId, next, stateKey);
  if (!saved.ok) return res.status(200).json({ ok: true, sent: pending.length, warn: saved.error });
  return res.status(200).json({ ok: true, sent: pending.length, announced: next.announced });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.query?.kind === 'feedback') return eduFeedback(req, res);
  if (['influencer-content', 'influencer-progress'].includes(req.query?.kind)) return influencerContent(req, res);
  if (req.query?.kind === 'portfolio') return portfolio(req, res);
  if (req.query?.kind === 'landing') return landing(req, res);
  if (req.query?.kind === 'podcast') return podcast(req, res);
  if (req.query?.kind === 'youtube') return youtubeLatest(req, res);
  if (req.query?.kind === 'news') return alfaNews(req, res);
  if (req.query?.kind === 'site-features') return siteFeatures(req, res);

  const isChannel = String(req.query && req.query.kind) === 'channel';
  const isShort = String(req.query && req.query.kind) === 'short';
  const meta = isShort ? ROWS.short : (isChannel ? ROWS.channel : ROWS.shared);

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
    if (isShort) {
      const code = String(req.query.code || '').trim().slice(0, 40);
      const cur = await load();
      const map = (cur.data && cur.data.links) || {};
      const target = code ? (map[code] || null) : null;
      return res.status(200).json({ ok: true, found: !!target, target });
    }
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

    if (isShort) {
      const tgt = body && body.target;
      if (!tgt || !tgt.ch) return res.status(400).json({ error: 'target.ch gerekli' });
      const cleanT = {
        ch: String(tgt.ch).trim().slice(0, 120),
        sec: tgt.sec ? String(tgt.sec).trim().slice(0, 60) : null,
        t: tgt.t ? String(tgt.t).trim().slice(0, 60) : null,
        v: tgt.v ? String(tgt.v).trim().slice(0, 60) : null,
      };
      if (!cleanT.ch) return res.status(400).json({ error: 'target.ch gerekli' });
      const cur = await load();
      const map = (cur.data && cur.data.links && typeof cur.data.links === 'object') ? cur.data.links : {};
      let code = null;
      Object.keys(map).forEach(k => {
        if (code) return;
        const m = map[k];
        if (m && m.ch === cleanT.ch && (m.sec || null) === cleanT.sec && (m.t || null) === cleanT.t && (m.v || null) === cleanT.v) code = k;
      });
      if (!code) {
        do { code = Math.random().toString(36).slice(2, 8); } while (map[code]);
        map[code] = cleanT;
        const s = await store({ links: map });
        if (!s.ok) return res.status(500).json({ error: s.error });
      }
      return res.status(200).json({ ok: true, code, target: cleanT });
    }

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
