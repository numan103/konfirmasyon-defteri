export function istanbulDay(value = Date.now()) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  return ['year', 'month', 'day'].map(type => parts.find(p => p.type === type).value).join('-');
}
export function todayEvents(items, { now = Date.now(), highOnly = true } = {}) {
  const day = istanbulDay(now), seen = new Set();
  return (Array.isArray(items) ? items : []).flatMap(row => {
    if (!row || typeof row.title !== 'string' || !row.title.trim()) return [];
    // Only explicit offset timestamps can be called TSİ; reject ambiguous dates.
    if (typeof row.date !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/i.test(row.date)) return [];
    const at = Date.parse(row.date);
    if (!Number.isFinite(at) || istanbulDay(at) !== day) return [];
    const impact = String(row.impact || '').toLowerCase();
    if (highOnly && impact !== 'high') return [];
    const key = [row.title, row.country, at].join('|');
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ title: row.title.slice(0, 250), titleTr: typeof row.titleTr === 'string' ? row.titleTr.slice(0, 250) : '',
      country: String(row.country || '').slice(0, 8), at, impact,
      forecast: String(row.forecast ?? '').slice(0, 60), previous: String(row.previous ?? '').slice(0, 60) }];
  }).sort((a, b) => a.at - b.at);
}
export function istanbulTime(at) {
  return new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(at));
}
