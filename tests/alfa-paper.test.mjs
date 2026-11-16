import test from 'node:test';
import assert from 'node:assert/strict';
import { PaperTradingEngine, createPaperOrder } from '../assets/alfa-paper-model.mjs';
const ctx={sessionId:'replay-test',symbol:'BTCUSDT',exchange:'Binance',marketType:'spot',timeframe:'15m'};
const b=(time,open=100,high=104,low=96,close=100)=>({time,open,high,low,close});
const make=(input={})=>{
  const e=new PaperTradingEngine(ctx);
  e.command('create',{order:createPaperOrder({entry:100,stopLoss:90,...input,positionSize:1})},900,'t1');
  return e;
};
const evaluate=(e,bars)=>e.evaluate(bars,bars.at(-1).time+900).trades[0];
test('market long is pending at order clock; fills only at next open',()=>{
  const e=make();
  assert.equal(evaluate(e,[b(0)]).status,'Pending');
  const t=evaluate(e,[b(0),b(900,102,104,98,103)]);
  assert.equal(t.entryPrice,102);assert.equal(t.entryTime,900);assert.equal(t.status,'Open');
});
test('market short fills next open and short-side TP realizes positive R',()=>{
  const e=make({direction:'short',stopLoss:110,takeProfit:75});
  const t=evaluate(e,[b(0),b(900,100,101,74,80)]);
  assert.equal(t.status,'Closed TP');assert.equal(t.realizedR,2.5);
});
test('long TP and SL result in 2.5R and -1R with zero costs',()=>{
  for(const [bar,status,r] of [[b(900,100,126,96,120),'Closed TP',2.5],[b(900,100,104,89,95),'Closed SL',-1]]){
    const t=evaluate(make(),[b(0),bar]);
    assert.equal(t.status,status);assert.equal(t.realizedR,r);assert.equal(t.netR,r);
  }
});
test('limit long touches only subsequent candles; favorable gap never fills above limit',()=>{
  const e=make({orderType:'limit',entry:95,stopLoss:85,takeProfit:120});
  assert.equal(evaluate(e,[b(0)]).status,'Pending');
  assert.equal(evaluate(e,[b(0),b(900,100,104,96,100)]).status,'Pending');
  const t=evaluate(e,[b(0),b(900,94,98,90,95)]);
  assert.equal(t.entryPrice,94);assert.equal(t.status,'Open');
});
test('limit short uses favorable higher open and never fills below sell limit',()=>{
  const e=make({direction:'short',orderType:'limit',entry:105,stopLoss:115,takeProfit:80});
  const t=evaluate(e,[b(0),b(900,107,109,101,103)]);
  assert.equal(t.entryPrice,107);assert.equal(t.status,'Open');
});
test('intrabar limit TP-only touch is not awarded when order may have filled afterward',()=>{
  const t=evaluate(make({orderType:'limit',entry:95,stopLoss:85,takeProfit:105}),[b(0),b(900,100,110,94,96)]);
  assert.equal(t.status,'Open');assert.equal(t.entryPrice,95);
});
test('both SL and TP in same candle defaults to conservative SL first',()=>{
  const t=evaluate(make(),[b(0),b(900,100,130,80,105)]);
  assert.equal(t.status,'Closed SL');assert.equal(t.realizedR,-1);
});
test('ambiguous policy freezes position until an explicit resolution command',()=>{
  const e=make({policy:'ambiguous'});
  let t=evaluate(e,[b(0),b(900,100,130,80,105)]);
  assert.equal(t.status,'Open');assert.ok(t.ambiguous);
  e.command('resolve',{tradeId:'t1',outcome:'sl'},1800,'resolve1');
  t=evaluate(e,[b(0),b(900,100,130,80,105)]);
  assert.equal(t.status,'Closed SL');
});
test('existing stop fills at adverse gap open, not the obsolete stop price',()=>{
  const t=evaluate(make(),[b(0),b(900),b(1800,80,84,78,82)]);
  assert.equal(t.exitPrice,80);assert.equal(t.realizedR,-2);
});
test('entry gap invalidating risk is cancelled, never assigned zero/negative initial risk',()=>{
  const t=evaluate(make(),[b(0),b(900,80,84,78,82)]);
  assert.equal(t.status,'Cancelled');assert.equal(t.entryTime,null);
});
test('fees spread and slippage affect fills and Net R without double subtracting slippage',()=>{
  const t=evaluate(make({feeBps:10,slippageBps:10,spread:2}),[b(0),b(900,100,104,96,100),b(1800,100,130,96,120)]);
  assert.ok(t.entryPrice>100);assert.ok(t.exitPrice<125);assert.ok(t.fees>0&&t.slippage>0);
  const expected=(t.exitPrice-t.entryPrice)/(t.entryPrice-90);
  assert.ok(Math.abs(t.realizedR-expected)<1e-12);
  assert.ok(Math.abs(t.netR-(expected-t.fees/t.initialRisk))<1e-12);
});
test('SL edit keeps initial 1R frozen; manual close executes on next open',()=>{
  const e=make();
  e.command('edit',{tradeId:'t1',stopLoss:95,takeProfit:125},1800,'edit1');
  e.command('close',{tradeId:'t1'},1800,'close1');
  const t=evaluate(e,[b(0),b(900),b(1800,110,113,108,112)]);
  assert.equal(t.status,'Closed Manual');assert.equal(t.exitPrice,110);
  assert.equal(t.initialSL,90);assert.equal(t.initialRisk,10);assert.equal(t.realizedR,1);
});
test('pending cancellation happens before the following candle fill',()=>{
  const e=make();e.command('cancel',{tradeId:'t1'},900,'cancel1');
  assert.equal(evaluate(e,[b(0),b(900)]).status,'Cancelled');
});
test('profit-lock stop may cross entry while original risk stays unchanged',()=>{
  const e=make();
  e.command('edit',{tradeId:'t1',stopLoss:105,takeProfit:125},1800,'lock1');
  const t=evaluate(e,[b(0),b(900,100,115,96,110),b(1800,110,114,104,108)]);
  assert.equal(t.status,'Closed SL');assert.equal(t.initialRisk,10);assert.equal(t.realizedR,.5);
});
test('expiration happens before fill',()=>{
  const e=make({expiresAt:900});
  assert.equal(evaluate(e,[b(0),b(900)]).status,'Expired');
});
test('zero risk/wrong-side levels and invalid costs are rejected',()=>{
  for(const o of [{stopLoss:100},{stopLoss:105},{takeProfit:99},{positionSize:0},{feeBps:-1}]){
    assert.throws(()=>createPaperOrder({entry:100,stopLoss:90,positionSize:1,...o}));
  }
});
test('partial candles cannot execute and missing source candles halt evaluation',()=>{
  const e=make();
  assert.equal(e.evaluate([b(0),b(900)],1000).trades[0].status,'Pending');
  assert.throws(()=>e.evaluate([b(0),b(1800)],2700),/Missing/);
});
test('duplicate execution is impossible on recomputation; same journal is deterministic',()=>{
  const e=make(),bars=[b(0),b(900),b(1800,100,126,96,120)];
  const a=e.evaluate(bars,2700),c=e.evaluate(bars,2700);
  assert.deepEqual(a,c);assert.equal(a.history.filter(h=>h.type==='Filled').length,1);
  assert.throws(()=>e.command('close',{tradeId:'t1'},2700,'t1'),/duplicate/);
});
test('rewind removes future exits and then fills; saved journal restores deterministically',()=>{
  const e=make(),bars=[b(0),b(900),b(1800,100,126,96,120)];
  const s=e.serialize(),restored=new PaperTradingEngine(s.context,s.events);
  assert.deepEqual(e.evaluate(bars,2700),restored.evaluate(bars,2700));
  assert.equal(e.evaluate(bars,1800).trades[0].status,'Open');
  assert.equal(e.evaluate(bars,900).trades[0].status,'Pending');
  assert.equal(e.evaluate(bars,0).trades.length,0);
});
