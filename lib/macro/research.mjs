import { calendarEvents, dayKey, parseJSON, publicUrl, verifiedDate } from './core.mjs';
import { collectCoverage, parseBlsCalendarHTML, parseCSV } from './coverage.mjs';

const GROQ = 'https://api.groq.com/openai/v1/chat/completions';
export const macroModel = () => process.env.MACRO_MODEL || 'openai/gpt-oss-120b';
export async function modelAvailability() {
  if (!process.env.GROQ_API_KEY) throw new Error('missing_GROQ_API_KEY');
  const r = await fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: 'Bearer ' + process.env.GROQ_API_KEY }, signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(r.status === 401 ? 'model_credentials_rejected' : 'model_unavailable');
  const data = await r.json();
  return { name: macroModel(), available: (data.data || []).some(m => m.id === macroModel()) };
}
export async function groq(messages, { search = false, signal, tokens = 3000, schema, format = 'json' } = {}) {
  if (!['json', 'text'].includes(format) || (format === 'text' && (schema || search))) throw new Error('model_invalid_format');
  if (!process.env.GROQ_API_KEY) throw new Error('missing_GROQ_API_KEY');
  const r = await fetch(GROQ, {
    method: 'POST', headers: { Authorization: 'Bearer ' + process.env.GROQ_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: macroModel(), messages, temperature: search ? 1 : .2, top_p: 1, reasoning_effort: 'low', max_completion_tokens: tokens,
      ...(search ? { tools: [{ type: 'browser_search' }], tool_choice: 'required' } : format === 'text' ? {} : { response_format: schema ? { type: 'json_schema', json_schema: { name: 'alfa_macro_report', strict: true, schema } } : { type: 'json_object' } }) }),
    signal: signal || AbortSignal.timeout(25000),
  });
  if (!r.ok) {
    const body = await r.json().catch(() => null);
    const error = new Error(r.status === 401 ? 'model_credentials_rejected' : r.status === 429 ? 'provider_rate_limited' : body?.error?.code === 'json_validate_failed' ? 'model_invalid_json' : search ? 'web_search_unavailable' : 'model_unavailable');
    error.provider = { status: r.status, type: body?.error?.type || null, code: body?.error?.code || null };
    if (schema && body?.error?.code === 'json_validate_failed') {
      const failed = body.error.failed_generation;
      error.provider.failedCharacters = typeof failed === 'string' ? failed.length : null;
      try {
        const parsed = parseJSON(failed);
        error.provider.failedKeys = parsed && typeof parsed === 'object' ? Object.keys(parsed).slice(0, 12) : [];
        // Keep a bounded, parsed candidate only for private diagnostic replay. A provider
        // rejection is still an error; this candidate never becomes a ready report here.
        if (typeof failed === 'string' && failed.length <= 64000 && parsed && typeof parsed === 'object' && !Array.isArray(parsed)) error.rejectedDraft = parsed;
      } catch { error.provider.failedJSON = false; }
    }
    throw error;
  }
  const d = await r.json();
  if (d.choices?.[0]?.finish_reason === 'length') throw new Error('model_truncated');
  const content = d.choices?.[0]?.message?.content;
  if (format === 'text') {
    if (typeof content !== 'string' || !content.trim() || content.length > 24000) throw new Error('model_invalid_prose');
    return content;
  }
  return parseJSON(content);
}

export async function readSource(url, signal, fetcher = fetch) {
  let next = publicUrl(url);
  if (!next) throw new Error('source_not_allowed');
  for (let hop = 0; hop < 3; hop++) {
    const r = await fetcher(next, { redirect: 'manual', signal: AbortSignal.any([signal || AbortSignal.timeout(12000), AbortSignal.timeout(12000)]), headers: { 'User-Agent': 'AlfaMacroAnalist/1.0', Accept: 'text/html,text/plain,text/calendar,text/csv,application/xml,application/rss+xml,application/atom+xml,application/json' } });
    if (r.status >= 300 && r.status < 400) {
      next = publicUrl(new URL(r.headers.get('location'), next).href);
      if (!next) throw new Error('source_redirect_not_allowed');
      continue;
    }
    if (!r.ok) { const error = new Error('source_unavailable'); error.status = r.status; throw error; }
    const mime = r.headers?.get('content-type') || '';
    if (mime && !/text\/|application\/(?:xml|json|csv|rss\+xml|atom\+xml)/i.test(mime)) throw new Error('source_type_unsupported');
    let text = '';
    if (r.body?.getReader) {
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let bytes = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.length;
          if (bytes > 300000) throw new Error('source_too_large');
          text += decoder.decode(value, { stream: true });
        }
      } finally { await reader.cancel().catch(() => {}); }
    } else { text = await r.text(); if (text.length > 300000) throw new Error('source_too_large'); }
    return { url: next, text, fetchedAt: new Date().toISOString() };
  }
  throw new Error('source_redirect_limit');
}
export const cleanText = html => String(html).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, ' ').trim();
const MONTHS = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
export const normalizeText = value => String(value || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const MONTH_RE = Object.keys(MONTHS).join('|');
const DAY = n => String(n).padStart(2, '0');

// A publication date is only useful if it actually parses and is not in the future.
export function parseDateValue(value, now = Date.now()) {
  const v = String(value || '').trim();
  let iso = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) iso = verifiedDate(v);
  else if (/^\d{4}-\d{2}-\d{2}T/.test(v)) iso = verifiedDate(v) || verifiedDate(v.slice(0, 10));
  else {
    let m = v.match(new RegExp('^(' + MONTH_RE + ')\\s+(\\d{1,2}),?\\s+(\\d{4})$', 'i'));
    let day = null;
    if (m) day = `${m[3]}-${DAY(MONTHS[m[1].toLowerCase()])}-${DAY(m[2])}`;
    else {
      m = v.match(new RegExp('^(\\d{1,2})\\s+(' + MONTH_RE + ')\\s+(\\d{4})$', 'i'));
      if (m) day = `${m[3]}-${DAY(MONTHS[m[2].toLowerCase()])}-${DAY(m[1])}`;
      else {
        const t = Date.parse(v);
        if (Number.isFinite(t)) day = new Date(t).toISOString().slice(0, 10);
      }
    }
    iso = day ? verifiedDate(day) : null;
  }
  if (!iso) return null;
  const at = Date.parse(iso.includes('T') ? iso : iso + 'T00:00:00Z');
  return at <= now ? iso : null;
}

function visibleDates(text, now) {
  const re = new RegExp(`(?:${MONTH_RE})\\s+\\d{1,2},\\s+\\d{4}|\\d{1,2}\\s+(?:${MONTH_RE})\\s+\\d{4}|\\d{4}-\\d{2}-\\d{2}`, 'gi');
  return [...String(text).matchAll(re)].map(m => parseDateValue(m[0], now)).filter(Boolean);
}
function latest(values) {
  return values.slice().sort((a, b) => Date.parse(b) - Date.parse(a))[0] || null;
}
// Keep visible <time datetime="..."> markers so a date can be tied to the quoted sentence.
function timeTokens(html) {
  const marked = String(html).replace(/<time\b[^>]*\bdatetime\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>/gi, (m, a, b, c) => ` [[T:${a || b || c}]] `);
  const cleaned = cleanText(marked);
  const tokens = [];
  for (const m of cleaned.matchAll(/\[\[T:([^\]]+)\]\]/g)) {
    const before = cleaned.slice(0, m.index).replace(/\[\[T:[^\]]+\]\]/g, ' ');
    tokens.push({ value: m[1], index: normalizeText(before).length });
  }
  return { text: cleaned.replace(/\[\[T:[^\]]+\]\]/g, ' '), tokens };
}
function findEvidence(bodyNorm, evidenceNorm) {
  if (!evidenceNorm || evidenceNorm.length < 20) return -1;
  let at = bodyNorm.indexOf(evidenceNorm);
  if (at >= 0) return at;
  at = bodyNorm.indexOf(evidenceNorm.slice(0, 100));
  if (at >= 0) return at;
  const words = evidenceNorm.split(' ').filter(Boolean);
  for (let i = 0; i + 10 <= words.length && i < 40; i += 2) {
    at = bodyNorm.indexOf(words.slice(i, i + 10).join(' '));
    if (at >= 0) return at;
  }
  return -1;
}
export function sourceDate(html, evidence = '', now = Date.now()) {
  for (const tag of html.match(/<meta\b[^>]+>/gi) || []) {
    if (!/(?:article:published_time|datepublished|pubdate|date\.issued|publish|modified|dc\.date|citation_publication_date)/i.test(tag)) continue;
    const value = tag.match(/content=["']([^"']+)["']/i)?.[1];
    const parsed = parseDateValue(value, now);
    if (parsed) return parsed;
  }
  const json = html.match(/["']datePublished["']\s*:\s*["']([^"']+)["']/i)?.[1];
  const fromJson = parseDateValue(json, now);
  if (fromJson) return fromJson;
  const { text, tokens } = timeTokens(html);
  const evidenceNorm = normalizeText(evidence);
  const at = findEvidence(normalizeText(text), evidenceNorm);
  if (tokens.length && at >= 0) {
    const nearest = tokens.slice().sort((a, b) => Math.abs(a.index - at) - Math.abs(b.index - at))[0];
    const parsed = parseDateValue(nearest.value, now);
    if (parsed) return parsed;
  }
  if (at >= 0) {
    const window = text.slice(Math.max(0, at - 600), at + 600);
    const near = latest(visibleDates(window, now));
    if (near) return near;
  }
  const first = latest(visibleDates(text.slice(0, 3000), now));
  if (first) return first;
  for (const token of tokens) {
    const parsed = parseDateValue(token.value, now);
    if (parsed) return parsed;
  }
  return null;
}

// Deterministic discovery: official feeds, official listings and official market data.
// A model is never asked to invent URLs, so a bad model response cannot fabricate a source.
const FEEDS = [
  { name: 'Fed', url: 'https://www.federalreserve.gov/feeds/press_all.xml', limit: 5 },
  { name: 'SEC', url: 'https://www.sec.gov/news/pressreleases.rss', limit: 5 },
  { name: 'BLS', url: 'https://www.bls.gov/feed/bls_latest.rss', limit: 2 },
];
const LISTINGS = [
  { name: 'BEA', url: 'https://www.bea.gov/news/current-releases', base: 'https://www.bea.gov', limit: 5 },
  { name: 'Treasury', url: 'https://home.treasury.gov/news/press-releases', base: 'https://home.treasury.gov', limit: 5 },
];
const MONTH = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' });

function rfcDate(value, now) {
  const at = Date.parse(value);
  return Number.isFinite(at) && at <= now ? new Date(at).toISOString() : null;
}
export function xmlItems(xml, now = Date.now()) {
  const tag = (block, name) => {
    const m = block.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'));
    return m ? cleanText(m[1].replace(/<!\[CDATA\[|\]\]>/g, '')).trim() : '';
  };
  return (xml.match(/<item\b[\s\S]*?<\/item>/gi) || []).map(block => ({
    title: tag(block, 'title'), link: tag(block, 'link'), description: tag(block, 'description'), publishedAt: rfcDate(tag(block, 'pubDate'), now),
  }));
}
function anchor(segment, base) {
  const link = segment.match(/<a\b[^>]*href\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/i);
  if (!link) return null;
  const title = cleanText(link[4]);
  if (title.length < 12) return null;
  try { return { url: publicUrl(new URL(link[1] || link[2] || link[3], base).href), title: title.slice(0, 180) }; } catch { return null; }
}
export function listingItems(html, base, now, limit = 10) {
  const out = [];
  const re = /<time\b[^>]*datetime\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>/gi;
  let m;
  while ((m = re.exec(html)) && out.length < limit) {
    const publishedAt = parseDateValue(m[1] || m[2] || m[3], now);
    if (!publishedAt) continue;
    let chosen = null;
    // Table listings (BEA) put the release link before the date in the same row.
    const rowStart = html.lastIndexOf('<tr', m.index);
    const rowEnd = html.indexOf('</tr>', m.index);
    if (rowStart >= 0 && rowEnd > m.index) chosen = anchor(html.slice(rowStart, rowEnd), base);
    // Card/list listings (Treasury) put the headline link after the date.
    if (!chosen) {
      const close = html.indexOf('</div>', m.index);
      chosen = anchor(html.slice(m.index, close > m.index ? close : m.index + 900), base);
    }
    if (!chosen || !chosen.url) continue;
    out.push({ url: chosen.url, title: chosen.title, text: chosen.title, publishedAt, kind: 'primary' });
  }
  return out;
}
async function articleBody(url, title, signal) {
  const page = await readSource(url, signal);
  // Drop <head> so a headline match cannot land in <title>/<meta> instead of the article body.
  const body = page.text.replace(/<head\b[^>]*>[\s\S]*?<\/head>/i, ' ');
  const needle = String(title || '').toLowerCase().replace(/\s+/g, ' ').trim();
  // Prefer the longest <article>/<main> section that actually contains the headline.
  let text = '';
  if (needle.length >= 12) {
    const sections = [];
    for (const tag of ['article', 'main']) {
      for (const match of body.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi'))) sections.push(cleanText(match[1]));
    }
    const titled = sections.filter(section => section.toLowerCase().includes(needle)).sort((a, b) => b.length - a.length);
    if (titled.length) text = titled[0];
  }
  if (text.length < 200) text = cleanText(body);
  if (text.length < 200) throw new Error('source_empty');
  const hay = text.toLowerCase();
  // Prefer the last full-title occurrence: earlier ones are usually breadcrumbs or menu labels.
  let at = needle.length >= 12 ? hay.lastIndexOf(needle) : -1;
  if (at < 0) at = hay.indexOf(needle.slice(0, 40));
  if (at < 0) {
    const words = needle.split(' ').filter(Boolean);
    for (let i = 0; i + 6 <= words.length; i += 2) {
      at = hay.indexOf(words.slice(i, i + 6).join(' '));
      if (at >= 0) break;
    }
  }
  if (at < 0) throw new Error('source_title_mismatch');
  return { text: text.slice(Math.max(0, at - 100), at + 2400), url: page.url, fetchedAt: page.fetchedAt };
}
async function feedCandidates(feed, now, signal) {
  const page = await readSource(feed.url, signal);
  const items = xmlItems(page.text, now)
    .map(item => ({ ...item, publishedAt: item.publishedAt || sourceDate(page.text, item.title, now) }))
    .filter(item => item.title && item.link)
    .sort((a, b) => (Date.parse(b.publishedAt || 0) || 0) - (Date.parse(a.publishedAt || 0) || 0))
    .slice(0, feed.limit);
  return items.map(item => ({
    url: publicUrl(item.link) || feed.url,
    title: item.title.slice(0, 180),
    text: [item.title, item.description].filter(Boolean).join('. ').slice(0, 1600),
    publishedAt: item.publishedAt,
    kind: 'primary',
    fetchedAt: page.fetchedAt,
    feedName: feed.name,
  }));
}
async function listingCandidates(listing, now, signal) {
  const page = await readSource(listing.url, signal);
  return listingItems(page.text, listing.base, now, listing.limit).map(item => ({ ...item, fetchedAt: page.fetchedAt, feedName: listing.name }));
}

export function csvHead(text) {
  const lines = String(text).trim().split(/\r?\n/).filter(Boolean);
  const split = line => line.split(',').map(cell => cell.replace(/^"|"$/g, '').trim());
  return { header: split(lines[0] || ''), row: split(lines[1] || '') };
}
function csvLast(text) {
  const lines = String(text).trim().split(/\r?\n/).filter(Boolean);
  const split = line => line.split(',').map(cell => cell.replace(/^"|"$/g, '').trim());
  return { header: split(lines[0] || ''), row: split(lines[lines.length - 1] || '') };
}
export const usDate = value => { const m = String(value || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? `${m[3]}-${m[1]}-${m[2]}` : null; };
const valueOf = (header, row, name) => {
  const at = header.findIndex(h => h.toLowerCase() === name.toLowerCase());
  return at >= 0 ? row[at] || null : null;
};

export function yieldComparison(text, now = Date.now()) {
  const rows = parseCSV(text);
  const header = rows[0] || [];
  const point = row => {
    const day = verifiedDate(usDate(row?.[0]));
    const raw = valueOf(header, row || [], '10 YR');
    if (!day || Date.parse(day) > now || !/^-?\d+(?:\.\d+)?$/.test(raw || '') || !Number.isFinite(Number(raw))) throw new Error('source_yield_comparison_invalid');
    return { day, raw, value: Number(raw) };
  };
  const current = point(rows[1]);
  if (!rows[2]) return null;
  const previous = point(rows[2]);
  if (previous.day >= current.day) throw new Error('source_yield_order_changed');
  return { previousObservedAt: previous.day, currentTenYearValue: current.raw, previousTenYearValue: previous.raw, comparisonDirection: current.value > previous.value ? 'increase' : current.value < previous.value ? 'decrease' : 'unchanged' };
}

async function marketSources(now, signal) {
  const year=new Date(now).getUTCFullYear();
  const failures = [];
  const once = async fn => {
    try { return await fn(); } catch (e) {
      if (/abort|timeout/i.test(String(e?.message || e?.name))) {
        await new Promise(resolve => setTimeout(resolve, 300));
        return fn();
      }
      throw e;
    }
  };
  const make = async (fn) => { try { return await once(fn); } catch (e) { failures.push(e.message); return null; } };
  const real = await make(async () => {
    const p = await readSource(`https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${year}/all?type=daily_treasury_real_yield_curve&field_tdr_date_value=${year}&page&_format=csv`, signal);
    const { header, row } = csvHead(p.text);
    const day = usDate(row[0]);
    const keys = ['5 YR', '7 YR', '10 YR', '20 YR', '30 YR'];
    const values = keys.map(k => valueOf(header, row, k));
    if (!day || values.some(v => !v || !/^-?\d+(?:\.\d+)?$/.test(v))) throw new Error('market_unparsed');
    const cells = keys.map((k, i) => `${k} %${values[i]}`).join(', ');
    const comparison = yieldComparison(p.text, now);
    return { url: p.url, title: 'ABD Hazine günlük reel getiri eğrisi', kind: 'primary', publishedAt: verifiedDate(day), observedAt: verifiedDate(day), fetchedAt: p.fetchedAt,
      instrument: 'real_yield', ...(comparison || {}), comparisonText: comparison ? 'Ardışık Hazine kesitlerindeki on yıllık reel getiri kıyaslaması: ' + ({ increase: 'artış', decrease: 'düşüş', unchanged: 'değişim yok' }[comparison.comparisonDirection]) + '; gerçekleşmiş fiyat tepkisi veya enflasyon beklentisi değildir.' : null,
      text: `ABD Hazine günlük reel (TIPS) getiri eğrisi, ${day} itibarıyla: ${cells}. Reel getiriler nominal değildir.` + (comparison ? ` Önceki yayımlı gözlem ${comparison.previousObservedAt}, 10 YR %${comparison.previousTenYearValue}.` : '') };
  });
  const nominal = await make(async () => {
    const p = await readSource(`https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${year}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${year}&page&_format=csv`, signal);
    const { header, row } = csvHead(p.text);
    const day = usDate(row[0]);
    const keys = ['2 YR', '5 YR', '10 YR', '30 YR'];
    const values = keys.map(k => valueOf(header, row, k));
    if (!day || values.some(v => !v || !/^-?\d+(?:\.\d+)?$/.test(v))) throw new Error('market_unparsed');
    const cells = keys.map((k, i) => `${k} %${values[i]}`).join(', ');
    const comparison = yieldComparison(p.text, now);
    return { url: p.url, title: 'ABD Hazine günlük nominal getiri eğrisi', kind: 'primary', publishedAt: verifiedDate(day), observedAt: verifiedDate(day), fetchedAt: p.fetchedAt,
      instrument: 'nominal_yield', ...(comparison || {}), comparisonText: comparison ? 'Ardışık Hazine kesitlerindeki on yıllık nominal getiri kıyaslaması: ' + ({ increase: 'artış', decrease: 'düşüş', unchanged: 'değişim yok' }[comparison.comparisonDirection]) + '; reel getiri veya gerçekleşmiş fiyat tepkisi değildir.' : null,
      text: `ABD Hazine günlük nominal getiri eğrisi, ${day} itibarıyla: ${cells}.` + (comparison ? ` Önceki yayımlı gözlem ${comparison.previousObservedAt}, 10 YR %${comparison.previousTenYearValue}.` : '') };
  });
  const dollar = await make(async () => {
    const p = await readSource('https://fred.stlouisfed.org/graph/fredgraph.csv?id=DTWEXBGS&cosd=2026-09-01', signal);
    const { header, row } = csvLast(p.text);
    const day = verifiedDate(row[0]);
    const value = valueOf(header, row, 'DTWEXBGS');
    if (!day || !value) throw new Error('market_unparsed');
    return { url: p.url, title: 'Geniş dolar endeksi DTWEXBGS (DXY değil)', kind: 'primary', publishedAt: day, observedAt: day, fetchedAt: p.fetchedAt,
      text: `Geniş dolar endeksi DTWEXBGS, ${day}: ${value}. DXY değil, Fed'in geniş ağırlıklı dolar endeksidir.` };
  });
  const btc = await make(async () => {
    const p = await readSource('https://api.coinbase.com/v2/prices/BTC-USD/spot', signal);
    const amount = JSON.parse(p.text)?.data?.amount;
    if (!amount) throw new Error('market_unparsed');
    return { url: p.url, title: 'Coinbase BTC-USD spot fiyatı', kind: 'market', publishedAt: p.fetchedAt, observedAt: p.fetchedAt, fetchedAt: p.fetchedAt,
      text: `BTC-USD spot fiyatı, Coinbase, ${p.fetchedAt}: ${amount} USD. Tek borsa kotasyonudur, konsolide endeks değildir.` };
  });
  const gold = await make(async () => {
    const p = await readSource('https://api.gold-api.com/price/XAU', signal);
    const data = JSON.parse(p.text);
    if (!data?.price) throw new Error('market_unparsed');
    const at = rfcDate(data.updatedAt, now) || p.fetchedAt;
    return { url: p.url, title: 'XAUUSD spot fiyatı (gold-api.com)', kind: 'market', publishedAt: at, observedAt: at, fetchedAt: p.fetchedAt,
      text: `XAUUSD spot fiyatı, gold-api.com üçüncü taraf toplayıcı, ${at}: ${data.price} USD. Borsa düzeyinde resmi spot kotasyon değildir.` };
  });
  const bls = await Promise.all([
    ['CUUR0000SA0', 'TÜFE (CPI-U) endeksi'],
    ['LNS14000000', 'İşsizlik oranı'],
    ['CES0000000001', 'Tarım dışı istihdam'],
  ].map(([id, label]) => make(async () => {
    const p = await readSource(`https://api.bls.gov/publicAPI/v1/timeseries/data/${id}?startyear=${year-1}&endyear=${year}`, signal);
    const data = JSON.parse(p.text);
    const rows = data?.Results?.series?.[0]?.data?.filter(row => /^M(?:0[1-9]|1[0-2])$/.test(row.period)).slice(0, 2) || [];
    if (data?.status !== 'REQUEST_SUCCEEDED' || data.Results?.series?.[0]?.seriesID !== id || rows.length < 2) throw new Error('market_unparsed');
    const [cur, prev] = rows;
    const at = verifiedDate(`${cur.year}-${cur.period.slice(1)}-01`);
    if (!at || Date.parse(at) > now) throw new Error('market_unparsed');
    const delta = Number(cur.value) - Number(prev.value);
    if (!Number.isFinite(delta)) throw new Error('market_unparsed');
    const common = `${cur.periodName} ${cur.year}: ${cur.value}; ${prev.periodName} ${prev.year}: ${prev.value}`;
    let text = `BLS API ${label} (${id}), ${common}.`;
    if (id === 'CUUR0000SA0') {
      const change = (Number(cur.value) / Number(prev.value) - 1) * 100;
      if (!Number.isFinite(change)) throw new Error('market_unparsed');
      text = `BLS API ${label} (${id}, mevsimsel düzeltilmemiş), ${common}; hesaplanan aylık değişim: %${change.toFixed(2)}.`;
    } else if (id === 'CES0000000001') {
      const diff = Number(cur.value) - Number(prev.value);
      if (!Number.isFinite(diff)) throw new Error('market_unparsed');
      const prelim = (cur.footnotes || []).some(f => f.code === 'P') ? ' Öncü veri.' : '';
      text = `BLS API ${label} (${id}, bin kişi), ${common}; hesaplanan aylık değişim: ${diff > 0 ? '+' : ''}${diff} bin.${prelim}`;
    } else {
      text = `BLS API ${label} (${id}), ${common}.`;
    }
    // The first day of a reference month is not the publication timestamp.
    return { url: p.url, title: `BLS API ${label}`, kind: 'primary', topic: id === 'CUUR0000SA0' ? 'inflation' : 'employment', publishedAt: null, referencePeriod: `${cur.year}-${cur.period.slice(1)}`,
      seriesId:id,currentValue:cur.value,previousValue:prev.value,previousPeriod:`${prev.year}-${prev.period.slice(1)}`,
      comparisonText: 'API değerlerinden hesaplanan önceki ay kıyaslaması: ' + (delta > 0 ? 'artış' : delta < 0 ? 'düşüş' : 'değişim yok') + '; piyasa beklentisi veya fiyat tepkisi değildir.', fetchedAt: p.fetchedAt, text };
  })));
  return { sources: [real, nominal, dollar, btc, gold, ...bls].filter(Boolean), failures };
}

const MACRO_KEYS = ['inflation', 'consumer price', 'cpi', 'pce', 'employment', 'payroll', 'unemployment', 'jobs', 'gdp', 'interest rate', 'federal funds', 'monetary policy', 'yield', 'refunding', 'deficit', 'debt', 'bitcoin', 'crypto', 'digital asset', 'stablecoin', 'tariff', 'dollar', 'trade balance', 'retail sales', 'housing', 'oil', 'energy', 'election', 'regulation', 'securities'];
function relevance(item) {
  const text = String((item.title || '') + ' ' + (item.text || '')).slice(0, 1200).toLowerCase();
  return MACRO_KEYS.reduce((score, key) => score + (text.includes(key) ? 1 : 0), 0);
}

export async function research({ now = Date.now(), signal } = {}) {
  const stats = { feeds: 0, listings: 0, candidates: 0, fetched: 0, dated: 0, fresh: 0, market: 0, rejected: {}, attempts: [] };
  const reject = (stage, e) => {
    const key = String(e?.message || 'source_error');
    stats.rejected[key] = (stats.rejected[key] || 0) + 1;
    stats.attempts.push({ stage, host: e?.host || null, error: key, status: e?.status || null });
  };
  const safe = async (stage, label, fn) => {
    try { return await fn(); } catch (e) { e.host = label; reject(stage, e); return null; }
  };

  const [feedBatches, listingBatches, market, coverage] = await Promise.all([
    Promise.all(FEEDS.map(feed => safe('feed', feed.name, () => feedCandidates(feed, now, signal)))),
    Promise.all(LISTINGS.map(listing => safe('listing', listing.name, () => listingCandidates(listing, now, signal)))),
    safe('market', 'market_data', () => marketSources(now, signal)),
    collectCoverage({ now, signal, readSource }),
  ]);
  const raw = [];
  for (const batch of feedBatches) if (batch) { stats.feeds++; raw.push(...batch); }
  for (const batch of listingBatches) if (batch) { stats.listings++; raw.push(...batch); }
  stats.candidates = raw.length;
  stats.market = market?.sources.length || 0;

  // Enrich only the freshest headlines with the article body. A feed/listing date is authoritative,
  // so a failed article fetch still leaves a dated, quotable official source.
  const ordered = raw
    .filter(item => publicUrl(item.url))
    .sort((a, b) => (Date.parse(b.publishedAt || 0) || 0) - (Date.parse(a.publishedAt || 0) || 0))
    .slice(0, 18);
  const enriched = await Promise.allSettled(ordered.map(async item => {
    const body = await articleBody(item.url, item.title, signal);
    return { ...item, url: body.url, text: body.text.slice(0, 1600), fetchedAt: body.fetchedAt, enriched: true };
  }));
  const news = [];
  const seen = new Set();
  enriched.forEach((result, i) => {
    const item = result.status === 'fulfilled' ? result.value : { ...ordered[i], enriched: false };
    if (result.status === 'rejected') stats.attempts.push({ stage: 'article', host: (() => { try { return new URL(item.url).hostname; } catch { return null; } })(), error: result.reason?.message || 'source_error', status: result.reason?.status || null });
    const key = item.url;
    if (seen.has(key)) return;
    seen.add(key);
    if (item.publishedAt) stats.dated++;
    stats.fetched++;
    news.push({ url: item.url, title: item.title.slice(0, 180), text: item.text, publishedAt: item.publishedAt || null, fetchedAt: item.fetchedAt, kind: item.kind || 'primary' });
  });

  const sources = [...news
    .sort((a, b) => {
      const freshA = a.publishedAt && Date.parse(a.publishedAt) >= now - 24 * 3600000 ? 1 : 0;
      const freshB = b.publishedAt && Date.parse(b.publishedAt) >= now - 24 * 3600000 ? 1 : 0;
      return (freshB - freshA) || (relevance(b) - relevance(a)) || ((Date.parse(b.publishedAt || 0) || 0) - (Date.parse(a.publishedAt || 0) || 0));
    })
    .slice(0, 10), ...(market?.sources || [])];
  if (market?.failures?.length) stats.marketFailures = market.failures;

  sources.forEach((s, i) => { s.id = 'S' + (i + 1); });
  const coverageIds = new Map();
  for (const s of coverage.sources) {
    const id = 'S' + (sources.length + 1);
    coverageIds.set(s.id, id);
    sources.push({ ...s, id });
  }
  const election = coverage.election ? { ...coverage.election, sourceIds: coverage.election.sourceIds.map(id => coverageIds.get(id)) } : null;
  const etf = coverage.etf ? { ...coverage.etf, sourceId: coverageIds.get(coverage.etf.sourceId) } : null;
  const etfFlows = coverage.etfFlows ? { ...coverage.etfFlows, sourceId: coverageIds.get(coverage.etfFlows.sourceId) } : null;
  stats.attempts.push(...coverage.attempts);
  stats.coverage = { electionScope: election?.scope || null, etfKind: etf?.kind || null, etfAsOf: etf?.asOf || null, netFlowKind: etfFlows?.kind || null, netFlowAsOf: etfFlows?.asOf || null, apCorroborated: false };
  const events = [];
  const recentEvents = [];
  const calendarFailures = [];
  for (const [name, url] of [['BLS', 'https://www.bls.gov/schedule/news_release/bls.ics'], ['BEA', 'https://www.bea.gov/news/schedule/ics/online-calendar-subscription.ics']]) {
    try {
      const id = 'S' + (sources.length + 1);
      try {
        const page = await readSource(url, signal);
        if (!page.text.includes('BEGIN:VCALENDAR')) throw new Error('source_calendar_invalid');
        events.push(...calendarEvents(page.text, id, now));
        recentEvents.push(...calendarEvents(page.text, id, now - 24 * 3600000).filter(e => Date.parse(e.at) < now));
        sources.push({ id, url: page.url, title: name + ' resmi yayın takvimi', kind: 'primary', fetchedAt: page.fetchedAt, publishedAt: null, text: 'Resmi ICS takvimi. Etkinlik saatleri IANA zaman diliminden çevrilmiştir.' });
      } catch (e) {
        stats.attempts.push({ stage: 'calendar', host: new URL(url).hostname, error: e.message, status: e.status || null });
        if (name !== 'BLS') throw e;
        // A separately published official HTML calendar is a bounded format fallback,
        // not a mirror, cached calendar, inferred release time or access-control workaround.
        const months = [...new Set([now, now + 48 * 3600000].map(t => new Date(t).toISOString().slice(0, 7)))];
        for (const month of months) {
          const calendarUrl = `https://www.bls.gov/schedule/${month.slice(0, 4)}/${month.slice(5)}_sched_list.htm`;
          const page = await readSource(calendarUrl, signal);
          const htmlId = 'S' + (sources.length + 1);
          const parsed = parseBlsCalendarHTML(page.text, htmlId, now);
          sources.push({ id: htmlId, url: page.url, title: 'BLS resmi yayın takvimi (HTML)', kind: 'primary', fetchedAt: page.fetchedAt, publishedAt: null, text: 'Resmi HTML takvimi. Sayfada belirtilen Eastern Time, America/New_York kurallarıyla çevrildi; saatsiz tatiller olay sayılmadı.' });
          events.push(...parsed.filter(e => Date.parse(e.at) >= now));
          recentEvents.push(...parsed.filter(e => Date.parse(e.at) < now));
        }
      }
    } catch (e) {
      calendarFailures.push(name);
      stats.attempts.push({ stage: 'calendar_fallback', host: new URL(url).hostname, error: e.message, status: e.status || null });
    }
  }

  // Deterministic disclosures: the user must always know what the data is not.
  const has = name => market?.sources.some(s => s.title.includes(name));
  const disclosures = [];
  if (has('gold-api')) disclosures.push('XAUUSD üçüncü taraf toplayıcıdan alınmıştır; borsa düzeyinde resmi spot kotasyon değildir');
  else disclosures.push('spot XAUUSD kotasyonu bu çalıştırmada alınamadı');
  if (has('Coinbase')) disclosures.push('BTC fiyatı tek borsa kotasyonudur; konsolide endeks değildir');
  else disclosures.push('spot BTC kotasyonu bu çalıştırmada alınamadı');
  if (!has('reel getiri')) disclosures.push('reel getiri kesiti alınamadı; nominal getiri reel getiri yerine geçmez');
  if (has('DTWEXBGS')) disclosures.push('DXY yerine Fed geniş dolar endeksi kullanılmıştır');
  else disclosures.push('geniş dolar endeksi bu çalıştırmada alınamadı; DXY yerine doğrulanmış veri yok');
  disclosures.push(etfFlows ? 'ETF akışı Farside ikincil tablo kapsamındadır; ihraççı ve ajans mutabakatı doğrulanmadı' : 'spot BTC ETF günlük net akış verisi doğrulanamadı');
  disclosures.push('piyasa beklenti anketi doğrulanmadı; veri sürprizi ölçülmedi');
  if (etf) disclosures.push((etf.asOf < dayKey(new Date(now)) ? 'ETF kesiti rapor gününe ait değildir; ' : '') + 'tek fonun varlık ve pay görüntüsü net akış değildir');
  disclosures.push('Reuters ve AP doğrudan teyidi bu çalıştırmada alınamadı');
  disclosures.push(election ? (election.scope.startsWith('Solano') ? 'resmi sayım yalnız Solano County yerel kapsamındadır; ülke geneli kesinleşme teyidi yok' : 'resmi seçim kaynağı yalnız California geçici sayımını kapsar; ülke geneli kesinleşme teyidi yok') : 'ara seçim sonuçları için resmi sertifikasyon kaynağı bu çalıştırmada doğrulanamadı');

  const cutoff = researchCutoff(now, sources);
  const endedAt = Date.parse(cutoff);
  const freshness = sourceFreshness(sources, cutoff);
  stats.fresh = freshness.freshCount;
  stats.freshNews = freshness.freshNewsCount;
  if (sources.length < 3 || freshness.freshCount < 1) {
    const error = new Error('insufficient_fresh_evidence');
    error.stats = stats;
    throw error;
  }
  if (!freshness.freshNewsCount) disclosures.push('tarihlenmiş yeni bülten teyidi yok; gözlem kesitleri yeni haber değildir');
  const scheduled = [...new Map([...events, ...recentEvents].map(e => [e.id, e])).values()].sort((a, b) => a.at.localeCompare(b.at));
  return {
    // The cutoff must include observations collected during this run, not precede
    // the BTC/XAU spot quotes by the duration of the network requests.
    cutoff, sources, events: scheduled.filter(e => Date.parse(e.at) >= endedAt && Date.parse(e.at) <= endedAt + 48 * 3600000).slice(0, 8), recentEvents: scheduled.filter(e => Date.parse(e.at) < endedAt && Date.parse(e.at) >= endedAt - 24 * 3600000), calendarFailures, disclosures, election, etf, etfFlows,
    provider: 'official-rss+csv+spot', ...freshness, stats,
  };
}

export function sourceFreshness(sources, cutoff) {
  const end = Date.parse(cutoff);
  if (!Number.isFinite(end)) throw new Error('source_invalid_cutoff');
  const recent = value => verifiedDate(value) && Date.parse(value) <= end && Date.parse(value) >= end - 24 * 3600000;
  return {
    // A newly fetched old article is not a newly published article. Only explicit
    // publication/update dates or genuine dated observations qualify, never fetchedAt.
    freshCount: sources.filter(s => recent(s.observedAt) || recent(s.publishedAt) || recent(s.updatedAt)).length,
    freshNewsCount: sources.filter(s => !s.observedAt && !s.electionScope && !/^Major Economic Indicators Latest Numbers$/i.test(s.title || '') && ['primary', 'news'].includes(s.kind) && (recent(s.publishedAt) || recent(s.updatedAt))).length,
  };
}

export function researchCutoff(startedAt, sources, finishedAt = Date.now()) {
  const start = Number(startedAt);
  const finish = Number(finishedAt);
  if (!Number.isFinite(start) || !Number.isFinite(finish) || finish < start) throw new Error('source_invalid_cutoff');
  // A source's own clock cannot push the report cutoff into the future.
  if (sources.some(s => s.fetchedAt && (!Number.isFinite(Date.parse(s.fetchedAt)) || Date.parse(s.fetchedAt) > finish))) throw new Error('source_invalid_observation_time');
  return new Date(finish).toISOString();
}

// Scheduler/admin diagnostic: counts and hosts only, never page bodies or keys.
export async function modelProbe() {
  try {
    const messages = [{ role: 'system', content: 'Return JSON only.' }, { role: 'user', content: 'Return {"ok":true} as JSON.' }];
    const first = await groq(messages, { tokens: 150, schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false } });
    return { ok: first?.ok === true, received: Object.keys(first).slice(0, 5), strictSchema: true };
  } catch (e) {
    return { ok: false, error: e.message, provider: e.provider || null };
  }
}

// Scheduler/admin diagnostic: counts and hosts only, never page bodies or keys.
export async function diagnose({ now = Date.now(), signal } = {}) {
  try {
    const out = await research({ now, signal });
    return {
      ok: true, stats: out.stats, freshCount: out.freshCount, freshNewsCount: out.freshNewsCount, events: out.events.length, recentScheduledReleases: out.recentEvents.map(e => ({ title: e.title, at: e.at })), calendarFailures: out.calendarFailures,
      sources: out.sources.map(s => ({ host: new URL(s.url).hostname, kind: s.kind, publishedAt: s.publishedAt, observedAt: s.observedAt || null, updatedAt: s.updatedAt || null, referencePeriod: s.referencePeriod || null, comparisonDirection: s.comparisonDirection || null, chars: s.text.length })),
    };
  } catch (e) {
    return { ok: false, error: e.message, provider: e.provider || null, stats: e.stats || null };
  }
}
