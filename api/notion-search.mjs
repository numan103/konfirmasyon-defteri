import { requestUser, requestTier } from '../lib/auth.mjs';

// Admin-only helper: list the databases the deployment's Notion integration can see.
// Used to recover the correct database IDs when the saved defaults go stale.
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await requestUser(req);
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  const tier = await requestTier(user);
  if (tier !== 'admin') return res.status(403).json({ error: 'admin_required' });

  const token = process.env.NOTION_TOKEN;
  if (!token) return res.status(500).json({ error: 'NOTION_TOKEN env var ayarlı değil.' });

  const NOTION_VERSION = '2022-06-28';
  try {
    const r = await fetch('https://api.notion.com/v1/search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ filter: { value: 'database', property: 'object' }, page_size: 100 }),
    });
    if (!r.ok) {
      const text = await r.text();
      return res.status(502).json({ error: 'notion_' + r.status, detail: text.slice(0, 500) });
    }
    const data = await r.json();
    const databases = (data.results || []).map((db) => ({
      id: String(db.id || '').replace(/-/g, ''),
      title: (db.title || []).map((t) => t.plain_text).join('') || '(başlıksız)',
      url: db.url || null,
    }));
    return res.status(200).json({ databases });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
