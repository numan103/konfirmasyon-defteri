// Pure message protocol for multi-chart panes. No DOM or network access here so
// the echo-suppression rules can be unit tested independently of the charts.
export const SYNC_CHANNEL = 'alfa-multichart:sync:v1';

const MESSAGE_TYPES = new Set(['hello', 'state', 'crosshair', 'range', 'symbol', 'interval']);
const MAX_PANE_ID = 1000000;
const MAX_TEXT = 120;
const SYMBOL_RE = /^[A-Z0-9:._+^=-]{1,120}$/;
const INTERVAL_RE = /^[A-Za-z0-9]{1,8}$/;

const isFiniteNumber = value => typeof value === 'number' && Number.isFinite(value);
const isSafeInt = value => Number.isSafeInteger(value);

export function quantize(value, digits = 3) {
  if (!isFiniteNumber(value)) return null;
  const factor = 10 ** Math.max(0, Math.min(6, Math.trunc(digits)));
  const rounded = Math.round(value * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function textOrNull(value, pattern, max = MAX_TEXT) {
  if (typeof value !== 'string' || !value || value.length > max) return null;
  return pattern.test(value) ? value : null;
}

function rangeOrNull(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const from = quantize(value.from), to = quantize(value.to);
  return from == null || to == null ? null : { from, to };
}

function pointOrNull(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (!isSafeInt(value.x) || !isSafeInt(value.y)) return null;
  return { x: value.x, y: value.y };
}

function crosshairOrNull(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (typeof value.visible !== 'boolean') return null;
  if (!value.visible) return { visible: false, time: null, logical: null, point: null };
  const time = isSafeInt(value.time) ? value.time : null;
  const logical = quantize(value.logical);
  if (time == null && logical == null) return null;
  return { visible: true, time, logical, point: pointOrNull(value.point) };
}

// Payloads are whitelisted. A malformed or oversized message never reaches a
// chart, and the normalized shape keeps fingerprints stable across panes.
export function normalizePayload(type, payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  if (type === 'hello') {
    const out = {};
    const symbol = textOrNull(payload.symbol, SYMBOL_RE);
    const interval = textOrNull(payload.interval, INTERVAL_RE, 8);
    if (symbol) out.symbol = symbol;
    if (interval) out.interval = interval;
    return out;
  }
  if (type === 'symbol') {
    const symbol = textOrNull(payload.symbol, SYMBOL_RE);
    return symbol ? { symbol } : null;
  }
  if (type === 'interval') {
    const interval = textOrNull(payload.interval, INTERVAL_RE, 8);
    return interval ? { interval } : null;
  }
  if (type === 'crosshair') return crosshairOrNull(payload);
  if (type === 'range') {
    const logical = rangeOrNull(payload.logical), time = rangeOrNull(payload.time);
    if (!logical && !time) return null;
    return { logical, time };
  }
  if (type === 'state') {
    const out = {};
    const symbol = textOrNull(payload.symbol, SYMBOL_RE);
    const interval = textOrNull(payload.interval, INTERVAL_RE, 8);
    if (symbol) out.symbol = symbol;
    if (interval) out.interval = interval;
    if (payload.range != null) {
      const raw = payload.range;
      const range = (raw.logical !== undefined || raw.time !== undefined)
        ? normalizePayload('range', raw) : rangeOrNull(raw);
      if (!range) return null;
      out.range = range;
    }
    if (payload.crosshair != null) {
      const crosshair = crosshairOrNull(payload.crosshair);
      if (!crosshair) return null;
      out.crosshair = crosshair;
    }
    return out;
  }
  return null;
}

export function makeEnvelope({ session, instance, paneId, seq, type, payload, replyTo = 0 }) {
  return { channel: SYNC_CHANNEL, session, instance, paneId, seq, type, payload, replyTo };
}

export function readEnvelope(data, { origin, expectedOrigin, allowedSources, source, session } = {}) {
  if (!origin || origin !== expectedOrigin) return null;
  if (!allowedSources || typeof allowedSources.has !== 'function' || !allowedSources.has(source)) return null;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  if (data.channel !== SYNC_CHANNEL) return null;
  if (typeof data.session !== 'string' || data.session !== session) return null;
  if (typeof data.instance !== 'string' || !data.instance || data.instance.length > 80) return null;
  if (!isSafeInt(data.paneId) || data.paneId < 0 || data.paneId > MAX_PANE_ID) return null;
  if (!isSafeInt(data.seq) || data.seq < 1) return null;
  if (!isSafeInt(data.replyTo) || data.replyTo < 0) return null;
  if (!MESSAGE_TYPES.has(data.type)) return null;
  const payload = normalizePayload(data.type, data.payload);
  if (!payload) return null;
  return { ...data, payload };
}

function stable(value) {
  if (value == null) return 'null';
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (typeof value === 'number') return isFiniteNumber(value) ? String(quantize(value)) : 'null';
  if (typeof value === 'object') {
    return `{${Object.keys(value).sort().filter(key => value[key] !== undefined)
      .map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function fingerprint(type, payload) { return `${type}:${stable(payload)}`; }

// A crosshair echoed by the chart engine can carry chart-local pixel coordinates.
// Only its semantic anchor is meaningful for echo suppression.
export function echoFingerprint(type, payload) {
  const clean = normalizePayload(type, payload);
  if (!clean) return null;
  if (type === 'crosshair') {
    return fingerprint('crosshair', { visible: clean.visible, time: clean.time, logical: clean.logical });
  }
  return fingerprint(type, clean);
}

export function createEchoLedger({ now = Date.now, windowMs = 1500 } = {}) {
  const entries = new Map();
  const prune = time => {
    for (const [key, expiry] of entries) if (expiry <= time) entries.delete(key);
  };
  return {
    remember(type, payload) {
      const key = echoFingerprint(type, payload);
      if (key) entries.set(key, now() + windowMs);
      return key;
    },
    matches(type, payload) {
      prune(now());
      const key = echoFingerprint(type, payload);
      return !!key && entries.has(key);
    },
    get size() { prune(now()); return entries.size; }
  };
}

export function createMessageGate({ session, instance, paneId, post, now = Date.now,
  dedupeMs = 120, replyWindowMs = 1500 } = {}) {
  if (typeof post !== 'function') throw new TypeError('post callback is required');
  let seq = 0, depth = 0;
  const fingerprints = new Map(), sentSeqs = new Map();
  const prune = time => {
    for (const [key, expiry] of fingerprints) if (expiry <= time) fingerprints.delete(key);
    for (const [key, expiry] of sentSeqs) if (expiry <= time) sentSeqs.delete(key);
  };
  return {
    get applying() { return depth > 0; },
    get seq() { return seq; },
    begin() { depth++; },
    end() { depth = Math.max(0, depth - 1); },
    isReply(message, time = now()) {
      prune(time);
      return !!message && isSafeInt(message.replyTo) && message.replyTo > 0 && sentSeqs.has(message.replyTo);
    },
    send(type, payload, { replyTo = 0, force = false } = {}) {
      if (depth) return null;
      const clean = normalizePayload(type, payload);
      if (!clean) return null;
      const time = now();
      prune(time);
      const key = fingerprint(type, clean);
      if (!force && fingerprints.has(key)) return null;
      fingerprints.set(key, time + dedupeMs);
      const envelope = makeEnvelope({ session, instance, paneId, seq: ++seq, type, payload: clean, replyTo });
      sentSeqs.set(seq, time + replyWindowMs);
      post(envelope);
      return envelope;
    }
  };
}

export function rememberCommand(recent, paneId, type, payload, time = Date.now(), windowMs = 1500) {
  recent.set(`${paneId}:${fingerprint(type, payload)}`, time + windowMs);
}

export function isRecentEcho(message, recent, time = Date.now()) {
  if (!message) return false;
  for (const [key, expiry] of recent) if (expiry <= time) recent.delete(key);
  return recent.has(`${message.paneId}:${fingerprint(message.type, message.payload)}`);
}
