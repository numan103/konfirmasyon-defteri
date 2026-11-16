import { computeMarketStructure } from './alfa-market-structure-model.mjs?v=1';

export class MarketStructureManager {
  constructor({ series, getBars }) {
    this.series = series;
    this.getBars = getBars;
    this.config = this.loadConfig();
    this.enabled = true;
    this.markers = [];
    this.priceLines = [];
  }
  loadConfig() {
    try { return JSON.parse(localStorage.getItem('alfa-ms:v1') || 'null') || this.defaultConfig(); }
    catch { return this.defaultConfig(); }
  }
  defaultConfig() {
    return { left: 3, right: 3, mode: 'close', displacement: true, dispMin: 0.6,
      equalTol: 0, showSwings: true, showHHHL: true, showBOS: true, showCHoCH: true,
      showProtected: true, showEqual: false, internal: false };
  }
  saveConfig() { try { localStorage.setItem('alfa-ms:v1', JSON.stringify(this.config)); } catch {} }
  clear() {
    try { this.series.setMarkers([]); } catch {}
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
      try { this.series.setMarkers(markers); } catch {}
    }
    if (this.config.showProtected) {
      for (const pl of ms.protected) {
        const pline = this.series.createPriceLine({ price: pl.price, color: pl.type === 'high' ? '#ef5350' : '#26a69a', lineWidth: 1, lineStyle: 1, title: pl.type === 'high' ? 'Protected High' : 'Protected Low' });
        this.priceLines.push(pline);
      }
    }
  }
  setEnabled(v) { this.enabled = !!v; this.render(); }
  updateConfig(patch) { this.config = { ...this.config, ...patch }; this.saveConfig(); this.render(); }
}
