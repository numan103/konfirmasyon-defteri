// Never silently replace an exchange, spot pair, perpetual or index.
export function parseWatchlist(text) {
  const symbols = [], rejected = [], seen = new Set();
  for (const raw of String(text).split(/[\s,;]+/)) {
    const value = raw.trim().toUpperCase();
    if (!value || value.startsWith('###')) continue;
    if (!/^[A-Z0-9_]{2,24}:[A-Z0-9_.!/-]{1,40}$/.test(value)) {
      rejected.push(raw); continue;
    }
    if (!seen.has(value)) { seen.add(value); symbols.push(value); }
  }
  return { symbols: symbols.slice(0, 200), rejected, overflow: symbols.length > 200 };
}
export function marketSource(symbol) {
  const [exchange, pair] = symbol.split(':');
  if (['BINANCE', 'OKX', 'BYBIT'].includes(exchange) && /^[A-Z0-9]+USDT(?:\.P)?$/.test(pair)) {
    return { exchange, pair: pair.replace(/\.P$/, ''), perpetual: pair.endsWith('.P'), native: true };
  }
  return { exchange, pair, native: false };
}
export function candleRequest(symbol, interval) {
  const m = marketSource(symbol), minutes = Number(interval);
  if (!m.native || ![1, 5, 15, 60, 240, 1440].includes(minutes)) return null;
  const bin = { 1: '1m', 5: '5m', 15: '15m', 60: '1h', 240: '4h', 1440: '1d' };
  const okx = { 1: '1m', 5: '5m', 15: '15m', 60: '1H', 240: '4H', 1440: '1Dutc' };
  if (m.exchange === 'BINANCE') return `${m.perpetual ? 'https://fapi.binance.com/fapi/v1' : 'https://api.binance.com/api/v3'}/klines?symbol=${m.pair}&interval=${bin[minutes]}&limit=500`;
  if (m.exchange === 'OKX') return `https://www.okx.com/api/v5/market/candles?instId=${m.pair.slice(0, -4)}-USDT${m.perpetual ? '-SWAP' : ''}&bar=${okx[minutes]}&limit=300`;
  return `https://api.bybit.com/v5/market/kline?category=${m.perpetual ? 'linear' : 'spot'}&symbol=${m.pair}&interval=${minutes === 1440 ? 'D' : minutes}&limit=500`;
}
export function normalizeCandles(data, exchange) {
  if (exchange === 'OKX' && data.code !== '0') throw new Error('Veri kaynağı bu sembolü döndürmedi.');
  if (exchange === 'BYBIT' && data.retCode !== 0) throw new Error('Veri kaynağı bu sembolü döndürmedi.');
  const rows = exchange === 'BINANCE' ? data : exchange === 'OKX' ? data.data : data.result?.list;
  if (!Array.isArray(rows)) throw new Error('Mum verisi alınamadı.');
  const unique = new Map();
  rows.forEach(r => {
    const [time, open, high, low, close] = r.slice(0, 5).map(Number);
    if ([time, open, high, low, close].every(Number.isFinite) && time > 0 && low > 0 && high >= low && high >= Math.max(open, close) && low <= Math.min(open, close))
      unique.set(time, { time: Math.floor(time / 1000), open, high, low, close });
  });
  return [...unique.values()].sort((a, b) => a.time - b.time);
}
export function ema(candles, period = 20) {
  if (!candles.length) return [];
  let value = candles[0].close;
  return candles.map(c => { value += (c.close - value) * (2 / (period + 1)); return { time: c.time, value }; });
}
