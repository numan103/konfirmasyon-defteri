// Telegram soru-cevap botu.
// Kullanicilarin piyasa sorularini mevcut veriler esliginde AI ile cevaplar.
import { groq } from './macro/research.mjs';
import { readStrategies, formatStrategiesForPrompt, addStrategy, removeStrategy } from './telegram-qa-strategies.mjs';
import { readKnowledge, addNote, addImageAnalysis, formatKnowledgeForPrompt, analyzeChart } from './telegram-qa-knowledge.mjs';
import { collectCoinalyzeData } from './coinalyze.mjs';
import { collectOrderbookLevels } from './orderbook-levels.mjs';
import { parsePlan, validatePlan, describePlanErrors, stripPlanLines } from './trade-plan.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zvnjslmptwmnuhftgqsr.supabase.co';
const FALLBACK_PUB = 'sb_publishable_bReG5UKaWcQkU0Z9GnGiJQ_0T4_Qm9X';
const QA_RATE_ROW = 'telegram_qa_rate';

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

// Rate limit: kullanici basina saatte max 5 soru.
async function checkRateLimit(userId) {
  const key = supabaseKey(false);
  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/edu_shared?id=eq.' + QA_RATE_ROW + '&select=data', {
      headers: sbHeaders(key), signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return true; // hata durumunda izin ver
    const rows = await r.json();
    const data = (rows && rows[0] && rows[0].data) || {};
    const userKey = String(userId);
    const now = Date.now();
    const hourAgo = now - 3600000;
    const entries = (data[userKey] || []).filter(t => t > hourAgo);
    if (entries.length >= 20) return false;
    entries.push(now);
    data[userKey] = entries;
    // Temizlik: 24 saatlik eski verileri sil
    for (const k of Object.keys(data)) {
      data[k] = (data[k] || []).filter(t => t > now - 86400000);
      if (!data[k].length) delete data[k];
    }
    const wKey = String(process.env.SUPABASE_SERVICE_ROLE || '').trim();
    if (wKey) {
      await fetch(SUPABASE_URL + '/rest/v1/edu_shared', {
        method: 'POST',
        headers: { ...sbHeaders(wKey), Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({ id: QA_RATE_ROW, data }),
        signal: AbortSignal.timeout(5000),
      }).catch(() => {});
    }
    return true;
  } catch { return true; }
}

// ---- Canlı fiyat ve piyasa yapısı (BTC/ETH) ----
// Modelin ezberden seviye uydurmasını engellemek için mutlak fiyat, ATR ve
// swing seviyeleri her soruda taze tutulur (60 sn önbellek).
let spotCache = null;
let spotCacheAt = 0;
const structureCache = {};

function trNum(n, digits = 2) {
  return Number(n).toLocaleString('tr-TR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
function istanbulClock() {
  try {
    return new Date().toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' });
  } catch (e) { return ''; }
}

async function fetchSpot(symbol) {
  try {
    const r = await fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=' + symbol + 'USDT', { signal: AbortSignal.timeout(5000) });
    if (r.ok) {
      const j = await r.json();
      const price = Number(j.lastPrice);
      if (price > 0) {
        return {
          price,
          changePct: Number(j.priceChangePercent),
          high24: Number(j.highPrice) || null,
          low24: Number(j.lowPrice) || null,
          source: 'Binance',
        };
      }
    }
  } catch (e) { /* OKX yedeği */ }
  try {
    const r = await fetch('https://www.okx.com/api/v5/market/ticker?instId=' + symbol + '-USDT', { signal: AbortSignal.timeout(5000) });
    if (r.ok) {
      const j = await r.json();
      const t = j && j.data && j.data[0];
      const price = Number(t && t.last);
      if (price > 0) {
        const open = Number(t.open24h);
        return {
          price,
          changePct: open > 0 ? (price / open - 1) * 100 : null,
          high24: Number(t.high24h) || null,
          low24: Number(t.low24h) || null,
          source: 'OKX',
        };
      }
    }
  } catch (e) { /* Bybit yedeği */ }
  try {
    const r = await fetch('https://api.bybit.com/v5/market/tickers?category=spot&symbol=' + symbol + 'USDT', { signal: AbortSignal.timeout(5000) });
    if (r.ok) {
      const j = await r.json();
      const t = j && j.result && j.result.list && j.result.list[0];
      const price = Number(t && t.lastPrice);
      if (price > 0) {
        const pct = Number(t.price24hPcnt);
        return {
          price,
          changePct: Number.isFinite(pct) ? pct * 100 : null,
          high24: Number(t.highPrice24h) || null,
          low24: Number(t.lowPrice24h) || null,
          source: 'Bybit',
        };
      }
    }
  } catch (e) { /* Coinbase yedeği */ }
  try {
    const r = await fetch('https://api.exchange.coinbase.com/products/' + symbol + '-USD/ticker', { signal: AbortSignal.timeout(5000) });
    if (r.ok) {
      const j = await r.json();
      const price = Number(j && j.price);
      if (price > 0) return { price, changePct: null, high24: null, low24: null, source: 'Coinbase' };
    }
  } catch (e) { /* fiyat yok */ }
  return null;
}

async function fetchGoldSpot() {
  let out = null;
  try {
    const r = await fetch('https://api.gold-api.com/price/XAU', { signal: AbortSignal.timeout(5000) });
    if (r.ok) {
      const j = await r.json();
      const price = Number(j && j.price);
      if (price > 0) out = { price, changePct: null, source: 'gold-api', at: j.updatedAt || null };
    }
  } catch (e) { /* XAUT yedeği */ }
  // XAUT/USDT: altın fiyatı yedeği + 24s yüksek/düşük aralığı.
  try {
    const r = await fetch('https://www.okx.com/api/v5/market/ticker?instId=XAUT-USDT', { signal: AbortSignal.timeout(5000) });
    if (r.ok) {
      const j = await r.json();
      const t = j && j.data && j.data[0];
      const price = Number(t && t.last);
      if (price > 0) {
        const high24 = Number(t.high24h) || null;
        const low24 = Number(t.low24h) || null;
        if (out) {
          out.high24 = high24;
          out.low24 = low24;
        } else {
          const open = Number(t.open24h);
          out = { price, changePct: open > 0 ? (price / open - 1) * 100 : null, high24, low24, source: 'OKX XAUT' };
        }
      }
    }
  } catch (e) { /* altın fiyatı yok */ }
  return out;
}

async function getSpotPrices() {
  if (spotCache && Date.now() - spotCacheAt < 60000) return spotCache;
  const [BTC, ETH, XAU] = await Promise.all([fetchSpot('BTC'), fetchSpot('ETH'), fetchGoldSpot()]);
  spotCache = { BTC, ETH, XAU, at: new Date().toISOString() };
  spotCacheAt = Date.now();
  return spotCache;
}

// 1 saatlik mum üreticileri. Borsalar bölgeye göre 451/403 dönebildiği için
// sırayla değil paralel denenir; ilk geçerli sonuç kullanılır.
const CANDLE_SOURCES = [
  {
    name: 'Binance',
    supports: ['BTC', 'ETH'],
    url: s => 'https://api.binance.com/api/v3/klines?symbol=' + s + 'USDT&interval=1h&limit=200',
    rows: j => j,
    map: x => ({ h: Number(x[2]), l: Number(x[3]), c: Number(x[4]) }),
  },
  {
    name: 'OKX',
    supports: ['BTC', 'ETH', 'XAUT'],
    url: s => 'https://www.okx.com/api/v5/market/candles?instId=' + s + '-USDT&bar=1H&limit=200',
    rows: j => j && j.data,
    map: x => ({ h: Number(x[2]), l: Number(x[3]), c: Number(x[4]) }),
    newestFirst: true,
  },
  {
    name: 'Bybit',
    supports: ['BTC', 'ETH', 'XAUT'],
    url: s => 'https://api.bybit.com/v5/market/kline?category=spot&symbol=' + s + 'USDT&interval=60&limit=200',
    rows: j => j && j.result && j.result.list,
    map: x => ({ h: Number(x[2]), l: Number(x[3]), c: Number(x[4]) }),
    newestFirst: true,
  },
  {
    name: 'Coinbase',
    supports: ['BTC', 'ETH'],
    url: s => 'https://api.exchange.coinbase.com/products/' + s + '-USD/candles?granularity=3600',
    rows: j => j,
    map: x => ({ h: Number(x[2]), l: Number(x[1]), c: Number(x[4]) }),
    newestFirst: true,
  },
];

export function structureFromCandles(candles) {
  if (!Array.isArray(candles) || candles.length < 60) return null;
  const emaOf = period => {
    const k = 2 / (period + 1);
    let e = candles[0].c;
    for (let i = 1; i < candles.length; i++) e = candles[i].c * k + e * (1 - k);
    return e;
  };
  const tr = [];
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1].c, c = candles[i];
    tr.push(Math.max(c.h - c.l, Math.abs(c.h - prev), Math.abs(c.l - prev)));
  }
  const atr14 = tr.slice(-14).reduce((a, b) => a + b, 0) / 14;
  const ema20 = emaOf(20), ema50 = emaOf(50);
  const recent = candles.slice(-50), day = candles.slice(-24);
  const last = candles[candles.length - 1].c;
  return {
    atr14,
    ema20, ema50,
    swingHigh: Math.max(...recent.map(c => c.h)),
    swingLow: Math.min(...recent.map(c => c.l)),
    high24: Math.max(...day.map(c => c.h)),
    low24: Math.min(...day.map(c => c.l)),
    trend: last > ema20 && ema20 > ema50 ? 'yukarı' : last < ema20 && ema20 < ema50 ? 'aşağı' : 'yatay',
  };
}

async function getStructure(symbol) {
  const hit = structureCache[symbol];
  if (hit && Date.now() - hit.at < 60000) return hit.data;
  const attempts = CANDLE_SOURCES
    .filter(source => !source.supports || source.supports.includes(symbol))
    .map(async source => {
      const r = await fetch(source.url(symbol), { signal: AbortSignal.timeout(6000) });
      if (!r.ok) return null;
      const j = await r.json();
      const rows = source.rows(j);
      if (!Array.isArray(rows)) return null;
      const candles = rows.map(source.map).filter(c => c.c > 0 && c.h > 0 && c.l > 0);
      if (source.newestFirst) candles.reverse();
      return structureFromCandles(candles);
    });
  const results = await Promise.all(attempts.map(p => p.catch(() => null)));
  const data = results.find(Boolean) || null;
  structureCache[symbol] = { at: Date.now(), data };
  return data;
}

// Piyasa verisi topla (cache: 5 dk).
let cachedData = null;
let cachedAt = 0;
async function getMarketData() {
  if (cachedData && Date.now() - cachedAt < 600000) return cachedData;
  const data = {};
  try {
    const c = await collectCoinalyzeData(Date.now(), process.env.COINALYZE_API_KEY);
    data.coinalyze = c;
  } catch (e) { data.coinalyzeError = String(e.message || e).slice(0, 100); console.log('getMarketData coinalyze error:', data.coinalyzeError); }
  // Order book fetch atlandi (hiz icin); gerekirse /data komutu ile alinabilir
  // try {
  //   const o = await collectOrderbookLevels();
  //   data.orderbook = o;
  // } catch (e) { data.orderbookError = String(e.message || e).slice(0, 100); }
  // Altın fiyatı
  try {
    const r = await fetch('https://api.gold-api.com/price/XAU', { signal: AbortSignal.timeout(5000) });
    const j = await r.json();
    if (j?.price) data.gold = { price: Number(j.price), updatedAt: j.updatedAt || null };
  } catch (e) { data.goldError = String(e.message || e).slice(0, 100); }
  cachedData = data;
  cachedAt = Date.now();
  return data;
}

function structureBits(st, price = 0) {
  const bits = [];
  if (st.atr14 > 0) bits.push('ATR14 $' + trNum(st.atr14, 0) + (price > 0 ? ' (%' + trNum(st.atr14 / price * 100, 2) + ')' : ''));
  if (st.high24 > 0) bits.push('24s yüksek/düşük $' + trNum(st.high24, 0) + '/' + trNum(st.low24, 0));
  if (st.swingHigh > 0) bits.push('50s swing $' + trNum(st.swingHigh, 0) + '/' + trNum(st.swingLow, 0));
  if (st.ema20 > 0) bits.push('EMA20 $' + trNum(st.ema20, 0));
  if (st.ema50 > 0) bits.push('EMA50 $' + trNum(st.ema50, 0));
  if (st.trend) bits.push('trend ' + st.trend);
  return bits;
}

function formatMarketContext(data, spot = null, structures = {}) {
  const lines = [];
  const clock = istanbulClock();
  for (const sym of ['BTC', 'ETH']) {
    const s = spot && spot[sym];
    if (!s || !(s.price > 0)) continue;
    lines.push(sym + ' canlı: $' + trNum(s.price, sym === 'BTC' ? 0 : 2) +
      (s.changePct != null ? ' · 24s ' + (s.changePct >= 0 ? '+' : '') + trNum(s.changePct, 1) + '%' : '') +
      ' · ' + clock + ' TSİ · ' + s.source);
    const st = structures[sym];
    if (st) lines.push(sym + ' 1s yapı: ' + structureBits(st, s.price).join(' · '));
    else if (s.high24 > 0) lines.push(sym + ' 24s yüksek/düşük: $' + trNum(s.high24, 0) + '/' + trNum(s.low24, 0));
  }
  const gold = spot && spot.XAU && spot.XAU.price > 0 ? spot.XAU.price : (data.gold && data.gold.price);
  if (gold > 0) {
    lines.push('Altın (XAUUSD) canlı: $' + trNum(gold, 2) + ' · ' + clock + ' TSİ');
    const gs = structures.XAU;
    if (gs) lines.push('Altın 1s yapı: ' + structureBits(gs, gold).join(' · '));
    else if (spot?.XAU?.high24 > 0) lines.push('Altın 24s yüksek/düşük: $' + trNum(spot.XAU.high24, 2) + '/' + trNum(spot.XAU.low24, 2));
  }
  if (data.coinalyze?.cvd) {
    lines.push('Spot CVD (24s): ' + (data.coinalyze.cvd.coin ?? 0).toFixed(0) + ' BTC · ' + ((data.coinalyze.cvd.usd ?? 0) / 1e6).toFixed(1) + ' mn$');
  }
  if (data.coinalyze?.lsr) {
    lines.push('Long/Short: ' + (data.coinalyze.lsr.ratio ?? 0).toFixed(2) + ' · Long %' + (data.coinalyze.lsr.longPct ?? 0).toFixed(1) + ' / Short %' + (data.coinalyze.lsr.shortPct ?? 0).toFixed(1));
  }
  if (data.coinalyze?.oi) {
    const oi = data.coinalyze.oi.total;
    const prev = data.coinalyze.oiPrev?.total;
    let oiLine = 'Açık pozisyon: ' + (oi / 1e9).toFixed(2) + ' mlr$';
    if (prev && prev > 0) oiLine += ' · 24s ' + ((oi / prev - 1) * 100).toFixed(1) + '%';
    lines.push(oiLine);
  }
  if (data.coinalyze?.verdict) {
    lines.push('Yön: ' + data.coinalyze.verdict.bias + ' — ' + (data.coinalyze.verdict.reasons || []).join(', '));
  }
  if (data.orderbook?.bidWalls?.length) {
    const topBid = data.orderbook.bidWalls.reduce((a, b) => a[1] > b[1] ? a : b);
    const topAsk = data.orderbook.askWalls.length ? data.orderbook.askWalls.reduce((a, b) => a[1] > b[1] ? a : b) : null;
    lines.push('En büyük alış duvarı: $' + Number(topBid[0]).toLocaleString('tr-TR') + ' (' + Number(topBid[1]).toFixed(0) + ' BTC)');
    if (topAsk) lines.push('En büyük satış duvarı: $' + Number(topAsk[0]).toLocaleString('tr-TR') + ' (' + Number(topAsk[1]).toFixed(0) + ' BTC)');
  }
  if (data.orderbookError) lines.push('Order book verisi alınamadı: ' + data.orderbookError);
  return lines.join('\n');
}

export function planTopic(question) {
  const q = String(question || '').toLowerCase();
  if (/\bbtc\b|bitcoin/.test(q)) return 'btc';
  if (/\beth\b|ethereum/.test(q)) return 'eth';
  if (/altın|altin|gold|xau/.test(q)) return 'gold';
  return 'btc';
}

function planReference(topic, spot, structures) {
  const key = topic === 'gold' ? 'XAU' : topic === 'eth' ? 'ETH' : 'BTC';
  const symbol = key === 'XAU' ? 'XAUUSD' : key;
  const s = spot && spot[key];
  const st = structures && structures[key];
  return {
    symbol,
    price: s && s.price > 0 ? s.price : null,
    changePct: s ? s.changePct : null,
    atr: st ? st.atr14 : null,
    high24: st && st.high24 > 0 ? st.high24 : (s && s.high24 > 0 ? s.high24 : null),
    low24: st && st.low24 > 0 ? st.low24 : (s && s.low24 > 0 ? s.low24 : null),
    swingHigh: st ? st.swingHigh : null,
    swingLow: st ? st.swingLow : null,
    ema20: st ? st.ema20 : null,
    ema50: st ? st.ema50 : null,
    trend: st ? st.trend : null,
  };
}

function referenceLine(ref) {
  if (!ref || !(ref.price > 0)) return '';
  let s = ref.symbol + ' canlı $' + trNum(ref.price, ref.symbol === 'XAUUSD' ? 2 : 0);
  if (ref.changePct != null) s += ' (24s ' + (ref.changePct >= 0 ? '+' : '') + trNum(ref.changePct, 1) + '%)';
  const bits = structureBits({
    atr14: ref.atr, high24: ref.high24, low24: ref.low24,
    swingHigh: ref.swingHigh, swingLow: ref.swingLow,
    ema20: ref.ema20, ema50: ref.ema50, trend: ref.trend,
  }, ref.price);
  if (bits.length) s += ', ' + bits.join(', ');
  return s + '.';
}

function planFallback(answer, ref) {
  const kept = stripPlanLines(answer);
  const priceLine = ref && ref.price > 0
    ? ref.symbol + ' canlı: $' + trNum(ref.price, ref.symbol === 'XAUUSD' ? 2 : 0) +
      (ref.changePct != null ? ' · 24s ' + (ref.changePct >= 0 ? '+' : '') + trNum(ref.changePct, 1) + '%' : '')
    : '';
  return [priceLine, kept || 'Net bir setup yok.', '⚠️ Seviyeli plan canlı fiyatla tutarsız olduğu için paylaşılmadı.']
    .filter(Boolean).join('\n\n');
}

export async function answerQuestion(question, userId) {
  if (!question || question.trim().length < 3) return 'Lütfen bir soru yaz. Örnek: "BTC şu an hangi yöne baskın?"';
  if (!(await checkRateLimit(userId))) return 'Saatte en fazla 5 soru sorabilirsin. Lütfen biraz bekle.';

  const topic = planTopic(question);
  const [marketData, spot, btcStructure, ethStructure, goldStructure] = await Promise.all([
    getMarketData(), getSpotPrices(), getStructure('BTC'), getStructure('ETH'), getStructure('XAUT'),
  ]);
  const structures = { BTC: btcStructure, ETH: ethStructure, XAU: goldStructure };
  const context = formatMarketContext(marketData, spot, structures);
  const ref = planReference(topic, spot, structures);
  const strategies = await readStrategies();
  const stratContext = formatStrategiesForPrompt(strategies);
  const knowledge = await readKnowledge();
  const knowContext = formatKnowledgeForPrompt(knowledge, topic === 'gold' ? 'gold' : topic === 'btc' ? 'btc' : null);

  const system = [
    'Sen Alfa Traders piyasa analist asistanisin. Türkçe, kısa ve net cevap ver.',
    '',
    'CANLI VERİLER (tek doğru kaynak; buradaki fiyatı kullan, ezberden seviye uydurma):',
    context + stratContext + knowContext,
    '',
    'ZORUNLU ANALİZ KURALLARI:',
    '1. Fiyatı yalnızca yukarıdaki canlı fiyattan al. Canlı fiyat yoksa seviyeli plan verme.',
    '2. Girişi canlı fiyatın ±%5 aralığında seç. Seviyeleri ATR14, 24s yüksek/düşük ve swing seviyelerinden türet. ATR satırı yoksa 24s yüksek/düşük aralığını kullan; sırf ATR yok diye plan vermeyi reddetme.',
    '3. Yön ile seviyeler aynı yönde olmalı:',
    '   LONG/BULLISH: Stop < Giriş < Hedef',
    '   SHORT/BEARISH: Hedef < Giriş < Stop',
    '4. Stop mesafesi 1 saatlik ATR14’ün en az 0.5 katı, fiyatın en fazla %8’i olmalı. Hedef en az 1R (ödül/risk ≥ 1) ve fiyatın %30’undan uzak olmamalı.',
    '5. CVD, OI ve long/short verisi plan yönüyle çelişiyorsa bunu gerekçede açıkça söyle; çelişkiyi gizleme.',
    '6. Yalnızca canlı fiyat hiç yoksa plan verme. ATR/swing satırı eksikse planı 24s yüksek/düşük aralığıyla kur ve eksikliği gerekçede belirt. Sayı uydurma.',
    '',
    'CEVAP FORMATI:',
    '**Yön:** BULLISH / BEARISH / NÖTR',
    '**Giriş:** $X',
    '**Stop:** $X',
    '**Hedef:** $X',
    '**Gerekçe:** 1-2 cümle (hangi canlı veriye dayandığını belirt)',
    '**Verdict:** BULLISH / BEARISH / NÖTR',
    '',
    '- NÖTR ise Giriş/Stop/Hedef yazma; "net setup yok" de.',
    '- Stratejileri tek tek listeleme; doğrudan plan ver.',
    '- "Yatırım tavsiyesi değildir" deme (sistem ekliyor).',
    '- Yalnızca BTC, ETH ve altın (XAUUSD) verisi var; başka coin sorulursa "veri yok" de.',
  ].join('\n');

  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: question.trim() },
  ];

  try {
    const { groq } = await import('./macro/research.mjs');
    let answer = await groq(messages, { format: 'text', tokens: 700 });
    let check = validatePlan(parsePlan(answer), ref);
    if (!check.ok) {
      // Tek düzeltme denemesi: hata gerekçesi ve canlı referans açıkça verilir.
      try {
        const corrected = await groq([
          messages[0],
          messages[1],
          { role: 'assistant', content: answer },
          { role: 'user', content: 'Önceki cevap reddedildi: ' + describePlanErrors(check.errors) + '. ' + referenceLine(ref) + ' Aynı formatta düzeltilmiş cevabı yaz. Sadece düzeltilmiş plan metnini döndür.' },
        ], { format: 'text', tokens: 700 });
        const recheck = validatePlan(parsePlan(corrected), ref);
        answer = recheck.ok ? corrected : planFallback(corrected || answer, ref);
      } catch (e) {
        answer = planFallback(answer, ref);
      }
    }
    return answer + '\n\n⚠️ Bu bir yatırım tavsiyesi değildir.';
  } catch (e) {
    return 'Cevap üretilemedi: ' + String(e.message || e).slice(0, 120);
  }
}

export async function handleTelegramUpdate(update) {
  const msg = update?.message || update?.edited_message;
  if (!msg) return null;
  // Fotoğraf mesajları: caption varsa işle, yoksa bilgi ver
  const hasPhoto = Array.isArray(msg.photo) && msg.photo.length > 0;
  if (!msg.text && !msg.caption && !hasPhoto) return null;
  const chatId = msg.chat?.id;
  const threadId = msg.message_thread_id || null;
  const userId = msg.from?.id;
  const text = (msg.text || msg.caption || '').trim();
  if (!text && hasPhoto) {
    // Sadece fotoğraf gönderilmiş, metin yok
    return { chatId, threadId, reply: 'Fotoğraf aldım. Ne hakkında yorum yapmamı istiyorsun? Sorunu yaz, fotoğrafı da ekleyebilirsin.' };
  }

  // Yalnızca izin verilen chat'te veya DM'de cevap ver
  const allowedChat = process.env.TG_QA_CHAT_ID || process.env.TG_CHAT_ID;
  const isPrivate = msg.chat?.type === 'private';
  if (!isPrivate && allowedChat && String(chatId) !== String(allowedChat)) return null;
  const allowedThread = process.env.TG_QA_THREAD;
  if (!isPrivate && allowedThread && threadId && String(threadId) !== String(allowedThread)) return null;

  // Komutlar
  if (text === '/start' || text === '/help') {
    return {
      chatId, threadId,
      reply: 'Merhaba! Ben Alfa Traders piyasa asistanıyım. BTC, ETH, altın ve makro veriler hakkında soru sorabilirsin.\n\nKomutlar:\n/ask <soru> - Soru sor\n/data - Güncel piyasa verileri\n/strateji - Stratejileri listele/ekle/sil\n/ogren <not> - Bot\'a bilgi öğret\n/help - Yardım\n\nÖrnek: /ask BTC şu an hangi yöne baskın?\n\nSaatte en fazla 5 soru sorabilirsin.',
    };
  }

  if (text === '/data') {
    const [marketData, spot, btcStructure, ethStructure, goldStructure] = await Promise.all([
      getMarketData(), getSpotPrices(), getStructure('BTC'), getStructure('ETH'), getStructure('XAUT'),
    ]);
    const context = formatMarketContext(marketData, spot, { BTC: btcStructure, ETH: ethStructure, XAU: goldStructure });
    return { chatId, threadId, reply: '📊 Güncel Piyasa Verileri:\n\n' + context + '\n\n⚠️ Bu bir yatırım tavsiyesi değildir.' };
  }

  // /strateji komutu: stratejileri listele/ekle/sil
  if (text === '/strateji' || text === '/strategy') {
    const strategies = await readStrategies();
    if (!strategies.length) return { chatId, threadId, reply: 'Henüz strateji eklenmemiş. Eklemek için:\n/strateji ekle <isim> | <açıklama>\n\nÖrnek: /strateji ekle CVD Momentum | Spot CVD işlem yönünde ve OI artıyorsa giriş yap' };
    return { chatId, threadId, reply: '📋 Stratejilerin:\n\n' + strategies.map(s => '• ' + s.name + ': ' + s.description).join('\n') + '\n\nEklemek için: /strateji ekle <isim> | <açıklama>\nSilmek için: /strateji sil <isim>' };
  }
  if (text.startsWith('/strateji ekle ') || text.startsWith('/strategy add ')) {
    const parts = text.replace(/^\/strateji ekle |^\/strategy add /, '').split('|');
    const name = (parts[0] || '').trim();
    const desc = (parts[1] || '').trim();
    if (!name || !desc) return { chatId, threadId, reply: 'Format: /strateji ekle <isim> | <açıklama>' };
    const ok = await addStrategy(name, desc);
    return { chatId, threadId, reply: ok ? '✅ Strateji eklendi: ' + name : '❌ Strateji kaydedilemedi.' };
  }
  if (text.startsWith('/strateji sil ') || text.startsWith('/strategy remove ')) {
    const name = text.replace(/^\/strateji sil |^\/strategy remove /, '').trim();
    if (!name) return { chatId, threadId, reply: 'Format: /strateji sil <isim>' };
    const ok = await removeStrategy(name);
    return { chatId, threadId, reply: ok ? '✅ Strateji silindi: ' + name : '❌ Strateji bulunamadı.' };
  }
  // /ask komutu
  if (text.startsWith('/ask ')) {
    const question = text.slice(5).trim();
    const answer = await answerQuestion(question, userId);
    return { chatId, threadId, reply: answer };
  }

  // /öğren komutu: not ekle
  if (text.startsWith('/ogren ') || text.startsWith('/learn ')) {
    const note = text.replace(/^\/ogren |^\/learn /, '').trim();
    if (note.length < 5) return { chatId, threadId, reply: 'Format: /ogren <not>' };
    const topic = /altın|gold|xau/i.test(note) ? 'gold' : /btc|bitcoin/i.test(note) ? 'btc' : 'genel';
    const ok = await addNote(note, topic);
    return { chatId, threadId, reply: ok ? 'Not kaydedildi. Bot artık bu bilgiyi dikkate alacak.' : 'Not kaydedilemedi.' };
  }

  // Fotoğraf mesajı: analiz et ve sakla
  if (hasPhoto) {
    const caption = text || 'Bu grafiği analiz et ve önemli seviyeleri belirt.';
    const topic = /altın|gold|xau/i.test(caption) ? 'gold' : /btc|bitcoin/i.test(caption) ? 'btc' : 'genel';
    try {
      const fileRes = await fetch('https://api.telegram.org/bot' + process.env.TG_BOT_TOKEN + '/getFile?file_id=' + msg.photo[msg.photo.length - 1].file_id);
      const fileData = await fileRes.json();
      if (fileData.ok) {
        const filePath = fileData.result.file_path;
        const imgRes = await fetch('https://api.telegram.org/file/bot' + process.env.TG_BOT_TOKEN + '/' + filePath);
        const imgBuf = await imgRes.arrayBuffer();
        const base64 = Buffer.from(imgBuf).toString('base64');
        const analysis = await analyzeChart(base64, caption);
        await addImageAnalysis(analysis, topic);
        return { chatId, threadId, reply: 'Grafik analiz edildi ve kaydedildi:\n\n' + analysis };
      }
    } catch (e) {
      console.error('photo analysis error:', e?.message || e);
    }
    if (caption.length >= 3) {
      await addNote('Grafik notu: ' + caption, topic);
      return { chatId, threadId, reply: 'Not kaydedildi (fotograf analiz edilemedi). Bot artik bu bilgiyi dikkate alacak.' };
    }
    return { chatId, threadId, reply: 'Fotograf aldim. Caption ile gonder veya /ogren <not> kullan.' };
  }

  // Soru olarak işle (sadece DM'de veya bot mention'ında)
  const isQaTopic = allowedChat && String(chatId) === String(allowedChat);
  const isMention = text.includes('@alfaportfoy_bot');

  if (isQaTopic || isPrivate || isMention) {
    const cleanText = text.replace(/@alfaportfoy_bot/g, '').trim();
    const answer = await answerQuestion(cleanText, userId);
    return { chatId, threadId, reply: answer };
  }

  // Grup mesajı ve komut değilse sessiz kal
  return null;
}
