// Reusable alarm logic for Alfa Charts. Pure functions stay DOM-free so the
// condition engine can be unit tested; sound playback uses the Web Audio API
// with no audio files or vendor scripts.
export const ALARM_SOUNDS = Object.freeze({
  bip: 'Tek bip', double: 'Çift bip', chime: 'Çan', bell: 'Zil',
  ascending: 'Yükselen', pulse: 'Nabız', none: 'Sessiz'
});
export const ALARM_CONDITIONS = Object.freeze({
  above: 'Fiyat ≥', below: 'Fiyat ≤', crossAbove: 'Yukarı kesiş',
  crossBelow: 'Aşağı kesiş', pctUp: '% yükselme', pctDown: '% düşme'
});
export const ALARM_REPEATS = Object.freeze({ once: 'Bir kez', three: '3 kez', always: 'Her tetikleme' });
export const DEFAULT_ALARM_SETTINGS = Object.freeze({ sound: 'bip', volume: 0.5, repeat: 'once', webhook: '', telegramChat: '' });
const HEX = /^#[0-9a-f]{6}$/i;

export function normalizeAlarmSettings(raw = {}) {
  const out = { ...DEFAULT_ALARM_SETTINGS };
  if (ALARM_SOUNDS[raw.sound]) out.sound = raw.sound;
  if (ALARM_REPEATS[raw.repeat]) out.repeat = raw.repeat;
  if (Number.isFinite(Number(raw.volume))) out.volume = Math.min(1, Math.max(0, Number(raw.volume)));
  if (typeof raw.webhook === 'string' && /^https:\/\/\S{8,500}$/i.test(raw.webhook.trim())) out.webhook = raw.webhook.trim();
  if (typeof raw.telegramChat === 'string' && /^\d{5,15}$/.test(raw.telegramChat.trim())) out.telegramChat = raw.telegramChat.trim();
  return out;
}
export function normalizeAlarm(raw, symbol, currentPrice) {
  const s = normalizeAlarmSettings(raw);
  const cond = ALARM_CONDITIONS[raw?.cond] ? raw.cond : 'above';
  const price = Number(raw?.price);
  const basePrice = Number(raw?.basePrice ?? currentPrice);
  const pct = Number(raw?.pct ?? 1);
  if (!Number.isFinite(price) || price <= 0) throw new Error('Geçersiz alarm fiyatı');
  return {
    id: String(raw?.id || crypto.randomUUID()), symbol, cond, price,
    basePrice: Number.isFinite(basePrice) && basePrice > 0 ? basePrice : price,
    pct: Number.isFinite(pct) ? Math.min(100, Math.max(0.01, pct)) : 1,
    note: String(raw?.note || '').slice(0, 120), ...s,
    enabled: raw?.enabled !== false, triggered: !!raw?.triggered, count: Number(raw?.count) || 0,
    triggeredAt: Number(raw?.triggeredAt) || 0, triggerPrice: Number(raw?.triggerPrice) || 0,
    lastAt: Number(raw?.lastAt) || 0, createdAt: Number(raw?.createdAt) || Date.now()
  };
}
export function alarmLevel(a) {
  return a.cond === 'pctUp' ? a.basePrice * (1 + a.pct / 100)
    : a.cond === 'pctDown' ? a.basePrice * (1 - a.pct / 100) : a.price;
}
export function alarmConditionLabel(a) {
  const level = alarmLevel(a);
  const fmt = n => Number(n).toLocaleString('tr-TR', { maximumFractionDigits: 8 });
  if (a.cond === 'pctUp') return `%+${a.pct} · ≥ ${fmt(level)}`;
  if (a.cond === 'pctDown') return `%-${a.pct} · ≤ ${fmt(level)}`;
  return `${ALARM_CONDITIONS[a.cond] || 'Fiyat'} ${fmt(level)}`;
}
export function shouldFire(a, price, previousPrice, now = Date.now()) {
  if (!a || a.enabled === false) return false;
  if (!Number.isFinite(price) || price <= 0) return false;
  if (a.repeat === 'once' && a.triggered) return false;
  if (a.repeat === 'three' && (a.count || 0) >= 3) return false;
  if (now - (a.lastAt || 0) < 30000) return false;
  const level = alarmLevel(a);
  switch (a.cond) {
    case 'above': return price >= level;
    case 'below': return price <= level;
    case 'crossAbove': return Number.isFinite(previousPrice) && previousPrice < level && price >= level;
    case 'crossBelow': return Number.isFinite(previousPrice) && previousPrice > level && price <= level;
    case 'pctUp': return price >= level;
    case 'pctDown': return price <= level;
    default: return false;
  }
}
// Previous price must be scoped per market. A single global value lets the
// first tick of a newly selected symbol compare against another symbol's
// price, producing false cross alerts.
export function createPriceTracker(limit = 64) {
  const prices = new Map();
  return {
    update(symbol, price) {
      const key = String(symbol || '');
      if (!key || !Number.isFinite(price)) { prices.delete(key); return null; }
      const previous = prices.has(key) ? prices.get(key) : null;
      prices.set(key, price);
      if (prices.size > limit) prices.delete(prices.keys().next().value);
      return previous;
    },
    reset(symbol) {
      if (symbol == null) prices.clear();
      else prices.delete(String(symbol));
    }
  };
}
export function markAlarmFired(a, price, now = Date.now()) {
  a.triggered = true; a.triggerPrice = price; a.triggeredAt = now;
  a.count = (a.count || 0) + 1; a.lastAt = now;
  if (a.repeat === 'always') a.triggered = false;
  return a;
}
export const ALARM_HISTORY_LIMIT = 100;
export function isAlarmMuted(mutedIds, id) {
  return Array.isArray(mutedIds) && mutedIds.includes(String(id));
}
export function muteAlarmIds(mutedIds, id) {
  const list = Array.isArray(mutedIds) ? [...mutedIds] : [];
  const key = String(id);
  if (!list.includes(key)) list.push(key);
  return list;
}
export function unmuteAlarmIds(mutedIds, id) {
  const key = String(id);
  return (Array.isArray(mutedIds) ? mutedIds : []).filter(x => String(x) !== key);
}
export function recordAlarmTrigger(history, entry, limit = ALARM_HISTORY_LIMIT) {
  const list = Array.isArray(history) ? [...history] : [];
  list.unshift(entry);
  if (list.length > limit) list.length = limit;
  return list;
}
export function alarmMessage(a, price, formatPrice = value => String(value)) {
  return `${a.symbol} ${alarmConditionLabel(a)} · şu an ${formatPrice(price)}${a.note ? ' · ' + a.note : ''}`;
}
export function alarmPayload(a, price, message) {
  return { type: 'alfa-charts-alarm', symbol: a.symbol, condition: a.cond, level: alarmLevel(a), price, note: a.note || '', message, at: new Date().toISOString() };
}
const SOUND_PATTERNS = Object.freeze({
  bip: [[880, 0, .12]],
  double: [[880, 0, .09], [880, .16, .09]],
  chime: [[1046, 0, .28], [1318, .09, .3]],
  bell: [[660, 0, .45], [990, .02, .4]],
  ascending: [[523, 0, .11], [659, .12, .11], [784, .24, .11], [1046, .36, .2]],
  pulse: [[440, 0, .07], [440, .14, .07], [440, .28, .07]]
});
export function soundDuration(kind) {
  const notes = SOUND_PATTERNS[kind] || SOUND_PATTERNS.bip;
  return notes.length ? Math.max(...notes.map(([f, at, len]) => at + len)) * 1000 : 0;
}
// Returns the playback duration in ms. A missing/incompatible Web Audio
// context is silently ignored so alarms never break the chart.
export function playAlarmSound(kind, volume = .5, AudioContextClass) {
  if (!ALARM_SOUNDS[kind] || kind === 'none') return 0;
  const Ctor = AudioContextClass || globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Ctor) return 0;
  try {
    const ctx = new Ctor();
    const gainMax = Math.min(.18, Math.max(0, Number(volume) || 0) * .18);
    for (const [frequency, offset, length] of SOUND_PATTERNS[kind]) {
      const start = ctx.currentTime + offset, stop = start + length;
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = 'sine'; osc.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(gainMax, start + Math.min(.03, length / 3));
      gain.gain.exponentialRampToValueAtTime(0.0001, stop);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(start); osc.stop(stop);
    }
    const duration = soundDuration(kind);
    setTimeout(() => { try { ctx.close(); } catch {} }, duration + 120);
    return duration;
  } catch { return 0; }
}
export async function postAlarmWebhook(url, payload, fetcher = fetch) {
  if (!/^https:\/\/\S{8,500}$/i.test(String(url || ''))) throw new Error('bad_webhook');
  const response = await fetcher(String(url), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload), cache: 'no-store', signal: AbortSignal.timeout(6000)
  });
  if (!response?.ok) throw new Error(`webhook_${response?.status || 'error'}`);
  return true;
}
