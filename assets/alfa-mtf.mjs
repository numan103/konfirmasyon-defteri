import { fetchHistory } from './alfa-charts-data.mjs?v=1';
import { findSwings, classifyStructure } from './alfa-market-structure-model.mjs?v=1';
import { computeFvg } from './alfa-fvg-model.mjs?v=1';

const HTF_LIST = ['15m', '30m', '1h', '4h', '1d', '1w'];
const cache = new Map(); // key: symbol|tf -> {bars, ts}

export async function fetchHtfBars(symbol, tf, signal) {
  const key = symbol + '|' + tf;
  const c = cache.get(key);
  if (c && Date.now() - c.ts < 60000) return c.bars;
  const bars = await fetchHistory(symbol, tf, signal);
  cache.set(key, { bars, ts: Date.now() });
  return bars;
}

export function clearHtfCache(symbol) {
  for (const k of [...cache.keys()]) if (k.startsWith(symbol + '|')) cache.delete(k);
}

export class MtfManager {
  constructor({ chart, series, host, getBars, getInterval }) {
    this.chart = chart;
    this.series = series;
    this.host = host;
    this.getBars = getBars;
    this.getInterval = getInterval;
    this.config = this.loadConfig();
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.style.position = 'absolute';
    this.svg.style.inset = '0';
    this.svg.style.width = '100%';
    this.svg.style.height = '100%';
    this.svg.style.pointerEvents = 'none';
    this.svg.style.zIndex = '6';
    this.host.append(this.svg);
    this.htfData = new Map(); // tf -> bars
    this.loading = false;
    this.boundRender = () => this.render();
    this.chart.timeScale().subscribeVisibleTimeRangeChange(this.boundRender);
    this.chart.timeScale().subscribeVisibleLogicalRangeChange(this.boundRender);
    new ResizeObserver(() => this.render()).observe(host);
  }
  loadConfig() {
    try { return JSON.parse(localStorage.getItem('alfa-mtf:v1') || 'null') || this.defaultConfig(); }
    catch { return this.defaultConfig(); }
  }
  defaultConfig() {
    return { htf: ['1h'], showSwings: true, showFvg: false, confirmedOnly: true, extend: true };
  }
  saveConfig() { try { localStorage.setItem('alfa-mtf:v1', JSON.stringify(this.config)); } catch {} }
  async loadAll(symbol, signal) {
    this.loading = true;
    this.htfData.clear();
    for (const tf of this.config.htf) {
      try {
        const bars = await fetchHtfBars(symbol, tf, signal);
        // confirmed only: drop last developing bar
        const confirmed = this.config.confirmedOnly && bars.length ? bars.slice(0, -1) : bars;
        this.htfData.set(tf, confirmed);
      } catch { this.htfData.set(tf, []); }
    }
    this.loading = false;
    this.render();
  }
  clear() { while (this.svg.firstChild) this.svg.removeChild(this.svg.firstChild); }
  setEnabled(v) { this.enabled = !!v; if (v) this.loadAll(this._symbol); else this.clear(); }
  setSymbol(symbol) { this._symbol = symbol; clearHtfCache(symbol); if (this.enabled) this.loadAll(symbol); }
  updateConfig(patch) { this.config = { ...this.config, ...patch }; this.saveConfig(); if (this.enabled) this.loadAll(this._symbol); else this.render(); }
  render() {
    this.clear();
    if (!this.enabled) return;
    const width = this.host.clientWidth, height = this.host.clientHeight;
    this.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const tfColors = { '15m': '#90caf9', '30m': '#64b5f6', '1h': '#42a5f5', '4h': '#1e88e5', '1d': '#1565c0', '1w': '#0d47a1' };
    for (const [tf, bars] of this.htfData) {
      if (!bars || !bars.length) continue;
      const color = tfColors[tf] || '#42a5f5';
      if (this.config.showSwings) {
        const swings = findSwings(bars, 3, 3);
        const labeled = classifyStructure(swings, 0);
        for (const s of labeled) {
          const x = this.chart.timeScale().timeToCoordinate(s.time);
          const y = this.series.priceToCoordinate(s.price);
          if (x == null || y == null) continue;
          const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          circle.setAttribute('cx', String(x));
          circle.setAttribute('cy', String(y));
          circle.setAttribute('r', '4');
          circle.setAttribute('fill', color);
          circle.setAttribute('stroke', '#fff');
          circle.setAttribute('stroke-width', '1');
          this.svg.append(circle);
          const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          text.setAttribute('x', String(x + 6));
          text.setAttribute('y', String(y - 6));
          text.setAttribute('fill', color);
          text.setAttribute('font-size', '9');
          text.textContent = tf.toUpperCase() + ' ' + s.label;
          this.svg.append(text);
        }
      }
      if (this.config.showFvg) {
        const regions = computeFvg(bars, { displacement: true, dispMin: 0.6 });
        for (const r of regions) {
          const x1 = this.chart.timeScale().timeToCoordinate(r.start);
          const x2 = this.chart.timeScale().timeToCoordinate(this.config.extend ? bars[bars.length - 1].time : r.end);
          const yTop = this.series.priceToCoordinate(r.upper);
          const yBot = this.series.priceToCoordinate(r.lower);
          if (x1 == null || x2 == null || yTop == null || yBot == null) continue;
          const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          const fill = r.dir === 'bull' ? 'rgba(38,166,154,0.12)' : 'rgba(239,83,80,0.12)';
          rect.setAttribute('x', String(Math.min(x1, x2)));
          rect.setAttribute('y', String(Math.min(yTop, yBot)));
          rect.setAttribute('width', String(Math.abs(x2 - x1)));
          rect.setAttribute('height', String(Math.abs(yBot - yTop)));
          rect.setAttribute('fill', fill);
          rect.setAttribute('stroke', r.dir === 'bull' ? '#26a69a' : '#ef5350');
          rect.setAttribute('stroke-width', '1');
          rect.setAttribute('stroke-dasharray', '3 2');
          this.svg.append(rect);
          const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          text.setAttribute('x', String(Math.min(x1, x2) + 4));
          text.setAttribute('y', String(Math.min(yTop, yBot) + 11));
          text.setAttribute('fill', r.dir === 'bull' ? '#26a69a' : '#ef5350');
          text.setAttribute('font-size', '9');
          text.textContent = tf.toUpperCase() + ' ' + (r.type === 'ifvg' ? 'IFVG' : 'FVG');
          this.svg.append(text);
        }
      }
    }
  }
}
