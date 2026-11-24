// Free market-structure studies for Alfa Charts. All data comes from keyless
// public Binance REST endpoints; no API key, serverless function or database
// write is introduced. Non-Binance symbols are never silently converted.
import { parseMarketRef } from './alfa-charts-data.mjs?v=10';
import {
  fetchOpenInterest, fetchLongShortRatio, fetchKlineFlow, fetchDepthHeatmap,
  cvdFromFlow, deltaFromFlow, footprintFromFlow, intervalToPeriod,
  PUBLIC_MARKET_SOURCES, PUBLIC_STUDY_DETAILS
} from './alfa-market-data-public.mjs?v=2';

const LWC = await import('./vendor/lightweight-charts-5.0.9/lightweight-charts.standalone.production.mjs');
const HEX = /^#[0-9a-f]{6}$/i;
export const PUBLIC_STUDY_IDS = Object.freeze(['oi', 'longShort', 'cvdSpot', 'cvdPerp', 'marketDelta', 'footprint', 'heatmap']);
export const PUBLIC_STUDY_NAMES = Object.freeze({
  oi: 'Açık Pozisyon', longShort: 'Long / Short Oranı', cvdSpot: 'CVD · Spot',
  cvdPerp: 'CVD · Perpetual', marketDelta: 'Market Delta', footprint: PUBLIC_STUDY_DETAILS.footprint.name,
  heatmap: PUBLIC_STUDY_DETAILS.heatmap.name
});
const DEFAULTS = Object.freeze({
  oi: { period: 'auto', color: '#8ea7ff', refresh: 300 },
  longShort: { period: 'auto', color: '#d5b16a', refresh: 300 },
  cvdSpot: { color: '#26c89c', refresh: 300 },
  cvdPerp: { color: '#8ea7ff', refresh: 300 },
  marketDelta: { market: 'auto', color: '#71b9c0', refresh: 300 },
  footprint: { market: 'auto', color: '#7aafa0', refresh: 300 },
  heatmap: { market: 'auto', levels: 40, refresh: 300, bidColor: '#26c89c', askColor: '#ef6677' }
});
const PERIODS = ['auto', '5m', '15m', '30m', '1h', '4h', '1d'];
const MARKETS = ['auto', 'spot', 'perp'];

export function normalizePublicStudyConfig(id, raw = {}) {
  const out = { ...(DEFAULTS[id] || {}) };
  if ('period' in out && PERIODS.includes(String(raw.period))) out.period = String(raw.period);
  if ('market' in out && MARKETS.includes(String(raw.market))) out.market = String(raw.market);
  if ('color' in out && HEX.test(String(raw.color || ''))) out.color = String(raw.color);
  if ('bidColor' in out && HEX.test(String(raw.bidColor || ''))) out.bidColor = String(raw.bidColor);
  if ('askColor' in out && HEX.test(String(raw.askColor || ''))) out.askColor = String(raw.askColor);
  if ('levels' in out && Number.isFinite(Number(raw.levels))) out.levels = Math.min(60, Math.max(10, Math.round(Number(raw.levels))));
  if ('refresh' in out && Number.isFinite(Number(raw.refresh))) out.refresh = Math.min(600, Math.max(60, Math.round(Number(raw.refresh))));
  return out;
}

function withAlpha(hex, alpha) {
  const h = String(hex || '').replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(h)) return hex;
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${alpha})`;
}

// Pure market resolution: a qualified non-Binance ref stays on its own venue
// and the study reports that public microstructure data is unavailable.
export function publicStudyMarket(ref, requested = 'auto') {
  try {
    const descriptor = typeof ref === 'string' ? parseMarketRef(ref) : ref;
    if (!descriptor || !['binance', 'binance-perp'].includes(descriptor.feed)) return null;
    const market = requested === 'spot' || requested === 'perp' ? requested
      : descriptor.feed === 'binance-perp' || descriptor.marketType === 'perp' ? 'perp' : 'spot';
    return { symbol: descriptor.feedSymbol, market };
  } catch { return null; }
}

export class PublicStudiesManager {
  constructor({ chart, series, getBars, getSymbol, getInterval, onStatus } = {}) {
    this.chart = chart;
    this.series = series;
    this.getBars = getBars || (() => []);
    this.getSymbol = getSymbol || (() => 'BTCUSDT');
    this.getInterval = getInterval || (() => '1h');
    this.onStatus = onStatus || (() => {});
    this.configs = Object.fromEntries(PUBLIC_STUDY_IDS.map(id => [id, { ...DEFAULTS[id] }]));
    this.enabled = Object.fromEntries(PUBLIC_STUDY_IDS.map(id => [id, false]));
    this.seriesById = Object.fromEntries(PUBLIC_STUDY_IDS.map(id => [id, []]));
    this.priceLines = [];
    this.controllers = new Map();
    this.timers = new Map();
    this.cache = new Map();
    this.context = { symbol: '', interval: '' };
    this.lastBarCount = 0;
    const self = this;
    this.facades = Object.fromEntries(PUBLIC_STUDY_IDS.map(id => [id, {
      get enabled() { return self.enabled[id]; },
      setEnabled(value) { self.setEnabled(id, value); },
      get config() { return self.configs[id]; },
      defaultConfig() { return { ...DEFAULTS[id] }; },
      updateConfig(cfg) { self.updateConfig(id, cfg); }
    }]));
  }
  toJSON() { return structuredClone(this.configs); }
  applyConfig(raw) {
    for (const id of PUBLIC_STUDY_IDS) this.configs[id] = normalizePublicStudyConfig(id, raw?.[id] || {});
    this.cache.clear();
    for (const id of PUBLIC_STUDY_IDS) if (this.enabled[id]) this.refresh(id, false, true);
  }
  setEnabled(id, value) {
    if (!PUBLIC_STUDY_IDS.includes(id)) return;
    const next = !!value;
    if (this.enabled[id] === next) return;
    this.enabled[id] = next;
    this.detach(id);
    if (next) this.refresh(id, true);
  }
  updateConfig(id, raw) {
    if (!PUBLIC_STUDY_IDS.includes(id)) return;
    this.configs[id] = normalizePublicStudyConfig(id, raw);
    this.cache.delete(id);
    if (this.enabled[id]) this.refresh(id, true, true);
  }
  setContext(symbol = this.getSymbol(), interval = this.getInterval()) {
    if (this.context.symbol === symbol && this.context.interval === interval) return;
    for (const id of PUBLIC_STUDY_IDS) { this.abort(id); this.detach(id); }
    this.context = { symbol, interval };
    this.lastBarCount = this.getBars().length;
    for (const id of PUBLIC_STUDY_IDS) if (this.enabled[id]) this.refresh(id, true);
  }
  updateBars() {
    const count = this.getBars().length;
    if (!count || count === this.lastBarCount) return;
    this.lastBarCount = count;
    for (const id of PUBLIC_STUDY_IDS) if (this.enabled[id]) this.refresh(id);
  }
  abort(id) {
    const controller = this.controllers.get(id);
    if (controller) { controller.abort(); this.controllers.delete(id); }
    const timer = this.timers.get(id);
    if (timer) { clearInterval(timer); this.timers.delete(id); }
  }
  detach(id) {
    this.abort(id);
    for (const s of this.seriesById[id] || []) {
      try { this.chart.removeSeries(s); } catch {}
    }
    this.seriesById[id] = [];
    if (id === 'heatmap') this.clearPriceLines();
  }
  clearPriceLines() {
    for (const line of this.priceLines) {
      try { this.series?.removePriceLine(line); } catch {}
    }
    this.priceLines = [];
  }
  dispose() {
    for (const id of PUBLIC_STUDY_IDS) this.detach(id);
    this.cache.clear();
  }
  resolve(id) {
    const cfg = this.configs[id];
    const requested = ['marketDelta', 'footprint', 'heatmap'].includes(id) ? cfg.market : 'auto';
    const found = publicStudyMarket(this.context.symbol, requested);
    if (!found) {
      this.onStatus(`${PUBLIC_STUDY_NAMES[id]}: yalnızca Binance Spot / Vadeli sembollerde kullanılabilir`, 'error');
      return null;
    }
    return found;
  }
  cacheKey(id, market, cfg) {
    const shape = { id, symbol: market.symbol, market: market.market, interval: this.context.interval };
    if (cfg.period) shape.period = cfg.period === 'auto' ? intervalToPeriod(this.context.interval) : cfg.period;
    return JSON.stringify(shape);
  }
  async refresh(id, notify = false, force = false) {
    if (!this.enabled[id] || !this.context.symbol) return;
    const controller = new AbortController();
    this.abort(id);
    this.controllers.set(id, controller);
    const cfg = this.configs[id];
    const market = this.resolve(id);
    if (!market) return;
    const key = this.cacheKey(id, market, cfg);
    const ttl = id === 'heatmap' ? 20000 : 90000;
    const cached = this.cache.get(id);
    let data = !force && cached?.key === key && Date.now() - cached.at < ttl ? cached.data : null;
    try {
      if (!data) {
        if (notify) this.onStatus(`${PUBLIC_STUDY_NAMES[id]} verisi alınıyor…`, 'waiting');
        data = await this.load(id, market, cfg, controller.signal);
        if (controller.signal.aborted) return;
        this.cache.set(id, { key, at: Date.now(), data });
      }
      this.detach(id);
      this.render(id, data, cfg);
      this.schedule(id);
      if (notify) this.onStatus(`${PUBLIC_STUDY_NAMES[id]} hazır · ${PUBLIC_MARKET_SOURCES[id]}`, 'ok');
    } catch (error) {
      if (controller.signal.aborted || error?.name === 'AbortError') return;
      this.detach(id);
      if (notify) this.onStatus(`${PUBLIC_STUDY_NAMES[id]} verisi alınamadı`, 'error');
    } finally {
      if (this.controllers.get(id) === controller) this.controllers.delete(id);
    }
  }
  schedule(id) {
    const timer = this.timers.get(id);
    if (timer) clearInterval(timer);
    const seconds = Math.min(600, Math.max(60, Number(this.configs[id].refresh) || 300));
    this.timers.set(id, setInterval(() => {
      if (!this.enabled[id]) return;
      if (typeof document !== 'undefined' && document.hidden) return;
      void this.refresh(id);
    }, seconds * 1000));
  }
  async load(id, market, cfg, signal) {
    if (id === 'oi') return fetchOpenInterest(market.symbol, cfg.period === 'auto' ? intervalToPeriod(this.context.interval) : cfg.period, 500, signal);
    if (id === 'longShort') return fetchLongShortRatio(market.symbol, cfg.period === 'auto' ? intervalToPeriod(this.context.interval) : cfg.period, 500, signal);
    if (id === 'heatmap') return fetchDepthHeatmap({ symbol: market.symbol, market: market.market, levels: cfg.levels, signal });
    const flowMarket = id === 'cvdSpot' ? 'spot' : id === 'cvdPerp' ? 'perp' : market.market;
    return fetchKlineFlow({ symbol: market.symbol, market: flowMarket, interval: this.context.interval, limit: 500, signal });
  }
  render(id, data, cfg) {
    if (id === 'heatmap') { this.renderHeatmap(data, cfg); return; }
    const lines = this.lines(id, data, cfg);
    if (!lines.length || !lines.some(l => l.values.length)) return;
    const paneIndex = this.chart.panes().length;
    for (const line of lines) {
      const histogram = line.type === 'histogram';
      const opts = {
        color: line.color, lineWidth: 1, title: PUBLIC_STUDY_NAMES[id],
        priceLineVisible: false, lastValueVisible: false, crosshairMarkerRadius: 3,
        priceFormat: { type: 'price', precision: line.precision, minMove: 1 / Math.pow(10, line.precision) }
      };
      if (histogram) { opts.base = 0; opts.color = line.color; }
      const series = this.chart.addSeries(histogram ? LWC.HistogramSeries : LWC.LineSeries, opts, paneIndex);
      const values = line.values.map(p => histogram
        ? { ...p, color: p.value >= 0 ? withAlpha(line.color, .55) : withAlpha('#ef6677', .55) }
        : p);
      series.setData(values);
      this.seriesById[id].push(series);
    }
    const firstPane = this.seriesById[id][0]?.getPane?.();
    try { firstPane?.setHeight(Math.max(80, Math.min(150, this.chart.chartElement().clientHeight * .22))); } catch {}
  }
  lines(id, data, cfg) {
    if (id === 'oi') return [{ values: data.map(p => ({ time: p.time, value: p.value })), color: cfg.color, precision: 0 }];
    if (id === 'longShort') return [{ values: data.map(p => ({ time: p.time, value: p.ratio })), color: cfg.color, precision: 4 }];
    if (id === 'cvdSpot' || id === 'cvdPerp') return [{ values: cvdFromFlow(data), color: cfg.color, precision: 2 }];
    if (id === 'marketDelta') return [{ type: 'histogram', values: deltaFromFlow(data), color: cfg.color, precision: 2 }];
    if (id === 'footprint') return [{ type: 'histogram', values: footprintFromFlow(data), color: cfg.color, precision: 2 }];
    return [];
  }
  renderHeatmap(data, cfg) {
    this.clearPriceLines();
    const levels = [
      ...data.bids.slice(0, Math.ceil(cfg.levels / 2)).map(l => ({ ...l, color: cfg.bidColor })),
      ...data.asks.slice(0, Math.floor(cfg.levels / 2)).map(l => ({ ...l, color: cfg.askColor }))
    ];
    const dotted = LWC.LineStyle?.Dotted ?? 1;
    for (const level of levels) {
      if (!(level.price > 0)) continue;
      const line = this.series?.createPriceLine?.({
        price: level.price, color: withAlpha(level.color, .25 + level.weight * .65),
        lineWidth: level.weight > .7 ? 2 : 1, lineStyle: dotted,
        axisLabelVisible: false, title: PUBLIC_STUDY_NAMES.heatmap
      });
      if (line) this.priceLines.push(line);
    }
  }
}
