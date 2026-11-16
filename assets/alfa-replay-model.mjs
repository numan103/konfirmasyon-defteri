// Pure helpers for ALFA CHARTS Bar Replay.
export function sliceBars(bars, endIndex) {
  if (!Array.isArray(bars)) return [];
  const n = Math.max(0, Math.min(bars.length, Math.floor(endIndex)));
  return bars.slice(0, n);
}
export function clampIndex(index, length) {
  if (!Number.isFinite(index)) return 0;
  return Math.max(0, Math.min(length, Math.floor(index)));
}
export function replayTime(bars, index) {
  const i = clampIndex(index, bars.length);
  if (i <= 0 || !bars.length) return null;
  return bars[i - 1].time;
}
export function confirmedBars(bars, index, rightBars = 0) {
  // For indicators needing right-side confirmation, drop the last `rightBars` bars.
  const n = clampIndex(index, bars.length);
  return bars.slice(0, Math.max(0, n - rightBars));
}

// UTC exchange boundaries. Weekly bars start Monday, not Unix-epoch Thursday.
export function candleCloseTime(time, timeframe) {
  const seconds = { '1m':60, '5m':300, '15m':900, '30m':1800,
    '1h':3600, '4h':14400, '1d':86400, '1w':604800 }[timeframe];
  if (!seconds) throw new Error('Unsupported timeframe');
  return time + seconds;
}

export class ReplayEngine {
  #full = [];
  constructor({ symbol, timeframe, now = Date.now() / 1000 }) {
    this.symbol = symbol;
    this.timeframe = timeframe;
    candleCloseTime(0, timeframe);
    this.now = now;
    this.index = 0;
    this.startIndex = 0;
  }
  load(bars, startTime) {
    if (!Array.isArray(bars) || !bars.length) throw new Error('No replay data');
    const map = new Map();
    for (const bar of bars) {
      if (![bar.time, bar.open, bar.high, bar.low, bar.close].every(Number.isFinite) ||
          bar.low > Math.min(bar.open, bar.close) || bar.high < Math.max(bar.open, bar.close) ||
          bar.low > bar.high) throw new Error('Invalid replay candle');
      if (candleCloseTime(bar.time, this.timeframe) <= this.now) map.set(bar.time, { ...bar });
    }
    const data = [...map.values()].sort((a,b) => a.time-b.time);
    if (!data.length) throw new Error('No confirmed candles');
    const index = data.findIndex(b => b.time >= startTime);
    if (index < 0) throw new Error('Start time outside loaded history');
    this.#full = data;
    this.index = this.startIndex = index + 1;
    return this.snapshot();
  }
  snapshot() { return this.#full.slice(0, this.index).map(b => ({ ...b })); }
  get clock() {
    const b = this.#full[this.index - 1];
    return b ? candleCloseTime(b.time, this.timeframe) : null;
  }
  step(delta = 1) {
    if (!Number.isInteger(delta)) throw new Error('Integer step required');
    const target = clampIndex(this.index + delta, this.#full.length);
    // Stop at a hole rather than silently skipping unavailable candles.
    const from = Math.min(this.index, target), to = Math.max(this.index, target);
    for (let i = Math.max(1, from); i < to; i++) {
      if (this.#full[i].time !== candleCloseTime(this.#full[i-1].time, this.timeframe)) {
        throw new Error('Missing replay candle');
      }
    }
    this.index = Math.max(1, target);
    return this.snapshot();
  }
  restart() { this.index = this.startIndex; return this.snapshot(); }
  confirmedSource(bars, timeframe) {
    return bars.filter(b => candleCloseTime(b.time, timeframe) <= this.clock).map(b => ({ ...b }));
  }
  serialize() {
    return { version:1, symbol:this.symbol, exchange:'Binance', marketType:'spot',
      timeframe:this.timeframe, startTime:this.#full[this.startIndex-1]?.time,
      currentTime:this.#full[this.index-1]?.time };
  }
}
