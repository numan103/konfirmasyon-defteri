// Drawing documents contain only UTC epoch seconds and market prices, never pixels.
export const LEVELS = Object.freeze([0, .236, .382, .5, .618, .705, .786, 1]);
export const TOOLS = Object.freeze({
  cursor: ['⌖', 'İmleç / Crosshair'], horizontal: ['━', 'Horizontal Line'],
  vertical: ['┃', 'Vertical Line'], trend: ['╱', 'Trend Line'], ray: ['↗', 'Ray'],
  rectangle: ['▭', 'Rectangle'], fibonacci: ['≋', 'Fibonacci Retracement'],
  long: ['L', 'Long Position'], short: ['S', 'Short Position'],
  text: ['T', 'Text'], label: ['🏷', 'Label'], arrow: ['➤', 'Arrow'], brush: ['🖌', 'Brush / Freehand'], ruler: ['↔', 'Ruler / Price Range'], delete: ['⌫', 'Delete Drawing']
});
const TYPES = Object.keys(TOOLS).filter(t => !['cursor', 'delete'].includes(t));
export const clone = value => structuredClone(value);
export const emptyDocument = () => ({ version: 1, drawings: [], templates: [] });
export function fibPrice(a, b, level, reversed = false) {
  // 0 = second anchor, 1 = first anchor (retracement from the swing end).
  return reversed ? a + (b - a) * level : b + (a - b) * level;
}
// Optional style fields stay optional on disk so documents saved before this
// release keep loading. normalizeStyle() supplies the visual defaults.
export const STYLE_FIELDS = Object.freeze(['color', 'width', 'lineStyle', 'fillColor', 'fillOpacity', 'cornerRadius', 'dynamicColors', 'profitColor', 'lossColor', 'showLabels']);
export const STYLE_DEFAULTS = Object.freeze({
  color: '#8ea7ff', width: 2, lineStyle: 'solid', fillColor: '#8ea7ff', fillOpacity: 0.14,
  cornerRadius: 0, dynamicColors: false, profitColor: '#26c89c', lossColor: '#ef6677', showLabels: true
});
export function normalizeStyle(d = {}) {
  const out = { ...STYLE_DEFAULTS };
  for (const key of STYLE_FIELDS) if (d[key] != null) out[key] = d[key];
  return out;
}
export function positionStats(d, currentPrice) {
  const entry = d.points[0].price, stop = d.points[1].price, target = d.target;
  const sign = d.type === 'long' ? 1 : -1;
  const risk = (entry - stop) * sign, reward = (target - entry) * sign;
  const stats = { entry, stop, target, risk, reward, rr: reward / risk, riskPercent: risk / entry * 100, gainPercent: reward / entry * 100,
    valid: [entry, stop, target, risk, reward].every(Number.isFinite) && risk > 0 && reward > 0 && Math.min(entry, stop, target) > 0 };
  if (Number.isFinite(currentPrice)) {
    stats.current = currentPrice;
    stats.pl = (currentPrice - entry) * sign;
    stats.plPercent = stats.pl / entry * 100;
    stats.phase = currentPrice >= target && sign > 0 || currentPrice <= target && sign < 0 ? 'target'
      : currentPrice <= stop && sign > 0 || currentPrice >= stop && sign < 0 ? 'stop'
        : currentPrice > entry && sign > 0 || currentPrice < entry && sign < 0 ? 'profit'
          : currentPrice < entry && sign > 0 || currentPrice > entry && sign < 0 ? 'loss' : 'entry';
  }
  return stats;
}
export function makeDrawing(type, points, template) {
  if (!TYPES.includes(type)) throw new Error('Geçersiz araç');
  const d = { id: crypto.randomUUID(), type, points: clone(points), ...STYLE_DEFAULTS, hidden: false, locked: false };
  if (type === 'fibonacci') Object.assign(d, { levels: [...LEVELS], reversed: false, showPrices: true }, clone(template || {}));
  if (type === 'text' || type === 'label') { d.text = type === 'label' ? 'Etiket' : 'Metin'; d.fontSize = 14; }
  if (type === 'long' || type === 'short') {
    const entry = points[0].price;
    const sign = type === 'long' ? 1 : -1;
    const risk = Math.max(Math.abs(entry - points[1].price), entry * .001);
    d.points[1].price = entry - sign * Math.min(risk, entry * .2);
    d.target = entry + sign * Math.min(risk, entry * .2) * 2.5;
  }
  return d;
}
export function validDrawing(d) {
  if (!d || typeof d.id !== 'string' || d.id.length > 100 || !TYPES.includes(d.type) ||
      !Array.isArray(d.points) || (d.type === 'brush' ? (d.points.length < 2 || d.points.length > 2000) : d.points.length !== (['horizontal', 'vertical', 'text', 'label'].includes(d.type) ? 1 : 2)) ||
      !d.points.every(p => p && Number.isFinite(p.time) && p.time > 0 && Number.isFinite(p.price) && p.price > 0) ||
      !/^#[0-9a-f]{6}$/i.test(d.color) || !Number.isFinite(d.width) || d.width < 1 || d.width > 6 ||
      typeof d.hidden !== 'boolean' || typeof d.locked !== 'boolean') return false;
  const style = normalizeStyle(d);
  if (!['solid', 'dashed', 'dotted'].includes(style.lineStyle) ||
      !/^#[0-9a-f]{6}$/i.test(style.fillColor) || !/^#[0-9a-f]{6}$/i.test(style.profitColor) || !/^#[0-9a-f]{6}$/i.test(style.lossColor) ||
      !Number.isFinite(style.fillOpacity) || style.fillOpacity < 0 || style.fillOpacity > 1 ||
      !Number.isFinite(style.cornerRadius) || style.cornerRadius < 0 || style.cornerRadius > 40 ||
      typeof style.dynamicColors !== 'boolean' || typeof style.showLabels !== 'boolean') return false;
  if (d.name != null && (typeof d.name !== 'string' || d.name.length > 80)) return false;
  if (d.group != null && (typeof d.group !== 'string' || !d.group.trim() || d.group.length > 60)) return false;
  if (['text', 'label'].includes(d.type) && (typeof d.text !== 'string' || d.text.length > 500 ||
    !Number.isFinite(d.fontSize ?? 14) || (d.fontSize ?? 14) < 8 || (d.fontSize ?? 14) > 48)) return false;
  if (d.type === 'fibonacci' && (!Array.isArray(d.levels) || !d.levels.length || d.levels.length > 30 ||
    !d.levels.every(n => Number.isFinite(n) && Math.abs(n) <= 20) || typeof d.reversed !== 'boolean' || typeof d.showPrices !== 'boolean')) return false;
  if (['long', 'short'].includes(d.type) && !positionStats(d).valid) return false;
  return true;
}
export function validateDocument(doc) {
  if (!doc || doc.version !== 1 || !Array.isArray(doc.drawings) || doc.drawings.length > 300 ||
    !doc.drawings.every(validDrawing) || new Set(doc.drawings.map(d => d.id)).size !== doc.drawings.length ||
    !Array.isArray(doc.templates) || doc.templates.length > 30) throw new Error('Çizim belgesi doğrulanamadı');
  for (const t of doc.templates) {
    if (!t || typeof t.name !== 'string' || !t.name.trim() || t.name.length > 60 || !t.style || typeof t.style !== 'object' ||
      Object.keys(t.style).some(k => ![...STYLE_FIELDS, 'levels', 'reversed', 'showPrices'].includes(k)) ||
      !validDrawing({ ...makeDrawing('fibonacci', [{ time: 1, price: 1 }, { time: 2, price: 2 }]), ...t.style })) {
      throw new Error('Geçersiz Fibonacci şablonu');
    }
  }
  return clone(doc);
}
export function timeToLogical(time, bars, step) {
  if (!bars.length) return null;
  if (time <= bars[0].time) return (time - bars[0].time) / step;
  const last = bars.length - 1;
  if (time >= bars[last].time) return last + (time - bars[last].time) / step;
  let lo = 0, hi = last;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (bars[m].time <= time) lo = m; else hi = m; }
  return lo + (time - bars[lo].time) / (bars[hi].time - bars[lo].time);
}
export function logicalToTime(logical, bars, step) {
  if (!bars.length) return null;
  const last = bars.length - 1;
  if (logical <= 0) return bars[0].time + logical * step;
  if (logical >= last) return bars[last].time + (logical - last) * step;
  const i = Math.floor(logical);
  return bars[i].time + (logical - i) * (bars[i + 1].time - bars[i].time);
}
// LWC 5.0.9's public logicalToCoordinate accepts integers only (fractional -> 0).
// Never feed fractional indices to it: interpolate between integer bar centers.
export function logicalToPixel(logical, coordinateOfInteger) {
  const i = Math.floor(logical), a = coordinateOfInteger(i), b = coordinateOfInteger(i + 1);
  return a == null || b == null ? null : a + (logical - i) * (b - a);
}
export function pixelToLogical(x, coordinateOfInteger) {
  const a = coordinateOfInteger(0), b = coordinateOfInteger(1);
  return a == null || b == null || a === b ? null : (x - a) / (b - a);
}
export function translateSelection(doc, ids, dt, dp) {
  if (!Number.isFinite(dt) || !Number.isFinite(dp)) throw new Error('Geçersiz taşıma');
  const selected = new Set(ids), next = clone(doc);
  for (const d of next.drawings) if (selected.has(d.id) && !d.locked) {
    d.points = d.points.map(p => ({ time: p.time + dt, price: p.price + dp }));
    if (['long', 'short'].includes(d.type)) d.target += dp;
    if (!validDrawing(d)) throw new Error('Seçim grafik sınırlarının dışına taşınamaz');
  }
  return next;
}
export class DrawingHistory {
  constructor(doc = emptyDocument()) { this.reset(doc); }
  reset(doc) { this.doc = validateDocument(doc); this.past = []; this.future = []; }
  commit(next) {
    const clean = validateDocument(next);
    if (JSON.stringify(clean) === JSON.stringify(this.doc)) return false;
    this.past.push(clone(this.doc)); if (this.past.length > 100) this.past.shift();
    this.doc = clean; this.future = []; return true;
  }
  undo() { if (!this.past.length) return false; this.future.push(this.doc); this.doc = this.past.pop(); return true; }
  redo() { if (!this.future.length) return false; this.past.push(this.doc); this.doc = this.future.pop(); return true; }
}
