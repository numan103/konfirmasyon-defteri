const fs = require('fs');
const h = fs.readFileSync('index.html', 'utf8');
const a = h.indexOf('function ap2PnlOf');
const b = h.indexOf('function bindAlfaPortfoy2');
if (a < 0 || b < a) { console.log('ap2 slice markers bad'); process.exit(1); }
const src = h.slice(a, b);
global.pfAmt = n => '$' + Number(n).toFixed(2);
const ap2 = new Function(src + '\n;return { ap2PnlOf, ap2Calc, ap2Summary, ap2HedgeInfo, ap2HedgeStrip };')();
ap2Data = { startBalance: 0, cash: 0, positions: [], sells: [] };
let fails = 0;
const check = (name, cond) => { if (cond) console.log('OK   ' + name); else { console.log('MISS ' + name); fails++; } };

check('short pnl inverted', ap2.ap2PnlOf('SHORT', 100, 120) === -20 && ap2.ap2PnlOf('LONG', 100, 120) === 20);
check('long calc pnl', ap2.ap2Calc({ qty: 1, cost: 100, price: 120 }).pnl === 20);
check('long calc pct', Math.abs(ap2.ap2Calc({ qty: 1, cost: 100, price: 120 }).pnlPct - 20) < 1e-9);
check('short calc pnl', ap2.ap2Calc({ qty: 1, cost: 100, price: 80, side: 'SHORT' }).pnl === 20);
check('short calc pct', Math.abs(ap2.ap2Calc({ qty: 1, cost: 100, price: 80, side: 'SHORT' }).pnlPct - 20) < 1e-9);
check('no side defaults long', ap2.ap2Calc({ qty: 2, cost: 50, price: 40 }).pnl === -20);

ap2Data.positions = [
  { symbol: 'BTC', qty: 0.01, cost: 60000, price: 65000, side: 'LONG' },
  { symbol: 'BTC', qty: 0.01, cost: 60000, price: 63000, side: 'SHORT' },
];
let hh = ap2.ap2HedgeInfo();
check('hedge pair found', hh.length === 1 && hh[0].sym === 'BTC');
check('full hedge (net 0)', hh[0].full === true && Math.abs(hh[0].net) < 1e-9);
ap2Data.positions[1].qty = 0.004;
hh = ap2.ap2HedgeInfo();
check('partial hedge (net > 0)', hh.length === 1 && hh[0].full === false && Math.abs(hh[0].net - 360) < 1e-9);
ap2Data.positions[1].side = 'LONG';
hh = ap2.ap2HedgeInfo();
check('same side -> no pair', hh.length === 0);
check('strip empty when no pair', ap2.ap2HedgeStrip() === '');
ap2Data.positions[1].side = 'SHORT';
ap2Data.positions[1].qty = 0.01;
const strip = ap2.ap2HedgeStrip();
check('strip shows hedge pair', strip.indexOf('\u264A') >= 0 && strip.indexOf('Tam hedge') >= 0);

ap2Data = { startBalance: 200, cash: 0, positions: [
  { symbol: 'ETH', qty: 1, cost: 100, price: 120, side: 'LONG' },
  { symbol: 'ETH', qty: 1, cost: 100, price: 80, side: 'SHORT' },
], sells: [] };
const s = ap2.ap2Summary();
check('summary nets hedge to 0 pnl', s.portfolioValue === 200 && Math.abs(s.pnl) < 1e-9);

console.log(fails ? 'SIM-AP2 FAIL' : 'SIM-AP2 ALL OK');
process.exit(fails ? 1 : 0);