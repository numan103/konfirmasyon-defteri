// Persist a floating chart toolbar by normalized plot coordinates. The grip is
// delegated so rebuilding tool buttons never removes its drag listeners.
export class FloatingToolbar {
  constructor({ element, host, getBounds, key }) {
    Object.assign(this, { element, host, getBounds, key });
    this.abort = new AbortController();
    try {
      const p = JSON.parse(localStorage.getItem(key) || 'null');
      if (Number.isFinite(p?.x) && Number.isFinite(p?.y)) this.position = { x: Math.max(0, Math.min(1, p.x)), y: Math.max(0, Math.min(1, p.y)) };
    } catch {}
    const opts = { signal: this.abort.signal };
    element.addEventListener('pointerdown', e => {
      if (e.button !== 0 || !e.target.closest('[data-toolbar-grip]')) return;
      e.preventDefault(); e.stopPropagation();
      const r = element.getBoundingClientRect(), h = host.getBoundingClientRect();
      this.drag = { pointer: e.pointerId, x: e.clientX, y: e.clientY, left: r.left - h.left, top: r.top - h.top, original: this.position };
      element.setPointerCapture(e.pointerId); element.classList.add('toolbar-dragging');
    }, opts);
    element.addEventListener('pointermove', e => {
      if (!this.drag || e.pointerId !== this.drag.pointer) return;
      e.preventDefault(); e.stopPropagation();
      this.place(this.drag.left + e.clientX - this.drag.x, this.drag.top + e.clientY - this.drag.y);
    }, opts);
    const finish = e => {
      if (!this.drag || e.pointerId !== this.drag.pointer) return;
      if (e.type === 'pointercancel') this.position = this.drag.original;
      this.drag = null; element.classList.remove('toolbar-dragging');
      if (element.hasPointerCapture(e.pointerId)) element.releasePointerCapture(e.pointerId);
      if (e.type !== 'pointercancel') this.save();
      this.apply();
    };
    element.addEventListener('pointerup', finish, opts); element.addEventListener('pointercancel', finish, opts);
    element.addEventListener('dblclick', e => { if (e.target.closest('[data-toolbar-grip]')) { e.preventDefault(); this.position = null; this.save(); this.apply(); } }, opts);
    element.addEventListener('keydown', e => {
      if (!e.target.closest('[data-toolbar-grip]')) return;
      const delta = e.shiftKey ? 25 : 10, r = element.getBoundingClientRect(), h = host.getBoundingClientRect();
      const keys = { ArrowLeft: [-delta, 0], ArrowRight: [delta, 0], ArrowUp: [0, -delta], ArrowDown: [0, delta] };
      if (e.key === 'Home') { e.preventDefault(); this.position = null; this.save(); this.apply(); }
      else if (keys[e.key]) { e.preventDefault(); e.stopPropagation(); this.place(r.left - h.left + keys[e.key][0], r.top - h.top + keys[e.key][1]); this.save(); }
    }, opts);
    this.observer = new ResizeObserver(() => this.apply()); this.observer.observe(host); this.observer.observe(element);
    this.apply();
  }
  limits() {
    const { width, height } = this.getBounds();
    return { x: Math.max(0, width - this.element.offsetWidth - 4), y: Math.max(0, height - this.element.offsetHeight - 4) };
  }
  place(x, y) {
    const limits = this.limits(); x = Math.max(0, Math.min(limits.x, x)); y = Math.max(0, Math.min(limits.y, y));
    this.position = { x: limits.x ? x / limits.x : 0, y: limits.y ? y / limits.y : 0 };
    this.element.style.left = x + 'px'; this.element.style.top = y + 'px';
  }
  apply() {
    if (this.drag || this.element.hidden) return;
    const limits = this.limits();
    this.element.style.left = (this.position ? this.position.x * limits.x : Math.min(12, limits.x)) + 'px';
    this.element.style.top = (this.position ? this.position.y * limits.y : Math.min(10, limits.y)) + 'px';
  }
  save() { try { localStorage.setItem(this.key, JSON.stringify(this.position)); } catch {} }
  dispose() { this.abort.abort(); this.observer.disconnect(); }
}
