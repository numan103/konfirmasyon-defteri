import { put, list, del } from '@vercel/blob';
import { requestUser } from '../lib/auth.mjs';

// Canli destek mesajlari.
//
// GET    -> yonetici tum oturumlari gorur; kullanici YALNIZCA kendi
//            oturumunu (?sid=...) gorur. Anonim istek 401.
// POST   -> giris zorunlu. role='admin' yalnizca yonetici tarafindan
//            gonderilebilir; role='user' her giris yapmis kullanici.
// DELETE -> yalnizca yonetici (oturum silme).
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!process.env.BLOB_READ_WRITE_TOKEN) return res.status(503).json({ error: 'BLOB token not set.' });

  const user = await requestUser(req);
  if (!user) return res.status(401).json({ error: 'unauthorized' });

  if (req.method === 'GET') {
    try {
      // Yonetici olmayan kullanici oturum kimligini vermek zorunda.
      const sid = String((req.query && req.query.sid) || '').trim();
      if (!user.admin && !sid) return res.status(400).json({ error: 'sid required' });

      const { blobs } = await list({ prefix: 'chat/' });
      const all = (await Promise.all(blobs.map(async b => {
        try { const r = await fetch(b.url, { cache: 'no-store' }); return r.ok ? await r.json() : null; } catch { return null; }
      }))).filter(Boolean);

      // Onbellek paylasimli oldugu icin sizinti olmasin: filtre sunucuda.
      const msgs = user.admin ? all : all.filter(m => m && m.sessionId === sid);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json(msgs);
    } catch {
      return res.status(200).json([]);
    }
  }

  if (req.method === 'POST') {
    let body;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); }
    catch (e) { return res.status(400).json({ error: 'bad json' }); }
    const { sessionId, role, text } = body;
    if (!sessionId || !role || !text) return res.status(400).json({ error: 'sessionId, role, text required' });
    if (String(role) !== 'user' && !user.admin) return res.status(403).json({ error: 'forbidden' });
    if (String(text).length > 4000) return res.status(400).json({ error: 'too long' });
    try {
      const msg = { sessionId, role, text, uid: user.id, time: new Date().toISOString() };
      const path = 'chat/' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
      await put(path, JSON.stringify(msg), { access: 'public', addRandomSuffix: false });
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(200).json({ ok: false, error: e.message });
    }
  }

  if (req.method === 'DELETE') {
    if (!user.admin) return res.status(403).json({ error: 'forbidden' });
    let body;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); }
    catch (e) { return res.status(400).json({ error: 'bad json' }); }
    const { sessionId } = body;
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
    try {
      const { blobs } = await list({ prefix: 'chat/' });
      const toDelete = [];
      for (const b of blobs) {
        try { const r = await fetch(b.url, { cache: 'no-store' }); if (r.ok) { const data = await r.json(); if (data.sessionId === sessionId) toDelete.push(b.url); } } catch {}
      }
      await Promise.all(toDelete.map(url => del(url)));
      return res.status(200).json({ deleted: toDelete.length });
    } catch (e) {
      return res.status(200).json({ ok: false, error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
