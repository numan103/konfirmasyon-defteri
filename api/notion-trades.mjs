const NOTION_VERSION = '2022-06-28';

let DBS = [
  { id: '380f561953ab8088b5f9ffd53a397de9', market: 'Kripto' },
  { id: '380f561953ab80938bdbfc07fcef2de1', market: 'Fx' },
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

function mapRow(page, market) {
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
    model,
    note: parseRichText(prop(page, 'Not')) || '',
    tradeNo: parseTitle(prop(page, 'Trade #')) || '',
    market,
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
      DBS.map(db => queryDB(token, db.id).then(rows => rows.map(r => mapRow(r, db.market))))
    );
    const trades = results.flat().sort((a, b) => (a.ts || 0) - (b.ts || 0));
    return res.status(200).json({ trades });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
