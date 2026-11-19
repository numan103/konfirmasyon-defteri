// Marketing navigation never grants access; existing page and server guards remain active.
document.querySelectorAll('[data-growth-register]').forEach(button => button.addEventListener('click', () => document.getElementById('hero-register')?.click()));
document.querySelectorAll('[data-growth-page]').forEach(link => link.addEventListener('click', e => {
  if (typeof window.showPage !== 'function' || typeof window.hideLanding !== 'function') return;
  e.preventDefault(); window.hideLanding(); window.showPage(link.dataset.growthPage);
}));
const gate = document.getElementById('auth-gate');
if (gate) {
  let previous = null, opened = false;
  const focusables = () => [...gate.querySelectorAll('button,input,a,select,[tabindex]')].filter(n => !n.disabled && n.tabIndex >= 0 && n.getClientRects().length);
  function sync() {
    const open = gate.classList.contains('open');
    if (open === opened) return;
    opened = open; document.body.classList.toggle('auth-open', open);
    if (open) {
      previous = document.activeElement;
      [...gate.querySelectorAll('input:not([type=checkbox]):not(:disabled)')].find(n => n.getClientRects().length)?.focus({ preventScroll:true });
      if (!gate.contains(document.activeElement)) focusables()[0]?.focus({ preventScroll:true });
    } else if (previous?.isConnected) previous.focus({ preventScroll:true });
  }
  new MutationObserver(sync).observe(gate, {attributes:true,attributeFilter:['class']});
  gate.addEventListener('click', e => { if (e.target === gate) document.getElementById('auth-close')?.click(); });
  gate.addEventListener('keydown', e => {
    if (!opened) return;
    if (e.key === 'Escape') { e.preventDefault(); document.getElementById('auth-close')?.click(); }
    if (e.key === 'Tab') {
      const nodes = focusables(), i = nodes.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); nodes.at(-1)?.focus(); }
      else if (!e.shiftKey && (i < 0 || i === nodes.length - 1)) { e.preventDefault(); nodes[0]?.focus(); }
    }
  });
  sync();
}
