import { put, list } from '@vercel/blob';

const BLOB_PATH = 'chat-v4';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({ error: 'BLOB token not set.' });
  }

  async function getUrl() {
    try {
      const { blobs } = await list();
      const b = blobs.find(x => x.pathname === BLOB_PATH);
      return b ? b.url : null;
    } catch { return null; }
  }

  if (req.method === 'GET') {
    try {
      const url = await getUrl();
      if (!url) return res.status(200).json([]);
      const r = await fetch(url + '?t=' + Date.now());
      if (!r.ok) return res.status(200).json([]);
      return res.status(200).json(await r.json());
    } catch { return res.status(200).json([]); }
  }

  if (req.method === 'POST') {
    const { sessionId, role, text } = req.body || {};
    if (!sessionId || !role || !text) {
      return res.status(400).json({ error: 'sessionId, role, text required' });
    }
    try {
      let msgs = [];
      const url = await getUrl();
      if (url) {
        try { const r = await fetch(url + '?t=' + Date.now()); if (r.ok) msgs = await r.json(); } catch {}
      }
      msgs.push({ sessionId, role, text, time: new Date().toISOString() });
      const result = await put(BLOB_PATH, JSON.stringify(msgs), { access: 'public', addRandomSuffix: false, allowOverwrite: true });
      return res.status(200).json({ ok: true, count: msgs.length, url: result.url.substring(0, 60) });
    } catch (e) {
      return res.status(200).json({ ok: false, error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
