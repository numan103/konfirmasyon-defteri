import { createHash } from 'node:crypto';
import { requestUser } from './auth.mjs';
import { openChannels, sealChannels } from './edu-channel-storage.mjs';
import dailyNoteSocial from './daily-note-social.mjs';
import { cleanPDF, verifyPDF, eduPDFUpload } from './edu-pdf.mjs';

const base = process.env.SUPABASE_URL || 'https://fssrtlpjqbavzomynwmg.supabase.co';
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
    modifiedAt: record.modifiedAt || record.publishedAt, photoCount: record.photos?.length || 0, source: record.source || 'telegram', pdf: cleanPDF(record.pdf),
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
const CONTINUATION = /^\s*[\p{Ll}\d(–—-]/u;
const MAX_NOTE_PARTS = 10;
const MAX_NOTE_BODY = 40000;

function noteParts(record, fallbackId = null) {
  if (Array.isArray(record?.sourceParts) && record.sourceParts.length) return record.sourceParts.slice();
  if (!record) return [];
  return [{ messageId: record.sourceMessageId || fallbackId || null, body: record.body || '', photo: record.photos?.[0] || null,
    photoMissing: !!record.photoMissing, publishedAt: record.publishedAt || 0, revision: record.sourceRevision || 0, url: record.url || '' }];
}
function withPhoto(part, photo) {
  const { hasMedia, ...rest } = part;
  return { ...rest, photo: photo || null, photoMissing: !!hasMedia && !photo };
}
function sourceTitle(parts) {
  return String(parts[0]?.body || '').split('\n')[0].slice(0, 140) || 'Telegram görsel notu';
}
function joinedBody(parts) {
  return parts.map(part => String(part.body || '')).filter(Boolean).reduce((out, part) => {
    if (!out) return part;
    const joiner = /[\s]$/.test(out) || /^\s/.test(part) ? '' : '\n';
    return out + joiner + part;
  }, '');
}
function joinedPhotos(parts) {
  const photos = [], seen = new Set();
  for (const part of parts) {
    const photo = part?.photo, url = photo?.url;
    if (!url || seen.has(url)) continue;
    seen.add(url); photos.push(photo);
    if (photos.length >= MAX_NOTE_PARTS) break;
  }
  return photos;
}
async function recentNotes(limit = 50) {
  const rows = await db('?id=like.edutg_*&select=id,data&order=updated_at.desc&limit=' + limit);
  return rows.flatMap(row => {
    if (!rowPattern.test(row.id) || row.data?.channelEnvelope !== 1) return [];
    try { return [{ id: row.id, record: openChannels(row.data, scope(row.id)) }]; } catch { return []; }
  });
}
function mutableTarget(candidate, ownId) {
  const record = candidate?.record;
  return !!record && candidate.id !== ownId && record.publication === 'daily' && !record.manualOverride && !record.absorbedBy &&
    (record.source === 'telegram' || Array.isArray(record.sourceParts));
}
async function mergeTarget(m, ownId, body, publishedAt) {
  const album = m.media_group_id ? String(m.media_group_id).slice(0, 120) : '';
  if (album) {
    for (const candidate of await recentNotes()) {
      if (candidate.id === ownId) continue;
      const record = candidate.record;
      if (record?.mediaGroupId === album && mutableTarget(candidate, ownId)) return candidate.id;
      if (record?.absorbedBy && rowPattern.test(record.absorbedBy)) {
        const canonicalId = record.absorbedBy;
        if (canonicalId !== ownId && (await readRecord(canonicalId))?.mediaGroupId === album &&
          mutableTarget({ id: canonicalId, record: await readRecord(canonicalId) }, ownId)) return canonicalId;
      }
    }
  }
  if (!CONTINUATION.test(body)) return null;
  for (let back = 1; back <= 3; back++) {
    const candidateId = eduTelegramRowId(m.chat.id, m.message_id - back);
    if (candidateId === ownId) continue;
    const record = await readRecord(candidateId);
    if (!record) continue;
    const canonicalId = record.absorbedBy && rowPattern.test(record.absorbedBy) ? record.absorbedBy : candidateId;
    if (canonicalId === ownId) continue;
    const canonical = canonicalId === candidateId ? record : await readRecord(canonicalId);
    const candidate = { id: canonicalId, record: canonical };
    if (!mutableTarget(candidate, ownId)) continue;
    const parts = noteParts(canonical, canonicalId);
    if (parts.length >= MAX_NOTE_PARTS) continue;
    const length = parts.reduce((total, part) => total + String(part.body || '').length, 0);
    if (length + String(body).length > MAX_NOTE_BODY) continue;
    const last = parts.at(-1);
    const delta = publishedAt - (last?.publishedAt || record.publishedAt || 0);
    if (length >= 3000 && delta >= 0 && delta <= 10000) return canonicalId;
  }
  return null;
}
function noteMessageNumber(record) {
  const match = String(record?.url || '').match(/t\.me\/[^/]+\/(\d+)/);
  const value = match ? Number(match[1]) : Number(record?.sourceMessageId);
  return Number.isSafeInteger(value) ? value : null;
}
function noteChatKey(record) {
  const match = String(record?.url || '').match(/t\.me\/([^/]+)\/\d+/);
  return match ? match[1].toLowerCase() : String(record?.sourceChatId || '');
}
function recordPart(record, id) {
  const parts = noteParts(record, id), last = parts.at(-1) || {};
  const photo = last.photo || record?.photos?.[0] || null;
  return { messageId: noteMessageNumber(record) || last.messageId || null,
    body: String(last.body || record?.body || ''), publishedAt: last.publishedAt || record?.publishedAt || 0,
    revision: last.revision || record?.sourceRevision || 0, url: record?.url || '',
    hasMedia: !!photo || !!record?.photoMissing || !!last.photoMissing, photo };
}
async function repairSplitNotes() {
  const rows = await db('?id=eq.' + indexId + '&select=id,data&limit=1'), row = rows[0];
  if (!row || row.data?.channelEnvelope !== 1) return;
  const index = openChannels(row.data, indexScope), repairedAt = Number(index.splitRepairedAt || 0);
  if (Date.now() - repairedAt < 24 * 60 * 60 * 1000) return;
  const candidates = (await recentNotes(80)).filter(candidate => mutableTarget(candidate, '') && !candidate.record.absorbedBy)
    .map(candidate => ({ ...candidate, number: noteMessageNumber(candidate.record), key: noteChatKey(candidate.record),
      length: noteParts(candidate.record, candidate.id).reduce((sum, part) => sum + String(part.body || '').length, 0) }));
  for (const later of candidates) {
    if (!CONTINUATION.test(later.record.body || '')) continue;
    if (Array.isArray(later.record.sourceParts) && later.record.sourceParts.length > 1) continue;
    const earlier = candidates.find(candidate => candidate.id !== later.id && candidate.key && candidate.key === later.key &&
      candidate.number !== null && later.number !== null && later.number - candidate.number >= 1 && later.number - candidate.number <= 3 &&
      candidate.length >= 3000 && later.record.publishedAt - candidate.record.publishedAt >= 0 &&
      later.record.publishedAt - candidate.record.publishedAt <= 10000);
    if (!earlier) continue;
    const part = recordPart(later.record, later.id), getPhoto = async () => part.photo;
    const { record, mutable } = await applyPart(earlier.id, part, { getPhoto, fallbackId: earlier.number });
    if (!mutable || !record) continue;
    await syncIndex(earlier.id, record);
    await absorbPart(later.id, earlier.id, part, { getPhoto });
  }
  await mutate(indexId, current => current && Number(current.splitRepairedAt || 0) <= repairedAt ?
    { ...current, splitRepairedAt: Date.now() } : null);
}
function makeSourceRecord(part, photo, { album = '', publication = 'daily', absorbedBy = '' } = {}) {
  const stored = withPhoto(part, photo);
  return { title: sourceTitle([stored]), body: stored.body, photos: stored.photo ? [stored.photo] : [],
    photoMissing: !!stored.photoMissing, url: stored.url || '', publishedAt: stored.publishedAt || Date.now(),
    modifiedAt: Date.now(), sourceRevision: stored.revision || 0, source: 'telegram', publication,
    journalDate: new Date(stored.publishedAt || Date.now()).toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' }),
    sourceMessageId: stored.messageId || null, sourceParts: [stored],
    ...(album ? { mediaGroupId: album } : {}), ...(absorbedBy ? { absorbedBy } : {}) };
}
async function planPartUpdate(current, part, { getPhoto, album = '', fallbackId = null } = {}) {
  if (!current || current.manualOverride || current.publication !== 'daily' || current.absorbedBy) return null;
  const parts = noteParts(current, fallbackId || part.messageId);
  const index = parts.findIndex(item => Number(item.messageId) === Number(part.messageId));
  if (index >= 0) {
    if (Number(parts[index].revision || 0) >= Number(part.revision || 0)) return null;
  } else if (parts.length >= MAX_NOTE_PARTS) return null;
  const resolved = withPhoto(part, await getPhoto());
  const nextParts = index >= 0 ? parts.map((item, n) => n === index ? resolved : item) : [...parts, resolved];
  const body = joinedBody(nextParts);
  if (String(body).length > MAX_NOTE_BODY) return null;
  return { ...current, title: sourceTitle(nextParts), body, photos: joinedPhotos(nextParts),
    photoMissing: nextParts.some(item => !!item.photoMissing), sourceParts: nextParts,
    sourceMessageId: nextParts[0]?.messageId || current.sourceMessageId || null,
    sourceRevision: nextParts.reduce((max, item) => Math.max(max, Number(item.revision || 0)), Number(current.sourceRevision || 0)),
    publication: 'daily', modifiedAt: Date.now(), ...(album ? { mediaGroupId: album } : {}) };
}
async function applyPart(targetId, part, options = {}) {
  let mutable = false;
  const record = await mutate(targetId, current => {
    if (!current || current.manualOverride || current.publication !== 'daily' || current.absorbedBy) return null;
    mutable = true;
    return planPartUpdate(current, part, { ...options, fallbackId: options.fallbackId || targetId });
  });
  return { record, mutable };
}
async function absorbPart(id, targetId, part, { getPhoto } = {}) {
  if (!id || id === targetId) return;
  const hidden = await mutate(id, async current => {
    if (current?.manualOverride || (current?.publication === 'hidden' && !current.absorbedBy)) return null;
    if (current && String(current.absorbedBy || '') === targetId && Number(current.sourceRevision || 0) >= Number(part.revision || 0)) return null;
    return makeSourceRecord(part, getPhoto ? await getPhoto() : null, { publication: 'hidden', absorbedBy: targetId });
  });
  await syncIndex(id, hidden);
}
function publicRecord(id, record) {
  return { ...summary(id, record), body: record.body || '', tricks: record.tricks || '', url: record.url || '', journalDate: record.journalDate || '',
    pdf: cleanPDF(record.pdf),
    photos: (record.photos || []).map((photo, n) => ({ url: /^https?:\/\//i.test(photo.url || '') ? photo.url : '/api/edu-shared?kind=channel&view=daily-notes&photo=' + id + '&n=' + n + '&v=' + (record.modifiedAt || record.publishedAt), caption: photo.caption || '' })) };
}
function publicSummary(item) {
  return { id: item.id, title: item.title, excerpt: item.excerpt, publishedAt: item.publishedAt, modifiedAt: item.modifiedAt,
    photoCount: item.photoCount || 0, source: item.source, photoUrl: item.photoUrl || '', pdf: cleanPDF(item.pdf) };
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
  const body = String(m.text || m.caption || '').slice(0, MAX_NOTE_BODY);
  const username = String(m.chat.username || '').replace(/[^a-zA-Z0-9_]/g, '');
  const url = username ? 'https://t.me/' + username + '/' + m.message_id + '?thread=' + thread() : '';
  const publishedAt = Number.isFinite(m.date) ? m.date * 1000 : Date.now();
  const id = eduTelegramRowId(m.chat.id, m.message_id);
  const revision = Number(m.edit_date || m.date) || 0;
  const album = m.media_group_id ? String(m.media_group_id).slice(0, 120) : '';
  let photoPromise;
  const getPhoto = () => (photoPromise ||= photoData(m.photo));
  const part = { messageId: m.message_id, body, publishedAt, revision, url, hasMedia: !!m.photo?.length };
  const own = await readRecord(id);

  // Administrator edits and removals always win. A dismissed part still routes
  // later source edits to its canonical note without changing the hidden state.
  if (own?.manualOverride || own?.publication === 'hidden') {
    if (own.absorbedBy && rowPattern.test(own.absorbedBy)) {
      const targetId = own.absorbedBy;
      const { record, mutable } = await applyPart(targetId, part, { getPhoto });
      if (mutable && record) await syncIndex(targetId, record);
      return { handled: true, count: 1 };
    }
    const record = await mutate(id, previous => {
      if (!previous) return null;
      if ((previous.sourceRevision || 0) >= revision && previous.publication) return null;
      return { ...previous, sourceRevision: revision };
    });
    await syncIndex(id, record);
    return { handled: true, count: 1 };
  }

  const known = own && noteParts(own, id).some(item => Number(item.messageId) === Number(m.message_id));
  if (known) {
    const { record, mutable } = await applyPart(id, part, { getPhoto, album });
    if (mutable && record) await syncIndex(id, record);
    return { handled: true, count: 1 };
  }

  const targetId = await mergeTarget(m, id, body, publishedAt);
  if (targetId) {
    const { record, mutable } = await applyPart(targetId, part, { getPhoto, album });
    if (mutable && record) {
      await syncIndex(targetId, record);
      await absorbPart(id, targetId, part, { getPhoto });
      return { handled: true, count: 1 };
    }
  }

  const record = await mutate(id, async previous => {
    if (!previous) return makeSourceRecord(part, await getPhoto(), { album, publication: 'daily' });
    if (previous.manualOverride || previous.publication === 'hidden' || previous.absorbedBy || previous.publication !== 'daily') {
      if ((previous.sourceRevision || 0) >= revision && previous.publication) return null;
      return { ...previous, sourceRevision: revision };
    }
    return planPartUpdate(previous, part, { getPhoto, album, fallbackId: id });
  });
  await syncIndex(id, record);
  return { handled: true, count: 1 };
}
export default async function eduTelegramInbox(req, res) {
  if (req.query?.view === 'daily-notes' && req.query?.['pdf-upload'] === '1') return eduPDFUpload(req, res);
  if (req.query?.view === 'daily-notes' && req.query?.social) return dailyNoteSocial(req, res, readRecord);
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method === 'GET' && req.query?.view === 'daily-notes') {
    try {
      if (!req.query.photo && !req.query.note) {
        // One bounded repair pass folds notes ingested before the split merge
        // shipped; fresh updates are merged during ingestion already.
        try { await repairSplitNotes(); } catch { /* feed still serves the current index */ }
      }
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
      if (action === 'save' && (String(fields.body || '').length > 200000 || String(fields.tricks || '').length > 12000 ||
          !Array.isArray(fields.photos || []) || (fields.photos || []).length > 10 ||
          (fields.photos || []).some(p => !p || String(p.url || '').length > 450000 || !/^(https?:\/\/|data:image\/(?:jpeg|png|webp);base64,)/i.test(p.url || '')) ||
          (fields.pdf && !cleanPDF(fields.pdf)) ||
          (!String(fields.body || '').trim() && !String(fields.tricks || '').trim() && !(fields.photos || []).length && !fields.pdf))) return res.status(400).json({ ok: false, error: 'invalid_daily_content' });
      if (action === 'save' && fields.pdf && !await verifyPDF(fields.pdf)) return res.status(400).json({ ok: false, error: 'invalid_pdf' });
      const record = await mutate(id, previous => {
        if (action !== 'save') {
          if (!previous) throw new Error('note_not_found');
          return { ...previous, publication: action === 'restore' ? 'daily' : 'hidden', manualOverride: true, modifiedAt: Date.now() };
        }
        return { ...previous, title: String(fields.title || '').trim().slice(0, 140) || 'Günlük not', body: String(fields.body || ''), tricks: String(fields.tricks || ''),
          photos: (fields.photos || []).map(p => ({ url: String(p.url), caption: String(p.caption || '').slice(0, 500) })),
          photoMissing: false, pdf: cleanPDF(fields.pdf),
          publication: 'daily', manualOverride: true, source: previous?.source || 'studio', url: previous?.url || '',
          publishedAt: previous?.publishedAt || Date.now(), modifiedAt: Date.now(), journalDate: previous?.journalDate || new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' }) };
      });
      await syncIndex(id, record);
      return res.status(200).json({ ok: true, item: { ...record, id } });
    }
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  } catch { return res.status(503).json({ ok: false, error: 'edu_inbox_unavailable' }); }
}
