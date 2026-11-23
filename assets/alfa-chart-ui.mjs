// Shared, dependency-free UI primitives for the chart workspace.
const paths = {
  cursor: '<path d="m5 3 14 10-7 1-3 7z"/>',
  trend: '<path d="m4 19 16-14"/><circle cx="4" cy="19" r="2"/><circle cx="20" cy="5" r="2"/>',
  horizontal: '<path d="M3 12h18"/><circle cx="9" cy="12" r="2"/>',
  vertical: '<path d="M12 3v18"/><circle cx="12" cy="9" r="2"/>',
  ray: '<path d="m3 20 17-17m-7 0h7v7"/><circle cx="3" cy="20" r="2"/>',
  rectangle: '<rect x="4" y="5" width="16" height="14" rx="1"/>',
  fibonacci: '<path d="M4 4h16M4 10h12M4 14h16M4 20h10"/><path d="m5 20 14-16" opacity=".4"/>',
  brush: '<path d="m14 5 5-2 2 2-8 9-3-3zM10 12c-7-1-3 7-7 8 8 2 11-3 7-8z"/>',
  text: '<path d="M4 5h16M12 5v15M8 20h8M4 5v3m16-3v3"/>',
  label: '<path d="M20 4H4v12h5l3 5 3-5h5z"/><path d="M8 8h8m-8 4h5"/>',
  arrow: '<path d="M4 20 20 4m-9 0h9v9"/>',
  long: '<path d="M4 19h16M4 12h16M4 4h16"/><path d="m9 9 3-3 3 3m-3-3v9"/>',
  short: '<path d="M4 19h16M4 12h16M4 4h16"/><path d="m9 15 3 3 3-3m-3 3V9"/>',
  ruler: '<path d="m3 16 13-13 5 5L8 21zM8 11l3 3m0-6 2 2m1-5 3 3"/>',
  delete: '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 10v7m4-7v7"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z"/>',
  indicators: '<path d="M4 19V5m0 14h16M7 14l4-5 4 3 5-7"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  lab: '<path d="M9 3h6m-5 0v6l-6 10a1 1 0 0 0 1 2h14a1 1 0 0 0 1-2L14 9V3M7 15h10"/>',
  replay: '<path d="M4 8V3m0 5h5M4 8a9 9 0 1 1-1 9"/><path d="m10 8 6 4-6 4z"/>',
  layers: '<path d="m12 3 10 5-10 5L2 8zM2 12l10 5 10-5M2 16l10 5 10-5"/>',
  settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="16" cy="17" r="3"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="m3 3 18 18M10 5h2c6 0 10 7 10 7a22 22 0 0 1-4 4M6 6a22 22 0 0 0-4 6s4 7 10 7a13 13 0 0 0 5-1"/>',
  magnet: '<path d="M5 3v10a7 7 0 0 0 14 0V3h-5v10a2 2 0 0 1-4 0V3zM5 8h5m4 0h5"/>',
  camera: '<path d="M8 5 9 3h6l1 2h5v15H3V5z"/><circle cx="12" cy="12" r="4"/>',
  fullscreen: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  list: '<path d="M9 5h12M9 12h12M9 19h12M3 5h1M3 12h1M3 19h1"/>',
  undo: '<path d="m8 4-5 5 5 5M3 9h10a7 7 0 0 1 0 14"/>',
  redo: '<path d="m16 4 5 5-5 5m5-5H11a7 7 0 0 0 0 14"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chevron: '<path d="m8 5 7 7-7 7"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  fit: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M8 12h8m-4-4v8"/>',
  live: '<path d="m9 5 7 7-7 7M20 4v16"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  grip: '<circle cx="9" cy="5" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="19" r="1"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
  unlock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 7-3m-3 11v2"/>',
  folder: '<path d="M3 6h6l2 3h10v11H3z"/>',
  front: '<rect x="3" y="3" width="12" height="12" rx="1"/><path d="M18 9h3v12H9v-3"/>',
  back: '<rect x="9" y="9" width="12" height="12" rx="1"/><path d="M6 15H3V3h12v3"/>',
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/>',
  download: '<path d="M12 3v13m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  link: '<path d="m9 15 6-6m-5-3 2-2a5 5 0 0 1 7 7l-2 2m-3 5-2 2a5 5 0 0 1-7-7l2-2"/>',
  edit: '<path d="m4 16 12-12 4 4L8 20H4zM14 6l4 4"/>',
};
export function icon(name, cls = '') {
  return `<svg class="ui-icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.indicators}</svg>`;
}
export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); });
}
export function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
export function chartDialog(html, className = '') {
  const previous = document.activeElement;
  const dialog = document.createElement('dialog');
  dialog.className = `chart-dialog ${className}`;
  dialog.setAttribute('aria-label', 'Grafik ayarları');
  const box = document.createElement('div');
  box.className = 'dialog-content';
  box.innerHTML = html;
  dialog.append(box);
  (document.fullscreenElement || document.body).append(dialog);
  const close = () => dialog.close();
  dialog.addEventListener('close', () => {
    dialog.remove();
    const target = previous?.getClientRects().length ? previous : previous?.closest('details')?.querySelector('summary');
    if (target?.isConnected) target.focus({ preventScroll: true });
  }, { once: true });
  dialog.addEventListener('click', e => {
    if (e.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close();
  });
  dialog.showModal();
  return { overlay: dialog, box, close };
}
