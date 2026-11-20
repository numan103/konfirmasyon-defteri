// Analysis only. Times are Unix milliseconds; bars become visible at closeTime.
// Candidate detection is NOT the user's external-pivot/pullback definition.
import { pivots, fibSet } from './market-structure.mjs';

export const CANONICAL_V16 = `ALPHA BOT KANONİK v16 — önceki strateji/not/video talimatlarının üstündedir.
Price action location ve narrative birincil. M1 sweep + IFVG reversal, M2 BTC 15M 0.382, M3 HTF POI/swing, M4 Wyckoff/hacim ayrı modellerdir.
M2 long/short simetrik: 15M ana swing, 1H VEYA 4H protected HL/LH ile kanıtlı ilişkili veya önemli HTF supply/demand temas/sweep/reclaim/güçlü reaksiyonu ile ilişkili olmalı; yakınlık yetmez.
Protected HL yeni HH yaptıran son HL; protected LH yeni LL yaptıran son LH. Yeni HH/LL için tamamlanmış HTF mum önceki high/low ötesinde KAPANMALI; fitil yetmez.
MSB ana swing ötesinde tamamlanmış 15M kapanışı ve abs(C-O)/(H-L)>=0.60; sıfır aralık geçersiz.
Fib yeni HH→kırılım sonrası swing low (short), yeni LL→kırılım sonrası swing high (long) teyitli varyanttır. Diğer A/B varyantını otomatik genelleme.
İlk belirgin pullback sonrası ekstrem kilitlenir. Pivot ilişkisi, anchor ve belirgin pullback için sayısal eşik tanımlı değil: uydurma; NEEDS_REVIEW, alternatifleri göster.
M2 giriş tam 0.382 LIMIT, stop tam 0.805, TP sabit 2.5R; 2.5R yalnız M2 içindir. 0.5/0.618 giriş, ATR stop tabanı ve likidite TP'si bu modelin yerine geçmez; ek entry confirmation yok.
Limit dolmadan TP görülürse MISSED_TP_BEFORE_ENTRY / CANCEL_PENDING; kazanç sayma. Aynı mumda giriş/TP sırası bilinmiyorsa INTRABAR_SEQUENCE_UNKNOWN.
Yeni ekstremde otomatik fib güncelleme, karşıt MSB/HTF kaybı/zaman ile otomatik iptal yok. Küçük/büyük görsel ayrımına eşik uydurma.
Order book/OI/CVD/funding/likidasyon/on-chain destekleyici, zorunlu filtre değil. Yoksa mevcut değil; olumlu veri eksik PA yerine geçmez.
OI düşüşü likidasyon kanıtı değil; heatmap tahmin, gerçekleşmiş tasfiye değil. Defter emirleri iptal edilebilir.
IFVG için NY ve hacimli saatler bağlamdır, 08–12 veya 16:30–17:00 sabit filtre değil. BTC IFVG yasak değil; M2 ile karıştırma.
Her analiz: HTF bias, swing/protected pivot fiyat+zaman, MSB mum+gövde oranı, fib anchor fiyat+zaman, giriş/stop/TP (yalnız kanıtlıysa), iki senaryo/invalidation, olası stop sahipleri (hipotez), karşıt kanıt, no-trade gerekçesi, veri kaynağı/tazeliği ve belirsizlikler.
Konuk görüşünü Ahmet'in kuralı sayma. Gerçek emir gönderme/değiştirme/iptal etme. Kârlılık iddiası yok.`;

export const TF_MS = { '5m': 300000, '15m': 900000, '1h': 3600000, '4h': 14400000, '1d': 86400000, '1w': 604800000 };
export function closedBars(bars, tf, asOf) {
  const duration = TF_MS[tf];
  if (!duration || !Number.isFinite(asOf)) return [];
  return (bars || []).filter(b => Number.isFinite(b.t) && Number.isFinite(b.o) &&
    [b.h, b.l, b.c].every(v => Number.isFinite(v) && v > 0) && b.o > 0 &&
    b.h >= Math.max(b.o, b.c) && b.l <= Math.min(b.o, b.c) &&
    b.t + duration <= asOf && b.confirmed !== false)
    .map(b => ({ ...b, closeTime: b.t + duration })).sort((a, b) => a.t - b.t)
    .filter((b, i, a) => !i || b.t !== a[i - 1].t);
}

// Existing 2/2 pivots are descriptive candidates only, available after right bars.
export function pivotCandidates(bars) {
  const p = pivots(bars);
  return [...p.highs.map(x => ({ ...x, kind: 'high' })), ...p.lows.map(x => ({ ...x, kind: 'low' }))]
    .map(p => ({ ...p, t: bars[p.i].t, knownAt: bars[p.i + 2].closeTime }))
    .sort((a, b) => a.t - b.t);
}

export function protectedCandidates(bars, tf) {
  const ps = pivotCandidates(bars), out = [];
  for (const kind of ['high', 'low']) {
    const side = ps.filter(p => p.kind === kind);
    for (let n = 1; n < side.length; n++) {
      const prev = side[n - 1], level = side[n];
      if (kind === 'high' ? level.price <= prev.price : level.price >= prev.price) continue;
      const corrections = ps.filter(p => p.kind !== kind && p.t > prev.t && p.t < level.t);
      const correction = corrections.at(-1);
      if (!correction) continue;
      const older = ps.filter(p => p.kind !== kind && p.t < prev.t).at(-1);
      if (!older || (kind === 'high' ? correction.price <= older.price : correction.price >= older.price)) continue;
      const breakBar = bars.find(b => b.closeTime >= correction.knownAt && b.t > correction.t &&
        (kind === 'high' ? b.c > prev.price : b.c < prev.price));
      if (breakBar) out.push({ tf, direction: kind === 'high' ? 'long' : 'short',
        protected: correction, broken: prev, confirmation: breakBar,
        knownAt: Math.max(level.knownAt, correction.knownAt, breakBar.closeTime), candidateOnly: true });
    }
  }
  return out;
}

export function msbCheck(bar, swing, direction) {
  const range = bar.h - bar.l;
  const bodyRatio = range > 0 ? Math.abs(bar.c - bar.o) / range : 0;
  const beyond = direction === 'long' ? bar.c > swing.price : bar.c < swing.price;
  return { valid: range > 0 && beyond && bodyRatio >= 0.60, bodyRatio, beyond,
    t: bar.t, closeTime: bar.closeTime, level: swing.price };
}

export function m2Levels(direction, start, end) {
  if (!['long', 'short'].includes(direction) || ![start, end].every(v => Number.isFinite(v) && v > 0) ||
    (direction === 'long' ? end <= start : end >= start)) throw new Error('invalid_anchors');
  const f = fibSet(start, end), risk = Math.abs(f.r382 - f.r805);
  const tp = f.r382 + (direction === 'long' ? 1 : -1) * 2.5 * risk;
  if (!(tp > 0)) throw new Error('invalid_target');
  return { direction, entry: f.r382, stop: f.r805, tp, risk, rr: 2.5, orderType: 'limit' };
}

// Explicit reviewed evidence must already have been available by asOf.
// No numerical definition is invented for external relation or first pullback.
export function evaluateM2({ bars, asOf, evidence, htf = {}, mode = 'strict_signal' }) {
  const visible = closedBars(bars, '15m', asOf);
  const base = { model: 'M2', version: 'v16', mode, asOf, executionAuthorized: false };
  const review = reason => ({ ...base, status: 'NEEDS_REVIEW', reasons: [reason], levels: null });
  if (!evidence || evidence.reviewed !== true || !Number.isFinite(evidence.knownAt) ||
    evidence.knownAt > asOf) return review('Ana swing/HTF ilişkisi ve pullback için zaman damgalı inceleme gerekli.');
  const { direction, swing, start, end, msbTime, relation, pullback } = evidence;
  if (!['long', 'short'].includes(direction)) return review('Yön tanımsız.');
  const matches = (p, kind) => p && Number.isFinite(p.knownAt) && p.knownAt <= asOf &&
    visible.some(b => b.t === p.t && b[kind] === p.price && b.closeTime <= p.knownAt);
  if (!matches(swing, direction === 'long' ? 'h' : 'l') ||
    !matches(start, direction === 'long' ? 'l' : 'h') ||
    !matches(end, direction === 'long' ? 'h' : 'l')) return review('Pivot fiyat/zaman/erişilebilirlik kanıtı eksik.');
  const bar = visible.find(b => b.t === msbTime);
  if (!bar || swing.knownAt > bar.t || start.t >= bar.t || end.t <= bar.t)
    return review('MSB öncesinde bilinen ana swing ve kırılım sonrası ekstrem gerekli.');
  const msb = msbCheck(bar, swing, direction);
  if (!msb.valid) return { ...base, status: 'NO_TRADE', msb, levels: null, reasons: ['15M kapanış + %60 gövde koşulu sağlanmadı.'] };
  if (!relation || !['1h', '4h'].includes(relation.tf) ||
    !Number.isFinite(relation.knownAt) || relation.knownAt > bar.t || !relation.rationale)
    return review('1H veya 4H ilişkisinin kırılımdan önce kanıtı gerekli.');
  if (relation.type === 'protected') {
    const c = relation.confirmation, p = relation.protected, old = relation.previous, prior = relation.priorCorrection;
    const hbars = closedBars(htf[relation.tf]?.candles, relation.tf, relation.knownAt);
    const bullish = relation.direction === 'long';
    if (!c || !p || !old || !prior || !Number.isFinite(c.closeTime) || c.closeTime > relation.knownAt ||
      ![c.o,c.h,c.l,c.c,p.price,old.price,prior.price].every(Number.isFinite) ||
      c.closeTime !== c.t + TF_MS[relation.tf] || c.confirmed === false ||
      !['long','short'].includes(relation.direction) ||
      !hbars.some(b => b.t === c.t && b.c === c.c && b.h === c.h && b.l === c.l && b.o === c.o) ||
      !hbars.some(b => b.t === p.t && b[bullish ? 'l' : 'h'] === p.price) ||
      !hbars.some(b => b.t === old.t && b[bullish ? 'h' : 'l'] === old.price) ||
      !hbars.some(b => b.t === prior.t && b[bullish ? 'l' : 'h'] === prior.price) ||
      !(prior.t < old.t && old.t < p.t && p.t < c.t) ||
      (bullish ? p.price <= prior.price : p.price >= prior.price) ||
      hbars.some(b => b.t > p.t && b.t <= c.t && (bullish ? b.l < p.price : b.h > p.price)) ||
      (bullish ? !(c.c > old.price) : !(c.c < old.price)))
      return review('Protected HL/LH için tamamlanmış HTF HH/LL kapanış kanıtı eksik.');
  } else if (relation.type === 'zone') {
    if (!['touch', 'sweep', 'reclaim', 'reaction'].includes(relation.event) ||
      !Number.isFinite(relation.eventTime) || relation.eventTime > relation.knownAt ||
      !(relation.low > 0 && relation.high >= relation.low) ||
      !visible.some(b => b.t === relation.eventTime && b.closeTime <= relation.knownAt &&
        b.h >= relation.low && b.l <= relation.high)) return review('HTF bölge olayı gerekli; yakınlık yetmez.');
  } else return review('HTF ilişki türü tanımsız.');
  if (!pullback || pullback.reviewed !== true || !pullback.rationale ||
    !Number.isFinite(pullback.knownAt) || pullback.knownAt < end.knownAt ||
    pullback.knownAt > asOf || evidence.knownAt < pullback.knownAt)
    return review('İlk belirgin pullback için nedensel, manuel kilitleme kanıtı gerekli.');
  if (evidence.variant !== 'new_extreme_reversal') return review('Bu A/B anchor varyantı grafik doğrulaması bekliyor.');
  const previous = evidence.previousExtreme;
  if (!matches(previous, direction === 'long' ? 'l' : 'h') || previous.knownAt > start.t ||
    !(previous.t < swing.t && swing.t < start.t) ||
    (direction === 'long' ? start.price >= previous.price : start.price <= previous.price))
    return review('Yeni LL/HH ve önceki A’nın sağındaki ana swing dizilimi kanıtlanmadı.');
  const before = visible.filter(b => b.t >= start.t && b.t <= end.t);
  if (before.some(b => direction === 'long' ? b.l < start.price || b.h > end.price : b.h > start.price || b.l < end.price))
    return review('Anchorlar seçilen impulsun ekstremi değil.');
  let levels;
  try { levels = m2Levels(direction, start.price, end.price); } catch { return review('Fib geometrisi geçersiz.'); }
  return { ...base, status: 'PENDING_LIMIT', levels, msb, evidence,
    activeFrom: Math.max(evidence.knownAt, end.knownAt, pullback.knownAt, bar.closeTime),
    reasons: [relation.rationale, pullback.rationale], simulated: true };
}

// Forward-only OHLC simulation; activation/lock bar never filled retrospectively.
export function replayPending(setup, bars, asOf) {
  if (setup.status !== 'PENDING_LIMIT') return setup;
  let status = 'PENDING_LIMIT', filledAt = null;
  const { entry, stop, tp, direction } = setup.levels;
  const long = direction === 'long', events = [];
  for (const b of closedBars(bars, '15m', asOf).filter(b => b.t >= setup.activeFrom)) {
    const entryHit = long ? b.l <= entry : b.h >= entry;
    const tpHit = long ? b.h >= tp : b.l <= tp;
    const stopHit = long ? b.l <= stop : b.h >= stop;
    if (status === 'PENDING_LIMIT') {
      if (entryHit && tpHit) { status = 'INTRABAR_SEQUENCE_UNKNOWN'; break; }
      if (tpHit) return { ...setup, status: 'MISSED_TP_BEFORE_ENTRY', action: 'CANCEL_PENDING',
        realizedR: 0, filledAt: null, simulated: true, events };
      if (!entryHit) {
        if (long ? b.h > setup.evidence.end.price : b.l < setup.evidence.end.price)
          events.push({ t: b.t, type: 'NEW_EXTREME_REVIEW', action: 'NO_AUTOMATIC_REANCHOR' });
        continue;
      }
      status = 'OPEN_POSITION'; filledAt = b.t;
      // Entry/stop in one bar (including gaps) needs lower-TF execution evidence.
      if (stopHit) { status = 'INTRABAR_SEQUENCE_UNKNOWN'; break; }
    } else {
      if (tpHit && stopHit) { status = 'INTRABAR_SEQUENCE_UNKNOWN'; break; }
      if (tpHit || stopHit) return { ...setup, status: tpHit ? 'CLOSED_TP' : 'CLOSED_STOP',
        filledAt, exitedAt: b.t, realizedR: tpHit ? 2.5 : -1, simulated: true, events };
    }
  }
  return { ...setup, status, filledAt, realizedR: null, simulated: true, events };
}

export function analyzeV16(detail, asOf = Date.now(), { evidence, mode = 'strict_signal' } = {}) {
  const bars = Object.fromEntries(Object.entries(TF_MS).map(([tf]) => [tf, closedBars(detail?.[tf]?.candles, tf, asOf)]));
  const protectedPivots = ['1h', '4h'].flatMap(tf => protectedCandidates(bars[tf], tf)).sort((a,b) => a.knownAt-b.knownAt).slice(-6);
  const ps = pivotCandidates(bars['15m']);
  const msbs = [];
  // First close crossing after a pivot became observable, never future pivots.
  for (const p of ps) {
    const direction = p.kind === 'high' ? 'long' : 'short';
    const b = bars['15m'].find(b => b.t >= p.knownAt && (direction === 'long' ? b.c > p.price : b.c < p.price));
    if (b) msbs.push({ direction, swing: p, ...msbCheck(b, p, direction), candidateOnly: true });
  }
  const decision = evidence ? replayPending(evaluateM2({
    bars: detail?.['15m']?.candles, asOf, evidence, htf: detail, mode,
  }), detail?.['15m']?.candles, asOf) : null;
  return { version: 'v16', asOf, mode, status: decision?.status || 'NEEDS_REVIEW', executionAuthorized: false,
    protectedPivots, msbs: msbs.sort((a,b) => a.t-b.t).slice(-6),
    sources: Object.fromEntries(Object.entries(detail || {}).map(([tf, d]) =>
      [tf, { source: d?.source || 'mevcut değil', fetchedAt: d?.at || null, lastClosedAt: bars[tf]?.at(-1)?.closeTime || null }])),
    reasons: decision?.reasons || ['2/2 pivotlar yalnız adaydır, kanonik ana swing değildir.',
      'Ana swing–HTF ilişkisi, anchor varyantı ve ilk belirgin pullback manuel grafik doğrulaması bekliyor.'],
    decision, approvedPlans: decision?.status === 'PENDING_LIMIT' ? [decision] : [] };
}

export function formatV16Report(report) {
  const stamp = t => new Date(t).toISOString();
  const pivots = report.protectedPivots.map(p => `${p.tf} ${p.direction} aday protected ${p.protected.price} @${stamp(p.protected.t)}; HH/LL kapanış ${p.confirmation.c} @${stamp(p.confirmation.closeTime)}`);
  const msbs = report.msbs.map(m => `${m.direction} swing ${m.swing.price} @${stamp(m.swing.t)}; MSB kapanış @${stamp(m.closeTime)}, gövde/aralık=${m.bodyRatio.toFixed(3)}, ${m.valid ? 'mum koşulu uygun; ana swing teyitsiz' : 'MSB geçersiz'}`);
  const d = report.decision;
  const plan = d?.levels ? [
    `**Ana swing:** ${d.evidence.swing.price} @${stamp(d.evidence.swing.t)}`,
    `**MSB:** ${stamp(d.msb.closeTime)}; gövde/aralık=${d.msb.bodyRatio.toFixed(3)}`,
    `**Fibonacci:** ${d.evidence.start.price} @${stamp(d.evidence.start.t)} → ${d.evidence.end.price} @${stamp(d.evidence.end.t)}; kilit ${stamp(d.activeFrom)}`,
    `**Giriş:** ${d.levels.entry.toFixed(2)} LIMIT\n**Stop:** ${d.levels.stop.toFixed(2)}\n**TP:** ${d.levels.tp.toFixed(2)} (2.5R)`,
    `**Yaşam döngüsü:** ${d.status}; ${d.action || 'gerçek emir işlemi yok'}; simülasyon`,
    ...(d.events || []).map(e => `**Uyarı:** ${e.type} @${stamp(e.t)}; ${e.action}`),
  ] : ['**Fibonacci:** anchorlar kilitlenmedi; giriş 0.382 limit / stop 0.805 / TP 2.5R yalnız doğrulanmış impulstan hesaplanır.'];
  return ['**Kanonik denetim — v16 / M2 BTC 15M**', `**Durum:** ${report.status} (emir yetkisi yok)`,
    ...pivots, ...msbs,
    ...plan,
    '**Karar gerekçesi:** ' + report.reasons.join(' '),
    '**Veri:** ' + Object.entries(report.sources).map(([tf,s]) => `${tf} ${s.source}; son kapalı mum ${s.lastClosedAt ? stamp(s.lastClosedAt) : 'yok'}`).join(' | ')
  ].join('\n');
}
