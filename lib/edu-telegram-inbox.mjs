import { createHash } from 'node:crypto';
import { requestUser } from './auth.mjs';
import { openChannels, sealChannels } from './edu-channel-storage.mjs';

const base = process.env.SUPABASE_URL || 'https://zvnjslmptwmnuhftgqsr.supabase.co';
const rowPattern = /^edutg_([a-f0-9]{64})$/;
const source = () => String(process.env.TG_EDU_SOURCE_CHAT || '@alfakasim').trim();
const thread = () => Number(process.env.TG_EDU_SOURCE_THREAD || 4);
const scope = id => 'telegram-inbox:' + id.match(rowPattern)[1];
export function eduTelegramRowId(chat, message) {
  return 'edutg_' + createHash('sha256').update('alfa-edu-topic:' + chat + ':' + message).digest('hex');
}
export function isEduTelegramUpdate(update) {
  const m = update?.message || update?.edited_message;
  if (!m || !['supergroup', 'group'].includes(m.chat?.type) || Number(m.message_thread_id) !== thread()) return false;
  const expected = source();
  const matches = expected.startsWith('@') ? String(m.chat.username || '').toLowerCase() === expected.slice(1).toLowerCase() : String(m.chat.id) === expected;
  return matches && !!(m.text || m.caption || m.photo?.length) && !String(m.text || '').startsWith('/');
}
async function db(query, method = 'GET', body) {
  const key = process.env.SUPABASE_SERVICE_ROLE;
  if (!key) throw new Error('edu_inbox_unavailable');
  const r = await fetch(base + '/rest/v1/edu_shared' + query, {
    method, headers: { apikey: key, ...(key.startsWith('sb_secret_') ? {} : { Authorization: 'Bearer ' + key }), 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error('edu_inbox_unavailable');
  return method === 'GET' ? r.json() : null;
}
async function tg(method, payload) {
  const r = await fetch('https://api.telegram.org/bot' + process.env.TG_BOT_TOKEN + '/' + method, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(6000),
  });
  const out = await r.json();
  if (!r.ok || !out.ok) throw new Error('edu_telegram_unavailable');
  return out.result;
}
async function photoData(photos) {
  const photo = (photos || []).filter(p => p.file_size > 0 && p.file_size <= 120000).sort((a, b) => b.file_size - a.file_size)[0];
  if (!photo) return null;
  const file = await tg('getFile', { file_id: photo.file_id });
  if (!/^[a-zA-Z0-9_./-]+$/.test(file.file_path || '') || file.file_path.split('/').includes('..')) throw new Error('edu_photo_invalid');
  const r = await fetch('https://api.telegram.org/file/bot' + process.env.TG_BOT_TOKEN + '/' + file.file_path, { redirect: 'error', signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error('edu_photo_unavailable');
  const parts = []; let size = 0;
  for await (const part of r.body) { size += part.length; if (size > 120000) throw new Error('edu_photo_large'); parts.push(part); }
  const bytes = Buffer.concat(parts);
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (!jpeg && !png) throw new Error('edu_photo_invalid');
  return { url: 'data:image/' + (jpeg ? 'jpeg' : 'png') + ';base64,' + bytes.toString('base64'), caption: '' };
}
// Only called behind the existing webhook secret verification. No Telegram
// history access, publication, outgoing messages or bot/webhook configuration.
export async function ingestEduTelegramUpdate(update) {
  if (!isEduTelegramUpdate(update) || !process.env.TELEGRAM_WEBHOOK_SECRET) return { handled: false };
  if (!process.env.TG_BOT_TOKEN || !process.env.SUPABASE_SERVICE_ROLE) return { handled: true, count: 0 };
  const m = update.message || update.edited_message;
  if (!Number.isSafeInteger(m.message_id) || !Number.isSafeInteger(m.chat.id)) return { handled: true, count: 0 };
  const anonymousAdmin = m.sender_chat?.id === m.chat.id;
  if (!anonymousAdmin) {
    if (!m.from?.id || m.from.is_bot || m.sender_chat) return { handled: true, count: 0 };
    const allowed = String(process.env.TG_EDU_AUTHOR_IDS || '').split(',').map(x => x.trim()).filter(Boolean);
    if (allowed.length ? !allowed.includes(String(m.from.id)) :
      !['creator', 'administrator'].includes((await tg('getChatMember', { chat_id: m.chat.id, user_id: m.from.id })).status)) return { handled: true, count: 0 };
  }
  const body = String(m.text || m.caption || '').slice(0, 40000);
  const photo = await photoData(m.photo);
  const username = String(m.chat.username || '').replace(/[^a-zA-Z0-9_]/g, '');
  const url = username ? 'https://t.me/' + username + '/' + m.message_id + '?thread=' + thread() : '';
  const publishedAt = Number.isFinite(m.date) ? m.date * 1000 : Date.now();
  const record = { title: body.split('\n')[0].slice(0, 140) || 'Telegram görsel notu', body, photos: photo ? [photo] : [],
    photoMissing: !!m.photo?.length && !photo, url, publishedAt, journalDate: new Date(publishedAt).toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' }) };
  const id = eduTelegramRowId(m.chat.id, m.message_id);
  await db('', 'POST', { id, data: sealChannels(record, scope(id)), updated_at: new Date().toISOString() });
  return { handled: true, count: 1 };
}
export default async function eduTelegramInbox(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  const user = await requestUser(req);
  if (!user?.admin) return res.status(user ? 403 : 401).json({ ok: false, error: 'admin_required' });
  try {
    if (req.method === 'GET') {
      if (req.query?.check === '1') {
        if (!process.env.TG_BOT_TOKEN) return res.status(503).json({ ok: false, error: 'edu_telegram_unavailable' });
        const me = await tg('getMe', {}), hook = await tg('getWebhookInfo', {});
        let sourceReady = false;
        try {
          const chat = await tg('getChat', { chat_id: source() });
          const membership = await tg('getChatMember', { chat_id: chat.id, user_id: me.id });
          sourceReady = ['administrator', 'creator'].includes(membership.status);
        } catch { /* No fake "connected" state when the source is inaccessible. */ }
        let webhookReady = false;
        try {
          const url = new URL(hook.url);
          webhookReady = url.origin === 'https://alfa-trader.com' && url.pathname === '/api/ai' && url.searchParams.get('telegram-webhook') === '1' &&
            (!Array.isArray(hook.allowed_updates) || !hook.allowed_updates.length ||
              (hook.allowed_updates.includes('message') && hook.allowed_updates.includes('edited_message')));
        } catch { /* missing webhook */ }
        return res.status(200).json({ ok: true, connection: { botUsername: String(me.username || '').replace(/[^a-zA-Z0-9_]/g, ''),
          sourceReady, webhookReady, ready: !!(sourceReady && webhookReady && process.env.TELEGRAM_WEBHOOK_SECRET && process.env.SUPABASE_SERVICE_ROLE) } });
      }
      if (!process.env.SUPABASE_SERVICE_ROLE) return res.status(503).json({ ok: false, error: 'edu_inbox_unavailable' });
      const rows = await db('?id=like.edutg_*&select=id,data&order=updated_at.desc&limit=12');
      const items = rows.filter(r => rowPattern.test(r.id)).map(r => {
        if (r.data?.channelEnvelope !== 1) throw new Error('edu_inbox_invalid');
        return { ...openChannels(r.data, scope(r.id)), id: r.id };
      });
      return res.status(200).json({ ok: true, items, source: 'https://t.me/alfakasim/4', configured: !!(process.env.TG_BOT_TOKEN && process.env.TELEGRAM_WEBHOOK_SECRET) });
    }
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (!rowPattern.test(body?.dismiss || '')) return res.status(400).json({ ok: false, error: 'invalid_inbox_id' });
      await db('?id=eq.' + body.dismiss, 'DELETE');
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  } catch { return res.status(503).json({ ok: false, error: 'edu_inbox_unavailable' }); }
}
