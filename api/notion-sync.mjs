const NOTION_VERSION = '2022-06-28';

const DBS = [
  { id: '380f561953ab8088b5f9ffd53a397de9', market: 'Kripto' },
  { id: '380f561953ab80938bdbfc07fcef2de1', market: 'Fx' },
];

const CRYPTO_PAIRS = new Set(['BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'DOT', 'LINK', 'AVAX', 'MATIC', 'ARB', 'OP', 'ATOM', 'LTC', 'BCH', 'DOGE', 'BNB', 'TRX', 'NEAR', 'APT', 'SUI', 'FIL', 'ICP', 'AAVE', 'UNI', 'CRV', 'PENDLE', 'ENA', 'TIA', 'INJ', 'SEI', 'WIF', 'PEPE', 'FLOKI', 'BONK']);

function whichDb(pair) {
  const p = (pair || '').toUpperCase();
  if (CRYPTO_PAIRS.has(p)) return DBS[0];
  if (p.startsWith('X')) return DBS[1];
  if (/^[A-Z]{6}$/.test(p)) return DBS[1];
  if (/^[A-Z]{3,4}$/.test(p)) return DBS[0];
  return DBS[1];
}

function buildProps(trade) {
  const props = {};

  const titleText = [trade.pair, trade.dir].filter(Boolean).join(' ').toUpperCase() || 'İşlem';
  props['Trade #'] = { title: [{ text: { content: titleText } }] };

  if (trade.date) {
    let iso = null;
    const isoM = String(trade.date).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoM) {
      iso = isoM[1] + '-' + isoM[2] + '-' + isoM[3];
    } else {
      const parts = trade.date.split('/');
      if (parts.length === 2) iso = '2026-' + parts[1].padStart(2, '0') + '-' + parts[0].padStart(2, '0');
    }
    if (iso) props['Tarih'] = { date: { start: iso } };
  }

  if (trade.pair) {
    props['Pair'] = { select: { name: trade.pair.toUpperCase() } };
  }

  if (trade.dir) {
    props['Position'] = { select: { name: trade.dir.toUpperCase() } };
  }

  if (trade.r != null && trade.r !== '') {
    props['Profit'] = { number: Number(trade.r) };
  }

  if (trade.strat) {
    props['Trade Stratejisi'] = { select: { name: trade.strat } };
  }

  if (trade.note) {
    props['Not'] = { rich_text: [{ text: { content: trade.note } }] };
  }

  if (trade.stars != null && trade.stars > 0) {
    props['Yıldız'] = { number: Number(trade.stars) };
  }

  return props;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST gerekli' });

  const token = process.env.NOTION_TOKEN;
  if (!token) return res.status(500).json({ error: 'NOTION_TOKEN env var ayarlı değil.' });

  try {
    const trades = Array.isArray(req.body) ? req.body : (req.body?.trades ? req.body.trades : [req.body]);
    const results = [];

    for (const trade of trades) {
      const db = whichDb(trade.pair);
      const props = buildProps(trade);

      let r, method = 'POST', url = 'https://api.notion.com/v1/pages';
      if (trade.notionId) {
        method = 'PATCH';
        url = `https://api.notion.com/v1/pages/${trade.notionId}`;
      }
      const body = method === 'POST' ? { parent: { database_id: db.id }, properties: props } : { properties: props };

      r = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Notion-Version': NOTION_VERSION,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!r.ok) {
        const errText = await r.text();
        results.push({ ok: false, error: `Notion API ${r.status}: ${errText}`, pair: trade.pair });
      } else {
        const page = await r.json();
        results.push({ ok: true, notionId: page.id, pair: trade.pair });
      }
    }

    return res.status(200).json({ results });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
