// Alfa Trading — topluluk işlem/analiz akışı (Supabase edu_shared tek satır JSON).
// Model: edu_shared[id='alfa_trading'].data = { posts: [ {..} ] }
// Not: Güvenlik uygulamanın mevcut modeliyle aynı — yazma publishable key ile açıktır,
// paylaşım/silme yetkisi arayüzde admin e-postasıyla sınırlanır (contrib.mjs ile aynı yaklaşım).
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zvnjslmptwmnuhftgqsr.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE || 'sb_publishable_3esU1e0mIeUaSrmqPxsEfQ_Lcv11GLa';
const ROW = 'alfa_trading';

const sbHeaders = () => ({
  apikey: SUPABASE_KEY,
  Authorization: 'Bearer ' + SUPABASE_KEY,
  'Content-Type': 'application/json',
});

async function readRow() {
  const url = `${SUPABASE_URL}/rest/v1/edu_shared?id=eq.${ROW}&select=data`;
  const res = await fetch(url, { headers: sbHeaders(), cache: 'no-store' });
  if (!res.ok) return { posts: [] };
  const rows = await res.json();
  const data = rows && rows[0] && rows[0].data;
  return data && Array.isArray(data.posts) ? data : { posts: [] };
}

async function writeRow(data) {
  const url = `${SUPABASE_URL}/rest/v1/edu_shared`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...sbHeaders(), Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ id: ROW, data }),
  });
  return res.ok;
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clip = (s, n) => String(s == null ? '' : s).slice(0, n);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const data = await readRow();
      return res.status(200).json({ posts: data.posts });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const action = body.action;
      const data = await readRow();
      const posts = data.posts;
      const findPost = id => posts.find(p => p.id === id);

      if (action === 'add') {
        const p = body.post || {};
        const post = {
          id: uid(),
          type: p.type === 'islem' ? 'islem' : 'analiz',
          author: clip(p.author, 40) || 'Admin',
          authorEmail: clip(p.authorEmail, 120),
          isAdmin: true,
          coin: clip(p.coin, 20).toUpperCase(),
          bias: ['long', 'short', 'notr'].includes(p.bias) ? p.bias : '',
          dir: ['long', 'short'].includes(p.dir) ? p.dir : '',
          entry: clip(p.entry, 40), tp: clip(p.tp, 40), sl: clip(p.sl, 40),
          lev: clip(p.lev, 20), risk: clip(p.risk, 20),
          status: 'aktif',
          title: clip(p.title, 160),
          text: clip(p.text, 4000),
          img: clip(p.img, 400),
          ts: Date.now(),
          likes: [], comments: [],
        };
        posts.unshift(post);
        if (posts.length > 300) posts.length = 300;
        await writeRow({ posts });
        return res.status(200).json({ ok: true, post });
      }

      if (action === 'like') {
        const post = findPost(body.postId);
        if (!post) return res.status(404).json({ error: 'post yok' });
        const nick = clip(body.nick, 40);
        if (!nick) return res.status(400).json({ error: 'nick gerekli' });
        post.likes = post.likes || [];
        const i = post.likes.indexOf(nick);
        if (i >= 0) post.likes.splice(i, 1); else post.likes.push(nick);
        await writeRow({ posts });
        return res.status(200).json({ ok: true, likes: post.likes.length, liked: i < 0 });
      }

      if (action === 'comment') {
        const post = findPost(body.postId);
        if (!post) return res.status(404).json({ error: 'post yok' });
        const nick = clip(body.nick, 40), text = clip(body.text, 800);
        if (!nick || !text) return res.status(400).json({ error: 'nick+text gerekli' });
        post.comments = post.comments || [];
        post.comments.push({ id: uid(), nick, text, ts: Date.now(), isAdmin: !!body.isAdmin });
        await writeRow({ posts });
        return res.status(200).json({ ok: true });
      }

      if (action === 'delPost') {
        const i = posts.findIndex(p => p.id === body.postId);
        if (i >= 0) posts.splice(i, 1);
        await writeRow({ posts });
        return res.status(200).json({ ok: true });
      }

      if (action === 'delComment') {
        const post = findPost(body.postId);
        if (post && Array.isArray(post.comments)) post.comments = post.comments.filter(c => c.id !== body.commentId);
        await writeRow({ posts });
        return res.status(200).json({ ok: true });
      }

      if (action === 'status') {
        const post = findPost(body.postId);
        if (post) post.status = ['aktif', 'tp', 'sl', 'iptal'].includes(body.status) ? body.status : post.status;
        await writeRow({ posts });
        return res.status(200).json({ ok: true });
      }

      return res.status(400).json({ error: 'bilinmeyen action' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(200).json({ ok: false, error: e.message });
  }
}
