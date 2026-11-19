export const REMINDER_DAYS = [0, 1, 3, 7, 14, 30];
export function cleanProgress(raw) {
  const entries = Object.entries(raw?.topics || {});
  if (entries.length > 400) throw new Error('invalid_content');
  const topics = {};
  for (const [id, value] of entries) {
    if (!/^[\w-]{1,80}$/.test(id) || ['__proto__','constructor','prototype'].includes(id) || !value || !Number.isFinite(value.doneAt) || value.doneAt < 0 || value.doneAt > Date.now() + 60000 || !REMINDER_DAYS.includes(value.intervalDays)) throw new Error('invalid_content');
    topics[id] = { doneAt: value.doneAt, intervalDays: value.intervalDays };
  }
  return { topics };
}
export function progressState(value, now = Date.now()) {
  const doneAt = value?.doneAt || 0, days = value?.intervalDays || 0;
  const nextAt = days && doneAt ? doneAt + days * 86400000 : 0;
  return { done: !!doneAt, due: !!days && (!doneAt || nextAt <= now), nextAt };
}
