// Pure helpers for ALFA CHARTS session boxes (TradingView-style session ranges).
import { tzParts } from './alfa-session-levels-model.mjs?v=4';

export const SESSION_BOX_DEFS = Object.freeze([
  { id: 'asia', name: 'Asya', icon: '🌏', tz: 'Asia/Tokyo', start: { h: 9, m: 0 }, end: { h: 17, m: 0 }, color: '#f5a623' },
  { id: 'london', name: 'Londra', icon: '🇬🇧', tz: 'Europe/London', start: { h: 8, m: 0 }, end: { h: 16, m: 30 }, color: '#4c8dff' },
  { id: 'ny', name: 'New York', icon: '🗽', tz: 'America/New_York', start: { h: 8, m: 0 }, end: { h: 17, m: 0 }, color: '#26c89c' },
]);

// Parses 'HH:MM' into {h, m}; returns null for anything invalid.
export function parseHM(value) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return { h, m: min };
}

function wallTime(year, month, day, hour, minute, tz) {
  const wanted = Date.UTC(year, month - 1, day, hour, minute) / 1000;
  let candidate = wanted;
  for (let i = 0; i < 6; i++) {
    const p = tzParts(candidate, tz);
    const actual = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second) / 1000;
    if (actual === wanted) return candidate;
    candidate += wanted - actual;
  }
  return null;
}
function windowForDate(date, tz, start, end) {
  const startTs = wallTime(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), start.h, start.m, tz);
  const next = new Date(date);
  if (end.h * 60 + end.m <= start.h * 60 + start.m) next.setUTCDate(next.getUTCDate() + 1);
  const endTs = wallTime(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), end.h, end.m, tz);
  return { startTs, endTs };
}
// Resolve both boundaries independently: adding hours to a UTC midnight gives
// incorrect exchange hours on a daylight-saving transition day.
export function sessionBoxWindowTs(ts, tz, start, end) {
  const p = tzParts(ts, tz);
  return windowForDate(new Date(Date.UTC(p.year, p.month - 1, p.day)), tz, start, end);
}

// Returns [{id, name, color, startTs, endTs, high, low}] for the last `days`
// session windows that actually contain bars. Windows are deduplicated by start.
// `utcOverrides` ({asia:{start:'HH:MM',end:'HH:MM'},...}) pins a session to UTC
// hours instead of its exchange-local schedule.
export function computeSessionBoxes(bars, enabled, days = 5, utcOverrides = null) {
  const boxes = [];
  if (!Array.isArray(bars) || !bars.length) return boxes;
  const lastTs = bars[bars.length - 1].time;
  const span = Math.max(1, Math.min(30, Math.floor(days) || 5));
  for (const def of SESSION_BOX_DEFS) {
    if (enabled && enabled[def.id] === false) continue;
    const ov = utcOverrides && utcOverrides[def.id];
    const ovStart = ov && parseHM(ov.start), ovEnd = ov && parseHM(ov.end);
    const pinned = !!(ovStart && ovEnd);
    const tz = pinned ? 'UTC' : def.tz;
    const start = pinned ? ovStart : def.start, end = pinned ? ovEnd : def.end;
    const local = tzParts(lastTs, tz);
    const latestDate = new Date(Date.UTC(local.year, local.month - 1, local.day));
    if (windowForDate(latestDate, tz, start, end).startTs > lastTs) latestDate.setUTCDate(latestDate.getUTCDate() - 1);
    for (let offset = 0; offset < span; offset++) {
      const date = new Date(latestDate); date.setUTCDate(date.getUTCDate() - offset);
      const { startTs, endTs } = windowForDate(date, tz, start, end);
      if (startTs == null || endTs == null) continue;
      let high = -Infinity, low = Infinity, count = 0;
      for (const b of bars) {
        if (b.time >= startTs && b.time < endTs) {
          high = Math.max(high, b.high); low = Math.min(low, b.low); count++;
        }
      }
      if (!count) continue;
      boxes.push({ id: def.id, name: def.name, color: def.color, startTs, endTs, high, low });
    }
  }
  return boxes.sort((a, b) => a.startTs - b.startTs);
}
