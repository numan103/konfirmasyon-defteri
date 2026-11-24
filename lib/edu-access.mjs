import { openRecord } from './education-crm.mjs';
import { EDU_PLANS } from '../assets/edu-plans-model.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fssrtlpjqbavzomynwmg.supabase.co';
const sbHeaders = (key) => ({
  apikey: key,
  ...(String(key).startsWith('sb_secret_') ? {} : { Authorization: 'Bearer ' + key }),
  'Content-Type': 'application/json',
});

export const PAID_PLAN_IDS = new Set(EDU_PLANS.map(p => p.id));
export const isPaidItem = v => !!(v && String(v.access || '').toLowerCase() === 'paid');
export function itemPlans(v) {
  const raw = Array.isArray(v && v.plans) ? v.plans.map(x => String(x || '').toLowerCase().slice(0, 20)) : [];
  const list = raw.filter(x => PAID_PLAN_IDS.has(x));
  return list.length ? Array.from(new Set(list)).slice(0, 3) : ['video'];
}

// Onaylanmış CRM kayıtları şifreli tutulur. memberId + stage alanlarına göre
// üyenin hangi paketleri aldığını çıkarır; sırada yalnızca paket kimlikleri döner.
export async function verifiedEduPlans(user) {
  const plans = new Set();
  const key = String(process.env.SUPABASE_SERVICE_ROLE || '').trim();
  if (!user || !user.id || !key) return plans;
  try {
    const headers = sbHeaders(key);
    const url = SUPABASE_URL + '/rest/v1/edu_shared?id=like.' + encodeURIComponent('educrm_%') + '&select=id,data&limit=1000';
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(6000) });
    if (!r.ok) return plans;
    const rows = await r.json();
    if (!Array.isArray(rows)) return plans;
    rows.forEach(row => {
      try {
        const rec = openRecord(row.id, row.data);
        if (rec && rec.memberId === user.id && rec.stage === 'verified' && PAID_PLAN_IDS.has(rec.plan)) plans.add(rec.plan);
      } catch (e) { /* başka kayıt tipi */ }
    });
  } catch (e) { /* CRM okunamadıysa kilitli kalır */ }
  return plans;
}

export function projectChannels(base, viewer) {
  if (!base || !base.traders || typeof base.traders !== 'object') return base;
  const out = JSON.parse(JSON.stringify(base));
  Object.values(out.traders).forEach(t => {
    const canEdit = channelEditor(t, viewer.user);
    if (!canEdit) { delete t.owner; delete t.editors; }
    t.canEdit = canEdit;
    const secs = (t && t.sections) || {};
    Object.keys(secs).forEach(sid => {
      (Array.isArray(secs[sid]) ? secs[sid] : []).forEach(topic => {
        (Array.isArray(topic && topic.videos) ? topic.videos : []).forEach(v => {
          if (!isPaidItem(v)) return;
          if (viewer.privileged || canEdit) { v.locked = false; return; }
          const plans = itemPlans(v);
          if (plans.some(p => viewer.plans.has(p))) { v.locked = false; return; }
          v.url = ''; v.body = ''; v.photos = []; v.vids = [];
          v.tricks = '';
          v.locked = true; v.plans = plans;
        });
      });
    });
  });
  return out;
}

export function channelEditor(channel, user) {
  if (!user) return false;
  const email = String(user.email || '').toLowerCase();
  return !!(user.admin || (email && (String(channel?.owner || '').toLowerCase() === email ||
    (Array.isArray(channel?.editors) && channel.editors.some(value => String(value).toLowerCase() === email)))));
}
