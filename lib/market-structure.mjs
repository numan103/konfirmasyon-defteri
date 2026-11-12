// Piyasa yapısı: swing/pivot, Fibonacci geri çekilme, FVG/IFVG ve seans penceresi.
// Saf fonksiyonlar; ağ erişimi yok. Telegram Q&A bağlamını besler.

// start = itkinin başlangıcı, end = itkinin sonu.
// Yükseliş itkisinde start=dip end=tepe; düşüş itkisinde start=tepe end=dip.
export function fibLevel(start, end, ratio) {
  const s = Number(start), e = Number(end), r = Number(ratio);
  if (!(s > 0) || !(e > 0) || !(r >= 0 && r <= 1)) return null;
  return e - (e - s) * r;
}

export function fibSet(start, end) {
  const mk = r => fibLevel(start, end, r);
  return {
    direction: Number(end) >= Number(start) ? 'up' : 'down',
    r382: mk(0.382),
    r5: mk(0.5),
    r618: mk(0.618),
    r805: mk(0.805),
  };
}

// Sol/sağ komşularından daha yüksek/düşük mumları pivot sayar.
export function pivots(candles, { left = 2, right = 2 } = {}) {
  const highs = [], lows = [];
  if (!Array.isArray(candles)) return { highs, lows };
  for (let i = left; i < candles.length - right; i++) {
    const c = candles[i];
    let isHigh = true, isLow = true;
    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;
      if (candles[j].h >= c.h) isHigh = false;
      if (candles[j].l <= c.l) isLow = false;
    }
    if (isHigh) highs.push({ i, price: c.h });
    if (isLow) lows.push({ i, price: c.l });
  }
  return { highs, lows };
}

// Son pivot çiftinden itki yönü ve başlangıç/bitiş seviyeleri.
export function lastImpulse(candles, opts = {}) {
  const { highs, lows } = pivots(candles, opts);
  const events = [
    ...highs.map(p => ({ ...p, type: 'high' })),
    ...lows.map(p => ({ ...p, type: 'low' })),
  ].sort((a, b) => a.i - b.i);
  if (events.length < 2) return null;
  const last = events[events.length - 1];
  let opposite = null;
  for (let i = events.length - 2; i >= 0; i--) {
    if (events[i].type !== last.type) { opposite = events[i]; break; }
  }
  if (!opposite) return null;
  return {
    start: opposite.price,
    end: last.price,
    startIndex: opposite.i,
    endIndex: last.i,
    direction: last.price >= opposite.price ? 'up' : 'down',
  };
}

// FVG: 3 mumluk imbalans. inverted=true ise FVG kırılmış (IFVG) demektir.
export function fvgs(candles, { limit = 12 } = {}) {
  const out = [];
  if (!Array.isArray(candles)) return out;
  for (let i = 2; i < candles.length; i++) {
    const a = candles[i - 2], c = candles[i];
    let type = null, top = null, bottom = null;
    if (c.l > a.h) { type = 'bull'; bottom = a.h; top = c.l; }
    else if (c.h < a.l) { type = 'bear'; bottom = c.h; top = a.l; }
    if (!type) continue;
    let inverted = false, filled = false;
    for (let j = i + 1; j < candles.length; j++) {
      const bar = candles[j];
      if (type === 'bull') {
        if (bar.c < bottom) { inverted = true; break; }
        if (bar.l <= top && bar.h >= bottom) filled = true;
      } else {
        if (bar.c > top) { inverted = true; break; }
        if (bar.h >= bottom && bar.l <= top) filled = true;
      }
    }
    out.push({ type, top, bottom, index: i, inverted, filled });
  }
  return out.slice(-limit);
}

// Fiyatın üstündeki en yakın direnç ve altındaki en yakın destek (pivotlardan).
export function nearestLevels(candles, price, { lookback = 80, ...opts } = {}) {
  const p = Number(price);
  if (!Array.isArray(candles) || !(p > 0)) return { high: null, low: null };
  const slice = candles.slice(-lookback);
  const { highs, lows } = pivots(slice, opts);
  const above = highs.filter(x => x.price > p).sort((a, b) => a.price - b.price)[0] || null;
  const below = lows.filter(x => x.price < p).sort((a, b) => b.price - a.price)[0] || null;
  return { high: above ? above.price : null, low: below ? below.price : null };
}

// İstanbul saat diliminde saat/dakika.
export function istanbulTime(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now);
  const get = type => Number((parts.find(p => p.type === type) || {}).value || 0);
  return { hour: get('hour'), minute: get('minute') };
}

// IFVG stratejisinin kullanıcı kuralı: 08:00–12:00 TSİ (12:00 hariç).
export function inIfvgWindow(now = new Date(), startHour = 8, endHour = 12) {
  const { hour } = istanbulTime(now);
  return hour >= startHour && hour < endHour;
}

// Mum dizisinden trend/ATR/swing/24s aralık özeti.
// barsPerDay: zaman dilimine göre günlük mum sayısı (1h=24, 4h=6, 15m=96, 5m=288).
export function structureFromCandles(candles, barsPerDay = 24) {
  if (!Array.isArray(candles) || candles.length < 60) return null;
  const emaOf = period => {
    const k = 2 / (period + 1);
    let e = candles[0].c;
    for (let i = 1; i < candles.length; i++) e = candles[i].c * k + e * (1 - k);
    return e;
  };
  const tr = [];
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1].c, c = candles[i];
    tr.push(Math.max(c.h - c.l, Math.abs(c.h - prev), Math.abs(c.l - prev)));
  }
  const atr14 = tr.slice(-14).reduce((a, b) => a + b, 0) / 14;
  const ema20 = emaOf(20), ema50 = emaOf(50);
  const recent = candles.slice(-50);
  const dayBars = Math.max(2, Math.min(Number(barsPerDay) || 24, candles.length));
  const day = candles.slice(-dayBars);
  const last = candles[candles.length - 1].c;
  return {
    atr14,
    ema20, ema50,
    swingHigh: Math.max(...recent.map(c => c.h)),
    swingLow: Math.min(...recent.map(c => c.l)),
    high24: Math.max(...day.map(c => c.h)),
    low24: Math.min(...day.map(c => c.l)),
    trend: last > ema20 && ema20 > ema50 ? 'yukarı' : last < ema20 && ema20 < ema50 ? 'aşağı' : 'yatay',
  };
}
