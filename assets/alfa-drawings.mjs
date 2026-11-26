import { TOOLS, STYLE_FIELDS, EXTENSION_LEVELS, normalizeStyle, clone, emptyDocument, makeDrawing, validDrawing, positionStats, DrawingHistory, timeToLogical, logicalToTime, logicalToPixel, pixelToLogical, translateSelection } from './alfa-drawings-model.mjs?v=9';
import { renderDrawing } from './alfa-drawings-render.mjs?v=9';
import { DrawingStore } from './alfa-drawings-store.mjs?v=4';
import { icon, chartDialog } from './alfa-chart-ui.mjs?v=2';
import { FloatingToolbar } from './alfa-floating-toolbar.mjs?v=1';
import { ObjectTree } from './alfa-object-tree.mjs?v=1';
const $ = id => document.getElementById(id);
const onePoint = type => ['horizontal', 'vertical', 'text', 'label'].includes(type);
const isPosition = d => ['long', 'short'].includes(d.type);
export const TOOL_GROUPS = [
  { id: 'lines', name: 'Çizgiler ve oklar', tools: ['trend', 'horizontal', 'vertical', 'ray', 'arrow'] },
  { id: 'fib', name: 'Fibonacci', tools: ['fibonacci'] },
  { id: 'shapes', name: 'Şekiller ve fırça', tools: ['rectangle', 'brush'] },
  { id: 'notes', name: 'Metin ve notlar', tools: ['text', 'label'] },
  { id: 'positions', name: 'Pozisyon ve risk', tools: ['long', 'short'] },
];
const toolNames = { cursor: 'İmleç', trend: 'Trend çizgisi', horizontal: 'Yatay çizgi', vertical: 'Dikey çizgi',
  ray: 'Işın', arrow: 'Ok', fibonacci: 'Fibonacci düzeltmesi', rectangle: 'Dikdörtgen', brush: 'Fırça',
  text: 'Metin', label: 'Etiket', long: 'Long pozisyon', short: 'Short pozisyon', ruler: 'Ölçüm cetveli', delete: 'Çizim sil' };
export class DrawingEngine {
  constructor({ chart, series, host, getBars, getInterval, onAlarm, onAlarmManager, onChartAction, getChartMenuState, getStudies }) {
    Object.assign(this, { chart, series, host, getBars, getInterval, onAlarm, onAlarmManager, onChartAction, getChartMenuState, getStudies });
    this.market = 'BTCUSDT'; this.tool = 'cursor'; this.selected = null; this.history = new DrawingHistory();
    this.magnet = false; this.drawingsVisible = true; this.brushing = false;
    this.context = null; this.epoch = 0; this.ready = false; this.histories = new Map();
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.classList.add('drawing-overlay'); this.svg.setAttribute('aria-label', 'Fiyat ve zaman koordinatlı çizimler');
    host.append(this.svg);
    this.toolbar = $('drawing-tools'); this.favbar = $('drawing-favs'); this.manager = $('drawing-manager'); this.status = $('drawing-status');
    this.favs = this.loadFavs();
    this.buildUI();
    this.tree = new ObjectTree(this, toolNames);
    this.floating = new FloatingToolbar({ element: this.favbar, host, getBounds: () => this.dimensions(), key: 'alfa-drawing-favs-position:v1' });
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
      if (e.target.closest?.('#drawing-favs,.selection-toolbar')) return;
      if (this.drag || (this.tool !== 'cursor' && this.inPlot(e))) { e.preventDefault(); e.stopImmediatePropagation(); }
    }, options);
    host.addEventListener('touchstart', e => {
      if (e.target.closest?.('#drawing-favs,.selection-toolbar')) return;
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
    host.addEventListener('contextmenu', e => this.contextMenu(e), options);
    document.addEventListener('pointerdown', e => {
      if (this.menu && !this.menu.contains(e.target)) this.closeContextMenu();
      if (this.flyout && !this.flyout.contains(e.target) && !this.toolbar.contains(e.target)) this.closeToolMenu();
    }, { signal: this.abort.signal, capture: true });
    document.addEventListener('keydown', e => this.keydown(e), { signal: this.abort.signal, capture: true });
    this.observer = new ResizeObserver(() => this.render());
    this.observer.observe(host);
    this.tick = () => {
      try {
        const ts = chart.timeScale(), bars = getBars();
        const signature = [ts.logicalToCoordinate(0), ts.logicalToCoordinate(1), this.series.priceToCoordinate(1),
          this.series.priceToCoordinate(100), ts.width(), this.dimensions().height, bars.length, bars.at(-1)?.time, bars.at(-1)?.close].join(':');
        if (signature !== this.signature) { this.render(); this.signature = signature; }
      } catch {}
      this.frame = requestAnimationFrame(this.tick);
    };
    this.tick();
  }
  step() {
    const m = /^(\d+)([mhdw])$/.exec(this.getInterval() || '');
    return m ? Number(m[1]) * { m: 60, h: 3600, d: 86400, w: 604800 }[m[2]] : 3600;
  }
  project(point) {
    const logical = timeToLogical(point.time, this.getBars(), this.step());
    if (logical == null) return null;
    const x = logicalToPixel(logical, i => this.chart.timeScale().logicalToCoordinate(i)), y = this.series.priceToCoordinate(point.price);
    return x == null || y == null ? null : { x, y };
  }
  dimensions() { return { width: this.chart.timeScale().width(), height: this.series.getPane?.().getHeight() ?? this.host.clientHeight - this.chart.timeScale().height() }; }
  inPlot(e) {
    const r = this.host.getBoundingClientRect(), { width, height } = this.dimensions();
    return e.clientX >= r.left && e.clientX <= r.left + width && e.clientY >= r.top && e.clientY <= r.top + height;
  }
  setMagnet(on) { this.magnet = !!on; }
  setDrawingsVisible(on) {
    this.drawingsVisible = !!on;
    this.svg.style.display = on ? '' : 'none';
    if ($('drawing-selection')) $('drawing-selection').hidden = !on || !this.current();
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
    this.renderToolbars();
    $('drawing-favorites-edit').onclick = e => this.openToolMenu(Object.keys(TOOLS).filter(t => !['cursor', 'delete'].includes(t)), 'Favori araçlar', e.currentTarget);
    $('drawing-undo').onclick = () => { this.cancel(); if (this.ready && this.history.undo()) this.changed(); };
    $('drawing-redo').onclick = () => { this.cancel(); if (this.ready && this.history.redo()) this.changed(); };
    $('drawing-manage').onclick = () => { this.manager.hidden = !this.manager.hidden; this.updatePanel(); };
    $('drawing-close').onclick = () => { this.manager.hidden = true; };
    $('drawing-settings').addEventListener('submit', e => { e.preventDefault(); this.applySettings(); });
    for (const action of ['hide', 'lock', 'copy', 'remove']) $('drawing-' + action).onclick = () => this.action(action);
    $('fib-advanced-toggle').onclick = () => this.toggleAdvancedFibLevels();
    $('fib-template-save').onclick = () => this.saveTemplate();
    $('fib-template-load').onclick = () => this.loadTemplate();
    $('drawing-cloud-retry').onclick = () => this.store.retry(this.context);
    $('drawing-clear-all').onclick = () => {
      if (!this.ready || !this.history.doc.drawings.length) return;
      const locked = this.history.doc.drawings.filter(d => d.locked);
      if (locked.length) {
        if (!confirm(`Kilitli ${locked.length} çizim korunacak; diğerleri silinsin mi?`)) return;
      } else if (!confirm('Bu semboldeki tüm çizimler silinsin mi? (Ctrl+Z ile geri alabilirsiniz)')) return;
      const next = clone(this.history.doc); next.drawings = locked;
      this.selected = null; this.commit(next);
    };
    $('drawing-export').onclick = () => {
      const blob = new Blob([JSON.stringify({ symbol: this.market, ...this.history.doc }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = `alfa-drawings-${this.market}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    this.refresh();
  }
  loadFavs() {
    try {
      const v = JSON.parse(localStorage.getItem('alfa-draw-fav:v1') || 'null');
      if (Array.isArray(v)) return [...new Set(v.filter(t => Object.hasOwn(TOOLS, t)))];
    } catch {}
    return ['trend', 'horizontal', 'fibonacci', 'brush'];
  }
  saveFavs() { try { localStorage.setItem('alfa-draw-fav:v1', JSON.stringify(this.favs)); } catch {} }
  toggleFav(tool) {
    if (this.favs.includes(tool)) this.favs = this.favs.filter(t => t !== tool);
    else this.favs.push(tool);
    this.favs = Object.keys(TOOLS).filter(t => this.favs.includes(t));
    this.saveFavs(); this.renderToolbars();
    this.flyout?.querySelectorAll('[data-favorite]').forEach(b => b.setAttribute('aria-pressed', String(this.favs.includes(b.dataset.favorite))));
    this.status.textContent = this.favs.includes(tool) ? `${TOOLS[tool][1]} favorilere eklendi` : `${TOOLS[tool][1]} favorilerden çıkarıldı`;
  }
  toolButtons() { return [...(this.favbar?.querySelectorAll('[data-tool]') || []), ...this.toolbar.querySelectorAll('[data-tool]'), ...(this.flyout?.querySelectorAll('[data-tool]') || [])]; }
  renderToolbars() {
    const make = (tool, starred) => {
      const label = toolNames[tool] || TOOLS[tool][1];
      const b = document.createElement('button'); b.type = 'button'; b.innerHTML = icon(tool);
      b.title = `${label} · sağ tık: ${starred ? 'favorilerden çıkar' : 'favorilere ekle'}`;
      b.setAttribute('aria-label', label); b.dataset.tool = tool;
      b.setAttribute('aria-pressed', String(tool === this.tool));
      b.disabled = !this.ready;
      b.addEventListener('click', () => this.setTool(tool));
      b.addEventListener('contextmenu', e => { e.preventDefault(); this.toggleFav(tool); });
      return b;
    };
    if (this.favbar) {
      this.favbar.replaceChildren();
      const grip = document.createElement('button'); grip.type = 'button'; grip.className = 'fav-grip'; grip.dataset.toolbarGrip = '';
      grip.innerHTML = icon('grip'); grip.title = 'Tut ve taşı · ok tuşları: taşı · çift tık / Home: sıfırla'; grip.setAttribute('aria-label', 'Favori araç çubuğunu taşı');
      this.favbar.append(grip);
      for (const tool of this.favs) this.favbar.append(make(tool, true));
      this.favbar.hidden = !this.favs.length;
      this.floating?.apply();
    }
    this.toolbar.replaceChildren();
    this.toolbar.append(make('cursor', false));
    for (const group of TOOL_GROUPS) {
      const tool = group.tools.includes(this.tool) ? this.tool : group.tools[0];
      const groupButton = document.createElement('button'); groupButton.type = 'button'; groupButton.className = 'tool-group';
      groupButton.innerHTML = icon(tool); groupButton.dataset.tool = tool; groupButton.dataset.group = group.id;
      groupButton.disabled = !this.ready; groupButton.title = group.name;
      groupButton.setAttribute('aria-label', group.name); groupButton.setAttribute('aria-haspopup', 'dialog');
      groupButton.setAttribute('aria-pressed', String(group.tools.includes(this.tool)));
      groupButton.addEventListener('click', () => this.openToolMenu(group.tools, group.name, groupButton));
      this.toolbar.append(groupButton);
    }
    this.toolbar.append(make('ruler', false), make('delete', false));
  }
  openToolMenu(tools, title, anchor) {
    if (!this.ready) return;
    this.closeToolMenu();
    const menu = document.createElement('div'); menu.className = 'tool-flyout';
    menu.setAttribute('role', 'dialog'); menu.setAttribute('aria-label', title);
    const heading = document.createElement('div'); heading.className = 'menu-heading'; heading.textContent = title;
    menu.append(heading);
    for (const tool of tools) {
      const row = document.createElement('div'); row.className = 'tool-row';
      const b = document.createElement('button'); b.type = 'button'; b.dataset.tool = tool;
      b.innerHTML = icon(tool) + `<span>${toolNames[tool]}</span>`;
      b.setAttribute('aria-pressed', String(tool === this.tool));
      b.addEventListener('click', () => this.setTool(tool));
      const star = document.createElement('button'); star.type = 'button'; star.dataset.favorite = tool;
      star.setAttribute('aria-label', `${toolNames[tool]} favori`); star.setAttribute('aria-pressed', String(this.favs.includes(tool)));
      star.innerHTML = icon('star'); star.onclick = () => this.toggleFav(tool);
      row.append(b, star); menu.append(row);
    }
    (document.fullscreenElement || document.body).append(menu);
    const r = anchor.getBoundingClientRect();
    menu.style.top = Math.max(8, Math.min(r.top, innerHeight - menu.offsetHeight - 10)) + 'px';
    this.flyout = menu;
    menu.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        e.preventDefault(); e.stopPropagation(); this.closeToolMenu(); anchor.focus();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const buttons = [...menu.querySelectorAll('button')], index = buttons.indexOf(document.activeElement);
        buttons[(index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length].focus();
      }
    });
    menu.querySelector('button')?.focus();
  }
  closeToolMenu() {
    this.flyout?.remove(); this.flyout = null;
  }
  contextMenu(e) {
    if (!this.ready || !this.inPlot(e)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    this.closeContextMenu();
    const point = this.unproject(e);
    const id = e.target.closest?.('[data-id]')?.getAttribute('data-id');
    if (id) { if (!this.selection.has(id)) this.selected = id; else this.primary = id; this.refresh(); }
    const d = id ? this.history.doc.drawings.find(x => x.id === id) : null;
    const menu = document.createElement('div'); menu.className = 'chart-context-menu';
    menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', 'Grafik menüsü');
    const heading = text => {
      const h = document.createElement('div'); h.className = 'menu-heading'; h.textContent = text;
      menu.append(h);
    };
    const item = (text, fn, options = {}) => {
      const b = document.createElement('button'); b.type = 'button'; b.disabled = !!options.disabled;
      if (options.checked != null) {
        const mark = document.createElement('span'); mark.className = 'context-mark'; mark.textContent = options.checked ? '✓' : '';
        b.append(mark);
      } else {
        const mark = document.createElement('span'); mark.className = 'context-mark'; mark.textContent = options.symbol || '';
        b.append(mark);
      }
      const label = document.createElement('span'); label.className = 'context-label'; label.textContent = text;
      b.append(label);
      if (options.shortcut) {
        const key = document.createElement('span'); key.className = 'context-shortcut'; key.textContent = options.shortcut;
        b.append(key);
      }
      b.addEventListener('click', () => { this.closeContextMenu(); fn(); });
      menu.append(b);
    };
    const chartState = this.getChartMenuState?.() || {};
    const chartItem = (text, action, options = {}) => item(text, () => this.onChartAction?.(action), options);
    const fmtPrice = p => Number(p).toLocaleString('tr-TR', { maximumFractionDigits: 6 });
    if (point && this.onAlarm) {
      heading('ALARM');
      item(`Alarm: fiyat ≥ ${fmtPrice(point.price)}`, () => this.onAlarm(point.price, 'above'), { symbol: '🔔' });
      item(`Alarm: fiyat ≤ ${fmtPrice(point.price)}`, () => this.onAlarm(point.price, 'below'), { symbol: '🔔' });
    }
    if (this.onAlarmManager) item('Alarm yönetimi…', () => this.onAlarmManager(), { symbol: '🔔' });
    if (d) {
      heading('ÇİZİM');
      if (d.locked) item('Kilidi aç', () => { this.selected = d.id; this.action('lock'); }, { symbol: '🔒' });
      else {
        item(this.selection.size > 1 ? `${this.selection.size} seçili çizimi sil` : 'Çizimi sil', () => this.action('remove'), { symbol: '🗑' });
        item('Seçimi kopyala', () => this.action('copy'), { symbol: '📋' });
      }
      item(d.hidden ? 'Göster' : 'Gizle', () => this.action('hide'), { symbol: '👁' });
      item('Öne getir', () => this.action('front'));
      item('Arkaya gönder', () => this.action('back'));
      if (this.selection.size > 1) item('Klasörde grupla…', () => this.groupSelection());
      item('Çizim ayarları…', () => { this.selected = d.id; this.manager.hidden = false; this.updatePanel(); }, { symbol: '⚙' });
    }
    if (this.onChartAction) {
      heading('GRAFİK');
      chartItem('Grafik görünümü sıfırla', 'reset-view', { symbol: '⟲', shortcut: 'Alt+R' });
      chartItem('Görünümü sığdır', 'fit', { symbol: '⊞', shortcut: 'Alt+F' });
      chartItem('Son muma dön', 'realtime', { symbol: '▶', shortcut: 'Alt+L' });
      chartItem('Tam ekran', 'fullscreen', { symbol: '⛶' });
      chartItem('Grafik ayarları…', 'settings', { symbol: '⚙', shortcut: 'Alt+S' });
      chartItem('Mum ve zemin renkleri…', 'candle-settings', { symbol: '🎨' });
      heading('GÖRÜNÜM');
      chartItem('Izgara çizgileri', 'grid', { checked: chartState.grid });
      chartItem('Fiyat ekseni etiketleri', 'axisLabels', { checked: chartState.axisLabels });
      chartItem('Sade mod', 'clean', { checked: chartState.clean });
      chartItem('Logaritmik fiyat ölçeği', 'logScale', { checked: chartState.logScale });
      chartItem('Otomatik fiyat ölçeği', 'autoScale');
      heading('GÖSTERGELER · PAYLAŞIM');
      chartItem('Gösterge ekle / yönet…', 'indicators', { symbol: '📊', shortcut: 'Alt+I' });
      chartItem('Nesne ağacı…', 'drawings', { symbol: '🗂' });
      chartItem('Ekran görüntüsü indir', 'screenshot', { symbol: '📷' });
      chartItem('Görüntüyü kopyala', 'copy-image', { symbol: '📋' });
      chartItem('Bağlantıyı kopyala', 'copy-link', { symbol: '🔗' });
    }
    if (!menu.querySelector('button')) return;
    (document.fullscreenElement || document.body).append(menu);
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    menu.style.left = Math.max(4, Math.min(e.clientX, window.innerWidth - mw - 4)) + 'px';
    menu.style.top = Math.max(4, Math.min(e.clientY, window.innerHeight - mh - 4)) + 'px';
    this.menu = menu;
    menu.addEventListener('keydown', e => {
      const buttons = [...menu.querySelectorAll('button:not(:disabled)')];
      if (e.key === 'Escape') {
        e.preventDefault(); e.stopPropagation(); this.closeContextMenu(); this.host.focus();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const index = buttons.indexOf(document.activeElement);
        buttons[(index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
      }
    });
    menu.querySelector('button')?.focus();
  }
  closeContextMenu() { if (this.menu) { this.menu.remove(); this.menu = null; } }
  setTool(tool) {
    if (!this.ready) return;
    this.cancel(); this.tool = tool;
    this.renderToolbars();
    this.host.focus({ preventScroll: true });
    this.host.dataset.drawingTool = tool;
    this.toolButtons().forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === tool)));
    $('drawing-help').textContent = tool === 'cursor' ? 'Çizimi seçin/sürükleyin · çift tık: ayarlar · Delete: sil'
      : tool === 'delete' ? 'Silmek için kilitli olmayan bir çizime tıklayın · Escape: iptal'
      : tool === 'brush' ? 'Fırça · basılı tutup sürükleyin · Escape: iptal'
      : `${TOOLS[tool][1]} · ${onePoint(tool) ? 'bir' : 'iki'} nokta seçin · Escape: iptal`;
    this.render();
  }
  cancel() {
    this.closeContextMenu();
    this.closeToolMenu();
    this.draft = null; this.drag = null; this.pending = null; this.brushing = false; this.tool = 'cursor';
    this.host.dataset.drawingTool = 'cursor';
    this.toolButtons().forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === 'cursor')));
    if ($('drawing-help')) $('drawing-help').textContent = 'Çizimi seçin/sürükleyin · çift tık: ayarlar';
    this.render();
  }
  get selected() { return this.primary || null; }
  set selected(id) { this.primary = id || null; this.selection = new Set(id ? [id] : []); }
  current() { return this.history.doc.drawings.find(d => d.id === this.selected); }
  selectObjects(ids, { toggle = false } = {}) {
    const valid = ids.filter(id => this.history.doc.drawings.some(d => d.id === id));
    if (!toggle) this.selection = new Set(valid);
    else {
      const remove = valid.every(id => this.selection.has(id));
      for (const id of valid) remove ? this.selection.delete(id) : this.selection.add(id);
    }
    this.primary = valid.findLast(id => this.selection.has(id)) || [...this.selection].at(-1) || null;
    this.refresh();
  }
  selectAll() { this.cancel(); this.selectObjects(this.history.doc.drawings.map(d => d.id)); }
  down(e) {
    if (e.target.closest?.('#drawing-favs,.selection-toolbar')) return;
    if (!this.ready || e.button !== 0 || !this.inPlot(e)) return;
    const point = this.unproject(e); if (!point) return;
    const hit = e.target.closest?.('[data-id]'), id = hit?.getAttribute('data-id');
    if (this.tool === 'cursor' && !id) { if (!e.ctrlKey && !e.metaKey) this.selected = null; this.refresh(); return; }
    e.preventDefault(); e.stopImmediatePropagation(); this.host.focus({ preventScroll: true });
    if (this.tool === 'delete') {
      if (id) { this.selected = id; this.action('remove'); this.setTool('cursor'); }
      return;
    }
    if (this.tool === 'cursor' && (e.ctrlKey || e.metaKey)) { this.selectObjects([id], { toggle: true }); return; }
    if (this.tool !== 'cursor') {
      if (this.tool === 'brush') {
        this.draft = makeDrawing('brush', [point]);
        this.brushing = true;
        this.host.setPointerCapture(e.pointerId);
        this.render(); return;
      }
      if (!this.draft) {
        this.draft = makeDrawing(this.tool, onePoint(this.tool) ? [point] : [point, point]);
        if (onePoint(this.tool)) this.finish();
      } else {
        const type = this.draft.type, id = this.draft.id, a = this.draft.points[0];
        this.draft = makeDrawing(type, [a, point]); this.draft.id = id; this.finish();
      }
      this.render(); return;
    }
    if (!this.selection.has(id)) this.selected = id; else this.primary = id;
    const d = this.current(); this.refresh();
    if (!d || d.locked) return;
    this.drag = { id, start: point, original: clone(d), doc: clone(this.history.doc), ids: [...this.selection],
      handle: this.selection.size === 1 ? e.target.getAttribute('data-handle') : null, pointer: e.pointerId };
    this.pending = clone(this.history.doc); this.host.setPointerCapture(e.pointerId);
  }
  move(e) {
    if (e.target.closest?.('#drawing-favs,.selection-toolbar')) return;
    const point = this.unproject(e, !!this.drag || !!this.brushing); if (!point) return;
    if (this.brushing && this.draft?.type === 'brush') {
      const last = this.draft.points.at(-1);
      if (!last || Math.abs(point.time - last.time) > 0 || Math.abs(point.price - last.price) > 0) {
        this.draft.points.push(point);
        if (this.draft.points.length > 2000) this.draft.points.shift();
        this.render();
      }
      return;
    }
    if (this.draft && !onePoint(this.draft.type) && this.draft.type !== 'brush') {
      const id = this.draft.id;
      this.draft = makeDrawing(this.draft.type, [this.draft.points[0], point]); this.draft.id = id;
      this.render();
    }
    if (!this.drag) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const { original, start, handle } = this.drag, d = clone(original);
    if (this.drag.ids.length > 1) {
      try { this.pending = translateSelection(this.drag.doc, this.drag.ids, point.time - start.time, point.price - start.price); this.render(); } catch {}
      return;
    }
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
    if (this.brushing) {
      this.brushing = false;
      if (this.host.hasPointerCapture(e.pointerId)) this.host.releasePointerCapture(e.pointerId);
      this.finish();
      return;
    }
    if (!this.drag) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (this.host.hasPointerCapture(e.pointerId)) this.host.releasePointerCapture(e.pointerId);
    const next = this.pending; this.drag = null; this.pending = null;
    if (next) this.commit(next);
  }
  finish() {
    const d = this.draft; if (!d || !validDrawing(d)) return;
    if (d.type === 'brush') { if (d.points.length < 2) { this.cancel(); return; } }
    else if (!onePoint(d.type) && Math.abs(d.points[0].time - d.points[1].time) < .001 &&
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
    const ids = new Set(this.history.doc.drawings.map(d => d.id));
    this.selection = new Set([...this.selection].filter(id => ids.has(id)));
    if (!this.selection.has(this.primary)) this.primary = [...this.selection].at(-1) || null;
    if (this.context) this.store.save(this.context, this.history.doc);
    this.refresh();
  }
  action(action, ids = [...this.selection]) {
    if (!this.ready) return;
    this.cancel();
    const next = clone(this.history.doc), selected = next.drawings.filter(d => ids.includes(d.id)); if (!selected.length) return;
    if (action === 'lock') { const value = selected.some(d => !d.locked); for (const d of selected) d.locked = value; }
    if (action === 'hide') { const value = selected.some(d => !d.hidden); for (const d of selected) d.hidden = value; }
    if (action === 'remove') next.drawings = next.drawings.filter(d => !ids.includes(d.id) || d.locked);
    if (action === 'copy') {
      const copies = selected.map(d => {
        const copy = clone(d); copy.id = crypto.randomUUID(); copy.locked = false; copy.hidden = false;
        copy.points.forEach(p => { p.time += this.step() * 3; }); return copy;
      });
      next.drawings.push(...copies); this.selection = new Set(copies.map(d => d.id)); this.primary = copies.at(-1).id;
    }
    if (action === 'front' || action === 'back') {
      const chosen = selected.filter(d => !d.locked), chosenIds = new Set(chosen.map(d => d.id));
      const rest = next.drawings.filter(d => !chosenIds.has(d.id));
      next.drawings = action === 'front' ? [...rest, ...chosen] : [...chosen, ...rest];
    }
    if (action === 'ungroup') for (const d of selected) if (!d.locked) delete d.group;
    this.commit(next);
  }
  groupSelection() {
    if (!this.ready || !this.selection.size) return;
    const ids = [...this.selection], context = this.context;
    const modal = chartDialog(`<div class="dialog-header"><h3>Seçimi klasörde grupla</h3><button class="icon-button" data-close aria-label="Kapat">${icon('close')}</button></div>
      <form><label>Klasör adı <input name="group" maxlength="60" required autocomplete="off"></label><div class="settings-actions"><button class="apply">Grupla</button></div></form>`);
    modal.box.querySelector('[data-close]').onclick = modal.close;
    modal.box.querySelector('form').onsubmit = e => {
      e.preventDefault(); if (this.context !== context) { modal.close(); return; }
      const name = modal.box.querySelector('input').value.trim(); if (!name) return;
      const next = clone(this.history.doc);
      for (const d of next.drawings) if (ids.includes(d.id) && !d.locked) d.group = name;
      this.commit(next); modal.close();
    };
    modal.box.querySelector('input').focus();
  }
  rename(id) {
    const drawing = this.history.doc.drawings.find(d => d.id === id); if (!drawing || drawing.locked) return;
    const context = this.context;
    const modal = chartDialog(`<div class="dialog-header"><h3>Nesne adı</h3><button class="icon-button" data-close aria-label="Kapat">${icon('close')}</button></div><form><input name="name" aria-label="Nesne adı" maxlength="80" required><div class="settings-actions"><button class="apply">Kaydet</button></div></form>`);
    modal.box.querySelector('input').value = drawing.name || toolNames[drawing.type];
    modal.box.querySelector('[data-close]').onclick = modal.close;
    modal.box.querySelector('form').onsubmit = e => {
      e.preventDefault(); if (this.context !== context) { modal.close(); return; }
      const next = clone(this.history.doc), d = next.drawings.find(d => d.id === id);
      if (d && !d.locked) { d.name = modal.box.querySelector('input').value.trim(); this.commit(next); }
      modal.close();
    };
    modal.box.querySelector('input').select();
  }
  keydown(e) {
    if (document.querySelector('dialog[open]')) return;
    if (e.key === 'Escape') { this.closeContextMenu(); this.cancel(); e.preventDefault(); return; }
    if (e.target.closest?.('input,textarea,select,[contenteditable=true]')) return;
    const chartFocus = this.host.contains(e.target) || e.target.closest?.('#drawing-objects') || e.target === document.body;
    if ((e.ctrlKey || e.metaKey) && chartFocus && e.key.toLowerCase() === 'a') { e.preventDefault(); e.stopImmediatePropagation(); this.selectAll(); return; }
    if ((e.ctrlKey || e.metaKey) && chartFocus && e.key.toLowerCase() === 'g') { e.preventDefault(); e.stopImmediatePropagation(); e.shiftKey ? this.action('ungroup') : this.groupSelection(); return; }
    if ((e.ctrlKey || e.metaKey) && chartFocus && e.key.toLowerCase() === 'd' && this.selection.size) { e.preventDefault(); e.stopImmediatePropagation(); this.action('copy'); return; }
    if (this.selection.size && this.host.contains(e.target) && !e.target.closest?.('#drawing-favs') && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      e.preventDefault(); e.stopImmediatePropagation();
      const multiplier = e.shiftKey ? 10 : 1, current = this.current();
      const y = this.series.priceToCoordinate(current.points[0].price), p = y == null ? null : this.series.coordinateToPrice(y - 1);
      const dp = p == null ? 0 : p - current.points[0].price;
      try { this.commit(translateSelection(this.history.doc, this.selection, (e.key === 'ArrowRight' ? this.step() : e.key === 'ArrowLeft' ? -this.step() : 0) * multiplier,
        (e.key === 'ArrowUp' ? dp : e.key === 'ArrowDown' ? -dp : 0) * multiplier)); } catch {}
      return;
    }
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
    const price = Number(this.getBars?.().at(-1)?.close);
    for (const d of (this.pending || this.history.doc).drawings) {
      if (d.hidden) continue;
      const g = renderDrawing(d, p => this.project(p), width, height, this.selection.has(d.id), false, this.selection.size === 1, price);
      if (g) fragment.append(g);
    }
    if (this.draft) {
      const g = renderDrawing(this.draft, p => this.project(p), width, height, false, true, true, price);
      if (g) fragment.append(g);
    }
    this.svg.replaceChildren(fragment);
  }
  refresh() {
    this.toolButtons().forEach(b => { b.disabled = !this.ready; });
    $('drawing-undo').disabled = !this.ready || !this.history.past.length;
    $('drawing-redo').disabled = !this.ready || !this.history.future.length;
    $('drawing-cloud-retry').disabled = !this.ready || !this.context?.remote;
    this.render(); this.updatePanel();
    const selection = $('drawing-selection'), d = this.current();
    if (selection) {
      selection.hidden = !d || d.hidden || !this.drawingsVisible;
      selection.replaceChildren();
      if (d) {
        const name = document.createElement('small'); name.textContent = this.selection.size > 1 ? `${this.selection.size} seçili` : d.name || toolNames[d.type]; selection.append(name);
        const actions = this.selection.size > 1 ? [['group', 'folder', 'Seçimi grupla'], ['copy', 'layers', 'Seçimi kopyala'], ['lock', 'lock', 'Seçimi kilitle/aç'], ['remove', 'delete', 'Seçili çizimleri sil']] :
          [['settings', 'settings', 'Çizim ayarları'], ['copy', 'layers', 'Çizimi kopyala'], ['remove', 'delete', 'Seçili çizimi sil']];
        for (const [action, glyph, label] of actions) {
          const b = document.createElement('button'); b.type = 'button'; b.innerHTML = icon(glyph); b.title = label; b.setAttribute('aria-label', label);
          b.disabled = action === 'remove' && this.history.doc.drawings.filter(d => this.selection.has(d.id)).every(d => d.locked);
          b.onclick = () => { if (action === 'settings') { this.manager.hidden = false; this.updatePanel(); } else if (action === 'group') this.groupSelection(); else this.action(action); };
          selection.append(b);
        }
      }
    }
  }
  renderCoordinateEditor(d) {
    const fieldset = $('drawing-coordinate-fields'), host = $('drawing-anchors');
    if (!fieldset || !host) return;
    const supported = !['brush', 'long', 'short'].includes(d?.type) && d?.points?.length <= 20;
    fieldset.hidden = !supported || this.selection.size !== 1;
    if (fieldset.hidden) { host.replaceChildren(); return; }
    host.replaceChildren(...d.points.map((point, index) => {
      const row = document.createElement('div');
      row.className = 'anchor-row'; row.dataset.anchor = String(index);
      const timeLabel = document.createElement('label'); timeLabel.textContent = `${index + 1}. nokta · zaman (UTC sn)`;
      const time = document.createElement('input'); time.type = 'number'; time.step = 'any'; time.value = String(point.time);
      time.dataset.time = ''; time.disabled = !!d.locked;
      timeLabel.append(time);
      const priceLabel = document.createElement('label'); priceLabel.textContent = `${index + 1}. nokta · fiyat`;
      const price = document.createElement('input'); price.type = 'number'; price.step = 'any'; price.min = '0'; price.value = String(point.price);
      price.dataset.price = ''; price.disabled = !!d.locked;
      priceLabel.append(price);
      row.append(timeLabel, priceLabel);
      return row;
    }));
  }
  updatePanel() {
    this.tree?.render();
    $('drawing-empty').hidden = !!this.history.doc.drawings.length;
    const d = this.current(), form = $('drawing-settings');
    form.hidden = !d || this.selection.size !== 1;
    $('drawing-selected-name').textContent = this.selection.size > 1 ? `${this.selection.size} seçili` : d ? d.name || toolNames[d.type] : '';
    if (!d || this.selection.size !== 1) { this.renderCoordinateEditor(null); return; }
    this.renderCoordinateEditor(d);
    const style = normalizeStyle(d);
    $('drawing-color').value = style.color; $('drawing-width').value = style.width;
    $('drawing-line-style').value = style.lineStyle; $('drawing-fill-color').value = style.fillColor;
    $('drawing-fill-opacity').value = style.fillOpacity; $('drawing-corner-radius').value = style.cornerRadius;
    $('drawing-show-labels').checked = style.showLabels; $('drawing-dynamic-colors').checked = style.dynamicColors;
    $('drawing-profit-color').value = style.profitColor; $('drawing-loss-color').value = style.lossColor;
    $('drawing-dynamic-fields').hidden = !isPosition(d);
    $('drawing-text-row').hidden = !['text', 'label'].includes(d.type); $('drawing-font-row').hidden = !['text', 'label'].includes(d.type);
    $('drawing-text').value = d.text || ''; $('drawing-font-size').value = d.fontSize || 14;
    $('drawing-fib-fields').hidden = d.type !== 'fibonacci';
    $('drawing-position-fields').hidden = !isPosition(d);
    if (d.type === 'fibonacci') {
      $('fib-levels').value = d.levels.join(', '); $('fib-reverse').checked = d.reversed; $('fib-prices').checked = d.showPrices;
      const hasAdvanced = EXTENSION_LEVELS.every(n => d.levels.includes(n));
      $('fib-advanced-toggle').textContent = hasAdvanced ? 'Gelişmiş seviyeleri kaldır' : 'Gelişmiş seviyeleri ekle';
      $('fib-templates').replaceChildren();
      this.history.doc.templates.forEach((t, i) => {
        const option = document.createElement('option'); option.value = i; option.textContent = t.name; $('fib-templates').append(option);
      });
      $('fib-template-load').disabled = d.locked || !this.history.doc.templates.length;
    }
    if (isPosition(d)) {
      $('position-entry').value = d.points[0].price; $('position-stop').value = d.points[1].price; $('position-target').value = d.target;
      $('position-risk-amount').value = d.riskAmount ?? '';
      $('position-size').value = d.positionSize ?? '';
      $('position-account-risk').value = d.accountRiskPercent ?? '';
      this.showLiveStats(d);
    }
    form.querySelectorAll('[data-edit]').forEach(el => { el.disabled = d.locked; });
    $('drawing-lock').textContent = d.locked ? 'Kilidi aç' : 'Kilitle';
    $('drawing-hide').textContent = d.hidden ? 'Göster' : 'Gizle';
    $('drawing-remove').disabled = d.locked;
  }
  showLiveStats(d) {
    const stats = positionStats(d);
    const parts = [`RR 1:${stats.rr.toFixed(4)}`, `Risk %${stats.riskPercent.toFixed(4)}`, `Kazanç %${stats.gainPercent.toFixed(4)}`];
    if (Number.isFinite(stats.positionSize)) parts.push(`Büyüklük ${stats.positionSize.toFixed(4)}`);
    if (Number.isFinite(stats.riskAmount)) parts.push(`Risk tutarı ${stats.riskAmount.toFixed(4)}`);
    $('position-stats').textContent = parts.join(' · ');
  }
  applySettings() {
    const next = clone(this.history.doc), d = next.drawings.find(x => x.id === this.selected); if (!d || d.locked) return;
    d.color = $('drawing-color').value; d.width = Number($('drawing-width').value);
    d.lineStyle = $('drawing-line-style').value; d.fillColor = $('drawing-fill-color').value;
    d.fillOpacity = Number($('drawing-fill-opacity').value); d.cornerRadius = Number($('drawing-corner-radius').value);
    d.showLabels = $('drawing-show-labels').checked;
    if (d.type === 'text' || d.type === 'label') {
      d.text = $('drawing-text').value.trim() || (d.type === 'label' ? 'Etiket' : 'Metin'); d.fontSize = Number($('drawing-font-size').value);
    }
    if (d.type === 'fibonacci') {
      const tokens = $('fib-levels').value.split(',').map(s => s.trim());
      if (tokens.some(s => !s)) { this.status.textContent = 'Seviyeleri noktalı ondalık ve virgül ile ayırın'; return; }
      d.levels = [...new Set(tokens.map(Number))]; d.reversed = $('fib-reverse').checked; d.showPrices = $('fib-prices').checked;
    }
    if (!$('drawing-coordinate-fields').hidden) {
      const rows = [...$('drawing-anchors').querySelectorAll('[data-anchor]')];
      if (rows.length !== d.points.length) { this.status.textContent = 'Koordinat satırları eksik'; return; }
      const points = rows.map(row => ({
        time: Number(row.querySelector('[data-time]').value),
        price: Number(row.querySelector('[data-price]').value)
      }));
      if (!points.every(p => Number.isFinite(p.time) && p.time > 0 && Number.isFinite(p.price) && p.price > 0)) {
        this.status.textContent = 'Koordinatlar için geçerli UTC saniye ve fiyat girin'; return;
      }
      d.points = points;
    }
    if (isPosition(d)) {
      const entry = Number($('position-entry').value), stop = Number($('position-stop').value), target = Number($('position-target').value);
      const sign = d.type === 'long' ? 1 : -1;
      if (!(sign > 0 ? stop < entry && target > entry : stop > entry && target < entry)) {
        this.status.textContent = 'Stop Loss ve Take Profit entry fiyatının doğru tarafında olmalı';
        return;
      }
      d.points[0].price = entry; d.points[1].price = stop; d.target = target;
      const riskAmount = Number($('position-risk-amount').value);
      const positionSize = Number($('position-size').value);
      const accountRisk = Number($('position-account-risk').value);
      d.riskAmount = Number.isFinite(riskAmount) && riskAmount >= 0 ? riskAmount : undefined;
      d.positionSize = Number.isFinite(positionSize) && positionSize >= 0 ? positionSize : undefined;
      d.accountRiskPercent = Number.isFinite(accountRisk) && accountRisk >= 0 ? accountRisk : undefined;
      d.dynamicColors = $('drawing-dynamic-colors').checked; d.profitColor = $('drawing-profit-color').value; d.lossColor = $('drawing-loss-color').value;
    }
    this.commit(next);
  }
  toggleAdvancedFibLevels() {
    const input = $('fib-levels'), d = this.current();
    if (d?.type !== 'fibonacci' || d.locked) return;
    const tokens = input.value.split(',').map(s => s.trim()).filter(Boolean);
    if (tokens.some(s => !Number.isFinite(Number(s)))) { this.status.textContent = 'Seviyeleri noktalı ondalık ve virgül ile ayırın'; return; }
    const levels = [...new Set(tokens.map(Number))];
    const hasAdvanced = EXTENSION_LEVELS.every(n => levels.includes(n));
    const next = (hasAdvanced ? levels.filter(n => !EXTENSION_LEVELS.includes(n)) : [...new Set([...levels, ...EXTENSION_LEVELS])]).sort((a, b) => a - b);
    if (!next.length) { this.status.textContent = 'En az bir seviye gerekli'; return; }
    input.value = next.join(', ');
    $('fib-advanced-toggle').textContent = hasAdvanced ? 'Gelişmiş seviyeleri ekle' : 'Gelişmiş seviyeleri kaldır';
    this.applySettings();
  }
  saveTemplate() {
    const d = this.current(); if (d?.type !== 'fibonacci' || d.locked) return;
    const name = $('fib-template-name').value.trim();
    if (!name) { this.status.textContent = 'Şablon adı girin'; return; }
    const style = Object.fromEntries([...STYLE_FIELDS, 'levels', 'reversed', 'showPrices'].filter(key => d[key] != null).map(key => [key, clone(d[key])]));
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
    this.closeContextMenu();
    this.closeToolMenu();
    this.floating.dispose(); this.tree.dispose();
    this.observer.disconnect(); this.store.dispose(); this.svg.remove();
  }
}
