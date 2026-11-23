import { computeFvg } from './alfa-fvg-model.mjs?v=1';

// Presentation filter: don't extend invalidated/filled historical zones forever.
export function visibleFvgRegions(regions, bars, config) {
  return regions.filter(r => {
    if (r.type === 'ifvg' && !config.showIfvg) return false;
    if (r.dir === 'bull' && !config.showBull || r.dir === 'bear' && !config.showBear) return false;
    if (config.showMitigated) return true;
    if (r.type === 'fvg') return ['unmitigated', 'partial'].includes(r.mitigation);
    return !bars.some(b => b.time > r.invertedAt && (r.dir === 'bull' ? b.close < r.lower : b.close > r.upper));
  }).sort((a, b) => (a.invertedAt || a.confirmedAt) - (b.invertedAt || b.confirmedAt))
    .slice(-Math.max(1, Math.min(100, config.maxRegions || 8)));
}
export class FvgManager {
  constructor({ chart, series, host, getBars }) {
    this.chart = chart;
    this.series = series;
    this.host = host;
    this.getBars = getBars;
    this.config = this.loadConfig();
    this.enabled = false;
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.style.position = 'absolute';
    this.svg.style.inset = '0';
    this.svg.style.width = '100%';
    this.svg.style.height = '100%';
    this.svg.style.pointerEvents = 'none';
    this.svg.style.zIndex = '2';
    this.host.append(this.svg);
    this.boundRender = () => this.render();
    this.chart.timeScale().subscribeVisibleTimeRangeChange(this.boundRender);
    this.chart.timeScale().subscribeVisibleLogicalRangeChange(this.boundRender);
    const ro = new ResizeObserver(() => this.render());
    ro.observe(host);
    this.ro = ro;
  }
  loadConfig() {
    try { return JSON.parse(localStorage.getItem('alfa-fvg:v1') || 'null') || this.defaultConfig(); }
    catch { return this.defaultConfig(); }
  }
  defaultConfig() {
    return { minGap: 0, atrFilter: 0, displacement: true, dispMin: 0.6, mitigation: 'wick',
      maxRegions: 8, showBull: true, showBear: true, showIfvg: true, showMitigated: false, extend: true, opacity: 0.08 };
  }
  saveConfig() { try { localStorage.setItem('alfa-fvg:v1', JSON.stringify(this.config)); } catch {} }
  clear() { while (this.svg.firstChild) this.svg.removeChild(this.svg.firstChild); }
  setEnabled(v) { this.enabled = !!v; this.render(); }
  updateConfig(patch) { this.config = { ...this.config, ...patch }; this.saveConfig(); this.render(); }
  render() {
    this.clear();
    if (!this.enabled) return;
    const bars = this.getBars();
    if (!bars || !bars.length) return;
    // ATR simple
    const atr = bars.map((_, i) => {
      if (i === 0) return bars[i].high - bars[i].low;
      const pc = bars[i - 1].close;
      return Math.max(bars[i].high - bars[i].low, Math.abs(bars[i].high - pc), Math.abs(bars[i].low - pc));
    });
    const all = computeFvg(bars, { ...this.config, atr, maxRegions: bars.length * 2 });
    const regions = visibleFvgRegions(all, bars, { ...this.defaultConfig(), ...this.config });
    const width = this.chart.timeScale().width();
    const height = this.series.getPane().getHeight();
    this.svg.style.width = width + 'px'; this.svg.style.height = height + 'px';
    this.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    for (const r of regions) {
      if (r.type === 'ifvg' && !this.config.showIfvg) continue;
      if (r.type === 'fvg' && r.dir === 'bull' && !this.config.showBull) continue;
      if (r.type === 'fvg' && r.dir === 'bear' && !this.config.showBear) continue;
      const x1 = this.chart.timeScale().timeToCoordinate(r.type === 'ifvg' ? r.invertedAt : r.start);
      const inactive = r.type === 'fvg' && ['full', 'invalidated'].includes(r.mitigation);
      const x2 = this.config.extend && !inactive ? width :
        this.chart.timeScale().timeToCoordinate(r.invalidatedAt || r.firstTouchAt || r.end);
      if (x1 == null || x2 == null) continue;
      const left = Math.max(0, Math.min(x1, x2)), right = Math.min(width, Math.max(x1, x2));
      if (right <= left) continue;
      const yTop = this.series.priceToCoordinate(r.upper);
      const yBot = this.series.priceToCoordinate(r.lower);
      if (yTop == null || yBot == null) continue;
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      const isIfvg = r.type === 'ifvg';
      const fill = r.dir === 'bull'
        ? (isIfvg ? 'rgba(38,166,154,' + this.config.opacity + ')' : 'rgba(38,166,154,' + this.config.opacity + ')')
        : (isIfvg ? 'rgba(239,83,80,' + this.config.opacity + ')' : 'rgba(239,83,80,' + this.config.opacity + ')');
      const stroke = r.dir === 'bull' ? '#26a69a' : '#ef5350';
      rect.setAttribute('x', String(left));
      rect.setAttribute('y', String(Math.min(yTop, yBot)));
      rect.setAttribute('width', String(right - left));
      rect.setAttribute('height', String(Math.abs(yBot - yTop)));
      rect.setAttribute('fill', fill);
      rect.setAttribute('stroke', stroke);
      rect.setAttribute('stroke-opacity', '.4');
      rect.setAttribute('stroke-width', '1');
      rect.setAttribute('stroke-dasharray', isIfvg ? '4 3' : 'none');
      this.svg.append(rect);
      // label
      if (right - left < 55 || Math.abs(yBot - yTop) < 13) continue;
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', String(left + 4));
      text.setAttribute('y', String(Math.min(yTop, yBot) + 12));
      text.setAttribute('fill', stroke);
      text.setAttribute('font-size', '10');
      text.textContent = (r.type === 'ifvg' ? 'IFVG' : 'FVG') + (r.mitigation === 'invalidated' ? ' (inv)' : '');
      this.svg.append(text);
    }
  }
}
