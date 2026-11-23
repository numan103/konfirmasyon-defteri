// Pure helpers for ALFA CHARTS session boxes (TradingView-style session ranges).
import { sessionWindowTs } from './alfa-session-levels-model.mjs?v=4';

export const SESSION_BOX_DEFS = Object.freeze([
  { id: 'asia', name: 'Asya', icon: '🌏', tz: 'Asia/Tokyo', start: { h: 9, m: 0 }, end: { h: 17, m: 0 }, color: '#f5a623' },
  { id: 'london', name: 'Londra', icon: '🇬🇧', tz: 'Europe/London', start: { h: 8, m: 0 }, end: { h: 16, m: 30 }, color: '#4c8dff' },
  { id: 'ny', name: 'New York', icon: '🗽', tz: 'America/New_York', start: { h: 8, m: 0 }, end: { h: 17, m: 0 }, color: '#26c89c' },
]);

// Returns [{id, name, color, startTs, endTs, high, low}] for the last `days`
// session windows that actually contain bars. Windows are deduplicated by start.
export function computeSessionBoxes(bars, enabled, days = 5) {
  const boxes = [];
  if (!Array.isArray(bars) || !bars.length) return boxes;
  const lastTs = bars[bars.length - 1].time;
  const span = Math.max(1, Math.min(30, Math.floor(days) || 5));
  for (const def of SESSION_BOX_DEFS) {
    if (enabled && enabled[def.id] === false) continue;
    const seen = new Set();
    for (let offset = 0; offset < span; offset++) {
      const anchor = lastTs - offset * 86400;
      let win = sessionWindowTs(anchor, def.tz, def.start, def.end);
      // Before the session opens, the "current" window points at a future day;
      // fall back to the previous day's window instead.
      if (win.startTs > lastTs) win = sessionWindowTs(anchor - 86400, def.tz, def.start, def.end);
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
