// Topluluk Katkıları + Çalışma Panosu — Supabase üzerinden paylaşım (edu_shared tablosunun ayrı satırları).
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zvnjslmptwmnuhftgqsr.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE || 'sb_publishable_3esU1e0mIeUaSrmqPxsEfQ_Lcv11GLa';
const ROW_CONTRIB = 'contribs';
const ROW_PANO = 'panos';
const JOURNAL_UID = '00000000-0000-0000-0000-00000000e001';

const sbHeaders = (key) => ({
  apikey: key,
  Authorization: 'Bearer ' + key,
  'Content-Type': 'application/json',
});

async function readShared(rowId) {
  const url = `${SUPABASE_URL}/rest/v1/edu_shared?id=eq.${rowId}&select=data`;
  const res = await fetch(url, { headers: sbHeaders(SUPABASE_KEY) });
  if (res.status === 404) return { missing: true };
  if (!res.ok) return { error: `Supabase read ${res.status}: ${(await res.text()).slice(0, 160)}` };
  const rows = await res.json();
  return { data: (rows && rows[0] && rows[0].data) || null };
}

async function writeShared(rowId, data) {
  const url = `${SUPABASE_URL}/rest/v1/edu_shared`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...sbHeaders(SUPABASE_KEY), Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ id: rowId, data }),
  });
  if (res.status === 404) return { missing: true };
  if (!res.ok) return { error: `Supabase write ${res.status}: ${(await res.text()).slice(0, 160)}` };
  return { ok: true };
}

async function readJournal(select) {
  const key = process.env.SUPABASE_SERVICE_ROLE;
  if (!key) return { missing: true };
  const url = `${SUPABASE_URL}/rest/v1/journals?user_id=eq.${JOURNAL_UID}&select=data`;
  const res = await fetch(url, { headers: sbHeaders(key) });
  if (!res.ok) return { error: `Journal read ${res.status}` };
  const rows = await res.json();
  return { data: (rows && rows[0] && rows[0].data) || null };
}

async function writeJournal(data, extra) {
  const key = process.env.SUPABASE_SERVICE_ROLE;
  if (!key) return { missing: true };
  const url = `${SUPABASE_URL}/rest/v1/journals`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...sbHeaders(key), Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ user_id: JOURNAL_UID, data, updated_at: new Date().toISOString(), ...extra }),
  });
  if (!res.ok) return { error: `Journal write ${res.status}: ${(await res.text()).slice(0, 160)}` };
  return { ok: true };
}

function cleanRoom(r) {
  return String(r || 'alfa').replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'alfa';
}

// ---- Alfa Trading (topluluk işlem/analiz akışı) — aynı edu_shared altyapısı ----
const AT_ROW = 'alfa_trading';
const atUid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const atClip = (s, n) => String(s == null ? '' : s).slice(0, n);
function atQuote(q) {
  if (!q || typeof q !== 'object') return null;
  if (q.kind === 'bias') return { kind: 'bias', dir: atClip(q.dir, 12), pair: atClip(q.pair, 20).toUpperCase(), note: atClip(q.note, 500) };
  if (q.kind === 'result') return { kind: 'result', pair: atClip(q.pair, 20).toUpperCase(), dir: atClip(q.dir, 10), r: atClip(q.r, 20), verdict: atClip(q.verdict, 10), date: atClip(q.date, 20), strat: atClip(q.strat, 60) };
  return null;
}
async function alfaTrading(req, res) {
  const r = await readShared(AT_ROW);
  const posts = (r.data && Array.isArray(r.data.posts)) ? r.data.posts : [];
  const save = () => writeShared(AT_ROW, { posts });
  const find = id => posts.find(p => p.id === id);
  if (req.method === 'GET') return res.status(200).json({ posts });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); } catch (e) { return res.status(400).json({ error: 'bad json' }); }
  const action = body.action;
  if (action === 'add') {
    const p = body.post || {};
    const post = {
      id: atUid(), type: p.type === 'islem' ? 'islem' : 'analiz',
      author: atClip(p.author, 40) || 'Admin', authorEmail: atClip(p.authorEmail, 120), avatar: atClip(p.avatar, 400), isAdmin: true,
      quote: atQuote(p.quote),
      coin: atClip(p.coin, 20).toUpperCase(), bias: ['long', 'short', 'notr'].includes(p.bias) ? p.bias : '',
      dir: ['long', 'short'].includes(p.dir) ? p.dir : '',
      entry: atClip(p.entry, 40), tp: atClip(p.tp, 40), sl: atClip(p.sl, 40),
      lev: atClip(p.lev, 20), risk: atClip(p.risk, 20), status: 'aktif',
      title: atClip(p.title, 160), text: atClip(p.text, 4000), img: atClip(p.img, 400),
      ts: Date.now(), likes: [], comments: [],
    };
    posts.unshift(post); if (posts.length > 300) posts.length = 300;
    await save(); return res.status(200).json({ ok: true, post });
  }
  if (action === 'like') {
    const post = find(body.postId); if (!post) return res.status(404).json({ error: 'post yok' });
    const nick = atClip(body.nick, 40); if (!nick) return res.status(400).json({ error: 'nick gerekli' });
    post.likes = post.likes || []; const i = post.likes.indexOf(nick);
    if (i >= 0) post.likes.splice(i, 1); else post.likes.push(nick);
    await save(); return res.status(200).json({ ok: true, likes: post.likes.length, liked: i < 0 });
  }
  if (action === 'comment') {
    const post = find(body.postId); if (!post) return res.status(404).json({ error: 'post yok' });
    const nick = atClip(body.nick, 40), text = atClip(body.text, 800);
    if (!nick || !text) return res.status(400).json({ error: 'nick+text gerekli' });
    post.comments = post.comments || []; post.comments.push({ id: atUid(), nick, text, ts: Date.now(), isAdmin: !!body.isAdmin, avatar: atClip(body.avatar, 400) });
    await save(); return res.status(200).json({ ok: true });
  }
  if (action === 'delPost') { const i = posts.findIndex(p => p.id === body.postId); if (i >= 0) posts.splice(i, 1); await save(); return res.status(200).json({ ok: true }); }
  if (action === 'delComment') { const post = find(body.postId); if (post && Array.isArray(post.comments)) post.comments = post.comments.filter(c => c.id !== body.commentId); await save(); return res.status(200).json({ ok: true }); }
  if (action === 'status') { const post = find(body.postId); if (post) post.status = ['aktif', 'tp', 'sl', 'iptal'].includes(body.status) ? body.status : post.status; await save(); return res.status(200).json({ ok: true }); }
  return res.status(400).json({ error: 'bilinmeyen action' });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.query.store === 'alfatrading') return alfaTrading(req, res);

  const store = req.query.store === 'pano' ? 'pano' : 'contrib';
  const rowId = store === 'pano' ? ROW_PANO : ROW_CONTRIB;
  const room = cleanRoom(req.query.room);

  if (req.method === 'GET') {
    const r = await readShared(rowId);
    if (store === 'pano') {
      const map = r.data && typeof r.data === 'object' && !Array.isArray(r.data) ? r.data : {};
      if (map[room]) return res.status(200).json({ ok: true, room, data: map[room] });
      if (r.error && !r.missing) return res.status(500).json({ error: r.error });
      const j = await readJournal();
      const jmap = j.data && typeof j.data === 'object' && !Array.isArray(j.data) ? j.data : {};
      if (jmap[room]) return res.status(200).json({ ok: true, room, data: jmap[room] });
      return res.status(200).json({ ok: true, room, data: null });
    }
    if (r.data) return res.status(200).json(r.data);
    if (!r.error && !r.missing) return res.status(200).json([]);
    const j = await readJournal();
    const jdata = Array.isArray(j.data) ? j.data : [];
    return res.status(200).json(jdata);
  }

  if (req.method === 'POST') {
    let body;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); } catch (e) { return res.status(400).json({ error: 'Invalid JSON body' }); }

    if (store === 'pano') {
      const board = body.data;
      if (board === undefined || board === null) return res.status(400).json({ error: 'data required' });
      const cur = await readShared(rowId);
      if (cur.error && !cur.missing) return res.status(500).json({ error: cur.error });
      const map = cur.data && typeof cur.data === 'object' && !Array.isArray(cur.data) ? cur.data : {};
      map[room] = board;
      const w = await writeShared(rowId, map);
      if (w.ok) return res.status(200).json({ ok: true, via: 'edu_shared', room });
      if (!w.missing) return res.status(500).json({ error: w.error });
      const jr = await readJournal();
      const jmap = jr.data && typeof jr.data === 'object' && !Array.isArray(jr.data) ? jr.data : {};
      jmap[room] = board;
      const jw = await writeJournal(jmap);
      if (jw.ok) return res.status(200).json({ ok: true, via: 'journals', room });
      if (!jw.missing) return res.status(500).json({ error: jw.error });
      return res.status(500).json({ error: 'Pano depolaması hazır değil.' });
    }

    const { title, url, author } = body || {};
    if (!url) return res.status(400).json({ error: 'url required' });

    const item = {
      id: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
      title: String(title || '').slice(0, 140),
      url: String(url).slice(0, 300),
      author: String(author || '').slice(0, 60),
      time: new Date().toISOString(),
    };

    const cur = await readShared(rowId);
    if (cur.error && !cur.missing) return res.status(500).json({ error: cur.error });
    const list = Array.isArray(cur.data) ? cur.data : [];
    list.push(item);
    if (list.length > 200) list.splice(0, list.length - 200);

    const w = await writeShared(rowId, list);
    if (w.ok) return res.status(200).json({ ok: true, via: 'edu_shared', item });
    if (!w.missing) return res.status(500).json({ error: w.error });

    const jr = await readJournal();
    const jdata = Array.isArray(jr.data) ? jr.data : [];
    jdata.push(item);
    if (jdata.length > 200) jdata.splice(0, jdata.length - 200);
    const jw = await writeJournal(jdata);
    if (jw.ok) return res.status(200).json({ ok: true, via: 'journals', item });
    if (!jw.missing) return res.status(500).json({ error: jw.error });

    return res.status(500).json({ error: 'Paylaşım depolaması hazır değil.' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
