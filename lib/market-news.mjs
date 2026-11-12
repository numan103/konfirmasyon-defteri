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

// Hedefli aramalar: sirket/makro bazli son dakika haberleri.
const QUERIES = [
  { name: 'Google News', query: 'nvidia OR bitcoin OR federal reserve OR tariff' },
  { name: 'Google News', query: 'stock market OR recession OR layoffs OR CEO resigns' },
];

// Piyasayi etkileyebilecek anahtar kelimeler (kucuk harf, kelime sinirli eslesir).
const KEYWORDS = [
  'fed', 'federal reserve', 'interest rate', 'inflation', 'cpi', 'pce', 'gdp', 'payroll', 'payrolls', 'nonfarm', 'non-farm', 'unemployment',
  'powell', 'ecb', 'central bank', 'rate cut', 'rate hike', 'recession', 'tariff', 'tariffs', 'sanctions', 'sanction',
  'nvidia', 'nvda', 'tesla', 'tsla', 'apple', 'aapl', 'microsoft', 'msft', 'meta', 'alphabet', 'amazon', 'amzn',
  'resign', 'resignation', 'resigns', 'steps down', 'stepping down', 'earnings', 'guidance', 'layoff', 'layoffs',
  'merger', 'acquisition', 'bankruptcy', 'default', 'selloff', 'sell-off', 'plunge', 'surge', 'crash', 'rally',
  'bitcoin', 'btc', 'crypto', 'etf', 'sec', 'blackrock', 'gold', 'xau', 'opec', 'treasury', 'bond', 'oil',
  'war', 'geopolitical', 'election', 'stimulus', 'bailout',
];

// Yuksek etki: bunlardan biri varsa haber onceliklendirilir.
const HIGH_IMPACT = [
  'fed', 'federal reserve', 'rate cut', 'rate hike', 'cpi', 'pce', 'gdp', 'payroll', 'payrolls', 'nonfarm', 'non-farm',
  'resign', 'resignation', 'resigns', 'steps down', 'stepping down', 'crash', 'plunge', 'bankruptcy', 'default',
  'tariff', 'tariffs', 'sanctions', 'war', 'bitcoin', 'nvidia', 'sec', 'etf', 'blackrock',
];

// Piyasa ile ilgisiz / gurultu basliklari disla.
const EXCLUDE = [
  'star wars', 'wnba', 'nba', 'nfl', 'mlb', 'celebrity', 'box office', 'movie', 'film', 'music', 'album',
  'tv show', 'reality tv', 'social security', 'award', 'festival', 'fashion', 'recipe', 'travel',
];

function keywordRegex(kw) {
  const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('(^|[^a-z0-9])' + escaped + '([^a-z0-9]|$)', 'i');
}

const KEYWORD_RES = KEYWORDS.map(keywordRegex);
const HIGH_IMPACT_RES = HIGH_IMPACT.map(keywordRegex);
const EXCLUDE_RES = EXCLUDE.map(keywordRegex);

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

// Ayni olayi anlatan basliklari tekille: kelime kumesi benzerligi > 0.5.
function tooSimilar(a, b) {
  const A = wordSet(a);
  const B = wordSet(b);
  if (!A.size || !B.size) return false;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  const union = A.size + B.size - inter;
  return union > 0 && inter / union >= 0.5;
}

function dedupeSimilar(items) {
  const out = [];
  for (const item of items) {
    if (!out.some((kept) => tooSimilar(kept.title, item.title))) out.push(item);
  }
  return out;
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

async function readSeen() {
  const key = supabaseKey(false);
  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/edu_shared?id=eq.' + SEEN_ROW + '&select=data', {
      headers: sbHeaders(key), signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return new Set();
    const rows = await r.json();
    const data = (rows && rows[0] && rows[0].data) || {};
    return new Set(Array.isArray(data.seen) ? data.seen : []);
  } catch { return new Set(); }
}

async function saveSeen(seen) {
  const key = String(process.env.SUPABASE_SERVICE_ROLE || '').trim();
  if (!key) return false;
  try {
    const seenList = [...seen].slice(-SEEN_LIMIT);
    const r = await fetch(SUPABASE_URL + '/rest/v1/edu_shared', {
      method: 'POST',
      headers: { ...sbHeaders(key), Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ id: SEEN_ROW, data: { seen: seenList, updatedAt: new Date().toISOString() } }),
      signal: AbortSignal.timeout(6000),
    });
    return r.ok;
  } catch { return false; }
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

function isMarketRelevant(item) {
  const text = item.title + ' ' + item.description;
  if (EXCLUDE_RES.some((re) => re.test(text))) return false;
  return KEYWORD_RES.some((re) => re.test(text));
}

function isHighImpact(item) {
  const text = item.title + ' ' + item.description;
  return HIGH_IMPACT_RES.some((re) => re.test(text));
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

export async function collectMarketNews({ hours = 24, limit = 12 } = {}) {
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
  const relevant = unique.filter(isMarketRelevant);

  // Yuksek etkili olanlar once, sonra en yeni haberler.
  const stamp = (item) => {
    const t = Date.parse(item.pubDate || '');
    return Number.isFinite(t) ? t : 0;
  };
  relevant.sort((a, b) => {
    const d = Number(isHighImpact(b)) - Number(isHighImpact(a));
    return d !== 0 ? d : stamp(b) - stamp(a);
  });

  const seen = await readSeen();
  const fresh = relevant.filter((item) => !seen.has(titleKey(item.title)));
  const distinct = dedupeSimilar(fresh);
  const selected = distinct.slice(0, limit);
  return {
    items: selected,
    fetched: all.length,
    relevant: relevant.length,
    newCount: fresh.length,
    highImpact: selected.filter(isHighImpact).length,
    seen,
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
        'Yalnizca basliklarda acikca yazan bilgiyi kullan. Turkce, kisa ve net yaz. ' +
        'Yatirim tavsiyesi verme; etki yonunu ve nedenini acikla.',
    },
    {
      role: 'user',
      content:
        'Asagidaki haberleri piyasa etkisi acisindan degerlendir.\n\n' + headlines +
        '\n\nHer haber icin su formati kullan:\n' +
        '- Baslik no: etki (POZITIF/NEGATIF/NOTR) | etkilenen varlik(lar) | 1 cumle gerekce\n\n' +
        'En fazla 8 haber yorumla. Toplam 350 kelimeyi gecme.',
    },
  ];
  try {
    const answer = await groq(messages, { format: 'text', tokens: 700 });
    return String(answer || '').trim() || null;
  } catch { return null; }
}

function istanbulStamp() {
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul', dateStyle: 'short', timeStyle: 'short', hourCycle: 'h23',
  }).format(new Date());
}

export function formatNewsMessage(items, analysis) {
  const lines = ['📰 Piyasa Haber Akışı', istanbulStamp() + ' TSİ', ''];
  items.slice(0, 12).forEach((it, i) => {
    lines.push(`${i + 1}. ${it.title}`);
    lines.push(`   ${it.source}${it.link ? ' · ' + it.link : ''}`);
  });
  if (analysis) {
    lines.push('');
    lines.push('📊 AI Yorumu:');
    lines.push(analysis);
  }
  lines.push('');
  lines.push('Kaynak: RSS (CNBC, BBC, NYT, MarketWatch, Google News)');
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
  try {
    const collected = await collectMarketNews();
    if (!collected.items.length) {
      return res.status(200).json({
        ok: true,
        skipped: 'no_new_news',
        fetched: collected.fetched,
        relevant: collected.relevant,
      });
    }

    const analysis = await analyzeNews(collected.items);
    const text = formatNewsMessage(collected.items, analysis);

    if (dryRun) {
      return res.status(200).json({
        ok: true, dryRun: true, text, analysis,
        items: collected.items, fetched: collected.fetched, relevant: collected.relevant,
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
    for (const it of collected.items) seen.add(titleKey(it.title));
    const saved = await saveSeen(seen);
    return res.status(200).json({
      ok: true,
      messageId: out.result.message_id,
      count: collected.items.length,
      highImpact: collected.highImpact,
      seenSaved: saved,
      text,
      analysis,
    });
  } catch (e) {
    console.error('market-news error:', e?.stack || e?.message || e);
    return res.status(500).json({ error: String(e?.message || e).slice(0, 160) });
  }
}
