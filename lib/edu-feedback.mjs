import { requestUser, throttle } from './auth.mjs';
import { openChannels } from './edu-channel-storage.mjs';

const URL = process.env.SUPABASE_URL || 'https://fssrtlpjqbavzomynwmg.supabase.co';
const PAGE = 30;
const id = (v, max = 60) => typeof v === 'string' && v.length <= max && /^[a-zA-Z0-9_.-]+$/.test(v);
const uuid = v => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
function reply(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(JSON.stringify(body));
}
async function db(path, method = 'GET', body) {
  const key = process.env.SUPABASE_SERVICE_ROLE;
  if (!key) throw new Error('setup_required');
  const headers = { apikey: key, 'Content-Type': 'application/json', Prefer: 'return=representation' };
  if (!key.startsWith('sb_secret_')) headers.Authorization = 'Bearer ' + key;
  const r = await fetch(URL + '/rest/v1/' + path, {
    method, headers, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000)
  });
  if (!r.ok) {
    if (r.status === 409) throw new Error('conflict');
    if (r.status === 404) throw new Error('setup_required');
    throw new Error('service_unavailable');
  }
  return r.status === 204 ? [] : r.json();
}
async function curriculum(channel) {
  let channels;
  try { channels = openChannels((await db('edu_shared?id=eq.channels&select=data'))[0]?.data); }
  catch (e) { if (e.message !== 'setup_required') throw e; }
  if (!channels?.traders) {
    channels = openChannels((await db('journals?user_id=eq.00000000-0000-0000-0000-00000000e002&select=data'))[0]?.data);
  }
  return !!(channels?.traders && Object.hasOwn(channels.traders, channel) && channels.traders[channel]?.sections);
}
function publicPost(row, user) {
  return {
    id: row.id, kind: row.kind, parent_id: row.parent_id,
    name: row.anonymous ? 'Anonim' : row.display_name, anonymous: row.anonymous,
    rating: row.rating, stage: row.stage, body: row.body, instructor: !!row.instructor,
    created_at: row.created_at, updated_at: row.updated_at, mine: row.user_id === user.id
  };
}
export default async function eduFeedback(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return reply(res, 405, { ok: false, error: 'method' });
  try {
    const user = await requestUser(req);
    if (!user) return reply(res, 401, { ok: false, error: 'login_required' });
    // Do not inherit the legacy "missing access table => premium" fallback.
    if (!user.admin && process.env.SITE_ACCESS_OPEN !== '1') {
      const access = await db('site_access?user_id=eq.' + encodeURIComponent(user.id) + '&select=status&limit=1');
      if (access[0]?.status !== 'verified') return reply(res, 403, { ok: false, error: 'premium_required' });
    }
    let body = req.method === 'GET' ? req.query : req.body;
    if (typeof body === 'string') {
      if (body.length > 20000) return reply(res, 413, { ok: false, error: 'invalid_body' });
      try { body = JSON.parse(body); } catch { return reply(res, 400, { ok: false, error: 'invalid_body' }); }
    }
    body = body || {};
    const { channel } = body;
    if (!id(channel, 120)) return reply(res, 400, { ok: false, error: 'invalid_context' });
    if (!await curriculum(channel)) return reply(res, 404, { ok: false, error: 'course_not_found' });
    // Education-wide feed. Old topic/lesson associations remain stored, not deleted.
    // Canonical values reuse the existing unique review constraint for new records.
    const section = 'general', topic = 'general';
    const scope = 'channel_id=eq.' + channel;
    if (req.method === 'GET') {
      const view = body.view === 'questions' ? 'question' : 'review';
      const offset = Number(body.offset || 0);
      if (!Number.isInteger(offset) || offset < 0 || offset > 10000) return reply(res, 400, { ok: false, error: 'invalid_offset' });
      const rows = await db('edu_feedback?' + scope + '&kind=eq.' + view + '&order=created_at.desc,id.desc&limit=' + (PAGE + 1) + '&offset=' + offset);
      const page = rows.slice(0, PAGE);
      const questions = page.filter(r => r.kind === 'question');
      const answers = questions.length ? await db('edu_feedback?' + scope + '&kind=eq.answer&parent_id=in.(' + questions.map(r => r.id).join(',') + ')&order=created_at.asc&limit=1000') : [];
      const own = await db('edu_feedback?' + scope + '&kind=eq.review&user_id=eq.' + user.id + '&order=created_at.desc,id.desc&limit=1');
      return reply(res, 200, {
        ok: true, posts: page.map(r => publicPost(r, user)), answers: answers.map(r => publicPost(r, user)),
        myReview: own[0] ? publicPost(own[0], user) : null, hasMore: rows.length > PAGE
      });
    }
    if (!['review', 'question', 'answer', 'remove'].includes(body.op)) return reply(res, 400, { ok: false, error: 'invalid_operation' });
    if (body.op === 'remove') {
      if (!uuid(body.id)) return reply(res, 400, { ok: false, error: 'invalid_id' });
      const [row] = await db('edu_feedback?' + scope + '&id=eq.' + body.id + '&limit=1');
      if (!row) return reply(res, 404, { ok: false, error: 'not_found' });
      if (!user.admin && row.user_id !== user.id) return reply(res, 403, { ok: false, error: 'not_allowed' });
      await db('edu_feedback?' + scope + '&id=eq.' + row.id, 'DELETE');
      return reply(res, 200, { ok: true });
    }
    const anonymous = body.anonymous === true;
    const name = anonymous ? 'Anonim' : (typeof body.name === 'string' ? body.name.trim() : '');
    const content = typeof body.text === 'string' ? body.text.trim() : '';
    if (!name || name.length > 60 || content.length < 5 || content.length > 3000) return reply(res, 400, { ok: false, error: 'invalid_content' });
    if (body.op === 'review' && (!Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5)) return reply(res, 400, { ok: false, error: 'invalid_rating' });
    // Students cannot manufacture an "instructor answer" using a forged client flag.
    if (body.op === 'answer' && !user.admin) return reply(res, 403, { ok: false, error: 'instructor_required' });
    if (!throttle('edu-feedback:' + user.id, 3000)) return reply(res, 429, { ok: false, error: 'too_many_requests' });
    const recent = await db('edu_feedback?user_id=eq.' + user.id + '&created_at=gte.' + encodeURIComponent(new Date(Date.now() - 3600000).toISOString()) + '&select=id&limit=15');
    if (recent.length >= 15) return reply(res, 429, { ok: false, error: 'too_many_requests' });
    const common = { display_name: name, anonymous, body: content, updated_at: new Date().toISOString() };
    if (body.op === 'review') {
      if (body.id && !uuid(body.id)) return reply(res, 400, { ok: false, error: 'invalid_id' });
      const filter = body.id ? '&id=eq.' + body.id : '&user_id=eq.' + user.id + '&order=created_at.desc,id.desc';
      const [existing] = await db('edu_feedback?' + scope + '&kind=eq.review' + filter + '&limit=1');
      if (body.id && !existing) return reply(res, 404, { ok: false, error: 'not_found' });
      if (existing && existing.user_id !== user.id) return reply(res, 403, { ok: false, error: 'not_allowed' });
      const fields = { ...common, rating: body.rating, stage: ['start', 'middle', 'end'].includes(body.stage) ? body.stage : 'manual' };
      const saved = existing
        ? await db('edu_feedback?' + scope + '&id=eq.' + existing.id + '&user_id=eq.' + user.id, 'PATCH', fields)
        : await db('edu_feedback', 'POST', { ...fields, channel_id: channel, section_id: section, topic_id: topic, user_id: user.id, kind: 'review', instructor: user.admin });
      return reply(res, 200, { ok: true, myReview: saved[0] ? publicPost(saved[0], user) : null });
    } else {
      let parent = null;
      if (body.op === 'answer') {
        if (!uuid(body.parent)) return reply(res, 400, { ok: false, error: 'invalid_id' });
        [parent] = await db('edu_feedback?' + scope + '&id=eq.' + body.parent + '&kind=eq.question&limit=1');
        if (!parent) return reply(res, 404, { ok: false, error: 'question_not_found' });
      }
      await db('edu_feedback', 'POST', {
        ...common, channel_id: channel, section_id: section, topic_id: topic, lesson_id: null,
        user_id: user.id, kind: body.op, parent_id: parent?.id || null, instructor: user.admin
      });
    }
    return reply(res, 200, { ok: true });
  } catch (e) {
    const error = ['setup_required', 'conflict'].includes(e.message) ? e.message : 'service_unavailable';
    return reply(res, error === 'conflict' ? 409 : 503, { ok: false, error });
  }
}
