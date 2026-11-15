export const TIMEFRAMES = Object.freeze({
  '1M': '1m', '5M': '5m', '15M': '15m', '30M': '30m',
  '1H': '1h', '4H': '4h', '1D': '1d', '1W': '1w'
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
export function candle(time, open, high, low, close) {
  const result = { time: Number(time) / 1000, open: Number(open), high: Number(high), low: Number(low), close: Number(close) };
  if (!Object.values(result).every(Number.isFinite) || !Number.isInteger(result.time) || result.time <= 0 ||
      Math.min(result.open, result.high, result.low, result.close) <= 0 ||
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
    const c = candle(...row.slice(0, 5)); unique.set(c.time, c);
  }
  return [...unique.values()].sort((a, b) => a.time - b.time);
}
export function parseKline(raw, symbol, interval) {
  const message = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (message.e !== 'kline' || message.s !== symbol || message.k?.s !== symbol || message.k?.i !== interval) return null;
  return candle(message.k.t, message.k.o, message.k.h, message.k.l, message.k.c);
}
export function mergeCandles(history, updates, limit = 1000) {
  const merged = new Map(history.map(c => [c.time, c]));
  for (const c of updates) merged.set(c.time, c);
  return [...merged.values()].sort((a, b) => a.time - b.time).slice(-limit);
}
export async function fetchHistory(symbol, interval, signal, fetcher = fetch) {
  let lastError;
  for (const origin of REST_ORIGINS) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    try {
      const response = await fetcher(restURL(origin, symbol, interval), { signal, cache: 'no-store' });
      if (!response.ok) throw new Error(`Binance HTTP ${response.status}`);
      return parseHistory(await response.json());
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error;
    }
  }
  throw lastError;
}
