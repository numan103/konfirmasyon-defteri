import { computeMarketStructure } from './alfa-market-structure-model.mjs?v=1';
import { createSeriesMarkers } from './vendor/lightweight-charts-5.0.9/lightweight-charts.standalone.production.mjs';

export class MarketStructureManager {
  constructor({ series, getBars }) {
    this.series = series;
    this.getBars = getBars;
    this.config = this.loadConfig();
    this.enabled = false;
    this.markers = [];
    this.priceLines = [];
  }
  loadConfig() {
    try { return JSON.parse(localStorage.getItem('alfa-ms:v1') || 'null') || this.defaultConfig(); }
    catch { return this.defaultConfig(); }
  }
  defaultConfig() {
    return { left: 3, right: 3, mode: 'close', displacement: true, dispMin: 0.6,
      equalTol: 0, showSwings: false, showHHHL: false, showBOS: true, showCHoCH: true,
      showProtected: true, maxProtected: 2, showEqual: false, internal: false };
  }
  saveConfig() { try { localStorage.setItem('alfa-ms:v1', JSON.stringify(this.config)); } catch {} }
  clear() {
    this.markerApi?.setMarkers([]);
    for (const pl of this.priceLines) { try { this.series.removePriceLine(pl); } catch {} }
    this.priceLines = [];
  }
  render() {
    this.clear();
    if (!this.enabled) return;
    const bars = this.getBars();
    const ms = computeMarketStructure(bars, {
      left: this.config.left, right: this.config.right, mode: this.config.mode,
      displacement: this.config.displacement, dispMin: this.config.dispMin, equalTol: this.config.equalTol,
    });
    const markers = [];
    if (this.config.showSwings || this.config.showHHHL) {
      for (const s of ms.swings) {
        if (s.type === 'high' && !this.config.showSwings && !this.config.showHHHL) continue;
        const label = this.config.showHHHL ? s.label : (s.type === 'high' ? 'H' : 'L');
        if (!this.config.showSwings && !this.config.showHHHL) continue;
        markers.push({ time: s.time, position: s.type === 'high' ? 'aboveBar' : 'belowBar',
          color: s.type === 'high' ? '#ef5350' : '#26a69a', shape: 'circle', text: label, size: 1 });
      }
    }
    if (this.config.showBOS) {
      for (const b of ms.bos) {
        markers.push({ time: b.time, position: b.dir === 'up' ? 'belowBar' : 'aboveBar',
          color: '#2196f3', shape: 'arrowUp', text: 'BOS', size: 1 });
      }
    }
    if (this.config.showCHoCH) {
      for (const c of ms.choch) {
        markers.push({ time: c.time, position: c.dir === 'up' ? 'belowBar' : 'aboveBar',
          color: '#ff9800', shape: 'arrowUp', text: 'CHoCH', size: 1 });
      }
    }
    if (markers.length) {
      markers.sort((a, b) => a.time - b.time);
      if (!this.markerApi) this.markerApi = createSeriesMarkers(this.series, []);
      this.markerApi.setMarkers(markers.slice(-80));
    }
    if (this.config.showProtected) {
      const latest = ms.protected.filter(p => p.brokenAt == null).reverse();
      const protectedLevels = [];
      const max = Math.max(2, Math.min(20, this.config.maxProtected || 2));
      // With the default limit keep the most recent high AND low, not two highs.
      for (const type of ['high', 'low']) {
        const level = latest.find(p => p.type === type); if (level) protectedLevels.push(level);
      }
      for (const level of latest) {
        if (protectedLevels.length >= max) break;
        if (!protectedLevels.includes(level)) protectedLevels.push(level);
      }
      for (const pl of protectedLevels) {
        const pline = this.series.createPriceLine({ price: pl.price, color: pl.type === 'high' ? '#ef667788' : '#26c89c88', axisLabelVisible: this.axisLabels === true, lineWidth: 1, lineStyle: 2, title: pl.type === 'high' ? 'Protected High' : 'Protected Low' });
        this.priceLines.push(pline);
      }
    }
  }
  setEnabled(v) { this.enabled = !!v; this.render(); }
  updateConfig(patch) { this.config = { ...this.config, ...patch }; this.saveConfig(); this.render(); }
}
