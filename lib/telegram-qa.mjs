// Telegram soru-cevap botu.
// Kullanicilarin piyasa sorularini mevcut veriler esliginde AI ile cevaplar.
import { groq } from './macro/research.mjs';
import { readStrategies, formatStrategiesForPrompt, addStrategy, removeStrategy } from './telegram-qa-strategies.mjs';
import { readKnowledge, addNote, addImageAnalysis, formatKnowledgeForPrompt, analyzeChart } from './telegram-qa-knowledge.mjs';
import { collectCoinalyzeData } from './coinalyze.mjs';
import { collectOrderbookLevels } from './orderbook-levels.mjs';
import { parsePlan, validatePlan, describePlanErrors, stripPlanLines } from './trade-plan.mjs';
import { structureFromCandles, lastImpulse, fibSet, fvgs, nearestLevels, inIfvgWindow, istanbulTime } from './market-structure.mjs';

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

// Çok zaman dilimli mum üreticileri. Borsalar bölgeye göre 451/403 dönebildiği
// için sırayla değil paralel denenir; ilk geçerli sonuç kullanılır.
const TF_MAP = {
  Binance: { '5m': '5m', '15m': '15m', '1h': '1h', '4h': '4h' },
  OKX: { '5m': '5m', '15m': '15m', '1h': '1H', '4h': '4H' },
  Bybit: { '5m': '5', '15m': '15', '1h': '60', '4h': '240' },
  Coinbase: { '5m': 300, '15m': 900, '1h': 3600, '4h': 14400 },
};
const CANDLE_SOURCES = [
  {
    name: 'Binance',
    supports: ['BTC', 'ETH'],
    url: (s, tf) => 'https://api.binance.com/api/v3/klines?symbol=' + s + 'USDT&interval=' + TF_MAP.Binance[tf] + '&limit=200',
    rows: j => j,
    map: x => ({ h: Number(x[2]), l: Number(x[3]), c: Number(x[4]) }),
  },
  {
    name: 'OKX',
    supports: ['BTC', 'ETH', 'XAUT'],
    url: (s, tf) => 'https://www.okx.com/api/v5/market/candles?instId=' + s + '-USDT&bar=' + TF_MAP.OKX[tf] + '&limit=200',
    rows: j => j && j.data,
    map: x => ({ h: Number(x[2]), l: Number(x[3]), c: Number(x[4]) }),
    newestFirst: true,
  },
  {
    name: 'Bybit',
    supports: ['BTC', 'ETH', 'XAUT'],
    url: (s, tf) => 'https://api.bybit.com/v5/market/kline?category=spot&symbol=' + s + 'USDT&interval=' + TF_MAP.Bybit[tf] + '&limit=200',
    rows: j => j && j.result && j.result.list,
    map: x => ({ h: Number(x[2]), l: Number(x[3]), c: Number(x[4]) }),
    newestFirst: true,
  },
  {
    name: 'Coinbase',
    supports: ['BTC', 'ETH'],
    url: (s, tf) => 'https://api.exchange.coinbase.com/products/' + s + '-USD/candles?granularity=' + TF_MAP.Coinbase[tf],
    rows: j => j,
    map: x => ({ h: Number(x[2]), l: Number(x[1]), c: Number(x[4]) }),
    newestFirst: true,
  },
];

const BARS_PER_DAY = { '5m': 288, '15m': 96, '1h': 24, '4h': 6 };
const candleCache = {};

export async function getCandles(symbol, interval = '1h') {
  const key = symbol + ':' + interval;
  const hit = candleCache[key];
  if (hit && Date.now() - hit.at < 60000) return hit;
  const attempts = CANDLE_SOURCES
    .filter(source => source.supports.includes(symbol))
    .map(async source => {
      const r = await fetch(source.url(symbol, interval), { signal: AbortSignal.timeout(6000) });
      if (!r.ok) return null;
      const j = await r.json();
      const rows = source.rows(j);
      if (!Array.isArray(rows)) return null;
      const candles = rows.map(source.map).filter(c => c.c > 0 && c.h > 0 && c.l > 0);
      if (source.newestFirst) candles.reverse();
      return candles.length >= 60 ? { candles, source: source.name } : null;
    });
  const results = await Promise.all(attempts.map(p => p.catch(() => null)));
  const best = results.find(Boolean) || null;
  const entry = best
    ? { at: Date.now(), candles: best.candles, source: best.source }
    : { at: Date.now(), candles: null, source: null };
  candleCache[key] = entry;
  return entry;
}

async function getStructure(symbol, interval = '1h') {
  const key = symbol + ':' + interval;
  const hit = structureCache[key];
  if (hit && Date.now() - hit.at < 60000) return hit.data;
  const { candles } = await getCandles(symbol, interval);
  const data = candles ? structureFromCandles(candles, BARS_PER_DAY[interval] || 24) : null;
  structureCache[key] = { at: Date.now(), data };
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

function symbolDigits(symbol) {
  return symbol === 'XAUUSD' ? 2 : symbol === 'ETH' ? 2 : 0;
}
function px(n, symbol = 'BTC') {
  return Number(n) > 0 ? '$' + trNum(n, symbolDigits(symbol)) : '—';
}

function fibText(candles, symbol) {
  const leg = lastImpulse(candles);
  if (!leg) return '';
  const f = fibSet(leg.start, leg.end);
  return (leg.direction === 'up' ? 'yukarı' : 'aşağı') + ' itki ' + px(leg.start, symbol) + '→' + px(leg.end, symbol) +
    ' · fib 0.382 ' + px(f.r382, symbol) + ' / 0.5 ' + px(f.r5, symbol) +
    ' / 0.618 ' + px(f.r618, symbol) + ' / 0.805 ' + px(f.r805, symbol);
}

function fvgText(candles, symbol) {
  const gaps = fvgs(candles, { limit: 10 });
  if (!gaps.length) return 'son 10 mumda FVG yok';
  return gaps.slice(-3).map(g => {
    const label = g.type === 'bull'
      ? (g.inverted ? 'ters FVG (direnç)' : 'FVG (destek)')
      : (g.inverted ? 'ters FVG (destek)' : 'FVG (direnç)');
    const age = candles.length - 1 - g.index;
    return label + ' ' + px(g.bottom, symbol) + '–' + px(g.top, symbol) + ' (' + age + ' mum önce)';
  }).join(' · ');
}

// Kullanıcının kendi stratejilerine göre hazırlanan çok zaman dilimli bağlam.
export function formatStrategyContext(topic, detail, structures, spot, marketData, now = new Date()) {
  const key = topic === 'gold' ? 'XAU' : topic === 'eth' ? 'ETH' : 'BTC';
  const symbol = key === 'XAU' ? 'XAUUSD' : key;
  const s = spot && spot[key];
  const price = s && s.price > 0 ? s.price : null;
  const lines = [];
  const clock = istanbulTime(now);
  const windowOpen = inIfvgWindow(now);
  const hhmm = String(clock.hour).padStart(2, '0') + ':' + String(clock.minute).padStart(2, '0');
  lines.push('Saat ' + hhmm + ' TSİ · IFVG penceresi 08:00–12:00: ' + (windowOpen ? 'AÇIK' : 'KAPALI'));

  const h4 = detail && detail['4h'] && detail['4h'].candles;
  const m15 = detail && detail['15m'] && detail['15m'].candles;
  const m5 = detail && detail['5m'] && detail['5m'].candles;
  const h1 = structures && structures[key];

  if (h4) {
    const st = structureFromCandles(h4, 6);
    const fib = fibText(h4, symbol);
    lines.push('4s HTF: trend ' + st.trend + ' · ATR14 ' + px(st.atr14, symbol) +
      ' · 4s aralık ' + px(st.low24, symbol) + '–' + px(st.high24, symbol) + (fib ? ' · ' + fib : ''));
  }
  if (h1) {
    lines.push('1s: trend ' + h1.trend + ' · ATR14 ' + px(h1.atr14, symbol) +
      ' · 50s swing ' + px(h1.swingLow, symbol) + '–' + px(h1.swingHigh, symbol) +
      ' · 24s ' + px(h1.low24, symbol) + '–' + px(h1.high24, symbol));
  }
  if (m15) {
    const st = structureFromCandles(m15, 96);
    const levels = price ? nearestLevels(m15, price) : null;
    const fib = fibText(m15, symbol);
    lines.push('15m: ATR14 ' + px(st.atr14, symbol) +
      ' · swing ' + px(st.swingLow, symbol) + '–' + px(st.swingHigh, symbol) +
      (levels && levels.high ? ' · üst likidite ' + px(levels.high, symbol) : '') +
      (levels && levels.low ? ' · alt likidite ' + px(levels.low, symbol) : '') +
      (fib ? ' · ' + fib : ''));
  }
  if (m5) {
    const st = structureFromCandles(m5, 288);
    lines.push('5m: ATR14 ' + px(st.atr14, symbol) + ' · ' + fvgText(m5, symbol));
  }

  const cvd = marketData && marketData.coinalyze && marketData.coinalyze.cvd;
  const oi = marketData && marketData.coinalyze && marketData.coinalyze.oi && marketData.coinalyze.oi.total;
  const oiPrev = marketData && marketData.coinalyze && marketData.coinalyze.oiPrev && marketData.coinalyze.oiPrev.total;
  if (cvd) {
    const val = Number(cvd.usd != null ? cvd.usd : cvd.coin);
    const oiPct = oi > 0 && oiPrev > 0 ? (oi / oiPrev - 1) * 100 : null;
    const cvdDir = val > 0 ? 'pozitif (long)' : val < 0 ? 'negatif (short)' : 'nötr';
    const oiDir = oiPct == null ? 'bilinmiyor' : oiPct > 0 ? 'artıyor' : oiPct < 0 ? 'azalıyor' : 'yatay';
    const aligned = Number.isFinite(val) && val !== 0 && oiPct != null && Math.sign(val) === Math.sign(oiPct);
    lines.push('CVD Momentum şartı: CVD ' + cvdDir + ' · OI ' + oiDir +
      (oiPct == null ? '' : ' (%' + trNum(oiPct, 1) + ')') + ' → ' +
      (aligned ? 'UYGUN (' + (val > 0 ? 'long' : 'short') + ')' : 'UYGUN DEĞİL (CVD ve OI aynı yönde değil)'));
  } else {
    lines.push('CVD Momentum şartı: CVD/OI verisi yok');
  }

  if (h4 && price) {
    const leg = lastImpulse(h4);
    if (leg) {
      const f = fibSet(leg.start, leg.end);
      const atr4 = structureFromCandles(h4, 6).atr14;
      const lo = Math.min(f.r382, f.r5), hi = Math.max(f.r382, f.r5);
      const dist = price < lo ? lo - price : price > hi ? price - hi : 0;
      const where = dist === 0
        ? '0.382–0.5 geri çekilme bölgesinde'
        : dist <= atr4 * 0.75 ? 'bölgeye yakın (' + px(dist, symbol) + ')' : 'bölgeden uzak (' + px(dist, symbol) + ')';
      lines.push('0.382 şartı: fiyat ' + where + ' · giriş bölgesi ' + px(lo, symbol) + '–' + px(hi, symbol) +
        ' · geçersizlik/stop referansı 0.805 ' + px(f.r805, symbol));
    }
  }

  if (topic === 'btc') {
    lines.push('IFVG şartı: BTC’de 5m IFVG kullanılmıyor (kullanıcı notu) — BTC planı 0.382 veya CVD Momentum’a dayanmalı');
  } else if (m5 && price) {
    const st5 = structureFromCandles(m5, 288);
    const inverted = fvgs(m5, { limit: 20 }).filter(g => g.inverted);
    const last = inverted[inverted.length - 1];
    if (!last) {
      lines.push('IFVG şartı: son 20 mumda ters FVG yok');
    } else {
      const dist = price < last.bottom ? last.bottom - price : price > last.top ? price - last.top : 0;
      const near = dist <= st5.atr14 * 0.75;
      lines.push('IFVG şartı: son ters FVG ' + px(last.bottom, symbol) + '–' + px(last.top, symbol) +
        ' · fiyat ' + (near ? 'retest mesafesinde' : 'bölgeden uzak (' + px(dist, symbol) + ')') +
        ' · pencere ' + (windowOpen ? 'AÇIK' : 'KAPALI'));
    }
  }

  if (h1 && price) {
    const lv = nearestLevels(h1, price, { lookback: 100 });
    if (lv.high || lv.low) {
      lines.push('Likidite: üst ' + (lv.high ? px(lv.high, symbol) : 'yok') + ' · alt ' + (lv.low ? px(lv.low, symbol) : 'yok'));
    }
  }
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
  if (ref.atr5m > 0) bits.push('5m ATR14 $' + trNum(ref.atr5m, 0));
  if (bits.length) s += ', ' + bits.join(', ');
  return s + '.';
}

function planRefFor(plan, ref) {
  const strat = String((plan && plan.strategy) || '').toLowerCase();
  let atr = ref.atr;
  if (/ifvg/.test(strat) && ref.atr5m > 0) atr = ref.atr5m;
  return { ...ref, atr, requireStrategy: true };
}

function planFallback(answer, ref) {
  const kept = stripPlanLines(answer);
  const priceLine = ref && ref.price > 0
    ? ref.symbol + ' canlı: $' + trNum(ref.price, ref.symbol === 'XAUUSD' ? 2 : 0) +
      (ref.changePct != null ? ' · 24s ' + (ref.changePct >= 0 ? '+' : '') + trNum(ref.changePct, 1) + '%' : '')
    : '';
  return [priceLine, kept || 'Net bir setup yok.', '⚠️ Seviyeli plan canlı fiyat/strateji kurallarıyla tutarsız olduğu için paylaşılmadı.']
    .filter(Boolean).join('\n\n');
}

export async function answerQuestion(question, userId) {
  if (!question || question.trim().length < 3) return 'Lütfen bir soru yaz. Örnek: "BTC şu an hangi yöne baskın?"';
  if (!(await checkRateLimit(userId))) return 'Saatte en fazla 5 soru sorabilirsin. Lütfen biraz bekle.';

  const topic = planTopic(question);
  const topicKey = topic === 'gold' ? 'XAUT' : topic === 'eth' ? 'ETH' : 'BTC';
  const detailTfs = topic === 'btc' ? ['4h', '15m'] : ['4h', '15m', '5m'];
  const [marketData, spot, btcStructure, ethStructure, goldStructure, ...detailRows] = await Promise.all([
    getMarketData(), getSpotPrices(), getStructure('BTC'), getStructure('ETH'), getStructure('XAUT'),
    ...detailTfs.map(tf => getCandles(topicKey, tf)),
  ]);
  const detail = {};
  detailTfs.forEach((tf, i) => { detail[tf] = detailRows[i]; });
  const structures = { BTC: btcStructure, ETH: ethStructure, XAU: goldStructure };
  const context = formatMarketContext(marketData, spot, structures);
  const strategyContext = formatStrategyContext(topic, detail, structures, spot, marketData);
  const ref = planReference(topic, spot, structures);
  if (detail['4h']?.candles) ref.atr4h = structureFromCandles(detail['4h'].candles, 6).atr14;
  if (detail['15m']?.candles) ref.atr15m = structureFromCandles(detail['15m'].candles, 96).atr14;
  if (detail['5m']?.candles) ref.atr5m = structureFromCandles(detail['5m'].candles, 288).atr14;
  const strategies = await readStrategies();
  const stratContext = formatStrategiesForPrompt(strategies);
  const knowledge = await readKnowledge();
  const knowContext = formatKnowledgeForPrompt(knowledge, topic === 'gold' ? 'gold' : topic === 'btc' ? 'btc' : null);

  const system = [
    'Sen Alfa Traders piyasa analist asistanisin. Türkçe, kısa ve net cevap ver.',
    '',
    'CANLI VERİLER (tek doğru kaynak; buradaki fiyatı kullan, ezberden seviye uydurma):',
    context,
    '',
    'ÇOK ZAMAN DİLİMLİ YAPI VE STRATEJİ UYGUNLUĞU:',
    strategyContext,
    stratContext,
    knowContext,
    '',
    'KULLANICININ STRATEJİLERİNİ UYGULA:',
    '- Planı mutlaka CVD Momentum, 0.382 veya IFVG stratejilerinden birine dayandır ve **Strateji:** satırında adını yaz.',
    '- CVD Momentum: Spot CVD ile OI aynı yönde artmıyorsa bu stratejiyle işlem yok.',
    '- 0.382: 4s/1s son itkinin 0.382–0.5 geri çekilme bölgesinden gir; stop 0.805 fib veya son swing dışında; hedef likidite (son swing/24s yüksek-düşük).',
    '- IFVG: 5m ters FVG retesti + 15m destek/direnç + 08:00–12:00 TSİ şartı. BTC’de 5m IFVG kullanılmıyor.',
    '- Strateji şartları uyuşmuyorsa plan zorlama; "setup yok" de.',
    '',
    'ZORUNLU ANALİZ KURALLARI:',
    '1. Fiyatı yalnızca canlı fiyattan al. Canlı fiyat yoksa seviyeli plan verme.',
    '2. Giriş canlı fiyatın ±%5’inde ve yukarıdaki fib/IFVG/likidite seviyelerinden birinde olmalı. Keyfi yuvarlak sayı yazma.',
    '3. Yön ile seviyeler aynı yönde: LONG Stop < Giriş < Hedef; SHORT Hedef < Giriş < Stop.',
    '4. Stop keyfi sıkı olamaz: en az 1×1s ATR14 (IFVG’de 1×5m ATR14) ve yapısal geçersizlik (0.805 fib / son swing) dışında olmalı. Fiyatın %8’inden uzak olamaz.',
    '5. Hedef likidite bölgesi olmalı; en az 1R. Fiyatın %30’undan uzak olmamalı.',
    '6. Tek yönlü bakış yasak: long ve short için tetik/geçersizlik seviyesi belirt; veri hangisini destekliyorsa onu planla. Çelişkiyi gizleme.',
    '7. Eski notlardaki fiyatlar (73970, 73100, 76400 gibi) güncel seviye DEĞİLDİR; sadece yöntem örneği. Seviyeleri canlı veriden yeniden hesapla.',
    '8. ATR/swing satırı eksikse 24s yüksek/düşük ile kur ve eksikliği söyle. Sayı uydurma.',
    '',
    'CEVAP FORMATI (plan varsa):',
    '**Strateji:** CVD Momentum / 0.382 / IFVG',
    '**Yön:** BULLISH / BEARISH',
    '**Giriş:** $X',
    '**Stop:** $X',
    '**Hedef:** $X',
    '**R/R:** 1:X',
    '**Gerekçe:** 1-2 cümle (hangi canlı veri + strateji)',
    '**Karşı senaryo:** hangi seviyede bu plan geçersiz olur',
    '**Verdict:** BULLISH / BEARISH',
    '',
    '- Setup yoksa Giriş/Stop/Hedef yazma; **Strateji:** yok ve "net setup yok" de.',
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
    let answer = await groq(messages, { format: 'text', tokens: 900 });
    const firstPlan = parsePlan(answer);
    let check = validatePlan(firstPlan, planRefFor(firstPlan, ref));
    if (!check.ok) {
      // Tek düzeltme denemesi: hata gerekçesi ve canlı referans açıkça verilir.
      try {
        const corrected = await groq([
          messages[0],
          messages[1],
          { role: 'assistant', content: answer },
          { role: 'user', content: 'Önceki cevap reddedildi: ' + describePlanErrors(check.errors) + '. ' + referenceLine(ref) + ' Strateji kurallarına ve yapıya uygun, aynı formatta düzeltilmiş cevabı yaz. Sadece düzeltilmiş plan metnini döndür.' },
        ], { format: 'text', tokens: 900 });
        const correctedPlan = parsePlan(corrected);
        const recheck = validatePlan(correctedPlan, planRefFor(correctedPlan, ref));
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
