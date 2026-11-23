import { TOOLS, clone, emptyDocument, makeDrawing, validDrawing, DrawingHistory, timeToLogical, logicalToTime, logicalToPixel, pixelToLogical } from './alfa-drawings-model.mjs?v=4';
import { renderDrawing } from './alfa-drawings-render.mjs?v=4';
import { DrawingStore } from './alfa-drawings-store.mjs?v=3';
const $ = id => document.getElementById(id);
const onePoint = type => ['horizontal', 'vertical', 'text', 'label'].includes(type);
const isPosition = d => ['long', 'short'].includes(d.type);
export class DrawingEngine {
  constructor({ chart, series, host, getBars, getInterval }) {
    Object.assign(this, { chart, series, host, getBars, getInterval });
    this.market = 'BTCUSDT'; this.tool = 'cursor'; this.selected = null; this.history = new DrawingHistory();
    this.magnet = false; this.drawingsVisible = true;
    this.context = null; this.epoch = 0; this.ready = false; this.histories = new Map();
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.classList.add('drawing-overlay'); this.svg.setAttribute('aria-label', 'Fiyat ve zaman koordinatlı çizimler');
    host.append(this.svg);
    this.toolbar = $('drawing-tools'); this.manager = $('drawing-manager'); this.status = $('drawing-status');
    this.buildUI();
    this.store = new DrawingStore(() => this.openMarket(this.market, true), (ctx, text) => {
      if (!ctx || (ctx.symbol === this.market && ctx.owner === (this.store.user?.id || 'guest'))) this.status.textContent = text;
    });
    this.store.start();
    this.abort = new AbortController();
    const options = { signal: this.abort.signal, capture: true };
    host.addEventListener('pointerdown', e => this.down(e), options);
    host.addEventListener('pointermove', e => this.move(e), options);
    host.addEventListener('pointerup', e => this.up(e), options);
    host.addEventListener('pointercancel', () => this.cancel(), options);
    // Suppress only chart dragging initiated on a drawing, not wheel zoom/pan.
    host.addEventListener('mousedown', e => {
      if (this.drag || (this.tool !== 'cursor' && this.inPlot(e))) { e.preventDefault(); e.stopImmediatePropagation(); }
    }, options);
    host.addEventListener('touchstart', e => {
      if (this.drag || this.tool !== 'cursor') { e.preventDefault(); e.stopImmediatePropagation(); }
    }, { ...options, passive: false });
    this.svg.addEventListener('wheel', e => {
      const canvas = this.host.querySelector('canvas');
      if (!canvas) return;
      e.preventDefault(); e.stopPropagation();
      canvas.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: e.clientX, clientY: e.clientY,
        deltaX: e.deltaX, deltaY: e.deltaY, deltaMode: e.deltaMode, ctrlKey: e.ctrlKey }));
    }, { signal: this.abort.signal, passive: false });
    host.addEventListener('dblclick', e => {
      if (e.target.closest?.('[data-id]')) { e.stopImmediatePropagation(); this.manager.hidden = false; this.updatePanel(); }
    }, options);
    document.addEventListener('keydown', e => this.keydown(e), { signal: this.abort.signal });
    this.observer = new ResizeObserver(() => this.render());
    this.observer.observe(host);
    this.tick = () => {
      const ts = chart.timeScale(), bars = getBars();
      const signature = [ts.logicalToCoordinate(0), ts.logicalToCoordinate(1), series.priceToCoordinate(1),
        series.priceToCoordinate(100), ts.width(), ts.height(), bars.length, bars.at(-1)?.time].join(':');
      if (signature !== this.signature) { this.signature = signature; this.render(); }
      this.frame = requestAnimationFrame(this.tick);
    };
    this.tick();
  }
  step() { return { '1m': 60, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '4h': 14400, '1d': 86400, '1w': 604800 }[this.getInterval()]; }
  project(point) {
    const logical = timeToLogical(point.time, this.getBars(), this.step());
    if (logical == null) return null;
    const x = logicalToPixel(logical, i => this.chart.timeScale().logicalToCoordinate(i)), y = this.series.priceToCoordinate(point.price);
    return x == null || y == null ? null : { x, y };
  }
  dimensions() { return { width: this.chart.timeScale().width(), height: this.host.clientHeight - this.chart.timeScale().height() }; }
  inPlot(e) {
    const r = this.host.getBoundingClientRect(), { width, height } = this.dimensions();
    return e.clientX >= r.left && e.clientX <= r.left + width && e.clientY >= r.top && e.clientY <= r.top + height;
  }
  setMagnet(on) { this.magnet = !!on; }
  setDrawingsVisible(on) {
    this.drawingsVisible = !!on;
    this.svg.style.display = on ? '' : 'none';
    try { localStorage.setItem('alfa-drawings-visible:v1', on ? '1' : '0'); } catch {}
  }
  snapPoint(point) {
    if (!this.magnet || !point) return point;
    const bars = this.getBars();
    if (!bars.length) return point;
    let best = null, bestDt = Infinity;
    for (const b of bars) {
      const dt = Math.abs(b.time - point.time);
      if (dt < bestDt) { bestDt = dt; best = b; }
    }
    if (!best) return point;
    const ohlc = [best.open, best.high, best.low, best.close];
    let price = point.price, bestDp = Infinity;
    for (const v of ohlc) { const dp = Math.abs(v - point.price); if (dp < bestDp) { bestDp = dp; price = v; } }
    return { time: best.time, price };
  }
  unproject(e, clamp = false) {
    if (!this.getBars().length || (!clamp && !this.inPlot(e))) return null;
    const r = this.host.getBoundingClientRect();
    const logical = pixelToLogical(e.clientX - r.left, i => this.chart.timeScale().logicalToCoordinate(i));
    const price = this.series.coordinateToPrice(e.clientY - r.top);
    if (logical == null || price == null || price <= 0) return null;
    const time = logicalToTime(logical, this.getBars(), this.step());
    return time > 0 ? this.snapPoint({ time, price }) : null;
  }
  async openMarket(symbol, force = false) {
    if (this.disposed) return;
    this.cancel();
    if (symbol === this.market && !force) { this.render(); return; }
    if (this.context && this.ready) this.histories.set(this.context.owner + ':' + this.context.symbol, this.history);
    this.market = symbol; const epoch = ++this.epoch;
    this.status.textContent = 'Çizimler yükleniyor…';
    this.ready = false; this.context = null; this.selected = null;
    this.history = new DrawingHistory(emptyDocument()); this.refresh();
    const ctx = await this.store.load(symbol);
    if (epoch !== this.epoch) return;
    this.context = ctx; this.history = this.histories.get(ctx.owner + ':' + symbol) || new DrawingHistory(ctx.doc);
    this.ready = true; this.refresh();
  }
  buildUI() {
    for (const [tool, [icon, label]] of Object.entries(TOOLS)) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = icon;
      b.title = label; b.setAttribute('aria-label', label); b.dataset.tool = tool;
      b.addEventListener('click', () => this.setTool(tool)); this.toolbar.append(b);
    }
    $('drawing-undo').onclick = () => { this.cancel(); if (this.ready && this.history.undo()) this.changed(); };
    $('drawing-redo').onclick = () => { this.cancel(); if (this.ready && this.history.redo()) this.changed(); };
    $('drawing-manage').onclick = () => { this.manager.hidden = !this.manager.hidden; this.updatePanel(); };
    $('drawing-close').onclick = () => { this.manager.hidden = true; };
    $('drawing-settings').addEventListener('submit', e => { e.preventDefault(); this.applySettings(); });
    for (const action of ['hide', 'lock', 'copy', 'remove']) $('drawing-' + action).onclick = () => this.action(action);
    $('fib-template-save').onclick = () => this.saveTemplate();
    $('fib-template-load').onclick = () => this.loadTemplate();
    $('drawing-cloud-retry').onclick = () => this.store.retry(this.context);
    $('drawing-export').onclick = () => {
      const blob = new Blob([JSON.stringify({ symbol: this.market, ...this.history.doc }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = `alfa-drawings-${this.market}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    this.refresh();
  }
  setTool(tool) {
    if (!this.ready) return;
    this.cancel(); this.tool = tool;
    this.host.dataset.drawingTool = tool;
    this.toolbar.querySelectorAll('[data-tool]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === tool)));
    $('drawing-help').textContent = tool === 'cursor' ? 'Çizimi seçin/sürükleyin · çift tık: ayarlar'
      : tool === 'delete' ? 'Silmek için kilitli olmayan bir çizime tıklayın · Escape: iptal'
      : `${TOOLS[tool][1]} · ${onePoint(tool) ? 'bir' : 'iki'} nokta seçin · Escape: iptal`;
    this.render();
  }
  cancel() {
    this.draft = null; this.drag = null; this.pending = null; this.tool = 'cursor';
    this.host.dataset.drawingTool = 'cursor';
    this.toolbar?.querySelectorAll('[data-tool]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === 'cursor')));
    if ($('drawing-help')) $('drawing-help').textContent = 'Çizimi seçin/sürükleyin · çift tık: ayarlar';
    this.render();
  }
  current() { return this.history.doc.drawings.find(d => d.id === this.selected); }
  down(e) {
    if (!this.ready || e.button !== 0 || !this.inPlot(e)) return;
    const point = this.unproject(e); if (!point) return;
    const hit = e.target.closest?.('[data-id]'), id = hit?.getAttribute('data-id');
    if (this.tool === 'cursor' && !id) { this.selected = null; this.refresh(); return; }
    e.preventDefault(); e.stopImmediatePropagation(); this.host.focus({ preventScroll: true });
    if (this.tool === 'delete') {
      if (id) { this.selected = id; this.action('remove'); this.setTool('cursor'); }
      return;
    }
    if (this.tool !== 'cursor') {
      if (!this.draft) {
        this.draft = makeDrawing(this.tool, onePoint(this.tool) ? [point] : [point, point]);
        if (onePoint(this.tool)) this.finish();
      } else {
        const type = this.draft.type, id = this.draft.id, a = this.draft.points[0];
        this.draft = makeDrawing(type, [a, point]); this.draft.id = id; this.finish();
      }
      this.render(); return;
    }
    this.selected = id; const d = this.current(); this.refresh();
    if (!d || d.locked) return;
    this.drag = { id, start: point, original: clone(d), handle: e.target.getAttribute('data-handle'), pointer: e.pointerId };
    this.pending = clone(this.history.doc); this.host.setPointerCapture(e.pointerId);
  }
  move(e) {
    const point = this.unproject(e, !!this.drag); if (!point) return;
    if (this.draft && !onePoint(this.draft.type)) {
      const id = this.draft.id;
      this.draft = makeDrawing(this.draft.type, [this.draft.points[0], point]); this.draft.id = id;
      this.render();
    }
    if (!this.drag) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const { original, start, handle } = this.drag, d = clone(original);
    if (!handle) {
      const dt = point.time - start.time, dp = point.price - start.price;
      d.points = d.points.map(p => ({ time: p.time + dt, price: p.price + dp }));
      if (isPosition(d)) d.target += dp;
    } else if (handle === 'target') d.target = point.price;
    else if (handle === 'entry') d.points[0].price = point.price;
    else if (handle === 'stop') d.points[1].price = point.price;
    else {
      const i = Number(handle.slice(1));
      d.points[i] = point;
    }
    if (validDrawing(d)) {
      this.pending.drawings = this.pending.drawings.map(item => item.id === d.id ? d : item);
      this.render();
      if (isPosition(d)) this.showLiveStats(d);
    }
  }
  up(e) {
    if (!this.drag) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (this.host.hasPointerCapture(e.pointerId)) this.host.releasePointerCapture(e.pointerId);
    const next = this.pending; this.drag = null; this.pending = null;
    if (next) this.commit(next);
  }
  finish() {
    const d = this.draft; if (!d || !validDrawing(d)) return;
    if (!onePoint(d.type) && Math.abs(d.points[0].time - d.points[1].time) < .001 &&
      Math.abs(d.points[0].price - d.points[1].price) < .000001) return;
    const next = clone(this.history.doc); next.drawings.push(d);
    this.selected = d.id; this.cancel(); this.commit(next);
    if (d.type === 'text' || d.type === 'label') { this.manager.hidden = false; this.updatePanel(); $('drawing-text').focus(); }
  }
  commit(next) {
    try { if (this.history.commit(next)) this.changed(); }
    catch { this.status.textContent = 'Çizim kaydedilemedi · geçersiz değer veya çizim sınırı (300)'; this.refresh(); }
  }
  changed() {
    if (!this.history.doc.drawings.some(d => d.id === this.selected)) this.selected = null;
    if (this.context) this.store.save(this.context, this.history.doc);
    this.refresh();
  }
  action(action) {
    if (!this.ready) return;
    this.cancel();
    const next = clone(this.history.doc), d = next.drawings.find(x => x.id === this.selected); if (!d) return;
    if (action === 'lock') d.locked = !d.locked;
    if (action === 'hide') d.hidden = !d.hidden;
    if (action === 'remove' && !d.locked) next.drawings = next.drawings.filter(x => x.id !== d.id);
    if (action === 'copy') {
      const copy = clone(d); copy.id = crypto.randomUUID(); copy.locked = false; copy.hidden = false;
      copy.points.forEach(p => { p.time += this.step() * 3; });
      next.drawings.push(copy); this.selected = copy.id;
    }
    this.commit(next);
  }
  keydown(e) {
    if (e.key === 'Escape') { this.cancel(); e.preventDefault(); return; }
    if (e.target.closest?.('input,textarea,select,[contenteditable=true]')) return;
    if ((e.ctrlKey || e.metaKey) && ['z', 'y'].includes(e.key.toLowerCase())) {
      e.preventDefault(); this.cancel();
      if (this.ready && ((e.shiftKey || e.key.toLowerCase() === 'y') ? this.history.redo() : this.history.undo())) this.changed();
    } else if (e.key === 'Delete' || e.key === 'Backspace') { if (this.selected) { e.preventDefault(); this.action('remove'); } }
  }
  render() {
    if (!this.svg) return;
    const { width, height } = this.dimensions();
    this.svg.setAttribute('width', Math.max(0, width)); this.svg.setAttribute('height', Math.max(0, height));
    const fragment = document.createDocumentFragment();
    for (const d of (this.pending || this.history.doc).drawings) {
      if (d.hidden) continue;
      const g = renderDrawing(d, p => this.project(p), width, height, d.id === this.selected);
      if (g) fragment.append(g);
    }
    if (this.draft) {
      const g = renderDrawing(this.draft, p => this.project(p), width, height, false, true);
      if (g) fragment.append(g);
    }
    this.svg.replaceChildren(fragment);
  }
  refresh() {
    this.toolbar.querySelectorAll('button').forEach(b => { b.disabled = !this.ready; });
    $('drawing-undo').disabled = !this.ready || !this.history.past.length;
    $('drawing-redo').disabled = !this.ready || !this.history.future.length;
    $('drawing-cloud-retry').disabled = !this.ready || !this.context?.remote;
    this.render(); this.updatePanel();
  }
  updatePanel() {
    const list = $('drawing-objects'); list.replaceChildren();
    for (const d of this.history.doc.drawings) {
      const row = document.createElement('div'); row.className = 'drawing-object';
      const b = document.createElement('button'); b.type = 'button';
      b.textContent = `${TOOLS[d.type][1]}${d.hidden ? ' · gizli' : ''}${d.locked ? ' · kilitli' : ''}`;
      b.setAttribute('aria-pressed', String(d.id === this.selected));
      b.onclick = () => { this.cancel(); this.selected = d.id; this.refresh(); }; row.append(b); list.append(row);
    }
    $('drawing-empty').hidden = !!this.history.doc.drawings.length;
    const d = this.current(), form = $('drawing-settings');
    form.hidden = !d;
    $('drawing-selected-name').textContent = d ? TOOLS[d.type][1] : '';
    if (!d) return;
    $('drawing-color').value = d.color; $('drawing-width').value = d.width;
    $('drawing-text-row').hidden = !['text', 'label'].includes(d.type); $('drawing-font-row').hidden = !['text', 'label'].includes(d.type);
    $('drawing-text').value = d.text || ''; $('drawing-font-size').value = d.fontSize || 14;
    $('drawing-fib-fields').hidden = d.type !== 'fibonacci';
    $('drawing-position-fields').hidden = !isPosition(d);
    if (d.type === 'fibonacci') {
      $('fib-levels').value = d.levels.join(', '); $('fib-reverse').checked = d.reversed; $('fib-prices').checked = d.showPrices;
      $('fib-templates').replaceChildren();
      this.history.doc.templates.forEach((t, i) => {
        const option = document.createElement('option'); option.value = i; option.textContent = t.name; $('fib-templates').append(option);
      });
      $('fib-template-load').disabled = d.locked || !this.history.doc.templates.length;
    }
    if (isPosition(d)) {
      $('position-entry').value = d.points[0].price; $('position-stop').value = d.points[1].price; $('position-target').value = d.target;
      this.showLiveStats(d);
    }
    form.querySelectorAll('[data-edit]').forEach(el => { el.disabled = d.locked; });
    $('drawing-lock').textContent = d.locked ? 'Kilidi aç' : 'Kilitle';
    $('drawing-hide').textContent = d.hidden ? 'Göster' : 'Gizle';
    $('drawing-remove').disabled = d.locked;
  }
  showLiveStats(d) {
    const entry = d.points[0].price, risk = Math.abs(entry - d.points[1].price), gain = Math.abs(d.target - entry);
    $('position-stats').textContent = `RR 1:${(gain / risk).toFixed(4)} · Risk %${(risk / entry * 100).toFixed(4)} · Kazanç %${(gain / entry * 100).toFixed(4)}`;
  }
  applySettings() {
    const next = clone(this.history.doc), d = next.drawings.find(x => x.id === this.selected); if (!d || d.locked) return;
    d.color = $('drawing-color').value; d.width = Number($('drawing-width').value);
    if (d.type === 'text' || d.type === 'label') {
      d.text = $('drawing-text').value.trim() || (d.type === 'label' ? 'Etiket' : 'Metin'); d.fontSize = Number($('drawing-font-size').value);
    }
    if (d.type === 'fibonacci') {
      const tokens = $('fib-levels').value.split(',').map(s => s.trim());
      if (tokens.some(s => !s)) { this.status.textContent = 'Seviyeleri noktalı ondalık ve virgül ile ayırın'; return; }
      d.levels = [...new Set(tokens.map(Number))]; d.reversed = $('fib-reverse').checked; d.showPrices = $('fib-prices').checked;
    }
    if (isPosition(d)) {
      d.points[0].price = Number($('position-entry').value); d.points[1].price = Number($('position-stop').value); d.target = Number($('position-target').value);
    }
    this.commit(next);
  }
  saveTemplate() {
    const d = this.current(); if (d?.type !== 'fibonacci' || d.locked) return;
    const name = $('fib-template-name').value.trim();
    if (!name) { this.status.textContent = 'Şablon adı girin'; return; }
    const style = Object.fromEntries(['color', 'width', 'levels', 'reversed', 'showPrices'].map(key => [key, clone(d[key])]));
    const next = clone(this.history.doc), existing = next.templates.find(t => t.name === name);
    if (existing) existing.style = style; else next.templates.push({ name, style });
    this.commit(next);
  }
  loadTemplate() {
    const next = clone(this.history.doc), d = next.drawings.find(x => x.id === this.selected);
    const template = next.templates[Number($('fib-templates').value)];
    if (d?.type === 'fibonacci' && !d.locked && template) { Object.assign(d, clone(template.style)); this.commit(next); }
  }
  dispose() {
    this.disposed = true;
    ++this.epoch; this.abort.abort(); cancelAnimationFrame(this.frame);
    this.observer.disconnect(); this.store.dispose(); this.svg.remove();
  }
}
