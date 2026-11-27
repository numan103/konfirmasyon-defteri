// Indicators belong to the chart's market, not to one candle period. A single
// owner + symbol bundle keeps native studies and overlay states intact when the
// user switches 1H -> 4H, while old per-period layouts are migrated, never wiped.
const MAX_INDICATORS = 24;
const MAX_OVERLAYS = 40;
const REF = /^[A-Z][A-Z0-9_]{1,15}:[A-Z0-9._!\-/]{1,40}$|^[A-Z0-9]{1,24}$/;
const TYPE = /^[a-zA-Z][a-zA-Z0-9]{0,39}$/;
const ID = /^[a-zA-Z][a-zA-Z0-9]{0,39}$/;
const NATIVE_TYPES = new Set(['sma', 'ema', 'wma', 'vwma', 'vwap', 'bollinger', 'supertrend', 'rsi', 'macd',
  'stochastic', 'stochrsi', 'atr', 'adx', 'obv']);
const SOURCES = new Set(['open', 'high', 'low', 'close', 'hl2', 'hlc3', 'ohlc4']);
const ENUMS = {
  source: SOURCES, mode: new Set(['close', 'wick']),
  mitigation: new Set(['wick', 'body', 'half', 'full']),
  market: new Set(['auto', 'spot', 'perp'])
};
const NUMERIC_LIMITS = {
  period: [1, 500], fast: [2, 200], slow: [3, 500], signal: [1, 100], k: [1, 500], d: [1, 100],
  smooth: [1, 100], rsiPeriod: [1, 500], stochPeriod: [1, 500], kSmooth: [1, 100], dSmooth: [1, 100],
  mult: [0.1, 10], dispMin: [0, 1], equalTol: [0, 1], left: [1, 100], right: [1, 100],
  maxProtected: [1, 50], minGap: [0, 1], atrFilter: [0, 10], maxRegions: [1, 50], opacity: [0, 1],
  refresh: [1, 3600]
};
const BOOLEAN_KEYS = new Set(['visible', 'collapsed', 'showSwings', 'showHHHL', 'showBOS', 'showCHoCH', 'showProtected',
  'showBull', 'showBear', 'showIfvg', 'showIFVG', 'showMitigated', 'extend', 'showFvg', 'showMS', 'confirmedOnly']);
const COLOR = /^#[0-9a-f]{3,8}$/i;

function sanitizeParams(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [key, value] of Object.entries(raw).slice(0, 30)) {
    if (!/^[a-zA-Z][a-zA-Z0-9]{0,31}$/.test(key)) continue;
    if (key === 'color') { out.color = COLOR.test(String(value)) ? String(value) : '#2962ff'; continue; }
    if (ENUMS[key]) { if (ENUMS[key].has(String(value))) out[key] = String(value); continue; }
    if (BOOLEAN_KEYS.has(key)) { out[key] = !!value; continue; }
    if (NUMERIC_LIMITS[key]) {
      const number = Number(value);
      if (Number.isFinite(number)) {
        const [min, max] = NUMERIC_LIMITS[key];
        out[key] = Math.min(max, Math.max(min, Math.round(number * 1000) / 1000));
      }
    }
  }
  return out;
}

export function studyBundleKey(owner, ref) {
  const symbol = typeof ref === 'string' && REF.test(ref) ? ref : 'unknown';
  return 'alfa-studies:v1:' + (owner || 'guest') + ':' + symbol;
}
export function normalizeStudyBundle(raw, allowedOverlays = null) {
  const indicators = [];
  const seen = new Set();
  if (Array.isArray(raw?.indicators)) for (const entry of raw.indicators.slice(0, MAX_INDICATORS)) {
    const type = String(entry?.type || '');
    if (!entry || !TYPE.test(type) || !NATIVE_TYPES.has(type) || seen.has(type)) continue;
    seen.add(type);
    indicators.push({ type, params: sanitizeParams(entry.params), visible: entry.visible !== false, collapsed: !!entry.collapsed });
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
