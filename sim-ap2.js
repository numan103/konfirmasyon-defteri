const fs = require('fs');
const h = fs.readFileSync('index.html', 'utf8');
const a = h.indexOf('function ap2PnlOf');
const b = h.indexOf('function bindAlfaPortfoy2');
if (a < 0 || b < a) { console.log('ap2 slice markers bad'); process.exit(1); }
const src = h.slice(a, b);
global.pfAmt = n => '$' + Number(n).toFixed(2);
const ap2 = new Function(src + '\n;return { ap2PnlOf, ap2Calc, ap2Summary, ap2HedgeInfo, ap2HedgeStrip, ap2HistUrl, ap2IsPending, ap2Active, ap2Fillable };')();
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

const hu = ap2.ap2HistUrl;
check('histUrl ltc formatted', hu('LTC', '2026-08-24') && hu('LTC', '2026-08-24').indexOf('litecoin/history?date=24-08-2026') >= 0);
check('histUrl today null', hu('LTC', new Date().toISOString().slice(0, 10)) === null);
check('histUrl unknown sym null', hu('ZZZZ', '2026-08-24') === null);
check('histUrl bad date null', hu('LTC', '2026-13-99') === null);

ap2Data = { startBalance: 0, cash: 100, positions: [] };
ap2Data.positions.push({ id: 'x', symbol: 'LTC', qty: 1, cost: 47.7, price: 48, side: 'LONG', date: '2026-08-30', lim: true, filled: null });
check('limit above market -> pending', ap2.ap2IsPending(ap2Data.positions[0]) === true);
check('pending excluded from summary', ap2.ap2Summary().count === 0);
const pf2 = { symbol: 'BTC', qty: 1, cost: 50, price: 49, side: 'SHORT' };
check('short waits below limit', ap2.ap2Fillable(pf2) === false);
pf2.price = 51;
check('short fillable at/above limit', ap2.ap2Fillable(pf2) === true);
ap2Data.positions[0].price = 47.5;
check('long fillable at/below limit', ap2.ap2Fillable(ap2Data.positions[0]) === true);
ap2Data.positions[0].filled = '2026-08-30';
check('filled limit is active', ap2.ap2IsPending(ap2Data.positions[0]) === false);
ap2Data.positions.push({ id: 'y', symbol: 'ETH', qty: 1, cost: 100, price: 100, side: 'LONG', date: '2026-08-30' });
check('active filter ignores pending', ap2.ap2Active().length === 2);
check('active counts in summary', ap2.ap2Summary().count === 2);

console.log(fails ? 'SIM-AP2 FAIL' : 'SIM-AP2 ALL OK');
process.exit(fails ? 1 : 0);