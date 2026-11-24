// Market adapters for non-Binance-Spot watchlist symbols. Every upstream is
// allowlisted, public, read-only and reached through the existing /api/access
// endpoint; nothing here accepts a caller-supplied URL or writes to storage.
import { parseMarketRef, candle } from '../assets/alfa-charts-data.mjs';

const INTERVAL_SECONDS = { '1m': 60, '3m': 180, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '2h': 7200, '4h': 14400, '6h': 21600, '12h': 43200, '1d': 86400, '3d': 259200, '1w': 604800 };
const OKX_BAR = { '1m': '1m', '3m': '3m', '5m': '5m', '15m': '15m', '30m': '30m', '1h': '1H', '2h': '2H', '4h': '4H', '6h': '6H', '12h': '12H', '1d': '1D', '3d': '3D', '1w': '1W' };
const BYBIT_INTERVAL = { '1m': '1', '3m': '3', '5m': '5', '15m': '15', '30m': '30', '1h': '60', '2h': '120', '4h': '240', '6h': '360', '12h': '720', '1d': 'D', '3d': '3D', '1w': 'W' };
const YAHOO_INTERVAL = { '1m': '1m', '3m': '1m', '5m': '5m', '15m': '15m', '30m': '30m', '1h': '60m', '2h': '60m', '4h': '60m', '6h': '60m', '12h': '60m', '1d': '1d', '3d': '1d', '1w': '1wk' };
const MAX_BYTES = 3 * 1024 * 1024;
const cache = new Map();

export function normalizeInterval(interval) {
  if (!Object.hasOwn(INTERVAL_SECONDS, interval)) throw new Error('bad_interval');
  return interval;
}
const UPSTREAM_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
async function fetchJSON(url, signal, fetcher = fetch) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.port || parsed.username || parsed.password) throw new Error('bad_upstream_url');
  // Yahoo blocks requests with a missing/default worker User-Agent with 429;
  // a browser-like UA keeps public FX/index history and quotes available.
  const response = await fetcher(parsed.toString(), { redirect: 'manual', credentials: 'omit', cache: 'no-store',
    signal: signal || AbortSignal.timeout(12000), headers: { Accept: 'application/json', 'User-Agent': UPSTREAM_USER_AGENT } });
  if (!response.ok || response.redirected) throw new Error('upstream_http_' + response.status);
  const length = Number(response.headers.get('content-length'));
  if (length > MAX_BYTES) throw new Error('upstream_too_large');
  const text = await response.text();
  if (text.length > MAX_BYTES) throw new Error('upstream_too_large');
  return JSON.parse(text);
}
function rowsToCandles(rows) {
  const unique = new Map();
  for (const row of rows || []) {
    try {
      const c = candle(row[0], row[1], row[2], row[3], row[4], row[5] ?? 0);
      unique.set(c.time, c);
    } catch { /* Skip malformed ticks from a third party. */ }
  }
  return [...unique.values()].sort((a, b) => a.time - b.time).slice(-1000);
}
export function aggregate(candles, seconds) {
  if (!Object.values(INTERVAL_SECONDS).includes(seconds)) throw new Error('bad_interval');
  const buckets = new Map();
  for (const c of candles) {
    const time = Math.floor(c.time / seconds) * seconds;
    const current = buckets.get(time);
    if (!current) buckets.set(time, { ...c, time });
    else {
      current.high = Math.max(current.high, c.high); current.low = Math.min(current.low, c.low);
      current.close = c.close; current.volume += c.volume;
    }
  }
  return [...buckets.values()].sort((a, b) => a.time - b.time).slice(-1000);
}
function yahooURL(feedSymbol, interval, end, start) {
  const step = INTERVAL_SECONDS[interval];
  const seconds = value => value == null ? null : Math.floor(value > 1e12 ? value / 1000 : value);
  const now = seconds(end) ?? Math.floor(Date.now() / 1000);
  let from = start != null ? seconds(start) : now - step * 1100;
  if (YAHOO_INTERVAL[interval] === '1m') from = Math.max(from, now - 29 * 86400);
  const params = new URLSearchParams({ period1: String(Math.max(0, from)), period2: String(now), interval: YAHOO_INTERVAL[interval], events: 'div,splits' });
  return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(feedSymbol)}?${params}`;
}
function yahooPayload(json) {
  const result = json?.chart?.result?.[0];
  if (!result || !Array.isArray(result.timestamp) || !Array.isArray(result.indicators?.quote) || !result.indicators.quote.length) throw new Error('upstream_empty');
  const quote = result.indicators.quote[0], rows = [];
  for (let i = 0; i < result.timestamp.length; i++) rows.push([result.timestamp[i] * 1000, quote.open?.[i], quote.high?.[i], quote.low?.[i], quote.close?.[i], quote.volume?.[i] || 0]);
  return { rows, meta: result.meta || {} };
}
async function yahooHistory(ref, interval, end, start, fetcher) {
  const { rows } = yahooPayload(await fetchJSON(yahooURL(ref.feedSymbol, interval, end, start), null, fetcher));
  const candles = rowsToCandles(rows), step = INTERVAL_SECONDS[interval];
  return YAHOO_INTERVAL[interval] === INTERVAL_SECONDS[interval] ? candles : aggregate(candles, step);
}
async function binanceFuturesHistory(ref, interval, end, start, fetcher) {
  const params = new URLSearchParams({ symbol: ref.feedSymbol, interval, limit: '1000' });
  if (end) params.set('endTime', String(end));
  if (start) params.set('startTime', String(start));
  const rows = await fetchJSON('https://fapi.binance.com/fapi/v1/klines?' + params, null, fetcher);
  if (!Array.isArray(rows)) throw new Error('upstream_empty');
  return rowsToCandles(rows);
}
async function okxHistory(ref, interval, end, start, fetcher) {
  const params = new URLSearchParams({ instId: ref.feedSymbol, bar: OKX_BAR[interval], limit: '300' });
  if (end) params.set('after', String(end));
  if (start) params.set('before', String(start));
  const json = await fetchJSON('https://www.okx.com/api/v5/market/candles?' + params, null, fetcher);
  if (json.code !== '0' || !Array.isArray(json.data)) throw new Error('upstream_empty');
  return rowsToCandles(json.data);
}
async function bybitHistory(ref, interval, end, start, fetcher) {
  const params = new URLSearchParams({ category: ref.marketType === 'perp' ? 'linear' : 'spot', symbol: ref.feedSymbol, interval: BYBIT_INTERVAL[interval], limit: '1000' });
  if (end) params.set('end', String(end));
  if (start) params.set('start', String(start));
  const json = await fetchJSON('https://api.bybit.com/v5/market/kline?' + params, null, fetcher);
  if (json.retCode !== 0 || !Array.isArray(json.result?.list)) throw new Error('upstream_empty');
  return rowsToCandles(json.result.list);
}
async function derivedHistory(interval, end, start, fetcher) {
  const goldRef = parseMarketRef('TVC:GOLD'), usdRef = parseMarketRef('FX:USDTRY');
  const [gold, usd] = await Promise.all([yahooHistory(goldRef, interval, end, start, fetcher), yahooHistory(usdRef, interval, end, start, fetcher)]);
  const fx = new Map(usd.map(c => [c.time, c.close])), rows = [];
  for (const c of gold) {
    const rate = fx.get(c.time);
    if (!rate) continue;
    const value = c.close * rate / 31.1034768;
    rows.push([c.time * 1000, value, value, value, value, 0]);
  }
  return rowsToCandles(rows);
}
async function quoteFromJSON(value) {
  const price = Number(value?.price), change = Number(value?.change);
  if (!Number.isFinite(price) || price <= 0) throw new Error('upstream_empty');
  return { price, change: Number.isFinite(change) ? change : 0, at: Date.now() };
}
async function yahooQuote(ref, fetcher) {
  const json = await fetchJSON('https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(ref.feedSymbol) + '?range=5d&interval=1d', null, fetcher);
  const meta = yahooPayload(json).meta;
  const price = Number(meta.regularMarketPrice), previous = Number(meta.chartPreviousClose);
  return quoteFromJSON({ price, change: previous > 0 ? (price - previous) / previous * 100 : 0 });
}
async function quoteFor(ref, fetcher) {
  switch (ref.feed) {
    case 'binance': case 'binance-perp': {
      const base = ref.feed === 'binance' ? 'https://data-api.binance.vision/api/v3' : 'https://fapi.binance.com/fapi/v1';
      const data = await fetchJSON(`${base}/ticker/24hr?symbol=${encodeURIComponent(ref.feedSymbol)}`, null, fetcher);
      return quoteFromJSON({ price: data.lastPrice, change: data.priceChangePercent });
    }
    case 'okx': {
      const json = await fetchJSON('https://www.okx.com/api/v5/market/ticker?instId=' + encodeURIComponent(ref.feedSymbol), null, fetcher);
      const t = json?.data?.[0], open = Number(t?.open24h), last = Number(t?.last);
      return quoteFromJSON({ price: last, change: open > 0 ? (last - open) / open * 100 : 0 });
    }
    case 'bybit': {
      const json = await fetchJSON('https://api.bybit.com/v5/market/tickers?category=' + (ref.marketType === 'perp' ? 'linear' : 'spot') + '&symbol=' + encodeURIComponent(ref.feedSymbol), null, fetcher);
      const t = json?.result?.list?.[0];
      return quoteFromJSON({ price: t?.lastPrice, change: t?.priceChangePercent });
    }
    case 'yahoo': return yahooQuote(ref, fetcher);
    case 'tv': {
      const data = await fetchJSON('https://scanner.tradingview.com/symbol?symbol=' + encodeURIComponent(ref.key) + '&fields=close,change', null, fetcher);
      return quoteFromJSON({ price: data?.close, change: data?.change });
    }
    case 'derived': {
      const [gold, usd] = await Promise.all([yahooQuote(parseMarketRef('TVC:GOLD'), fetcher), yahooQuote(parseMarketRef('FX:USDTRY'), fetcher)]);
      return quoteFromJSON({ price: gold.price * usd.price / 31.1034768, change: gold.change + usd.change });
    }
    default: throw new Error('unsupported_feed');
  }
}
function cached(key, ttl, loader) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  if (cache.size > 600) cache.clear();
  return Promise.resolve().then(loader).then(value => { cache.set(key, { at: Date.now(), value }); return value; });
}
export async function marketHistory(refValue, interval, end, start, fetcher = fetch) {
  const ref = parseMarketRef(refValue);
  normalizeInterval(interval);
  if (ref.feed === 'binance') throw new Error('use_binance_rest');
  if (!ref.chartable) return { chartable: false, quote: await marketQuote(refValue, fetcher) };
  const key = 'h:' + ref.key + ':' + interval + ':' + (end || '') + ':' + (start || '');
  const candles = await cached(key, 30000, () => {
    if (ref.feed === 'derived') return derivedHistory(interval, end, start, fetcher);
    if (ref.feed === 'yahoo') return yahooHistory(ref, interval, end, start, fetcher);
    if (ref.feed === 'binance-perp') return binanceFuturesHistory(ref, interval, end, start, fetcher);
    if (ref.feed === 'okx') return okxHistory(ref, interval, end, start, fetcher);
    if (ref.feed === 'bybit') return bybitHistory(ref, interval, end, start, fetcher);
    throw new Error('unsupported_feed');
  });
  return { chartable: true, candles };
}
export async function marketQuote(refValue, fetcher = fetch) {
  const ref = parseMarketRef(refValue);
  return cached('q:' + ref.key, 15000, () => quoteFor(ref, fetcher));
}
export async function marketQuotes(refs, fetcher = fetch) {
  const quotes = {};
  for (const ref of [...new Set(refs)].slice(0, 60)) {
    try { quotes[ref] = await marketQuote(ref, fetcher); } catch { /* One failing venue never blocks the list. */ }
  }
  return quotes;
}
const publicRequests = new Map();
export function allowPublicMarketData(ip, now = Date.now()) {
  const key = String(ip || 'unknown').slice(0, 64);
  for (const [id, entry] of publicRequests) if (now - entry.start >= 60000) publicRequests.delete(id);
  const entry = publicRequests.get(key) || { start: now, count: 0 };
  if (entry.count >= 60 || !publicRequests.has(key) && publicRequests.size >= 2000) return false;
  entry.count++; publicRequests.set(key, entry); return true;
}
const requests = new Map();
export function allowMarketData(userId, now = Date.now()) {
  for (const [key, entry] of requests) if (now - entry.start >= 60000) requests.delete(key);
  const entry = requests.get(userId) || { start: now, count: 0 };
  if (entry.count >= 120 || !requests.has(userId) && requests.size >= 2000) return false;
  entry.count++; requests.set(userId, entry); return true;
}
