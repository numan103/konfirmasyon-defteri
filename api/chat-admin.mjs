import { put, list } from '@vercel/blob';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!process.env.BLOB_READ_WRITE_TOKEN) return res.status(503).json({ error: 'BLOB token not set.' });

  if (req.method === 'GET') {
    try {
      const { blobs } = await list({ prefix: 'chat/' });
      const msgs = (await Promise.all(blobs.map(async b => {
        try { const r = await fetch(b.url, { cache: 'no-store' }); return r.ok ? await r.json() : null; } catch { return null; }
      }))).filter(Boolean);
      return res.status(200).json(msgs);
    } catch { return res.status(200).json([]); }
  }

  if (req.method === 'POST') {
    const { sessionId, role, text } = req.body || {};
    if (!sessionId || !role || !text) return res.status(400).json({ error: 'sessionId, role, text required' });
    try {
      const msg = { sessionId, role, text, time: new Date().toISOString() };
      const path = 'chat/' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
      await put(path, JSON.stringify(msg), { access: 'public', addRandomSuffix: false });
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(200).json({ ok: false, error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
