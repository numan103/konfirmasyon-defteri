import { computeSessionLevels } from './alfa-session-levels-model.mjs?v=3';

export class SessionLevelsManager {
  constructor({ series, getBars }) {
    this.series = series;
    this.getBars = getBars;
    this.lines = []; // {id, priceLine}
    this.config = this.loadConfig();
    this.enabled = true;
  }
  loadConfig() {
    try { return JSON.parse(localStorage.getItem('alfa-sl:v1') || 'null') || this.defaultConfig(); }
    catch { return this.defaultConfig(); }
  }
  defaultConfig() {
    return {
      show: { DO: true, WO: true, MO: true, NYMO: true, PDH: true, PDL: true, PWH: true, PWL: true, PMH: true, PML: true,
        asia: true, london: true, ny: true },
      daily: { tz: 'UTC', startHour: 0, startMinute: 0 },
      weekly: { tz: 'UTC', startDay: 1, startHour: 0, startMinute: 0 },
      monthly: { tz: 'UTC', startDay: 1, startHour: 0, startMinute: 0 },
      sessions: [
        { id: 'asia', name: 'Asia', tz: 'Asia/Tokyo', start: { h: 9, m: 0 }, end: { h: 17, m: 0 }, show: true },
        { id: 'london', name: 'London', tz: 'Europe/London', start: { h: 8, m: 0 }, end: { h: 16, m: 30 }, show: true },
        { id: 'ny', name: 'New York', tz: 'America/New_York', start: { h: 8, m: 0 }, end: { h: 17, m: 0 }, show: true },
      ],
    };
  }
  saveConfig() {
    try { localStorage.setItem('alfa-sl:v1', JSON.stringify(this.config)); } catch {}
  }
  clear() {
    for (const l of this.lines) { try { this.series.removePriceLine(l.priceLine); } catch {} }
    this.lines = [];
  }
  render() {
    this.clear();
    if (!this.enabled) return;
    const bars = this.getBars();
    const levels = computeSessionLevels(bars, this.config);
    for (const lv of levels) {
      if (this.config.show?.[lv.id.replace(/_H|_L|_O$/, '')] === false) continue;
      // session toggles checked by id prefix
      const priceLine = this.series.createPriceLine({ price: lv.price, color: this.colorFor(lv), lineWidth: 1, lineStyle: 2, title: lv.label + (lv.approximate ? ' (yaklaşık)' : '') });
      this.lines.push({ id: lv.id, priceLine });
    }
  }
  colorFor(lv) {
    if (lv.kind === 'open') return '#f5a623';
    if (lv.kind === 'session') return '#29b6f6';
    if (lv.kind === 'session-open') return '#66bb6a';
    return '#ab47bc';
  }
  setEnabled(v) { this.enabled = !!v; this.render(); }
  updateConfig(patch) { this.config = { ...this.config, ...patch }; this.saveConfig(); this.render(); }
  toggle(id, v) { this.config.show = this.config.show || {}; this.config.show[id] = v; this.saveConfig(); this.render(); }
}
