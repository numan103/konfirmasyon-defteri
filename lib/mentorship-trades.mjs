import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { requestUser } from './auth.mjs';
import { parseMentorResults, hasPairPrefix, classifyMentorPost, mentorCategory, mentorCoin, completedMentorResults, mentorResultSummary } from '../assets/mentor-feed-model.mjs';
export { parseMentorResults } from '../assets/mentor-feed-model.mjs';

export const MENTOR_SOURCE = Object.freeze({ username: 'alfakasim', thread: 6, author: 'traderahmetd' });
const PREFIX = 'mentortrade_';
const ID_RE = /^(?:(?:mentortrade|mentormeta)_[a-f0-9]{64}|mentor_results_public)$/;
const PUBLIC_ROW = 'mentor_results_public';
const BASE = process.env.SUPABASE_URL || 'https://zvnjslmptwmnuhftgqsr.supabase.co';
const clip = (s, max = 4000) => String(s || '').slice(0, max);
function headers(extra = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE;
  if (!key) throw new Error('storage_not_configured');
  return { apikey: key, ...(key.startsWith('sb_secret_') ? {} : { Authorization: 'Bearer ' + key }), 'Content-Type': 'application/json', ...extra };
}
function key() {
  const secret = process.env.MENTOR_TRADES_SECRET || process.env.SUPABASE_SERVICE_ROLE;
  if (!secret) throw new Error('storage_not_configured');
  return createHash('sha256').update('mentor-trades-v1:' + secret).digest();
}
export function sealTrade(id, data) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from(id));
  const ct = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
  return { enc: 'mt1', iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ct: ct.toString('base64') };
}
export function openTrade(id, data) {
  if (!ID_RE.test(id) || data?.enc !== 'mt1') throw new Error('invalid_private_record');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(data.iv, 'base64'));
  decipher.setAAD(Buffer.from(id));
  decipher.setAuthTag(Buffer.from(data.tag, 'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data.ct, 'base64')), decipher.final()]).toString('utf8'));
}
export function isMentorMessage(msg) {
  if (!msg || !Number.isSafeInteger(msg.message_id) || msg.message_id <= 0) return false;
  if (String(msg.chat?.username || '').toLowerCase() !== MENTOR_SOURCE.username ||
      !['supergroup', 'group'].includes(msg.chat?.type) || Number(msg.message_thread_id) !== MENTOR_SOURCE.thread) return false;
  // Never trust display names, anonymous group admins, forwarded messages or members.
  if (msg.sender_chat || msg.forward_origin || msg.forward_from || msg.forward_from_chat || msg.forward_date || msg.from?.is_bot) return false;
  const configuredId = process.env.TG_MENTOR_TRADE_AUTHOR_ID;
  return configuredId ? String(msg.from?.id) === String(configuredId) :
    String(msg.from?.username || '').toLowerCase() === MENTOR_SOURCE.author;
}
export function tradeId(chat, root, coin) {
  return PREFIX + createHash('sha256').update([chat, MENTOR_SOURCE.thread, root, coin].join(':')).digest('hex');
}
function photoId(msg) {
  const photos = Array.isArray(msg?.photo) ? msg.photo : [];
  return clip(photos.filter(p => p.file_id && (!p.file_size || p.file_size <= 2000000)).at(-1)?.file_id, 250);
}
function tradeVisual(msg) {
  const own = photoId(msg);
  if (own) return own;
  const reply = msg?.reply_to_message;
  const validReply = reply && reply.message_id !== MENTOR_SOURCE.thread && isMentorMessage({
    ...reply, chat: reply.chat || msg.chat, message_thread_id: reply.message_thread_id ?? msg.message_thread_id,
  });
  return validReply ? photoId(reply) : '';
}
export function resultRecords(msg) {
  if (!isMentorMessage(msg)) return [];
  const text = msg.text || msg.caption || '', results = parseMentorResults(text);
  const reply = msg.reply_to_message;
  const validReply = reply && reply.message_id !== MENTOR_SOURCE.thread && isMentorMessage({
    ...reply, chat: reply.chat || msg.chat, message_thread_id: reply.message_thread_id ?? msg.message_thread_id,
  });
  // Yalnızca parite ile başlayan resimli paylaşımlar işlem/sonuç olur. Düz sohbet
  // ve başlıksız metinler mentor akışına girmez.
  if (!hasPairPrefix(text)) return [];
  const visual = tradeVisual(msg);
  if (!visual) return [];
  return results.map(({ coin, r }) => {
    const rootId = validReply ? reply.message_id : msg.message_id;
    // A multi-coin summary does not prove that one chart belongs to every coin.
    const rootText = clip(validReply ? reply.text || reply.caption : '');
    const rootCoins = results.filter(item => new RegExp('(?:^|[^A-Z0-9])' + item.coin + '(?:[^A-Z0-9]|$)', 'i').test(rootText));
    const matched = !!validReply && (results.length === 1 || (rootCoins.length === 1 && rootCoins[0].coin === coin));
    const image = matched ? photoId(reply) || (results.length === 1 ? photoId(msg) : '') : results.length === 1 ? photoId(msg) : '';
    return {
      id: tradeId('alfakasim', rootId, coin), coin, r, category: 'result', source: 'mentorship',
      rootId, messageId: msg.message_id, chatId: String(msg.chat.id), threadId: MENTOR_SOURCE.thread,
      text: clip(text), rootText: matched ? rootText : '', photoId: photoId(msg) || image || visual,
      originalPhotoId: matched ? photoId(reply) : '',
      needsReview: !matched, date: Number(msg.date) || 0, version: Number(msg.edit_date || msg.date) || 0,
      link: 'https://t.me/alfakasim/6/' + msg.message_id,
      rootLink: matched ? 'https://t.me/alfakasim/6/' + rootId : '',
      authorId: String(msg.from.id),
    };
  });
}
export function postRecords(msg) {
  if (!isMentorMessage(msg)) return [];
  const text = clip(msg.text || msg.caption);
  const visual = tradeVisual(msg);
  if (/^\//.test(text) || !visual || !hasPairPrefix(text)) return [];
  if (parseMentorResults(text).length) return resultRecords(msg);
  // Conflicting result lines are not converted into an active trade or result.
  if (text.split(/\r?\n/).some(line => parseMentorResults(line).length)) return [];
  return [{ id: tradeId('alfakasim', msg.message_id, 'POST'), category: classifyMentorPost(text),
    coin: mentorCoin(text), r: null, source: 'mentorship', rootId: msg.message_id, messageId: msg.message_id,
    text, rootText: '', photoId: visual, originalPhotoId: '', needsReview: false,
    date: Number(msg.date) || 0, version: Number(msg.edit_date || msg.date) || 0,
    link: 'https://t.me/alfakasim/6/' + msg.message_id, rootLink: '', authorId: String(msg.from.id), threadId: 6 }];
}
async function read(id) {
  const r = await fetch(BASE + '/rest/v1/edu_shared?id=eq.' + id + '&select=id,data,updated_at', { headers: headers(), signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('storage_unavailable');
  const rows = await r.json();
  if (!Array.isArray(rows)) throw new Error('storage_unavailable');
  return rows[0] ? { record: openTrade(id, rows[0].data), revision: rows[0].updated_at } : null;
}
async function writeRecord(record, rowId = record.id) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const previous = await read(rowId), old = previous?.record;
    if (old && (old.version > record.version || (old.version === record.version && old.messageId > record.messageId))) return { outcome: 'stale', record: old };
    if (old?.images?.length && !record.images && !record.photoId && old.rootId === record.rootId) record = { ...record, images: old.images };
    if (old && old.version === record.version && old.messageId === record.messageId && old.r === record.r && old.text === record.text && !!old.retracted === !!record.retracted) return { outcome: 'duplicate', record: old };
    // A later reply to the result itself is not silently linked to another chart.
    const stamp = new Date(Math.max(Date.now(), Date.parse(previous?.revision || '') + 1 || 0)).toISOString();
    const r = await fetch(BASE + '/rest/v1/edu_shared' + (previous ? '?id=eq.' + rowId + '&updated_at=eq.' + encodeURIComponent(previous.revision) : ''), {
      method: previous ? 'PATCH' : 'POST', headers: headers({ Prefer: 'return=representation' }),
      body: JSON.stringify({ ...(previous ? {} : { id: rowId }), data: sealTrade(rowId, record), updated_at: stamp }),
      signal: AbortSignal.timeout(8000),
    });
    if (r.status === 409) continue;
    if (!r.ok) throw new Error('storage_unavailable');
    const changed = await r.json();
    if (Array.isArray(changed) && changed.length === 1) return { outcome: 'saved', record };
  }
  throw new Error('conflict');
}
export function mentorMetadata(record) {
  const { photoId, originalPhotoId, images, authorId, chatId, ...meta } = record;
  return { ...meta, category: mentorCategory(record), hasImage: !!photoId || !!images?.length,
    imageCount: images?.length || (photoId ? 1 : 0) + (originalPhotoId && originalPhotoId !== photoId ? 1 : 0) };
}
export async function saveMentorResult(record) {
  const result = await writeRecord(record);
  await writeRecord(mentorMetadata(result.record), record.id.replace('mentortrade_', 'mentormeta_'));
  return result.outcome;
}
async function sharedRow(id) {
  const r = await fetch(BASE + '/rest/v1/edu_shared?id=eq.' + id + '&select=id,data,updated_at', { headers: headers(), signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error('storage_unavailable');
  const rows = await r.json(); if (!Array.isArray(rows)) throw new Error('storage_unavailable');
  return rows[0] || null;
}
async function scanMetadata() {
  const r = await fetch(BASE + '/rest/v1/edu_shared?id=like.mentormeta_*&select=id,data&limit=1001', { headers: headers(), signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error('storage_unavailable');
  const rows = await r.json();
  if (!Array.isArray(rows) || rows.length >= 1000) throw new Error('record_limit_requires_pagination');
  return rows.map(row => openTrade(row.id, row.data));
}
async function ensureMetadata() {
  if ((await sharedRow('mentor_metadata_ready'))?.data?.version === 1) return;
  const r = await fetch(BASE + '/rest/v1/edu_shared?id=like.mentortrade_*&select=id,data&limit=1001', { headers: headers(), signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error('storage_unavailable');
  const rows = await r.json();
  if (!Array.isArray(rows) || rows.length >= 1000) throw new Error('migration_incomplete');
  for (const row of rows) await writeRecord(mentorMetadata(openTrade(row.id, row.data)), row.id.replace('mentortrade_', 'mentormeta_'));
  const saved = await fetch(BASE + '/rest/v1/edu_shared?on_conflict=id', { method: 'POST', headers: headers({ Prefer: 'resolution=merge-duplicates' }),
    body: JSON.stringify({ id: 'mentor_metadata_ready', data: { version: 1 }, updated_at: new Date().toISOString() }), signal: AbortSignal.timeout(8000) });
  if (!saved.ok) throw new Error('migration_incomplete');
}
export async function publishMentorResults() {
  await ensureMetadata();
  for (let attempt = 0; attempt < 3; attempt++) {
    // Read projection revision BEFORE metadata so a concurrent newer projection
    // cannot be overwritten by a stale snapshot.
    const previous = await sharedRow(PUBLIC_ROW);
    const results = completedMentorResults(await scanMetadata());
    const r = await fetch(BASE + '/rest/v1/edu_shared' + (previous ? '?id=eq.' + PUBLIC_ROW + '&updated_at=eq.' + encodeURIComponent(previous.updated_at) : ''), {
      method: previous ? 'PATCH' : 'POST', headers: headers({ Prefer: 'return=representation' }),
      body: JSON.stringify({ ...(previous ? {} : { id: PUBLIC_ROW }), data: sealTrade(PUBLIC_ROW, { version: 1, results }),
        updated_at: new Date(Math.max(Date.now(), Date.parse(previous?.updated_at || '') + 1 || 0)).toISOString() }),
      signal: AbortSignal.timeout(10000),
    });
    if (r.status === 409) continue;
    if (!r.ok) throw new Error('projection_unavailable');
    const rows = await r.json(); if (Array.isArray(rows) && rows.length === 1) return results;
  }
  throw new Error('projection_conflict');
}
async function publicResults() {
  const row = await sharedRow(PUBLIC_ROW);
  if (!row) return publishMentorResults();
  const projection = openTrade(PUBLIC_ROW, row.data);
  if (!Array.isArray(projection?.results)) throw new Error('projection_unavailable');
  // Whitelist again even if the underlying row is corrupt.
  return completedMentorResults(projection.results);
}
export async function ingestMentorUpdate(update) {
  const msg = update?.message || update?.edited_message;
  if (!isMentorMessage(msg)) return { handled: false };
  const records = postRecords(msg);
  if (!records.length && !update.edited_message) return { handled: false };
  // Never allow an unauthenticated webhook to inject a result.
  if (!process.env.TELEGRAM_WEBHOOK_SECRET) throw new Error('webhook_secret_required');
  if (update.edited_message) {
    // A removed/changed result must not leave its old published R behind. This
    // bounded scan only runs on edits in this one author/topic, before upserts.
    await ensureMetadata();
    for (const old of await scanMetadata()) {
      if (old.messageId !== msg.message_id || records.some(record => record.id === old.id)) continue;
      await saveMentorResult({ ...old, retracted: true, version: Number(msg.edit_date || msg.date) || 0 });
    }
    if (!records.length) { await publishMentorResults(); return { handled: true, count: 0, results: [] }; }
  }
  const results = [];
  for (const record of records) results.push(await saveMentorResult(record));
  if (records.some(record => mentorCategory(record) === 'result') || update.edited_message) await publishMentorResults();
  return { handled: true, count: records.length, results };
}
export function parseMentorWidget(html, id) {
  if (!html.includes('data-post="alfakasim/' + id + '"')) return null;
  const author = html.match(/class="tgme_widget_message_author_name" href="https:\/\/t\.me\/([^"]+)"/)?.[1];
  if (author?.toLowerCase() !== MENTOR_SOURCE.author) return null;
  const decode = value => value.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');
  const text = decode(html.match(/class="tgme_widget_message_text js-message_text"[^>]*>([\s\S]*?)<\/div>/)?.[1] || '');
  const date = Date.parse(html.match(/<time datetime="([^"]+)"/)?.[1] || '');
  const reply = Number(html.match(/class="tgme_widget_message_reply [^"]*" href="https:\/\/t\.me\/alfakasim\/(\d+)"/)?.[1] || 0);
  const photo = html.match(/class="tgme_widget_message_photo_wrap[^"]*"[^>]*background-image:url\('([^']+)'\)/)?.[1] || '';
  return { id: Number(id), text, date: Number.isFinite(date) ? Math.floor(date / 1000) : 0, reply,
    photo: /^https:\/\/cdn\d*\.telesco\.pe\/file\/[A-Za-z0-9_-]+\.jpg$/.test(photo) ? photo : '' };
}
async function widget(id) {
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('invalid_message');
  for (const query of ['?embed=1&mode=tme', '?embed=1&single=1']) {
    const r = await fetch('https://t.me/alfakasim/' + id + query, { signal: AbortSignal.timeout(12000), redirect: 'error' });
    if (!r.ok) throw new Error('telegram_unavailable');
    const html = await r.text();
    if (html.length > 200000) throw new Error('invalid_message');
    const parsed = parseMentorWidget(html, id);
    if (parsed) return parsed;
  }
  return null;
}
async function downloadImage(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(12000), redirect: 'error' });
  if (!r.ok || Number(r.headers.get('content-length')) > 2000000) throw new Error('image_unavailable');
  const reader = r.body.getReader(), chunks = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length;
    if (size > 2000000) { await reader.cancel(); throw new Error('image_unavailable'); }
    chunks.push(Buffer.from(value));
  }
  const bytes = Buffer.concat(chunks);
  if (!(bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)) throw new Error('image_unavailable');
  return 'data:image/jpeg;base64,' + bytes.toString('base64');
}
export async function importMentorHistory(id) {
  const result = await widget(id);
  if (!result || !parseMentorResults(result.text).length) return { id, skipped: 'not_an_author_result' };
  const chain = [], seen = new Set([id]);
  let current = result;
  while (current.reply && current.reply !== MENTOR_SOURCE.thread && chain.length < 6) {
    if (seen.has(current.reply)) break;
    seen.add(current.reply);
    current = await widget(current.reply);
    if (!current) break;
    chain.push(current);
  }
  if (current?.reply !== MENTOR_SOURCE.thread) return { id, skipped: 'topic_not_verified' };
  const root = chain.find(item => !parseMentorResults(item.text).length) || chain[0];
  const message = item => ({ message_id: item.id, text: item.text, date: item.date, message_thread_id: 6,
    chat: { id: 'alfakasim', username: 'alfakasim', type: 'supergroup' }, from: { id: process.env.TG_MENTOR_TRADE_AUTHOR_ID || 'widget:traderahmetd', username: 'traderahmetd' } });
  // Public Telegram widgets cannot retrieve private history. Only independently
  // verified author/topic chains are imported; no client-supplied text/images.
  const msg = message(result);
  if (root) msg.reply_to_message = message(root);
  const records = resultRecords(msg);
  let images = [];
  for (const url of [...new Set([result.photo, root?.photo].filter(Boolean))]) images.push(await downloadImage(url));
  const outcomes = [];
  for (const record of records) {
    record.chatId = 'alfakasim'; // Stable across widget and webhook imports.
    record.id = tradeId('alfakasim', record.rootId, record.coin);
    record.history = true;
    record.images = record.needsReview && records.length > 1 ? [] : images;
    outcomes.push(await saveMentorResult(record));
  }
  await publishMentorResults();
  return { id, count: records.length, images: images.length, outcomes };
}
async function telegram(method, body) {
  const token = process.env.TG_BOT_TOKEN;
  if (!token) throw new Error('telegram_not_configured');
  const r = await fetch('https://api.telegram.org/bot' + token + '/' + method, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}),
    signal: AbortSignal.timeout(12000),
  });
  const out = await r.json();
  if (!r.ok || !out.ok) throw new Error('telegram_unavailable');
  return out.result;
}
async function strictTier(user) {
  if (user.admin) return true;
  // Do not use the legacy "missing table = ref" fallback for private imports.
  const r = await fetch(BASE + '/rest/v1/site_access?user_id=eq.' + encodeURIComponent(user.id) + '&select=status', {
    headers: { apikey: process.env.SUPABASE_PUBLISHABLE || 'sb_publishable_bReG5UKaWcQkU0Z9GnGiJQ_0T4_Qm9X', Authorization: 'Bearer ' + user.jwt },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) return false;
  const rows = await r.json();
  return Array.isArray(rows) && rows[0]?.status === 'verified';
}
export default async function mentorTradesHandler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Vary', 'Authorization');
  if (req.method === 'GET' && req.query?.summary === '1') {
    try { return res.status(200).json({ ok: true, summary: mentorResultSummary(await publicResults()) }); }
    catch { return res.status(503).json({ ok: false, error: 'summary_unavailable' }); }
  }
  const user = await requestUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'unauthorized' });
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  try {
    if (req.method === 'POST') {
      if (!user.admin) return res.status(403).json({ ok: false, error: 'admin_required' });
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
      if (body.op === 'import') {
        if (!Array.isArray(body.ids) || body.ids.length > 4 || !body.ids.length || !body.ids.every(id => Number.isSafeInteger(id) && id > 6 && id < 10000000)) return res.status(400).json({ ok: false, error: 'invalid_messages' });
        const results = [];
        for (const id of [...new Set(body.ids)]) results.push(await importMentorHistory(id));
        return res.status(200).json({ ok: true, results });
      }
      if (!['status', 'connect'].includes(body.op)) return res.status(400).json({ ok: false, error: 'invalid_operation' });
      const [me, chat, hook] = await Promise.all([telegram('getMe'), telegram('getChat', { chat_id: '@alfakasim' }), telegram('getWebhookInfo')]);
      const member = await telegram('getChatMember', { chat_id: chat.id, user_id: me.id });
      const readable = ['administrator', 'creator'].includes(member.status) || (member.status === 'member' && me.can_read_all_group_messages === true);
      if (body.op === 'connect') {
        if (!readable) return res.status(409).json({ ok: false, error: 'bot_cannot_read_topic' });
        if (!process.env.TELEGRAM_WEBHOOK_SECRET || !process.env.SUPABASE_SERVICE_ROLE) return res.status(503).json({ ok: false, error: 'configuration_missing' });
        const url = 'https://alfa-trader.com/api/ai?telegram-webhook=1';
        if (hook.url && hook.url !== url) return res.status(409).json({ ok: false, error: 'different_webhook' });
        await telegram('setWebhook', { url, secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
          allowed_updates: [...new Set([...(hook.allowed_updates || []), 'message', 'edited_message', 'callback_query', 'my_chat_member', 'chat_member'])],
          drop_pending_updates: false });
      }
      return res.status(200).json({ ok: true, readable, connected: body.op === 'connect' || !!hook.url,
        bot: me.username, chat: chat.title, thread: MENTOR_SOURCE.thread, editsEnabled: body.op === 'connect' || (hook.allowed_updates || []).includes('edited_message') });
    }
    const premium = await strictTier(user);
    if (!premium && req.query?.image) return res.status(403).json({ ok: false, error: 'referral_required' });
    const page = Number(req.query?.page || 0);
    if (!Number.isInteger(page) || page < 0 || page > 1000) return res.status(400).json({ ok: false, error: 'invalid_page' });
    if (!premium || req.query?.results === '1') {
      const results = await publicResults();
      return res.status(200).json({ ok: true, access: premium ? 'premium' : 'results',
        records: [...results].reverse().slice(page * 50, (page + 1) * 50), page, more: results.length > (page + 1) * 50,
        summary: mentorResultSummary(results) });
    }
    if (req.query?.image) {
      const id = String(req.query.image);
      if (!/^mentortrade_[a-f0-9]{64}$/.test(id)) return res.status(400).json({ ok: false, error: 'invalid_id' });
      const row = await read(id);
      if (row?.record?.retracted) return res.status(404).json({ ok: false, error: 'image_missing' });
      const index = Number(req.query?.index || 0);
      if (![0, 1].includes(index)) return res.status(400).json({ ok: false, error: 'invalid_image' });
      const stored = row?.record?.images?.[index];
      if (stored && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(stored)) {
        res.setHeader('Content-Type', 'image/jpeg'); res.setHeader('X-Content-Type-Options', 'nosniff');
        return res.status(200).end(Buffer.from(stored.split(',')[1], 'base64'));
      }
      const photo = index === 1 ? row?.record?.originalPhotoId : row?.record?.photoId;
      if (!photo) return res.status(404).json({ ok: false, error: 'image_missing' });
      const file = await telegram('getFile', { file_id: photo });
      if (!/^photos\/[a-zA-Z0-9_.-]+\.(jpe?g|png|webp)$/i.test(file.file_path || '') || file.file_size > 2000000) throw new Error('image_unavailable');
      const response = await fetch('https://api.telegram.org/file/bot' + process.env.TG_BOT_TOKEN + '/' + file.file_path, { signal: AbortSignal.timeout(12000), redirect: 'error' });
      if (!response.ok || Number(response.headers.get('content-length')) > 2000000) throw new Error('image_unavailable');
      const reader = response.body.getReader(), chunks = []; let size = 0;
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.length;
        if (size > 2000000) { await reader.cancel(); throw new Error('image_unavailable'); }
        chunks.push(Buffer.from(value));
      }
      const bytes = Buffer.concat(chunks);
      const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
      const png = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
      const webp = bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
      if (!jpeg && !png && !webp) throw new Error('image_unavailable');
      res.setHeader('Content-Type', jpeg ? 'image/jpeg' : png ? 'image/png' : 'image/webp');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.status(200).end(bytes);
    }
    await ensureMetadata();
    const all = (await scanMetadata()).filter(record => !record.retracted);
    const completedRoots = new Set(all.filter(record => mentorCategory(record) === 'result' && !record.needsReview).map(record => record.rootId));
    const category = String(req.query?.category || 'all'), search = clip(req.query?.coin, 20).toUpperCase();
    if (!['all', 'trade', 'bias', 'result', 'post'].includes(category)) return res.status(400).json({ ok: false, error: 'invalid_category' });
    const filtered = all.filter(record => !(['trade','post'].includes(mentorCategory(record)) && completedRoots.has(record.messageId)) &&
      (category === 'all' || mentorCategory(record) === category) &&
      (!search || record.coin.includes(search))).sort((a,b) => b.date - a.date || b.id.localeCompare(a.id));
    return res.status(200).json({ ok: true, access: 'premium', records: filtered.slice(page * 50, (page + 1) * 50),
      page, more: filtered.length > (page + 1) * 50, summary: mentorResultSummary(completedMentorResults(all)),
      counts: Object.fromEntries(['trade','bias','result','post'].map(kind => [kind, all.filter(record => mentorCategory(record) === kind && !(['trade','post'].includes(kind) && completedRoots.has(record.messageId))).length])) });
  } catch {
    return res.status(503).json({ ok: false, error: 'mentor_trades_unavailable' });
  }
}
