import { fibPrice, positionStats } from './alfa-drawings-model.mjs?v=2';
const NS = 'http://www.w3.org/2000/svg';
const fmt = n => Number(n).toLocaleString('tr-TR', { maximumFractionDigits: 4 });
function el(tag, attrs, text) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  if (text != null) node.textContent = text;
  return node;
}
export function renderDrawing(d, project, width, height, selected, draft = false) {
  const p = d.points.map(project);
  if (p.some(v => !v || !Number.isFinite(v.x) || !Number.isFinite(v.y))) return null;
  const g = el('g', { 'data-id': d.id, role: 'group', 'aria-label': d.type + ' çizimi', class: 'drawing' + (selected ? ' selected' : ''), opacity: draft ? .65 : 1 });
  const color = d.color, stroke = d.width;
  const append = node => { g.append(node); return node; };
  function line(x1, y1, x2, y2, c = color, handle) {
    append(el('line', { x1, y1, x2, y2, stroke: c, 'stroke-width': Math.max(12, stroke), 'stroke-opacity': 0,
      ...(handle ? { 'data-handle': handle } : {}), class: 'drawing-hit' }));
    append(el('line', { x1, y1, x2, y2, stroke: c, 'stroke-width': stroke, 'pointer-events': 'none' }));
  }
  function label(x, y, text, c = color, size = 11) {
    append(el('text', { x: Math.max(4, Math.min(width - 12, x)), y: Math.max(14, Math.min(height - 4, y)), fill: c,
      'font-size': size, 'paint-order': 'stroke', stroke: '#10141c', 'stroke-width': 3, class: 'drawing-label' }, text));
  }
  function rect(x, y, w, h, fill, opacity = .14) {
    append(el('rect', { x, y, width: Math.max(1, w), height: Math.max(1, h), fill, 'fill-opacity': opacity, stroke: fill,
      'stroke-width': 1, class: 'drawing-area' }));
  }
  const a = p[0], b = p[1] || a;
  const left = Math.min(a.x, b.x), right = Math.max(a.x, b.x), top = Math.min(a.y, b.y), bottom = Math.max(a.y, b.y);
  if (d.type === 'horizontal') { line(0, a.y, width, a.y); label(8, a.y - 6, fmt(d.points[0].price)); }
  if (d.type === 'vertical') { line(a.x, 0, a.x, height); label(a.x + 6, 16, new Date(d.points[0].time * 1000).toISOString().slice(0, 16).replace('T', ' ')); }
  if (d.type === 'trend' || d.type === 'ray') {
    let end = b;
    if (d.type === 'ray') {
      const dx = b.x - a.x, dy = b.y - a.y;
      if (Math.abs(dx) > .001) { const x = dx > 0 ? width : 0; end = { x, y: a.y + (x - a.x) * dy / dx }; }
      else end = { x: a.x, y: dy > 0 ? height : 0 };
    }
    line(a.x, a.y, end.x, end.y);
  }
  if (d.type === 'rectangle') rect(left, top, right - left, bottom - top, color);
  if (d.type === 'fibonacci') {
    for (const level of d.levels) {
      const price = fibPrice(d.points[0].price, d.points[1].price, level, d.reversed);
      const pos = project({ time: d.points[0].time, price });
      if (!pos) continue;
      line(left, pos.y, right, pos.y);
      label(left + 5, pos.y - 5, `${level}${d.showPrices ? '  (' + fmt(price) + ')' : ''}`);
    }
    append(el('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: color, 'stroke-dasharray': '4 4', 'pointer-events': 'none' }));
  }
  if (d.type === 'long' || d.type === 'short') {
    const stats = positionStats(d);
    const entryY = a.y, stopY = b.y, targetY = project({ time: d.points[0].time, price: d.target })?.y;
    if (targetY == null) return null;
    rect(left, Math.min(entryY, stopY), right - left, Math.abs(entryY - stopY), '#ef6677', .2);
    rect(left, Math.min(entryY, targetY), right - left, Math.abs(entryY - targetY), '#26c89c', .2);
    line(left, entryY, right, entryY, color, 'entry'); line(left, stopY, right, stopY, '#ef6677', 'stop');
    line(left, targetY, right, targetY, '#26c89c', 'target');
    label(left + 4, entryY - 6, `Entry ${fmt(stats.entry)} · RR 1:${stats.rr.toFixed(2)}`);
    label(left + 4, stopY + 16, `SL ${fmt(stats.stop)} · Risk %${stats.riskPercent.toFixed(2)}`, '#ef6677');
    label(left + 4, targetY - 6, `TP ${fmt(stats.target)} · Kazanç %${stats.gainPercent.toFixed(2)}`, '#26c89c');
    label(left + 4, Math.min(entryY, targetY) + 16, 'Yalnızca analiz · emir açılmaz', '#a3b0c5');
  }
  if (d.type === 'text') {
    const size = d.fontSize || 14;
    d.text.split('\n').forEach((text, i) => label(a.x, a.y + i * (size + 3), text, color, size));
  }
  if (d.type === 'ruler') {
    rect(left, top, right - left, bottom - top, color, .08);
    line(a.x, a.y, b.x, b.y);
    const diff = d.points[1].price - d.points[0].price;
    const hours = Math.abs(d.points[1].time - d.points[0].time) / 3600;
    label(left + 5, top - 8, `${diff >= 0 ? '+' : ''}${fmt(diff)} (${(diff / d.points[0].price * 100).toFixed(2)}%) · ${hours.toFixed(2)} saat`);
  }
  if (selected && !d.locked && !draft) {
    function handle(x, y, name) {
      append(el('circle', { cx: x, cy: y, r: 6, fill: '#10141c', stroke: '#c3d0ff', 'stroke-width': 2, 'data-handle': name,
        role: 'img', 'aria-label': 'Çizim tutamacı ' + name, class: 'drawing-handle' }));
    }
    p.forEach((point, i) => handle(point.x, point.y, 'p' + i));
    if (['long', 'short'].includes(d.type)) {
      const x = (a.x + b.x) / 2;
      handle(x, a.y, 'entry'); handle(x, b.y, 'stop');
      handle(x, project({ time: d.points[0].time, price: d.target }).y, 'target');
    }
  }
  if (d.locked && selected) label(a.x + 8, a.y - 16, '🔒 Kilitli');
  return g;
}
