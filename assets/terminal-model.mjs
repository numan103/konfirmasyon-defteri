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
      unique.set(time, { time: Math.floor(time / 1000), open, high, low, close, volume: Math.max(0, Number(r[5]) || 0) });
  });
  return [...unique.values()].sort((a, b) => a.time - b.time);
}
export function ema(candles, period = 20) {
  if (!candles.length) return [];
  let value = candles[0].close;
  return candles.map(c => { value += (c.close - value) * (2 / (period + 1)); return { time: c.time, value }; });
}
export function sma(data, period = 20) {
  let sum = 0;
  return data.flatMap((c, i) => {
    sum += c.close;
    if (i >= period) sum -= data[i - period].close;
    return i >= period - 1 ? [{ time: c.time, value: sum / period }] : [];
  });
}
export function rsi(data, period = 14) {
  if (data.length <= period) return [];
  let gain = 0, loss = 0;
  const result = [];
  for (let i = 1; i < data.length; i++) {
    const delta = data[i].close - data[i - 1].close;
    if (i <= period) { gain += Math.max(delta, 0) / period; loss += Math.max(-delta, 0) / period; }
    else { gain = (gain * (period - 1) + Math.max(delta, 0)) / period; loss = (loss * (period - 1) + Math.max(-delta, 0)) / period; }
    if (i >= period) result.push({ time: data[i].time, value: gain === 0 && loss === 0 ? 50 : loss === 0 ? 100 : 100 - 100 / (1 + gain / loss) });
  }
  return result;
}
// Long-only crossover. Signal from a CLOSED bar executes at the NEXT bar open.
// Open positions are reported separately, never counted as realized profit.
export function backtestEMA(data, { fast = 9, slow = 21, feePct = 0.1, slippagePct = 0.02 } = {}) {
  if (![fast, slow].every(Number.isInteger) || fast < 2 || slow <= fast || slow > 200 ||
      ![feePct, slippagePct].every(n => Number.isFinite(n) && n >= 0 && n <= 5))
    throw new Error('EMA: 2 ≤ hızlı < yavaş ≤ 200; komisyon/kayma: %0–5 olmalı.');
  if (data.length < slow + 3) throw new Error('Seçilen EMA dönemleri için yeterli kapalı mum yok.');
  const f = ema(data, fast), s = ema(data, slow), fee = feePct / 100, slip = slippagePct / 100;
  let position = null, equity = 1, peak = 1, maxDrawdownPct = 0;
  const trades = [];
  for (let i = slow + 1; i < data.length; i++) {
    const up = f[i - 2].value <= s[i - 2].value && f[i - 1].value > s[i - 1].value;
    const down = f[i - 2].value >= s[i - 2].value && f[i - 1].value < s[i - 1].value;
    if (!position && up) position = { time: data[i].time, price: data[i].open * (1 + slip) };
    else if (position && down) {
      const exit = data[i].open * (1 - slip);
      const multiplier = exit * (1 - fee) / (position.price * (1 + fee));
      trades.push({ entryTime: position.time, exitTime: data[i].time, entry: position.price, exit, returnPct: (multiplier - 1) * 100 });
      equity *= multiplier; peak = Math.max(peak, equity);
      maxDrawdownPct = Math.max(maxDrawdownPct, (peak - equity) / peak * 100);
      position = null;
    }
  }
  return { trades, netReturnPct: (equity - 1) * 100, winRate: trades.length ? trades.filter(t => t.returnPct > 0).length / trades.length * 100 : null, maxDrawdownPct, openPosition: position };
}
export function parseCandleCSV(text) {
  const lines=String(text).trim().split(/\r?\n/).filter(Boolean);
  if(!lines.length)return [];
  const delimiter=lines[0].includes(';')?';':lines[0].includes('\t')?'\t':',';
  const cells=line=>line.split(delimiter).map(v=>v.trim().replace(/^"|"$/g,''));
  const header=cells(lines[0]).map(v=>v.toLowerCase());
  const hasHeader=header.some(v=>['timestamp','time','date'].includes(v));
  const indexes=hasHeader?[header.findIndex(v=>['timestamp','time','date'].includes(v)),...['open','high','low','close','volume'].map(k=>header.indexOf(k))]:[0,1,2,3,4,5];
  if(indexes.slice(0,5).some(i=>i<0))throw new Error('CSV başlığı timestamp,open,high,low,close,volume olmalı.');
  const rows=lines.slice(hasHeader?1:0).slice(-10000).map(line=>{
    const c=cells(line), raw=c[indexes[0]], n=Number(raw);
    const time=raw && Number.isFinite(n)?(n<1e12?n*1000:n):Date.parse(raw);
    return [time,...indexes.slice(1).map(i=>i>=0?Number(String(c[i]).replace(',','.')):0)];
  });
  const result=normalizeCandles(rows,'BINANCE');
  if(result.length!==rows.length)throw new Error('CSV geçersiz veya tekrarlanan mumlar içeriyor. Tarih ve OHLC değerlerini kontrol et.');
  return result;
}
