// Seviyeli işlem planlarını ayrıştırır ve yön/stop/hedef tutarlılığını denetler.
// Amaç: "BEARISH" yazıp stop'u girişin altına, hedefi üstüne koyan ters planların
// Telegram'a çıkmasını engellemek. Saf fonksiyonlar; ağ erişimi yok.

const FOLD = [
  [/[İIı]/g, 'i'], [/[Şş]/g, 's'], [/[Ğğ]/g, 'g'],
  [/[Üü]/g, 'u'], [/[Öö]/g, 'o'], [/[Çç]/g, 'c'],
];
export function fold(text) {
  let s = String(text || '');
  for (const [re, ch] of FOLD) s = s.replace(re, ch);
  return s;
}

// "73 970", "73.970", "73,970", "$76.400", "0,065" gibi yazımları sayıya çevirir.
export function parseNumber(raw) {
  let s = String(raw || '').replace(/\u00a0/g, ' ').replace(/[^\d.,\-\s]/g, '').trim();
  if (!s) return null;
  s = s.replace(/\s+/g, '');
  const neg = s.startsWith('-');
  s = s.replace(/-/g, '');
  if (!s) return null;
  const dots = (s.match(/\./g) || []).length;
  const commas = (s.match(/,/g) || []).length;
  const smallDecimal = /^0[.,]\d+$/.test(s);
  if (dots && commas) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (dots === 1 && !smallDecimal && /^\d{1,3}\.\d{3}$/.test(s)) {
    s = s.replace('.', '');
  } else if (dots > 1) {
    s = s.replace(/\./g, '');
  } else if (commas === 1 && !smallDecimal && /^\d{1,3},\d{3}$/.test(s)) {
    s = s.replace(',', '');
  } else if (commas > 1) {
    s = s.replace(/,/g, '');
  } else if (commas === 1) {
    s = s.replace(',', '.');
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}

const FIELD = {
  entry: /(?:^|\n)\s*[-*•]?\s*\**\s*(?:giris|entry)\s*\**\s*[:：]\s*\**\s*([^\n]+)/i,
  stop: /(?:^|\n)\s*[-*•]?\s*\**\s*(?:stop(?:\s*loss)?|sl|zarar\s*durdur)\s*\**\s*[:：]\s*\**\s*([^\n]+)/i,
  target: /(?:^|\n)\s*[-*•]?\s*\**\s*(?:hedef|target|tp)\s*\**\s*[:：]\s*\**\s*([^\n]+)/i,
  direction: /(?:^|\n)\s*[-*•]?\s*\**\s*(?:yon|yön|bias|verdict)\s*\**\s*[:：]\s*\**\s*([^\n]+)/i,
  verdict: /(?:^|\n)\s*[-*•]?\s*\**\s*verdict\s*\**\s*[:：]\s*\**\s*([^\n]+)/i,
  strategy: /(?:^|\n)\s*[-*•]?\s*\**\s*(?:strateji|strategy)\s*\**\s*[:：]\s*\**\s*([^\n]+)/i,
};

function directionOf(value) {
  const v = fold(value).toUpperCase();
  if (/BULL|LONG|\bAL\b|YUKSEL/.test(v)) return 'LONG';
  if (/BEAR|SHORT|\bSAT\b|DUSUS/.test(v)) return 'SHORT';
  if (/NOTR|NEUTRAL|KARARSIZ/.test(v)) return 'NEUTRAL';
  return null;
}

function firstNumber(text) {
  const m = String(text || '').match(/-?\d[\d.,\s]*/);
  return m ? parseNumber(m[0]) : null;
}

export function parsePlan(text) {
  const t = fold(text);
  const grab = re => { const m = t.match(re); return m ? m[1].trim() : null; };
  const entryRaw = grab(FIELD.entry);
  const stopRaw = grab(FIELD.stop);
  const targetRaw = grab(FIELD.target);
  const dirRaw = grab(FIELD.direction);
  const verdictRaw = grab(FIELD.verdict);
  const strategyRaw = grab(FIELD.strategy);
  const plan = {
    entry: entryRaw == null ? null : firstNumber(entryRaw),
    stop: stopRaw == null ? null : firstNumber(stopRaw),
    target: targetRaw == null ? null : firstNumber(targetRaw),
    direction: dirRaw == null ? null : directionOf(dirRaw),
    verdict: verdictRaw == null ? null : directionOf(verdictRaw),
    strategy: strategyRaw == null ? null : strategyRaw.trim(),
  };
  plan.hasPlan = [plan.entry, plan.stop, plan.target].filter(v => v != null).length >= 2;
  return plan;
}

export const PLAN_ENTRY_TOLERANCE = 0.05;   // giriş canlı fiyatın ±%5'i içinde
export const PLAN_STOP_MAX = 0.08;          // stop fiyatın %8'inden uzak olamaz
export const PLAN_TARGET_MAX = 0.30;        // hedef fiyatın %30'undan uzak olamaz
export const PLAN_MIN_RR = 1;               // en az 1R
export const PLAN_MIN_STOP_ATR = 1;         // stop en az 1×ATR uzakta (seçilen zaman dilimi)

export function validatePlan(plan, ref = {}) {
  if (!plan || !plan.hasPlan) return { ok: true, errors: [], plan };
  const errors = [];
  const dir = plan.direction;
  const { entry, stop, target } = plan;
  if (entry == null || stop == null || target == null) errors.push('missing_levels');
  if (dir !== 'LONG' && dir !== 'SHORT') errors.push('direction_unknown');
  if (plan.verdict && dir && plan.verdict !== dir) errors.push('direction_conflict');
  if (ref.requireStrategy && (!plan.strategy || /^(yok|none|-)$/i.test(String(plan.strategy).trim()))) errors.push('strategy_missing');
  if (errors.length) return { ok: false, errors, plan };

  if (dir === 'LONG') {
    if (!(stop < entry)) errors.push('long_stop_not_below_entry');
    if (!(target > entry)) errors.push('long_target_not_above_entry');
  } else {
    if (!(stop > entry)) errors.push('short_stop_not_above_entry');
    if (!(target < entry)) errors.push('short_target_not_below_entry');
  }
  const risk = Math.abs(entry - stop);
  const reward = Math.abs(target - entry);
  if (!(risk > 0)) errors.push('zero_risk');
  else if (reward / risk < PLAN_MIN_RR) errors.push('rr_below_1');

  const price = Number(ref.price);
  if (price > 0) {
    if (Math.abs(entry / price - 1) > PLAN_ENTRY_TOLERANCE) errors.push('entry_far_from_market');
    if (risk / price > PLAN_STOP_MAX) errors.push('stop_too_wide');
    if (reward / price > PLAN_TARGET_MAX) errors.push('target_too_far');
  }
  const atr = Number(ref.atr);
  if (atr > 0 && risk > 0 && risk < atr * PLAN_MIN_STOP_ATR) errors.push('stop_inside_noise');
  return { ok: errors.length === 0, errors, plan };
}

const ERROR_TEXT = {
  missing_levels: 'Giriş, Stop ve Hedef üçü de sayı olarak yazılmalı',
  direction_unknown: 'Yön BULLISH veya BEARISH olarak net yazılmalı',
  direction_conflict: 'Yön ile son Verdict aynı olmalı',
  strategy_missing: 'Strateji satırı zorunlu (CVD Momentum / 0.382 / IFVG)',
  long_stop_not_below_entry: 'LONG planda stop girişin ALTINDA olmalı',
  long_target_not_above_entry: 'LONG planda hedef girişin ÜSTÜNDE olmalı',
  short_stop_not_above_entry: 'SHORT planda stop girişin ÜSTÜNDE olmalı',
  short_target_not_below_entry: 'SHORT planda hedef girişin ALTINDA olmalı',
  zero_risk: 'Stop ile giriş aynı olamaz',
  rr_below_1: 'Ödül/risk oranı en az 1 olmalı',
  entry_far_from_market: 'Giriş canlı fiyatın ±%5 aralığında olmalı',
  stop_inside_noise: 'Stop en az 1×ATR uzakta ve yapısal geçersizliğin dışında olmalı',
  stop_too_wide: 'Stop fiyatın %8’inden daha uzak olamaz',
  target_too_far: 'Hedef fiyatın %30’undan daha uzak olamaz',
};

export function describePlanErrors(errors) {
  return (errors || []).map(e => ERROR_TEXT[e] || e).join('; ');
}

// Seviye satırlarını metinden çıkarır; geriye gerekçe/verdict kalır.
export function stripPlanLines(text) {
  return String(text || '')
    .split('\n')
    .filter(line => !/(?:giris|entry|stop(?:\s*loss)?|\bsl\b|hedef|target|\btp\b|strateji|strategy|r\s*\/\s*r|kar[sş]i\s*senaryo)\s*\**\s*[:：]/i.test(fold(line)))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
