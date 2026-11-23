// Pure helpers for ALFA CHARTS session boxes (TradingView-style session ranges).
import { sessionWindowTs } from './alfa-session-levels-model.mjs?v=4';

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
    const seen = new Set();
    for (let offset = 0; offset < span; offset++) {
      const anchor = lastTs - offset * 86400;
      let win = sessionWindowTs(anchor, tz, start, end);
      // Before the session opens, the "current" window points at a future day;
      // fall back to the previous day's window instead.
      if (win.startTs > lastTs) win = sessionWindowTs(anchor - 86400, tz, start, end);
      const { startTs, endTs } = win;
      if (seen.has(startTs)) continue;
      seen.add(startTs);
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
