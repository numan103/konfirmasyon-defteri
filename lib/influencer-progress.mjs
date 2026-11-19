import { createHash } from 'node:crypto';
import { cleanProgress, REMINDER_DAYS } from '../assets/topic-progress.mjs';
// Auth and product entitlement are checked by the caller before entering here.
export default async function influencerProgress(req, res, user, db, seal, open) {
  const id = 'influencer_progress_' + createHash('sha256').update(user.id).digest('hex');
  let body = req.body;
  if (req.method === 'POST') {
    if (typeof body === 'string') {
      if (body.length > 2000) throw new Error('invalid_content');
      try { body = JSON.parse(body); } catch { throw new Error('invalid_content'); }
    }
    if (!body || !/^[\w-]{1,80}$/.test(body.topicId || '') || ['__proto__','constructor','prototype'].includes(body.topicId) || !['complete', 'uncheck', 'schedule'].includes(body.op)) throw new Error('invalid_content');
    if (body.op === 'schedule' && !REMINDER_DAYS.includes(body.intervalDays)) throw new Error('invalid_content');
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const rows = await db('edu_shared?id=eq.' + id + '&select=data,updated_at');
    const data = rows[0] ? cleanProgress(open(rows[0].data, id)) : { topics: {} };
    if (req.method === 'GET') return res.status(200).json({ ok:true, data });
    const old = data.topics[body.topicId] || { doneAt:0, intervalDays:0 };
    data.topics[body.topicId] = body.op === 'schedule' ? { ...old, intervalDays:body.intervalDays }
      : { ...old, doneAt:body.op === 'complete' ? Date.now() : 0 };
    cleanProgress(data);
    const revision = rows[0]?.updated_at;
    const stamp = new Date(Math.max(Date.now(), Date.parse(revision) + 1 || 0)).toISOString();
    try {
      const saved = await db(revision ? 'edu_shared?id=eq.' + id + '&updated_at=eq.' + encodeURIComponent(revision) : 'edu_shared',
        revision ? 'PATCH' : 'POST', { ...(revision ? {} : { id }), data:seal(data, id), updated_at:stamp });
      if (!Array.isArray(saved) || saved.length !== 1) continue;
      return res.status(200).json({ ok:true, data });
    } catch (e) { if (e.message !== 'conflict') throw e; }
  }
  throw new Error('conflict');
}
