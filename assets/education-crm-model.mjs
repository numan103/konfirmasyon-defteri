import { EDU_PLANS } from './edu-plans-model.mjs';
export const EDU_STAGES = { interested: 'İlgileniyor', applied: 'Başvurdu', verified: 'Alımı onaylandı', declined: 'Uygun değil', cancelled: 'İptal' };
export const EDU_ROUTES = { cash: 'Eğitim ücreti', breakout: 'Breakout ilk alım', breakout100k: 'Breakout 100K ilk alım' };
export const planName = id => EDU_PLANS.find(p => p.id === id)?.name.tr || id;
export function allowance(record) {
  const plan = EDU_PLANS.find(p => p.id === record.plan);
  return { private: Number.isInteger(record.privateAllowance) ? record.privateAllowance : record.route === 'breakout100k' ? (plan?.upgrade?.privateLessons || 0) : (plan?.privateLessons || 0),
    group: Number.isInteger(record.groupAllowance) ? record.groupAllowance : plan?.groupLessons || 0 };
}
export function groupState(record, today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date())) {
  if (record.stage !== 'verified') return 'unverified';
  if (!record.groupStart || !record.groupEnd) return 'undated';
  if (today < record.groupStart) return 'scheduled';
  if (today >= record.groupEnd) return 'expired';
  return 'active';
}
export function filterEducationRecords(records, filters = {}) {
  const q = String(filters.query || '').trim().toLocaleLowerCase('tr-TR');
  return records.filter(record => (!filters.stage || record.stage === filters.stage) &&
    (!filters.plan || record.plan === filters.plan) && (!filters.route || record.route === filters.route) &&
    (!filters.group || groupState(record) === filters.group) &&
    (!q || [record.name, record.contact, record.note, record.adminNote, record.verification, record.publicReference, record.memberId].join(' ').toLocaleLowerCase('tr-TR').includes(q)));
}
export function educationTotals(records) {
  const verified = records.filter(record => record.stage === 'verified');
  const known = field => verified.filter(record => Number.isFinite(record[field]));
  const amount = field => known(field).length ? Math.round(known(field).reduce((sum, record) => sum + Math.round(record[field] * 100), 0)) / 100 : null;
  return { records: records.length, people: new Set(records.map(record => record.contact)).size,
    applied: records.filter(record => record.stage === 'applied').length,
    interested: records.filter(record => record.stage === 'interested').length, verified: verified.length,
    cash: amount('cashReceivedUsd'), commission: amount('commissionReceivedUsd'),
    cashEntries: known('cashReceivedUsd').length, commissionEntries: known('commissionReceivedUsd').length,
    amountEntries: verified.filter(record => record.cashReceivedUsd !== null || record.commissionReceivedUsd !== null).length,
    privateRemaining: verified.reduce((sum, record) => sum + Math.max(0, allowance(record).private - (Number(record.privateUsed) || 0)), 0),
    groupExpired: verified.filter(record => groupState(record) === 'expired').length,
    byPlan: Object.fromEntries(EDU_PLANS.map(plan => [plan.id, { all: records.filter(r => r.plan === plan.id).length, verified: verified.filter(r => r.plan === plan.id).length }])) };
}
function csvCell(value) {
  let text = String(value ?? '');
  if (/^[\s]*[=+\-@]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
export function educationCSV(records) {
  const columns = ['Ad', 'İletişim', 'Paket', 'Alım yolu', 'Durum', 'Tahsilat USD (girilen)', 'Komisyon USD (girilen)', 'Özel ders hakkı', 'Kullanılan özel ders', 'Grup başlangıcı', 'Grup bitişi (hariç)', 'Başvuru tarihi'];
  return '\uFEFF' + [columns, ...records.map(r => [r.name, r.contact, planName(r.plan), EDU_ROUTES[r.route], EDU_STAGES[r.stage], r.cashReceivedUsd, r.commissionReceivedUsd, allowance(r).private, r.privateUsed, r.groupStart, r.groupEnd, r.createdAt])]
    .map(row => row.map(csvCell).join(',')).join('\r\n');
}
