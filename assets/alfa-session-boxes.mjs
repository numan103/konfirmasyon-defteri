import { computeSessionBoxes, SESSION_BOX_DEFS } from './alfa-session-boxes-model.mjs?v=1';
import { timeToLogical, logicalToPixel } from './alfa-drawings-model.mjs?v=5';

const NS = 'http://www.w3.org/2000/svg';
const CONFIG_KEY = 'alfa-sb:v1';

// TradingView-style session range boxes (Asia / London / New York),
// toggleable per session from the left toolbar.
export class SessionBoxesManager {
  constructor({ chart, series, host, getBars, getInterval, onChange }) {
    Object.assign(this, { chart, series, host, getBars, getInterval, onChange });
    this.config = this.loadConfig();
    this.svg = document.createElementNS(NS, 'svg');
    this.svg.classList.add('session-boxes-overlay');
    this.svg.setAttribute('aria-hidden', 'true');
    host.append(this.svg);
    this.buildUI();
    this.abort = new AbortController();
    this.observer = new ResizeObserver(() => this.render());
    this.observer.observe(host);
    this.tick = () => {
      const ts = chart.timeScale(), bars = getBars();
      const signature = [ts.logicalToCoordinate(0), ts.logicalToCoordinate(1), series.priceToCoordinate(1),
        series.priceToCoordinate(100), ts.width(), ts.height(), bars.length, bars.at(-1)?.time,
        JSON.stringify(this.config)].join(':');
      if (signature !== this.signature) { this.signature = signature; this.render(); }
      this.frame = requestAnimationFrame(this.tick);
    };
    this.tick();
  }
  defaultConfig() { return { enabled: { asia: true, london: true, ny: true }, days: 5 }; }
  loadConfig() {
    try {
      const raw = JSON.parse(localStorage.getItem(CONFIG_KEY) || 'null');
      if (raw && typeof raw === 'object') return { ...this.defaultConfig(), ...raw, enabled: { ...this.defaultConfig().enabled, ...(raw.enabled || {}) } };
    } catch {}
    return this.defaultConfig();
  }
  saveConfig() {
    try { localStorage.setItem(CONFIG_KEY, JSON.stringify(this.config)); } catch {}
    this.onChange?.();
  }
  step() {
    const m = /^(\d+)([mhdw])$/.exec(this.getInterval() || '');
    return m ? Number(m[1]) * { m: 60, h: 3600, d: 86400, w: 604800 }[m[2]] : 3600;
  }
  buildUI() {
    const wrap = document.getElementById('session-boxes-tools');
    if (!wrap) return;
    wrap.replaceChildren();
    for (const def of SESSION_BOX_DEFS) {
      const b = document.createElement('button'); b.type = 'button';
      b.textContent = def.icon; b.dataset.session = def.id;
      b.title = `${def.name} seans kutuları · tıkla: ekle/kaldır`;
      b.setAttribute('aria-label', `${def.name} seans kutuları`);
      b.setAttribute('aria-pressed', String(this.config.enabled[def.id] !== false));
      b.style.color = this.config.enabled[def.id] !== false ? def.color : '';
      b.addEventListener('click', () => this.toggle(def.id));
      wrap.append(b);
    }
  }
  toggle(id) {
    this.config.enabled[id] = this.config.enabled[id] === false;
    this.saveConfig(); this.buildUI(); this.render();
  }
  render() {
    if (!this.svg) return;
    const bars = this.getBars();
    const width = this.chart.timeScale().width();
    const height = this.host.clientHeight - this.chart.timeScale().height();
    this.svg.setAttribute('width', Math.max(0, width)); this.svg.setAttribute('height', Math.max(0, height));
    const fragment = document.createDocumentFragment();
    if (bars.length && Object.values(this.config.enabled).some(Boolean)) {
      const step = this.step();
      const xOf = ts => {
        const logical = timeToLogical(ts, bars, step);
        return logical == null ? null : logicalToPixel(logical, i => this.chart.timeScale().logicalToCoordinate(i));
      };
      for (const box of computeSessionBoxes(bars, this.config.enabled, this.config.days)) {
        const x1 = xOf(box.startTs), x2 = xOf(box.endTs);
        const yHigh = this.series.priceToCoordinate(box.high), yLow = this.series.priceToCoordinate(box.low);
        if (x1 == null || x2 == null || yHigh == null || yLow == null) continue;
        const left = Math.max(0, Math.min(x1, x2)), right = Math.min(width, Math.max(x1, x2));
        if (right - left < 1) continue;
        const top = Math.min(yHigh, yLow), h = Math.max(1, Math.abs(yLow - yHigh));
        const rect = document.createElementNS(NS, 'rect');
        for (const [k, v] of Object.entries({ x: left, y: top, width: right - left, height: h,
          fill: box.color, 'fill-opacity': .09, stroke: box.color, 'stroke-opacity': .45, 'stroke-width': 1 })) rect.setAttribute(k, String(v));
        fragment.append(rect);
        const text = document.createElementNS(NS, 'text');
        for (const [k, v] of Object.entries({ x: left + 4, y: Math.max(12, top + 12), fill: box.color,
          'font-size': 10, 'paint-order': 'stroke', stroke: '#10141c', 'stroke-width': 3 })) text.setAttribute(k, String(v));
        text.textContent = box.name;
        fragment.append(text);
      }
    }
    this.svg.replaceChildren(fragment);
  }
  dispose() {
    this.abort?.abort(); cancelAnimationFrame(this.frame);
    this.observer.disconnect(); this.svg.remove();
  }
}
