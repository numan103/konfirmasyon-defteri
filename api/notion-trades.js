const NOTION_VERSION = '2022-06-28';

const DBS = [
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
  return {
    notionId: page.id,
    ts: date ? new Date(date).getTime() : page.created_time ? new Date(page.created_time).getTime() : null,
    date: date || null,
    pair: parseSelect(prop(page, 'Pair')) || '',
    dir: parseSelect(prop(page, 'Position')) || 'LONG',
    r: parseNumber(prop(page, 'Risk (R)')),
    pnl: parseNumber(prop(page, 'Profit')),
    strat: parseSelect(prop(page, 'Trade Stratejisi')) || '',
    note: parseRichText(prop(page, 'Not')) || '',
    tradeNo: parseTitle(prop(page, 'Trade #')) || '',
    market,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const token = process.env.NOTION_TOKEN;
  if (!token) return res.status(500).json({ error: 'NOTION_TOKEN env var ayarlı değil.' });
  try {
    const results = await Promise.all(
      DBS.map(db => queryDB(token, db.id).then(rows => rows.map(r => mapRow(r, db.market))))
    );
    const trades = results.flat().sort((a, b) => (a.ts || 0) - (b.ts || 0));
    return res.status(200).json({ trades });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
