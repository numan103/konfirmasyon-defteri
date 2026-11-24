// Display-only time zones. Candle timestamps, drawing anchors, sessions and
// replay clocks always remain UTC epoch seconds.
export const CHART_TIME_ZONES = Object.freeze({
  UTC: 'UTC',
  'Europe/Istanbul': 'İstanbul',
  'America/New_York': 'New York',
  'Europe/London': 'Londra',
  'Asia/Tokyo': 'Tokyo'
});
export function normalizeChartTimeZone(value) {
  return typeof value === 'string' && Object.hasOwn(CHART_TIME_ZONES, value) ? value : 'UTC';
}
export const chartTimeZoneKey = owner => 'alfa-chart-timezone:v1:' + (owner || 'guest');
export function readChartTimeZone(owner, storage) {
  try { return normalizeChartTimeZone((storage || globalThis.localStorage)?.getItem(chartTimeZoneKey(owner))); }
  catch { return 'UTC'; }
}
export function writeChartTimeZone(owner, value, storage) {
  try {
    const target = storage || globalThis.localStorage;
    if (!target) return false;
    target.setItem(chartTimeZoneKey(owner), normalizeChartTimeZone(value));
    return true;
  } catch { return false; }
}

function chartDate(time) {
  let date;
  const businessDay = typeof time !== 'number';
  if (!businessDay && Number.isFinite(time)) date = new Date(time * 1000);
  else {
    const day = typeof time === 'string' ? time : time && typeof time === 'object' &&
      Number.isInteger(time.year) && Number.isInteger(time.month) && Number.isInteger(time.day)
      ? `${String(time.year).padStart(4, '0')}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')}` : '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      date = new Date(day + 'T00:00:00Z');
      if (Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) !== day) return null;
    }
  }
  return date && Number.isFinite(date.getTime()) ? { date, businessDay } : null;
}

export function createChartTimeFormatters(value) {
  const timeZone = normalizeChartTimeZone(value);
  const build = zone => ({
    full: new Intl.DateTimeFormat('en-CA', {
      timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }),
    year: new Intl.DateTimeFormat('tr-TR', { timeZone: zone, year: 'numeric' }),
    month: new Intl.DateTimeFormat('tr-TR', { timeZone: zone, month: 'short' }),
    day: new Intl.DateTimeFormat('tr-TR', { timeZone: zone, day: '2-digit' }),
    time: new Intl.DateTimeFormat('tr-TR', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
    seconds: new Intl.DateTimeFormat('tr-TR', { timeZone: zone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
  });
  const zoned = build(timeZone), utc = timeZone === 'UTC' ? zoned : build('UTC');
  return {
    dateTime(time) {
      const entry = chartDate(time);
      if (!entry) return '—';
      // Date-only BusinessDay keys are calendar dates, not midnight instants.
      // Keep their date intact even in a negative-offset display zone.
      if (entry.businessDay) return entry.date.toISOString().slice(0, 10);
      const parts = Object.fromEntries(zoned.full.formatToParts(entry.date).map(p => [p.type, p.value]));
      return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
    },
    tickMark(time, kind = 'time') {
      const entry = chartDate(time);
      if (!entry) return '—';
      const formats = entry.businessDay ? utc : zoned;
      return (Object.hasOwn(formats, kind) && kind !== 'full' ? formats[kind] : formats.time).format(entry.date);
    }
  };
}
