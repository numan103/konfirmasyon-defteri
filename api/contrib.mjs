// Topluluk Katkıları + Çalışma Panosu — Supabase üzerinden paylaşım (edu_shared tablosunun ayrı satırları).
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { requestUser, requestTier } from '../lib/auth.mjs';
import { sendTelegram } from '../lib/telegram.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zvnjslmptwmnuhftgqsr.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE || 'sb_publishable_bReG5UKaWcQkU0Z9GnGiJQ_0T4_Qm9X';
const ROW_CONTRIB = 'contribs';
const ROW_PANO = 'panos';
// Calisma panosu uye basina ayri satirda tutulur: pano_member_<uuid>.
// Boylece bir uyenin kaydi diger uyelerin panosunu ezemez.
const PANO_PREFIX = 'pano_member_';
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

function panoMemberRow(user) {
  const id = String((user && user.id) || '').replace(/[^a-zA-Z0-9_-]/g, '');
  return id ? PANO_PREFIX + id : '';
}

// edu_shared publishable anahtarla okunabildigi icin kisisel pano satiri
// sifreli tutulur. Anahtar yalnizca sunucudaki servis anahtarindan turetilir.
function panoKey() {
  const secret = process.env.PANO_SECRET || process.env.SUPABASE_SERVICE_ROLE || 'alfa-pano-local';
  return createHash('sha256').update('pano:' + secret).digest();
}

function sealPano(board) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', panoKey(), iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(board), 'utf8'), cipher.final()]);
  return { enc: 'p1', iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ct: ct.toString('base64') };
}

function openPano(data) {
  if (!data || typeof data !== 'object' || data.enc !== 'p1') return data;
  try {
    const decipher = createDecipheriv('aes-256-gcm', panoKey(), Buffer.from(data.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(data.tag, 'base64'));
    const out = Buffer.concat([decipher.update(Buffer.from(data.ct, 'base64')), decipher.final()]);
    return JSON.parse(out.toString('utf8'));
  } catch (e) {
    return null;
  }
}

// Pano: yalnizca oturumdaki uyenin kendi satiri okunur/yazilir. Istemcinin
// gonderdigi "room" degeri yok sayilir; baska uyenin panosuna erisilemez.
async function panoStore(req, res, user) {
  const row = panoMemberRow(user);
  if (!row) return res.status(400).json({ error: 'member_required' });

  if (req.method === 'GET') {
    const r = await readShared(row);
    if (r.error && !r.missing) return res.status(500).json({ error: r.error });
    const board = openPano(r.data);
    if (Array.isArray(board)) return res.status(200).json({ ok: true, scope: 'member', data: board });
    // Eski tek-odalı pano yalnızca yöneticiye, ilk açılışta taşıma kolaylığı
    // için gösterilir; üyelerin panolarına karışmaz.
    if (user.admin) {
      const legacy = await readShared(ROW_PANO);
      const map = legacy.data && typeof legacy.data === 'object' && !Array.isArray(legacy.data) ? legacy.data : {};
      if (Array.isArray(map.alfa)) return res.status(200).json({ ok: true, scope: 'member', legacy: true, data: map.alfa });
    }
    return res.status(200).json({ ok: true, scope: 'member', data: null });
  }

  if (req.method === 'POST') {
    let body;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); } catch (e) { return res.status(400).json({ error: 'Invalid JSON body' }); }
    const board = body.data;
    if (board === undefined || board === null) return res.status(400).json({ error: 'data required' });
    if (!Array.isArray(board)) return res.status(400).json({ error: 'data must be an array' });
    const w = await writeShared(row, sealPano(board));
    if (w.ok) return res.status(200).json({ ok: true, via: 'edu_shared', scope: 'member' });
    if (!w.missing) return res.status(500).json({ error: w.error });
    return res.status(500).json({ error: 'Pano depolaması hazır değil.' });
  }

  return res.status(405).json({ error: 'method_not_allowed' });
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
function atRepost(rp) {
  if (!rp || typeof rp !== 'object') return null;
  return {
    id: atClip(rp.id, 40), author: atClip(rp.author, 40), avatar: atClip(rp.avatar, 400000),
    type: rp.type === 'islem' ? 'islem' : 'analiz', coin: atClip(rp.coin, 20).toUpperCase(),
    dir: atClip(rp.dir, 10), status: atClip(rp.status, 10),
    title: atClip(rp.title, 160), text: atClip(rp.text, 320), img: atClip(rp.img, 800000),
  };
}
const atInt = (v, max) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 && n <= max ? n : 0;
};
const atTradeUrl = id => 'https://alfa-trader.com/?page=alfatrading&post=' + encodeURIComponent(String(id));
function atTradeTarget() {
  const chat = String(process.env.TG_TRADE_CHAT_ID || process.env.TG_CHAT_ID || '').trim();
  const raw = process.env.TG_TRADE_THREAD != null ? process.env.TG_TRADE_THREAD : process.env.TG_THREAD;
  const n = raw == null || String(raw).trim() === '' || String(raw).trim() === '0' ? null : Number(String(raw).trim());
  const thread = Number.isSafeInteger(n) && n > 0 ? n : null;
  const disabled = String(process.env.TG_TRADE_NOTIFY || '').trim().toLowerCase() === 'off';
  const token = String(process.env.TG_BOT_TOKEN || '').trim();
  return { chat, thread, ready: !disabled && !!token && !!chat };
}
// Depoda yalnizca uc tip tutulur: islem, onchain (bias) ve analiz (Kanal).
// Onceden onchain de analiz'e dusuruluyordu; bias paylasimlari bu yuzden
// Telegram bildirimi uretmiyordu.
function atPostType(p) {
  if (p && p.type === 'islem') return 'islem';
  if (p && p.type === 'onchain') return 'onchain';
  return 'analiz';
}
function atNotifyKind(post) {
  if (post.type === 'onchain') return 'bias';
  if (post.type === 'analiz') return 'post';
  return 'trade';
}
const AT_NOTIFY_KINDS = ['trade', 'bias', 'post'];
// Uc tur de yayinlandiginda charts konusuna bildirilir. Eski kayitlar geriye
// donuk bildirilmez; yalnizca yeni `add` cagrisi mesaj uretir.
function atNotifyWanted(type) { return type === 'islem' || type === 'onchain' || type === 'analiz'; }
function atNotifyPrefix(kind) { return kind === 'bias' ? 'bias:' : kind === 'post' ? 'post:' : 'trade:'; }
function atSummary(text, max) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 3) + '…' : s;
}
function atTradeText(post) {
  const head = ['📊 Yeni işlem'];
  if (post.coin) head.push(post.coin);
  if (post.dir) head.push(post.dir === 'long' ? 'LONG' : 'SHORT');
  const lines = [head.join(' · ')];
  if (post.title) lines.push('', post.title);
  const summary = atSummary(post.text, 240);
  if (summary) lines.push('', summary);
  // Seviyeler (Entry/TP/SL/Kaldıraç) bilinçli olarak gönderilmez: görsel
  // bulanık önizleme olduğu için metinde de işlem detayı verilmez.
  lines.push('', 'Grafik ve detay: ' + atTradeUrl(post.id));
  return lines.join('\n');
}
function atBiasText(post) {
  const head = ['📡 Yeni bias'];
  if (post.coin) head.push(post.coin);
  if (post.bias === 'long') head.push('LONG');
  else if (post.bias === 'short') head.push('SHORT');
  else if (post.bias === 'notr') head.push('NÖTR');
  const lines = [head.join(' · ')];
  if (post.title) lines.push('', post.title);
  const summary = atSummary(post.text, 240);
  if (summary) lines.push('', summary);
  lines.push('', 'Detay: ' + atTradeUrl(post.id));
  return lines.join('\n');
}
function atPostText(post) {
  const head = ['📢 Yeni analiz'];
  if (post.coin) head.push(post.coin);
  const lines = [head.join(' · ')];
  if (post.title) lines.push('', post.title);
  const summary = atSummary(post.text, 240);
  if (summary) lines.push('', summary);
  lines.push('', 'Detay: ' + atTradeUrl(post.id));
  return lines.join('\n');
}
function atNotifyText(post, kind) {
  if (kind === 'bias') return atBiasText(post);
  if (kind === 'post') return atPostText(post);
  return atTradeText(post);
}
// Islem, bias ve Kanal paylasimi yayinlandiginda public charts hedefine tek
// bildirim. Kural: once "sending" durumu kalici yazilir; ag cagrisindan sonra
// teyit yazilamazsa tekrar gonderilmez (belirsiz teslimde kor retry yok).
async function atNotifyPost(post, save, dryRun, kind = atNotifyKind(post)) {
  const target = atTradeTarget();
  const state = { key: atNotifyPrefix(kind) + post.id, kind, at: Date.now() };
  if (!target.ready) {
    post.tradeNotify = { ...state, phase: 'disabled', reason: target.chat ? 'telegram_disabled' : 'telegram_not_configured' };
    await save();
    return post.tradeNotify;
  }
  const text = atNotifyText(post, kind);
  if (dryRun) {
    post.tradeNotify = { ...state, phase: 'dry_run', preview: text };
    await save();
    return post.tradeNotify;
  }
  post.tradeNotify = { ...state, phase: 'sending' };
  await save();
  let out;
  try {
    // Link onizlemesi acik: Telegram gonderi baglantisindan bulanik karti
    // (og:image) cikarir; boylece paylasim kanalda dogrudan gorunur.
    out = await sendTelegram(text, target.chat, target.thread, null, { preview: true });
  } catch (e) {
    post.tradeNotify = { ...state, phase: 'unknown', error: 'telegram_network' };
    await save();
    return post.tradeNotify;
  }
  if (out && out.ok && out.result && out.result.message_id) {
    post.tradeNotify = { ...state, phase: 'sent', messageId: out.result.message_id };
  } else {
    post.tradeNotify = { ...state, phase: 'failed', http: out && out.http, error: atClip((out && (out.description || out.error)) || 'telegram_rejected', 160) };
  }
  await save();
  return post.tradeNotify;
}
async function alfaTradingImage(req, res, pid) {
  const r = await readShared(AT_ROW);
  const posts = (r.data && Array.isArray(r.data.posts)) ? r.data.posts : [];
  const post = posts.find(p => p.id === String(pid));
  const m = post && /^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/i.exec(String(post.imgBlur || ''));
  if (!m) {
    res.status(302);
    res.setHeader('Location', '/og.png');
    res.setHeader('Cache-Control', 'public, max-age=60');
    return res.end();
  }
  const mime = /^image\/jpg$/i.test(m[1]) ? 'image/jpeg' : m[1].toLowerCase();
  const buf = Buffer.from(m[2].replace(/\s+/g, ''), 'base64');
  if (!buf.length || buf.length > 400000) {
    res.status(302);
    res.setHeader('Location', '/og.png');
    res.setHeader('Cache-Control', 'public, max-age=60');
    return res.end();
  }
  res.status(200);
  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Length', String(buf.length));
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.end(buf);
}
async function alfaTrading(req, res, user) {
  const r = await readShared(AT_ROW);
  const posts = (r.data && Array.isArray(r.data.posts)) ? r.data.posts : [];
  const save = () => writeShared(AT_ROW, { posts });
  const find = id => posts.find(p => p.id === id);
  if (req.method === 'GET') return res.status(200).json({ posts });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); } catch (e) { return res.status(400).json({ error: 'bad json' }); }
  const action = body.action;

  // Yazma yetkisi: yonetici post yonetir; begeni/yorum icin giris yeterli.
  const adminActions = ['add', 'edit', 'delPost', 'delComment', 'delTg', 'notify', 'status', 'profileUpdate'];
  if (adminActions.indexOf(action) >= 0) {
    if (!user || !user.admin) return res.status(403).json({ error: 'forbidden' });
  } else if (action === 'like' || action === 'comment') {
    if (!user) return res.status(401).json({ error: 'unauthorized' });
  }

  if (action === 'add') {
    const p = body.post || {};
    const clientId = atClip(body.clientId || p.clientId, 80);
    if (clientId) {
      const seen = posts.find(x => x.clientId === clientId);
      if (seen) return res.status(200).json({ ok: true, post: seen, duplicate: true, notify: seen.tradeNotify || null });
    }
    const id = atUid();
    const type = atPostType(p);
    const kind = atNotifyKind({ type });
    const post = {
      id, clientId, type,
      author: atClip(p.author, 40) || 'Admin', authorEmail: atClip(p.authorEmail, 120), avatar: atClip(p.avatar, 400000), isAdmin: true,
      quote: atQuote(p.quote), repost: atRepost(p.repost),
      coin: atClip(p.coin, 20).toUpperCase(), bias: ['long', 'short', 'notr'].includes(p.bias) ? p.bias : '',
      dir: ['long', 'short'].includes(p.dir) ? p.dir : '',
      entry: atClip(p.entry, 40), tp: atClip(p.tp, 40), sl: atClip(p.sl, 40),
      lev: atClip(p.lev, 20), risk: atClip(p.risk, 20), status: 'aktif',
      title: atClip(p.title, 160), text: atClip(p.text, 4000), img: atClip(p.img, 800000),
      imgBlur: atClip(p.imgBlur, 600000), imgBlurW: atInt(p.imgBlurW, 4000), imgBlurH: atInt(p.imgBlurH, 4000),
      ts: Date.now(), likes: [], comments: [],
      tradeNotify: atNotifyWanted(type) ? { key: atNotifyPrefix(kind) + id, kind, phase: 'pending', at: Date.now() } : null,
    };
    posts.unshift(post); if (posts.length > 300) posts.length = 300;
    const w = await save();
    if (!w.ok) return res.status(500).json({ error: w.error || 'store_error' });
    const notify = atNotifyWanted(type) ? await atNotifyPost(post, save, body.dryRun === true) : null;
    return res.status(200).json({ ok: true, post, notify });
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
  if (action === 'edit') {
    const post = find(body.postId); if (!post) return res.status(404).json({ error: 'post yok' });
    const p = body.post || {};
    const patch = {
      type: atPostType(p),
      coin: atClip(p.coin, 20).toUpperCase(), bias: ['long', 'short', 'notr'].includes(p.bias) ? p.bias : '',
      dir: ['long', 'short'].includes(p.dir) ? p.dir : '',
      entry: atClip(p.entry, 40), tp: atClip(p.tp, 40), sl: atClip(p.sl, 40),
      lev: atClip(p.lev, 20), risk: atClip(p.risk, 20),
      title: atClip(p.title, 160), text: atClip(p.text, 4000), img: atClip(p.img, 800000),
      quote: atQuote(p.quote), repost: atRepost(p.repost),
      edited: true, editedTs: Date.now(),
    };
    // Eski istemciler imgBlur gondermezse mevcut bulanik onizleme korunur.
    if (p.imgBlur !== undefined) {
      patch.imgBlur = atClip(p.imgBlur, 600000);
      patch.imgBlurW = atInt(p.imgBlurW, 4000);
      patch.imgBlurH = atInt(p.imgBlurH, 4000);
    }
    Object.assign(post, patch);
    await save(); return res.status(200).json({ ok: true, post });
  }
  if (action === 'notify') {
    // Var olan bir gonderi icin bildirimi (yeniden) calistirir. Yalnizca admin.
    // Teslim edilmis/belirsiz kayitta kor tekrar yok; force gerekir.
    const post = find(body.postId);
    if (!post) return res.status(404).json({ error: 'post yok' });
    if (body.markOnchain === true && post.type !== 'islem') post.type = 'onchain';
    const kind = AT_NOTIFY_KINDS.includes(body.kind) ? body.kind : atNotifyKind(post);
    const prev = post.tradeNotify || null;
    const delivered = prev && (prev.phase === 'sent' || prev.phase === 'sending' || prev.phase === 'unknown');
    if (delivered && body.force !== true) {
      return res.status(409).json({ error: 'already_notified', notify: prev });
    }
    const notify = await atNotifyPost(post, save, body.dryRun === true, kind);
    return res.status(200).json({ ok: true, post, notify });
  }
  if (action === 'delPost') { const i = posts.findIndex(p => p.id === body.postId); if (i >= 0) posts.splice(i, 1); await save(); return res.status(200).json({ ok: true }); }
  if (action === 'delTg') {
    // Yanlis gonderilmis bildirimi geri almak icin yonetici eylemi.
    const mid = Math.round(Number(body.messageId));
    const chat = String(process.env.TG_CHAT_ID || '').trim();
    const token = String(process.env.TG_BOT_TOKEN || '').trim();
    if (!Number.isSafeInteger(mid) || mid <= 0 || !chat || !token) {
      return res.status(400).json({ error: 'telegram_not_configured' });
    }
    try {
      const tg = await fetch('https://api.telegram.org/bot' + token + '/deleteMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chat, message_id: mid }),
        signal: AbortSignal.timeout(8000),
      });
      let out = {};
      try { out = await tg.json(); } catch { /* teyit yoksa basarili sayma */ }
      if (!tg.ok || !out || !out.ok) {
        return res.status(502).json({ error: 'telegram_delete_failed', http: tg.status, description: atClip(out && out.description, 160) });
      }
      return res.status(200).json({ ok: true, deleted: mid });
    } catch (e) {
      return res.status(502).json({ error: 'telegram_delete_failed' });
    }
  }
  if (action === 'delComment') { const post = find(body.postId); if (post && Array.isArray(post.comments)) post.comments = post.comments.filter(c => c.id !== body.commentId); await save(); return res.status(200).json({ ok: true }); }
  if (action === 'status') { const post = find(body.postId); if (post) post.status = ['aktif', 'tp', 'sl', 'iptal'].includes(body.status) ? body.status : post.status; await save(); return res.status(200).json({ ok: true }); }
  if (action === 'profileUpdate') {
    const email = atClip(body.email, 120), name = atClip(body.name, 40), avatar = atClip(body.avatar, 400000);
    if (!email) return res.status(400).json({ error: 'email gerekli' });
    posts.forEach(p => { if (p.authorEmail && p.authorEmail === email) { if (name) p.author = name; p.avatar = avatar; } });
    await save(); return res.status(200).json({ ok: true });
  }
  return res.status(400).json({ error: 'bilinmeyen action' });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET' && req.query.store === 'alfatrading' && req.query.image) return alfaTradingImage(req, res, req.query.image);
  if (req.query.store === 'alfatrading') return alfaTrading(req, res, await requestUser(req));

  const store = req.query.store === 'pano' ? 'pano' : 'contrib';
  const rowId = ROW_CONTRIB;

  // Calisma Panosu (pano) referans uyelerine ait: yazma ve okuma icin
  // dogrulanmis uyelik istiyoruz. Her uye yalnizca kendi panosunu gorur.
  if (store === 'pano') {
    const u = await requestUser(req);
    if (!u) return res.status(401).json({ error: 'unauthorized' });
    const tier = await requestTier(u);
    if (tier !== 'ref' && tier !== 'admin') return res.status(403).json({ error: 'referral_required' });
    return panoStore(req, res, u);
  }

  if (req.method === 'GET') {
    const r = await readShared(rowId);
    if (r.data) return res.status(200).json(r.data);
    if (!r.error && !r.missing) return res.status(200).json([]);
    const j = await readJournal();
    const jdata = Array.isArray(j.data) ? j.data : [];
    return res.status(200).json(jdata);
  }

  if (req.method === 'POST') {
    let body;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); } catch (e) { return res.status(400).json({ error: 'Invalid JSON body' }); }

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
