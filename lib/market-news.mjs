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
  /(^|[^a-z0-9])(cpi|pce|ppi|inflation|deflation|producer prices?|producer price index|wholesale prices?)([^a-z0-9]|$)/i,
  /(^|[^a-z0-9])(payroll|payrolls|nonfarm|non-farm|unemployment|jobs report)([^a-z0-9]|$)/i,
  /(^|[^a-z0-9])(gdp|recession|treasury|yields?|real rates?|bond market)([^a-z0-9]|$)/i,
  /(^|[^a-z0-9])(tariff|tariffs|sanctions?|trade war|geopolitical|middle east|war)([^a-z0-9]|$)/i,
  /(^|[^a-z0-9])(dollar|dxy|greenback)([^a-z0-9]|$)/i,
  /(^|[^a-z0-9])(etf|sec|blackrock|coinbase|binance|regulation)([^a-z0-9]|$)/i,
];

// Gercek veri/aciklama haberleri: piyasa fiyat yorumundan once gelir.
const HARD_EVENT_RES = [
  /(^|[^a-z0-9])(ppi|producer prices?|producer price index|wholesale (inflation|prices?))([^a-z0-9]|$)/i,
  /(^|[^a-z0-9])(cpi|consumer prices?|consumer price index|pce|inflation data)([^a-z0-9]|$)/i,
  /(^|[^a-z0-9])(nonfarm|payrolls?|jobs report|unemployment rate)([^a-z0-9]|$)/i,
  /(^|[^a-z0-9])(fomc|rate decision|interest rate decision|fed decision)([^a-z0-9]|$)/i,
  /(^|[^a-z0-9])fed (holds?|held|cuts?|hikes?|raises?|lowers?|keeps?|signals?)\b(?!\s+(odds|expectations?|bets?|probability|chance|fears?))/i,
];

// Sirket/teknoloji gurultusu: BTC veya altinla dogrudan ilgisi yoksa asla gonderilmez.
const NOISE_RES = [
  /(^|[^a-z0-9])(nvidia|nvda|jensen huang|microsoft|msft|outlook|copilot|windows|apple|aapl|iphone|tesla|tsla|meta platforms|amazon|amzn|alphabet|openai|anthropic|chatgpt)([^a-z0-9]|$)/i,
  /(^|[^a-z0-9])(earnings|guidance|layoffs?|ceo resigns?|steps down|merger|acquisition|bankruptcy|box office|celebrity|nba|nfl|mlb|wnba|movie|film|music|album|festival|fashion|recipe|travel)([^a-z0-9]|$)/i,
  // Gunluk fiyat yorumu / teknik analiz: gercek haber degil, rutin icerik.
  /(^|[^a-z0-9])(price today|price prediction|price forecast|technical analysis|daily analysis|market analysis|what to expect|here'?s what)([^a-z0-9]|$)/i,
];

// Onizleme/takvim basliklari: gercek gelisme degil, gurultu.
const PREVIEW_RES = [
  /(^|[^a-z0-9])(ahead of|preview|what to watch|week ahead|day ahead|outlook|forecast|calendar|poll)([^a-z0-9]|$)/i,
  /(^|[^a-z0-9])(brace|braces|bracing|await|awaits|awaiting|focus on|due|upcoming|scheduled|data out|to be released|will be released)([^a-z0-9]|$)/i,
];

// Gercek veri sonucu sinyali: "0.3%", "rose", "slows", "fell" gibi.
const RESULT_RES = /(^|[^a-z0-9])(rose|rises|rising|fell|falls|falling|slows?|slowed|slowing|accelerat\w*|hotter|cooler|higher|lower|beats?|misses?|climbs?|climbed|eases?|eased|jumps?|jumped|surges?|surged|drops?|dropped|unexpected(ly)?|record|hits?|hit|held|holds)([^a-z0-9]|$)/i;
const PERCENT_RES = /\d+(?:\.\d+)?\s*%/;

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

// PPI/CPI/NFP/FOMC gibi sert veri haberleri, fiyat yorumundan once gelir.
// Baslikta hem veri turu hem gerceklesmis sonuc sinyali olmali.
export function isHardEvent(item) {
  const text = newsText(item);
  if (NOISE_RES.some((re) => re.test(text))) return false;
  if (!HARD_EVENT_RES.some((re) => re.test(text))) return false;
  return RESULT_RES.test(text) || PERCENT_RES.test(text);
}

// Olay anahtari: ayni varlik + ayni konudan gunde tek bildirim.
function categoryOf(text) {
  if (/(^|[^a-z0-9])(fed|fomc|federal reserve|powell|rate cut|rate hike)([^a-z0-9]|$)/i.test(text)) return 'fed';
  if (/(^|[^a-z0-9])(cpi|pce|ppi|inflation|deflation|producer prices?|producer price index|wholesale (inflation|prices?))([^a-z0-9]|$)/i.test(text)) return 'inflation';
  if (/(^|[^a-z0-9])(payroll|payrolls|nonfarm|non-farm|unemployment|jobs report)([^a-z0-9]|$)/i.test(text)) return 'jobs';
  if (/(^|[^a-z0-9])(tariff|tariffs|sanctions?|trade war|geopolitical|middle east|war)([^a-z0-9]|$)/i.test(text)) return 'geopolitics';
  if (/(^|[^a-z0-9])(treasury|yields?|real rates?|bond market)([^a-z0-9]|$)/i.test(text)) return 'yields';
  if (/(^|[^a-z0-9])(dollar|dxy|greenback)([^a-z0-9]|$)/i.test(text)) return 'dollar';
  if (/(^|[^a-z0-9])(etf|sec|blackrock|coinbase|binance|regulation|ban|hack|lawsuit)([^a-z0-9]|$)/i.test(text)) return 'regulation';
  if (/(^|[^a-z0-9])(surge|surges|soar|soars|rally|rallies|record|jump|jumps|above)([^a-z0-9]|$)/i.test(text)) return 'rally';
  if (/(^|[^a-z0-9])(plunge|plunges|crash|crashes|drop|drops|fall|falls|selloff|sell-off|collapse|slump|below)([^a-z0-9]|$)/i.test(text)) return 'selloff';
  return 'general';
}

// Sert veri raporlari: ayni raporun farkli ajans/varlik basliklari tek olay sayilir.
// Ornek: "cooler PPI" ile "yields move as traders weigh PPI report" ayni gun
// ikinci kez gonderilmez.
const DATA_KEY_RES = [
  { key: 'ppi', re: /(^|[^a-z0-9])(ppi|producer prices?|producer price index|wholesale (inflation|prices?))([^a-z0-9]|$)/i },
  { key: 'cpi', re: /(^|[^a-z0-9])(cpi|consumer prices?|consumer price index|pce)([^a-z0-9]|$)/i },
  { key: 'jobs', re: /(^|[^a-z0-9])(nonfarm|payrolls?|jobs report|unemployment rate)([^a-z0-9]|$)/i },
  { key: 'fomc', re: /(^|[^a-z0-9])(fomc|fed decision|rate decision|interest rate decision)([^a-z0-9]|$)/i },
];

export function dataReportKey(text) {
  const t = String(text || '');
  for (const entry of DATA_KEY_RES) if (entry.re.test(t)) return entry.key;
  return null;
}

export function newsEventKey(item) {
  const text = newsText(item);
  const dataKey = dataReportKey(text);
  if (dataKey) return 'data:' + dataKey;
  const target = /(^|[^a-z0-9])(gold|xau|bullion)([^a-z0-9]|$)/i.test(text)
    ? 'gold'
    : /(^|[^a-z0-9])(bitcoin|btc|xbt|crypto|cryptocurrency|stablecoin|altcoin)([^a-z0-9]|$)/i.test(text)
      ? 'btc'
      : 'macro';
  return target + ':' + categoryOf(text);
}

// ---- Makro yon cikarimi ----
// AI'nin baslikta olmayan bir yon uydurmasini engellemek icin once basliktaki
// gercek sinyalleri kurallarla cikaririz. AI sadece bu cerceveyi yazar.

const DOVISH_RES = /(^|[^a-z0-9])(cooler|cools?|cooling|slows?|slowed|slowing|softer|eases?|eased|falls?|fell|falling|drops?|dropped|declines?|declined|lower|below (expectations?|forecast|consensus)|disinflation|weak(?:er|ens|ness)?|misses?|missed|down)([^a-z0-9]|$)/i;
const HAWKISH_RES = /(^|[^a-z0-9])(hotter|hot|rises?|rose|rising|accelerat\w*|higher|above (expectations?|forecast|consensus)|sticky|firm|climbs?|climbed|jumps?|jumped|surges?|surged|beats?|strong(?:er)?|record|highest|hits?|hit|up)([^a-z0-9]|$)/i;
const UP_RES = /(^|[^a-z0-9])(rises?|rose|rising|climbs?|climbed|jumps?|jumped|surges?|surged|hits?|hit|high|higher|above|up)([^a-z0-9]|$)/i;
const DOWN_RES = /(^|[^a-z0-9])(falls?|fell|falling|drops?|dropped|declines?|declined|eases?|eased|slips?|slipped|slides?|sliding|weakens?|weakening|below|down)([^a-z0-9]|$)/i;
const CUT_RES = /(^|[^a-z0-9])(cuts?|cutting|holds?|held|pause|dovish|slows?)([^a-z0-9]|$)/i;
const HIKE_RES = /(^|[^a-z0-9])(hikes?|hiking|raises?|raised|hawkish|tightening|higher for longer)([^a-z0-9]|$)/i;
const REG_POS_RES = /(^|[^a-z0-9])(approv\w*|inflows?|adopts?|adoption|green light|buys?|accumulat\w*)([^a-z0-9]|$)/i;
const REG_NEG_RES = /(^|[^a-z0-9])(bans?|banned|hacks?|hacked|lawsuit|sues?|charged|charges|outflows?|fraud|probe|selloff|sell-off)([^a-z0-9]|$)/i;
const WAR_RES = /(^|[^a-z0-9])(war|attack|conflict|tensions?|strikes?|invasion|escalat\w*|sanctions?|missile)([^a-z0-9]|$)/i;
const PEACE_RES = /(^|[^a-z0-9])(ceasefire|truce|peace|eases?|de-escalat\w*|talks?|agreement)([^a-z0-9]|$)/i;

const DRIVER_RES = {
  ppi: DATA_KEY_RES[0].re,
  cpi: DATA_KEY_RES[1].re,
  jobs: DATA_KEY_RES[2].re,
  fomc: /(^|[^a-z0-9])(fomc|fed decision|rate decision|interest rate decision|federal reserve|fed)([^a-z0-9]|$)/i,
  yields: /(^|[^a-z0-9])(treasury|yields?|real rates?|bond market|10-year|10 year)([^a-z0-9]|$)/i,
  dollar: /(^|[^a-z0-9])(dollar|dxy|greenback)([^a-z0-9]|$)/i,
  geopolitics: /(^|[^a-z0-9])(war|tariffs?|sanctions?|middle east|geopolitical|conflict|attack|ceasefire)([^a-z0-9]|$)/i,
  regulation: /(^|[^a-z0-9])(etf|sec|blackrock|coinbase|binance|regulation|ban|hack|lawsuit|approval|inflows?|outflows?)([^a-z0-9]|$)/i,
  price: /(^|[^a-z0-9])(bitcoin|btc|xbt|gold|xau|bullion)([^a-z0-9]|$)/i,
};

const DRIVER_ORDER = ['ppi', 'cpi', 'jobs', 'fomc', 'yields', 'dollar', 'geopolitics', 'regulation', 'price'];

const DRIVER_LABEL = {
  ppi: 'PPI', cpi: 'CPI', jobs: 'istihdam', fomc: 'Fed', yields: 'tahvil getirisi',
  dollar: 'dolar', geopolitics: 'jeopolitik', regulation: 'düzenleme', price: 'fiyat hareketi', general: 'genel',
};

function wordDirection(text, posRe, negRe) {
  const pos = posRe.test(text);
  const neg = negRe.test(text);
  if (pos && neg) return 'neutral';
  if (pos) return 'positive';
  if (neg) return 'negative';
  return 'unknown';
}

function percentValue(text) {
  const m = String(text || '').match(/(\d+(?:[.,]\d+)?)\s*%/);
  if (!m) return null;
  const v = Number(m[1].replace(',', '.'));
  return Number.isFinite(v) ? v : null;
}

function driverContext(text, re) {
  const t = String(text || '');
  const clauses = t.split(/\s+(?:as|while|but|and)\s+|[,;]/i);
  for (const clause of clauses) if (re.test(clause)) return clause;
  const m = t.match(re);
  if (!m) return t;
  const i = typeof m.index === 'number' ? m.index : 0;
  return t.slice(Math.max(0, i - 60), Math.min(t.length, i + 60));
}

function driverDirection(name, text) {
  const re = DRIVER_RES[name];
  const focus = re ? driverContext(text, re) : text;
  if (name === 'ppi' || name === 'cpi' || name === 'jobs') return wordDirection(focus, DOVISH_RES, HAWKISH_RES);
  if (name === 'fomc') return wordDirection(focus, CUT_RES, HIKE_RES);
  if (name === 'yields') {
    const d = wordDirection(focus, DOWN_RES, UP_RES);
    if (d === 'positive' || d === 'negative') return d;
    const pct = percentValue(focus);
    if (pct != null && pct >= 4.5) return 'negative';
    if (pct != null && pct <= 3.5) return 'positive';
    return 'unknown';
  }
  if (name === 'dollar') return wordDirection(focus, DOWN_RES, UP_RES);
  if (name === 'geopolitics') return wordDirection(focus, WAR_RES, PEACE_RES);
  if (name === 'regulation') return wordDirection(focus, REG_POS_RES, REG_NEG_RES);
  if (name === 'price') return wordDirection(focus, UP_RES, DOWN_RES);
  return 'unknown';
}

function detectDriver(text) {
  let fallback = null;
  for (const name of DRIVER_ORDER) {
    if (!DRIVER_RES[name].test(text)) continue;
    const direction = driverDirection(name, text);
    if (!fallback) fallback = { name, direction };
    if (direction === 'positive' || direction === 'negative') return { name, direction };
  }
  return fallback || { name: 'general', direction: 'unknown' };
}

// Basliktaki surucu + yonu + varlik bazli etkiyi cikarir.
export function extractMacroFacts(item) {
  const text = newsText(item);
  const { name, direction } = detectDriver(text);
  const facts = {
    driver: name,
    driverDirection: direction,
    btc: 'unknown',
    gold: 'unknown',
    metric: percentValue(text),
    title: String(item && item.title || ''),
  };

  if (name === 'geopolitics') {
    if (direction === 'positive') facts.gold = 'positive';
    if (direction === 'negative') facts.gold = 'negative';
    return facts;
  }

  if (name === 'price') {
    const btc = /(^|[^a-z0-9])(bitcoin|btc|xbt)([^a-z0-9]|$)/i.test(text);
    const gold = /(^|[^a-z0-9])(gold|xau|bullion)([^a-z0-9]|$)/i.test(text);
    if (direction === 'positive' || direction === 'negative') {
      if (btc) facts.btc = direction;
      if (gold) facts.gold = direction;
    }
    return facts;
  }

  if (direction === 'positive' || direction === 'negative') {
    facts.btc = direction;
    facts.gold = direction;
  }
  return facts;
}

// Yonu/net etkisi olmayan basliklar bildirim olarak gonderilmez.
export function hasClearMarketImpact(item) {
  const f = extractMacroFacts(item);
  return f.btc !== 'unknown' || f.gold !== 'unknown';
}

export function combinedEffect(facts) {
  if (facts.btc === 'positive' && facts.gold === 'positive') return 'POZITIF';
  if (facts.btc === 'negative' && facts.gold === 'negative') return 'NEGATIF';
  return 'NOTR';
}

function assetLine(asset, facts) {
  const label = asset === 'btc' ? 'BTC' : 'Altın';
  const dir = facts[asset];
  if (dir !== 'positive' && dir !== 'negative') {
    return label + ': Net yön belirsiz; bu haber tek başına yeterli değil.';
  }
  const up = dir === 'positive';
  const btcPositive = {
    ppi: 'Faiz beklentilerinin gevşemesi risk iştahını destekler.',
    cpi: 'Faiz beklentilerinin gevşemesi risk iştahını destekler.',
    jobs: 'Zayıf istihdam faiz indirimi beklentisini güçlendirir.',
    fomc: 'Gevşeyen Fed tonu risk iştahını destekler.',
    yields: 'Gerileyen tahvil getirisi riskli varlıkları destekler.',
    dollar: 'Zayıf dolar BTC talebini destekler.',
    regulation: 'Olumlu düzenleme/ETF akışı kurumsal talebi artırır.',
    price: 'Kısa vadeli momentum yukarı; alım ilgisi sürebilir.',
  };
  const btcNegative = {
    ppi: 'Faiz ve dolar baskısı risk iştahını sınırlar.',
    cpi: 'Faiz ve dolar baskısı risk iştahını sınırlar.',
    jobs: 'Güçlü istihdam faizlerin yüksek kalma ihtimalini artırır.',
    fomc: 'Sıkı Fed tonu riskli varlıkları baskılar.',
    yields: 'Yüksek tahvil getirisi riskli varlıkları baskılar.',
    dollar: 'Güçlü dolar BTC talebini sınırlar.',
    regulation: 'Olumsuz düzenleme risk iştahını azaltır.',
    price: 'Kısa vadeli momentum aşağı; satış baskısı sürebilir.',
  };
  const goldPositive = {
    ppi: 'Düşen faiz ve zayıf dolar altını destekler.',
    cpi: 'Düşen faiz ve zayıf dolar altını destekler.',
    jobs: 'Zayıf istihdam ve düşen faiz altını destekler.',
    fomc: 'Gevşeyen Fed tonu altını destekler.',
    yields: 'Gerileyen tahvil getirisi altını destekler.',
    dollar: 'Zayıf dolar altını destekler.',
    regulation: 'Olumlu hava güvenli liman talebini artırabilir.',
    price: 'Kısa vadeli momentum yukarı; yükseliş sürebilir.',
    geopolitics: 'Güvenli liman talebi altını destekler.',
  };
  const goldNegative = {
    ppi: 'Yükselen faiz ve dolar altını baskılar.',
    cpi: 'Yükselen faiz ve dolar altını baskılar.',
    jobs: 'Güçlü istihdam ve yüksek faiz altını baskılar.',
    fomc: 'Sıkı Fed tonu altını baskılar.',
    yields: 'Yüksek tahvil getirisi altının fırsat maliyetini artırır.',
    dollar: 'Güçlü dolar altını baskılar.',
    regulation: 'Risk iştahı azalırsa altın kısa vadede baskılanabilir.',
    price: 'Kısa vadeli momentum aşağı; satış baskısı sürebilir.',
    geopolitics: 'Gerilimin azalması güvenli liman talebini zayıflatır.',
  };
  const table = asset === 'btc' ? (up ? btcPositive : btcNegative) : (up ? goldPositive : goldNegative);
  return label + ': ' + (table[facts.driver] || (up ? 'Destekleyici etki.' : 'Baskılayıcı etki.'));
}

function reasonLine(facts) {
  const pct = facts.metric == null ? '' : ' (%' + String(facts.metric).replace('.', ',') + ')';
  switch (facts.driver) {
    case 'ppi':
    case 'cpi':
      return facts.driverDirection === 'positive'
        ? 'Enflasyon verisi beklentinin altında → faiz beklentileri düşer → dolar zayıflar → BTC ve altın desteklenir.'
        : 'Enflasyon verisi beklentinin üzerinde → faiz beklentileri ve dolar yükselir → BTC ve altın baskılanır.';
    case 'jobs':
      return facts.driverDirection === 'positive'
        ? 'İstihdam zayıf → faiz indirimi beklentisi artar → dolar zayıflar → BTC ve altın desteklenir.'
        : 'İstihdam güçlü → faizler yüksek kalır → dolar güçlenir → BTC ve altın baskılanır.';
    case 'fomc':
      return facts.driverDirection === 'positive'
        ? 'Fed faizleri indirdi veya sabit tuttu → faiz beklentileri gevşer → dolar zayıflar → BTC ve altın desteklenir.'
        : 'Fed faizleri yükseltti veya sıkı mesaj verdi → faiz ve dolar yükselir → BTC ve altın baskılanır.';
    case 'yields':
      return facts.driverDirection === 'positive'
        ? 'Tahvil getirisi geriler' + pct + ' → reel getiri düşer → BTC ve altın desteklenir.'
        : 'Tahvil getirisi yükselir' + pct + ' → reel getiri artar → BTC ve altın baskılanır.';
    case 'dollar':
      return facts.driverDirection === 'positive'
        ? 'Dolar zayıflar → dolar cinsi varlıklar ucuzlar → BTC ve altın desteklenir.'
        : 'Dolar güçlenir → dolar cinsi varlıklar pahalanır → BTC ve altın baskılanır.';
    case 'geopolitics':
      return 'Jeopolitik gerilim → güvenli liman talebi artar → altın desteklenir; BTC için risk iştahı belirsiz.';
    case 'regulation':
      return facts.driverDirection === 'positive'
        ? 'Düzenleme/ETF akışı olumlu → kurumsal talep artar → BTC ve altın desteklenir.'
        : 'Düzenleme/soruşturma olumsuz → risk iştahı azalır → BTC ve altın baskılanır.';
    case 'price':
      return facts.driverDirection === 'positive'
        ? 'Fiyat momentumu yukarı → kısa vadeli alım ilgisi sürebilir.'
        : 'Fiyat momentumu aşağı → kısa vadeli satış baskısı sürebilir.';
    default:
      return 'Başlıktaki bilgi net bir yön vermiyor; ek veri gerekir.';
  }
}

// Kurallarla yazilmis, uydurma icermeyen yedek analiz.
export function buildFactAnalysis(item, facts = extractMacroFacts(item)) {
  return [
    'Etki: ' + combinedEffect(facts),
    assetLine('btc', facts),
    assetLine('gold', facts),
    'Neden: ' + reasonLine(facts),
  ].join('\n');
}

const EFFECT_LINE_RE = /^Etki\s*:\s*(POZITIF|NEGATIF|NOTR)(?:\s*\/\s*(?:POZITIF|NEGATIF|NOTR))?\s*$/im;

export function normalizeEffectLine(text) {
  return String(text || '').replace(EFFECT_LINE_RE, 'Etki: $1');
}

function effectOf(text) {
  const m = String(text || '').match(EFFECT_LINE_RE);
  return m ? m[1].toUpperCase() : null;
}

function contradictsDriver(text, facts) {
  if (facts.driver !== 'ppi' && facts.driver !== 'cpi') return false;
  const driverName = facts.driver === 'ppi'
    ? '(?:ppi|üretici fiyat|uretici fiyat)'
    : '(?:cpi|tüketici fiyat|tuketici fiyat|enflasyon)';
  const words = facts.driverDirection === 'positive'
    ? '(?:yüksel|yuksel|artt|artı|arti|hızlan|hizlan|yukarı|yukari|sıcak|sicak|güçlen|guclen)'
    : '(?:gerile|düş|dus|zayıf|zayif|soğu|sogu)';
  const re = new RegExp(driverName + '[^.\\n]{0,50}' + words + '|' + words + '[^.\\n]{0,50}' + driverName, 'i');
  return re.test(text);
}

// AI cevabini dogrular: etki yonu, zorunlu satirlar ve uydurma yon
// birbirini tutmuyorsa cevap reddedilir.
export function validateAnalysis(text, facts) {
  const raw = String(text || '').trim();
  if (!raw) return { ok: false, reason: 'empty' };
  const effect = effectOf(raw);
  if (!effect) return { ok: false, reason: 'missing_effect' };
  if (effect !== combinedEffect(facts)) return { ok: false, reason: 'effect_mismatch' };
  if (!/^BTC\s*:/im.test(raw) || !/^Alt[ıi]n\s*:/im.test(raw) || !/^Neden\s*:/im.test(raw)) {
    return { ok: false, reason: 'missing_sections' };
  }
  if (raw.split(/\s+/).length > 110) return { ok: false, reason: 'too_long' };
  if (contradictsDriver(raw, facts)) return { ok: false, reason: 'contradiction' };
  return { ok: true, text: normalizeEffectLine(raw) };
}

function factBlock(facts) {
  const tr = (d) => (d === 'positive' ? 'POZITIF' : d === 'negative' ? 'NEGATIF' : 'BELIRSIZ');
  return [
    '- Surucu: ' + (DRIVER_LABEL[facts.driver] || facts.driver),
    '- Surucu yonu: ' + tr(facts.driverDirection),
    '- BTC etkisi: ' + tr(facts.btc),
    '- Altin etkisi: ' + tr(facts.gold),
    facts.metric == null ? null : '- Basliktaki oran: %' + String(facts.metric).replace('.', ','),
  ].filter(Boolean).join('\n');
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

// Gonderim saatleri: piyasa hacmi girmeden once 09:00 ve 15:00 (Istanbul).
// Gece 00:00 gibi hacimsiz saatlerde bildirim gitmez.
const DEFAULT_SEND_HOURS = [9, 15];
const DEFAULT_WINDOW_MIN = 60;

export function newsSendHours() {
  const raw = String(process.env.NEWS_SEND_HOURS || '').trim();
  const list = (raw ? raw.split(/[,\s]+/) : [])
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 23);
  return list.length ? [...new Set(list)].sort((a, b) => a - b) : DEFAULT_SEND_HOURS;
}

function newsWindowMin() {
  const n = Number(process.env.NEWS_WINDOW_MIN);
  return Number.isFinite(n) && n >= 5 && n <= 240 ? n : DEFAULT_WINDOW_MIN;
}

export function istanbulClock(now = new Date()) {
  let hour = 0;
  let minute = 0;
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(now);
    hour = Number(parts.find((p) => p.type === 'hour')?.value || 0) % 24;
    minute = Number(parts.find((p) => p.type === 'minute')?.value || 0);
  } catch {
    hour = now.getUTCHours();
    minute = now.getUTCMinutes();
  }
  return { hour, minute, minutes: hour * 60 + minute, dateKey: istanbulDateKey(now) };
}

// Aktif gonderim penceresi; disindaysa null doner.
export function newsSlotAt(now = new Date()) {
  const clock = istanbulClock(now);
  const span = newsWindowMin();
  for (const start of newsSendHours()) {
    const diff = clock.minutes - start * 60;
    if (diff >= 0 && diff < span) {
      return {
        hour: start,
        dateKey: clock.dateKey,
        key: clock.dateKey + ':' + String(start).padStart(2, '0'),
        label: String(start).padStart(2, '0') + ':00',
      };
    }
  }
  return null;
}

// Bir sonraki pencere (cevap/log icin).
export function nextNewsWindow(now = new Date()) {
  const clock = istanbulClock(now);
  const hours = newsSendHours();
  for (const hour of hours) {
    const diff = hour * 60 - clock.minutes;
    if (diff > 0) return { hour, label: String(hour).padStart(2, '0') + ':00', inMinutes: diff, tomorrow: false };
  }
  const first = hours[0];
  return { hour: first, label: String(first).padStart(2, '0') + ':00', inMinutes: 24 * 60 - clock.minutes + first * 60, tomorrow: true };
}

// Gunde en fazla `cap` haber; ayni olay anahtari tekrar gonderilmez.
export function pickNewsToSend(items, state = {}, cap = 2, today = istanbulDateKey()) {
  const used = state && state.day === today && Array.isArray(state.events) ? state.events : [];
  const left = Math.max(0, Number(cap) || 0) - used.length;
  if (left <= 0) return null;
  for (const item of items || []) {
    // Yonu/net etkisi olmayan baslik gonderilmez: "PPI raporu izleniyor"
    // gibi haberlerden yanlis yon cikarilmasini bastan engeller.
    if (!hasClearMarketImpact(item)) continue;
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
// Onemli veri haberi 60 dk bekletilmesin diye varsayilan 10 dk.
const COOLDOWN_MIN = Number(process.env.NEWS_COOLDOWN_MIN || 10);
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

  // Once sert veri (PPI/CPI/NFP/FOMC), sonra hedefe dogrudan/guclu etki edenler,
  // esitlikte en yeni haber.
  const stamp = (item) => {
    const t = Date.parse(item.pubDate || '');
    return Number.isFinite(t) ? t : 0;
  };
  relevant.sort((a, b) => {
    const hard = Number(isHardEvent(b)) - Number(isHardEvent(a));
    if (hard !== 0) return hard;
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
  // Tek bildirimde tek olay var; yon ve etki ilk (secilen) basliktan cikarilir.
  const facts = extractMacroFacts(items[0]);
  const headlines = items.map((it, i) => `${i + 1}. [${it.source}] ${it.title}`).join('\n');
  const requiredEffect = combinedEffect(facts);
  const messages = [
    {
      role: 'system',
      content:
        'Sen deneyimli bir piyasa analistisin. Sana verilen haber basliklari ve "GERCEK" bloklari disinda bilgi uydurma. ' +
        'GERCEK bloktaki surucu, yon ve BTC/altin etkisi zorunludur; bunlara aykiri yazma. ' +
        'Turkce, kisa ve net yaz. SADECE Bitcoin (BTC) ve altin (XAU) uzerindeki etkiyi degerlendir. ' +
        'Veri -> faiz/dolar -> BTC/altin seklinde tek nedensel adim kullan. ' +
        'Baslikta olmayan rakam, yon veya olay ekleme. Yatirim tavsiyesi verme.',
    },
    {
      role: 'user',
      content:
        'Asagidaki haberi BTC ve altin acisindan degerlendir.\n\n' + headlines +
        '\n\nGERCEK:\n' + factBlock(facts) +
        '\n\nSu formati kullan (Etki satiri tam olarak "' + requiredEffect + '" olmali):\n' +
        'Etki: ' + requiredEffect + '\n' +
        'BTC: 1 cumle (GERCEK bloktaki BTC etkisine uygun)\n' +
        'Altin: 1 cumle (GERCEK bloktaki Altin etkisine uygun)\n' +
        'Neden: 1 cumle (sadece basliktaki bilgi + tek nedensel adim: veri -> faiz/dolar -> BTC/altin)\n\n' +
        'Toplam 80 kelimeyi gecme.',
    },
  ];

  async function ask(extra) {
    try {
      const answer = await groq(extra ? [...messages, ...extra] : messages, { format: 'text', tokens: 300 });
      return String(answer || '').trim() || null;
    } catch { return null; }
  }

  let answer = await ask(null);
  let check = validateAnalysis(answer, facts);
  if (!check.ok) {
    // Tek sans daha: modele somut hatayi soyle. Yine tutmazsa kural tabanli
    // yedek analiz gonderilir; boylece celiskili/uydurma yon asla cikmaz.
    console.warn('[market-news] analiz reddedildi: ' + check.reason);
    const retry = await ask([
      { role: 'assistant', content: answer || '(bos)' },
      {
        role: 'user',
        content:
          'Cevabin reddedildi: ' + check.reason + '. ' +
          'Etki satiri tam olarak "Etki: ' + requiredEffect + '" olmali; BTC, Altin ve Neden satirlari eksiksiz olmali. ' +
          'GERCEK bloktaki yonlere aykiri ifade kullanma, baslikta olmayan bilgi ekleme. Ayni formatta yeniden yaz.',
      },
    ]);
    check = validateAnalysis(retry, facts);
  }
  if (check.ok) return check.text;

  console.warn('[market-news] kural tabanli analiz kullanildi: ' + check.reason);
  return buildFactAnalysis(items[0], facts);
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
    lines.push(normalizeEffectLine(analysis));
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
  const ua = String(req.headers?.['user-agent'] || '');
  const cronHeader = String(req.headers?.['x-vercel-cron'] || '') === '1'
    || /^vercel-cron\//i.test(ua);

  // GitHub Actions OIDC: sunucuda saklanan sir olmadan 15 dk'lik tetikleme.
  const oidcToken = String(req.headers?.['x-github-oidc-token'] || '').trim();
  let oidc = null;
  let oidcReason = null;
  if (oidcToken) {
    try {
      const { verifyGithubOidc } = await import('./github-oidc.mjs');
      oidc = await verifyGithubOidc(oidcToken, { onError: (r) => { oidcReason = r; } });
    } catch (e) {
      oidcReason = 'verify_exception:' + String(e?.message || e).slice(0, 60);
    }
  }
  const oidcOk = !!oidc;

  const admin = !secretOk && !queryOk && !cronHeader && !oidcOk ? await isAdmin(req) : false;

  // Teshis: hangi tetikleyicinin geldigini gormek icin (sir degeri yazilmaz).
  console.log('market-news poll ' + JSON.stringify({
    ua: ua.slice(0, 90),
    secretOk, queryOk, cronHeader,
    oidcHeader: !!oidcToken, oidcOk,
    oidcReason: oidcReason || null,
    dryRun: url.searchParams.get('dryRun') === '1',
    force: url.searchParams.get('force') === '1',
    adminPreview: url.searchParams.get('adminPreview') === '1',
  }));

  if (!secretOk && !queryOk && !cronHeader && !oidcOk && !admin) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const dryRun = url.searchParams.get('dryRun') === '1';
  const force = url.searchParams.get('force') === '1';
  // `adminPreview=1`: ornek mesaji YALNIZCA yonetici DM'ine gonderir. Gruba
  // gitmez, gunluk sinir/pencere/tekrar kontrolu uygulanmaz, durum yazilmaz.
  const adminPreview = url.searchParams.get('adminPreview') === '1';

  // Gonderim sadece piyasa hacmi girmeden onceki pencerelerde: 09:00 ve 15:00
  // (Istanbul). Pencere disinda RSS bile cekilmez; elle test (`force`/`dryRun`)
  // bu kontrolu atlar.
  const slotNow = new Date();
  const slot = newsSlotAt(slotNow);
  if (!force && !dryRun && !adminPreview && !slot) {
    const next = nextNewsWindow(slotNow);
    return res.status(200).json({
      ok: true,
      skipped: 'outside_window',
      day: istanbulDateKey(slotNow),
      windows: newsSendHours().map((h) => String(h).padStart(2, '0') + ':00'),
      nextWindow: next.label,
      nextInMinutes: next.inMinutes,
      nextTomorrow: next.tomorrow,
    });
  }

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

    // Her pencerede en fazla 1 bildirim: sabah 09:00 ve aksam 15:00.
    // Ayni pencerede yeni haber gelse bile ikinci mesaj atilmaz.
    if (!force && !dryRun && !adminPreview && slot && collected.lastSentAt) {
      const lastSlot = newsSlotAt(new Date(collected.lastSentAt));
      if (lastSlot && lastSlot.key === slot.key) {
        return res.status(200).json({
          ok: true,
          skipped: 'slot_already_sent',
          slot: slot.key,
          day: today,
          sentToday,
          dailyMax: DAILY_MAX,
        });
      }
    }

    if (!force && !adminPreview && sentToday >= DAILY_MAX) {
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
    const picked = force || adminPreview
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
    if (left > 0 && !force && !adminPreview) {
      return res.status(200).json({
        ok: true, skipped: 'cooldown', cooldownMinLeft: left, lastSentAt: collected.lastSentAt,
        day: today, sentToday, dailyMax: DAILY_MAX, pending: collected.items.length,
      });
    }

    const analysis = await analyzeNews([picked]);
    const text = formatNewsMessage([picked], analysis);

    if (adminPreview) {
      const adminChat = String(process.env.TG_ADMIN_CHAT_ID || '').trim();
      if (!process.env.TG_BOT_TOKEN || !adminChat) {
        return res.status(503).json({ error: 'telegram_not_configured' });
      }
      const previewText = '🧪 ÖRNEK — gruba gönderilmedi\n\n' + text;
      let out;
      try {
        out = await sendTelegram(previewText, adminChat, null, null, { preview: false, timeout: 20000 });
      } catch {
        return res.status(502).json({ error: 'telegram_network' });
      }
      if (!out.ok) return res.status(502).json({ error: 'telegram_error', detail: out.description || null });
      return res.status(200).json({
        ok: true,
        adminPreview: true,
        messageId: out.result && out.result.message_id ? out.result.message_id : null,
        text: previewText,
        eventKey: newsEventKey(picked),
        day: today,
      });
    }

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
