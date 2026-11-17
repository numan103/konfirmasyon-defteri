import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeTrades,emptyAnalytics,mergeAnalytics,validateAnalytics,screenshotBytes,SCREENSHOT_BYTES } from '../assets/alfa-strategy-model.mjs';
import { imageDimensions,sanitizeScreenshot } from '../assets/alfa-strategy-images.mjs';
import { PaperTradingEngine,createPaperOrder } from '../assets/alfa-paper-model.mjs';
const trade=(id,netR,extra={})=>({id,sessionId:'s1',symbol:'BTCUSDT',timeframe:'15m',direction:'long',orderType:'market',
  strategyId:'fib-0382',entryTime:0,exitTime:900,entryPrice:100,exitPrice:100+netR*10,initialRisk:10,
  realizedR:netR,netR,fees:0,slippage:0,status:'Closed Manual',...extra});
const fixture=[trade('a',2,{exitTime:900}),trade('b',-1,{exitTime:1800,strategyId:'ifvg',direction:'short'}),
  trade('c',-.5,{exitTime:2700,strategyId:'ifvg'}),trade('d',0,{exitTime:3600}),trade('e',3,{exitTime:4500})];
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-12,`${a} != ${b}`);
const annotation=(extra={})=>({strategyId:'ifvg',setup:'setup',rationale:'reason',mistakes:'mistake',notes:'note',screenshot:null,revision:1,...extra});
test('fixed fixture: counts, win rate, expectancy, average wins/losses and gross/net R',()=>{
  const m=analyzeTrades(fixture).summary;
  assert.equal(m.totalTrades,5);assert.equal(m.winningTrades,2);assert.equal(m.losingTrades,2);assert.equal(m.breakevenTrades,1);
  assert.equal(m.winRate,40);assert.equal(m.averageWinR,2.5);assert.equal(m.averageLossR,-.75);
  assert.equal(m.totalNetR,3.5);assert.equal(m.totalGrossR,3.5);assert.equal(m.expectancy,.7);assert.equal(m.averageNetR,.7);
  near(m.profitFactor,5/1.5);assert.equal(m.longestLossStreak,2);assert.equal(m.longestWinStreak,1);
  assert.equal(m.averageTradeDuration,2700);
});
test('equity sorts actual exits; drawdown, zero baseline, peak and recovery',()=>{
  const m=analyzeTrades([...fixture].reverse()).summary;
  assert.deepEqual(m.curve.map(p=>p.tradeId),['a','b','c','d','e']);
  assert.deepEqual(m.curve.map(p=>p.cumulativeNetR),[2,1,.5,.5,3.5]);
  assert.deepEqual(m.curve.map(p=>p.drawdown),[0,1,1.5,1.5,0]);
  assert.equal(m.maximumDrawdown,1.5);assert.equal(m.curve.at(-1).peakEquity,3.5);
  assert.equal(m.curve.at(-1).recovery,1.5);assert.equal(m.curve.at(-1).recovered,true);
  assert.equal(analyzeTrades([trade('a',-1)]).summary.maximumDrawdown,1);
});
test('commission-adjusted net R, not gross, drives classification and profit factor',()=>{
  const m=analyzeTrades([trade('a',-.1,{realizedR:.1,fees:2}),trade('b',1)]).summary;
  assert.equal(m.winningTrades,1);assert.equal(m.losingTrades,1);assert.equal(m.totalGrossR,1.1);
  assert.equal(m.totalNetR,.9);assert.equal(m.profitFactor,10);
});
test('tiny nonzero R remains win/loss rather than fabricated breakeven',()=>{
  assert.equal(analyzeTrades([trade('a',1e-12)]).summary.winningTrades,1);
});
test('no-loss, empty and all-breakeven profit factor serializes safely',()=>{
  for(const [rows,status] of [[[],'no-results'],[[trade('a',0)],'no-results'],[[trade('a',1)],'no-losses']]){
    const m=analyzeTrades(rows).summary;
    assert.equal(m.profitFactor,null);assert.equal(m.profitFactorStatus,status);
    assert.ok(!JSON.stringify(m).includes('Infinity'));
  }
  const m=analyzeTrades([]).summary;assert.equal(m.totalTrades,0);assert.equal(m.expectancy,null);assert.deepEqual(m.curve,[]);
});
test('all filters recompute every output, including strategy comparison and histogram',()=>{
  for(const [filters,ids] of [
    [{direction:'short'},['b']],[{strategyId:'ifvg'},['b','c']],[{symbol:'ETHUSDT'},[]],
    [{timeframe:'1h'},[]],[{orderType:'limit'},[]],[{exitReason:'Closed TP'},[]],[{from:1800,to:2700},['b','c']]
  ]){
    const r=analyzeTrades(fixture,{filters});assert.deepEqual(r.rows.map(t=>t.id),ids);
    assert.equal(r.summary.totalTrades,ids.length);assert.equal(r.summary.curve.length,ids.length);
    assert.equal(r.histogram.reduce((s,b)=>s+b.count,0),ids.length);
    assert.equal(r.comparison.reduce((s,b)=>s+b.totalTrades,0),ids.length);
  }
});
test('open, unresolved ambiguous, cancelled and invalid trades excluded separately',()=>{
  const r=analyzeTrades([trade('a',2,{status:'Open'}),trade('b',2,{ambiguous:{time:900}}),
    trade('c',1,{status:'Cancelled'}),trade('d',NaN),trade('e',1,{initialRisk:0})]);
  assert.equal(r.summary.totalTrades,0);assert.equal(r.excluded.open,1);assert.equal(r.excluded.ambiguous,1);
  assert.equal(r.excluded.inactive,1);assert.equal(r.excluded.invalid,2);
});
test('resolved ambiguity is included and marked explicitly',()=>{
  const r=analyzeTrades([trade('a',2)],{ambiguityIds:['a']});
  assert.equal(r.rows[0].ambiguityStatus,'resolved');assert.equal(r.summary.totalTrades,1);
});
test('duplicate IDs counted once; financial conflicts excluded without choosing a winner',()=>{
  let r=analyzeTrades([fixture[0],structuredClone(fixture[0])]);
  assert.equal(r.summary.totalTrades,1);assert.equal(r.excluded.duplicates,1);
  r=analyzeTrades([fixture[0],{...fixture[0],netR:100}]);
  assert.equal(r.summary.totalTrades,0);assert.equal(r.excluded.conflicts,1);
});
test('session and active branch scope excludes other versions, never double counts snapshots',()=>{
  const rows=[trade('a',1),trade('a',2,{branchId:'alternate'}),trade('a',3,{sessionId:'s2'})];
  assert.equal(analyzeTrades(rows,{sessionId:'s1'}).summary.totalNetR,1);
  assert.equal(analyzeTrades(rows,{sessionId:'s1',branchId:'alternate'}).summary.totalNetR,2);
});
test('same exit ties are deterministic by trade ID',()=>{
  assert.deepEqual(analyzeTrades([trade('z',-1),trade('a',1)]).rows.map(t=>t.id),['a','z']);
});
test('strategy comparison and journal overrides do not change immutable financial values',()=>{
  const before=structuredClone(fixture);
  const r=analyzeTrades(fixture,{annotations:{a:annotation()}});
  assert.equal(r.comparison.find(s=>s.strategyId==='ifvg').totalTrades,3);
  assert.equal(r.rows[0].initialRisk,10);assert.deepEqual(fixture,before);
});
test('old paper journals without analytics receive default categories and empty filters',()=>{
  const doc=mergeAnalytics([undefined,null]);
  assert.deepEqual(doc,emptyAnalytics());assert.equal(doc.strategies.length,4);
});
test('annotations, custom categories, screenshots and filters round trip as existing payload data',()=>{
  const doc=emptyAnalytics();doc.revision=1;doc.strategies.push({id:'mine',name:'My setup'});
  doc.annotations.a=annotation({strategyId:'mine'});doc.filters={direction:'short',from:0,to:1800};
  assert.deepEqual(mergeAnalytics([JSON.parse(JSON.stringify(doc))]),doc);
});
test('newer annotation wins; same revision divergent journal fails preserving inputs',()=>{
  const a=emptyAnalytics();a.annotations.t=annotation();a.revision=1;
  const b=structuredClone(a);b.annotations.t.revision=2;b.annotations.t.notes='new';b.revision=2;
  assert.equal(mergeAnalytics([b,a]).annotations.t.notes,'new');
  const c=structuredClone(a);c.annotations.t.notes='conflict';
  assert.throws(()=>mergeAnalytics([a,c]),/conflict/);assert.equal(a.annotations.t.notes,'note');
});
test('category conflicts, invalid date ranges, oversized journal text and prototype keys rejected',()=>{
  const a=emptyAnalytics(),b=emptyAnalytics();b.strategies[0].name='wrong';
  assert.throws(()=>mergeAnalytics([a,b]),/conflict/);
  for(const filters of [{from:10,to:0},{from:Infinity},{to:1e16}]){
    assert.throws(()=>validateAnalytics({...a,filters}));
  }
  a.annotations.t=annotation({notes:'a'.repeat(2001)});assert.throws(()=>validateAnalytics(a));
  a.annotations=JSON.parse('{"__proto__":{}}');assert.throws(()=>validateAnalytics(a));
});
test('screenshots reject external URLs, SVG and per-image/session quota excess',()=>{
  for(const s of ['https://example.com/img.png','data:image/svg+xml;base64,AAAA','javascript:alert(1)'])assert.throws(()=>screenshotBytes(s));
  const sized=n=>{
    const bytes=Buffer.alloc(n);Buffer.from('ffd8ffc00008080001000100','hex').copy(bytes);
    return 'data:image/jpeg;base64,'+bytes.toString('base64');
  };
  assert.equal(screenshotBytes(sized(SCREENSHOT_BYTES)),SCREENSHOT_BYTES);
  assert.throws(()=>screenshotBytes(sized(SCREENSHOT_BYTES+1)));
  const a=emptyAnalytics();
  for(let i=0;i<5;i++)a.annotations[i]=annotation({screenshot:sized(SCREENSHOT_BYTES)});
  assert.throws(()=>validateAnalytics(a),/1 MB/);
});
test('PNG/JPEG header dimensions checked before browser decoding; bad types/size rejected',async()=>{
  const png=Buffer.from('89504e470d0a1a0a0000000d494844520000000200000003','hex');
  assert.deepEqual(imageDimensions(png,'image/png'),{width:2,height:3});
  assert.throws(()=>imageDimensions(new Uint8Array(25),'image/png'));
  await assert.rejects(sanitizeScreenshot({type:'image/svg+xml',size:1}));
  await assert.rejects(sanitizeScreenshot({type:'image/png',size:2*1024*1024+1}));
  const huge=Buffer.from(png);huge.writeUInt32BE(9000,16);
  await assert.rejects(sanitizeScreenshot({type:'image/png',size:huge.length,arrayBuffer:async()=>huge}),/dimensions/);
});
test('overflow fails explicitly and large histogram values never create an unbounded loop',()=>{
  assert.throws(()=>analyzeTrades([trade('a',1e308,{exitPrice:100}),trade('b',1e308,{exitPrice:100})]),/overflow/);
  const r=analyzeTrades([trade('a',1e100,{exitPrice:100})]);assert.ok(r.histogram.length<=31);
});
test('actual Paper results: wins/losses/costs/manual close and rewind update analytics without accumulation',()=>{
  const ctx={sessionId:'s1',symbol:'BTCUSDT',timeframe:'15m',exchange:'Binance',marketType:'spot'};
  const e=new PaperTradingEngine(ctx);
  e.command('create',{order:createPaperOrder({entry:100,stopLoss:90,takeProfit:120,positionSize:1,feeBps:10,strategyId:'ifvg'})},900,'a');
  const bars=[{time:0,open:100,high:104,low:96,close:100},{time:900,open:100,high:121,low:96,close:110}];
  let t=e.evaluate(bars,1800).trades[0];assert.equal(t.realizedR,2);near(t.netR,2-.22/10);
  assert.equal(analyzeTrades([t]).summary.totalTrades,1);
  assert.equal(analyzeTrades(e.evaluate(bars,900).trades).summary.totalTrades,0);
  const saved=JSON.parse(JSON.stringify(e.serialize()));
  assert.deepEqual(analyzeTrades(new PaperTradingEngine(ctx,saved.events).evaluate(bars,1800).trades),analyzeTrades([t]));
  const loss=new PaperTradingEngine(ctx);loss.command('create',{order:createPaperOrder({entry:100,stopLoss:90,positionSize:1})},900,'b');
  assert.equal(analyzeTrades(loss.evaluate([bars[0],{time:900,open:100,high:104,low:89,close:95}],1800).trades).summary.totalNetR,-1);
  const manual=new PaperTradingEngine(ctx);manual.command('create',{order:createPaperOrder({entry:100,stopLoss:90,positionSize:1})},900,'m');
  manual.command('close',{tradeId:'m'},1800,'exit');
  const state=manual.evaluate([bars[0],{...bars[0],time:900},{time:1800,open:110,high:114,low:108,close:112}],2700);
  assert.equal(analyzeTrades(state.trades).rows[0].status,'Closed Manual');assert.equal(analyzeTrades(state.trades).summary.totalNetR,1);
});
