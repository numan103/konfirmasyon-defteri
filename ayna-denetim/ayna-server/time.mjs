export const DEFAULT_TZ = 'Europe/Istanbul';

export function localDate(date = new Date(), tz = DEFAULT_TZ) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function weekday(date = new Date(), tz = DEFAULT_TZ) {
  const w = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(date);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(w);
}

export function addDays(isoDate, n) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function previousMonthRange(isoDate) {
  const [y, m] = isoDate.split('-').map(Number);
  return {
    start: new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10),
    end: new Date(Date.UTC(y, m - 1, 0)).toISOString().slice(0, 10)
  };
}

export function formatTR(value, tz = DEFAULT_TZ) {
  const date = typeof value === 'string' && value.length === 10 ? new Date(value + 'T12:00:00Z') : new Date(value);
  return new Intl.DateTimeFormat('tr-TR', { timeZone: tz, day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

export function isIsoDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
