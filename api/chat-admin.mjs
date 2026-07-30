import { put, list, head } from '@vercel/blob';

const BLOB_PATH = 'chat-v2.json';
let _blobUrl = null;

async function getBlobUrl() {
  if (_blobUrl) return _blobUrl;
  try {
    const { blobs } = await list();
    const b = blobs.find(x => x.pathname === BLOB_PATH);
    if (b) { _blobUrl = b.url; return b.url; }
  } catch {}
  return null;
}

async function readMsgs() {
  const url = await getBlobUrl();
  if (!url) return [];
  try {
    const r = await fetch(url);
    if (!r.ok) return [];
    return await r.json();
  } catch { return []; }
}

async function writeMsgs(arr) {
  const result = await put(BLOB_PATH, JSON.stringify(arr), { access: 'public', addRandomSuffix: false });
  _blobUrl = result.url;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({ error: 'BLOB token not set.' });
  }

  if (req.method === 'GET') {
    const msgs = await readMsgs();
    return res.status(200).json(msgs);
  }

  if (req.method === 'POST') {
    const { sessionId, role, text } = req.body || {};
    if (!sessionId || !role || !text) {
      return res.status(400).json({ error: 'sessionId, role, text required' });
    }
    const msgs = await readMsgs();
    msgs.push({ sessionId, role, text, time: new Date().toISOString() });
    await writeMsgs(msgs);
    return res.status(200).json({ ok: true, count: msgs.length });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
