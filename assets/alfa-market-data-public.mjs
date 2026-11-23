// Keyless public market microstructure adapters used by Alfa Charts studies.
// Every series is derived from Binance public REST data; no account, API key,
// serverless function or database write is involved.
const SPOT = 'https://api.binance.com';
const FUTURES = 'https://fapi.binance.com';

async function getJSON(url, signal, fetcher) {
  const response = await fetcher(url, { signal, cache: 'no-store' });
  if (!response?.ok) throw new Error(`public-market-${response?.status || 'error'}`);
  return response.json();
}
const sec = ms => Math.floor(Number(ms) / 1000);
const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const cleanSymbol = value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export const PUBLIC_MARKET_SOURCES = Object.freeze({
  openInterest: 'Binance Futures · açık pozisyon',
  longShort: 'Binance Futures · hesap long/short',
  cvdSpot: 'Binance Spot · aggTrades',
  cvdPerp: 'Binance Futures · aggTrades',
  marketDelta: 'Binance · aggTrades',
  footprint: 'Binance · aggTrades',
  heatmap: 'Binance · order book depth'
});

export async function fetchOpenInterest(symbol, period = '5m', limit = 500, signal, fetcher = fetch) {
  const url = `${FUTURES}/futures/data/openInterestHist?symbol=${encodeURIComponent(cleanSymbol(symbol))}&period=${encodeURIComponent(period)}&limit=${Math.min(500, Math.max(10, limit))}`;
  const rows = await getJSON(url, signal, fetcher);
  if (!Array.isArray(rows)) throw new Error('open-interest-format');
  return rows.map(row => ({
    time: sec(row.timestamp),
    value: num(row.sumOpenInterest),
    valueUsd: num(row.sumOpenInterestValue)
  })).filter(p => p.time > 0 && p.value > 0).sort((a, b) => a.time - b.time);
}

export async function fetchLongShortRatio(symbol, period = '5m', limit = 500, signal, fetcher = fetch) {
  const url = `${FUTURES}/futures/data/globalLongShortAccountRatio?symbol=${encodeURIComponent(cleanSymbol(symbol))}&period=${encodeURIComponent(period)}&limit=${Math.min(500, Math.max(10, limit))}`;
  const rows = await getJSON(url, signal, fetcher);
  if (!Array.isArray(rows)) throw new Error('long-short-format');
  return rows.map(row => ({
    time: sec(row.timestamp),
    ratio: num(row.longShortRatio),
    long: num(row.longAccount),
    short: num(row.shortAccount)
  })).filter(p => p.time > 0 && p.ratio > 0).sort((a, b) => a.time - b.time);
}

export async function fetchFundingRate(symbol, signal, fetcher = fetch) {
  const url = `${FUTURES}/fapi/v1/premiumIndex?symbol=${encodeURIComponent(cleanSymbol(symbol))}`;
  const row = await getJSON(url, signal, fetcher);
  return { time: sec(row.nextFundingTime), rate: num(row.lastFundingRate), mark: num(row.markPrice) };
}

// Compressed trades are public on both spot and USD-M futures. Pagination is
// bounded so a study can never issue an unbounded upstream crawl.
export async function fetchAggTrades({ symbol, market = 'spot', startTime = null, endTime = null, pages = 3, signal, fetcher = fetch } = {}) {
  const base = market === 'perp' ? FUTURES : SPOT;
  const path = market === 'perp' ? '/fapi/v1/aggTrades' : '/api/v3/aggTrades';
  const all = [];
  let fromId = null;
  for (let page = 0; page < Math.min(6, Math.max(1, pages)); page++) {
    const params = new URLSearchParams({ symbol: cleanSymbol(symbol), limit: '1000' });
    if (fromId != null) params.set('fromId', String(fromId));
    else if (startTime != null) params.set('startTime', String(startTime));
    if (endTime != null) params.set('endTime', String(endTime));
    const rows = await getJSON(`${base}${path}?${params}`, signal, fetcher);
    if (!Array.isArray(rows) || !rows.length) break;
    all.push(...rows);
    fromId = Number(rows.at(-1).a) + 1;
    if (rows.length < 1000) break;
  }
  return all.map(t => ({
    id: num(t.a), time: sec(t.T), price: num(t.p), qty: num(t.q),
    buy: t.m === false, // m=true means buyer was maker, i.e. seller was taker.
    isBuyerMaker: !!t.m
  })).filter(t => t.time > 0 && t.price > 0 && t.qty > 0).sort((a, b) => a.time - b.time);
}

function bucketTrades(trades, bucketSec) {
  const step = Math.max(1, Math.floor(bucketSec || 60));
  const buckets = new Map();
  for (const t of trades) {
    const time = Math.floor(t.time / step) * step;
    let bucket = buckets.get(time);
    if (!bucket) buckets.set(time, bucket = { time, buy: 0, sell: 0, trades: 0 });
    bucket[t.buy ? 'buy' : 'sell'] += t.qty;
    bucket.trades++;
  }
  return [...buckets.values()].sort((a, b) => a.time - b.time);
}

export function cvdSeries(trades, bucketSec, initial = 0) {
  let total = num(initial);
  return bucketTrades(trades, bucketSec).map(b => {
    total += b.buy - b.sell;
    return { time: b.time, value: total };
  });
}

export function marketDeltaSeries(trades, bucketSec) {
  return bucketTrades(trades, bucketSec).map(b => ({ time: b.time, value: b.buy - b.sell, buy: b.buy, sell: b.sell }));
}

export function footprintSeries(trades, bucketSec, tickSize) {
  const step = Math.max(1, Math.floor(bucketSec || 60));
  const tick = Math.max(Number(tickSize) || 0, 1e-12);
  const levels = new Map();
  for (const t of trades) {
    const time = Math.floor(t.time / step) * step;
    const price = Math.round(t.price / tick) * tick;
    const key = `${time}|${price.toFixed(12)}`;
    let level = levels.get(key);
    if (!level) levels.set(key, level = { time, price, buy: 0, sell: 0 });
    level[t.buy ? 'buy' : 'sell'] += t.qty;
  }
  return [...levels.values()].sort((a, b) => a.time - b.time || a.price - b.price)
    .map(l => ({ ...l, delta: l.buy - l.sell, total: l.buy + l.sell }));
}

export async function fetchDepthHeatmap({ symbol, market = 'spot', levels = 60, signal, fetcher = fetch } = {}) {
  const base = market === 'perp' ? FUTURES : SPOT;
  const path = market === 'perp' ? '/fapi/v1/depth' : '/api/v3/depth';
  const limit = Math.min(1000, Math.max(50, levels * 4));
  const book = await getJSON(`${base}${path}?symbol=${encodeURIComponent(cleanSymbol(symbol))}&limit=${limit}`, signal, fetcher);
  const bids = (book.bids || []).slice(0, levels).map(([p, q]) => ({ price: num(p), qty: num(q) }));
  const asks = (book.asks || []).slice(0, levels).map(([p, q]) => ({ price: num(p), qty: num(q) }));
  const max = Math.max(1e-12, ...bids.map(l => l.qty * l.price), ...asks.map(l => l.qty * l.price));
  const map = level => ({ ...level, notional: level.qty * level.price, weight: Math.min(1, level.qty * level.price / max) });
  return {
    time: sec(Date.now()),
    bids: bids.map(map), asks: asks.map(map), max,
    mid: bids.length && asks.length ? (bids[0].price + asks[0].price) / 2 : bids[0]?.price || asks[0]?.price || 0
  };
}

// Kline rows carry taker-buy base volume (index 9). This is a bounded,
// keyless way to derive CVD/delta/footprint for the full visible history
// without crawling tens of thousands of compressed trades.
export async function fetchKlineFlow({ symbol, market = 'spot', interval = '5m', limit = 500, startTime = null, endTime = null, signal, fetcher = fetch } = {}) {
  const base = market === 'perp' ? FUTURES : SPOT;
  const path = market === 'perp' ? '/fapi/v1/klines' : '/api/v3/klines';
  const params = new URLSearchParams({ symbol: cleanSymbol(symbol), interval: String(interval), limit: String(Math.min(1000, Math.max(10, limit))) });
  if (startTime != null) params.set('startTime', String(startTime));
  if (endTime != null) params.set('endTime', String(endTime));
  const rows = await getJSON(`${base}${path}?${params}`, signal, fetcher);
  if (!Array.isArray(rows)) throw new Error('kline-flow-format');
  return rows.map(row => {
    const volume = num(row[5]), buy = num(row[9]);
    return { time: sec(row[0]), volume, buy, sell: Math.max(0, volume - buy), trades: num(row[8]) };
  }).filter(p => p.time > 0 && p.volume > 0).sort((a, b) => a.time - b.time);
}

export function cvdFromFlow(flow) {
  let total = 0;
  return flow.map(p => { total += p.buy - p.sell; return { time: p.time, value: total }; });
}

export function deltaFromFlow(flow) {
  return flow.map(p => ({ time: p.time, value: p.buy - p.sell, buy: p.buy, sell: p.sell }));
}

export function footprintFromFlow(flow) {
  return flow.map(p => ({ time: p.time, value: p.buy - p.sell, buy: p.buy, sell: p.sell, total: p.volume }));
}

export function intervalToPeriod(interval) {
  const minutes = { '1m': 1, '3m': 3, '5m': 5, '15m': 15, '30m': 30, '1h': 60, '2h': 120, '4h': 240, '6h': 360, '12h': 720, '1d': 1440 };
  const m = minutes[String(interval).toLowerCase()];
  return m && m <= 60 ? `${m}m` : '1h';
}
