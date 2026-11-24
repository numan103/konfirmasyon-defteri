// Indicators belong to the chart's market, not to one candle period. A single
// owner + symbol bundle keeps native studies and overlay states intact when the
// user switches 1H -> 4H, while old per-period layouts are migrated, never wiped.
const MAX_INDICATORS = 24;
const MAX_OVERLAYS = 40;
const REF = /^[A-Z][A-Z0-9_]{1,15}:[A-Z0-9._!\-/]{1,40}$|^[A-Z0-9]{1,24}$/;
const TYPE = /^[a-zA-Z][a-zA-Z0-9]{0,39}$/;
const ID = /^[a-zA-Z][a-zA-Z0-9]{0,39}$/;

export function studyBundleKey(owner, ref) {
  const symbol = typeof ref === 'string' && REF.test(ref) ? ref : 'unknown';
  return 'alfa-studies:v1:' + (owner || 'guest') + ':' + symbol;
}
export function normalizeStudyBundle(raw, allowedOverlays = null) {
  const indicators = [];
  const seen = new Set();
  if (Array.isArray(raw?.indicators)) for (const entry of raw.indicators.slice(0, MAX_INDICATORS)) {
    if (!entry || !TYPE.test(String(entry.type || '')) || seen.has(entry.type)) continue;
    const params = entry.params && typeof entry.params === 'object' && !Array.isArray(entry.params) ? entry.params : {};
    seen.add(entry.type);
    indicators.push({ type: String(entry.type), params, visible: entry.visible !== false, collapsed: !!entry.collapsed });
  }
  const overlays = {};
  if (raw?.overlays && typeof raw.overlays === 'object' && !Array.isArray(raw.overlays)) {
    for (const [id, value] of Object.entries(raw.overlays).slice(0, MAX_OVERLAYS)) {
      if (!ID.test(id) || !value || typeof value !== 'object' || Array.isArray(value)) continue;
      if (allowedOverlays && !allowedOverlays.has(id)) continue;
      overlays[id] = { added: !!value.added, visible: value.visible !== false, collapsed: !!value.collapsed };
    }
  }
  return { version: 1, indicators, overlays };
}
export function bundleFromLayout(raw, allowedOverlays = null) {
  return normalizeStudyBundle({ indicators: raw?.indicators, overlays: raw?.studies }, allowedOverlays);
}
export function hasStudies(bundle) {
  return !!bundle?.indicators?.length || Object.values(bundle?.overlays || {}).some(s => s.added);
}
export function readStudyBundle(storage, owner, ref, allowedOverlays = null) {
  try {
    const raw = JSON.parse(storage?.getItem(studyBundleKey(owner, ref)) || 'null');
    return raw && typeof raw === 'object' && !Array.isArray(raw)
      ? { found: true, bundle: normalizeStudyBundle(raw, allowedOverlays) }
      : { found: false, bundle: normalizeStudyBundle(null, allowedOverlays) };
  } catch { return { found: false, bundle: normalizeStudyBundle(null, allowedOverlays) }; }
}
export function writeStudyBundle(storage, owner, ref, bundle) {
  try {
    storage?.setItem(studyBundleKey(owner, ref), JSON.stringify(normalizeStudyBundle(bundle)));
    return true;
  } catch { return false; }
}
export function resolveStudyBundle({ current, legacyLayouts = [], defaults = null, allowedOverlays = null }) {
  if (current?.found) return current.bundle;
  for (const layout of legacyLayouts) {
    const migrated = bundleFromLayout(layout, allowedOverlays);
    if (hasStudies(migrated)) return migrated;
  }
  return normalizeStudyBundle(defaults, allowedOverlays);
}
