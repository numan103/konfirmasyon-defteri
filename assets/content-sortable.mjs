// Shared by topic and subtitle maps. Handles support mouse, touch, pen and arrows.
export function moveItem(list, id, targetId, after = false) {
  if (id === targetId) return false;
  const from = list.findIndex(x => x.id === id), to = list.findIndex(x => x.id === targetId);
  if (from < 0 || to < 0) return false;
  const destination = to + (after ? 1 : 0) - (from < to ? 1 : 0);
  if (destination === from) return false;
  const [item] = list.splice(from, 1); list.splice(destination, 0, item);
  return true;
}
export function bindSortable(handle, { list, item, node, selector, axis = 'vertical', onChange, announce }) {
  let drag = null;
  handle.style.touchAction = 'none';
  handle.title = 'Tut ve sürükle. Klavyede ok tuşlarıyla sırala.';
  function clean() {
    if (!drag) return;
    drag.ghost?.remove();
    drag.target?.classList.remove('ic-drop-before', 'ic-drop-after');
    node.classList.remove('ic-sort-source');
    document.body.classList.remove('ic-sort-active');
    handle.setAttribute('aria-pressed', 'false');
    drag = null;
  }
  handle.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); });
  handle.addEventListener('keydown', e => {
    e.stopPropagation();
    const delta = ['ArrowUp', 'ArrowLeft'].includes(e.key) ? -1 : ['ArrowDown', 'ArrowRight'].includes(e.key) ? 1 : 0;
    if (!delta || handle.disabled || drag) return;
    e.preventDefault();
    const i = list.indexOf(item), neighbor = list[i + delta];
    if (!neighbor) return;
    if (moveItem(list, item.id, neighbor.id, delta > 0)) onChange(item.id);
  });
  handle.addEventListener('pointerdown', e => {
    if (e.button !== 0 || handle.disabled || drag) return;
    e.preventDefault(); e.stopPropagation(); handle.focus({ preventScroll:true });
    drag = { id:e.pointerId, x:e.clientX, y:e.clientY, target:null, after:false, ghost:null };
    try { handle.setPointerCapture(e.pointerId); } catch { /* synthetic pointer tests */ }
  });
  handle.addEventListener('pointermove', e => {
    if (!drag || drag.id !== e.pointerId) return;
    e.preventDefault(); e.stopPropagation();
    if (!drag.ghost && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
    if (!drag.ghost) {
      drag.ghost = document.createElement('div'); drag.ghost.className = 'ic-sort-ghost'; drag.ghost.textContent = '⠿ ' + item.title;
      document.body.append(drag.ghost); node.classList.add('ic-sort-source'); document.body.classList.add('ic-sort-active');
      handle.setAttribute('aria-pressed', 'true'); announce?.('“' + item.title + '” taşınıyor. İstediğin kartın önüne veya arkasına bırak.');
    }
    drag.ghost.style.left = Math.max(8, Math.min(e.clientX + 14, window.innerWidth - 288)) + 'px';
    drag.ghost.style.top = e.clientY + 14 + 'px';
    drag.target?.classList.remove('ic-drop-before', 'ic-drop-after');
    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest(selector);
    drag.target = target && target !== node && target.parentElement === node.parentElement ? target : null;
    if (drag.target) {
      const r = drag.target.getBoundingClientRect();
      drag.after = axis === 'grid'
        ? e.clientY > r.bottom - r.height * .25 || (e.clientY >= r.top + r.height * .25 && e.clientX > r.left + r.width / 2)
        : e.clientY > r.top + r.height / 2;
      drag.target.classList.add(drag.after ? 'ic-drop-after' : 'ic-drop-before');
    }
    if (e.clientY > window.innerHeight - 60) window.scrollBy(0, 18);
    else if (e.clientY < 60) window.scrollBy(0, -18);
  });
  handle.addEventListener('pointerup', e => {
    if (!drag || drag.id !== e.pointerId) return;
    const target = drag.target?.dataset.sortId, after = drag.after, started = !!drag.ghost, connected = node.isConnected;
    clean();
    try { handle.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    if (started && connected && target && moveItem(list, item.id, target, after)) onChange(item.id);
    else if (started) announce?.('Sıralama değiştirilmedi.');
  });
  handle.addEventListener('pointercancel', clean);
  handle.addEventListener('lostpointercapture', clean);
  handle.addEventListener('keydown', e => { if (e.key === 'Escape' && drag) { e.preventDefault(); clean(); announce?.('Taşıma iptal edildi.'); } });
}
