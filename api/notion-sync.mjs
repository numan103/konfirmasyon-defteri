const NOTION_VERSION = '2022-06-28';
const FILE_UPLOAD_VERSION = '2026-03-11';

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

let dbSchemas = {};

async function getModelProp(dbId, token) {
  if (dbSchemas[dbId] !== undefined) return dbSchemas[dbId];
  dbSchemas[dbId] = null;
  try {
    const res = await fetch(`https://api.notion.com/v1/databases/${dbId}`, {
      headers: { Authorization: `Bearer ${token}`, 'Notion-Version': NOTION_VERSION },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const props = data.properties || {};
    const hit = Object.keys(props).find(n => /entry.{0,4}model|^model$|model.{0,4}entry/i.test(n));
    if (hit) dbSchemas[dbId] = { name: hit, type: props[hit].type };
  } catch (e) {}
  return dbSchemas[dbId];
}

function buildProps(trade, modelProp) {
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

  if (trade.model && modelProp) {
    const val = String(trade.model).slice(0, 100);
    const key = modelProp.name;
    if (modelProp.type === 'select') props[key] = { select: { name: val } };
    else if (modelProp.type === 'multi_select') props[key] = { multi_select: [{ name: val }] };
    else props[key] = { rich_text: [{ text: { content: val } }] };
  }

  if (trade.note) {
    props['Not'] = { rich_text: [{ text: { content: trade.note } }] };
  }

  if (trade.stars != null && trade.stars > 0) {
    props['Yıldız'] = { number: Number(trade.stars) };
  }

  return props;
}

// Görsel içeriğinden kararlı bir hash üretir (aynı görsel her zaman aynı hash -> tekrar yükleme yok)
function imgHashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function imageKey(src) {
  return /^https?:\/\//i.test(src) ? 'url:' + src : 'data:' + src;
}

// Notion file_uploads akışı: kalıcı (bloğa bağlanınca expiry_time null olur)
async function notionUploadFile(buf, mime, token, filename) {
  const create = await fetch('https://api.notion.com/v1/file_uploads', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': FILE_UPLOAD_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  if (!create.ok) throw new Error('file_uploads create ' + create.status + ': ' + (await create.text()).slice(0, 200));
  const created = await create.json();
  const uploadUrl = created.upload_url;
  if (!uploadUrl) throw new Error('file_uploads: upload_url yok');
  const form = new FormData();
  form.append('file', new Blob([buf], { type: mime }), filename);
  const send = await fetch(uploadUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Notion-Version': FILE_UPLOAD_VERSION },
    body: form,
  });
  if (!send.ok) throw new Error('file_uploads send ' + send.status + ': ' + (await send.text()).slice(0, 200));
  return created.id;
}

async function uploadTradeImages(images, synced, token) {
  const items = [];
  const errors = [];
  const syncedSet = new Set(Array.isArray(synced) ? synced : []);
  for (const src of images || []) {
    if (!src) continue;
    const hash = imgHashStr(imageKey(src));
    if (/^https?:\/\//i.test(src)) {
      items.push({ hash, kind: 'external', url: src, skip: syncedSet.has(hash) });
      continue;
    }
    const m = String(src).match(/^data:([^;]+);base64,(.+)$/s);
    if (!m) continue;
    if (syncedSet.has(hash)) { items.push({ hash, kind: 'skip', skip: true }); continue; }
    const mime = m[1];
    const b64 = m[2];
    try {
      const buf = Buffer.from(b64, 'base64');
      const ext = (mime.split('/')[1] || 'png').replace(/[^a-z0-9]/gi, '') || 'png';
      const id = await notionUploadFile(buf, mime, token, 'trade-' + hash + '.' + ext);
      items.push({ hash, kind: 'file_upload', id, skip: false });
    } catch (e) {
      errors.push(hash + ': ' + String((e && e.message) || e));
    }
  }
  return { items, errors };
}

function imageBlock(item) {
  if (item.kind === 'external') return { object: 'block', type: 'image', image: { type: 'external', external: { url: item.url } } };
  if (item.kind === 'file_upload') return { object: 'block', type: 'image', image: { type: 'file_upload', file_upload: { id: item.id } } };
  return null;
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
      const modelProp = await getModelProp(db.id, token);
      const props = buildProps(trade, modelProp);
      const up = await uploadTradeImages(trade.images, trade.syncedImages, token);
      const children = up.items.map(imageBlock).filter(Boolean);

      let r, method = 'POST', url = 'https://api.notion.com/v1/pages';
      if (trade.notionId) {
        method = 'PATCH';
        url = `https://api.notion.com/v1/pages/${trade.notionId}`;
      }
      const body = method === 'POST'
        ? { parent: { database_id: db.id }, properties: props, children }
        : { properties: props };

      r = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Notion-Version': NOTION_VERSION,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const syncedImages = up.items.map(i => i.hash);

      if (!r.ok) {
        const errText = await r.text();
        results.push({ ok: false, error: `Notion API ${r.status}: ${errText}`, pair: trade.pair, uploadErrors: up.errors });
      } else {
        const page = await r.json();
        results.push({ ok: true, notionId: page.id, pair: trade.pair, images: up.items.filter(i => i.kind === 'external').map(i => i.url), syncedImages, uploadErrors: up.errors });
        if (method === 'PATCH' && up.items.length) {
          try {
            const listRes = await fetch(`https://api.notion.com/v1/blocks/${page.id}/children?page_size=100`, {
              headers: { Authorization: `Bearer ${token}`, 'Notion-Version': NOTION_VERSION },
            });
            const listData = await listRes.json();
            const existing = new Set((listData.results || []).map(b => {
              if (!b || b.type !== 'image' || !b.image) return '';
              if (b.image.type === 'file_upload') return b.image.file_upload?.id || '';
              return b.image.external?.url || b.image.file?.url || '';
            }).filter(Boolean));
            const toAdd = up.items
              .filter(i => !i.skip && !existing.has(i.id || i.url || ''))
              .map(imageBlock)
              .filter(Boolean);
            if (toAdd.length) {
              await fetch(`https://api.notion.com/v1/blocks/${page.id}/children`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' },
                body: JSON.stringify({ children: toAdd }),
              });
            }
          } catch (e) { /* children senkronu opsiyonel */ }
        }
      }
    }

    return res.status(200).json({ results });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
