import { calendarEvents, hash, verifiedDate } from './core.mjs';
import { parseBlsCalendarHTML, parseBlsMonthCalendar } from './coverage.mjs';
import { cleanText, listingItems, parseDateValue, readSource } from './research.mjs';

export const FORECAST_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
export const EVENT_TYPES = {
  employment: { title: 'ABD istihdam verisi', metrics: ['payrolls', 'unemployment'] },
  cpi: { title: 'ABD enflasyon verisi', metrics: ['cpi', 'coreCpi'] },
  pce: { title: 'ABD PCE enflasyonu', metrics: ['pce', 'corePce'] },
  gdp: { title: 'ABD büyüme verisi', metrics: ['gdp'] },
};
export const METRICS = {
  payrolls: { label: 'Tarım dışı istihdam değişimi', unit: 'bin kişi', vendor: /^Non-Farm Employment Change$/, series: 'CES0000000001', polarity: 1 },
  unemployment: { label: 'İşsizlik oranı', unit: '%', vendor: /^Unemployment Rate$/, series: 'LNS14000000', polarity: -1 },
  cpi: { label: 'Aylık TÜFE', unit: '%', vendor: /^CPI m\/m$/, series: 'CUSR0000SA0', polarity: 1 },
  coreCpi: { label: 'Aylık çekirdek TÜFE', unit: '%', vendor: /^Core CPI m\/m$/, series: 'CUSR0000SA0L1E', polarity: 1 },
  pce: { label: 'Aylık PCE enflasyonu', unit: '%', vendor: /^PCE Price Index m\/m$/, polarity: 1 },
  corePce: { label: 'Aylık çekirdek PCE', unit: '%', vendor: /^Core PCE Price Index m\/m$/, polarity: 1 },
  gdp: { label: 'Yıllıklandırılmış çeyreklik büyüme', unit: '%', vendor: /^(Advance|Prelim|Final) GDP q\/q$/, polarity: 1 },
};
const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const nyDay = value => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
const previousMonth = at => { const d = new Date(nyDay(at) + 'T12:00:00Z'); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0,7); };
export function eventKind(title) {
  if (/Employment Situation/i.test(title)) return 'employment';
  if (/Consumer Price Index/i.test(title) && !/State|Local/i.test(title)) return 'cpi';
  if (/Personal Income and Outlays/i.test(title)) return 'pce';
  if (/Gross Domestic Product/i.test(title) && !/by State|by County|by Industry|Metropolitan|Territor/i.test(title)) return 'gdp';
  return null;
}
export function canonicalEvent(event, source) {
  const kind = eventKind(event.title);
  if (!kind || source.kind !== 'primary' || !verifiedDate(event.at) || !event.at.includes('T')) return null;
  const host = new URL(source.url).hostname;
  if (!(host === 'www.bls.gov' || host === 'www.bea.gov')) return null;
  if ((kind === 'employment' || kind === 'cpi') !== host.endsWith('bls.gov')) return null;
  return { id: hash([kind, nyDay(event.at)]).slice(0,32), kind, title: EVENT_TYPES[kind].title, officialTitle: event.title, at: event.at, referencePeriod: kind === 'gdp' ? null : previousMonth(event.at), source: { url: source.url, fetchedAt: source.fetchedAt }, verifiedAt: source.fetchedAt, timeSource: 'official' };
}

// Secondary timing is a scheduling aid only. It is used when the official
// authority calendar is unreachable, is labelled in every message, and can
// never override an official time. Actual results are still verified against
// the official release/API before any post-release message exists.
const SECONDARY_TITLES = {
  employment: [/^Non-Farm Employment Change$/, /^Unemployment Rate$/],
  cpi: [/^CPI m\/m$/, /^Core CPI m\/m$/],
  pce: [/^PCE Price Index m\/m$/, /^Core PCE Price Index m\/m$/],
  gdp: [/^(Advance|Prelim|Final) GDP q\/q$/],
};
const SECONDARY_OFFICIAL = { employment: 'Employment Situation', cpi: 'Consumer Price Index', pce: 'Personal Income and Outlays' };
export function parseSecondaryEvents(text, fetchedAt) {
  if (!verifiedDate(fetchedAt) || !fetchedAt.includes('T')) throw new Error('source_calendar_invalid');
  const rows = JSON.parse(text);
  if (!Array.isArray(rows) || rows.length > 2000) throw new Error('source_calendar_invalid');
  const out = new Map();
  for (const row of rows) {
    if (row?.country !== 'USD' || !verifiedDate(row.date) || !String(row.date).includes('T')) continue;
    const at = new Date(row.date).toISOString();
    const vendorTitle = String(row.title || '').trim();
    const kind = Object.keys(SECONDARY_TITLES).find(k => SECONDARY_TITLES[k].some(re => re.test(vendorTitle)));
    if (!kind) continue;
    const officialTitle = kind === 'gdp' ? `Gross Domestic Product (${/^Advance/i.test(vendorTitle) ? 'Advance' : /^Prelim/i.test(vendorTitle) ? 'Second' : 'Third'} Estimate)` : SECONDARY_OFFICIAL[kind];
    const id = hash([kind, nyDay(at)]).slice(0,32);
    const existing = out.get(id);
    if (existing && existing.at !== at) throw new Error('source_calendar_conflict');
    if (existing) continue;
    out.set(id, { id, kind, title: EVENT_TYPES[kind].title, officialTitle, at, referencePeriod: kind === 'gdp' ? null : previousMonth(at), source: { url: FORECAST_URL, fetchedAt, kind: 'secondary_calendar' }, verifiedAt: fetchedAt, timeSource: 'secondary_calendar' });
  }
  return [...out.values()].sort((a, b) => a.at.localeCompare(b.at));
}

// Operational probe: fixed hosts only, status/bytes only. Never accepts a URL
// from the caller and never returns page bodies.
export async function probeCalendar({ signal } = {}) {
  const targets = [
    ['BLS ICS', 'https://www.bls.gov/schedule/news_release/bls.ics'],
    ['BLS month list', 'https://www.bls.gov/schedule/2026/11_sched_list.htm'],
    ['BLS month view', 'https://www.bls.gov/schedule/2026/11_sched.htm'],
    ['BLS release', 'https://www.bls.gov/news.release/empsit.nr0.htm'],
    ['BLS API', 'https://api.bls.gov/publicAPI/v1/timeseries/data/CES0000000001?startyear=2025&endyear=2026'],
    ['BEA ICS', 'https://www.bea.gov/news/schedule/ics/online-calendar-subscription.ics'],
    ['BEA releases', 'https://www.bea.gov/news/current-releases'],
    ['Forex Factory JSON', FORECAST_URL],
    ['Forex Factory page', 'https://www.forexfactory.com/calendar'],
    ['Investing TR', 'https://tr.investing.com/economic-calendar/'],
  ];
  const probe = async ([name, url]) => {
    const started = Date.now();
    try {
      const r = await fetch(url, { redirect: 'manual', signal: AbortSignal.any([signal || AbortSignal.timeout(15000), AbortSignal.timeout(15000)]), headers: { 'User-Agent': 'AlfaMacroAnalist/1.0', Accept: 'text/html,text/plain,text/calendar,application/json' } });
      let bytes = 0;
      if (r.body?.getReader && r.ok) {
        const reader = r.body.getReader();
        try { while (bytes < 65536) { const { done, value } = await reader.read(); if (done) break; bytes += value?.byteLength || 0; } } finally { await reader.cancel().catch(() => {}); }
      }
      return { name, host: new URL(url).hostname, status: r.status, bytes, contentType: r.headers?.get('content-type') || null, redirected: !!(r.status >= 300 && r.status < 400), elapsedMs: Date.now() - started };
    } catch (e) {
      return { name, host: new URL(url).hostname, status: null, error: /abort|timeout/i.test(String(e?.message || e?.name)) ? 'timeout' : 'network_error', elapsedMs: Date.now() - started };
    }
  };
  return Promise.all(targets.map(probe));
}

export async function collectEventAgenda({ now = Date.now(), signal, read = readSource } = {}) {
  const events = [], failures = [], authorities = [];
  // Official times take precedence. If an official calendar is unreachable,
  // the secondary feed may supply a clearly labelled, approximate time.
  await Promise.all(['BLS','BEA'].map(async name => {
    const url = name === 'BLS' ? 'https://www.bls.gov/schedule/news_release/bls.ics' : 'https://www.bea.gov/news/schedule/ics/online-calendar-subscription.ics';
    const consume = (p, html = false, monthView = null) => {
      const source = { kind: 'primary', url: p.url, fetchedAt: p.fetchedAt };
      const found = [0,2,4,6].flatMap(days => monthView ? parseBlsMonthCalendar(p.text,name,now+days*86400000,monthView) : html ? parseBlsCalendarHTML(p.text, name, now + days * 86400000) : calendarEvents(p.text, name, now + days * 86400000));
      for (const e of found) { const c = canonicalEvent(e, source); if (c && Date.parse(c.at) >= now - 86400000 && Date.parse(c.at) <= now + 7 * 86400000) events.push(c); }
      if (!authorities.includes(name)) authorities.push(name);
    };
    try { const p = await read(url, signal); if (!p.text.replace(/^\uFEFF/,'').trimStart().startsWith('BEGIN:VCALENDAR')||!p.text.includes('END:VCALENDAR')) throw new Error('source_calendar_invalid'); consume(p); }
    catch (e) {
      if (name !== 'BLS') { failures.push({ name, error: e.message, status:e.status||null }); return; }
      try {
        const yearMonths = [...new Set([now,now + 7 * 86400000].map(t => new Date(t).toISOString().slice(0,7)))];
        for (const ym of yearMonths) {
          try { consume(await read(`https://www.bls.gov/schedule/${ym.slice(0,4)}/${ym.slice(5)}_sched_list.htm`, signal), true); }
          catch { consume(await read(`https://www.bls.gov/schedule/${ym.slice(0,4)}/${ym.slice(5)}_sched.htm`, signal),false,ym); }
        }
      } catch (error) { const index=authorities.indexOf(name);if(index>=0)authorities.splice(index,1);failures.push({ name, error: error.message, status:error.status||null }); }
    }
  }));
  const unique = new Map();
  for (const e of events) {
    if (unique.has(e.id) && unique.get(e.id).at !== e.at) throw new Error('source_calendar_conflict');
    unique.set(e.id,e);
  }
  const failed = new Set(failures.map(f => f.name));
  const timeConflicts = [];
  let secondaryCount = 0;
  if (failed.has('BLS') || failed.has('BEA')) {
    try {
      const p = await read(FORECAST_URL, signal);
      for (const e of parseSecondaryEvents(p.text, p.fetchedAt)) {
        const authority = e.kind === 'employment' || e.kind === 'cpi' ? 'BLS' : 'BEA';
        if (!failed.has(authority)) continue;
        const existing = unique.get(e.id);
        if (existing) {
          if (Math.abs(Date.parse(existing.at) - Date.parse(e.at)) > 60000) timeConflicts.push({ id: e.id, official: existing.at, secondary: e.at });
          continue;
        }
        if (Date.parse(e.at) <= now || Date.parse(e.at) > now + 7 * 86400000) continue;
        unique.set(e.id, e);
        secondaryCount++;
      }
    } catch (error) { failures.push({ name: 'ForexFactory', error: error.message, status: error.status || null }); }
  }
  return { events: [...unique.values()].sort((a,b) => a.at.localeCompare(b.at)), failures, authorities, timeConflicts, secondaryCount };
}

function vendorNumber(raw, key) {
  const s = String(raw || '').trim();
  const m = s.match(/^(-?\d+(?:\.\d+)?)(K|%)$/);
  if (!m || (key === 'payrolls' ? m[2] !== 'K' : m[2] !== '%')) return null;
  const value = Number(m[1]);
  return Number.isFinite(value) ? value : null;
}
export function parseForecasts(text, event, fetchedAt) {
  if (!verifiedDate(fetchedAt) || !fetchedAt.includes('T') || Date.parse(fetchedAt) >= Date.parse(event.at)) throw new Error('source_forecast_after_release');
  const rows = JSON.parse(text);
  if (!Array.isArray(rows) || rows.length > 2000) throw new Error('source_forecast_invalid');
  const metrics = {};
  for (const key of EVENT_TYPES[event.kind].metrics) {
    const matches = rows.filter(r => r.country === 'USD' && METRICS[key].vendor.test(r.title || '') && verifiedDate(r.date) && r.date.includes('T') && Date.parse(r.date) === Date.parse(event.at));
    if (matches.length > 1) throw new Error('source_forecast_ambiguous');
    const r = matches[0];
    if (!r) continue;
    if (key === 'gdp') {
      const phase = /Advance/i.test(event.officialTitle) ? 'Advance' : /Second/i.test(event.officialTitle) ? 'Prelim' : /Third/i.test(event.officialTitle) ? 'Final' : null;
      if (!phase || !r.title.startsWith(phase)) continue;
    }
    const forecast = vendorNumber(r.forecast, key);
    if (forecast !== null) metrics[key] = { value: forecast, unit: METRICS[key].unit, previousCalendar: vendorNumber(r.previous,key), source: { url: FORECAST_URL, fetchedAt, kind: 'secondary_calendar', title: r.title, rawForecast: r.forecast }, eventAt: event.at, referencePeriod: event.referencePeriod };
  }
  return metrics;
}
export async function collectForecasts(event, { signal, read = readSource } = {}) {
  const p = await read(FORECAST_URL,signal);
  return parseForecasts(p.text,event,p.fetchedAt);
}

export function parseMonthlySeries(text, seriesId, expectedPeriod) {
  const data = JSON.parse(text);
  const series = data?.Results?.series?.find(s => s.seriesID === seriesId);
  if (data.status !== 'REQUEST_SUCCEEDED' || !series) throw new Error('source_release_api_invalid');
  const rows = (series.data || []).filter(r => /^M(?:0[1-9]|1[0-2])$/.test(r.period)).map(r => ({ period: r.year + '-' + r.period.slice(1), value: /^-?\d+(?:\.\d+)?$/.test(r.value || '') ? Number(r.value) : NaN })).sort((a,b) => b.period.localeCompare(a.period));
  if (new Set(rows.map(r=>r.period)).size !== rows.length) throw new Error('source_release_api_invalid');
  // A missing historical month ("-") outside the current comparison is not a reason
  // to reject fresh data, but the current, prior and prior-prior months must be numeric.
  const usable = rows.filter(r => Number.isFinite(r.value));
  if (usable[0]?.period !== expectedPeriod || !usable[1]) throw new Error('source_release_period_unconfirmed');
  const prior = new Date(expectedPeriod + '-01T12:00:00Z'); prior.setUTCMonth(prior.getUTCMonth()-1);
  if (usable[1].period !== prior.toISOString().slice(0,7)) throw new Error('source_release_period_gap');
  if(usable[2]) { prior.setUTCMonth(prior.getUTCMonth()-1); if(usable[2].period!==prior.toISOString().slice(0,7))throw new Error('source_release_period_gap'); }
  return usable;
}
function releasePeriod(body, kind) {
  const title = kind === 'employment' ? 'EMPLOYMENT SITUATION' : 'CONSUMER PRICE INDEX';
  const m = body.match(new RegExp(title + '\\s*[-—–:]+\\s*(' + months.join('|') + ')\\s+(\\d{4})','i'));
  if (!m) throw new Error('source_release_period_unconfirmed');
  return m[2] + '-' + String(months.findIndex(v=>v.toLowerCase()===m[1].toLowerCase())+1).padStart(2,'0');
}
function verifyBlsRelease(body, event) {
  const start = body.toLowerCase().indexOf('embargoed until');
  if (start < 0) throw new Error('source_release_date_unconfirmed');
  const m = body.slice(start,start+700).match(new RegExp('(' + months.join('|') + ')\\s+\\d{1,2},\\s*\\d{4}','i'));
  const day = m && parseDateValue(m[0], Date.parse(event.at));
  if (day !== nyDay(event.at) || releasePeriod(body,event.kind) !== event.referencePeriod) throw new Error('source_release_date_unconfirmed');
}
const round1 = value => Math.round((value + Number.EPSILON) * 10) / 10;
export async function collectActual(event, { now = Date.now(), signal, read = readSource } = {}) {
  if (now < Date.parse(event.at) + 5 * 60000) throw new Error('source_release_not_due');
  if (!['employment','cpi'].includes(event.kind)) return collectBeaActual(event,{now,signal,read});
  const releaseUrl = `https://www.bls.gov/news.release/${event.kind === 'employment' ? 'empsit' : 'cpi'}.nr0.htm`;
  // The release page is preferred, but BLS blocks datacenter IPs on some pages.
  // The official API can still verify the new reference period and values.
  let p = null;
  try { p = await read(releaseUrl,signal); } catch (e) { if (e.status !== 403) throw e; }
  const body = p ? cleanText(p.text) : null;
  if (body) verifyBlsRelease(body,event);
  const metrics = {};
  const sources = body ? [{ url:p.url, fetchedAt:p.fetchedAt, kind:'primary', text:body.slice(0,18000) }] : [];
  await Promise.all(EVENT_TYPES[event.kind].metrics.map(async key => {
    const spec = METRICS[key];
    const y = Number(event.referencePeriod.slice(0,4));
    const api = await read(`https://api.bls.gov/publicAPI/v1/timeseries/data/${spec.series}?startyear=${y-1}&endyear=${y}`,signal);
    const rows = parseMonthlySeries(api.text,spec.series,event.referencePeriod);
    let value, previous;
    if (key === 'payrolls') { value = rows[0].value - rows[1].value; previous = rows[2] ? rows[1].value - rows[2].value : null; }
    else if (key === 'cpi' || key === 'coreCpi') { value = round1((rows[0].value/rows[1].value-1)*100); previous = rows[2] ? round1((rows[1].value/rows[2].value-1)*100) : null; }
    else { value = rows[0].value; previous = rows[1].value; }
    if (!Number.isFinite(value)) throw new Error('source_release_api_invalid');
    metrics[key] = { value, previous, unit:spec.unit, referencePeriod:event.referencePeriod };
    sources.push({url:api.url,fetchedAt:api.fetchedAt,kind:'primary',text:api.text});
  }));
  if (body && event.kind === 'employment') {
    const m = body.match(/nonfarm payroll employment\s+(rose|increased|fell|declined|decreased)\s+by\s+([\d,]+)/i);
    const u = body.match(/unemployment rate[\s\S]{0,100}?(\d+(?:\.\d+)?)\s*percent/i);
    if (!m || !u || (Number(m[2].replace(/,/g,''))/1000 * (/fell|declined|decreased/i.test(m[1]) ? -1 : 1)) !== metrics.payrolls.value || Number(u[1]) !== metrics.unemployment.value) throw new Error('source_release_crosscheck_failed');
  } else if (body) {
    const m = body.match(/(?:CPI-U\)|Consumer Price Index)[\s\S]{0,100}?(rose|increased|fell|declined|decreased)\s+(\d+(?:\.\d+)?)\s*percent[\s\S]{0,100}?seasonally adjusted/i);
    if (!m || Number(m[2]) * (/fell|declined|decreased/i.test(m[1]) ? -1 : 1) !== metrics.cpi.value) throw new Error('source_release_crosscheck_failed');
    const core = body.match(/index for all items less food and energy[\s\S]{0,80}?(rose|increased|fell|declined|decreased)\s+(\d+(?:\.\d+)?)\s*percent/i);
    if (!core || Number(core[2]) * (/fell|declined|decreased/i.test(core[1]) ? -1 : 1) !== metrics.coreCpi.value) throw new Error('source_release_crosscheck_failed');
  }
  return { eventId:event.id, eventAt:event.at, releaseDate:nyDay(event.at), observedAt:sources.map(s=>s.fetchedAt).sort().at(-1), verification:body?'release_and_api':'api_only', metrics, sources };
}

async function collectBeaActual(event,{now,signal,read}) {
  const listing = await read('https://www.bea.gov/news/current-releases',signal);
  const candidates = listingItems(listing.text,'https://www.bea.gov',now).filter(s => eventKind(s.title) === event.kind && s.publishedAt?.slice(0,10) === nyDay(event.at));
  if (candidates.length !== 1) throw new Error('source_release_unconfirmed');
  const p = await read(candidates[0].url,signal);
  const text = cleanText(p.text);
  const metrics = {};
  const value = (m,down) => m ? Number(m[2]) * (down.test(m[1]) ? -1 : 1) : null;
  let period;
  if (event.kind === 'gdp') {
    const phase=/Advance/i.test(event.officialTitle)?/Advance/i:/Second/i.test(event.officialTitle)?/Second/i:/Third/i.test(event.officialTitle)?/Third/i:null;
    if(!phase||!phase.test(candidates[0].title))throw new Error('source_release_phase_unconfirmed');
    const m = text.match(/Real gross domestic product\s*\(GDP\)\s+(increased|decreased)\s+at an annual rate of\s+(\d+(?:\.\d+)?)\s*percent\s+in the\s+(first|second|third|fourth)\s+quarter of\s+(\d{4})/i);
    if (!m) throw new Error('source_release_unconfirmed');
    const d = new Date(event.at), q = Math.floor(d.getUTCMonth()/3), year = q ? d.getUTCFullYear() : d.getUTCFullYear()-1;
    if (Number(m[4]) !== year || ['first','second','third','fourth'].indexOf(m[3].toLowerCase())+1 !== (q || 4)) throw new Error('source_release_period_unconfirmed');
    period = m[4] + '-Q' + (['first','second','third','fourth'].indexOf(m[3].toLowerCase())+1);
    metrics.gdp = {value:value(m,/decreased/i),previous:null,unit:'%',referencePeriod:period};
  } else {
    const header = text.match(new RegExp('Personal Income and Outlays[,\\s]+(' + months.join('|') + ')\\s+(\\d{4})','i'));
    if (!header) throw new Error('source_release_period_unconfirmed');
    period = header[2] + '-' + String(months.findIndex(v=>v.toLowerCase()===header[1].toLowerCase())+1).padStart(2,'0');
    if (period !== event.referencePeriod) throw new Error('source_release_period_unconfirmed');
    const monthlyAt = text.search(/From the preceding month/i);
    if (monthlyAt < 0) throw new Error('source_release_unconfirmed');
    const monthly = text.slice(monthlyAt,monthlyAt+2200);
    const main = monthly.match(/PCE price index\s+(increased|decreased)\s+(\d+(?:\.\d+)?)\s*percent/i);
    const core = monthly.match(/Excluding food and energy,?\s+the PCE price index\s+(increased|decreased)\s+(\d+(?:\.\d+)?)\s*percent/i);
    if (!main || !core) throw new Error('source_release_unconfirmed');
    metrics.pce = {value:value(main,/decreased/i),previous:null,unit:'%',referencePeriod:period};
    metrics.corePce = {value:value(core,/decreased/i),previous:null,unit:'%',referencePeriod:period};
  }
  return {eventId:event.id,eventAt:event.at,releaseDate:nyDay(event.at),observedAt:p.fetchedAt,verification:'release_and_api',metrics,sources:[{url:p.url,fetchedAt:p.fetchedAt,kind:'primary',text:text.slice(0,25000)}]};
}
