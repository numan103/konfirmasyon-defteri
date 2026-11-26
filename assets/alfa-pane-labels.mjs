// TradingView-style pane captions. Native Lightweight Charts panes expose their
// own HTML element; the caption is injected there so it tracks every resize and
// collapse without a second overlay or coordinate bookkeeping.
const labels = new WeakMap();

function entriesFor(pane) {
  const element = typeof pane?.getHTMLElement === 'function' ? pane.getHTMLElement() : null;
  if (!element || typeof document === 'undefined') return null;
  if (typeof getComputedStyle === 'function' && getComputedStyle(element).position === 'static') element.style.position = 'relative';
  let entries = labels.get(element);
  if (!entries) { entries = new Map(); labels.set(element, entries); }
  return { element, entries };
}

export function setPaneLabel(pane, key, text, color = '') {
  if (!text) return;
  const found = entriesFor(pane);
  if (!found) return;
  let label = found.entries.get(key);
  if (!label) {
    label = document.createElement('div');
    label.className = 'pane-study-label';
    label.setAttribute('aria-hidden', 'true');
    found.element.append(label);
    found.entries.set(key, label);
  }
  label.textContent = String(text);
  if (color) label.style.color = color;
  label.hidden = false;
}

export function clearPaneLabel(pane, key) {
  if (!pane) return;
  const element = typeof pane.getHTMLElement === 'function' ? pane.getHTMLElement() : null;
  const entries = element && labels.get(element);
  if (!entries) return;
  entries.get(key)?.remove();
  entries.delete(key);
}
