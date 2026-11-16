// Pure helpers for ALFA CHARTS Session Levels.
export function tzParts(ts, tz) {
  const d = new Date(ts * 1000);
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short', hour12: false });
  const parts = fmt.formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value ?? '';
  return { year: +get('year'), month: +get('month'), day: +get('day'),
    hour: +get('hour'), minute: +get('minute'), second: +get('second'), weekday: get('weekday') };
}

function dayKey(ts, tz, startHour = 0, startMinute = 0) {
  const c = tzParts(ts, tz);
  const barMin = c.hour * 60 + c.minute;
  const startMin = startHour * 60 + startMinute;
  let d = new Date(Date.UTC(c.year, c.month - 1, c.day));
  if (barMin < startMin) d = new Date(d.getTime() - 86400000);
  const c2 = tzParts(d.getTime() / 1000, tz);
  return `${c2.year}-${String(c2.month).padStart(2, '0')}-${String(c2.day).padStart(2, '0')}`;
}

function weekKey(ts, tz, startDay = 1, startHour = 0, startMinute = 0) {
  // startDay: 0=Sun..6=Sat
  const c = tzParts(ts, tz);
  const barMin = c.hour * 60 + c.minute;
  const startMin = startHour * 60 + startMinute;
  let d = new Date(Date.UTC(c.year, c.month - 1, c.day));
  if (barMin < startMin) d = new Date(d.getTime() - 86400000);
  const wd = d.getUTCDay();
  const diff = (wd - startDay + 7) % 7;
  d = new Date(d.getTime() - diff * 86400000);
  return d.toISOString().slice(0, 10);
}

function monthKey(ts, tz, startDay = 1, startHour = 0, startMinute = 0) {
  const c = tzParts(ts, tz);
  const barMin = c.hour * 60 + c.minute;
  const startMin = startHour * 60 + startMinute;
  let y = c.year, m = c.month;
  if (c.day < startDay || (c.day === startDay && barMin < startMin)) {
    m -= 1;
    if (m < 1) { m = 12; y -= 1; }
  }
  return `${y}-${String(m).padStart(2, '0')}`;
}

function inSession(ts, tz, start, end) {
  const c = tzParts(ts, tz);
  const barMin = c.hour * 60 + c.minute;
  const s = start.h * 60 + start.m;
  const e = end.h * 60 + end.m;
  if (s < e) return barMin >= s && barMin < e;
  // overnight
  return barMin >= s || barMin < e;
}

export function sessionWindowTs(ts, tz, start, end) {
  // returns {startTs, endTs} UTC seconds for the session window containing ts
  const c = tzParts(ts, tz);
  const sMin = start.h * 60 + start.m;
  const eMin = end.h * 60 + end.m;
  const dayStart = Date.UTC(c.year, c.month - 1, c.day) / 1000;
  // convert dayStart (UTC midnight) to tz midnight offset
  // We'll compute by searching: find tz midnight for this date
  const tzMidnight = tzMidnightTs(c.year, c.month, c.day, tz);
  const startTs = tzMidnight + sMin * 60;
  let endTs = tzMidnight + eMin * 60;
  if (endTs <= startTs) endTs += 86400;
  return { startTs, endTs };
}

function tzMidnightTs(year, month, day, tz) {
  // Find UTC timestamp whose tz date is year-month-day 00:00
  // Binary-ish: start from UTC midnight of that date and adjust
  let ts = Date.UTC(year, month - 1, day) / 1000;
  // shift until tzParts match
  for (let i = 0; i < 48; i++) {
    const p = tzParts(ts, tz);
    if (p.year === year && p.month === month && p.day === day && p.hour === 0 && p.minute === 0) break;
    // adjust
    if (p.day < day || (p.day === day && (p.hour < 0))) ts -= 3600;
    else if (p.day > day) ts -= 3600;
    else if (p.hour > 0 || p.minute > 0) ts -= (p.hour * 3600 + p.minute * 60);
    else ts += 3600;
  }
  return ts;
}

export function computeSessionLevels(bars, config) {
  const levels = [];
  if (!bars || !bars.length) return levels;
  const cfg = config || {};
  const last = bars[bars.length - 1];
  const lastTs = last.time;

  // helper to find first bar of a period
  function firstBarOfPeriod(keyFn, targetKey) {
    return bars.find((b) => keyFn(b.time) === targetKey);
  }
  function maxMin(barsSubset) {
    let h = -Infinity, l = Infinity;
    for (const b of barsSubset) { h = Math.max(h, b.high); l = Math.min(l, b.low); }
    return { high: h === -Infinity ? null : h, low: l === Infinity ? null : l };
  }

  // Daily Open
  if (cfg.show?.DO !== false) {
    const tz = cfg.daily?.tz || 'UTC';
    const sh = cfg.daily?.startHour ?? 0;
    const sm = cfg.daily?.startMinute ?? 0;
    const curKey = dayKey(lastTs, tz, sh, sm);
    const prevDate = new Date(lastTs * 1000 - 86400000);
    // previous day key
    const prevKey = dayKey(prevDate.getTime() / 1000, tz, sh, sm);
    const curBar = firstBarOfPeriod((t) => dayKey(t, tz, sh, sm), curKey);
    const prevBar = firstBarOfPeriod((t) => dayKey(t, tz, sh, sm), prevKey);
    if (curBar) levels.push({ id: 'DO', label: 'Daily Open', price: curBar.open, kind: 'open' });
    if (cfg.show?.PDH !== false) {
      const prevBars = bars.filter((b) => dayKey(b.time, tz, sh, sm) === prevKey);
      const mm = maxMin(prevBars);
      if (mm.high != null) levels.push({ id: 'PDH', label: 'Prev Day High', price: mm.high, kind: 'level' });
      if (mm.low != null) levels.push({ id: 'PDL', label: 'Prev Day Low', price: mm.low, kind: 'level' });
    }
  }

  // Weekly Open
  if (cfg.show?.WO !== false) {
    const tz = cfg.weekly?.tz || 'UTC';
    const sh = cfg.weekly?.startHour ?? 0;
    const sm = cfg.weekly?.startMinute ?? 0;
    const sd = cfg.weekly?.startDay ?? 1;
    const curKey = weekKey(lastTs, tz, sd, sh, sm);
    const curBar = firstBarOfPeriod((t) => weekKey(t, tz, sd, sh, sm), curKey);
    if (curBar) levels.push({ id: 'WO', label: 'Weekly Open', price: curBar.open, kind: 'open' });
    if (cfg.show?.PWH !== false) {
      // previous week key
      const prevWeekTs = lastTs - 7 * 86400;
      const prevKey = weekKey(prevWeekTs, tz, sd, sh, sm);
      const prevBars = bars.filter((b) => weekKey(b.time, tz, sd, sh, sm) === prevKey);
      const mm = maxMin(prevBars);
      if (mm.high != null) levels.push({ id: 'PWH', label: 'Prev Week High', price: mm.high, kind: 'level' });
      if (mm.low != null) levels.push({ id: 'PWL', label: 'Prev Week Low', price: mm.low, kind: 'level' });
    }
  }

  // Monthly Open
  if (cfg.show?.MO !== false) {
    const tz = cfg.monthly?.tz || 'UTC';
    const sh = cfg.monthly?.startHour ?? 0;
    const sm = cfg.monthly?.startMinute ?? 0;
    const sd = cfg.monthly?.startDay ?? 1;
    const curKey = monthKey(lastTs, tz, sd, sh, sm);
    const curBar = firstBarOfPeriod((t) => monthKey(t, tz, sd, sh, sm), curKey);
    if (curBar) levels.push({ id: 'MO', label: 'Monthly Open', price: curBar.open, kind: 'open' });
    if (cfg.show?.PMH !== false) {
      // previous month
      const c = tzParts(lastTs, tz);
      let pm = c.month - 1, py = c.year;
      if (pm < 1) { pm = 12; py -= 1; }
      const prevKey = `${py}-${String(pm).padStart(2, '0')}`;
      const prevBars = bars.filter((b) => monthKey(b.time, tz, sd, sh, sm) === prevKey);
      const mm = maxMin(prevBars);
      if (mm.high != null) levels.push({ id: 'PMH', label: 'Prev Month High', price: mm.high, kind: 'level' });
      if (mm.low != null) levels.push({ id: 'PML', label: 'Prev Month Low', price: mm.low, kind: 'level' });
    }
  }

  // NY Midnight Open
  if (cfg.show?.NYMO !== false) {
    const tz = 'America/New_York';
    const curKey = dayKey(lastTs, tz, 0, 0);
    const curBar = firstBarOfPeriod((t) => dayKey(t, tz, 0, 0), curKey);
    if (curBar) {
      const tfMinutes = bars.length > 1 ? (bars[1].time - bars[0].time) / 60 : 0;
      levels.push({ id: 'NYMO', label: 'NY Midnight Open', price: curBar.open, kind: 'open', approximate: tfMinutes > 60 });
    }
  }

  // Sessions
  const sessions = cfg.sessions || [
    { id: 'asia', name: 'Asia', tz: 'Asia/Tokyo', start: { h: 9, m: 0 }, end: { h: 17, m: 0 }, show: true },
    { id: 'london', name: 'London', tz: 'Europe/London', start: { h: 8, m: 0 }, end: { h: 16, m: 30 }, show: true },
    { id: 'ny', name: 'New York', tz: 'America/New_York', start: { h: 8, m: 0 }, end: { h: 17, m: 0 }, show: true },
  ];
  for (const s of sessions) {
    if (s.show === false || cfg.show?.[s.id] === false) continue;
    const { startTs, endTs } = sessionWindowTs(lastTs, s.tz, s.start, s.end);
    const inWindow = bars.filter((b) => b.time >= startTs && b.time < endTs);
    const mm = maxMin(inWindow);
    if (mm.high != null) levels.push({ id: s.id + '_H', label: s.name + ' High', price: mm.high, kind: 'session' });
    if (mm.low != null) levels.push({ id: s.id + '_L', label: s.name + ' Low', price: mm.low, kind: 'session' });
    // open of session
    const first = inWindow[0];
    if (first) levels.push({ id: s.id + '_O', label: s.name + ' Open', price: first.open, kind: 'session-open' });
  }

  return levels;
}
