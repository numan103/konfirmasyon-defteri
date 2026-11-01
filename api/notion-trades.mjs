import { requestUser, requestTier } from '../lib/auth.mjs';
import { handleWeek } from '../lib/notion-week.mjs';

const NOTION_VERSION = '2022-06-28';

let DBS = [
  { id: '3d5f561953ab80cfa99cf95749ad82a2', market: 'Kripto' },
  { id: '3d2f561953ab805e8703d571dbb858e9', market: 'Kripto' },
  { id: '3b4f561953ab80c49b58d4c4cd60b6c9', market: 'Kripto' },
  { id: '3e2f561953ab80508627f53a094a2d01', market: 'Kripto' },
];

async function queryDB(token, dbId) {
  const rows = [];
  let cursor;
  do {
    const body = cursor ? { start_cursor: cursor } : {};
    const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Notion API ${res.status}: ${await res.text()}`);
    const data = await res.json();
    rows.push(...data.results);
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
  return rows;
}

function prop(page, name) { return page.properties?.[name]; }
function parseDate(p) { return p?.date?.start || null; }
function parseSelect(p) { return p?.select?.name || null; }
function parseMultiSelect(p) { return (p?.multi_select || []).map(o => o.name).join(', '); }
function parseNumber(p) { return p?.number ?? null; }
function parseTitle(p) { return (p?.title || []).map(t => t.plain_text).join('') || null; }
function parseRichText(p) { return (p?.rich_text || []).map(t => t.plain_text).join('') || null; }

// Sayfa altındaki görsel blokları topla (image blokları: external URL veya kalıcı file URL)
async function pageImages(token, pageId) {
  const urls = [];
  try {
    let cursor;
    do {
      const qs = new URLSearchParams({ page_size: '100' });
      if (cursor) qs.set('start_cursor', cursor);
      const res = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children?${qs}`, {
        headers: { Authorization: `Bearer ${token}`, 'Notion-Version': NOTION_VERSION },
      });
      if (!res.ok) break;
      const data = await res.json();
      for (const b of data.results || []) {
        if (!b || b.type !== 'image' || !b.image) continue;
        const img = b.image;
        let src = null, external = false;
        if (img.type === 'external' && img.external?.url) { src = img.external.url; external = true; }
        else if (img.file?.url) src = img.file.url;
        if (!src) continue;
        urls.push(external ? src : await toDurable(src));
      }
      cursor = data.has_more ? data.next_cursor : null;
    } while (cursor);
  } catch (e) { /* görsel hatası göz ardı edilir */ }
  return urls;
}

// Notion file gorunum URL'leri 1 saatte suresi dolar; kalici olmasi icin sunucuda indirip data URL'e ceviriyoruz.
// external URL'ler zaten kalici, onlara dokunmuyoruz.
async function toDurable(src) {
  if (String(src).indexOf('data:') === 0) return src;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 12000);
    const res = await fetch(src, { redirect: 'follow', signal: ctl.signal });
    clearTimeout(t);
    if (!res.ok) return src;
    const buf = await res.arrayBuffer();
    const mime = (res.headers.get('content-type') || 'image/jpeg').split(';')[0];
    return 'data:' + mime + ';base64,' + Buffer.from(buf).toString('base64');
  } catch (e) { return src; }
}

async function mapRow(page, market, token) {
  const date = parseDate(prop(page, 'Tarih'));
  let model = '';
  for (const n of ['Entry Model', 'Model', 'Entry Modeli', 'Model Adı']) {
    const p = prop(page, n);
    if (p) { model = parseSelect(p) || parseMultiSelect(p) || parseRichText(p) || ''; if (model) break; }
  }
  return {
    notionId: page.id,
    ts: date ? new Date(date).getTime() : page.created_time ? new Date(page.created_time).getTime() : null,
    date: date || null,
    pair: parseSelect(prop(page, 'Pair')) || '',
    dir: parseSelect(prop(page, 'Position')) || 'LONG',
    r: parseNumber(prop(page, 'Profit')),
    pnl: null,
    strat: parseSelect(prop(page, 'Trade Stratejisi')) || '',
    kKalite: parseSelect(prop(page, 'Karar Kalitesi')) || '',
    model,
    note: parseRichText(prop(page, 'Not')) || '',
    tradeNo: parseTitle(prop(page, 'Trade #')) || '',
    market,
    images: await pageImages(token, page.id),
  };
}

async function dbSchema(token, dbId) {
  const res = await fetch(`https://api.notion.com/v1/databases/${dbId}`, {
    headers: { Authorization: `Bearer ${token}`, 'Notion-Version': NOTION_VERSION },
  });
  if (!res.ok) return null;
  return res.json();
}

function propOptions(props, names) {
  for (const n of names) {
    const p = props?.[n];
    if (!p) continue;
    if (p.type === 'select') return (p.select?.options || []).map(o => o.name).filter(Boolean);
    if (p.type === 'multi_select') return (p.multi_select?.options || []).map(o => o.name).filter(Boolean);
  }
  return null;
}

async function collectOptions(token, dbs) {
  const stratSet = new Set();
  const modelSet = new Set();
  for (const db of dbs) {
    const schema = await dbSchema(token, db.id);
    if (!schema) continue;
    const props = schema.properties || {};
    (propOptions(props, ['Trade Stratejisi', 'Strateji']) || []).forEach(s => stratSet.add(s));
    const modelHit = Object.keys(props).find(n => /entry.{0,4}model|^model$|model.{0,4}entry/i.test(n));
    if (modelHit) {
      const opts = propOptions(props, [modelHit]);
      if (opts) opts.forEach(m => modelSet.add(m));
    }
  }
  return { strategies: [...stratSet], models: [...modelSet] };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Weekly review sync was split into its own endpoint; it now lives here so the
  // project stays within the Hobby plan's serverless function limit.
  const body = req.method === 'POST' ? (req.body || {}) : {};
  if (req.query.mode === 'week' || body.action === 'push' || body.action === 'pull') {
    return handleWeek(req, res);
  }

  // Notion defteri site sahibine ait: anonim okuma kapali.
  const user = await requestUser(req);
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  const tier = await requestTier(user);
  if (tier !== 'ref' && tier !== 'admin') return res.status(403).json({ error: 'referral_required' });

  res.setHeader('Cache-Control', 'no-store');
  if (req.query.mode === 'schema') {
    if (tier !== 'admin') return res.status(403).json({ error: 'admin_required' });
    const token = process.env.NOTION_TOKEN;
    if (!token) return res.status(500).json({ error: 'NOTION_TOKEN env var ayarlı değil.' });
    const dbId = (req.query.dbId || '').replace(/-/g, '');
    if (!/^[0-9a-f]{32}$/i.test(dbId)) return res.status(400).json({ error: 'bad_db_id' });
    try {
      const r = await fetch('https://api.notion.com/v1/databases/' + dbId, {
        headers: { Authorization: 'Bearer ' + token, 'Notion-Version': '2022-06-28' }
      });
      if (!r.ok) {
        const text = await r.text();
        return res.status(502).json({ error: 'notion_' + r.status, detail: text.slice(0, 500) });
      }
      const data = await r.json();
      const props = {};
      for (const [k, v] of Object.entries(data.properties || {})) {
        props[k] = v.type;
      }
      return res.status(200).json({ id: dbId, title: (data.title || []).map(t => t.plain_text).join(''), properties: props });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }
  if (req.query.mode === 'search') {
    if (tier !== 'admin') return res.status(403).json({ error: 'admin_required' });
    const token = process.env.NOTION_TOKEN;
    if (!token) return res.status(500).json({ error: 'NOTION_TOKEN env var ayarlı değil.' });
    const NOTION_VERSION = '2022-06-28';
    try {
      const r = await fetch('https://api.notion.com/v1/search', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' },
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
  const token = req.query.token || process.env.NOTION_TOKEN;
  if (!token) return res.status(500).json({ error: 'NOTION_TOKEN env var ayarlı değil veya token gönderilmedi.' });
  // Kullanıcıya özel database ID'leri
  if (req.query.dbs) {
    try {
      const custom = JSON.parse(req.query.dbs);
      const dbs = [];
      if (custom.kripto) dbs.push({ id: custom.kripto, market: 'Kripto' });
      if (custom.fx) dbs.push({ id: custom.fx, market: 'Fx' });
      if (dbs.length) DBS = dbs;
    } catch (e) { /* geçersiz dbs parametresi, varsayılan kullanılır */ }
  }
  try {
    if (req.query.mode === 'options') {
      const options = await collectOptions(token, DBS);
      return res.status(200).json(options);
    }
      const results = await Promise.all(
        DBS.map(db => queryDB(token, db.id).then(rows => Promise.all(rows.map(r => mapRow(r, db.market, token)))))
      );
    const trades = results.flat().sort((a, b) => (a.ts || 0) - (b.ts || 0));
    return res.status(200).json({ trades });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
