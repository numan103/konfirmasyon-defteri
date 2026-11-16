// Pure market-structure helpers for ALFA CHARTS.
export function findSwings(bars, left = 3, right = 3) {
  const L = Math.max(1, Math.floor(left)), R = Math.max(1, Math.floor(right));
  const out = [];
  for (let i = L; i < bars.length - R; i++) {
    const h = bars[i].high;
    let isHigh = true;
    for (let j = i - L; j <= i + R; j++) {
      if (j === i) continue;
      if (bars[j].high >= h) { isHigh = false; break; }
    }
    if (isHigh) out.push({ index: i, time: bars[i].time, price: h, type: 'high' });
    const l = bars[i].low;
    let isLow = true;
    for (let j = i - L; j <= i + R; j++) {
      if (j === i) continue;
      if (bars[j].low <= l) { isLow = false; break; }
    }
    if (isLow) out.push({ index: i, time: bars[i].time, price: l, type: 'low' });
  }
  return out.sort((a, b) => a.index - b.index);
}

export function classifyStructure(swings, equalTol = 0) {
  const tol = Math.max(0, equalTol);
  const highs = [], lows = [];
  const labeled = [];
  for (const s of swings) {
    if (s.type === 'high') {
      const last = highs[highs.length - 1];
      let label = 'HH';
      if (last) {
        if (s.price > last.price + tol) label = 'HH';
        else if (s.price < last.price - tol) label = 'LH';
        else label = 'EH';
      }
      highs.push({ ...s, label });
      labeled.push({ ...s, label, group: 'high' });
    } else {
      const last = lows[lows.length - 1];
      let label = 'HL';
      if (last) {
        if (s.price < last.price - tol) label = 'LL';
        else if (s.price > last.price + tol) label = 'HL';
        else label = 'EL';
      }
      lows.push({ ...s, label });
      labeled.push({ ...s, label, group: 'low' });
    }
  }
  return labeled;
}

function bodyRatio(bar) {
  const range = bar.high - bar.low;
  if (range <= 0) return 0;
  return Math.abs(bar.close - bar.open) / range;
}

export function computeMarketStructure(bars, opts = {}) {
  const left = opts.left ?? 3;
  const right = opts.right ?? 3;
  const equalTol = opts.equalTol ?? 0;
  const mode = opts.mode || 'close'; // close | wick
  const displacement = opts.displacement !== false;
  const dispMin = opts.dispMin ?? 0.6;
  const atrMult = opts.atrMult ?? 0;

  const swings = findSwings(bars, left, right);
  const labeled = classifyStructure(swings, equalTol);

  // map swing index -> swing for confirmation timing
  const swingByIndex = new Map();
  for (const s of labeled) swingByIndex.set(s.index, s);

  const events = []; // BOS / CHoCH
  let trend = 0; // 1 up, -1 down, 0 unknown
  let lastHigh = null, lastLow = null;
  let lastBosHigh = null, lastBosLow = null;
  let lastHL = null, lastLH = null; // for protected
  const protectedLevels = []; // {type:'high'|'low', time, price, brokenAt:null|time}

  // helper to check displacement
  function dispOk(bar) {
    if (!displacement) return true;
    if (bodyRatio(bar) < dispMin) return false;
    return true;
  }

  for (let i = 0; i < bars.length; i++) {
    // confirm swings whose right side is complete at i
    const sw = swingByIndex.get(i - right);
    // Actually swing at index j is confirmed when i = j + right. So check map key i-right.
    // handled below by scanning
  }

  // Process in time order using swing confirmation
  let si = 0;
  const sortedSwings = [...labeled].sort((a, b) => a.index - b.index);
  for (let i = 0; i < bars.length; i++) {
    // confirm swings
    while (si < sortedSwings.length && sortedSwings[si].index + right === i) {
      const s = sortedSwings[si];
      if (s.type === 'high') {
        // new HH? check
        const prevHigh = lastHigh;
        if (prevHigh && s.label === 'HH') {
          // protected low = last HL before this HH
          if (lastHL) {
            protectedLevels.push({ type: 'low', time: lastHL.time, price: lastHL.price, brokenAt: null });
            lastHL = null;
          }
        }
        lastHigh = s;
      } else {
        const prevLow = lastLow;
        if (prevLow && s.label === 'LL') {
          if (lastLH) {
            protectedLevels.push({ type: 'high', time: lastLH.time, price: lastLH.price, brokenAt: null });
            lastLH = null;
          }
        }
        lastLow = s;
      }
      // track last HL/LH
      if (s.label === 'HL') lastHL = s;
      if (s.label === 'LH') lastLH = s;
      si++;
    }

    // check breaks
    if (lastHigh) {
      const level = lastHigh.price;
      const broke = mode === 'wick' ? bars[i].high > level : bars[i].close > level;
      if (broke && lastHigh.index < i && dispOk(bars[i])) {
        if (trend === -1) {
          events.push({ type: 'CHoCH', dir: 'up', time: bars[i].time, price: level, index: i });
        } else if (trend === 1) {
          if (lastBosHigh !== level) {
            events.push({ type: 'BOS', dir: 'up', time: bars[i].time, price: level, index: i });
            lastBosHigh = level;
          }
        } else {
          // first structure
          trend = 1;
        }
        trend = 1;
      }
    }
    if (lastLow) {
      const level = lastLow.price;
      const broke = mode === 'wick' ? bars[i].low < level : bars[i].close < level;
      if (broke && lastLow.index < i && dispOk(bars[i])) {
        if (trend === 1) {
          events.push({ type: 'CHoCH', dir: 'down', time: bars[i].time, price: level, index: i });
        } else if (trend === -1) {
          if (lastBosLow !== level) {
            events.push({ type: 'BOS', dir: 'down', time: bars[i].time, price: level, index: i });
            lastBosLow = level;
          }
        }
        trend = -1;
      }
    }

    // check protected breaks: close beyond level
    for (const pl of protectedLevels) {
      if (pl.brokenAt != null) continue;
      if (pl.type === 'low' && bars[i].close < pl.price) pl.brokenAt = bars[i].time;
      if (pl.type === 'high' && bars[i].close > pl.price) pl.brokenAt = bars[i].time;
    }
  }

  // Equal highs/lows
  const equal = [];
  for (let a = 0; a < labeled.length; a++) {
    for (let b = a + 1; b < labeled.length; b++) {
      if (labeled[a].type !== labeled[b].type) continue;
      if (Math.abs(labeled[a].price - labeled[b].price) <= equalTol) {
        equal.push({ type: labeled[a].type, price: (labeled[a].price + labeled[b].price) / 2, times: [labeled[a].time, labeled[b].time] });
      }
    }
  }

  return { swings: labeled, bos: events.filter(e => e.type === 'BOS'), choch: events.filter(e => e.type === 'CHoCH'), protected: protectedLevels, equal };
}
