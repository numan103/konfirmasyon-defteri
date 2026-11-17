import test from 'node:test';
import assert from 'node:assert/strict';
import { measureExcursion,excursionReport,excursionKey } from '../assets/alfa-excursion-model.mjs';
import { PaperTradingEngine,createPaperOrder } from '../assets/alfa-paper-model.mjs';
import { analyzeLab,emptyLab } from '../assets/alfa-lab-model.mjs';
const context={sessionId:'s1',symbol:'BTCUSDT',timeframe:'15m',exchange:'Binance',marketType:'spot'};
const b=(time,open=100,high=104,low=96,close=100)=>({time,open,high,low,close});
function make(order={},ctx=context){
  const engine=new PaperTradingEngine(ctx);
  engine.command('create',{order:createPaperOrder({entry:100,stopLoss:90,takeProfit:140,positionSize:1,strategyId:'fib-0382',...order})},900,'t1');
  return engine;
}
function run(engine,bars,{clock=bars.at(-1).time+900,lowerData=null,trade=null}={}){
  trade??=engine.evaluate(bars,clock).trades[0];
  return measureExcursion({context:engine.context,events:engine.events,bars,clock,trade,lowerData});
}
function manual(order={},bars=[b(0,100,999,1),b(900,100,115,95,110),b(1800,108,999,1)]){
  const e=make(order);e.command('close',{tradeId:'t1'},1800,'close');return {e,bars,result:run(e,bars)};
}
test('long exact excursions in price, percentage and frozen initial R',()=>{
  const {result:r}=manual();assert.equal(r.status,'exact');
  assert.deepEqual(r.mae.price,{lower:5,upper:5});assert.deepEqual(r.mfe.price,{lower:15,upper:15});
  assert.deepEqual(r.mae.percent,{lower:5,upper:5});assert.deepEqual(r.mfe.r,{lower:1.5,upper:1.5});
  assert.equal(r.initialRisk,10);assert.equal(r.realizedR,.8);
});
test('short exact excursions reverse favorable/adverse directions',()=>{
  const {result:r}=manual({direction:'short',stopLoss:110,takeProfit:60},[b(0),b(900,100,106,80,90),b(1800,92,999,1)]);
  assert.equal(r.status,'exact');assert.deepEqual(r.mae.price,{lower:6,upper:6});
  assert.deepEqual(r.mfe.r,{lower:2,upper:2});assert.equal(r.realizedR,.8);
});
test('pre-entry and all post-exit candle extremes are excluded, including manual exit candle',()=>{
  const {e,bars,result:r}=manual();
  const changed=[{...bars[0],high:9999,low:.01},bars[1],{...bars[2],high:99999,low:.001},b(2700,100,1e6,.001)];
  const next=run(e,changed);
  assert.deepEqual(next.mae,r.mae);assert.deepEqual(next.mfe,r.mfe);assert.equal(next.exitBoundary,'open');
});
test('intrabar limit entry returns bounds, never includes pre-entry high as an exact MFE',()=>{
  const {result:r}=manual({orderType:'limit',entry:95,stopLoss:85},[b(0),b(900,100,130,94,96),b(1800,97,999,1)]);
  assert.equal(r.status,'bounded');assert.equal(r.entryBoundary,'candle');
  assert.deepEqual(r.mae.price,{lower:0,upper:1});assert.deepEqual(r.mfe.price,{lower:2,upper:35});
  assert.equal(r.mfe.exact,false);
});
test('favorable open limit fill has an exact start, not an intrabar-entry ambiguity',()=>{
  const {result:r}=manual({orderType:'limit',entry:105,stopLoss:90},[b(0),b(900,100,115,95,110),b(1800,108,999,1)]);
  assert.equal(r.status,'exact');assert.equal(r.entryBoundary,'open');assert.equal(r.mfe.price.lower,15);
});
test('TP candle: MFE stops at target, MAE is bounded; after-exit high and close are not counted',()=>{
  const e=make({takeProfit:125}),r=run(e,[b(0),b(900,100,150,95,140)]);
  assert.equal(r.status,'bounded');assert.equal(r.exitBoundary,'candle');
  assert.deepEqual(r.mfe.price,{lower:25,upper:25});assert.deepEqual(r.mae.price,{lower:0,upper:5});
});
test('SL/TP same candle follows conservative SL-first, clipping post-exit extrema',()=>{
  const e=make({takeProfit:125}),r=run(e,[b(0),b(900,100,150,80,105)]);
  assert.equal(r.exitReason,'Closed SL');assert.deepEqual(r.mae.r,{lower:1,upper:1});
  assert.deepEqual(r.mfe.r,{lower:0,upper:2.5});assert.equal(r.mfe.exact,false);
});
test('short TP and SL boundary clipping is direction-correct',()=>{
  const e=make({direction:'short',stopLoss:110,takeProfit:75});
  const tp=run(e,[b(0),b(900,100,105,50,60)]);
  assert.deepEqual(tp.mfe.r,{lower:2.5,upper:2.5});assert.deepEqual(tp.mae.r,{lower:0,upper:.5});
  const sl=run(e,[b(0),b(900,100,130,50,100)]);
  assert.deepEqual(sl.mae.r,{lower:1,upper:1});assert.deepEqual(sl.mfe.r,{lower:0,upper:2.5});
});
test('intrabar limit fill and same-candle SL has exact adverse touch but unknown favorable excursion',()=>{
  const e=make({orderType:'limit',entry:95,stopLoss:85,takeProfit:120});
  const r=run(e,[b(0),b(900,100,150,80,90)]);
  assert.equal(r.status,'bounded');assert.deepEqual(r.mae.price,{lower:10,upper:10});
  assert.deepEqual(r.mfe.price,{lower:0,upper:55});
});
test('adverse SL gap counts only the exit open, not subsequent overshoot',()=>{
  const e=make(),r=run(e,[b(0),b(900),b(1800,80,130,60,100)]);
  assert.equal(r.exitBoundary,'open');assert.deepEqual(r.mae.r,{lower:2,upper:2});assert.equal(r.mfe.r.upper,.4);
});
test('target gap counts the better exit open, not the obsolete TP or later high',()=>{
  const e=make({takeProfit:125}),r=run(e,[b(0),b(900),b(1800,140,200,100,150)]);
  assert.deepEqual(r.mfe.r,{lower:4,upper:4});assert.equal(r.realizedR,4);
});
test('moving SL does not redefine initial risk; stop-distance utilization and missed profit are ranges',()=>{
  const e=make();e.command('edit',{tradeId:'t1',stopLoss:105,takeProfit:140},1800,'edit');
  const r=run(e,[b(0),b(900,100,115,95,110),b(1800,110,114,104,108)]);
  assert.equal(r.initialRiskPerUnit,10);assert.equal(r.stopDistance.price,10);assert.equal(r.stopDistance.percent,10);
  assert.deepEqual(r.mae.r,{lower:.5,upper:.5});assert.deepEqual(r.stopDistance.utilizationPercent,{lower:50,upper:50});
  assert.deepEqual(r.missedProfitR,{lower:1,upper:1});
});
test('fees/slippage do not turn raw OHLC excursion into Net R or change frozen risk',()=>{
  const {e,bars,result:r}=manual({feeBps:10,slippageBps:10});
  const t=e.evaluate(bars,2700).trades[0];
  assert.equal(r.initialRisk,t.initialRisk);assert.equal(r.netR,t.netR);assert.equal(r.realizedR,t.realizedR);
  assert.ok(Math.abs(r.mae.price.lower-(t.entryPrice-95))<1e-12);
  assert.ok(Math.abs(r.mfe.r.lower-(115-t.entryPrice)/t.initialRiskPerUnit)<1e-12);
});
test('open/unresolved ambiguous and explicit resolution trades are not reported as exact excursions',()=>{
  const open=make();assert.equal(run(open,[b(0),b(900)]).status,'ineligible');
  const e=make({policy:'ambiguous',takeProfit:125}),bars=[b(0),b(900,100,130,80,100)];
  assert.equal(run(e,bars).status,'ineligible');
  e.command('resolve',{tradeId:'t1',outcome:'tp'},1800,'resolve');
  const r=run(e,bars);assert.equal(r.status,'ambiguous-resolution');assert.equal(r.mfe,null);
});
test('missing entry/exit candles, holes, mismatched fills and wrong scope yield no results',()=>{
  const {e,bars}=manual(),trade=e.evaluate(bars,2700).trades[0];
  for(const path of [[],bars.slice(2),[bars[0],bars[2]],bars.slice(0,2)]){
    const r=measureExcursion({context,events:e.events,bars:path,clock:2700,trade});
    assert.equal(r.status,'missing-data');assert.equal(r.mae,null);
  }
  assert.equal(measureExcursion({context,events:e.events,bars,clock:2700,trade:{...trade,entryPrice:99}}).status,'missing-data');
  assert.equal(measureExcursion({context:{...context,sessionId:'other'},events:e.events,bars,clock:2700,trade}).status,'ineligible');
});
test('rewind excludes a previously closed trade; future OHLC cannot restore its outcome early',()=>{
  const {e,bars}=manual(),trade=e.evaluate(bars,2700).trades[0];
  // The recorded manual exit is at this open, but that candle is not confirmed
  // at this replay clock. Its historical close must not be reconstructed early.
  const rewound=measureExcursion({context,events:e.events,bars,clock:1800,trade});
  assert.equal(rewound.status,'missing-data');assert.equal(rewound.mae,null);
  const current=e.evaluate(bars,1800).trades;
  assert.equal(excursionReport(current,[]).summary.measured,0);
  assert.equal(run(e,bars).status,'exact');
});
test('save/restore rederives identical excursion without altering original events',()=>{
  const {e,bars,result}=manual(),original=JSON.stringify(e.serialize()),saved=JSON.parse(original);
  const restored=new PaperTradingEngine(saved.context,saved.events);
  assert.deepEqual(run(restored,bars),result);assert.equal(JSON.stringify(e.serialize()),original);
  assert.ok(!JSON.stringify(result).includes('Infinity'));
});
test('lower-timeframe entry refinement narrows possible pre-entry extremes without changing fills',()=>{
  const {e,bars,result:base}=manual({orderType:'limit',entry:95,stopLoss:85},[b(0),b(900,100,130,94,96),b(1800,97,999,1)]);
  const lowerData={symbol:'BTCUSDT',timeframe:'5m',bars:[
    b(900,100,130,98,100),b(1200,100,101,94,96),b(1500,96,98,95,96)]};
  const r=run(e,bars,{lowerData});
  assert.equal(r.refinement.used,1);assert.deepEqual(r.mfe.price,{lower:3,upper:6});
  assert.ok(r.mfe.price.upper<base.mfe.price.upper);assert.equal(r.initialRisk,base.initialRisk);
});
test('lower-timeframe exit refinement excludes subcandles after TP, not just later primary candles',()=>{
  const e=make({takeProfit:125}),bars=[b(0),b(900,100,150,95,140)];
  const lowerData={symbol:'BTCUSDT',timeframe:'5m',bars:[
    b(900,100,110,98,108),b(1200,108,130,95,125),b(1500,125,150,120,140)]};
  const r=run(e,bars,{lowerData});
  assert.equal(r.refinement.used,1);assert.deepEqual(r.mae.price,{lower:2,upper:5});
  assert.deepEqual(r.mfe.price,{lower:25,upper:25});
});
test('lower path contradicting original conservative SL-first retains original bounds with warning',()=>{
  const e=make({takeProfit:125}),bars=[b(0),b(900,100,130,80,100)],base=run(e,bars);
  const lowerData={symbol:'BTCUSDT',timeframe:'5m',bars:[
    b(900,100,130,95,120),b(1200,120,122,80,90),b(1500,90,105,85,100)]};
  const r=run(e,bars,{lowerData});
  assert.equal(r.refinement.used,0);assert.match(r.refinement.warnings.join(' '),/conflicts/);
  assert.deepEqual(r.mae,base.mae);assert.deepEqual(r.mfe,base.mfe);
});
test('missing/mismatched/wrong-symbol/future lower candles never invent precision',()=>{
  const e=make({takeProfit:125}),bars=[b(0),b(900,100,150,95,140)],base=run(e,bars);
  for(const lowerData of [
    {symbol:'BTCUSDT',timeframe:'5m',bars:[]},
    {symbol:'ETHUSDT',timeframe:'5m',bars:[b(900)]},
    {symbol:'BTCUSDT',timeframe:'5m',bars:[b(900),b(1200),b(1500),b(1800)]}
  ]){
    const r=run(e,bars,{lowerData});assert.equal(r.refinement.used,0);assert.deepEqual(r.mae,base.mae);
    assert.ok(r.refinement.warnings.length);
  }
});
test('report deduplicates trades, flags conflicting results and does not fill absent OHLC with zeros',()=>{
  const {e,bars,result}=manual(),t=e.evaluate(bars,2700).trades[0];
  const r=excursionReport([t,t],[result]);assert.equal(r.summary.total,1);assert.equal(r.excluded.duplicates,1);
  const missing=excursionReport([t],[]);assert.equal(missing.summary.unavailable,1);assert.equal(missing.summary.maeR.lower,null);
  const conflict=excursionReport([t],[result,{...result,status:'changed'}]);
  assert.equal(conflict.summary.measured,0);assert.equal(conflict.rows[0].excursion.status,'conflict');
});
test('same Trade ID in another session cannot borrow an excursion measurement',()=>{
  const {e,bars,result}=manual(),t=e.evaluate(bars,2700).trades[0],other={...t,sessionId:'s2'};
  const r=excursionReport([t,other],[result]);
  assert.notEqual(excursionKey(t),excursionKey(other));assert.equal(r.summary.measured,1);assert.equal(r.summary.unavailable,1);
});
test('Strategy Lab strategy filters and metadata cohorts feed excursions unchanged',()=>{
  const {e,bars}=manual(),t=e.evaluate(bars,2700).trades[0];
  const other={...t,id:'t2',strategyId:'ifvg',netR:-.2};
  const source={context,clock:2700,trades:[t,other],lab:emptyLab(),analytics:{annotations:{}}};
  const lab=analyzeLab([source],{filters:{strategyId:'fib-0382'}});
  const result=run(e,bars),report=excursionReport(lab.rows,[result]);
  assert.equal(report.rows.length,1);assert.equal(report.groups.strategyId[0].value,'fib-0382');
  assert.equal(report.groups.outcome[0].value,'Winning');assert.equal(report.summary.mfeR.lower,1.5);
});
