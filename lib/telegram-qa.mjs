// Telegram soru-cevap botu.
// Kullanicilarin piyasa sorularini mevcut veriler esliginde AI ile cevaplar.
import { groq } from './macro/research.mjs';
import { readStrategies, formatStrategiesForPrompt, addStrategy, removeStrategy } from './telegram-qa-strategies.mjs';
import { readKnowledge, addNote, addImageAnalysis, formatKnowledgeForPrompt, analyzeChart } from './telegram-qa-knowledge.mjs';
import { collectCoinalyzeData } from './coinalyze.mjs';
import { collectOrderbookLevels } from './orderbook-levels.mjs';
import { parsePlan, validatePlan, describePlanErrors, stripPlanLines } from './trade-plan.mjs';
import { structureFromCandles, fvgs } from './market-structure.mjs';
import { CANONICAL_V16, closedBars, analyzeV16, formatV16Report } from './alpha-strategy-v16.mjs';

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
    map: x => ({ t: Number(x[0]), o: Number(x[1]), h: Number(x[2]), l: Number(x[3]), c: Number(x[4]), v: Number(x[5]) }),
  },
  {
    name: 'OKX',
    supports: ['BTC', 'ETH', 'XAUT'],
    url: (s, tf) => 'https://www.okx.com/api/v5/market/candles?instId=' + s + '-USDT&bar=' + TF_MAP.OKX[tf] + '&limit=200',
    rows: j => j && j.data,
    map: x => ({ t: Number(x[0]), o: Number(x[1]), h: Number(x[2]), l: Number(x[3]), c: Number(x[4]), v: Number(x[5]), confirmed: x[8] === '1' }),
    newestFirst: true,
  },
  {
    name: 'Bybit',
    supports: ['BTC', 'ETH', 'XAUT'],
    url: (s, tf) => 'https://api.bybit.com/v5/market/kline?category=spot&symbol=' + s + 'USDT&interval=' + TF_MAP.Bybit[tf] + '&limit=200',
    rows: j => j && j.result && j.result.list,
    map: x => ({ t: Number(x[0]), o: Number(x[1]), h: Number(x[2]), l: Number(x[3]), c: Number(x[4]), v: Number(x[5]) }),
    newestFirst: true,
  },
  {
    name: 'Coinbase',
    supports: ['BTC', 'ETH'],
    url: (s, tf) => 'https://api.exchange.coinbase.com/products/' + s + '-USD/candles?granularity=' + TF_MAP.Coinbase[tf],
    rows: j => j,
    map: x => ({ t: Number(x[0]) * 1000, o: Number(x[3]), h: Number(x[2]), l: Number(x[1]), c: Number(x[4]), v: Number(x[5]) }),
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
      const completed = closedBars(candles, interval, Date.now());
      return completed.length >= 60 ? { candles: completed, source: source.name } : null;
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

// Piyasa verisi topla (cache: 10 dk). Optional sources run independently.
let cachedData = null;
let cachedAt = 0;
async function getMarketData() {
  if (cachedData && Date.now() - cachedAt < 600000) return cachedData;
  const data = {};
  const [coinalyze, orderbook, gold] = await Promise.allSettled([
    collectCoinalyzeData(Date.now(), process.env.COINALYZE_API_KEY),
    collectOrderbookLevels(),
    (async () => {
      const r = await fetch('https://api.gold-api.com/price/XAU', { signal: AbortSignal.timeout(5000) });
      if (!r.ok) throw new Error('gold_' + r.status);
      const j = await r.json();
      return j?.price ? { price: Number(j.price), updatedAt: j.updatedAt || null } : null;
    })(),
  ]);
  for (const [name, result] of [['coinalyze', coinalyze], ['orderbook', orderbook], ['gold', gold]]) {
    if (result.status === 'fulfilled') data[name] = result.value;
    else data[name + 'Error'] = String(result.reason?.message || result.reason).slice(0, 100);
  }
  data.fetchedAt = new Date().toISOString();
  cachedData = data;
  cachedAt = Date.now();
  return data;
}

function structureBits(st, price = 0) {
  const bits = [];
  if (st.atr14 > 0) bits.push('ATR14 $' + trNum(st.atr14, 0) + (price > 0 ? ' (%' + trNum(st.atr14 / price * 100, 2) + ')' : ''));
  if (st.high24 > 0) bits.push('24 saat yüksek/düşük $' + trNum(st.high24, 0) + '/' + trNum(st.low24, 0));
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
      (s.changePct != null ? ' · 24 saat ' + (s.changePct >= 0 ? '+' : '') + trNum(s.changePct, 1) + '%' : '') +
      ' · ' + clock + ' TSİ · ' + s.source);
    const st = structures[sym];
    if (st) lines.push(sym + ' 1 saat yapı: ' + structureBits(st, s.price).join(' · '));
    else if (s.high24 > 0) lines.push(sym + ' 24 saat yüksek/düşük: $' + trNum(s.high24, 0) + '/' + trNum(s.low24, 0));
  }
  const gold = spot && spot.XAU && spot.XAU.price > 0 ? spot.XAU.price : (data.gold && data.gold.price);
  if (gold > 0) {
    lines.push('Altın (XAUUSD) canlı: $' + trNum(gold, 2) + ' · ' + clock + ' TSİ');
    const gs = structures.XAU;
    if (gs) lines.push('Altın 1 saat yapı: ' + structureBits(gs, gold).join(' · '));
    else if (spot?.XAU?.high24 > 0) lines.push('Altın 24 saat yüksek/düşük: $' + trNum(spot.XAU.high24, 2) + '/' + trNum(spot.XAU.low24, 2));
  }
  if (data.coinalyze?.cvd) {
    lines.push('Spot CVD (24 saat): ' + (data.coinalyze.cvd.coin ?? 0).toFixed(0) + ' BTC · ' + ((data.coinalyze.cvd.usd ?? 0) / 1e6).toFixed(1) + ' mn$');
  }
  if (data.coinalyze?.lsr) {
    lines.push('Long/Short: ' + (data.coinalyze.lsr.ratio ?? 0).toFixed(2) + ' · Long %' + (data.coinalyze.lsr.longPct ?? 0).toFixed(1) + ' / Short %' + (data.coinalyze.lsr.shortPct ?? 0).toFixed(1));
  }
  if (data.coinalyze?.oi) {
    const oi = data.coinalyze.oi.total;
    const prev = data.coinalyze.oiPrev?.total;
    let oiLine = 'Açık pozisyon: ' + (oi / 1e9).toFixed(2) + ' mlr$';
    if (prev && prev > 0) oiLine += ' · 24 saat ' + ((oi / prev - 1) * 100).toFixed(1) + '%';
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
  const lines = ['v16: yalnız kapanmış mumlar; pivot/IFVG gözlemi tek başına sinyal değildir.'];
  for (const [tf, row] of Object.entries(detail || {})) {
    const bars = closedBars(row?.candles, tf, now.getTime());
    const st = structureFromCandles(bars, BARS_PER_DAY[tf] || 24);
    lines.push(`${tf} ${row?.source || 'kaynak yok'}; son kapanış ${bars.at(-1)?.closeTime ? new Date(bars.at(-1).closeTime).toISOString() : 'yok'}; ` +
      (st ? `betimsel trend ${st.trend}, aralık ${st.swingLow}–${st.swingHigh}; ATR yalnız ölçüm ${st.atr14}` : 'yetersiz mum'));
    if (bars.length && ['15m', '5m'].includes(tf)) lines.push(tf + ' gözlem: ' + fvgText(bars, topic));
  }
  lines.push('M1 IFVG / M3 HTF POI / M4 Wyckoff ayrı yorumlanır; 2.5R yalnız M2. Eski CVD Momentum notları yardımcı bağlamdır, M2 filtresi değildir.');
  lines.push('Weekly/daily location verisi bu akışta yoksa mevcut değil de; HTF zone uydurma.');
  lines.push('Ek veri (zorunlu değil): ' + JSON.stringify({
    fetchedAt: marketData?.fetchedAt || null,
    orderbookSource: marketData?.orderbook?.source || 'mevcut değil',
    orderbookFetchedAt: marketData?.orderbook?.fetchedAt || null,
    oi: marketData?.coinalyze?.oi || 'mevcut değil',
    oiSource: marketData?.coinalyze?.oiSelected || 'mevcut değil',
    coinalyzeAt: marketData?.coinalyze?.at || null,
    cvdScope: 'Coinalyze BTC spot; ETH/altına doğrudan atfetme',
    funding: marketData?.funding || 'mevcut değil',
    cvd: marketData?.coinalyze?.cvd || 'mevcut değil',
    realizedLiquidations: marketData?.liquidations || 'mevcut değil',
    onchain: marketData?.onchain || 'mevcut değil',
  }));
  return lines.join('\n');
}

export const TELEGRAM_ANALYSIS_STYLE = `TELEGRAM SOHBET AMACI:
Kullanıcı "BTC hakkında fikrin nedir?" dediğinde v16'ya göre piyasa yorumu bekliyor; otomatik emir veya teknik denetim raporu değil.
Önce HTF fiyat yapısına göre görüşünü ve nedenini söyle; sonra kanıtlı seviyelerle long/short senaryolarını, likiditeyi ve fikrini neyin değiştireceğini açıkla.
M1/M2/M3/M4'ü ders gibi listeleme; grafikte ilgili olan modeli ayrı adıyla yorumla.
Belirsiz M2 anchor/pullback yalnız kesin giriş/stop/TP planını engeller; piyasa yorumunu ve iki senaryoyu ENGELLEMEZ.
Kullanıcıdan manuel etiketleme isteme. Eksik kanıtı doğal dille tek cümlede belirt; "NEEDS_REVIEW, analiz yapamam" cevabına sığınma.
Varsayılan cevap SADECE 3–4 kısa cümle, en fazla 90 kelime. Başlık, tablo, madde listesi, model kataloğu, NEEDS_REVIEW veya manuel onay açıklaması YAZMA.
Sıra: görüş ve PA gerekçesi → en fazla iki kritik fiyat bölgesi → neyi bekliyorsun → fikrini ne değiştirir.
Her modele ayrı bölüm açma. Kullanıcı istemedikçe FVG listeleri, pivot geçmişi ve hesap dökümü verme.
Ek veriyi varsa tek kısa ifadeyle bağla. Orderbook duvarını HTF supply/demand veya kesin destek/direnç diye sunma.
Zamanları "24 saat", "1 saat" diye açık yaz; 24s saniye demek değildir. LH daha düşük tepe, LL daha düşük dip demektir.
Yalnız işlem planı istenirse plan formatını kullan. Kanıtsız seviye uydurma; veri gerçekten yoksa söyle.
İç motor durum kodlarını ve uzun aday pivot listesini normal sohbet cevabına dökme.`;

export function wantsTechnicalAudit(question) {
  return /teknik\s+denetim|debug|ham\s+(?:analiz|veri)|motor\s+raporu/i.test(String(question || ''));
}

export function wantsDetailedAnalysis(question) {
  return wantsTechnicalAudit(question) || /detay|ayrınt|ayrint|adım adım|adim adim|işlem plan|islem plan|giriş.*stop|giris.*stop/i.test(String(question || ''));
}

export function needsBriefRewrite(text) {
  return String(text).trim().split(/\s+/u).length > 90 ||
    /\|.*\||NEEDS_REVIEW|manuel\s+onay|\bM[1-4]\b|^#{1,6}\s|^\s*[-*]\s|^\*\*[^*]+\*\*\s*[:：]?\s*$/im.test(String(text));
}

export function briefMarketFallback(ref) {
  if (!(ref?.price > 0)) return 'Güncel fiyatı doğrulayamadım; bu yüzden yön veya seviye uydurmayacağım.';
  const direction = ref.trend === 'aşağı' ? 'aşağı yönlü' : ref.trend === 'yukarı' ? 'yukarı yönlü' : 'kararsız';
  return `${ref.symbol} yaklaşık $${trNum(ref.price, ref.symbol === 'BTC' ? 0 : 2)}; eldeki 1 saatlik görünüm ${direction}. Bu tek başına işlem gerekçesi değil; kırılım sonrası bölgenin korunmasına mı, hızlı geri kazanılmasına mı bakarım. Şimdilik teyitsiz giriş, stop veya hedef vermem.`;
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
  if (ref.changePct != null) s += ' (24 saat ' + (ref.changePct >= 0 ? '+' : '') + trNum(ref.changePct, 1) + '%)';
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
  return { ...ref, atr, requireStrategy: true, canonicalVersion: 'v16' };
}

function planFallback(answer, ref) {
  const kept = stripPlanLines(answer);
  const priceLine = ref && ref.price > 0
    ? ref.symbol + ' canlı: $' + trNum(ref.price, ref.symbol === 'XAUUSD' ? 2 : 0) +
      (ref.changePct != null ? ' · 24 saat ' + (ref.changePct >= 0 ? '+' : '') + trNum(ref.changePct, 1) + '%' : '')
    : '';
  return [priceLine, kept || 'Net bir setup yok.', '⚠️ Seviyeli plan canlı fiyat/strateji kurallarıyla tutarsız olduğu için paylaşılmadı.']
    .filter(Boolean).join('\n\n');
}

export async function answerQuestion(question, userId) {
  if (!question || question.trim().length < 3) return 'Lütfen bir soru yaz. Örnek: "BTC şu an hangi yöne baskın?"';
  if (!(await checkRateLimit(userId))) return 'Saatte en fazla 5 soru sorabilirsin. Lütfen biraz bekle.';

  const topic = planTopic(question);
  const topicKey = topic === 'gold' ? 'XAUT' : topic === 'eth' ? 'ETH' : 'BTC';
  const detailTfs = ['4h', '1h', '15m', '5m'];
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
  const canonicalReport = topic === 'btc' ? analyzeV16(detail, Date.now(), { mode: 'analysis' }) : null;
  const showAudit = wantsTechnicalAudit(question);
  const detailed = wantsDetailedAnalysis(question);
  ref.approvedPlans = canonicalReport?.approvedPlans || [];
  if (detail['4h']?.candles) ref.atr4h = structureFromCandles(detail['4h'].candles, 6).atr14;
  if (detail['15m']?.candles) ref.atr15m = structureFromCandles(detail['15m'].candles, 96).atr14;
  if (detail['5m']?.candles) ref.atr5m = structureFromCandles(detail['5m'].candles, 288).atr14;
  const strategies = await readStrategies();
  const stratContext = formatStrategiesForPrompt(strategies);
  const knowledge = await readKnowledge();
  const knowContext = formatKnowledgeForPrompt(knowledge, topic === 'gold' ? 'gold' : topic === 'btc' ? 'btc' : null);

  const system = [
    'Sen Alfa Traders piyasa analist asistanisin. Türkçe, kısa ve net cevap ver.',
    CANONICAL_V16,
    '',
    'CANLI VERİLER (tek doğru kaynak; buradaki fiyatı kullan, ezberden seviye uydurma):',
    context,
    '',
    'ÇOK ZAMAN DİLİMLİ YAPI VE STRATEJİ UYGUNLUĞU:',
    strategyContext,
    'ALT ÖNCELİKLİ TARİHSEL NOTLAR (v16 ile çelişirse uygulama; fiyatları güncel değil):',
    stratContext, knowContext,
    'TARİHSEL NOTLARIN SONU. Geçerli strateji otoritesi aşağıda tekrar verilen v16’dır.',
    CANONICAL_V16,
    canonicalReport ? formatV16Report(canonicalReport) : 'M2 yalnız BTC 15M; bu varlıkta M1/M3/M4 ayrı analiz edilir.',
    '',
    'MODELLER: M1 Sweep + IFVG / M2 BTC 15M 0.382 / M3 HTF POI / M4 Wyckoff. Ayrı tut.',
    'M2 için motorun approvedPlans listesi boşsa kesin işlem planı verme; bu genel piyasa yorumunu engellemez. Kanıtlı seviyelerle HTF görüşüne ve iki senaryoya devam et.',
    '',
    'ZORUNLU ANALİZ KURALLARI:',
    '1. Fiyatı yalnızca canlı fiyattan al. Canlı fiyat yoksa seviyeli plan verme.',
    '2. Keyfi yuvarlak sayı veya kanıtlanmamış HTF zone/pivot/anchor yazma.',
    '3. Yön ile seviyeler aynı yönde: LONG Stop < Giriş < Hedef; SHORT Hedef < Giriş < Stop.',
    '4. M2 stop 0.805 ve TP 2.5R; diğer modeller kendi yapısal invalidation/hedef mantığıyla yorumlanır. ATR/yüzde/saat eşiği uydurma.',
    '6. Tek yönlü bakış yasak: long ve short için tetik/geçersizlik seviyesi belirt; veri hangisini destekliyorsa onu planla. Çelişkiyi gizleme.',
    '7. Eski notlardaki fiyatlar (73970, 73100, 76400 gibi) güncel seviye DEĞİLDİR; sadece yöntem örneği. Seviyeleri canlı veriden yeniden hesapla.',
    '8. Ana swing/HTF/anchor eksikse 24s aralığıyla ikame etme; NEEDS_REVIEW. Sayı uydurma.',
    '',
    'CEVAP FORMATI (plan varsa):',
    '**Strateji:** M1 / M2 BTC 15M 0.382 / M3 / M4 (yalnız değerlendirilen model)',
    '**Yön:** BULLISH / BEARISH',
    '**Giriş:** $X',
    '**Stop:** $X',
    '**Hedef:** $X',
    '**R/R:** 1:X',
    '**HTF ve swing:** fiyat + UTC timestamp; aday/korunmuş ayrımını belirt',
    '**MSB:** mum kapanış zamanı + gövde/aralık; yoksa mevcut değil',
    '**Fibonacci:** başlangıç/bitiş fiyat + UTC timestamp + kilitleme gerekçesi; belirsizse seviye verme',
    '**Gerekçe:** PA dayanağı, iki senaryo, karşıt kanıt, kimin stop/likidasyonu olabileceği (hipotez), kaynak ve tazelik',
    '**Karşı senaryo:** hangi seviyede bu plan geçersiz olur',
    '**Verdict:** BULLISH / BEARISH',
    '',
    '- Setup yoksa Giriş/Stop/Hedef uydurma; ilgili stratejinin neden hazır olmadığını anlat, piyasa yorumuna devam et.',
    '- Eksik setup yerine zorla doğrudan plan verme; WATCH / NO_TRADE / NEEDS_REVIEW kullan.',
    '- "Yatırım tavsiyesi değildir" deme (sistem ekliyor).',
    '- Yalnızca BTC, ETH ve altın (XAUUSD) verisi var; başka coin sorulursa "veri yok" de.',
    TELEGRAM_ANALYSIS_STYLE,
    detailed ? 'Kullanıcı ayrıntı/işlem planı istedi; yalnız bu yanıtta gerektiği kadar detay verilebilir.' :
      'Bu bir kısa sohbet cevabı: en fazla 90 kelime, 3–4 cümle; tablo ve teknik rapor yasak.',
  ].join('\n');

  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: question.trim() },
  ];

  try {
    const { groq } = await import('./macro/research.mjs');
    let answer = await groq(messages, { format: 'text', tokens: 1600 });
    const firstPlan = parsePlan(answer);
    let check = validatePlan(firstPlan, planRefFor(firstPlan, ref));
    if (!check.ok) {
      // Tek düzeltme denemesi: hata gerekçesi ve canlı referans açıkça verilir.
      try {
        const corrected = await groq([
          messages[0],
          messages[1],
          { role: 'assistant', content: answer },
          { role: 'user', content: 'Önceki cevabın işlem seviyeleri reddedildi: ' + describePlanErrors(check.errors) + '. ' + referenceLine(ref) + ' Kanıtlı plan yoksa seviyeleri çıkar; soruya v16 ile HTF görüşü, likidite ve iki senaryoyu yorumlayarak cevap ver. Sadece düzeltilmiş cevabı döndür.' },
        ], { format: 'text', tokens: 900 });
        const correctedPlan = parsePlan(corrected);
        const recheck = validatePlan(correctedPlan, planRefFor(correctedPlan, ref));
        answer = recheck.ok ? corrected : planFallback(corrected || answer, ref);
      } catch (e) {
        answer = planFallback(answer, ref);
      }
    }
    if (!detailed && needsBriefRewrite(answer)) {
      try {
        const brief = await groq([
          messages[0], messages[1],
          { role: 'assistant', content: answer },
          { role: 'user', content: 'Cevap çok uzun. Yalnız kanıtlı bilgileri koruyarak 3–4 cümle, en fazla 90 kelimeyle yeniden yaz. Tablo, başlık, model listesi, iç durum kodu ve manuel onay talebi yok. Yeni fiyat veya strateji kuralı ekleme.' },
        ], { format: 'text', tokens: 900 });
        const checkBrief = validatePlan(parsePlan(brief), planRefFor(parsePlan(brief), ref));
        answer = !needsBriefRewrite(brief) && checkBrief.ok ? brief : briefMarketFallback(ref);
      } catch { answer = briefMarketFallback(ref); }
    }
    return answer + (canonicalReport && showAudit ? '\n\n' + formatV16Report(canonicalReport) : '') +
      '\n\n⚠️ Yatırım tavsiyesi değildir.';
  } catch (e) {
    return 'Şu an piyasa yorumu üretilemedi; net bir görüş veya işlem seviyesi uydurmayacağım. Biraz sonra tekrar deneyebilirsin.' +
      (canonicalReport && showAudit ? '\n\n' + formatV16Report(canonicalReport) : '');
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
