import { createHash } from 'node:crypto';
import { requestUser } from './auth.mjs';
import { openChannels, sealChannels } from './edu-channel-storage.mjs';
import dailyNoteSocial from './daily-note-social.mjs';

const base = process.env.SUPABASE_URL || 'https://zvnjslmptwmnuhftgqsr.supabase.co';
const rowPattern = /^edutg_([a-f0-9]{64})$/;
const source = () => String(process.env.TG_EDU_SOURCE_CHAT || '@alfakasim').trim();
const thread = () => Number(process.env.TG_EDU_SOURCE_THREAD || 4);
const scope = id => 'telegram-inbox:' + id.match(rowPattern)[1];
const indexId = 'edudaily_index';
const indexScope = 'telegram-inbox:' + createHash('sha256').update(indexId).digest('hex');
const recordScope = id => id === indexId ? indexScope : scope(id);
export function eduTelegramRowId(chat, message) {
  return 'edutg_' + createHash('sha256').update('alfa-edu-topic:' + chat + ':' + message).digest('hex');
}
export function isEduTelegramUpdate(update) {
  const m = update?.message || update?.edited_message;
  if (!m || !['supergroup', 'group'].includes(m.chat?.type) || Number(m.message_thread_id) !== thread()) return false;
  const expected = source();
  if (expected.startsWith('@') ? !/^@[a-zA-Z0-9_]{5,32}$/.test(expected) : !/^-\d{1,16}$/.test(expected)) return false;
  const matches = expected.startsWith('@') ? String(m.chat.username || '').toLowerCase() === expected.slice(1).toLowerCase() : String(m.chat.id) === expected;
  return matches && !!(m.text || m.caption || m.photo?.length) && !String(m.text || '').startsWith('/');
}
async function db(query, method = 'GET', body, prefer = 'resolution=merge-duplicates') {
  const key = process.env.SUPABASE_SERVICE_ROLE;
  if (!key) throw new Error('edu_inbox_unavailable');
  const r = await fetch(base + '/rest/v1/edu_shared' + query, {
    method, headers: { apikey: key, ...(key.startsWith('sb_secret_') ? {} : { Authorization: 'Bearer ' + key }), 'Content-Type': 'application/json', Prefer: prefer },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error('edu_inbox_unavailable');
  return r.status === 204 ? [] : r.json();
}
async function mutate(id, change) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const rows = await db('?id=eq.' + id + '&select=id,data,updated_at&limit=1'), row = rows[0];
    if (row && row.data?.channelEnvelope !== 1) throw new Error('edu_daily_invalid');
    const current = row ? openChannels(row.data, recordScope(id)) : null;
    const planned = await change(current);
    if (!planned) return current;
    const next = { ...planned, _revision: (current?._revision || 0) + 1 };
    const updated_at = new Date(Math.max(Date.now(), (Date.parse(row?.updated_at) || 0) + 1)).toISOString();
    const data = sealChannels(next, recordScope(id));
    const result = row
      ? await db('?id=eq.' + id + '&updated_at=eq.' + encodeURIComponent(row.updated_at), 'PATCH', { data, updated_at }, 'return=representation')
      : await db('', 'POST', { id, data, updated_at }, 'resolution=ignore-duplicates,return=representation');
    if (Array.isArray(result) && result.length) return next;
  }
  throw new Error('edu_daily_conflict');
}
function summary(id, record) {
  const first = record.photos?.[0]?.url || '';
  return { id, title: record.title, excerpt: String(record.body || record.tricks || '').replace(/\{\{(?:foto|video):[^}]*\}\}/g, '').replace(/[*_`#]/g, '').trim().slice(0, 260), publishedAt: record.publishedAt,
    modifiedAt: record.modifiedAt || record.publishedAt, photoCount: record.photos?.length || 0, source: record.source || 'telegram',
    photoUrl: first ? (/^https?:\/\//i.test(first) ? first : '/api/edu-shared?kind=channel&view=daily-notes&photo=' + id + '&v=' + (record.modifiedAt || record.publishedAt)) : '' };
}
async function syncIndex(id, record) {
  await mutate(indexId, async index => {
    // Read inside the index CAS attempt. A late source update must not re-add
    // a note removed/edited by an administrator while media was downloading.
    record = await readRecord(id);
    const items = Array.isArray(index?.items) ? index.items : [];
    const next = items.filter(item => item.id !== id);
    if (record?.publication === 'daily') next.push(summary(id, record));
    next.sort((a, b) => b.publishedAt - a.publishedAt || a.id.localeCompare(b.id));
    const bounded = next.slice(0, 1000);
    const stamps = { ...(index?.stamps || {}) }, stamp = record?._revision || 0;
    if (stamps[id] === stamp && JSON.stringify(items) === JSON.stringify(bounded)) return null;
    delete stamps[id]; stamps[id] = stamp;
    for (const old of Object.keys(stamps).slice(0, Math.max(0, Object.keys(stamps).length - 2000))) delete stamps[old];
    return { items: bounded, stamps };
  });
}
async function readRecord(id) {
  const rows = await db('?id=eq.' + id + '&select=id,data&limit=1'), row = rows[0];
  if (!row || row.data?.channelEnvelope !== 1) return null;
  return openChannels(row.data, scope(id));
}
function publicRecord(id, record) {
  return { ...summary(id, record), body: record.body || '', tricks: record.tricks || '', url: record.url || '', journalDate: record.journalDate || '',
    photos: (record.photos || []).map((photo, n) => ({ url: /^https?:\/\//i.test(photo.url || '') ? photo.url : '/api/edu-shared?kind=channel&view=daily-notes&photo=' + id + '&n=' + n + '&v=' + (record.modifiedAt || record.publishedAt), caption: photo.caption || '' })) };
}
function publicSummary(item) {
  return { id: item.id, title: item.title, excerpt: item.excerpt, publishedAt: item.publishedAt, modifiedAt: item.modifiedAt,
    photoCount: item.photoCount || 0, source: item.source, photoUrl: item.photoUrl || '' };
}
async function tg(method, payload) {
  const r = await fetch('https://api.telegram.org/bot' + process.env.TG_BOT_TOKEN + '/' + method, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(6000),
  });
  const out = await r.json();
  if (!r.ok || !out.ok) throw new Error('edu_telegram_unavailable');
  return out.result;
}
const EDU_PHOTO_MAX_BYTES = 300000; // base64 stays under the 450k storage whitelist
async function photoData(photos) {
  const candidates = (photos || [])
    .filter(p => p && typeof p.file_id === 'string' && p.file_id.length > 0 && p.file_id.length <= 250)
    .sort((a, b) => {
      const as = Number(a.file_size) || 0, bs = Number(b.file_size) || 0;
      if (as && as <= EDU_PHOTO_MAX_BYTES && (!bs || bs > EDU_PHOTO_MAX_BYTES)) return -1;
      if (bs && bs <= EDU_PHOTO_MAX_BYTES && (!as || as > EDU_PHOTO_MAX_BYTES)) return 1;
      return bs - as;
    }).slice(0, 4);
  for (const photo of candidates) {
    try {
      const declared = Number(photo.file_size) || 0;
      if (declared > EDU_PHOTO_MAX_BYTES) continue;
      const file = await tg('getFile', { file_id: photo.file_id });
      if (!/^[a-zA-Z0-9_./-]+$/.test(file?.file_path || '') || String(file.file_path).split('/').includes('..')) continue;
      const r = await fetch('https://api.telegram.org/file/bot' + process.env.TG_BOT_TOKEN + '/' + file.file_path, { redirect: 'error', signal: AbortSignal.timeout(8000) });
      if (!r.ok) continue;
      const parts = []; let size = 0;
      for await (const part of r.body) { size += part.length; if (size > EDU_PHOTO_MAX_BYTES) throw new Error('edu_photo_large'); parts.push(part); }
      const bytes = Buffer.concat(parts);
      const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
      const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      const webp = bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
      if (!jpeg && !png && !webp) continue;
      const type = jpeg ? 'jpeg' : png ? 'png' : 'webp';
      return { url: 'data:image/' + type + ';base64,' + bytes.toString('base64'), caption: '' };
    } catch { /* try the next Telegram size variant; missing media must not block the note */ }
  }
  return null;
}
// Only called behind the existing webhook secret verification. No Telegram
// history access, outgoing messages or bot/webhook configuration. The selected
// source administrators explicitly publish to the public daily feed.
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
  const username = String(m.chat.username || '').replace(/[^a-zA-Z0-9_]/g, '');
  const url = username ? 'https://t.me/' + username + '/' + m.message_id + '?thread=' + thread() : '';
  const publishedAt = Number.isFinite(m.date) ? m.date * 1000 : Date.now();
  const id = eduTelegramRowId(m.chat.id, m.message_id);
  const revision = Number(m.edit_date || m.date) || 0;
  let photoPromise;
  const record = await mutate(id, async previous => {
    if (previous && (previous.sourceRevision || 0) >= revision && previous.publication) return null;
    if (previous && (previous.manualOverride || previous.publication === 'hidden')) return { ...previous, sourceRevision: revision };
    const photo = await (photoPromise ||= photoData(m.photo));
    return { title: body.split('\n')[0].slice(0, 140) || 'Telegram görsel notu', body, photos: photo ? [photo] : [],
      photoMissing: !!m.photo?.length && !photo, url, publishedAt, modifiedAt: Date.now(), sourceRevision: revision, source: 'telegram',
      publication: 'daily', journalDate: new Date(publishedAt).toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' }) };
  });
  await syncIndex(id, record);
  return { handled: true, count: 1 };
}
export default async function eduTelegramInbox(req, res) {
  if (req.query?.view === 'daily-notes' && req.query?.social) return dailyNoteSocial(req, res, readRecord);
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method === 'GET' && req.query?.view === 'daily-notes') {
    try {
      const id = req.query.photo || req.query.note;
      if (id) {
        if (!rowPattern.test(id)) return res.status(400).json({ ok: false, error: 'invalid_daily_id' });
        const record = await readRecord(id);
        if (!record || record.publication !== 'daily') return res.status(404).json({ ok: false, error: 'note_not_found' });
        if (req.query.photo) {
          const n = Number(req.query.n || 0), photo = Number.isInteger(n) && n >= 0 ? record.photos?.[n] : null;
          if (!photo) return res.status(404).json({ ok: false, error: 'photo_not_found' });
          const match = String(photo.url || '').match(/^data:image\/(jpeg|png|webp);base64,([a-zA-Z0-9+/=]+)$/);
          if (!match) {
            return res.status(404).json({ ok: false, error: 'photo_not_found' });
          }
          res.setHeader('Content-Type', 'image/' + match[1]); res.setHeader('X-Content-Type-Options', 'nosniff');
          return res.status(200).end(Buffer.from(match[2], 'base64'));
        }
        return res.status(200).json({ ok: true, item: publicRecord(id, record) });
      }
      const rows = await db('?id=eq.' + indexId + '&select=id,data&limit=1'), row = rows[0];
      if (row && row.data?.channelEnvelope !== 1) throw new Error('edu_daily_invalid');
      const items = row ? openChannels(row.data, indexScope).items || [] : [];
      const offset = Math.max(0, Math.min(1000, Math.floor(Number(req.query.offset) || 0))), limit = 3;
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=15');
      return res.status(200).json({ ok: true, items: items.slice(offset, offset + limit).map(publicSummary), hasMore: offset + limit < items.length });
    } catch { return res.status(503).json({ ok: false, error: 'edu_daily_unavailable' }); }
  }
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
      if (req.query?.manage) {
        if (!rowPattern.test(req.query.manage)) return res.status(400).json({ ok: false, error: 'invalid_daily_id' });
        const item = await readRecord(req.query.manage);
        return item ? res.status(200).json({ ok: true, item: { ...item, id: req.query.manage } }) : res.status(404).json({ ok: false, error: 'note_not_found' });
      }
      const rows = await db('?id=like.edutg_*&select=id,data&order=updated_at.desc&limit=12');
      const items = rows.filter(r => rowPattern.test(r.id)).map(r => {
        if (r.data?.channelEnvelope !== 1) throw new Error('edu_inbox_invalid');
        const record = openChannels(r.data, scope(r.id));
        return { ...summary(r.id, record), publication: record.publication, manualOverride: !!record.manualOverride, photoMissing: !!record.photoMissing };
      });
      return res.status(200).json({ ok: true, items, source: 'https://t.me/alfakasim/4', configured: !!(process.env.TG_BOT_TOKEN && process.env.TELEGRAM_WEBHOOK_SECRET) });
    }
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (Buffer.byteLength(JSON.stringify(body || {})) > 2800000) return res.status(413).json({ ok: false, error: 'daily_too_large' });
      if (body?.action === 'sync-source') {
        if (!Array.isArray(body.ids) || body.ids.length > 6 || body.ids.some(id => !rowPattern.test(id))) return res.status(400).json({ ok: false, error: 'invalid_daily_request' });
        let count = 0;
        for (const id of new Set(body.ids)) {
          const previous = await readRecord(id);
          if (!previous || previous.publication === 'hidden') continue;
          if (!previous.publication) {
            let trusted = false;
            try {
              const url = new URL(previous.url);
              trusted = source().startsWith('@') && url.origin === 'https://t.me' && new RegExp('^/' + source().slice(1).replace(/[^\w]/g, '') + '/\\d+$', 'i').test(url.pathname) && Number(url.searchParams.get('thread')) === thread();
            } catch { /* Private/unverifiable legacy drafts never auto-publish. */ }
            if (!trusted) continue;
          }
          const record = await mutate(id, current => current?.publication ? null : { ...current, publication: 'daily', source: 'telegram', modifiedAt: Date.now() });
          await syncIndex(id, record); count++;
        }
        return res.status(200).json({ ok: true, count });
      }
      const action = body?.dismiss ? 'remove' : body?.action;
      let id = body?.id || body?.dismiss;
      if (!id && action === 'save' && /^[a-zA-Z0-9_-]{1,120}$/.test(body.draftId || '')) id = 'edutg_' + createHash('sha256').update('manual:' + user.id + ':' + body.draftId).digest('hex');
      if (!rowPattern.test(id || '') || !['save', 'remove', 'restore'].includes(action)) return res.status(400).json({ ok: false, error: 'invalid_daily_request' });
      const fields = body.fields || {};
      if (action === 'save' && (String(fields.body || '').length > 40000 || String(fields.tricks || '').length > 12000 ||
          !Array.isArray(fields.photos || []) || (fields.photos || []).length > 10 ||
          (fields.photos || []).some(p => !p || String(p.url || '').length > 450000 || !/^(https?:\/\/|data:image\/(?:jpeg|png|webp);base64,)/i.test(p.url || '')) ||
          (!String(fields.body || '').trim() && !String(fields.tricks || '').trim() && !(fields.photos || []).length))) return res.status(400).json({ ok: false, error: 'invalid_daily_content' });
      const record = await mutate(id, previous => {
        if (action !== 'save') {
          if (!previous) throw new Error('note_not_found');
          return { ...previous, publication: action === 'restore' ? 'daily' : 'hidden', manualOverride: true, modifiedAt: Date.now() };
        }
        return { ...previous, title: String(fields.title || '').trim().slice(0, 140) || 'Günlük not', body: String(fields.body || ''), tricks: String(fields.tricks || ''),
          photos: (fields.photos || []).map(p => ({ url: String(p.url), caption: String(p.caption || '').slice(0, 500) })),
          photoMissing: false,
          publication: 'daily', manualOverride: true, source: previous?.source || 'studio', url: previous?.url || '',
          publishedAt: previous?.publishedAt || Date.now(), modifiedAt: Date.now(), journalDate: previous?.journalDate || new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' }) };
      });
      await syncIndex(id, record);
      return res.status(200).json({ ok: true, item: { ...record, id } });
    }
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  } catch { return res.status(503).json({ ok: false, error: 'edu_inbox_unavailable' }); }
}
