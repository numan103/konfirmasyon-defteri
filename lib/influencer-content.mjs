import { requestUser } from './auth.mjs';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ROW = 'influencer_content_v1';
function key() {
  if (!process.env.SUPABASE_SERVICE_ROLE) throw new Error('storage_unavailable');
  return createHash('sha256').update('alfa-influencer-content-v1:' + process.env.SUPABASE_SERVICE_ROLE).digest();
}
export function sealLibrary(data) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from(ROW));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
  return { enc: 'ic1', iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), payload: encrypted.toString('base64') };
}
export function openLibrary(data) {
  if (data?.enc !== 'ic1') throw new Error('storage_unavailable');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(data.iv, 'base64'));
  decipher.setAAD(Buffer.from(ROW)); decipher.setAuthTag(Buffer.from(data.tag, 'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data.payload, 'base64')), decipher.final()]).toString('utf8'));
}
const base = process.env.SUPABASE_URL || 'https://zvnjslmptwmnuhftgqsr.supabase.co';
const text = (v, max) => typeof v === 'string' ? v.trim().slice(0, max) : '';
export function mediaUrl(value, type) {
  const s = text(value, 500000);
  if (type === 'image' && /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(s)) return s;
  if (type === 'image' && /^\/assets\/[\w./-]+\.(?:png|jpg|jpeg|webp)$/i.test(s) && !s.includes('..')) return s;
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' || u.username || u.password) return '';
    if (type === 'video') {
      const youtube = ['www.youtube.com', 'youtube.com', 'youtu.be', 'www.youtube-nocookie.com'].includes(u.hostname);
      if (!youtube && !/\.mp4$/i.test(u.pathname)) return '';
    }
    return u.href.slice(0, 2000);
  } catch { return ''; }
}
export function cleanLibrary(raw) {
  if (!raw || !Array.isArray(raw.topics) || raw.topics.length > 60) throw new Error('invalid_content');
  const ids = new Set();
  const id = value => {
    if (typeof value !== 'string' || !/^[\w-]{1,80}$/.test(value) || ids.has(value)) throw new Error('invalid_content');
    ids.add(value); return value;
  };
  return { topics: raw.topics.map(t => {
    if (!t || !text(t.title, 200) || !Array.isArray(t.sections) || t.sections.length > 60) throw new Error('invalid_content');
    return {
      id: id(t.id), title: text(t.title, 200), description: text(t.description, 3000),
      published: t.published === true,
      sections: t.sections.map(s => {
        if (!s || !text(s.title, 200) || !Array.isArray(s.blocks) || s.blocks.length > 80) throw new Error('invalid_content');
        return { id: id(s.id), title: text(s.title, 200), blocks: s.blocks.map(b => {
          if (!b || !['text', 'image', 'video'].includes(b.type)) throw new Error('invalid_content');
          const out = { id: id(b.id), type: b.type, caption: text(b.caption, 500) };
          if (b.type === 'text') out.body = text(b.body, 20000);
          else {
            out.url = mediaUrl(b.url, b.type);
            if (!out.url) throw new Error('invalid_media');
          }
          return out;
        }) };
      }),
    };
  }) };
}
async function db(path, method = 'GET', body) {
  const key = process.env.SUPABASE_SERVICE_ROLE;
  if (!key) throw new Error('storage_unavailable');
  const r = await fetch(base + '/rest/v1/' + path, {
    method, headers: { apikey: key, ...(key.startsWith('sb_secret_') ? {} : { Authorization: 'Bearer ' + key }),
      'Content-Type': 'application/json', Prefer: 'return=representation' },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000),
  });
  if (r.status === 409) throw new Error('conflict');
  if (!r.ok) throw new Error('storage_unavailable');
  return r.json();
}
export default async function influencerContent(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  try {
    const user = await requestUser(req);
    if (!user) return res.status(401).json({ ok: false, error: 'login_required' });
    if (req.method === 'POST' && !user.admin) return res.status(403).json({ ok: false, error: 'admin_required' });
    if (!user.admin) {
      const orders = await db('influencer_orders?user_id=eq.' + encodeURIComponent(user.id) + '&status=eq.approved&select=id&limit=1');
      if (!orders.length) return res.status(403).json({ ok: false, error: 'influencer_required' });
    }
    if (req.method === 'GET') {
      const rows = await db('edu_shared?id=eq.' + ROW + '&select=data,updated_at');
      const data = cleanLibrary(rows[0] ? openLibrary(rows[0].data) : { topics: [] });
      if (!user.admin) data.topics = data.topics.filter(t => t.published);
      return res.status(200).json({ ok: true, data, revision: user.admin ? rows[0]?.updated_at || null : undefined });
    }
    let body = req.body;
    if (Buffer.byteLength(typeof body === 'string' ? body : JSON.stringify(body || {})) > 3000000) return res.status(413).json({ ok: false, error: 'content_too_large' });
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { return res.status(400).json({ ok: false, error: 'invalid_content' }); }
    }
    const data = cleanLibrary(body?.data);
    const revision = body?.revision;
    if (revision !== null && (typeof revision !== 'string' || !Number.isFinite(Date.parse(revision)))) throw new Error('invalid_content');
    const stamp = new Date(Math.max(Date.now(), Date.parse(revision) + 1 || 0)).toISOString();
    const path = revision ? 'edu_shared?id=eq.' + ROW + '&updated_at=eq.' + encodeURIComponent(revision) : 'edu_shared';
    const saved = await db(path, revision ? 'PATCH' : 'POST', { ...(revision ? {} : { id: ROW }), data: sealLibrary(data), updated_at: stamp });
    if (!Array.isArray(saved) || saved.length !== 1) throw new Error('conflict');
    return res.status(200).json({ ok: true, data, revision: stamp });
  } catch (e) {
    const code = ['invalid_content', 'invalid_media', 'conflict'].includes(e.message) ? e.message : 'storage_unavailable';
    return res.status(code === 'conflict' ? 409 : code.startsWith('invalid') ? 400 : 503).json({ ok: false, error: code });
  }
}
