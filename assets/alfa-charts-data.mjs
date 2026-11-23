export const TIMEFRAMES = Object.freeze({
  '1M': '1m', '3M': '3m', '5M': '5m', '15M': '15m', '30M': '30m',
  '1H': '1h', '2H': '2h', '4H': '4h', '6H': '6h', '12H': '12h',
  '1D': '1d', '3D': '3d', '1W': '1w'
});
export const SYMBOLS = Object.freeze(['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT']);
export const REST_ORIGINS = ['https://data-api.binance.vision', 'https://api.binance.com'];
export const STREAM_ORIGINS = ['wss://data-stream.binance.vision', 'wss://stream.binance.com:9443'];
export function validateMarket(symbol, interval) {
  if (!SYMBOLS.includes(symbol) || !Object.values(TIMEFRAMES).includes(interval)) throw new Error('Desteklenmeyen piyasa');
}
export function restURL(origin, symbol, interval) {
  validateMarket(symbol, interval);
  return `${origin}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=1000`;
}
export function streamURL(origin, symbol, interval) {
  validateMarket(symbol, interval);
  return `${origin}/ws/${symbol.toLowerCase()}@kline_${interval}`;
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
    throw new Error('Geçersiz Binance mum verisi');
  }
  return result;
}
export function parseHistory(rows) {
  if (!Array.isArray(rows) || !rows.length) throw new Error('Binance mum verisi boş');
  const unique = new Map();
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 5) throw new Error('Geçersiz Binance yanıtı');
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
export async function fetchHistory(symbol, interval, signal, fetcher = fetch, endTime = null, startTime = null) {
  validateMarket(symbol, interval);
  let lastError;
  for (const origin of REST_ORIGINS) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    try {
      let url = restURL(origin, symbol, interval);
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
