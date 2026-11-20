// Public historical data only. No credentials, DB writes, Telegram or orders.
// Fetch once: node scripts/alpha-v16-history.mjs --fetch
// Offline replay: node scripts/alpha-v16-history.mjs
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { analyzeV16, closedBars, TF_MS } from '../lib/alpha-strategy-v16.mjs';

const dir = new URL('../tests/fixtures/alpha-v16/', import.meta.url);
const output = new URL('../docs/alpha-v16-history/', import.meta.url);
fs.mkdirSync(dir, { recursive: true });
fs.mkdirSync(output, { recursive: true });
const file = new URL('btc-2025-01.json', dir);
if (process.argv.includes('--fetch')) {
  const start = Date.parse('2025-01-01T00:00:00Z'), end = Date.parse('2025-01-15T00:00:00Z');
  const detail = {};
  for (const tf of ['15m', '1h', '4h']) {
    const candles = [];
    for (let cursor = start; cursor < end;) {
      const url = `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=${tf}&startTime=${cursor}&endTime=${end-1}&limit=1000`;
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error('historical_data_' + res.status);
      const rows = await res.json();
      if (!Array.isArray(rows) || !rows.length) throw new Error('missing_history');
      for (const r of rows) candles.push({ t: +r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5] });
      cursor = candles.at(-1).t + TF_MS[tf];
    }
    assert.equal(candles.length, (end-start)/TF_MS[tf]);
    candles.forEach((b,i) => assert.equal(b.t, start + i*TF_MS[tf]));
    detail[tf] = { source: 'Binance BTCUSDT spot /api/v3/klines', candles };
  }
  fs.writeFileSync(file, JSON.stringify({ start, end, fetchedAt: new Date().toISOString(), detail }));
}
const bytes = fs.readFileSync(file), data = JSON.parse(bytes);
const seen = new Map(), protectedSeen = new Map(), states = {};
let checked = 0;
for (const bar of data.detail['15m'].candles) {
  const asOf = bar.t + TF_MS['15m'];
  const prefix = Object.fromEntries(Object.entries(data.detail).map(([tf,d]) =>
    [tf, { ...d, candles: closedBars(d.candles, tf, asOf) }]));
  const result = analyzeV16(prefix, asOf);
  // A supplied future suffix cannot change analysis at a historical cutoff.
  assert.deepEqual(analyzeV16(data.detail, asOf), result);
  checked++;
  states[result.status] = (states[result.status] || 0) + 1;
  for (const m of result.msbs) seen.set(`${m.direction}:${m.swing.t}:${m.t}`, m);
  for (const p of result.protectedPivots) protectedSeen.set(`${p.tf}:${p.direction}:${p.protected.t}`, p);
}
const candidates = [...seen.values()];
const summary = {
  source: 'Binance BTCUSDT spot', start: new Date(data.start).toISOString(), endExclusive: new Date(data.end).toISOString(),
  fixtureSha256: createHash('sha256').update(bytes).digest('hex'),
  bars: Object.fromEntries(Object.entries(data.detail).map(([tf,d]) => [tf,d.candles.length])),
  cutoffsChecked: checked, futureSuffixComparisonsPassed: checked,
  states, descriptiveMsbCandidates: candidates.length,
  candleRulePass: {
    long: candidates.filter(m => m.valid && m.direction === 'long').length,
    short: candidates.filter(m => m.valid && m.direction === 'short').length,
  },
  protectedCandidates: protectedSeen.size,
  approvedSignals: 0, actualOrders: 0, realizedWins: null, winRate: null,
  limitation: 'Candidate/prefix causality audit, not a performance backtest. No reviewed external swing/anchor/pullback labels; no trade claims. No historical supplemental snapshots.',
};
fs.writeFileSync(new URL('summary.json', output), JSON.stringify(summary, null, 2) + '\n');
// Real OHLC charts for manual validation, never fabricated setup levels.
const cases = ['long','short'].map(direction => candidates.filter(m => m.valid && m.direction === direction).at(-1)).filter(Boolean);
const charts = cases.map(m => {
  const cutoff = m.closeTime, bars = closedBars(data.detail['15m'].candles, '15m', cutoff).slice(-96);
  const low = Math.min(...bars.map(b => b.l)), high = Math.max(...bars.map(b => b.h));
  const y = p => 420 - (p-low)/(high-low)*360;
  const x = i => 60 + i*10;
  const draw = bars.map((b,i) => {
    const col = b.c >= b.o ? '#16a085' : '#e74c3c';
    return `<line x1="${x(i)}" x2="${x(i)}" y1="${y(b.h)}" y2="${y(b.l)}" stroke="${col}"/><rect x="${x(i)-3}" y="${y(Math.max(b.o,b.c))}" width="6" height="${Math.max(1,Math.abs(y(b.o)-y(b.c)))}" fill="${col}"/>`;
  }).join('');
  const subtitle = `Aday ${m.direction} / kapanış ${new Date(cutoff).toISOString()} / gövde ${m.bodyRatio.toFixed(3)} / NEEDS_REVIEW`;
  return `<h2>${subtitle}</h2><p>Yalnız karar anına kadar kapanmış gerçek 15M mumlar. Mavi: aday swing ${m.swing.price} @ ${new Date(m.swing.t).toISOString()}. Ana swing/HTF/anchor/pullback manuel doğrulanmalı. Giriş/stop/TP atanmadı.</p><svg viewBox="0 0 1080 470" role="img" aria-label="${subtitle}"><rect width="1080" height="470" fill="#fafafa"/><text x="5" y="25">${high}</text><text x="5" y="450">${low}</text>${draw}<line x1="60" x2="1040" y1="${y(m.swing.price)}" y2="${y(m.swing.price)}" stroke="blue" stroke-dasharray="5 5"/></svg>`;
}).join('');
fs.writeFileSync(new URL('charts.html', output), `<!doctype html><html lang="tr"><meta charset="utf-8"><title>Alpha v16 geçmiş BTC aday incelemesi</title><style>body{font:15px system-ui;max-width:1100px;margin:30px auto;padding:16px}svg{width:100%}h2{font-size:18px}</style><h1>v16 — geçmiş BTC grafik denetimi</h1><p>İşlem veya kârlılık backtesti değildir. Bu grafiklerde sağ taraftaki gelecek mumlar gösterilmez. Veri: Binance BTCUSDT spot, UTC. Y ekseni her örnekte farklıdır.</p>${charts}</html>`);
console.log(JSON.stringify(summary, null, 2));
