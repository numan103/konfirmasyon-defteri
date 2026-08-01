const NOTION_VERSION = '2022-06-28';

async function notion(url, opts, token) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (e) { json = null; }
  if (!res.ok) {
    const err = json?.message || json?.error || `HTTP ${res.status}`;
    throw new Error(err);
  }
  return json;
}

async function findTitleProp(dbId, token) {
  const db = await notion(`https://api.notion.com/v1/databases/${dbId}`, { method: 'GET' }, token);
  const props = db.properties || {};
  const hit = Object.keys(props).find(k => props[k].type === 'title');
  return hit || 'Name';
}

function weekFromTitle(title) {
  const m = String(title || '').match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  return null;
}

function buildBlocks(payload) {
  const blocks = [];
  const rr = payload.rr || {};
  const kr = (rr.kripto != null ? rr.kripto : 0);
  const fr = (rr.fx != null ? rr.fx : 0);
  const tot = (isFinite(kr) ? kr : 0) + (isFinite(fr) ? fr : 0);
  blocks.push({ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: `RR: Kripto ${kr}R · FX ${fr}R · Toplam ${tot}R` } }] } });

  (Array.isArray(payload.metrics) ? payload.metrics : []).forEach(m => {
    if (!m || !m.title) return;
    blocks.push({ object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ type: 'text', text: { content: `${m.title} — ${m.val != null ? m.val : 0}%` } }] } });
  });

  (Array.isArray(payload.sections) ? payload.sections : []).forEach(sec => {
    if (!sec || !sec.title) return;
    blocks.push({ object: 'block', type: 'heading_2', heading_2: { rich_text: [{ type: 'text', text: { content: sec.title } }] } });
    const text = (sec.text || '').trim();
    if (text) {
      blocks.push({ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: text.slice(0, 1900) } }] } });
    }
  });
  return blocks;
}

async function replaceChildren(pageId, blocks, token) {
  const existing = await notion(`https://api.notion.com/v1/blocks/${pageId}/children`, { method: 'GET' }, token);
  const list = existing.results || [];
  for (const b of list) {
    try { await notion(`https://api.notion.com/v1/blocks/${b.id}`, { method: 'PATCH', body: JSON.stringify({ archived: true }) }, token); } catch (e) { /* atla */ }
  }
  if (blocks.length) {
    await notion(`https://api.notion.com/v1/blocks/${pageId}/children`, { method: 'PATCH', body: JSON.stringify({ children: blocks }) }, token);
  }
}

async function pushWeek(body, token) {
  const dbId = body.dbId;
  const week = String(body.week || '').slice(0, 10);
  if (!dbId || !/^\d{4}-\d{2}-\d{2}$/.test(week)) throw new Error('dbId ve geçerli bir hafta (YYYY-MM-DD) gerekli');
  const titleProp = await findTitleProp(dbId, token);
  const title = `Hafta ${week}`;
  const blocks = buildBlocks(body);

  const query = await notion(`https://api.notion.com/v1/databases/${dbId}/query`, {
    method: 'POST',
    body: JSON.stringify({ filter: { property: titleProp, title: { equals: title } }, page_size: 5 }),
  }, token);
  const found = (query.results || []).find(p => (p.properties[titleProp]?.title?.[0]?.plain_text || '') === title);

  if (found) {
    await replaceChildren(found.id, blocks, token);
    return { ok: true, notionId: found.id, created: false };
  }
  const page = await notion('https://api.notion.com/v1/pages', {
    method: 'POST',
    body: JSON.stringify({
      parent: { database_id: dbId },
      properties: { [titleProp]: { title: [{ text: { content: title } }] } },
      children: blocks,
    }),
  }, token);
  return { ok: true, notionId: page.id, created: true };
}

function parseBlocks(blocks) {
  const rr = { kripto: null, fx: null };
  const bars = {};
  const sections = [];
  let curTitle = null;
  (blocks || []).forEach(b => {
    const type = b.type;
    const content = b[type];
    const rich = (content && (content.rich_text || content.text)) || [];
    const text = rich.map(r => (r.plain_text != null ? r.plain_text : r.text?.content)).join('');
    if (type === 'paragraph') {
      const rm = text.match(/Kripto\s+([-+0-9.,]+)\s*R/i);
      if (rm) rr.kripto = Number(rm[1].replace(',', '.'));
      const fm = text.match(/FX\s+([-+0-9.,]+)\s*R/i);
      if (fm) rr.fx = Number(fm[1].replace(',', '.'));
      if (curTitle) { sections.push({ title: curTitle, text: (sections.find(s => s.title === curTitle)?.text || '') + '\n' + text }); curTitle = null; }
    } else if (type === 'bulleted_list_item') {
      const m = text.match(/^(.*?)\s*—\s*(\d+)%$/);
      if (m) bars[m[1].trim()] = Number(m[2]);
    } else if (type === 'heading_2' || type === 'heading_1' || type === 'heading_3') {
      curTitle = text.trim();
      if (!sections.some(s => s.title === curTitle)) sections.push({ title: curTitle, text: '' });
    }
  });
  return { rr, bars, sections };
}

async function pullWeeks(dbId, token) {
  const all = [];
  let cursor = null;
  do {
    const q = await notion(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: 'POST',
      body: JSON.stringify(cursor ? { start_cursor: cursor, page_size: 100 } : { page_size: 100 }),
    }, token);
    all.push(...(q.results || []));
    cursor = q.has_more ? q.next_cursor : null;
  } while (cursor);

  const out = {};
  for (const page of all) {
    try {
      const props = page.properties || {};
      const titleProp = Object.keys(props).find(k => props[k].type === 'title') || 'Name';
      const title = props[titleProp]?.title?.[0]?.plain_text || '';
      const wk = weekFromTitle(title);
      const childData = await notion(`https://api.notion.com/v1/blocks/${page.id}/children`, { method: 'GET' }, token);
      const parsed = parseBlocks(childData.results || []);
      if (!wk) continue;
      out[wk] = out[wk] || { rr: { kripto: null, fx: null }, bars: {}, sections: {} };
      if (parsed.rr.kripto != null) out[wk].rr.kripto = parsed.rr.kripto;
      if (parsed.rr.fx != null) out[wk].rr.fx = parsed.rr.fx;
      Object.keys(parsed.bars).forEach(k => { out[wk].bars[k] = parsed.bars[k]; });
      parsed.sections.forEach(s => { out[wk].sections[s.title] = s.text; });
    } catch (e) { /* sayfa atlandı */ }
  }
  return out;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST gerekli' });

  const token = process.env.NOTION_TOKEN;
  if (!token) return res.status(500).json({ error: 'NOTION_TOKEN env var ayarlı değil.' });

  const body = req.body || {};
  const dbId = body.dbId || process.env.NOTION_WEEK_DB || '';
  try {
    if (body.action === 'push') {
      const r = await pushWeek({ ...body, dbId }, token);
      return res.json(r);
    }
    if (body.action === 'pull') {
      if (!dbId) throw new Error('Haftalık DB ID gerekli (Ayarlar → Notion Database Ayarları)');
      const weeks = await pullWeeks(dbId, token);
      return res.json({ ok: true, weeks });
    }
    return res.status(400).json({ error: 'action: push | pull' });
  } catch (e) {
    return res.status(200).json({ ok: false, error: e.message });
  }
}
