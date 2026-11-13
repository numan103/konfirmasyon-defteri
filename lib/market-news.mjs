// Piyasa haber akisi izleyicisi.
// RSS kaynaklarindan finans/makro haberlerini ceker, piyasa etkisi olanlari
// filtreler, Groq ile Turkce kisa analiz uretir ve Telegram'a gonderir.
//
// Not: Bu modul resmi makro takvim hattindan (BLS/BEA) bagimsizdir.
// Yalnizca gercek RSS basliklarini kullanir; AI yorumu ayrica etiketlenir.
import { groq } from './macro/research.mjs';
import { sendTelegram } from './telegram.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zvnjslmptwmnuhftgqsr.supabase.co';
const FALLBACK_PUB = 'sb_publishable_bReG5UKaWcQkU0Z9GnGiJQ_0T4_Qm9X';
const SEEN_ROW = 'market_news_seen';
const SEEN_LIMIT = 800;

const FEEDS = [
  { name: 'CNBC', url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html' },
  { name: 'BBC Business', url: 'https://feeds.bbci.co.uk/news/business/rss.xml' },
  { name: 'NYT Business', url: 'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml' },
  { name: 'MarketWatch', url: 'https://feeds.marketwatch.com/marketwatch/topstories/' },
];

// Hedefli aramalar: yalnizca BTC, altin ve bunlari dogrudan hareket ettiren makro.
const QUERIES = [
  { name: 'Google News', query: 'bitcoin OR BTC ETF OR crypto regulation OR crypto liquidation' },
  { name: 'Google News', query: 'gold price OR XAU OR bullion OR central bank gold buying' },
  { name: 'Google News', query: 'federal reserve OR FOMC OR rate decision OR CPI OR PPI OR jobs report' },
];

function keywordRegex(kw) {
  const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('(^|[^a-z0-9])' + escaped + '([^a-z0-9]|$)', 'i');
}

// Dogrudan hedef varliklar: BTC/kripto ve altin.
const DIRECT_RES = [
  /(^|[^a-z0-9])(bitcoin|btc|xbt)([^a-z0-9]|$)/i,
  /(^|[^a-z0-9])(crypto|cryptocurrency|stablecoin|altcoin)([^a-z0-9]|$)/i,
  /(^|[^a-z0-9])(gold|xau|bullion)([^a-z0-9]|$)/i,
];

// BTC/altini dolayli ama guclu bicimde etkileyen makro basliklar.
const MACRO_RES = [
  /(^|[^a-z0-9])(fed|fomc|federal reserve|powell)([^a-z0-9]|$)/i,
  /(^|[^a-z0-9])(rate cut|rate hike|interest rates?|monetary policy)([^a-z0-9]|$)/i,
  /(^|[^a-z0-9])(cpi|pce|ppi|inflation|deflation)([^a-z0-9]|$)/i,
  /(^|[^a-z0-9])(payroll|payrolls|nonfarm|non-farm|unemployment|jobs report)([^a-z0-9]|$)/i,
  /(^|[^a-z0-9])(gdp|recession|treasury|yields?|real rates?|bond market)([^a-z0-9]|$)/i,
  /(^|[^a-z0-9])(tariff|tariffs|sanctions?|trade war|geopolitical|middle east|war)([^a-z0-9]|$)/i,
  /(^|[^a-z0-9])(dollar|dxy|greenback)([^a-z0-9]|$)/i,
  /(^|[^a-z0-9])(etf|sec|blackrock|coinbase|binance|regulation)([^a-z0-9]|$)/i,
];

// Sirket/teknoloji gurultusu: BTC veya altinla dogrudan ilgisi yoksa asla gonderilmez.
const NOISE_RES = [
  /(^|[^a-z0-9])(nvidia|nvda|jensen huang|microsoft|msft|outlook|copilot|windows|apple|aapl|iphone|tesla|tsla|meta platforms|amazon|amzn|alphabet|openai|anthropic|chatgpt)([^a-z0-9]|$)/i,
  /(^|[^a-z0-9])(earnings|guidance|layoffs?|ceo resigns?|steps down|merger|acquisition|bankruptcy|box office|celebrity|nba|nfl|mlb|wnba|movie|film|music|album|festival|fashion|recipe|travel)([^a-z0-9]|$)/i,
];

// Onizleme/takvim basliklari: gercek gelisme degil, gurultu.
const PREVIEW_RES = [
  /(^|[^a-z0-9])(ahead of|preview|what to watch|week ahead|day ahead|outlook|forecast|calendar|poll)([^a-z0-9]|$)/i,
];

// Fiyat hareketi / karar fiilleri: haberin gerceklesmis bir olayi anlattigini gosterir.
const MOVE_RES = /(^|[^a-z0-9])(surge|surges|soar|soars|plunge|plunges|crash|crashes|drop|drops|fall|falls|jump|jumps|rally|rallies|record|selloff|sell-off|collapse|spike|spikes|cut|cuts|hike|hikes|hold|holds)([^a-z0-9]|$)/i;

// Baslik anahtari: Google News kaynak eki (" - CNBC") temizlenir, kucuk harfe cevrilir.
function titleKey(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/\s+-\s+[^-]{2,40}$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'after', 'over', 'into', 'his', 'her', 'its',
  'has', 'have', 'was', 'are', 'will', 'says', 'said', 'amid', 'about', 'what', 'who', 'how', 'why',
  'new', 'now', 'out', 'up', 'as', 'on', 'in', 'of', 'to', 'a', 'an', 'is', 'at', 'by', 'be',
]);

function wordSet(title) {
  return new Set(
    titleKey(title)
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
  );
}

// Ayni olayi anlatan basliklari tekille: kelime kumesi benzerligi >= 0.4.
function tooSimilar(a, b) {
  const A = wordSet(a);
  const B = wordSet(b);
  if (!A.size || !B.size) return false;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  const union = A.size + B.size - inter;
  return union > 0 && inter / union >= 0.4;
}

function dedupeSimilar(items) {
  const out = [];
  for (const item of items) {
    if (!out.some((kept) => tooSimilar(kept.title, item.title))) out.push(item);
  }
  return out;
}

// Baslik + aciklama metni uzerinden hedefli puanlama.
function newsText(item) {
  return String(item && item.title || '') + ' ' + String(item && item.description || '');
}

// 0 = alakasiz/gurultu. Dogrudan BTC/altin +3, makro surucu +2, gerceklesmis hareket +1.
export function scoreNews(item) {
  const text = newsText(item);
  if (NOISE_RES.some((re) => re.test(text))) return 0;
  if (PREVIEW_RES.some((re) => re.test(text))) return 0;
  const direct = DIRECT_RES.some((re) => re.test(text));
  const macro = MACRO_RES.some((re) => re.test(text));
  if (!direct && !macro) return 0;
  let score = direct ? 3 : 0;
  if (macro) score += 2;
  if (MOVE_RES.test(text)) score += 1;
  return score;
}

export function isTargetRelevant(item) {
  return scoreNews(item) >= 2;
}

export function isHighImpact(item) {
  return scoreNews(item) >= 4;
}

// Olay anahtari: ayni varlik + ayni konudan gunde tek bildirim.
function categoryOf(text) {
  if (/(^|[^a-z0-9])(fed|fomc|federal reserve|powell|rate cut|rate hike)([^a-z0-9]|$)/i.test(text)) return 'fed';
  if (/(^|[^a-z0-9])(cpi|pce|ppi|inflation|deflation)([^a-z0-9]|$)/i.test(text)) return 'inflation';
  if (/(^|[^a-z0-9])(payroll|payrolls|nonfarm|non-farm|unemployment|jobs report)([^a-z0-9]|$)/i.test(text)) return 'jobs';
  if (/(^|[^a-z0-9])(tariff|tariffs|sanctions?|trade war|geopolitical|middle east|war)([^a-z0-9]|$)/i.test(text)) return 'geopolitics';
  if (/(^|[^a-z0-9])(treasury|yields?|real rates?|bond market)([^a-z0-9]|$)/i.test(text)) return 'yields';
  if (/(^|[^a-z0-9])(dollar|dxy|greenback)([^a-z0-9]|$)/i.test(text)) return 'dollar';
  if (/(^|[^a-z0-9])(etf|sec|blackrock|coinbase|binance|regulation|ban|hack|lawsuit)([^a-z0-9]|$)/i.test(text)) return 'regulation';
  if (/(^|[^a-z0-9])(surge|surges|soar|soars|rally|rallies|record|jump|jumps|above)([^a-z0-9]|$)/i.test(text)) return 'rally';
  if (/(^|[^a-z0-9])(plunge|plunges|crash|crashes|drop|drops|fall|falls|selloff|sell-off|collapse|slump|below)([^a-z0-9]|$)/i.test(text)) return 'selloff';
  return 'general';
}

export function newsEventKey(item) {
  const text = newsText(item);
  const target = /(^|[^a-z0-9])(gold|xau|bullion)([^a-z0-9]|$)/i.test(text)
    ? 'gold'
    : /(^|[^a-z0-9])(bitcoin|btc|xbt|crypto|cryptocurrency|stablecoin|altcoin)([^a-z0-9]|$)/i.test(text)
      ? 'btc'
      : 'macro';
  return target + ':' + categoryOf(text);
}

// Istanbul takvim gunu (YYYY-MM-DD).
export function istanbulDateKey(now = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

// Gunde en fazla `cap` haber; ayni olay anahtari tekrar gonderilmez.
export function pickNewsToSend(items, state = {}, cap = 2, today = istanbulDateKey()) {
  const used = state && state.day === today && Array.isArray(state.events) ? state.events : [];
  const left = Math.max(0, Number(cap) || 0) - used.length;
  if (left <= 0) return null;
  for (const item of items || []) {
    if (!used.includes(newsEventKey(item))) return item;
  }
  return null;
}

function supabaseKey(write) {
  const secret = String(process.env.SUPABASE_SERVICE_ROLE || '').trim();
  if (write && secret) return secret;
  return String(process.env.SUPABASE_PUBLISHABLE || FALLBACK_PUB).trim();
}
function sbHeaders(key) {
  const h = { apikey: key, 'Content-Type': 'application/json' };
  if (!key.startsWith('sb_secret_')) h.Authorization = 'Bearer ' + key;
  return h;
}

async function readState() {
  const key = supabaseKey(false);
  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/edu_shared?id=eq.' + SEEN_ROW + '&select=data', {
      headers: sbHeaders(key), signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return { seen: new Set(), lastSentAt: null, day: null, events: [] };
    const rows = await r.json();
    const data = (rows && rows[0] && rows[0].data) || {};
    const lastSentAt = typeof data.lastSentAt === 'string' && Number.isFinite(Date.parse(data.lastSentAt))
      ? data.lastSentAt
      : null;
    return {
      seen: new Set(Array.isArray(data.seen) ? data.seen : []),
      lastSentAt,
      day: typeof data.day === 'string' ? data.day : null,
      events: Array.isArray(data.events) ? data.events : [],
    };
  } catch { return { seen: new Set(), lastSentAt: null, day: null, events: [] }; }
}

async function saveState(seen, lastSentAt, day, events) {
  const key = String(process.env.SUPABASE_SERVICE_ROLE || '').trim();
  if (!key) return false;
  try {
    const seenList = [...seen].slice(-SEEN_LIMIT);
    const r = await fetch(SUPABASE_URL + '/rest/v1/edu_shared', {
      method: 'POST',
      headers: { ...sbHeaders(key), Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({
        id: SEEN_ROW,
        data: {
          seen: seenList,
          lastSentAt: lastSentAt || null,
          day: day || null,
          events: Array.isArray(events) ? events.slice(-Math.max(2, DAILY_MAX)) : [],
          updatedAt: new Date().toISOString(),
        },
      }),
      signal: AbortSignal.timeout(6000),
    });
    return r.ok;
  } catch { return false; }
}

// Ayni olay icin art arda bildirim yagmurunu engelle.
const COOLDOWN_MIN = Number(process.env.NEWS_COOLDOWN_MIN || 60);
// Gunluk toplam bildirim siniri (varsayilan 2).
const DAILY_MAX = Math.max(0, Number(process.env.NEWS_DAILY_MAX || 2));

function cooldownRemaining(lastSentAt) {
  if (!lastSentAt) return 0;
  const t = Date.parse(lastSentAt);
  if (!Number.isFinite(t)) return 0;
  const left = COOLDOWN_MIN * 60000 - (Date.now() - t);
  return left > 0 ? Math.ceil(left / 60000) : 0;
}

function cleanText(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[/g, '')
    .replace(/\]\]>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseRss(xml, sourceName) {
  const items = [];
  const blocks = String(xml).match(/<item\b[\s\S]*?<\/item>/gi) || [];
  for (const block of blocks) {
    const title = cleanText((block.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]);
    const link = cleanText((block.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || [])[1]);
    const description = cleanText((block.match(/<description[^>]*>([\s\S]*?)<\/description>/i) || [])[1]);
    const pubDate = cleanText((block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) || [])[1]);
    if (!title || title.length < 12) continue;
    items.push({ source: sourceName, title, link, description: description.slice(0, 320), pubDate });
  }
  return items;
}

function withinWindow(item, hours) {
  if (!item.pubDate) return true;
  const t = Date.parse(item.pubDate);
  if (!Number.isFinite(t)) return true;
  return Date.now() - t <= hours * 3600000;
}

async function fetchFeed(url, sourceName) {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'AlfaMacroAnalist/1.0', Accept: 'application/rss+xml,application/xml,text/xml' },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return [];
    return parseRss(await r.text(), sourceName);
  } catch { return []; }
}

export async function collectMarketNews({ hours = 24, limit = 6 } = {}) {
  const results = await Promise.all([
    ...FEEDS.map((f) => fetchFeed(f.url, f.name)),
    ...QUERIES.map((q) => fetchFeed(
      'https://news.google.com/rss/search?q=' + encodeURIComponent(q.query) + '&hl=en-US&gl=US&ceid=US:en',
      q.name
    )),
  ]);
  const all = results.flat().filter((item) => withinWindow(item, hours));

  // Ayni baslik tekrari ve kaynak ici cift kayit temizligi.
  const byTitle = new Map();
  for (const item of all) {
    const key = titleKey(item.title);
    if (!byTitle.has(key)) byTitle.set(key, item);
  }
  const unique = [...byTitle.values()];
  const relevant = unique.filter(isTargetRelevant);

  // Once hedefe dogrudan/guclu etki edenler, sonra en yeni haberler.
  const stamp = (item) => {
    const t = Date.parse(item.pubDate || '');
    return Number.isFinite(t) ? t : 0;
  };
  relevant.sort((a, b) => {
    const d = scoreNews(b) - scoreNews(a);
    return d !== 0 ? d : stamp(b) - stamp(a);
  });

  const state = await readState();
  const fresh = relevant.filter((item) => !state.seen.has(titleKey(item.title)));
  const distinct = dedupeSimilar(fresh);
  const selected = distinct.slice(0, Math.max(1, limit));
  return {
    items: selected,
    fetched: all.length,
    relevant: relevant.length,
    newCount: fresh.length,
    highImpact: selected.filter(isHighImpact).length,
    seen: state.seen,
    lastSentAt: state.lastSentAt,
    day: state.day,
    events: state.events,
  };
}

export async function analyzeNews(items) {
  if (!items.length) return null;
  const headlines = items.map((it, i) => `${i + 1}. [${it.source}] ${it.title}`).join('\n');
  const messages = [
    {
      role: 'system',
      content:
        'Sen deneyimli bir piyasa analistisin. Sana verilen haber basliklari disinda bilgi uydurma. ' +
        'Yalnizca baslikta acikca yazan bilgiyi kullan. Turkce, kisa ve net yaz. ' +
        'SADECE Bitcoin (BTC) ve altin (XAU) uzerindeki etkiyi degerlendir. ' +
        'Haber bu iki varliktan birini dogrudan etkilemiyorsa "etkisiz" yaz. ' +
        'Baska hisse, sirket veya sektor yorumu ekleme. Yatirim tavsiyesi verme.',
    },
    {
      role: 'user',
      content:
        'Asagidaki haberi BTC ve altin acisindan degerlendir.\n\n' + headlines +
        '\n\nSu formati kullan:\n' +
        'Etki: POZITIF / NEGATIF / NOTR\n' +
        'BTC: 1 cumle\n' +
        'Altin: 1 cumle\n' +
        'Neden: 1 cumle (sadece basliktaki bilgi)\n\n' +
        'Toplam 80 kelimeyi gecme.',
    },
  ];
  try {
    const answer = await groq(messages, { format: 'text', tokens: 300 });
    return String(answer || '').trim() || null;
  } catch { return null; }
}

function istanbulStamp() {
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul', dateStyle: 'short', timeStyle: 'short', hourCycle: 'h23',
  }).format(new Date());
}

export function formatNewsMessage(items, analysis) {
  const lines = ['📰 BTC & Altın Önemli Haber', istanbulStamp() + ' TSİ', ''];
  items.slice(0, 2).forEach((it) => {
    lines.push('• ' + it.title);
    lines.push('  ' + it.source);
  });
  if (analysis) {
    lines.push('');
    lines.push('📊 Etki:');
    lines.push(analysis);
  }
  lines.push('');
  lines.push('AI yorumu bilgilendirme amaçlıdır, yatırım tavsiyesi değildir.');
  return lines.join('\n').slice(0, 3900);
}

function targetChat() {
  const chat = String(
    process.env.NEWS_CHAT_ID || process.env.TG_TRADE_CHAT_ID || process.env.TG_CHAT_ID || ''
  ).trim();
  const raw = process.env.NEWS_THREAD != null ? process.env.NEWS_THREAD
    : process.env.TG_TRADE_THREAD != null ? process.env.TG_TRADE_THREAD
    : process.env.MACRO_TARGET_THREAD != null ? process.env.MACRO_TARGET_THREAD
    : process.env.TG_THREAD;
  const n = raw == null || String(raw).trim() === '' || String(raw).trim() === '0' ? null : Number(String(raw).trim());
  const thread = Number.isSafeInteger(n) && n > 0 ? n : null;
  return { chat, thread };
}

async function isAdmin(req) {
  try {
    const { requestUser } = await import('./auth.mjs');
    const user = await requestUser(req);
    return !!(user && user.admin);
  } catch { return false; }
}

export default async function marketNewsHandler(req, res) {
  const url = new URL(req.url || '/api/ai', 'http://localhost');
  const secret = String(process.env.NEWS_ALERT_SECRET || process.env.MACRO_CRON_SECRET || process.env.CRON_SECRET || '').trim();
  const auth = String(req.headers?.authorization || '');
  const secretOk = !!secret && auth === 'Bearer ' + secret;
  const queryOk = !!secret && url.searchParams.get('key') === secret;
  const cronHeader = String(req.headers?.['x-vercel-cron'] || '') === '1'
    || /^vercel-cron\//i.test(String(req.headers?.['user-agent'] || ''));
  const admin = !secretOk && !queryOk && !cronHeader ? await isAdmin(req) : false;
  if (!secretOk && !queryOk && !cronHeader && !admin) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const dryRun = url.searchParams.get('dryRun') === '1';
  const force = url.searchParams.get('force') === '1';
  try {
    const collected = await collectMarketNews();
    if (!collected.items.length) {
      return res.status(200).json({
        ok: true,
        skipped: 'no_new_news',
        fetched: collected.fetched,
        relevant: collected.relevant,
        day: istanbulDateKey(),
        sentToday: 0,
        dailyMax: DAILY_MAX,
      });
    }

    const today = istanbulDateKey();
    const usedEvents = collected.day === today ? collected.events : [];
    const sentToday = usedEvents.length;
    if (!force && sentToday >= DAILY_MAX) {
      return res.status(200).json({
        ok: true,
        skipped: 'daily_cap',
        day: today,
        sentToday,
        dailyMax: DAILY_MAX,
        pending: collected.items.length,
      });
    }

    // Her bildirimde tek olay: ayni olay gun icinde tekrar gonderilmez.
    const picked = force
      ? collected.items[0]
      : pickNewsToSend(collected.items, { day: today, events: usedEvents }, DAILY_MAX, today);
    if (!picked) {
      return res.status(200).json({
        ok: true,
        skipped: 'duplicate_event',
        day: today,
        sentToday,
        dailyMax: DAILY_MAX,
        pending: collected.items.length,
      });
    }

    // Ayni olay/akis icin art arda bildirim yagmurunu engelle.
    const left = cooldownRemaining(collected.lastSentAt);
    if (left > 0 && !force) {
      return res.status(200).json({
        ok: true, skipped: 'cooldown', cooldownMinLeft: left, lastSentAt: collected.lastSentAt,
        day: today, sentToday, dailyMax: DAILY_MAX, pending: collected.items.length,
      });
    }

    const analysis = await analyzeNews([picked]);
    const text = formatNewsMessage([picked], analysis);

    if (dryRun) {
      return res.status(200).json({
        ok: true, dryRun: true, text, analysis,
        items: [picked], fetched: collected.fetched, relevant: collected.relevant,
        lastSentAt: collected.lastSentAt,
        cooldownMinLeft: cooldownRemaining(collected.lastSentAt),
        day: today, sentToday, dailyMax: DAILY_MAX,
        eventKey: newsEventKey(picked),
      });
    }

    const { chat, thread } = targetChat();
    if (!process.env.TG_BOT_TOKEN || !chat) {
      return res.status(503).json({ error: 'telegram_not_configured' });
    }

    let out;
    try {
      out = await sendTelegram(text, chat, thread, null, { preview: false, timeout: 20000 });
    } catch {
      return res.status(502).json({ error: 'telegram_network' });
    }
    if (!(out && out.ok && out.result && out.result.message_id)) {
      return res.status(502).json({ error: 'telegram_rejected', http: out?.http, description: out?.description });
    }

    const seen = collected.seen || new Set();
    seen.add(titleKey(picked.title));
    const events = [...usedEvents, newsEventKey(picked)].slice(-2);
    const now = new Date().toISOString();
    const saved = await saveState(seen, now, today, events);
    return res.status(200).json({
      ok: true,
      messageId: out.result.message_id,
      count: 1,
      highImpact: isHighImpact(picked),
      seenSaved: saved,
      day: today,
      sentToday: events.length,
      dailyMax: DAILY_MAX,
      text,
      analysis,
    });
  } catch (e) {
    console.error('market-news error:', e?.stack || e?.message || e);
    return res.status(500).json({ error: String(e?.message || e).slice(0, 160) });
  }
}
