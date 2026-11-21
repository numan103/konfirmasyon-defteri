import { createHash, randomUUID } from 'node:crypto';
import { requestUser, throttle } from './auth.mjs';
import { openChannels, sealChannels } from './edu-channel-storage.mjs';
const BASE = process.env.SUPABASE_URL || 'https://zvnjslmptwmnuhftgqsr.supabase.co';
const validNote = id => typeof id === 'string' && /^edutg_[a-f0-9]{64}$/.test(id);
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value);
const PAGE = 20;
function location(note) {
  const hash = createHash('sha256').update('daily-note-social:' + note).digest('hex');
  return { id: 'edudisc_' + hash, scope: 'telegram-inbox:' + hash };
}
async function db(query, method = 'GET', body) {
  const key = process.env.SUPABASE_SERVICE_ROLE;
  if (!key) throw new Error('social_unavailable');
  const r = await fetch(BASE + '/rest/v1/edu_shared' + query, {
    method, headers: { apikey: key, ...(key.startsWith('sb_secret_') ? {} : { Authorization: 'Bearer ' + key }),
      'Content-Type': 'application/json', Prefer: method === 'POST' ? 'resolution=ignore-duplicates,return=representation' : 'return=representation' },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(8000)
  });
  if (!r.ok) throw new Error('social_unavailable');
  return r.status === 204 ? [] : r.json();
}
async function read(note) {
  const place = location(note);
  const [row] = await db('?id=eq.' + place.id + '&select=data,updated_at&limit=1');
  if (row && row.data?.channelEnvelope !== 1) throw new Error('social_unavailable');
  const state = row ? openChannels(row.data, place.scope) : { likes: [], comments: [] };
  if (!Array.isArray(state?.likes) || !Array.isArray(state?.comments)) throw new Error('social_unavailable');
  return { place, row, state };
}
async function mutate(note, change) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { place, row, state } = await read(note);
    if (!change(state)) return state;
    const updated_at = new Date(Math.max(Date.now(), (Date.parse(row?.updated_at) || 0) + 1)).toISOString();
    const data = sealChannels(state, place.scope);
    const result = row
      ? await db('?id=eq.' + place.id + '&updated_at=eq.' + encodeURIComponent(row.updated_at), 'PATCH', { data, updated_at })
      : await db('', 'POST', { id: place.id, data, updated_at });
    if (Array.isArray(result) && result.length === 1) return state;
  }
  throw new Error('social_conflict');
}
function project(state, user, offset = 0) {
  return { ok: true, social: true, likes: state.likes.length, liked: !!user && state.likes.includes(user.id),
    commentCount: state.comments.length, hasMore: offset + PAGE < state.comments.length,
    comments: state.comments.slice().reverse().slice(offset, offset + PAGE).map(c => ({
      id: c.id, name: c.name, text: c.text, createdAt: c.createdAt,
      instructor: c.instructor === true, mine: !!user && c.owner === user.id, removable: !!user && (user.admin || c.owner === user.id)
    })) };
}
export default async function dailyNoteSocial(req, res, readNote) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  const note = req.query.social;
  if (!validNote(note)) return res.status(400).json({ ok: false, error: 'invalid_note' });
  try {
    const record = await readNote(note);
    if (!record || record.publication !== 'daily') return res.status(404).json({ ok: false, error: 'note_not_found' });
    const user = await requestUser(req);
    if (req.method === 'GET') {
      const offset = Number(req.query.offset || 0);
      if (!Number.isInteger(offset) || offset < 0 || offset > 500) return res.status(400).json({ ok: false, error: 'invalid_offset' });
      return res.status(200).json(project((await read(note)).state, user, offset));
    }
    if (!user) return res.status(401).json({ ok: false, error: 'login_required' });
    let body = req.body;
    if (typeof body === 'string') { if (body.length > 8000) return res.status(413).json({ ok: false, error: 'invalid_body' }); try { body = JSON.parse(body); } catch { return res.status(400).json({ ok: false, error: 'invalid_body' }); } }
    if (!body || !['like', 'comment', 'remove'].includes(body.op)) return res.status(400).json({ ok: false, error: 'invalid_operation' });
    if (body.op === 'like' && typeof body.liked !== 'boolean') return res.status(400).json({ ok: false, error: 'invalid_like' });
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    const name = user.admin ? 'Trader Ahmet' : (typeof body.name === 'string' ? body.name.trim() : '') || 'Öğrenci';
    if (body.op === 'comment' && (text.length < 2 || text.length > 1500 || name.length > 40 || name.includes('@') || !uuid(body.requestId)))
      return res.status(400).json({ ok: false, error: 'invalid_content' });
    if (body.op === 'comment' && !user.admin && /^trader\s+ahmet$/i.test(name)) return res.status(400).json({ ok: false, error: 'invalid_content' });
    if (body.op === 'remove' && !uuid(body.id)) return res.status(400).json({ ok: false, error: 'invalid_id' });
    if (!throttle('daily-social:' + user.id, 1000)) return res.status(429).json({ ok: false, error: 'too_many_requests' });
    const state = await mutate(note, current => {
      if (body.op === 'like') {
        const exists = current.likes.includes(user.id);
        if (exists === body.liked) return false;
        if (body.liked) {
          if (current.likes.length >= 10000) throw new Error('capacity');
          current.likes.push(user.id);
        } else current.likes = current.likes.filter(id => id !== user.id);
      } else if (body.op === 'comment') {
        if (current.comments.some(c => c.owner === user.id && c.requestId === body.requestId)) return false;
        if (current.comments.length >= 500) throw new Error('capacity');
        if (current.comments.filter(c => c.owner === user.id && Date.parse(c.createdAt) > Date.now() - 3600000).length >= 10) throw new Error('too_many_requests');
        current.comments.push({ id: randomUUID(), owner: user.id, requestId: body.requestId, name, text, instructor: !!user.admin, createdAt: new Date().toISOString() });
      } else {
        const comment = current.comments.find(c => c.id === body.id);
        if (!comment) return false;
        if (comment.owner !== user.id && !user.admin) throw new Error('not_allowed');
        current.comments = current.comments.filter(c => c.id !== body.id);
      }
      return true;
    });
    return res.status(200).json(project(state, user));
  } catch (e) {
    const status = { not_allowed: 403, too_many_requests: 429, capacity: 409, social_conflict: 409 }[e.message] || 503;
    return res.status(status).json({ ok: false, error: status === 503 ? 'social_unavailable' : e.message });
  }
}
