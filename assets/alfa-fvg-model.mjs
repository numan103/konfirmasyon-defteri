// Pure FVG / IFVG helpers for ALFA CHARTS.
export function computeFvg(bars, opts = {}) {
  const minGap = opts.minGap ?? 0;
  const atrFilter = opts.atrFilter ?? 0; // min gap in ATR units
  const atr = opts.atr || [];
  const displacement = opts.displacement !== false;
  const dispMin = opts.dispMin ?? 0.6;
  const mitigation = opts.mitigation || 'wick'; // wick | body | half | full
  const maxRegions = opts.maxRegions ?? 50;
  const showBull = opts.showBull !== false;
  const showBear = opts.showBear !== false;

  const regions = [];
  for (let i = 2; i < bars.length; i++) {
    const a = bars[i - 2], b = bars[i - 1], c = bars[i];
    // bullish FVG
    if (showBull && a.high < c.low) {
      const gap = c.low - a.high;
      const midRatio = Math.abs(b.close - b.open) / (b.high - b.low || 1);
      const atrVal = atr[i] || (bars[i].high - bars[i].low);
      if (gap >= minGap && (atrFilter <= 0 || gap >= atrFilter * atrVal) && (!displacement || midRatio >= dispMin)) {
        regions.push({ id: 'fvg-b-' + i, type: 'fvg', dir: 'bull', start: a.time, end: c.time, upper: c.low, lower: a.high, formedAt: c.time, confirmedAt: c.time, mitigation: 'unmitigated', invalidAt: null });
      }
    }
    // bearish FVG
    if (showBear && a.low > c.high) {
      const gap = a.low - c.high;
      const midRatio = Math.abs(b.close - b.open) / (b.high - b.low || 1);
      const atrVal = atr[i] || (bars[i].high - bars[i].low);
      if (gap >= minGap && (atrFilter <= 0 || gap >= atrFilter * atrVal) && (!displacement || midRatio >= dispMin)) {
        regions.push({ id: 'fvg-r-' + i, type: 'fvg', dir: 'bear', start: a.time, end: c.time, upper: a.low, lower: c.high, formedAt: c.time, confirmedAt: c.time, mitigation: 'unmitigated', invalidAt: null });
      }
    }
  }

  // mitigation + invalidation
  for (const r of regions) {
    let mitigated = 'unmitigated';
    let invalidatedAt = null;
    let firstTouch = null;
    for (let j = bars.findIndex(b => b.time > r.confirmedAt); j < bars.length; j++) {
      if (j < 0) continue;
      const bar = bars[j];
      if (r.dir === 'bull') {
        // bullish FVG: gap [lower, upper]. mitigation if price enters gap; invalidation if close below lower
        const touches = mitigation === 'wick' ? bar.low <= r.upper : mitigation === 'body' ? Math.min(bar.open, bar.close) <= r.upper : true;
        const full = mitigation === 'full' ? bar.low <= r.lower : (mitigation === 'half' ? bar.low <= (r.lower + r.upper) / 2 : bar.low <= r.lower);
        if (firstTouch == null && touches) firstTouch = bar.time;
        if (bar.close < r.lower) { invalidatedAt = bar.time; mitigated = 'invalidated'; break; }
        if (full) { mitigated = 'full'; }
        else if (touches) { if (mitigated === 'unmitigated') mitigated = 'partial'; }
      } else {
        const touches = mitigation === 'wick' ? bar.high >= r.lower : mitigation === 'body' ? Math.max(bar.open, bar.close) >= r.lower : true;
        const full = mitigation === 'full' ? bar.high >= r.upper : (mitigation === 'half' ? bar.high >= (r.lower + r.upper) / 2 : bar.high >= r.upper);
        if (firstTouch == null && touches) firstTouch = bar.time;
        if (bar.close > r.upper) { invalidatedAt = bar.time; mitigated = 'invalidated'; break; }
        if (full) { mitigated = 'full'; }
        else if (touches) { if (mitigated === 'unmitigated') mitigated = 'partial'; }
      }
    }
    r.mitigation = invalidatedAt ? 'invalidated' : mitigated;
    r.invalidatedAt = invalidatedAt;
    r.firstTouchAt = firstTouch;
  }

  // IFVG conversion
  const ifvgs = [];
  for (const r of regions) {
    if (r.mitigation !== 'invalidated' || r.invalidatedAt == null) continue;
    const invDir = r.dir === 'bull' ? 'bear' : 'bull';
    // first retest after inversion
    let firstRetest = null;
    const invTime = r.invalidatedAt;
    for (let j = bars.findIndex(b => b.time >= invTime); j < bars.length; j++) {
      if (j < 0) continue;
      const bar = bars[j];
      if (invDir === 'bull') {
        if (bar.low <= r.upper && bar.high >= r.lower) { firstRetest = bar.time; break; }
      } else {
        if (bar.high >= r.lower && bar.low <= r.upper) { firstRetest = bar.time; break; }
      }
    }
    ifvgs.push({ id: 'ifvg-' + r.id, type: 'ifvg', dir: invDir, start: r.start, end: r.end, upper: r.upper, lower: r.lower,
      formedAt: r.formedAt, confirmedAt: r.confirmedAt, invertedAt: invTime, firstRetestAt: firstRetest, origin: r.id,
      mitigation: 'unmitigated', invalidAt: null });
  }

  // trim to maxRegions (keep most recent)
  const all = [...regions, ...ifvgs];
  if (all.length > maxRegions) all.splice(0, all.length - maxRegions);
  return all;
}
