import { put, list } from '@vercel/blob';

const BLOB_PATH = 'chat-messages-v1.json';

async function readBlob() {
  try {
    const { blobs } = await list();
    const blob = blobs.find(b => b.pathname === BLOB_PATH);
    if (!blob) return [];
    const res = await fetch(blob.url);
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
}

async function writeBlob(data) {
  try {
    await put(BLOB_PATH, JSON.stringify(data), { access: 'public', addRandomSuffix: false });
    return true;
  } catch { return false; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({ error: 'BLOB_READ_WRITE_TOKEN not set.' });
  }

  if (req.method === 'GET') {
    const msgs = await readBlob();
    return res.status(200).json(msgs);
  }

  if (req.method === 'POST') {
    const { sessionId, role, text } = req.body || {};
    if (!sessionId || !role || !text) {
      return res.status(400).json({ error: 'sessionId, role, text required' });
    }
    const msgs = await readBlob();
    msgs.push({ sessionId, role, text, time: new Date().toISOString() });
    await writeBlob(msgs);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
