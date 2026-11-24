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

// Oscillator panes stay inside the chart; collapsing only shrinks them to a thin
// ribbon instead of opening a separate page-like area above the candles.
export function indicatorPaneHeight(chartHeight, collapsed) {
  if (collapsed) return 30;
  return Math.max(80, Math.min(150, chartHeight * .22));
}

export class IndicatorManager {
  constructor({ chart, getBars, onChange }) {
    this.chart = chart;
    this.getBars = getBars;
    this.items = []; // {id,type,params,series:[],pane}
    this.onChange = onChange;
    this.suppressed = false;
    this.axisLabels = false;
    this.storageKey = 'alfa-indicators:v1';
  }
  list() { return this.items.map(i => ({ id: i.id, type: i.type, params: i.params, visible: i.visible, collapsed: !!i.collapsed })); }
  add(type, params = {}, visible = true, collapsed = false) {
    const def = INDICATOR_CATALOG.find(d => d.id === type);
    if (!def) return null;
    if (this.items.length >= 24) throw new Error('En fazla 24 indikatör ekleyebilirsiniz.');
    const item = { id: uid(), type, params: { ...DEFAULTS[type], ...params }, visible: visible !== false, collapsed: !!collapsed, series: [], pane: null, def };
    this.items.push(item);
    this.render(item);
    this.onChange?.();
    return item;
  }
  remove(id) {
    const idx = this.items.findIndex(i => i.id === id);
    if (idx < 0) return;
    const item = this.items[idx];
    this.detach(item);
    this.items.splice(idx, 1);
    this.onChange?.();
  }
  detach(item) {
    for (const s of item.series) this.chart.removeSeries(s);
    // Empty panes are removed by Lightweight Charts when their last series leaves.
    item.series = []; item.pane = null;
  }
  setVisible(id, visible) {
    const item = this.items.find(i => i.id === id); if (!item) return;
    item.visible = !!visible; this.render(item); this.onChange?.();
  }
  setCollapsed(id, collapsed) {
    const item = this.items.find(i => i.id === id); if (!item) return;
    item.collapsed = !!collapsed;
    if (item.pane?.setHeight) item.pane.setHeight(indicatorPaneHeight(this.chart.chartElement().clientHeight, item.collapsed));
    this.onChange?.();
  }
  setSuppressed(value) {
    if (this.suppressed === !!value) return;
    this.suppressed = !!value; this.renderAll();
  }
  updateParams(id, params) {
    const item = this.items.find(i => i.id === id); if (!item) return;
    item.params = { ...item.params, ...params }; this.render(item); this.onChange?.();
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
    this.detach(item);
    if (!item.visible || this.suppressed) return;
    const bars = this.getBars();
    const lines = this.compute(item, bars);
    const isOsc = item.def.pane === 'oscillator';
    const paneIndex = isOsc ? this.chart.panes().length : 0;
    const colors = ['#2962ff', '#ff6d00', '#00c853', '#aa00ff', '#ff1744'];
    for (const [idx, line] of lines.entries()) {
      const histogram = line.key === 'hist';
      const opts = { color: idx === 0 ? item.params.color : colors[idx % colors.length], lineWidth: 1,
        title: item.def.name, priceLineVisible: false, lastValueVisible: this.axisLabels,
        crosshairMarkerRadius: 3 };
      if (isOsc) opts.priceFormat = { type: 'price', precision: 2, minMove: .01 };
      const series = this.chart.addSeries(histogram ? LWC.HistogramSeries : LWC.LineSeries, opts, paneIndex);
      const clean = line.data.filter(Boolean).map(p => histogram ? { ...p, color: p.value >= 0 ? '#26c89c88' : '#ef667788' } : p);
      series.setData(clean);
      item.series.push(series);
    }
    if (isOsc) {
      item.pane = item.series[0].getPane();
      const height = indicatorPaneHeight(this.chart.chartElement().clientHeight, item.collapsed);
      if (item.pane.setHeight) item.pane.setHeight(height);
      const guides = item.type === 'rsi' ? [30, 70] : ['stochastic', 'stochrsi'].includes(item.type) ? [20, 80] : item.type === 'macd' ? [0] : [];
      for (const price of guides) item.series[0].createPriceLine({ price, color: '#53617a66', lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: '' });
    }
  }
  updateAll(bars) {
    for (const item of this.items) {
      const lines = this.compute(item, bars);
      for (const [idx, line] of lines.entries()) {
        const s = item.series[idx];
        if (s) s.setData(line.data.filter(Boolean).map(p => line.key === 'hist' ? { ...p, color: p.value >= 0 ? '#26c89c88' : '#ef667788' } : p));
      }
    }
  }
  toJSON() { return this.items.map(i => ({ type: i.type, params: i.params, visible: i.visible, collapsed: !!i.collapsed })); }
  fromJSON(arr) {
    this.clear();
    for (const e of arr || []) if (e && typeof e.type === 'string') this.add(e.type, e.params, e.visible, e.collapsed);
  }
}
