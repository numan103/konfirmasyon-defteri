import { put, list } from '@vercel/blob';

const BLOB_PATH = 'edu-shared-v1.json';

async function readBlob() {
  try {
    const { blobs } = await list();
    const blob = blobs.find(b => b.pathname === BLOB_PATH);
    if (!blob) return null;
    const res = await fetch(blob.url);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
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
    const data = await readBlob();
    return res.status(200).json(data || { sections: {}, sel: {}, selVid: {} });
  }

  // POST: full replace — body tüm veriyi içerir
  if (req.method === 'POST') {
    const body = req.body;
    if (!body || !body.sections) {
      return res.status(400).json({ error: 'Missing sections in body' });
    }
    await writeBlob(body);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
