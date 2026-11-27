// TradingView-style pane captions. Native Lightweight Charts panes expose their
// own HTML element; the caption is injected there so it tracks every resize and
// collapse without a second overlay or coordinate bookkeeping.
const labels = new WeakMap();
const pending = new WeakMap();
const locations = new WeakMap();

function entriesFor(pane) {
  const element = typeof pane?.getHTMLElement === 'function' ? pane.getHTMLElement() : null;
  if (!element || typeof document === 'undefined') return null;
  if (typeof getComputedStyle === 'function' && getComputedStyle(element).position === 'static') element.style.position = 'relative';
  let entries = labels.get(element);
  if (!entries) { entries = new Map(); labels.set(element, entries); }
  return { element, entries };
}

export function setPaneLabel(pane, key, text, color = '', attempt = 0) {
  if (!text) return;
  const found = entriesFor(pane);
  if (!found) {
    // addSeries creates the pane API before its DOM row exists. Wait for native
    // layout rather than silently dropping all but the last refreshed caption.
    if (!pane || typeof requestAnimationFrame !== 'function' || attempt >= 8) return;
    let jobs = pending.get(pane);
    if (!jobs) { jobs = new Map(); pending.set(pane, jobs); }
    if (jobs.has(key)) cancelAnimationFrame(jobs.get(key));
    jobs.set(key, requestAnimationFrame(() => {
      jobs.delete(key);
      setPaneLabel(pane, key, text, color, attempt + 1);
    }));
    return;
  }
  let places = locations.get(pane);
  if (!places) { places = new Map(); locations.set(pane, places); }
  const previous = places.get(key);
  if (previous && previous !== found.element) {
    const oldEntries = labels.get(previous);
    oldEntries?.get(key)?.remove();
    oldEntries?.delete(key);
  }
  places.set(key, found.element);
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
  // Native DOM rows are reused while several panes are removed/added in one
  // update. Rebind after layout settles, not only when the first row appears.
  if (attempt < 8 && typeof requestAnimationFrame === 'function') {
    let jobs = pending.get(pane);
    if (!jobs) { jobs = new Map(); pending.set(pane, jobs); }
    if (jobs.has(key)) cancelAnimationFrame(jobs.get(key));
    jobs.set(key, requestAnimationFrame(() => {
      jobs.delete(key);
      setPaneLabel(pane, key, text, color, attempt + 1);
    }));
  }
}

export function clearPaneLabel(pane, key) {
  if (!pane) return;
  const jobs = pending.get(pane);
  if (jobs?.has(key)) { cancelAnimationFrame(jobs.get(key)); jobs.delete(key); }
  const places = locations.get(pane), previous = places?.get(key);
  if (previous) {
    labels.get(previous)?.get(key)?.remove();
    labels.get(previous)?.delete(key);
    places.delete(key);
  }
  const element = typeof pane.getHTMLElement === 'function' ? pane.getHTMLElement() : null;
  const entries = element && labels.get(element);
  if (!entries) return;
  entries.get(key)?.remove();
  entries.delete(key);
}
