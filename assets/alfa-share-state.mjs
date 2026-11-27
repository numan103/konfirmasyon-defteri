// Shared, browser-safe normalizer for public chart links. Both the page and the
// API use it so a link can only carry an allowlisted chart state.
import { normalizeStudyBundle } from './alfa-study-persistence.mjs';

const REF = /^[A-Z][A-Z0-9_]{1,15}:[A-Z0-9._!\-/]{1,40}$|^[A-Z0-9]{1,24}$/;
const TIMEFRAMES = new Set(['1s', '1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '12h', '1d', '3d', '1w']);
const CHART_TYPES = new Set(['candles', 'bars', 'line', 'area', 'heikin']);
const OVERLAY_IDS = new Set(['volume', 'sessions', 'levels', 'structure', 'fvg', 'mtf', 'oi', 'longShort',
  'cvdSpot', 'cvdPerp', 'marketDelta', 'footprint', 'heatmap']);
const VIEW_KEYS = ['grid', 'axisLabels', 'clean'];
const MAX_SCRIPT = 20000;

function cleanText(value, max, fallback = '') {
  const text = String(value ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
  return text || fallback;
}

function cleanSite(value) {
  const raw = String(value ?? '').replace(/[<>]/g, '').trim();
  if (!raw) return '';
  try {
    if (/:\/\//.test(raw)) return new URL(raw).hostname.slice(0, 120);
  } catch {}
  return cleanText(raw.split(/[/?#]/)[0], 120);
}

function cleanDate(value, now) {
  const raw = String(value ?? '').trim();
  const parsed = raw ? Date.parse(raw) : NaN;
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString().slice(0, 10);
  const fallback = Date.parse(String(now || '')) ? String(now) : new Date().toISOString();
  return fallback.slice(0, 10);
}

function cleanTimestamp(value, now) {
  const raw = String(value ?? '').trim();
  return raw && Number.isFinite(Date.parse(raw)) ? new Date(raw).toISOString() : String(now || new Date().toISOString());
}

export function normalizeChartSnapshot(raw, { now = new Date().toISOString() } = {}) {
  const chart = raw?.chart && typeof raw.chart === 'object' ? raw.chart : raw;
  if (!chart || typeof chart !== 'object' || Array.isArray(chart)) throw new Error('invalid_chart_share');
  const symbol = String(chart.symbol ?? '').trim().toUpperCase();
  if (!REF.test(symbol)) throw new Error('invalid_symbol');
  const interval = TIMEFRAMES.has(String(chart.interval ?? '').toLowerCase()) ? String(chart.interval).toLowerCase() : '1h';
  const chartType = CHART_TYPES.has(String(chart.chartType ?? '')) ? String(chart.chartType) : 'candles';
  const bundle = normalizeStudyBundle({ indicators: chart.indicators, overlays: chart.studies ?? chart.overlays }, OVERLAY_IDS);
  const scripts = [];
  if (Array.isArray(chart.scripts)) for (const entry of chart.scripts.slice(0, 4)) {
    const code = String(entry?.code ?? '');
    if (code.length > MAX_SCRIPT) throw new Error('script_too_large');
    if (!code.trim()) continue;
    scripts.push({
      name: cleanText(entry?.name, 48, 'Özel script'),
      code,
      overlay: entry?.overlay !== false
    });
  }
  const view = {};
  for (const key of VIEW_KEYS) if (typeof chart.view?.[key] === 'boolean') view[key] = chart.view[key];
  return {
    version: 1,
    symbol,
    interval,
    chartType,
    chartName: cleanText(chart.chartName, 80, `${symbol} · ${interval}`),
    sharer: cleanText(chart.sharer, 60, 'Misafir'),
    site: cleanSite(chart.site),
    date: cleanDate(chart.date, now),
    createdAt: cleanTimestamp(chart.createdAt, now),
    indicators: bundle.indicators,
    studies: bundle.overlays,
    scripts,
    view
  };
}
