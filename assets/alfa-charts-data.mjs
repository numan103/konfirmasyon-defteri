export const TIMEFRAMES = Object.freeze({
  '1M': '1m', '3M': '3m', '5M': '5m', '15M': '15m', '30M': '30m',
  '1H': '1h', '2H': '2h', '4H': '4h', '6H': '6h', '12H': '12h',
  '1D': '1d', '3D': '3d', '1W': '1w'
});
export const SYMBOLS = Object.freeze(['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT']);
export const REST_ORIGINS = ['https://data-api.binance.vision', 'https://api.binance.com'];
export const STREAM_ORIGINS = ['wss://data-stream.binance.vision', 'wss://stream.binance.com:9443'];

// A bare symbol is always a Binance Spot pair. Everything else carries its
// venue, so a TradingView symbol keeps its own exchange and market type.
const BARE = /^[A-Z0-9]{5,24}$/;
const QUALIFIED = /^([A-Z][A-Z0-9_]{1,15}):([A-Z0-9][A-Z0-9._!\-/]{0,39})$/;
const CRYPTO_QUOTES = ['USDT', 'USDC', 'FDUSD', 'TUSD', 'BTC', 'ETH', 'BNB', 'TRY', 'EUR'];
const FX_VENUES = new Set(['FX', 'FX_IDC', 'OANDA', 'FOREXCOM', 'FPMARKETS']);
const MARKET_DATA_OP = 'chart-market-data';
const QUOTE_OP = 'chart-market-quotes';
const MARKET_DATA_FREE_OP = 'chart-market-data-free';
const QUOTE_FREE_OP = 'chart-market-quotes-free';

const YAHOO = {
  'CME:BTC1!': ['BTC=F', 'CME BTC', 'USD', 'Vadeli'],
  'CBOE:VIX': ['^VIX', 'VIX', 'USD', 'Endeks'],
  'BIST:XU100': ['XU100.IS', 'XU100', 'TRY', 'Endeks'],
  'TVC:GOLD': ['GC=F', 'Altın', 'USD', 'Vadeli'],
  'TVC:DXY': ['DX-Y.NYB', 'DXY', 'USD', 'Endeks'],
  'FPMARKETS:US100': ['^NDX', 'US100', 'USD', 'Endeks'],
  'FX:XAUUSD': ['GC=F', 'XAU/USD', 'USD', 'Vadeli yaklaşık'],
  'FOREXCOM:XAUUSD': ['GC=F', 'XAU/USD', 'USD', 'Vadeli yaklaşık'],
  'OANDA:XAGUSD': ['SI=F', 'XAG/USD', 'USD', 'Vadeli yaklaşık'],
  'OANDA:XAUUSD': ['GC=F', 'XAU/USD', 'USD', 'Vadeli yaklaşık'],
  'FX_IDC:XAUTRY': ['GC=F', 'XAU/TRY', 'TRY', 'Vadeli yaklaşık'],
  'FX_IDC:XAUTRYG': ['XAU-TRY-GRAM', 'XAU/TRY gram', 'TRY', 'Türetilmiş'],
};
const TV_ONLY = {
  'CRYPTOCAP:TOTAL': 'Toplam kripto piyasası',
  'CRYPTOCAP:TOTAL2': 'Toplam kripto (BTC hariç)',
  'CRYPTOCAP:TOTAL3': 'Toplam kripto (BTC+ETH hariç)',
  'CRYPTOCAP:BTC.D': 'BTC dominansı',
  'CRYPTOCAP:USDT.D': 'USDT dominansı',
};
const splitQuote = symbol => {
  const quote = CRYPTO_QUOTES.find(q => symbol.length > q.length && symbol.endsWith(q));
  return quote ? { base: symbol.slice(0, -quote.length), quote } : { base: symbol, quote: '' };
};
const descriptor = (key, feed, feedSymbol, venue, marketType, label, base, quote, chartable = true) =>
  Object.freeze({ key, feed, feedSymbol, venue, marketType, label, base, quote, chartable });

// Pure symbol resolution shared by the browser and the API. Never produces a
// URL from user input: each venue maps to a fixed, allowlisted upstream.
export function parseMarketRef(raw) {
  const value = String(raw ?? '').trim();
  if (value !== value.toUpperCase()) throw new Error('Geçersiz sembol');
  const ref = value.toUpperCase();
  if (BARE.test(ref)) {
    const { base, quote } = splitQuote(ref);
    return descriptor(ref, 'binance', ref, 'BINANCE', 'spot', `${base}/${quote || '?'} · Binance Spot`, base, quote);
  }
  const match = QUALIFIED.exec(ref);
  if (!match) throw new Error('Geçersiz sembol');
  const [, venue, rawSymbol] = match;
  const perp = rawSymbol.endsWith('.P');
  const symbol = perp ? rawSymbol.slice(0, -2) : rawSymbol;
  if (venue === 'BINANCE') {
    if (!BARE.test(symbol)) throw new Error('Geçersiz Binance sembolü');
    if (perp) { const { base, quote } = splitQuote(symbol); return descriptor(ref, 'binance-perp', symbol, venue, 'perp', `${base}/${quote || '?'} · Binance Vadeli`, base, quote); }
    return parseMarketRef(symbol);
  }
  if (venue === 'OKX' || venue === 'BYBIT') {
    if (!BARE.test(symbol)) throw new Error('Geçersiz sembol');
    const { base, quote } = splitQuote(symbol);
    if (!quote) throw new Error('Geçersiz parite');
    const feedSymbol = venue === 'OKX' ? `${base}-${quote}${perp ? '-SWAP' : ''}` : symbol;
    const label = `${base}/${quote} · ${venue} ${perp ? 'Vadeli' : 'Spot'}`;
    return descriptor(ref, venue.toLowerCase(), feedSymbol, venue, perp ? 'perp' : 'spot', label, base, quote);
  }
  if (venue === 'CRYPTOCAP') {
    const label = TV_ONLY[ref];
    if (!label) throw new Error('Desteklenmeyen kripto endeksi');
    return descriptor(ref, 'tv', ref, venue, 'index', label + ' · Kripto Endeksi', ref, '', false);
  }
  if (YAHOO[ref]) {
    const [feedSymbol, label, quote, marketType] = YAHOO[ref];
    const derived = marketType === 'Türetilmiş';
    return descriptor(ref, derived ? 'derived' : 'yahoo', feedSymbol, venue, derived ? 'derived' : marketType,
      `${label} · ${venue}`, ref, quote);
  }
  if (FX_VENUES.has(venue) && /^[A-Z]{6}$/.test(symbol)) {
    return descriptor(ref, 'yahoo', symbol + '=X', venue, 'forex', `${symbol.slice(0, 3)}/${symbol.slice(3)} · ${venue}`, symbol.slice(0, 3), symbol.slice(3));
  }
  throw new Error(`${venue} için veri kaynağı yok`);
}
export const isSpotSymbol = symbol => typeof symbol === 'string' && BARE.test(symbol);
export const isMarketRef = value => { try { parseMarketRef(value); return true; } catch { return false; } };
// Backward-compatible name used by research/drawing validation.
export const isMarketSymbol = isMarketRef;

// These are the references that failed to open because they needed a Charts
// session. They keep their original venue/market type but use a public,
// rate-limited data path, so the whole imported list opens without a login.
// Bare Binance Spot pairs stay on the direct Binance feed and are excluded.
const FREE_REF_SEEDS = [
  'CME:BTC1!', 'OKX:USDTTRY', 'CBOE:VIX', 'FX_IDC:XAUTRYG', 'OKX:XAUTUSDT', 'BIST:XU100',
  'CRYPTOCAP:TOTAL', 'CRYPTOCAP:TOTAL2', 'CRYPTOCAP:TOTAL3', 'CRYPTOCAP:BTC.D', 'CRYPTOCAP:USDT.D',
  'BINANCE:BTCUSDT.P', 'BINANCE:ETHUSDT.P', 'OKX:ETHUSDT.P', 'TVC:GOLD', 'BYBIT:BTCUSDT.P', 'BYBIT:ETHUSDT.P',
  'FX:XAUUSD', 'FPMARKETS:US100', 'OKX:SOLUSDT', 'OKX:PEPEUSDT.P', 'OKX:BNBUSDT.P',
  'BYBIT:BTCUSDT', 'BYBIT:SOLUSDT.P', 'OKX:AVAXUSDT', 'OKX:BTCUSDT', 'OKX:BTCUSDT.P',
  'OKX:ETHUSDT', 'OKX:XRPUSDT',
  'OKX:DOGEUSDT', 'OKX:AVAXUSDT.P', 'OKX:LTCUSDT.P', 'OKX:XRPUSDT.P', 'OKX:SUIUSDT.P',
  'OKX:LINKUSDT.P', 'OKX:NEARUSDT.P', 'OKX:INJUSDT', 'OKX:AAVEUSDT.P', 'OKX:PYTHUSDT',
  'OKX:HYPEUSDT.P', 'OKX:ZECUSDT.P', 'TVC:DXY', 'OANDA:EURUSD', 'OANDA:NZDUSD',
  'OANDA:USDJPY', 'FX_IDC:GBPAUD', 'OANDA:AUDUSD', 'FOREXCOM:XAUUSD', 'FX:GBPUSD',
  'OANDA:XAGUSD', 'FX:USDCHF', 'OANDA:USDCAD', 'FX:NZDCAD', 'FX:AUDCHF', 'FX:AUDCAD',
  // Legacy 44-list venues that use the same allowlisted Yahoo/OKX adapters.
  'FX:EURUSD', 'FX:USDJPY', 'FX:AUDUSD', 'FX:USDCAD', 'BYBIT:BTCUSDT', 'BYBIT:ETHUSDT', 'BYBIT:SOLUSDT',
  'OKX:HBARUSDT.P', 'OKX:UNIUSDT.P', 'OKX:TRXUSDT.P', 'OKX:WIFUSDT', 'OKX:BONKUSDT',
  'OKX:POPCATUSDT.P', 'OKX:RENDERUSDT'
];
const FREE_MARKET_REFS = new Set(FREE_REF_SEEDS.map(ref => {
  try { return parseMarketRef(ref).feed === 'binance' ? null : parseMarketRef(ref).key; }
  catch { return null; }
}).filter(Boolean));
export const isFreeMarketRef = value => { try { return FREE_MARKET_REFS.has(parseMarketRef(value).key); } catch { return false; } };

// The server proxy is required for feeds without CORS (Yahoo, derived gold).
// These public feeds also allow the browser directly, which keeps the imported
// perpetual futures open when a serverless region cannot reach their exchange.
const DIRECT_BAR = { '1m': '1m', '3m': '3m', '5m': '5m', '15m': '15m', '30m': '30m', '1h': '1H', '2h': '2H', '4h': '4H', '6h': '6H', '12h': '12H', '1d': '1D', '3d': '3D', '1w': '1W' };
const DIRECT_BYBIT = { '1m': '1', '3m': '3', '5m': '5', '15m': '15', '30m': '30', '1h': '60', '2h': '120', '4h': '240', '6h': '360', '12h': '720', '1d': 'D', '3d': '3D', '1w': 'W' };
function directHistoryURL(ref, interval, endTime, startTime) {
  const ms = value => value == null ? null : Math.floor(Number(value) > 1e12 ? Number(value) : Number(value) * 1000);
  const end = ms(endTime), start = ms(startTime);
  if (ref.feed === 'binance-perp') {
    const params = new URLSearchParams({ symbol: ref.feedSymbol, interval, limit: '1000' });
    if (end != null) params.set('endTime', String(end));
    if (start != null) params.set('startTime', String(start));
    return 'https://fapi.binance.com/fapi/v1/klines?' + params;
  }
  if (ref.feed === 'okx') {
    const params = new URLSearchParams({ instId: ref.feedSymbol, bar: DIRECT_BAR[interval], limit: '300' });
    if (end != null) params.set('after', String(end));
    if (start != null) params.set('before', String(start));
    return 'https://www.okx.com/api/v5/market/candles?' + params;
  }
  if (ref.feed === 'bybit') {
    const params = new URLSearchParams({ category: ref.marketType === 'perp' ? 'linear' : 'spot', symbol: ref.feedSymbol, interval: DIRECT_BYBIT[interval], limit: '1000' });
    if (end != null) params.set('end', String(end));
    if (start != null) params.set('start', String(start));
    return 'https://api.bybit.com/v5/market/kline?' + params;
  }
  return null;
}
function parseDirectRows(rows, feed) {
  const unique = new Map();
  for (const row of rows || []) {
    try {
      const c = candle(row[0], row[1], row[2], row[3], row[4], row[5] ?? 0);
      unique.set(c.time, c);
    } catch { /* Skip malformed ticks from a third party. */
    }
  }
  const result = [...unique.values()].sort((a, b) => a.time - b.time);
  if (!result.length) throw new Error('Geçersiz mum verisi');
  return result;
}
async function directHistory(ref, interval, endTime, startTime, signal, fetcher) {
  const url = directHistoryURL(ref, interval, endTime, startTime);
  if (!url) return null;
  const response = await fetcher(url, { signal, cache: 'no-store' });
  if (!response.ok) throw new Error('upstream_http_' + response.status);
  const json = await response.json();
  if (ref.feed === 'okx') {
    if (json?.code !== '0') throw new Error('upstream_empty');
    return parseDirectRows(json.data, 'okx');
  }
  if (ref.feed === 'bybit') {
    if (json?.retCode !== 0) throw new Error('upstream_empty');
    return parseDirectRows(json.result?.list, 'bybit');
  }
  return parseHistory(json);
}

export function validateMarket(symbol, interval) {
  if (!Object.values(TIMEFRAMES).includes(interval)) throw new Error('Desteklenmeyen zaman dilimi');
  const ref = parseMarketRef(symbol);
  if (!ref.chartable) throw new Error('Bu sembol için mum geçmişi yok');
}
function validateSpot(symbol, interval) {
  if (!isSpotSymbol(symbol) || !Object.values(TIMEFRAMES).includes(interval)) throw new Error('Desteklenmeyen piyasa');
}
function binanceFeedSymbol(symbol, interval) {
  const ref = parseMarketRef(symbol);
  if (ref.feed !== 'binance') throw new Error('Desteklenmeyen piyasa');
  const feedSymbol = ref.feedSymbol;
  validateSpot(feedSymbol, interval);
  return feedSymbol;
}
export function restURL(origin, symbol, interval) {
  const feedSymbol = binanceFeedSymbol(symbol, interval);
  return `${origin}/api/v3/klines?symbol=${feedSymbol}&interval=${interval}&limit=1000`;
}
export function streamURL(origin, symbol, interval) {
  const feedSymbol = binanceFeedSymbol(symbol, interval);
  return `${origin}/ws/${feedSymbol.toLowerCase()}@kline_${interval}`;
}
export function candle(time, open, high, low, close, volume = 0) {
  const result = {
    time: Number(time) / 1000,
    open: Number(open), high: Number(high), low: Number(low), close: Number(close),
    volume: Math.max(0, Number(volume) || 0)
  };
  const ohlc = [result.open, result.high, result.low, result.close];
  if (![result.time, ...ohlc, result.volume].every(Number.isFinite) || !Number.isInteger(result.time) || result.time <= 0 ||
      Math.min(...ohlc) <= 0 ||
      result.high < Math.max(result.open, result.close, result.low) || result.low > Math.min(result.open, result.close)) {
    throw new Error('Geçersiz mum verisi');
  }
  return result;
}
export function parseHistory(rows) {
  if (!Array.isArray(rows) || !rows.length) throw new Error('Mum verisi boş');
  const unique = new Map();
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 5) throw new Error('Geçersiz mum yanıtı');
    const c = candle(row[0], row[1], row[2], row[3], row[4], row[5] ?? 0); unique.set(c.time, c);
  }
  return [...unique.values()].sort((a, b) => a.time - b.time);
}
export function parseKline(raw, symbol, interval) {
  const message = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (message.e !== 'kline' || message.s !== symbol || message.k?.s !== symbol || message.k?.i !== interval) return null;
  return candle(message.k.t, message.k.o, message.k.h, message.k.l, message.k.c, message.k.v);
}
export function mergeCandles(history, updates, limit = 1000) {
  const merged = new Map(history.map(c => [c.time, c]));
  for (const c of updates) merged.set(c.time, c);
  return [...merged.values()].sort((a, b) => a.time - b.time).slice(-limit);
}

// The existing API endpoint is reused; no separate function or database write.
let tokenProvider = async () => '';
export function setMarketTokenProvider(fn) { tokenProvider = typeof fn === 'function' ? fn : async () => ''; }
async function authHeaders(provided) {
  const token = provided || await tokenProvider();
  return token ? { Authorization: 'Bearer ' + token } : {};
}
async function proxyRequest(op, body, signal, fetcher, providedToken) {
  const headers = { 'Content-Type': 'application/json', ...await authHeaders(providedToken) };
  const response = await fetcher('/api/access', { method: 'POST', headers, cache: 'no-store', body: JSON.stringify({ op, ...body }), signal });
  let data;
  try { data = await response.json(); } catch { throw new Error('Geçersiz piyasa yanıtı'); }
  if (!response.ok || data?.ok === false) {
    if (response.status === 401 || data?.error === 'charts_access_required') throw new Error('Piyasa verisi için Alfa Charts oturumu gerekiyor');
    throw new Error(data?.error || 'Piyasa verisi alınamadı');
  }
  return data;
}
export async function fetchMarketQuotes(refs, signal, fetcher = fetch, providedToken) {
  const unique = [...new Set(refs.filter(isMarketRef))].slice(0, 60);
  if (!unique.length) return {};
  const free = unique.filter(isFreeMarketRef), gated = unique.filter(ref => !isFreeMarketRef(ref));
  const quotes = {};
  let firstError = null;
  if (free.length) try {
    Object.assign(quotes, (await proxyRequest(QUOTE_FREE_OP, { refs: free }, signal, fetcher, providedToken)).quotes || {});
  } catch (error) { firstError = error; }
  if (gated.length) try {
    Object.assign(quotes, (await proxyRequest(QUOTE_OP, { refs: gated }, signal, fetcher, providedToken)).quotes || {});
  } catch (error) { if (!Object.keys(quotes).length) firstError = error; }
  if (!Object.keys(quotes).length && firstError) throw firstError;
  return quotes;
}
export async function fetchHistory(symbol, interval, signal, fetcher = fetch, endTime = null, startTime = null, options = {}) {
  if (!Object.values(TIMEFRAMES).includes(interval)) throw new Error('Desteklenmeyen zaman dilimi');
  const ref = parseMarketRef(symbol);
  if (ref.feed !== 'binance') {
    const free = isFreeMarketRef(symbol);
    const op = free ? MARKET_DATA_FREE_OP : MARKET_DATA_OP;
    let data;
    try {
      data = await proxyRequest(op, { ref: symbol, interval, end: endTime, start: startTime }, signal, fetcher, options.token);
    } catch (error) {
      if (free) {
        try {
          const direct = await directHistory(ref, interval, endTime, startTime, signal, fetcher);
          if (direct) return direct;
        } catch { /* Fall back to the original proxy error below. */ }
      }
      throw error;
    }
    if (data.chartable === false) {
      const quote = data.quote || {};
      const price = Number(quote.price);
      if (!Number.isFinite(price) || price <= 0) throw new Error('Canlı değer alınamadı');
      return [{ time: Math.floor(Date.now() / 1000 / 60) * 60, open: price, high: price, low: price, close: price, volume: 0 }];
    }
    if (!Array.isArray(data.candles)) throw new Error('Geçersiz mum yanıtı');
    // The server adapter already normalizes upstream timestamps to seconds;
    // keep accepting milliseconds so both the API and legacy fixtures validate.
    return data.candles.map(c => candle(Number(c.time) > 1e12 ? c.time : Number(c.time) * 1000, c.open, c.high, c.low, c.close, c.volume));
  }
  let lastError;
  for (const origin of REST_ORIGINS) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    try {
      // Venue-qualified Binance Spot refs keep their identity in storage/UI,
      // but the Binance endpoint needs the underlying spot symbol.
      let url = restURL(origin, ref.feedSymbol, interval);
      if (startTime) url += '&startTime=' + startTime;
      if (endTime) url += '&endTime=' + endTime;
      const response = await fetcher(url, { signal, cache: 'no-store' });
      if (!response.ok) throw new Error('Binance HTTP ' + response.status);
      const rows = await response.json();
      if (!Array.isArray(rows)) throw new Error('invalid kline response');
      if (!rows.length) return [];
      return parseHistory(rows);
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error;
    }
  }
  throw lastError || new Error('history unavailable');
}
