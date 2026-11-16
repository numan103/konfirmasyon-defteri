// Pure, dependency-free indicator calculations for ALFA CHARTS.
// Every function takes candles sorted by time ascending and returns an array aligned
// to the input (same length). Warm-up positions are null.
export const INDICATORS = {};

function closes(candles) { return candles.map(c => c.close); }
function highs(candles) { return candles.map(c => c.high); }
function lows(candles) { return candles.map(c => c.low); }
function volumes(candles) { return candles.map(c => c.volume ?? 0); }

export function sma(candles, period = 20) {
  const p = Math.max(1, Math.floor(period));
  const out = new Array(candles.length).fill(null);
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    sum += candles[i].close;
    if (i >= p) sum -= candles[i - p].close;
    if (i >= p - 1) out[i] = sum / p;
  }
  return out;
}

export function ema(candles, period = 20) {
  const p = Math.max(1, Math.floor(period));
  const out = new Array(candles.length).fill(null);
  const k = 2 / (p + 1);
  let seed = null, sum = 0, count = 0;
  for (let i = 0; i < candles.length; i++) {
    if (count < p) { sum += candles[i].close; count++; if (count === p) { seed = sum / p; out[i] = seed; } }
    else { seed = candles[i].close * k + seed * (1 - k); out[i] = seed; }
  }
  return out;
}

export function wma(candles, period = 20) {
  const p = Math.max(1, Math.floor(period));
  const out = new Array(candles.length).fill(null);
  const denom = p * (p + 1) / 2;
  for (let i = p - 1; i < candles.length; i++) {
    let s = 0;
    for (let j = 0; j < p; j++) s += candles[i - p + 1 + j].close * (j + 1);
    out[i] = s / denom;
  }
  return out;
}

export function vwma(candles, period = 20) {
  const p = Math.max(1, Math.floor(period));
  const out = new Array(candles.length).fill(null);
  for (let i = p - 1; i < candles.length; i++) {
    let pv = 0, v = 0;
    for (let j = 0; j < p; j++) { pv += candles[i - p + 1 + j].close * (candles[i - p + 1 + j].volume ?? 0); v += candles[i - p + 1 + j].volume ?? 0; }
    out[i] = v ? pv / v : candles[i].close;
  }
  return out;
}

export function rsi(candles, period = 14) {
  const p = Math.max(1, Math.floor(period));
  const out = new Array(candles.length).fill(null);
  if (candles.length <= p) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= p; i++) {
    const d = candles[i].close - candles[i - 1].close;
    if (d >= 0) gain += d; else loss -= d;
  }
  let avgGain = gain / p, avgLoss = loss / p;
  out[p] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = p + 1; i < candles.length; i++) {
    const d = candles[i].close - candles[i - 1].close;
    const g = d > 0 ? d : 0, l = d < 0 ? -d : 0;
    avgGain = (avgGain * (p - 1) + g) / p;
    avgLoss = (avgLoss * (p - 1) + l) / p;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export function atr(candles, period = 14) {
  const p = Math.max(1, Math.floor(period));
  const trs = candles.map((c, i) => {
    if (i === 0) return c.high - c.low;
    const pc = candles[i - 1].close;
    return Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc));
  });
  const out = new Array(candles.length).fill(null);
  if (candles.length < p) return out;
  let sum = 0;
  for (let i = 0; i < p; i++) sum += trs[i];
  out[p - 1] = sum / p;
  for (let i = p; i < candles.length; i++) out[i] = (out[i - 1] * (p - 1) + trs[i]) / p;
  return out;
}

export function macd(candles, fast = 12, slow = 26, signal = 9) {
  const eFast = ema(candles, fast);
  const eSlow = ema(candles, slow);
  const line = candles.map((_, i) => (eFast[i] == null || eSlow[i] == null) ? null : eFast[i] - eSlow[i]);
  // signal EMA over macd line (treat nulls as 0 for warm-up, then standard EMA from first valid)
  const sig = new Array(candles.length).fill(null);
  const k = 2 / (signal + 1);
  let seed = null, sum = 0, count = 0, validStart = line.findIndex(v => v != null);
  // seed with SMA of first `signal` valid macd values
  const validVals = line.filter(v => v != null);
  if (validVals.length >= signal) {
    let acc = 0;
    for (let j = 0; j < signal; j++) acc += validVals[j];
    seed = acc / signal;
  }
  let vi = 0;
  for (let i = 0; i < candles.length; i++) {
    if (line[i] == null) { sig[i] = null; continue; }
    if (seed == null) { sig[i] = null; continue; }
    if (vi < signal - 1) { vi++; sig[i] = null; if (vi === signal - 1) sig[i] = seed; continue; }
    if (vi === signal - 1) { sig[i] = seed; vi++; continue; }
    seed = line[i] * k + seed * (1 - k);
    sig[i] = seed;
  }
  const hist = candles.map((_, i) => (line[i] == null || sig[i] == null) ? null : line[i] - sig[i]);
  return { macd: line, signal: sig, hist };
}

export function bollinger(candles, period = 20, mult = 2) {
  const mid = sma(candles, period);
  const upper = new Array(candles.length).fill(null);
  const lower = new Array(candles.length).fill(null);
  for (let i = period - 1; i < candles.length; i++) {
    let sq = 0;
    for (let j = 0; j < period; j++) sq += (candles[i - period + 1 + j].close - mid[i]) ** 2;
    const sd = Math.sqrt(sq / period);
    upper[i] = mid[i] + mult * sd;
    lower[i] = mid[i] - mult * sd;
  }
  return { upper, middle: mid, lower };
}

export function vwap(candles) {
  const out = new Array(candles.length).fill(null);
  let cumPV = 0, cumV = 0, day = null;
  for (let i = 0; i < candles.length; i++) {
    const d = new Date(candles[i].time * 1000).toISOString().slice(0, 10);
    if (day !== d) { day = d; cumPV = 0; cumV = 0; }
    const price = (candles[i].high + candles[i].low + candles[i].close) / 3;
    const v = candles[i].volume ?? 0;
    cumPV += price * v; cumV += v;
    out[i] = cumV ? cumPV / cumV : candles[i].close;
  }
  return out;
}

export function stochastic(candles, kPeriod = 14, dPeriod = 3, smooth = 3) {
  const rawK = new Array(candles.length).fill(null);
  for (let i = kPeriod - 1; i < candles.length; i++) {
    let hh = -Infinity, ll = Infinity;
    for (let j = 0; j < kPeriod; j++) { hh = Math.max(hh, candles[i - kPeriod + 1 + j].high); ll = Math.min(ll, candles[i - kPeriod + 1 + j].low); }
    const range = hh - ll;
    rawK[i] = range ? ((candles[i].close - ll) / range) * 100 : 50;
  }
  // smooth %K
  const k = new Array(candles.length).fill(null);
  for (let i = kPeriod - 1 + smooth - 1; i < candles.length; i++) {
    let s = 0;
    for (let j = 0; j < smooth; j++) s += rawK[i - smooth + 1 + j];
    k[i] = s / smooth;
  }
  const d = smaLike(k, dPeriod);
  return { k, d };
}

function smaLike(values, period) {
  const out = new Array(values.length).fill(null);
  let sum = 0, count = 0;
  for (let i = 0; i < values.length; i++) {
    if (values[i] == null) { out[i] = null; continue; }
    sum += values[i]; count++;
    if (count > period) { /* find previous valid to subtract - approximate by sliding over raw positions */ }
  }
  // simpler: standard SMA over the array treating nulls as gaps
  const res = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    let s = 0, n = 0, ok = true;
    for (let j = 0; j < period; j++) {
      if (values[i - j] == null) { ok = false; break; }
      s += values[i - j]; n++;
    }
    if (ok && n === period) res[i] = s / period;
  }
  return res;
}

export function stochRsi(candles, rsiPeriod = 14, stochPeriod = 14, kSmooth = 3, dSmooth = 3) {
  const r = rsi(candles, rsiPeriod);
  // build pseudo-candles from rsi values
  const pseudo = r.map((v, i) => ({ time: candles[i].time, open: v ?? 0, high: v ?? 0, low: v ?? 0, close: v ?? 0, volume: 0 }));
  // stochastic on rsi, but only where rsi valid
  const rawK = new Array(candles.length).fill(null);
  for (let i = 0; i < candles.length; i++) {
    if (r[i] == null) continue;
    // need stochPeriod valid rsi ending at i
    let start = i - stochPeriod + 1;
    if (start < 0) continue;
    let allValid = true;
    for (let j = start; j <= i; j++) if (r[j] == null) { allValid = false; break; }
    if (!allValid) continue;
    let hh = -Infinity, ll = Infinity;
    for (let j = start; j <= i; j++) { hh = Math.max(hh, r[j]); ll = Math.min(ll, r[j]); }
    const range = hh - ll;
    rawK[i] = range ? ((r[i] - ll) / range) * 100 : 50;
  }
  const k = new Array(candles.length).fill(null);
  for (let i = 0; i < candles.length; i++) {
    if (rawK[i] == null) continue;
    // smooth
    let s = 0, n = 0, ok = true;
    for (let j = 0; j < kSmooth; j++) {
      if (rawK[i - j] == null) { ok = false; break; }
      s += rawK[i - j]; n++;
    }
    if (ok && n === kSmooth) k[i] = s / kSmooth;
  }
  const d = smaLike(k, dSmooth);
  return { k, d };
}

export function adx(candles, period = 14) {
  const p = Math.max(1, Math.floor(period));
  const out = new Array(candles.length).fill(null);
  if (candles.length < p + 1) return out;
  // +DM, -DM, TR
  const plusDM = new Array(candles.length).fill(0);
  const minusDM = new Array(candles.length).fill(0);
  const trs = new Array(candles.length).fill(0);
  for (let i = 1; i < candles.length; i++) {
    const up = candles[i].high - candles[i - 1].high;
    const down = candles[i - 1].low - candles[i].low;
    plusDM[i] = (up > down && up > 0) ? up : 0;
    minusDM[i] = (down > up && down > 0) ? down : 0;
    const pc = candles[i - 1].close;
    trs[i] = Math.max(candles[i].high - candles[i].low, Math.abs(candles[i].high - pc), Math.abs(candles[i].low - pc));
  }
  // Wilder smoothing
  let smTR = 0, smPlus = 0, smMinus = 0;
  for (let i = 1; i <= p; i++) { smTR += trs[i]; smPlus += plusDM[i]; smMinus += minusDM[i]; }
  const dx = new Array(candles.length).fill(null);
  let pdi = (smTR ? (smPlus / smTR) * 100 : 0);
  let mdi = (smTR ? (smMinus / smTR) * 100 : 0);
  let adxVal = Math.abs(pdi - mdi) / (pdi + mdi || 1) * 100;
  const adxArr = new Array(candles.length).fill(null);
  // seed adx with first dx
  let adxSum = 0, adxCount = 0;
  // We'll compute DX series first
  const dxSeries = new Array(candles.length).fill(null);
  // recompute smoothed per step
  let sTR = smTR, sP = smPlus, sM = smMinus;
  let adxSmooth = null;
  for (let i = p; i < candles.length; i++) {
    if (i > p) {
      sTR = sTR - sTR / p + trs[i];
      sP = sP - sP / p + plusDM[i];
      sM = sM - sM / p + minusDM[i];
    }
    const pd = sTR ? (sP / sTR) * 100 : 0;
    const md = sTR ? (sM / sTR) * 100 : 0;
    const d = (pd + md) ? (Math.abs(pd - md) / (pd + md)) * 100 : 0;
    dxSeries[i] = d;
    if (i === p) { adxSmooth = d; }
    else { adxSmooth = (adxSmooth * (p - 1) + d) / p; }
    adxArr[i] = adxSmooth;
  }
  // shift: ADX valid from 2p-1? TradingView from p. Keep p.
  for (let i = 0; i < p; i++) adxArr[i] = null;
  return adxArr;
}

export function supertrend(candles, period = 10, mult = 3) {
  const a = atr(candles, period);
  const upper = new Array(candles.length).fill(null);
  const lower = new Array(candles.length).fill(null);
  const trend = new Array(candles.length).fill(1); // 1 up, -1 down
  const st = new Array(candles.length).fill(null);
  for (let i = 0; i < candles.length; i++) {
    if (a[i] == null) continue;
    const hl2 = (candles[i].high + candles[i].low) / 2;
    let bu = hl2 + mult * a[i];
    let bl = hl2 - mult * a[i];
    if (i > 0 && st[i - 1] != null) {
      if (candles[i - 1].close > lower[i - 1]) bl = Math.max(bl, lower[i - 1]);
      if (candles[i - 1].close < upper[i - 1]) bu = Math.min(bu, upper[i - 1]);
    }
    upper[i] = bu; lower[i] = bl;
    if (i === 0 || st[i - 1] == null) { trend[i] = candles[i].close > hl2 ? 1 : -1; }
    else if (trend[i - 1] === 1) { trend[i] = candles[i].close < bl ? -1 : 1; }
    else { trend[i] = candles[i].close > bu ? 1 : -1; }
    st[i] = trend[i] === 1 ? bl : bu;
  }
  return { value: st, trend };
}

export function obv(candles) {
  const out = new Array(candles.length).fill(0);
  let v = 0;
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) { out[i] = candles[i].volume ?? 0; v = out[i]; continue; }
    const vol = candles[i].volume ?? 0;
    if (candles[i].close > candles[i - 1].close) v += vol;
    else if (candles[i].close < candles[i - 1].close) v -= vol;
    out[i] = v;
  }
  return out;
}

export function volumeHistogram(candles) {
  return candles.map(c => ({ time: c.time, value: c.volume ?? 0, color: c.close >= c.open ? 'rgba(38,166,154,0.5)' : 'rgba(239,83,80,0.5)' }));
}
