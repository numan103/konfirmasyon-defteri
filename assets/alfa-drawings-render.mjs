import { fibPrice, positionStats, normalizeStyle } from './alfa-drawings-model.mjs?v=7';
const NS = 'http://www.w3.org/2000/svg';
const fmt = n => Number(n).toLocaleString('tr-TR', { maximumFractionDigits: 4 });
function el(tag, attrs, text) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  if (text != null) node.textContent = text;
  return node;
}
export function renderDrawing(d, project, width, height, selected, draft = false, showHandles = true, currentPrice) {
  const p = d.points.map(project);
  if (p.some(v => !v || !Number.isFinite(v.x) || !Number.isFinite(v.y))) return null;
  const g = el('g', { 'data-id': d.id, role: 'group', 'aria-label': d.type + ' çizimi', class: 'drawing' + (selected ? ' selected' : ''), opacity: draft ? .65 : 1 });
  const style = normalizeStyle(d);
  const color = style.color, stroke = style.width;
  const dash = style.lineStyle === 'dashed' ? '9 6' : style.lineStyle === 'dotted' ? '2 5' : null;
  const stats = ['long', 'short'].includes(d.type) ? positionStats(d, currentPrice) : null;
  const live = style.dynamicColors && stats?.current != null && stats.valid;
  const palette = live
    ? { loss: style.lossColor, profit: style.profitColor,
        lossPhase: stats.phase === 'loss' || stats.phase === 'stop', profitPhase: stats.phase === 'profit' || stats.phase === 'target' }
    : { loss: '#ef6677', profit: '#26c89c', lossPhase: false, profitPhase: false };
  const append = node => { g.append(node); return node; };
  function line(x1, y1, x2, y2, c = color, handle) {
    append(el('line', { x1, y1, x2, y2, stroke: c, 'stroke-width': Math.max(12, stroke), 'stroke-opacity': 0,
      ...(handle ? { 'data-handle': handle } : {}), class: 'drawing-hit' }));
    append(el('line', { x1, y1, x2, y2, stroke: c, 'stroke-width': stroke, 'pointer-events': 'none',
      ...(dash ? { 'stroke-dasharray': dash, 'stroke-linecap': style.lineStyle === 'dotted' ? 'round' : 'butt' } : {}) }));
  }
  function label(x, y, text, c = color, size = 11) {
    if (!style.showLabels) return;
    append(el('text', { x: Math.max(4, Math.min(width - 12, x)), y: Math.max(14, Math.min(height - 4, y)), fill: c,
      'font-size': size, 'paint-order': 'stroke', stroke: '#10141c', 'stroke-width': 3, class: 'drawing-label' }, text));
  }
  function rect(x, y, w, h, fill = style.fillColor, opacity = style.fillOpacity, radius = style.cornerRadius, strokeColor = fill) {
    const r = Math.max(0, Math.min(40, Number(radius) || 0));
    append(el('rect', { x, y, width: Math.max(1, w), height: Math.max(1, h), fill, 'fill-opacity': opacity,
      stroke: strokeColor, 'stroke-width': 1, rx: r, ry: r, class: 'drawing-area' }));
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
  if (d.type === 'rectangle') rect(left, top, right - left, bottom - top, style.fillColor, style.fillOpacity, style.cornerRadius, color);
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
    const s = stats;
    const entryY = a.y, stopY = b.y, targetY = project({ time: d.points[0].time, price: d.target })?.y;
    if (targetY == null) return null;
    const baseOpacity = live ? .12 : .2;
    rect(left, Math.min(entryY, stopY), right - left, Math.abs(entryY - stopY), palette.loss, baseOpacity, style.cornerRadius, palette.loss);
    rect(left, Math.min(entryY, targetY), right - left, Math.abs(entryY - targetY), palette.profit, baseOpacity, style.cornerRadius, palette.profit);
    const nowY = live ? project({ time: d.points[0].time, price: Math.min(Math.max(stats.current, Math.min(stats.stop, stats.target)), Math.max(stats.stop, stats.target)) })?.y : null;
    if (nowY != null && Math.abs(nowY - entryY) > 1) {
      const activeColor = palette.lossPhase ? palette.loss : palette.profitPhase ? palette.profit : color;
      rect(left, Math.min(entryY, nowY), right - left, Math.abs(entryY - nowY), activeColor, .3, style.cornerRadius, activeColor);
      line(left, nowY, right, nowY, activeColor);
    }
    line(left, entryY, right, entryY, color, 'entry'); line(left, stopY, right, stopY, palette.loss, 'stop');
    line(left, targetY, right, targetY, palette.profit, 'target');
    label(left + 4, entryY - 6, `Entry ${fmt(s.entry)} · RR 1:${s.rr.toFixed(2)}`);
    label(left + 4, stopY + 16, `SL ${fmt(s.stop)} · Risk %${s.riskPercent.toFixed(2)}`, palette.loss);
    label(left + 4, targetY - 6, `TP ${fmt(s.target)} · Kazanç %${s.gainPercent.toFixed(2)}`, palette.profit);
    if (live) label(left + 4, entryY + 16, `Anlık ${fmt(s.current)} · ${s.pl >= 0 ? '+' : ''}${fmt(s.pl)} (${s.plPercent >= 0 ? '+' : ''}${s.plPercent.toFixed(2)}%) · ${s.phase === 'target' ? 'TP' : s.phase === 'stop' ? 'SL' : s.phase === 'profit' ? 'Kâr' : s.phase === 'loss' ? 'Zarar' : 'Entry'}`,
      palette.lossPhase ? palette.loss : palette.profit);
    label(left + 4, Math.min(entryY, targetY) + 16, 'Yalnızca analiz · emir açılmaz', '#a3b0c5');
  }
  if (d.type === 'text') {
    const size = d.fontSize || 14;
    d.text.split('\n').forEach((text, i) => label(a.x, a.y + i * (size + 3), text, color, size));
  }
  if (d.type === 'label') {
    const size = d.fontSize || 14;
    const lines = d.text.split('\n');
    const w = Math.max(...lines.map(t => t.length)) * size * .62 + 12;
    const h = lines.length * (size + 3) + 8;
    rect(a.x - 4, a.y - size - 2, w, h, style.fillColor, .18, style.cornerRadius, color);
    lines.forEach((text, i) => label(a.x + 2, a.y + i * (size + 3), text, color, size));
  }
  if (d.type === 'arrow') {
    line(a.x, a.y, b.x, b.y);
    const ang = Math.atan2(b.y - a.y, b.x - a.x), sz = 10 + d.width * 2;
    const p1 = { x: b.x - sz * Math.cos(ang - .45), y: b.y - sz * Math.sin(ang - .45) };
    const p2 = { x: b.x - sz * Math.cos(ang + .45), y: b.y - sz * Math.sin(ang + .45) };
    append(el('polygon', { points: `${b.x},${b.y} ${p1.x},${p1.y} ${p2.x},${p2.y}`, fill: color, 'pointer-events': 'none' }));
  }
  if (d.type === 'brush') {
    const pts = d.points.map(project).filter(Boolean);
    if (pts.length >= 2) {
      const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ');
      // Wide invisible hit path so freehand strokes can be click-selected and deleted.
      append(el('path', { d: path, fill: 'none', stroke: color, 'stroke-width': Math.max(14, stroke), 'stroke-opacity': 0,
        'stroke-linecap': 'round', 'stroke-linejoin': 'round', class: 'drawing-hit' }));
      append(el('path', { d: path, fill: 'none', stroke: color, 'stroke-width': d.width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'pointer-events': 'none' }));
    }
  }
  if (d.type === 'ruler') {
    rect(left, top, right - left, bottom - top, style.fillColor, .08, style.cornerRadius, color);
    line(a.x, a.y, b.x, b.y);
    const diff = d.points[1].price - d.points[0].price;
    const hours = Math.abs(d.points[1].time - d.points[0].time) / 3600;
    label(left + 5, top - 8, `${diff >= 0 ? '+' : ''}${fmt(diff)} (${(diff / d.points[0].price * 100).toFixed(2)}%) · ${hours.toFixed(2)} saat`);
  }
  if (selected && !d.locked && !draft && showHandles) {
    function handle(x, y, name) {
      append(el('circle', { cx: x, cy: y, r: 6, fill: '#10141c', stroke: '#c3d0ff', 'stroke-width': 2, 'data-handle': name,
        role: 'img', 'aria-label': 'Çizim tutamacı ' + name, class: 'drawing-handle' }));
    }
    if (d.type === 'brush') { handle(a.x, a.y, 'p0'); handle(p[p.length - 1].x, p[p.length - 1].y, 'p' + (p.length - 1)); }
    else p.forEach((point, i) => handle(point.x, point.y, 'p' + i));
    if (['long', 'short'].includes(d.type)) {
      const x = (a.x + b.x) / 2;
      handle(x, a.y, 'entry'); handle(x, b.y, 'stop');
      handle(x, project({ time: d.points[0].time, price: d.target }).y, 'target');
    }
  }
  if (d.locked && selected) label(a.x + 8, a.y - 16, '🔒 Kilitli');
  return g;
}
