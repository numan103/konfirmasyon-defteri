import { createHmac, createHash } from 'node:crypto';
import { requestUser, requestTier, throttle } from './auth.mjs';
import { sealChannels, openChannels } from './edu-channel-storage.mjs';
import { projectChannels, verifiedEduPlans, channelEditor } from './edu-access.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fssrtlpjqbavzomynwmg.supabase.co';
const PAGE_LIMIT = 200;
const MARK_LIMIT = 20000;
const BODY_LIMIT = 64 * 1024;
const MAX_KEY_PART = 60;
const SRC_RANK = { migration: 1, user: 2 };

function sbHeaders(key) {
  return { apikey: key, ...(String(key).startsWith('sb_secret_') ? {} : { Authorization: 'Bearer ' + key }), 'Content-Type': 'application/json' };
}
function serviceKey() { return String(process.env.SUPABASE_SERVICE_ROLE || '').trim(); }
function progressSecret() {
  return process.env.EDU_PROGRESS_SECRET || process.env.EDU_CHANNEL_SECRET || process.env.EDU_CRM_SECRET || process.env.ANALYTICS_SECRET || process.env.SUPABASE_SERVICE_ROLE || '';
}
function progressScope(userId) {
  const secret = progressSecret();
  if (!secret) throw new Error('setup_required');
  return 'progress:' + createHmac('sha256', secret).update(String(userId)).digest('hex');
}
export function progressRowId(userId) { return 'eduprog_' + progressScope(userId).slice('progress:'.length); }

function reply(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Vary', 'Authorization');
  res.end(JSON.stringify(body));
}
async function db(path, method = 'GET', body, extraHeaders) {
  const key = serviceKey();
  if (!key) throw new Error('setup_required');
  const headers = { ...sbHeaders(key), Prefer: 'return=representation', ...(extraHeaders || {}) };
  const r = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    method, headers, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000)
  });
  if (!r.ok) {
    if (r.status === 409) throw new Error('conflict');
    if (r.status === 404) throw new Error('setup_required');
    throw new Error('service_unavailable');
  }
  return r.status === 204 ? [] : r.json();
}

function emptyProgress() { return { v: 1, marks: {}, certificates: {}, updatedAt: '' }; }
function sealProgress(userId, data) { return sealChannels(data, progressScope(userId)); }
function openProgress(userId, data) {
  if (data == null) return emptyProgress();
  if (!data || typeof data !== 'object' || !Object.hasOwn(data, 'channelEnvelope')) throw new Error('corrupt_progress');
  if (data.channelEnvelope !== 1) throw new Error('corrupt_progress');
  const out = openChannels(data, progressScope(userId));
  if (!out || typeof out !== 'object' || out.v !== 1) throw new Error('corrupt_progress');
  return {
    v: 1,
    marks: out.marks && typeof out.marks === 'object' && !Array.isArray(out.marks) ? out.marks : {},
    certificates: out.certificates && typeof out.certificates === 'object' && !Array.isArray(out.certificates) ? out.certificates : {},
    updatedAt: typeof out.updatedAt === 'string' ? out.updatedAt : '',
  };
}

export function canonicalKey(chId, secId, topicId, videoId) {
  const parts = [chId, secId, topicId, videoId].map(v => String(v || ''));
  if (parts.some(p => !p || p.length > MAX_KEY_PART)) return '';
  return parts.map(encodeURIComponent).join(':');
}
function parseKey(k) {
  if (typeof k !== 'string' || !k || k.length > MAX_KEY_PART * 4 + 8) return null;
  const parts = k.split(':');
  if (parts.length !== 4) return null;
  const decoded = parts.map(p => { try { return decodeURIComponent(p); } catch { return ''; } });
  if (decoded.some(p => !p || p.length > MAX_KEY_PART || /[\u0000-\u001f]/.test(p))) return null;
  return { ch: decoded[0], sec: decoded[1], topic: decoded[2], video: decoded[3], key: canonicalKey(decoded[0], decoded[1], decoded[2], decoded[3]) };
}

async function readChannels() {
  let channels;
  try { channels = openChannels((await db('edu_shared?id=eq.channels&select=data'))[0]?.data); }
  catch (e) { if (e.message !== 'setup_required') throw e; }
  if (!channels?.traders) {
    try { channels = openChannels((await db('journals?user_id=eq.00000000-0000-0000-0000-00000000e002&select=data'))[0]?.data); }
    catch (e) { if (e.message !== 'setup_required') throw e; }
  }
  return channels && channels.traders ? channels : { traders: {}, order: [] };
}

function buildAccessible(base, user, plans) {
  const privileged = !!(user && user.admin);
  const projected = projectChannels(base, { privileged, plans, user });
  const items = new Set();
  const courses = new Map();
  Object.entries(projected.traders || {}).forEach(([chId, trader]) => {
    const secs = trader && trader.sections || {};
    Object.entries(secs).forEach(([secId, topics]) => {
      const list = Array.isArray(topics) ? topics : [];
      const ck = encodeURIComponent(String(chId)) + ':' + encodeURIComponent(String(secId));
      const secMeta = Array.isArray(trader.secMeta) ? trader.secMeta.find(s => s && s.id === secId) : null;
      const course = { key: ck, chId, secId, title: (secMeta && secMeta.title) || secId, instructor: trader.name || '', itemKeys: [], locked: false };
      list.forEach(topic => {
        (Array.isArray(topic?.videos) ? topic.videos : []).forEach(v => {
          const key = canonicalKey(chId, secId, topic.id, v.id);
          if (!key) return;
          course.itemKeys.push(key);
          if (v.locked === true) { course.locked = true; return; }
          items.add(key);
        });
      });
      courses.set(ck, course);
    });
  });
  return { items, courses };
}

function cleanMarks(input) {
  const out = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  for (const [k, v] of Object.entries(input)) {
    const parsed = parseKey(k);
    if (!parsed) continue;
    if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
    const d = v.d === 1 || v.d === true ? 1 : v.d === 0 || v.d === false ? 0 : null;
    const t = Number(v.t);
    const src = v.src === 'migration' ? 'migration' : v.src === 'user' ? 'user' : '';
    if (d == null || !Number.isFinite(t) || t < 0 || t > Date.now() + 86400000 || !src) continue;
    out[parsed.key] = { d, t: Math.floor(t), src };
  }
  return out;
}

function mergeMarks(current, incoming, allowedKeys, mode) {
  let accepted = 0, ignored = 0;
  const marks = { ...cleanMarks(current) };
  const list = Array.isArray(incoming) ? incoming : [];
  for (const item of list.slice(0, PAGE_LIMIT)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) { ignored++; continue; }
    const parsed = parseKey(item.k);
    const d = item.d === 1 || item.d === true ? 1 : item.d === 0 || item.d === false ? 0 : null;
    const t = Number(item.t);
    const src = item.src === 'migration' ? 'migration' : item.src === 'user' ? 'user' : 'user';
    if (!parsed || d == null || !Number.isFinite(t) || t < 0 || t > Date.now() + 86400000) { ignored++; continue; }
    if (mode === 'migration' && src !== 'migration') { ignored++; continue; }
    if (!allowedKeys.has(parsed.key)) { ignored++; continue; }
    const next = { d, t: Math.floor(t), src };
    const prev = marks[parsed.key];
    if (prev) {
      if (next.t < prev.t) { ignored++; continue; }
      if (next.t === prev.t && (SRC_RANK[next.src] || 0) < (SRC_RANK[prev.src] || 0)) { ignored++; continue; }
      if (prev.d === next.d && prev.t === next.t && prev.src === next.src) { ignored++; continue; }
    }
    marks[parsed.key] = next;
    accepted++;
  }
  // cap marks
  const entries = Object.entries(marks);
  if (entries.length > MARK_LIMIT) {
    entries.sort((a, b) => (b[1].t - a[1].t));
    const limited = Object.fromEntries(entries.slice(0, MARK_LIMIT));
    return { marks: limited, accepted, ignored: ignored + (entries.length - MARK_LIMIT) };
  }
  return { marks, accepted, ignored };
}

function publicMarks(marks, allowedKeys) {
  const out = {};
  for (const [k, v] of Object.entries(cleanMarks(marks))) {
    if (allowedKeys && !allowedKeys.has(k)) continue;
    if (v.d !== 1) continue; // only done marks to client; tombstones kept server-side
    out[k] = { d: 1, t: v.t, src: v.src };
  }
  return out;
}

function certificateFingerprint(itemKeys) {
  return createHash('sha256').update(itemKeys.slice().sort().join('\n')).digest('hex');
}
function stableSerial(userId, courseKey, issuedAt) {
  const base = createHash('sha256').update(String(userId) + '|' + courseKey + '|' + String(issuedAt)).digest('hex').slice(0, 16).toUpperCase();
  return 'ALFAEDU-' + base.slice(0, 4) + '-' + base.slice(4, 8) + '-' + base.slice(8, 12) + '-' + base.slice(12, 16);
}
function userName(user) {
  const meta = user && user.user_metadata || {};
  const name = String(meta.full_name || meta.name || meta.display_name || user?.email || '').trim();
  return name.slice(0, 120) || 'Alfa Edu Öğrencisi';
}

async function readProgressRow(userId) {
  const id = progressRowId(userId);
  const rows = await db('edu_shared?id=eq.' + encodeURIComponent(id) + '&select=data,updated_at');
  if (!rows[0]) return { id, row: null, revision: null, data: emptyProgress() };
  return { id, row: rows[0], revision: rows[0].updated_at || null, data: openProgress(userId, rows[0].data) };
}
async function writeProgressRow(userId, data, revision) {
  const id = progressRowId(userId);
  const stamp = new Date(Math.max(Date.now(), Date.parse(revision || '') + 1 || 0)).toISOString();
  const payload = { ...(revision ? {} : { id }), data: sealProgress(userId, { ...data, updatedAt: stamp }), updated_at: stamp };
  const path = revision
    ? 'edu_shared?id=eq.' + encodeURIComponent(id) + '&updated_at=eq.' + encodeURIComponent(revision)
    : 'edu_shared';
  const r = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    method: revision ? 'PATCH' : 'POST',
    headers: { ...sbHeaders(serviceKey()), Prefer: 'return=representation' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });
  if (r.status === 409) throw new Error('conflict');
  if (!r.ok) throw new Error('service_unavailable');
  const changed = await r.json();
  if (!Array.isArray(changed) || changed.length !== 1) throw new Error('conflict');
  return { revision: changed[0].updated_at || stamp, data };
}

function courseCertificates(courses, data) {
  const certs = data.certificates && typeof data.certificates === 'object' ? data.certificates : {};
  const out = [];
  for (const [courseKey, course] of courses.entries()) {
    const marks = cleanMarks(data.marks);
    const done = !course.locked && course.itemKeys.length > 0 && course.itemKeys.every(k => marks[k]?.d === 1);
    const cert = certs[courseKey];
    out.push({
      course: courseKey,
      chId: course.chId,
      secId: course.secId,
      title: course.title,
      items: course.itemKeys.length,
      eligible: done,
      serial: cert && cert.serial ? String(cert.serial) : null,
      issuedAt: cert && cert.issuedAt ? String(cert.issuedAt) : null,
    });
  }
  return out;
}

export default async function eduProgress(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return reply(res, 405, { ok: false, error: 'method' });
  try {
    const user = await requestUser(req);
    if (!user) return reply(res, 401, { ok: false, error: 'login_required' });
    if (!throttle('edu-progress:' + user.id, 1000)) return reply(res, 429, { ok: false, error: 'too_many_requests' });
    if (!serviceKey()) return reply(res, 503, { ok: false, error: 'setup_required' });

    const base = await readChannels();
    const plans = await verifiedEduPlans(user);
    const { items: allowedKeys, courses } = buildAccessible(base, user, plans);

    if (req.method === 'GET') {
      const row = await readProgressRow(user.id);
      return reply(res, 200, {
        ok: true,
        revision: row.revision,
        data: { v: 1, marks: publicMarks(row.data.marks, allowedKeys) },
        certificates: courseCertificates(courses, row.data),
      });
    }

    let body = req.body;
    if (typeof body === 'string') {
      if (body.length > BODY_LIMIT) return reply(res, 413, { ok: false, error: 'invalid_body' });
      try { body = JSON.parse(body); } catch { return reply(res, 400, { ok: false, error: 'invalid_body' }); }
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return reply(res, 400, { ok: false, error: 'invalid_body' });
    const op = body.op;

    if (op === 'merge') {
      const mode = body.mode === 'migration' ? 'migration' : 'user';
      const incoming = Array.isArray(body.marks) ? body.marks : [];
      if (incoming.length > PAGE_LIMIT) return reply(res, 400, { ok: false, error: 'too_many_marks' });
      for (let attempt = 0; attempt < 4; attempt++) {
        const row = await readProgressRow(user.id);
        const merged = mergeMarks(row.data.marks, incoming, allowedKeys, mode);
        const nextData = { ...row.data, marks: merged.marks };
        try {
          const saved = await writeProgressRow(user.id, nextData, row.revision);
          return reply(res, 200, {
            ok: true, accepted: merged.accepted, ignored: merged.ignored, revision: saved.revision,
            data: { v: 1, marks: publicMarks(saved.data.marks, allowedKeys) },
            certificates: courseCertificates(courses, saved.data),
          });
        } catch (e) {
          if (e.message === 'conflict' && attempt < 3) continue;
          throw e;
        }
      }
      throw new Error('conflict');
    }

    if (op === 'issueCertificate') {
      const courseKey = String(body.course || '').slice(0, 200);
      const course = courses.get(courseKey);
      if (!course) return reply(res, 404, { ok: false, error: 'course_not_found' });
      if (course.locked) return reply(res, 403, { ok: false, error: 'course_locked' });
      if (!course.itemKeys.length) return reply(res, 409, { ok: false, error: 'course_empty' });
      for (let attempt = 0; attempt < 4; attempt++) {
        const row = await readProgressRow(user.id);
        const marks = cleanMarks(row.data.marks);
        const done = course.itemKeys.every(k => marks[k]?.d === 1);
        if (!done) return reply(res, 409, { ok: false, error: 'course_incomplete' });
        const certs = { ...(row.data.certificates && typeof row.data.certificates === 'object' ? row.data.certificates : {}) };
        const existing = certs[courseKey];
        if (existing && existing.serial) {
          return reply(res, 200, {
            ok: true,
            certificate: {
              course: courseKey, serial: String(existing.serial), name: String(existing.name || userName(user)),
              courseTitle: String(existing.courseTitle || course.title), instructor: String(existing.instructor || course.instructor),
              items: Number(existing.items || course.itemKeys.length), completedAt: String(existing.completedAt || ''),
              issuedAt: String(existing.issuedAt || ''), fingerprint: String(existing.fingerprint || ''),
            },
          });
        }
        const completedAt = new Date(Math.max(...course.itemKeys.map(k => Number(marks[k]?.t || 0)))).toISOString();
        const issuedAt = new Date().toISOString();
        const fingerprint = certificateFingerprint(course.itemKeys);
        const cert = {
          serial: stableSerial(user.id, courseKey + ':' + fingerprint, issuedAt),
          name: userName(user),
          courseTitle: course.title,
          instructor: course.instructor,
          items: course.itemKeys.length,
          fingerprint,
          completedAt,
          issuedAt,
        };
        certs[courseKey] = cert;
        try {
          await writeProgressRow(user.id, { ...row.data, marks, certificates: certs }, row.revision);
          return reply(res, 200, { ok: true, certificate: { course: courseKey, ...cert } });
        } catch (e) {
          if (e.message === 'conflict' && attempt < 3) continue;
          throw e;
        }
      }
      throw new Error('conflict');
    }

    return reply(res, 400, { ok: false, error: 'invalid_operation' });
  } catch (e) {
    const msg = e && e.message || 'service_unavailable';
    const error = ['setup_required', 'conflict', 'corrupt_progress'].includes(msg) ? msg : 'service_unavailable';
    const status = error === 'conflict' ? 409 : 503;
    return reply(res, status, { ok: false, error });
  }
}
