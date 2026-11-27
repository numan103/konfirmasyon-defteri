import { icon } from './alfa-chart-ui.mjs?v=5';
const $ = id => document.getElementById(id);
export class ObjectTree {
  constructor(engine, names) {
    this.engine = engine; this.names = names; this.collapsed = new Set(); this.abort = new AbortController();
    $('drawing-search').addEventListener('input', () => this.render(), { signal: this.abort.signal });
    const actions = { 'tree-select-all': () => engine.selectAll(), 'tree-group': () => engine.groupSelection(),
      'tree-ungroup': () => engine.action('ungroup'), 'tree-front': () => engine.action('front'), 'tree-back': () => engine.action('back'),
      'tree-remove': () => engine.action('remove') };
    for (const [id, fn] of Object.entries(actions)) $(id).addEventListener('click', fn, { signal: this.abort.signal });
    this.render();
  }
  button(glyph, label, action, disabled = false) {
    const b = document.createElement('button'); b.type = 'button'; b.innerHTML = icon(glyph); b.title = label;
    b.setAttribute('aria-label', label); b.dataset.objectAction = action; b.disabled = disabled;
    return b;
  }
  select(id, event, ordered) {
    const e = this.engine;
    e.cancel();
    if (event.shiftKey && e.selected) {
      const from = ordered.indexOf(e.selected), to = ordered.indexOf(id);
      const ids = from >= 0 ? ordered.slice(Math.min(from, to), Math.max(from, to) + 1) : [id];
      e.selectObjects(ids, { toggle: event.ctrlKey || event.metaKey });
    } else e.selectObjects([id], { toggle: event.ctrlKey || event.metaKey });
  }
  row(drawing, level, ordered) {
    const e = this.engine, row = document.createElement('div'); row.className = 'object-tree-row' + (drawing.hidden ? ' object-hidden' : '');
    row.dataset.objectId = drawing.id; row.setAttribute('role', 'treeitem'); row.tabIndex = 0;
    row.setAttribute('aria-selected', String(e.selection.has(drawing.id))); row.setAttribute('aria-level', level);
    row.setAttribute('aria-label', (drawing.name || this.names[drawing.type]) + (drawing.hidden ? ' · gizli' : '') + (drawing.locked ? ' · kilitli' : ''));
    const name = document.createElement('button'); name.type = 'button'; name.className = 'object-label'; name.dataset.objectAction = 'select';
    name.innerHTML = icon(drawing.type);
    const text = document.createElement('span'); text.textContent = drawing.name || this.names[drawing.type]; name.append(text);
    name.title = 'Ctrl: çoklu seç · Shift: aralık · çift tık: adlandır';
    name.onclick = event => { event.stopPropagation(); this.select(drawing.id, event, ordered); };
    name.ondblclick = event => { event.stopPropagation(); e.rename(drawing.id); };
    row.append(name);
    for (const [action, glyph, label] of [['hide', drawing.hidden ? 'eyeOff' : 'eye', 'Göster/gizle'], ['lock', drawing.locked ? 'lock' : 'unlock', 'Kilitle/aç'], ['remove', 'delete', 'Sil']]) {
      const b = this.button(glyph, `${drawing.name || this.names[drawing.type]} · ${label}`, action, action === 'remove' && drawing.locked);
      b.onclick = event => { event.stopPropagation(); e.action(action, [drawing.id]); };
      row.append(b);
    }
    row.onclick = event => this.select(drawing.id, event, ordered);
    row.onkeydown = event => {
      if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
        event.preventDefault(); event.stopPropagation();
        const visible = [...$('drawing-objects').querySelectorAll('[data-object-id]')].filter(n => n.offsetParent);
        const idx = visible.indexOf(row), next = event.key === 'Home' ? 0 : event.key === 'End' ? visible.length - 1 : idx + (event.key === 'ArrowDown' ? 1 : -1);
        visible[Math.max(0, Math.min(visible.length - 1, next))]?.focus();
      } else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.select(drawing.id, event, ordered); }
      else if (event.key === 'F2') { event.preventDefault(); e.rename(drawing.id); }
    };
    return row;
  }
  render() {
    const e = this.engine, list = $('drawing-objects'), scroll = list.scrollTop;
    const focused = document.activeElement?.closest('[data-object-id]'), focusId = focused?.dataset.objectId, focusAction = document.activeElement?.dataset.objectAction;
    const q = $('drawing-search').value.trim().toLocaleLowerCase('tr-TR');
    const drawings = [...e.history.doc.drawings].reverse().filter(d => `${d.name || ''} ${this.names[d.type]} ${d.type} ${d.group || ''}`.toLocaleLowerCase('tr-TR').includes(q));
    const ordered = drawings.map(d => d.id), fragment = document.createDocumentFragment(), placed = new Set();
    for (const d of drawings) {
      if (!d.group) { fragment.append(this.row(d, '1', ordered)); continue; }
      if (placed.has(d.group)) continue;
      placed.add(d.group);
      const members = drawings.filter(x => x.group === d.group), folder = document.createElement('div');
      folder.className = 'object-folder';
      const head = document.createElement('div'); head.className = 'object-folder-head'; head.setAttribute('role', 'treeitem');
      head.setAttribute('aria-expanded', String(!this.collapsed.has(d.group)));
      head.setAttribute('aria-selected', String(members.every(x => e.selection.has(x.id))));
      const collapse = this.button('down', d.group + ' aç/kapat', 'collapse');
      collapse.className = this.collapsed.has(d.group) ? 'folder-collapsed' : '';
      collapse.onclick = () => { this.collapsed.has(d.group) ? this.collapsed.delete(d.group) : this.collapsed.add(d.group); this.render(); };
      const label = document.createElement('button'); label.type = 'button'; label.className = 'object-folder-label'; label.innerHTML = icon('folder');
      const text = document.createElement('span'); text.textContent = d.group + ` (${members.length})`; label.append(text);
      label.onclick = event => { e.cancel(); e.selectObjects(members.map(x => x.id), { toggle: event.ctrlKey || event.metaKey }); };
      head.append(collapse, label); folder.append(head);
      const children = document.createElement('div'); children.setAttribute('role', 'group'); children.hidden = this.collapsed.has(d.group);
      for (const member of members) children.append(this.row(member, '2', ordered));
      folder.append(children); fragment.append(folder);
    }
    list.replaceChildren(fragment); list.scrollTop = scroll;
    $('drawing-tree-count').textContent = e.history.doc.drawings.length;
    const selected = e.history.doc.drawings.filter(d => e.selection.has(d.id)), locked = selected.filter(d => d.locked).length;
    $('tree-selection-status').textContent = selected.length ? `${selected.length} seçili${locked ? ` · ${locked} kilitli` : ''}` : 'Ctrl+tık: çoklu seç · üstteki nesne önde';
    for (const id of ['tree-group', 'tree-ungroup', 'tree-front', 'tree-back', 'tree-remove']) $(id).disabled = !e.ready || !selected.length || selected.every(d => d.locked);
    $('tree-select-all').disabled = !e.ready || !e.history.doc.drawings.length;
    if (focusId && focused && !focused.isConnected) {
      const target = [...list.querySelectorAll('[data-object-id]')].find(n => n.dataset.objectId === focusId);
      (target?.querySelector(`[data-object-action="${focusAction || 'select'}"]`) || target)?.focus({ preventScroll: true });
    }
    this.renderStudies();
  }
  renderStudies() {
    const manager = this.engine.getStudies?.(), root = $('drawing-studies');
    root.replaceChildren();
    const active = manager?.active() || [];
    $('tree-study-count').textContent = active.length;
    for (const study of active) {
      const row = document.createElement('div'); row.className = 'object-tree-row study-tree-row';
      const label = document.createElement('span'); label.className = 'object-label'; label.textContent = study.name; row.append(label);
      for (const [action, glyph, title] of [['eye', study.visible ? 'eye' : 'eyeOff', 'Göster/gizle'], ['settings', 'settings', 'Ayarlar'], ['remove', 'close', 'Kaldır']]) {
        if (study.id === 'volume' && action === 'settings') continue;
        const b = this.button(glyph, study.name + ' · ' + title, action);
        b.onclick = () => { action === 'eye' ? manager.toggle(study.id) : action === 'remove' ? manager.remove(study.id) : manager.openSettings(study.id); this.renderStudies(); };
        row.append(b);
      }
      root.append(row);
    }
  }
  dispose() { this.abort.abort(); }
}
