import { computeFvg } from './alfa-fvg-model.mjs?v=1';

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
    this.svg.style.zIndex = '5';
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
      maxRegions: 50, showBull: true, showBear: true, showIfvg: true, extend: true, opacity: 0.18 };
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
    const regions = computeFvg(bars, { ...this.config, atr });
    const width = this.host.clientWidth;
    const height = this.host.clientHeight;
    this.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    for (const r of regions) {
      if (r.type === 'ifvg' && !this.config.showIfvg) continue;
      if (r.type === 'fvg' && r.dir === 'bull' && !this.config.showBull) continue;
      if (r.type === 'fvg' && r.dir === 'bear' && !this.config.showBear) continue;
      const x1 = this.chart.timeScale().timeToCoordinate(r.start);
      let x2;
      if (this.config.extend && r.end === r.confirmedAt) {
        x2 = width;
      } else {
        x2 = this.chart.timeScale().timeToCoordinate(this.config.extend ? bars[bars.length - 1].time : r.end);
      }
      if (x1 == null) continue;
      const yTop = this.series.priceToCoordinate(r.upper);
      const yBot = this.series.priceToCoordinate(r.lower);
      if (yTop == null || yBot == null) continue;
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      const isIfvg = r.type === 'ifvg';
      const fill = r.dir === 'bull'
        ? (isIfvg ? 'rgba(38,166,154,' + this.config.opacity + ')' : 'rgba(38,166,154,' + this.config.opacity + ')')
        : (isIfvg ? 'rgba(239,83,80,' + this.config.opacity + ')' : 'rgba(239,83,80,' + this.config.opacity + ')');
      const stroke = r.dir === 'bull' ? '#26a69a' : '#ef5350';
      rect.setAttribute('x', String(Math.min(x1, x2)));
      rect.setAttribute('y', String(Math.min(yTop, yBot)));
      rect.setAttribute('width', String(Math.abs(x2 - x1)));
      rect.setAttribute('height', String(Math.abs(yBot - yTop)));
      rect.setAttribute('fill', fill);
      rect.setAttribute('stroke', stroke);
      rect.setAttribute('stroke-width', '1');
      rect.setAttribute('stroke-dasharray', isIfvg ? '4 3' : 'none');
      this.svg.append(rect);
      // label
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', String(Math.min(x1, x2) + 4));
      text.setAttribute('y', String(Math.min(yTop, yBot) + 12));
      text.setAttribute('fill', stroke);
      text.setAttribute('font-size', '10');
      text.textContent = (r.type === 'ifvg' ? 'IFVG' : 'FVG') + (r.mitigation === 'invalidated' ? ' (inv)' : '');
      this.svg.append(text);
    }
  }
}
