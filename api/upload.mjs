import { put } from '@vercel/blob';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.BLOB_READ_WRITE_TOKEN) return res.status(503).json({ error: 'BLOB token not set.' });
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  const dataUrl = body && body.data;
  if (!dataUrl) return res.status(400).json({ error: 'data required' });
  const match = /^data:image\/(png|jpe?g|webp|gif);base64,([\s\S]+)$/.exec(dataUrl);
  if (!match) return res.status(400).json({ error: 'invalid image' });
  const ext = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase();
  const buf = Buffer.from(match[2], 'base64');
  if (!buf.length) return res.status(400).json({ error: 'empty image' });
  if (buf.length > 8 * 1024 * 1024) return res.status(413).json({ error: 'too large (max 8MB)' });
  try {
    const path = 'success/' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
    const blob = await put(path, buf, { access: 'public', addRandomSuffix: false });
    return res.status(200).json({ ok: true, url: blob.url });
  } catch (e) {
    return res.status(200).json({ ok: false, error: e.message });
  }
}
