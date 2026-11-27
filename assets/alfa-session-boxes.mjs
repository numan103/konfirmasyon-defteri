import { computeSessionBoxes, SESSION_BOX_DEFS, parseHM, sessionBoxWindowTs } from './alfa-session-boxes-model.mjs?v=3';
import { timeToLogical, logicalToPixel } from './alfa-drawings-model.mjs?v=5';
import { chartDialog } from './alfa-chart-ui.mjs?v=1';

const NS = 'http://www.w3.org/2000/svg';
const CONFIG_KEY = 'alfa-sb:v1';
const fmtHM = ts => new Date(ts * 1000).toISOString().slice(11, 16);

// TradingView-style session range boxes (Asia / London / New York),
// toggleable per session from the left toolbar.
export class SessionBoxesManager {
  constructor({ chart, series, host, getBars, getInterval, onChange }) {
    Object.assign(this, { chart, series, host, getBars, getInterval, onChange });
    this.config = this.loadConfig();
    this.enabled = false;
    this.svg = document.createElementNS(NS, 'svg');
    this.svg.classList.add('session-boxes-overlay');
    this.svg.setAttribute('aria-hidden', 'true');
    host.append(this.svg);
    this.buildUI();
    this.abort = new AbortController();
    this.observer = new ResizeObserver(() => this.render());
    this.observer.observe(host);
    this.tick = () => {
      // Transient errors during data/scale swaps must never kill the loop.
      try {
        const ts = chart.timeScale(), bars = getBars();
        const signature = [ts.logicalToCoordinate(0), ts.logicalToCoordinate(1), series.priceToCoordinate(1),
          series.priceToCoordinate(100), ts.width(), this.series.getPane().getHeight(), bars.length, bars.at(-1)?.time, bars.at(-1)?.high, bars.at(-1)?.low, this.enabled,
          JSON.stringify(this.config)].join(':');
        if (signature !== this.signature) { this.render(); this.signature = signature; }
      } catch {}
      this.frame = requestAnimationFrame(this.tick);
    };
    this.tick();
  }
  defaultConfig() { return { enabled: { asia: true, london: true, ny: true }, days: 5, utc: {} }; }
  loadConfig() {
    try {
      const raw = JSON.parse(localStorage.getItem(CONFIG_KEY) || 'null');
      if (raw && typeof raw === 'object') return { ...this.defaultConfig(), ...raw, enabled: { ...this.defaultConfig().enabled, ...(raw.enabled || {}) }, utc: { ...(raw.utc || {}) } };
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
  utcWindow(def) {
    const ov = this.config.utc?.[def.id];
    const s = ov && parseHM(ov.start), e = ov && parseHM(ov.end);
    if (s && e) return { start: ov.start, end: ov.end, pinned: true };
    const win = sessionBoxWindowTs(Math.floor(Date.now() / 1000), def.tz, def.start, def.end);
    return { start: fmtHM(win.startTs), end: fmtHM(win.endTs), pinned: false };
  }
  buildUI() {
    const wrap = document.getElementById('session-boxes-tools');
    if (!wrap) return;
    wrap.replaceChildren();
    for (const def of SESSION_BOX_DEFS) {
      const win = this.utcWindow(def);
      const b = document.createElement('button'); b.type = 'button';
      b.innerHTML = `<span>${def.name}</span><small>${win.start}–${win.end} UTC</small>`; b.dataset.session = def.id;
      b.title = `${def.name} · ${win.start}–${win.end} UTC${win.pinned ? ' (sabit)' : ''} · tıkla: ekle/kaldır`;
      b.setAttribute('aria-label', `${def.name} seans kutuları`);
      b.setAttribute('aria-pressed', String(this.enabled && this.config.enabled[def.id] !== false));
      b.style.color = this.config.enabled[def.id] !== false ? def.color : '';
      b.addEventListener('click', () => this.toggle(def.id));
      wrap.append(b);
    }
    const gear = document.getElementById('session-boxes-settings');
    if (gear) gear.onclick = () => this.onSettings ? this.onSettings() : this.openSettings();
  }
  openSettings() {
    const { box, close } = chartDialog('');
    const rows = SESSION_BOX_DEFS.map(def => {
      const win = this.utcWindow(def);
      return `<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #242f42;flex-wrap:wrap;">
        <span style="min-width:90px;font-weight:600;color:${def.color}">${def.name}</span>
        <label style="display:flex;align-items:center;gap:4px;">Başlangıç <input type="time" data-sb-start="${def.id}" value="${win.start}" style="padding:5px;border-radius:6px;border:1px solid #30394b;background:#0b1018;color:#d7e0ee;"></label>
        <label style="display:flex;align-items:center;gap:4px;">Bitiş <input type="time" data-sb-end="${def.id}" value="${win.end}" style="padding:5px;border-radius:6px;border:1px solid #30394b;background:#0b1018;color:#d7e0ee;"></label>
        <small style="color:#8e9eb6">${win.pinned ? 'UTC sabit' : 'borsa saati → UTC'}</small>
      </div>`;
    }).join('');
    box.innerHTML = `<h3 style="margin:0 0 8px;">Seans Saatleri · UTC</h3>
      <div style="color:#8e9eb6;font-size:12px;margin-bottom:10px;">Saatler UTC'ye göre ayarlanır. Değiştirmediğin seanslar borsa yerel saatini izlemeye devam eder (yaz saati dahil). Gece yarısını aşan aralık desteklenir (ör. 22:00–02:00).</div>
      ${rows}
      <label style="display:flex;align-items:center;gap:8px;margin:12px 0;">Gösterilecek gün sayısı <input id="sb-days" type="number" min="1" max="30" value="${this.config.days}" style="width:70px;padding:5px;border-radius:6px;border:1px solid #30394b;background:#0b1018;color:#d7e0ee;"></label>
      <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;">
        <button id="sb-reset" style="padding:8px 12px;border-radius:8px;border:1px solid #30394b;background:#151b26;color:#d7e0ee;">Varsayılana dön</button>
        <button id="sb-close" style="padding:8px 12px;border-radius:8px;border:1px solid #30394b;background:#151b26;color:#d7e0ee;">Kapat</button>
        <button id="sb-apply" style="padding:8px 12px;border-radius:8px;border:1px solid #30394b;background:#2962ff;color:#fff;">Uygula</button>
      </div>`;
    box.querySelector('#sb-close').addEventListener('click', close);
    box.querySelector('#sb-reset').addEventListener('click', () => {
      this.config.utc = {}; this.saveConfig(); this.buildUI(); this.render(); close();
    });
    box.querySelector('#sb-apply').addEventListener('click', () => {
      const utc = { ...this.config.utc };
      for (const def of SESSION_BOX_DEFS) {
        const start = box.querySelector(`[data-sb-start="${def.id}"]`).value;
        const end = box.querySelector(`[data-sb-end="${def.id}"]`).value;
        if (!parseHM(start) || !parseHM(end) || start === end) { box.querySelector('#sb-apply').textContent = 'Geçerli bir saat aralığı girin'; return; }
        const initial = this.utcWindow(def);
        if (initial.pinned || initial.start !== start || initial.end !== end) utc[def.id] = { start, end };
      }
      const days = Number(box.querySelector('#sb-days').value);
      this.config.utc = utc;
      if (Number.isFinite(days)) this.config.days = Math.max(1, Math.min(30, Math.floor(days)));
      this.saveConfig(); this.buildUI(); this.render(); close();
    });
  }
  toggle(id) {
    if (!this.enabled && this.onToggle) { this.config.enabled[id] = true; this.onToggle(id); this.buildUI(); return; }
    this.config.enabled[id] = this.config.enabled[id] === false;
    this.saveConfig(); this.buildUI(); this.render();
  }
  setEnabled(value) { this.enabled = !!value; this.buildUI(); this.render(); }
  render() {
    if (!this.svg) return;
    const bars = this.getBars();
    const width = this.chart.timeScale().width();
    const height = this.series.getPane().getHeight();
    this.svg.setAttribute('width', Math.max(0, width)); this.svg.setAttribute('height', Math.max(0, height));
    const fragment = document.createDocumentFragment();
    if (this.enabled && bars.length && Object.values(this.config.enabled).some(Boolean)) {
      const step = this.step();
      const xOf = ts => {
        const logical = timeToLogical(ts, bars, step);
        return logical == null ? null : logicalToPixel(logical, i => this.chart.timeScale().logicalToCoordinate(i));
      };
      for (const box of computeSessionBoxes(bars, this.config.enabled, this.config.days, this.config.utc)) {
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
        const utcTime = ts => new Date(ts * 1000).toISOString().slice(11, 16);
        const label = `${box.name} ${utcTime(box.startTs)}–${utcTime(box.endTs)} UTC`;
        const phone = matchMedia('(max-width:600px),(max-width:932px) and (max-height:500px) and (orientation:landscape)').matches;
        text.textContent = phone ? box.name : label;
        const title = document.createElementNS(NS, 'title');
        title.textContent = label;
        rect.append(title);
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
