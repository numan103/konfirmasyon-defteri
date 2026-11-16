// Pure helpers for ALFA CHARTS Session Levels.
const zoneFormatters = new Map();
export function tzParts(ts, tz) {
  const d = new Date(ts * 1000);
  let fmt = zoneFormatters.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short', hour12: false });
    zoneFormatters.set(tz, fmt);
  }
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
  return barMin >= s || barMin < e;
}

export function sessionWindowTs(ts, tz, start, end) {
  const c = tzParts(ts, tz);
  const sMin = start.h * 60 + start.m;
  const eMin = end.h * 60 + end.m;
  const tzMidnight = tzMidnightTs(c.year, c.month, c.day, tz);
  const startTs = tzMidnight + sMin * 60;
  let endTs = tzMidnight + eMin * 60;
  if (endTs <= startTs) endTs += 86400;
  return { startTs, endTs };
}

function tzMidnightTs(year, month, day, tz) {
  let ts = Date.UTC(year, month - 1, day) / 1000;
  for (let i = 0; i < 48; i++) {
    const p = tzParts(ts, tz);
    if (p.year === year && p.month === month && p.day === day && p.hour === 0 && p.minute === 0) break;
    if (p.day > day) ts -= 3600;
    else if (p.day < day) ts += 3600;
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
    const prevKey = dayKey(prevDate.getTime() / 1000, tz, sh, sm);
    const curBar = firstBarOfPeriod((t) => dayKey(t, tz, sh, sm), curKey);
    const prevBars = bars.filter((b) => dayKey(b.time, tz, sh, sm) === prevKey);
    if (curBar) levels.push({ id: 'DO', label: 'Daily Open', price: curBar.open, kind: 'open', approximate: curBar === bars[0] });
    if (cfg.show?.PDH !== false) {
      const mm = maxMin(prevBars);
      const approx = prevBars.length > 0 && prevBars[0] === bars[0];
      if (mm.high != null) levels.push({ id: 'PDH', label: 'Prev Day High', price: mm.high, kind: 'level', approximate: approx });
      if (mm.low != null) levels.push({ id: 'PDL', label: 'Prev Day Low', price: mm.low, kind: 'level', approximate: approx });
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
    if (curBar) levels.push({ id: 'WO', label: 'Weekly Open', price: curBar.open, kind: 'open', approximate: curBar === bars[0] });
    if (cfg.show?.PWH !== false) {
      const prevWeekTs = lastTs - 7 * 86400;
      const prevKey = weekKey(prevWeekTs, tz, sd, sh, sm);
      const prevBars = bars.filter((b) => weekKey(b.time, tz, sd, sh, sm) === prevKey);
      const mm = maxMin(prevBars);
      const approx = prevBars.length > 0 && prevBars[0] === bars[0];
      if (mm.high != null) levels.push({ id: 'PWH', label: 'Prev Week High', price: mm.high, kind: 'level', approximate: approx });
      if (mm.low != null) levels.push({ id: 'PWL', label: 'Prev Week Low', price: mm.low, kind: 'level', approximate: approx });
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
    if (curBar) levels.push({ id: 'MO', label: 'Monthly Open', price: curBar.open, kind: 'open', approximate: curBar === bars[0] });
    if (cfg.show?.PMH !== false) {
      const c = tzParts(lastTs, tz);
      let pm = c.month - 1, py = c.year;
      if (pm < 1) { pm = 12; py -= 1; }
      const prevKey = `${py}-${String(pm).padStart(2, '0')}`;
      const prevBars = bars.filter((b) => monthKey(b.time, tz, sd, sh, sm) === prevKey);
      const mm = maxMin(prevBars);
      const approx = prevBars.length > 0 && prevBars[0] === bars[0];
      if (mm.high != null) levels.push({ id: 'PMH', label: 'Prev Month High', price: mm.high, kind: 'level', approximate: approx });
      if (mm.low != null) levels.push({ id: 'PML', label: 'Prev Month Low', price: mm.low, kind: 'level', approximate: approx });
    }
  }

  // NY Midnight Open
  if (cfg.show?.NYMO !== false) {
    const tz = 'America/New_York';
    const curKey = dayKey(lastTs, tz, 0, 0);
    const curBar = firstBarOfPeriod((t) => dayKey(t, tz, 0, 0), curKey);
    if (curBar) {
      const tfMinutes = bars.length > 1 ? (bars[1].time - bars[0].time) / 60 : 0;
      levels.push({ id: 'NYMO', label: 'NY Midnight Open', price: curBar.open, kind: 'open', approximate: tfMinutes > 60 || curBar === bars[0] });
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
    const approx = inWindow.length > 0 && inWindow[0] === bars[0];
    if (mm.high != null) levels.push({ id: s.id + '_H', label: s.name + ' High', price: mm.high, kind: 'session', approximate: approx });
    if (mm.low != null) levels.push({ id: s.id + '_L', label: s.name + ' Low', price: mm.low, kind: 'session', approximate: approx });
    const first = inWindow[0];
    if (first) levels.push({ id: s.id + '_O', label: s.name + ' Open', price: first.open, kind: 'session-open', approximate: approx });
  }

  return levels;
}

// Strict replay path: no approximate open or partial prior-period extrema.
// Missing boundary coverage deliberately yields no level.
export function strictSessionLevels(bars, config={}, {clock,step}={}) {
  if(!bars.length || !Number.isFinite(clock) || !(step>0))return [];
  const known=bars.filter(b=>b.time+step<=clock), result=[];
  const byTime=new Map(known.map(b=>[b.time,b]));
  const wall=(y,m,d,h=0,min=0,tz='UTC')=>{
    const wanted=Date.UTC(y,m-1,d,h,min)/1000;
    let candidate=wanted;
    for(let i=0;i<6;i++){
      const p=tzParts(candidate,tz);
      const actual=Date.UTC(p.year,p.month-1,p.day,p.hour%24,p.minute,p.second)/1000;
      if(actual===wanted)return candidate;
      candidate+=wanted-actual;
    }
    return null; // nonexistent/ambiguous wall time not guessed
  };
  const addOpen=(id,t)=>{
    if(config.show?.[id]===false || t==null || !byTime.has(t))return;
    result.push({id,label:id,price:byTime.get(t).open,kind:'open',time:t,approximate:false});
  };
  const extremes=(hi,lo,start,end)=>{
    if(start==null || end==null || start>=end || (end-start)%step!==0)return;
    let high=-Infinity,low=Infinity;
    for(let t=start;t<end;t+=step){
      const b=byTime.get(t); if(!b)return;
      high=Math.max(high,b.high); low=Math.min(low,b.low);
    }
    for(const [id,price] of [[hi,high],[lo,low]])if(config.show?.[id]!==false)
      result.push({id,label:id,price,kind:'level',time:end,approximate:false});
  };
  // Use the last known instant, not the opening timestamp of a future candle.
  const now=clock-1;
  const p=tzParts(now,config.daily?.tz||'UTC');
  let date=new Date(Date.UTC(p.year,p.month-1,p.day));
  const h=config.daily?.startHour||0,min=config.daily?.startMinute||0,tz=config.daily?.tz||'UTC';
  if(p.hour%24*60+p.minute<h*60+min)date.setUTCDate(date.getUTCDate()-1);
  const day=delta=>wall(date.getUTCFullYear(),date.getUTCMonth()+1,date.getUTCDate()+delta,h,min,tz);
  addOpen('DO',day(0));extremes('PDH','PDL',day(-1),day(0));
  const utc=new Date(now*1000);
  const week=new Date(Date.UTC(utc.getUTCFullYear(),utc.getUTCMonth(),utc.getUTCDate()));
  week.setUTCDate(week.getUTCDate()-(week.getUTCDay()+6)%7);
  const wo=week.getTime()/1000;
  addOpen('WO',wo);extremes('PWH','PWL',wo-604800,wo);
  const mo=Date.UTC(utc.getUTCFullYear(),utc.getUTCMonth(),1)/1000;
  addOpen('MO',mo);
  extremes('PMH','PML',Date.UTC(utc.getUTCFullYear(),utc.getUTCMonth()-1,1)/1000,mo);
  const ny=tzParts(now,'America/New_York');
  addOpen('NYMO',wall(ny.year,ny.month,ny.day,0,0,'America/New_York'));
  for(const s of config.sessions||[]) {
    if(s.show===false || config.show?.[s.id]===false)continue;
    const local=tzParts(now,s.tz);
    const date=new Date(Date.UTC(local.year,local.month-1,local.day));
    if(local.hour%24*60+local.minute<s.start.h*60+s.start.m)date.setUTCDate(date.getUTCDate()-1);
    const y=date.getUTCFullYear(),m=date.getUTCMonth()+1,d=date.getUTCDate();
    const start=wall(y,m,d,s.start.h,s.start.m,s.tz);
    const overnight=s.end.h*60+s.end.m<=s.start.h*60+s.start.m;
    const end=wall(y,m,d+(overnight?1:0),s.end.h,s.end.m,s.tz);
    addOpen(s.id+'_O',start);
    const stop=Math.min(end??clock,clock);
    // Only complete base candles, so no final-session H/L is known early.
    extremes(s.id+'_H',s.id+'_L',start,stop);
  }
  return result;
}
