import { createChart } from './vendor/lightweight-charts-5.0.9/lightweight-charts.standalone.production.mjs';
import { sma, ema, wma, vwma, rsi, macd, atr, bollinger, vwap, stochastic, stochRsi, adx, supertrend, obv } from './alfa-indicators-model.mjs?v=2';

const LWC = await import('./vendor/lightweight-charts-5.0.9/lightweight-charts.standalone.production.mjs');

export const INDICATOR_CATALOG = [
  { id: 'sma', name: 'SMA', category: 'Trend', pane: 'main' },
  { id: 'ema', name: 'EMA', category: 'Trend', pane: 'main' },
  { id: 'wma', name: 'WMA', category: 'Trend', pane: 'main' },
  { id: 'vwma', name: 'VWMA', category: 'Trend', pane: 'main' },
  { id: 'vwap', name: 'VWAP', category: 'Trend', pane: 'main' },
  { id: 'bollinger', name: 'Bollinger Bands', category: 'Volatility', pane: 'main' },
  { id: 'supertrend', name: 'Supertrend', category: 'Trend', pane: 'main' },
  { id: 'rsi', name: 'RSI', category: 'Momentum', pane: 'oscillator' },
  { id: 'macd', name: 'MACD', category: 'Momentum', pane: 'oscillator' },
  { id: 'stochastic', name: 'Stochastic', category: 'Momentum', pane: 'oscillator' },
  { id: 'stochrsi', name: 'Stochastic RSI', category: 'Momentum', pane: 'oscillator' },
  { id: 'atr', name: 'ATR', category: 'Volatility', pane: 'oscillator' },
  { id: 'adx', name: 'ADX', category: 'Trend', pane: 'oscillator' },
  { id: 'obv', name: 'OBV', category: 'Volume', pane: 'oscillator' },
];

const DEFAULTS = {
  sma: { period: 20, source: 'close', color: '#f5a623' },
  ema: { period: 20, source: 'close', color: '#2962ff' },
  wma: { period: 20, source: 'close', color: '#9c27b0' },
  vwma: { period: 20, source: 'close', color: '#00bcd4' },
  vwap: { source: 'hlc3', color: '#ff9800' },
  bollinger: { period: 20, mult: 2, source: 'close', color: '#4caf50' },
  supertrend: { period: 10, mult: 3, color: '#26a69a' },
  rsi: { period: 14, source: 'close', color: '#7e57c2' },
  macd: { fast: 12, slow: 26, signal: 9, source: 'close', color: '#2962ff' },
  stochastic: { k: 14, d: 3, smooth: 3, source: 'close', color: '#2962ff' },
  stochrsi: { rsiPeriod: 14, stochPeriod: 14, kSmooth: 3, dSmooth: 3, source: 'close', color: '#2962ff' },
  atr: { period: 14, color: '#ff5722' },
  adx: { period: 14, color: '#e91e63' },
  obv: { color: '#607d8b' },
};

function uid() { return 'ind-' + Math.random().toString(36).slice(2, 9); }

export class IndicatorManager {
  constructor({ chart, getBars }) {
    this.chart = chart;
    this.getBars = getBars;
    this.items = []; // {id,type,params,series:[],pane}
    this.storageKey = 'alfa-indicators:v1';
  }
  list() { return this.items.map(i => ({ id: i.id, type: i.type, params: i.params })); }
  add(type, params = {}) {
    const def = INDICATOR_CATALOG.find(d => d.id === type);
    if (!def) return null;
    const item = { id: uid(), type, params: { ...DEFAULTS[type], ...params }, series: [], pane: null, def };
    this.items.push(item);
    this.render(item);
    return item;
  }
  remove(id) {
    const idx = this.items.findIndex(i => i.id === id);
    if (idx < 0) return;
    const item = this.items[idx];
    for (const s of item.series) { try { if (item.pane) item.pane.removeSeries(s); else this.chart.removeSeries(s); } catch {} }
    if (item.pane) { try { this.chart.removePane(item.pane); } catch {} }
    this.items.splice(idx, 1);
  }
  clear() { for (const i of [...this.items]) this.remove(i.id); }
  renderAll() { for (const i of this.items) this.render(i); }
  compute(item, bars) {
    const p = item.params;
    switch (item.type) {
      case 'sma': return [{ key: 'value', data: sma(bars, p.period, p.source).map((v, i) => v == null ? null : { time: bars[i].time, value: v }) }];
      case 'ema': return [{ key: 'value', data: ema(bars, p.period, p.source).map((v, i) => v == null ? null : { time: bars[i].time, value: v }) }];
      case 'wma': return [{ key: 'value', data: wma(bars, p.period, p.source).map((v, i) => v == null ? null : { time: bars[i].time, value: v }) }];
      case 'vwma': return [{ key: 'value', data: vwma(bars, p.period, p.source).map((v, i) => v == null ? null : { time: bars[i].time, value: v }) }];
      case 'vwap': return [{ key: 'value', data: vwap(bars, p.source).map((v, i) => ({ time: bars[i].time, value: v })) }];
      case 'bollinger': {
        const b = bollinger(bars, p.period, p.mult, p.source);
        return [
          { key: 'upper', data: b.upper.map((v, i) => v == null ? null : { time: bars[i].time, value: v }) },
          { key: 'middle', data: b.middle.map((v, i) => v == null ? null : { time: bars[i].time, value: v }) },
          { key: 'lower', data: b.lower.map((v, i) => v == null ? null : { time: bars[i].time, value: v }) },
        ];
      }
      case 'supertrend': {
        const s = supertrend(bars, p.period, p.mult);
        return [{ key: 'value', data: s.value.map((v, i) => v == null ? null : { time: bars[i].time, value: v }) }];
      }
      case 'rsi': return [{ key: 'value', data: rsi(bars, p.period, p.source).map((v, i) => v == null ? null : { time: bars[i].time, value: v }) }];
      case 'macd': {
        const m = macd(bars, p.fast, p.slow, p.signal, p.source);
        return [
          { key: 'macd', data: m.macd.map((v, i) => v == null ? null : { time: bars[i].time, value: v }) },
          { key: 'signal', data: m.signal.map((v, i) => v == null ? null : { time: bars[i].time, value: v }) },
          { key: 'hist', data: m.hist.map((v, i) => v == null ? null : { time: bars[i].time, value: v }) },
        ];
      }
      case 'stochastic': {
        const s = stochastic(bars, p.k, p.d, p.smooth, p.source);
        return [
          { key: 'k', data: s.k.map((v, i) => v == null ? null : { time: bars[i].time, value: v }) },
          { key: 'd', data: s.d.map((v, i) => v == null ? null : { time: bars[i].time, value: v }) },
        ];
      }
      case 'stochrsi': {
        const s = stochRsi(bars, p.rsiPeriod, p.stochPeriod, p.kSmooth, p.dSmooth, p.source);
        return [
          { key: 'k', data: s.k.map((v, i) => v == null ? null : { time: bars[i].time, value: v }) },
          { key: 'd', data: s.d.map((v, i) => v == null ? null : { time: bars[i].time, value: v }) },
        ];
      }
      case 'atr': return [{ key: 'value', data: atr(bars, p.period).map((v, i) => v == null ? null : { time: bars[i].time, value: v }) }];
      case 'adx': return [{ key: 'value', data: adx(bars, p.period).map((v, i) => v == null ? null : { time: bars[i].time, value: v }) }];
      case 'obv': return [{ key: 'value', data: obv(bars).map((v, i) => ({ time: bars[i].time, value: v })) }];
      default: return [];
    }
  }
  render(item) {
    const bars = this.getBars();
    const lines = this.compute(item, bars);
    const isOsc = item.def.pane === 'oscillator';
    if (isOsc && !item.pane) item.pane = this.chart.addPane();
    const target = isOsc ? item.pane : this.chart;
    const colors = ['#2962ff', '#ff6d00', '#00c853', '#aa00ff', '#ff1744'];
    for (const [idx, line] of lines.entries()) {
      const opts = { color: idx === 0 ? item.params.color : colors[idx % colors.length], lineWidth: 2, title: item.def.name };
      const series = target.addSeries(LWC.LineSeries, opts);
      const clean = line.data.filter(Boolean);
      series.setData(clean);
      item.series.push(series);
    }
  }
  updateAll(bars) {
    for (const item of this.items) {
      const lines = this.compute(item, bars);
      for (const [idx, line] of lines.entries()) {
        const s = item.series[idx];
        if (s) s.setData(line.data.filter(Boolean));
      }
    }
  }
  toJSON() { return this.items.map(i => ({ type: i.type, params: i.params })); }
  fromJSON(arr) {
    this.clear();
    for (const e of arr || []) this.add(e.type, e.params);
  }
}
