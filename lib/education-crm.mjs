import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import { bearer, requestUser, throttle } from './auth.mjs';
import { EDU_PLANS } from '../assets/edu-plans-model.mjs';

const BASE = process.env.SUPABASE_URL || 'https://zvnjslmptwmnuhftgqsr.supabase.co';
const PREFIX = 'educrm_';
const ID = /^educrm_[a-f0-9]{64}$/;
const STAGES = ['interested', 'applied', 'verified', 'declined', 'cancelled'];
const ROUTES = ['cash', 'breakout', 'breakout100k'];
const clean = (value, max) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
const secret = () => process.env.EDU_CRM_SECRET || process.env.ANALYTICS_SECRET || process.env.SUPABASE_SERVICE_ROLE || '';
const key = () => {
  if (!secret()) throw new Error('configuration_missing');
  return createHash('sha256').update('alfa-edu-crm-v1:' + secret()).digest();
};
function headers(extra = {}) {
  const token = process.env.SUPABASE_SERVICE_ROLE;
  if (!token) throw new Error('configuration_missing');
  return { apikey: token, ...(token.startsWith('sb_secret_') ? {} : { Authorization: 'Bearer ' + token }), 'Content-Type': 'application/json', ...extra };
}
export function contactKey(value) {
  if (typeof value !== 'string' || value.length > 160) return null;
  const contact = clean(value, 160).toLowerCase();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) || /^@[a-z0-9_]{5,32}$/.test(contact)) return contact;
  return null;
}
export function recordId(contact, plan, route) {
  if (!secret()) throw new Error('configuration_missing');
  return PREFIX + createHmac('sha256', key()).update(contact + '\n' + plan + '\n' + route).digest('hex');
}
export function sealRecord(id, record) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from(id));
  const ct = Buffer.concat([cipher.update(JSON.stringify(record), 'utf8'), cipher.final()]);
  return { enc: 'educrm1', iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ct: ct.toString('base64') };
}
export function openRecord(id, data) {
  if (!ID.test(id) || data?.enc !== 'educrm1') throw new Error('invalid_private_record');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(data.iv, 'base64'));
  decipher.setAAD(Buffer.from(id));
  decipher.setAuthTag(Buffer.from(data.tag, 'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data.ct, 'base64')), decipher.final()]).toString('utf8'));
}
export function lessonAllowance(planId, route) {
  const plan = EDU_PLANS.find(plan => plan.id === planId);
  if (!plan || !ROUTES.includes(route) || (route === 'breakout100k' && !plan.upgrade)) return null;
  return { groupLessons: plan.groupLessons, privateLessons: route === 'breakout100k' ? plan.upgrade.privateLessons : plan.privateLessons };
}
function money(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1000000 || Math.abs(number * 100 - Math.round(number * 100)) > 0.00001) throw new Error('invalid_amount');
  return Math.round(number * 100) / 100;
}
function date(value) {
  if (!value) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('invalid_date');
  const at = Date.parse(value + 'T00:00:00Z');
  if (!Number.isFinite(at) || new Date(at).toISOString().slice(0, 10) !== value) throw new Error('invalid_date');
  return value;
}
export function sanitizeApplication(body, user, now = Date.now()) {
  const plan = clean(body.plan, 30), route = clean(body.route, 30);
  if (!lessonAllowance(plan, route)) throw new Error('invalid_package');
  const contact = contactKey(body.contact);
  if (!contact) throw new Error('invalid_contact');
  if (body.consent !== true) throw new Error('consent_required');
  return { name: clean(body.name, 80), contact, plan, route, note: clean(body.note, 500),
    publicReference: 'EDU-' + randomBytes(8).toString('hex'),
    stage: 'applied', memberId: user?.id || null, source: 'application_form',
    createdAt: new Date(now).toISOString(), verifiedAt: null, verification: '', firstPurchaseConfirmed: false,
    cashReceivedUsd: null, commissionReceivedUsd: null, privateAllowance: null, groupAllowance: null, privateUsed: 0, groupUsed: 0,
    groupStart: null, groupEnd: null, adminNote: '', consentAt: new Date(now).toISOString(), audit: [] };
}
export function sanitizeAdminRecord(body, previous, actor, now = Date.now()) {
  const plan = clean(body.plan, 30), route = clean(body.route, 30);
  const currentAllowance = lessonAllowance(plan, route);
  if (!currentAllowance) throw new Error('invalid_package');
  const allowance = {
    privateLessons: Number.isInteger(previous?.privateAllowance) ? previous.privateAllowance : currentAllowance.privateLessons,
    groupLessons: Number.isInteger(previous?.groupAllowance) ? previous.groupAllowance : currentAllowance.groupLessons,
  };
  const contact = contactKey(body.contact);
  if (!contact) throw new Error('invalid_contact');
  if (previous && (previous.contact !== contact || previous.plan !== plan || previous.route !== route)) throw new Error('identity_locked');
  const stage = clean(body.stage, 20);
  if (!STAGES.includes(stage)) throw new Error('invalid_stage');
  const verification = clean(body.verification, 240);
  if (stage === 'verified' && (body.confirmPurchase !== true || !verification)) throw new Error('verification_required');
  if (stage === 'verified' && route !== 'cash' && body.firstPurchaseConfirmed !== true) throw new Error('first_purchase_required');
  const used = field => {
    const number = Number(body[field] ?? 0);
    const max = field === 'privateUsed' ? allowance.privateLessons : allowance.groupLessons;
    if (!Number.isInteger(number) || number < 0 || number > max) throw new Error('invalid_lesson_count');
    return number;
  };
  const groupStart = date(body.groupStart), groupEnd = date(body.groupEnd);
  if (!!groupStart !== !!groupEnd || (groupStart && groupEnd <= groupStart)) throw new Error('invalid_group_period');
  const base = previous || { createdAt: new Date(now).toISOString(), memberId: null, source: 'admin_manual', consentAt: null, note: '', publicReference: 'EDU-' + randomBytes(8).toString('hex') };
  return { ...base, name: clean(body.name, 80), contact, plan, route, stage,
    verification, firstPurchaseConfirmed: body.firstPurchaseConfirmed === true,
    verifiedAt: stage === 'verified' ? (previous?.stage === 'verified' ? previous.verifiedAt : new Date(now).toISOString()) : null,
    cashReceivedUsd: money(body.cashReceivedUsd), commissionReceivedUsd: money(body.commissionReceivedUsd),
    privateAllowance: stage === 'verified' || Number.isInteger(previous?.privateAllowance) ? allowance.privateLessons : null,
    groupAllowance: stage === 'verified' || Number.isInteger(previous?.groupAllowance) ? allowance.groupLessons : null,
    privateUsed: used('privateUsed'), groupUsed: used('groupUsed'), groupStart, groupEnd,
    adminNote: clean(body.adminNote, 1000),
    audit: [...(previous?.audit || []), { at: new Date(now).toISOString(), actor: actor.id, from: previous?.stage || null, to: stage }].slice(-50) };
}
export function educationInterest(rows, { now = Date.now(), days = 7, includeAdmin = false } = {}) {
  const since = now - days * 86400000, viewed = new Set(), clicked = new Set();
  const plans = Object.fromEntries(EDU_PLANS.map(p => [p.id, new Set()]));
  const routes = Object.fromEntries([...ROUTES, 'undecided'].map(route => [route, new Set()]));
  for (const row of rows || []) {
    const visit = row.data;
    if (!visit || visit.bot || (!includeAdmin && visit.admin)) continue;
    if (!visit.member?.id && !visit.vid && !visit.sid) continue;
    const who = visit.member?.id ? 'm:' + visit.member.id : 'v:' + (visit.vid || visit.sid);
    const last = Date.parse(visit.last);
    if (!Number.isFinite(last) || last < since || last > now + 60000) continue;
    if (visit.pages?.eduplans?.v > 0) viewed.add(who);
    for (const click of visit.clicks || []) {
      if (click.product !== 'education' || !plans[click.plan] || !routes[click.route]) continue;
      if (click.route === 'breakout100k' && click.plan !== 'personal') continue;
      const at = Date.parse(click.t);
      if (!Number.isFinite(at) || at < since || at > now) continue;
      clicked.add(who); plans[click.plan].add(who); routes[click.route].add(who);
    }
  }
  return { days, viewers: viewed.size, interestedVisitors: clicked.size,
    plans: Object.fromEntries(Object.entries(plans).map(([id, people]) => [id, people.size])),
    routes: Object.fromEntries(Object.entries(routes).map(([id, people]) => [id, people.size])) };
}
const send = (res, status, data) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); return res.end(JSON.stringify(data)); };
async function read(id) {
  const r = await fetch(BASE + '/rest/v1/edu_shared?id=eq.' + id + '&select=id,data,updated_at', { headers: headers(), signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('storage_unavailable');
  const rows = await r.json();
  if (!Array.isArray(rows)) throw new Error('storage_unavailable');
  return rows[0] ? { ...openRecord(id, rows[0].data), id, revision: rows[0].updated_at } : null;
}
export default async function educationCRM(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const user = bearer(req) ? await requestUser(req) : null;
  if (bearer(req) && !user) return send(res, 401, { ok: false, error: 'unauthorized' });
  let body = req.body;
  if (req.method === 'POST') {
    try { if (typeof body === 'string') body = JSON.parse(body); } catch { return send(res, 400, { ok: false, error: 'bad_json' }); }
    if (!body || typeof body !== 'object' || Array.isArray(body) || JSON.stringify(body).length > 5000) return send(res, 400, { ok: false, error: 'bad_body' });
  }
  const application = req.method === 'POST' && body.op === 'apply';
  if (!application && !user?.admin) return send(res, user ? 403 : 401, { ok: false, error: 'admin_required' });
  if (!['GET', 'POST'].includes(req.method)) return send(res, 405, { ok: false, error: 'method_not_allowed' });
  if (!process.env.SUPABASE_SERVICE_ROLE || !secret()) return send(res, 503, { ok: false, error: 'configuration_missing' });
  try {
    if (req.method === 'GET') {
      const page = Number(req.query?.page || 0);
      if (!Number.isInteger(page) || page < 0 || page > 1000) return send(res, 400, { ok: false, error: 'invalid_page' });
      const r = await fetch(BASE + '/rest/v1/edu_shared?id=like.educrm_*&select=id,data,updated_at&order=updated_at.desc,id.asc&limit=301&offset=' + page * 300, { headers: headers(), signal: AbortSignal.timeout(12000) });
      if (!r.ok) throw new Error('storage_unavailable');
      const rows = await r.json();
      if (!Array.isArray(rows)) throw new Error('storage_unavailable');
      const records = rows.slice(0, 300).map(row => {
        const { audit, ...record } = openRecord(row.id, row.data);
        return { ...record, auditCount: audit?.length || 0, id: row.id, revision: row.updated_at };
      });
      return send(res, 200, { ok: true, records, page, truncated: rows.length > 300 });
    }
    if (application) {
      const record = sanitizeApplication(body, user);
      const id = recordId(record.contact, record.plan, record.route);
      if (!throttle('edu-apply:' + id, 30000)) return send(res, 429, { ok: false, error: 'slow_down' });
      // Repeated forms can add an explicitly unverified follow-up, never payment
      // approval, amounts or lesson rights. CAS also protects concurrent admin edits.
      const existing = await read(id);
      if (existing) {
        const stamp = new Date(Math.max(Date.now(), Date.parse(existing.revision) + 1)).toISOString();
        const next = { ...existing, publicReference: existing.publicReference || record.publicReference, stage: existing.stage === 'interested' ? 'applied' : existing.stage,
          lastApplication: { name: record.name, note: record.note, memberId: record.memberId, at: record.createdAt, consentAt: record.consentAt } };
        const r = await fetch(BASE + '/rest/v1/edu_shared?id=eq.' + id + '&updated_at=eq.' + encodeURIComponent(existing.revision), {
          method: 'PATCH', headers: headers({ Prefer: 'return=representation' }),
          body: JSON.stringify({ data: sealRecord(id, next), updated_at: stamp }), signal: AbortSignal.timeout(8000),
        });
        if (!r.ok) throw new Error('storage_unavailable');
        const changed = await r.json();
        if (!Array.isArray(changed) || changed.length !== 1) return send(res, 409, { ok: false, error: 'conflict' });
        return send(res, 200, { ok: true, reference: next.publicReference, status: 'received' });
      }
      const r = await fetch(BASE + '/rest/v1/edu_shared', { method: 'POST',
        headers: headers({ Prefer: 'return=minimal' }),
        body: JSON.stringify({ id, data: sealRecord(id, record), updated_at: record.createdAt }), signal: AbortSignal.timeout(8000) });
      if (r.status === 409) return send(res, 409, { ok: false, error: 'conflict' });
      if (!r.ok) throw new Error('storage_unavailable');
      return send(res, 200, { ok: true, reference: record.publicReference, status: 'received' });
    }
    if (!['save', 'erase'].includes(body.op)) return send(res, 400, { ok: false, error: 'invalid_operation' });
    if (body.op === 'erase' && (!body.id || body.confirmation !== 'ERASE')) return send(res, 400, { ok: false, error: 'confirmation_required' });
    if (body.id && !ID.test(body.id)) return send(res, 400, { ok: false, error: 'invalid_id' });
    const previous = body.id ? await read(body.id) : null;
    if (body.id && !previous) return send(res, 404, { ok: false, error: 'not_found' });
    if (previous && previous.revision !== body.revision) return send(res, 409, { ok: false, error: 'conflict' });
    if (body.op === 'erase') {
      const r = await fetch(BASE + '/rest/v1/edu_shared?id=eq.' + body.id + '&updated_at=eq.' + encodeURIComponent(previous.revision), {
        method: 'DELETE', headers: headers({ Prefer: 'return=representation' }), signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) throw new Error('storage_unavailable');
      const erased = await r.json();
      if (!Array.isArray(erased) || erased.length !== 1) return send(res, 409, { ok: false, error: 'conflict' });
      return send(res, 200, { ok: true, erased: true });
    }
    const record = sanitizeAdminRecord(body, previous, user);
    const id = previous?.id || recordId(record.contact, record.plan, record.route);
    const stamp = new Date(Math.max(Date.now(), Date.parse(previous?.revision || '') + 1 || 0)).toISOString();
    const r = await fetch(BASE + '/rest/v1/edu_shared' + (previous ? '?id=eq.' + id + '&updated_at=eq.' + encodeURIComponent(previous.revision) : ''), {
      method: previous ? 'PATCH' : 'POST', headers: headers({ Prefer: 'return=representation' }),
      body: JSON.stringify({ ...(previous ? {} : { id }), data: sealRecord(id, record), updated_at: stamp }),
      signal: AbortSignal.timeout(8000),
    });
    if (r.status === 409) return send(res, 409, { ok: false, error: 'conflict' });
    if (!r.ok) throw new Error('storage_unavailable');
    const result = await r.json();
    if (!Array.isArray(result) || result.length !== 1) return send(res, 409, { ok: false, error: 'conflict' });
    return send(res, 200, { ok: true, record: { ...record, id, revision: result[0].updated_at || stamp } });
  } catch (error) {
    const invalid = ['invalid_package', 'invalid_contact', 'consent_required', 'identity_locked', 'invalid_stage', 'verification_required', 'first_purchase_required', 'invalid_amount', 'invalid_date', 'invalid_lesson_count', 'invalid_group_period'];
    return send(res, invalid.includes(error.message) ? 400 : 503, { ok: false, error: invalid.includes(error.message) ? error.message : 'storage_unavailable' });
  }
}
