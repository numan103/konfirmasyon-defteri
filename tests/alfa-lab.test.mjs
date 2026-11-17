import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyLab,validateLab,mergeLab,recordObservation,observationFor,analyzeLab,sampleWarning,sourceKey } from '../assets/alfa-lab-model.mjs';
import { rrScenario,RR_TARGETS } from '../assets/alfa-lab-scenarios.mjs';
import { labSnapshot,savedLabSources } from '../assets/alfa-lab-store.mjs';
import { emptyAnalytics,analyzeTrades } from '../assets/alfa-strategy-model.mjs';
import { PaperTradingEngine,createPaperOrder } from '../assets/alfa-paper-model.mjs';
const ctx={sessionId:'s1',symbol:'BTCUSDT',timeframe:'15m',exchange:'Binance',marketType:'spot'};
const bar=(time,open=100,high=104,low=96,close=100)=>({time,open,high,low,close});
function engine(order={},id='t1',context=ctx){
  const e=new PaperTradingEngine(context);e.command('create',{order:createPaperOrder({entry:100,stopLoss:90,positionSize:1,
    strategyId:'fib-0382',labOrigin:{clock:900,observedThrough:900,reliable:true},...order})},900,id);return e;
}
const evaluated=(e,bars,clock=bars.at(-1).time+900)=>e.evaluate(bars,clock).trades[0];
const source=(trades,extra={})=>({context:ctx,clock:4500,trades,lab:emptyLab(),analytics:emptyAnalytics(),...extra});
const trade=(id,netR,extra={})=>({id,sessionId:'s1',symbol:'BTCUSDT',timeframe:'15m',direction:'long',orderType:'market',
  strategyId:'fib-0382',entryTime:900,exitTime:1800,entryPrice:100,exitPrice:100+netR*10,initialRisk:10,realizedR:netR,
  netR,fees:0,slippage:0,status:'Closed Manual',...extra});
const tag=(doc,t,values,options={})=>recordObservation(doc,t,values,{},{
  clock:2700,observedThrough:2700,reliable:true,strategyId:t.strategyId||'fib-0382',...options});
const memory=entries=>{const map=new Map(entries);return {get length(){return map.size;},key:i=>[...map.keys()][i],
  getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)};};
const paperKey=(owner,c=ctx)=>`alfa-paper:v1:${owner}:${c.symbol}:${c.timeframe}:${c.sessionId}`;
const payload=(e,bars,clock,capturedAt=1)=>({...e.serialize(),analytics:emptyAnalytics(),lab:emptyLab(),labSnapshot:labSnapshot(e,{bars,clock},capturedAt)});
test('0.382, IFVG and Custom templates expose required strategy fields; custom fields round trip',()=>{
  const doc=emptyLab();
  assert.deepEqual(doc.templates.map(t=>t.id),['fib-0382','ifvg','custom']);
  assert.ok(doc.templates[0].fields.some(f=>f.key==='entry0382'));
  assert.ok(doc.templates[1].fields.some(f=>f.key==='invalidationType'));
  doc.templates.push({id:'custom-one',name:'Custom one',fields:[{key:'liquidity',label:'Liquidity'}]});
  assert.deepEqual(validateLab(JSON.parse(JSON.stringify(doc))),doc);
});
test('post-close metadata is retrospective, preserves trade values and observation history',()=>{
  const t=trade('t1',2),before=structuredClone(t);
  let doc=tag(emptyLab(),t,{session:'London',htfBias:'aligned'});
  assert.equal(doc.annotations.t1[0].provenance,'retrospective');
  doc=tag(doc,t,{session:'New York'},{clock:3600,observedThrough:3600});
  assert.equal(doc.annotations.t1.length,2);assert.equal(observationFor(t,doc,2700).values.session,'London');
  assert.equal(observationFor(t,doc,3600).values.session,'New York');assert.deepEqual(t,before);
});
test('new pending trade may record pre-entry info; legacy pending or unreliable storage cannot',()=>{
  const e=engine(),pending=e.evaluate([bar(0)],900).trades[0];
  const doc=tag(emptyLab(),pending,{session:'London'},{clock:900,observedThrough:900});
  assert.equal(doc.annotations.t1[0].provenance,'pre-entry');
  for(const t of [{...pending,labOrigin:undefined},{...pending,labOrigin:{...pending.labOrigin,reliable:false}}]){
    assert.equal(tag(emptyLab(),t,{}, {clock:900,observedThrough:900}).annotations.t1[0].provenance,'retrospective');
  }
  assert.equal(tag(emptyLab(),pending,{}, {clock:900,observedThrough:900,reliable:false}).annotations.t1[0].provenance,'retrospective');
});
test('rewinding after seeing future does not create contemporaneous labels',()=>{
  const t=engine().evaluate([bar(0)],900).trades[0];
  const doc=tag(emptyLab(),t,{htfBias:'aligned'},{clock:900,observedThrough:4500});
  assert.equal(doc.annotations.t1[0].provenance,'retrospective');
  assert.equal(observationFor(t,doc,900,'pre-entry'),null);
});
test('known-only uses original pre-entry revision even after retrospective relabelling',()=>{
  const pending=engine().evaluate([bar(0)],900).trades[0],closed=trade('t1',2);
  let doc=tag(emptyLab(),pending,{htfBias:'countertrend'},{clock:900,observedThrough:900});
  doc=tag(doc,closed,{htfBias:'aligned'},{clock:2700,observedThrough:2700});
  assert.equal(analyzeLab([source([closed],{lab:doc})]).rows[0].labValues.htfBias,'aligned');
  assert.equal(analyzeLab([source([closed],{lab:doc})],{filters:{knowledge:'pre-entry'}}).rows[0].labValues.htfBias,'countertrend');
  assert.equal(observationFor(closed,doc,1800).values.htfBias,'countertrend');
});
test('future Lab/Tester edits do not leak into earlier clocks',()=>{
  const t=trade('t1',2),doc=tag(emptyLab(),t,{session:'London'},{clock:3600,observedThrough:3600,strategyId:'ifvg'});
  const analytics=emptyAnalytics();analytics.annotations.t1={strategyId:'ifvg',recordedReplayTime:3600};
  const r=analyzeLab([source([t],{clock:2700,lab:doc,analytics})]);
  assert.equal(r.rows[0].strategyId,'fib-0382');assert.equal(r.rows[0].labKnowledge,'unlabelled');
  assert.equal(r.rows[0].labValues.session,undefined);
});
test('all Lab filters: strategy/symbol/timeframe/session/bias/displacement/direction/setup/entry/RR/date',()=>{
  const rows=[trade('a',2),trade('b',-1,{direction:'short',strategyId:'ifvg',exitTime:3600})];
  let doc=tag(emptyLab(),rows[0],{session:'London',htfBias:'aligned',displacement:'yes',setupType:'Retracement',entryModel:'0.382',rrTarget:'2.5'});
  doc=tag(doc,rows[1],{session:'New York',htfBias:'countertrend',displacement:'no',setupType:'IFVG',entryModel:'Retest',rrTarget:'3'});
  const s=source(rows,{lab:doc});
  for(const filters of [{strategyId:'ifvg'},{direction:'short'},{session:'New York'},{htfBias:'countertrend'},{displacement:'no'},
    {setupType:'IFVG'},{entryModel:'Retest'},{rrTarget:'3'},{from:3000,to:4000}]){
    const r=analyzeLab([s],{filters});assert.deepEqual(r.rows.map(t=>t.id),['b']);assert.equal(r.summary.totalNetR,-1);
  }
  assert.equal(analyzeLab([s],{filters:{symbol:'ETHUSDT'}}).summary.totalTrades,0);
  assert.equal(analyzeLab([s],{filters:{timeframe:'1h'}}).summary.totalTrades,0);
  assert.equal(analyzeLab([s],{filters:{replaySessionId:'other'}}).summary.totalTrades,0);
});
test('multiple market/timeframe sources compare real per-scope rows',()=>{
  const a=source([trade('a',2)]),context={...ctx,sessionId:'s2',symbol:'ETHUSDT',timeframe:'1h'};
  const b=source([trade('b',-1,{...context})],{context});
  const r=analyzeLab([a,b],{groupBy:'symbol'});
  assert.equal(r.summary.totalTrades,2);assert.equal(r.cohorts.symbol.length,2);assert.equal(r.cohorts.timeframe.length,2);
  assert.equal(analyzeLab([a,b],{filters:{symbol:'ETHUSDT',timeframe:'1h'}}).summary.totalNetR,-1);
});
test('HTF, session, displacement and long/short comparisons share Tester metrics',()=>{
  const rows=[trade('a',2),trade('b',-1,{direction:'short'}),trade('c',-.5,{exitTime:2700})];
  let doc=emptyLab();
  for(let i=0;i<rows.length;i++)doc=tag(doc,rows[i],{htfBias:i?'countertrend':'aligned',session:i?'New York':'London',displacement:i?'no':'yes'});
  const r=analyzeLab([source(rows,{lab:doc})]);
  assert.deepEqual(r.summary,analyzeTrades(rows).summary);
  assert.equal(r.cohorts.htfBias.find(r=>r.value==='aligned').summary.expectancy,2);
  assert.equal(r.cohorts.displacement.find(r=>r.value==='no').summary.expectancy,-.75);
  assert.equal(r.cohorts.direction.find(r=>r.value==='short').summary.totalNetR,-1);
  assert.deepEqual(r.summary.curve.map(p=>p.cumulativeNetR),[2,1,.5]);assert.equal(r.summary.maximumDrawdown,1.5);
});
test('sample size bands are descriptive; every cohort carries its count and warning',()=>{
  assert.equal(sampleWarning(10),'Düşük örneklem');assert.equal(sampleWarning(30),'Sınırlı örneklem');
  assert.equal(sampleWarning(100),'Daha güçlü örneklem');
  const r=analyzeLab([source([trade('a',1)])]);assert.equal(r.cohorts.htfBias[0].summary.totalTrades,1);
  assert.equal(r.cohorts.htfBias[0].sampleWarning,'Düşük örneklem');
});
test('open/ambiguous/conflicting IDs and branches retain Tester exclusion rules',()=>{
  const r=analyzeLab([source([trade('a',1,{status:'Open'}),trade('b',2,{ambiguous:{}}),
    trade('c',1),trade('c',2),trade('d',1,{branchId:'fork'})])]);
  assert.equal(r.summary.totalTrades,0);assert.equal(r.excluded.open,1);assert.equal(r.excluded.ambiguous,1);assert.equal(r.excluded.conflicts,1);
});
test('Lab metadata merges revisions without losing older observations and rejects divergent same revisions',()=>{
  const t=trade('a',1),a=tag(emptyLab(),t,{session:'London'}),b=tag(a,t,{session:'New York'});
  const restored=mergeLab([JSON.parse(JSON.stringify(b)),a]);
  assert.equal(restored.annotations.a.length,2);assert.equal(restored.annotations.a[1].values.session,'New York');
  const conflict=structuredClone(a);conflict.annotations.a[0].values.session='changed';
  assert.throws(()=>mergeLab([a,conflict]),/conflict/);
});
test('invalid provenance, prototype keys, oversized metadata and reversed dates rejected',()=>{
  const doc=tag(emptyLab(),trade('a',1),{session:'London'});
  const bad=structuredClone(doc);bad.annotations.a[0].provenance='pre-entry';bad.annotations.a[0].observedThrough=4000;
  assert.throws(()=>validateLab(bad),/Lookahead/);
  assert.throws(()=>validateLab({...doc,annotations:JSON.parse('{"__proto__":[]}')}));
  assert.throws(()=>tag(emptyLab(),trade('a',1),{session:'a'.repeat(301)}));
  assert.throws(()=>tag(emptyLab(),trade('__proto__',1),{}),/trade ID/);
  assert.throws(()=>validateLab({...doc,filters:{from:3000,to:900}}));
});
test('RR targets use real OHLC: 2/2.5/3R reach at different candles',()=>{
  const e=engine(),bars=[bar(0),bar(900,100,126,96,120),bar(1800,120,131,115,130)];
  const t=evaluated(e,bars);
  const before=JSON.stringify(e.serialize());
  for(const target of RR_TARGETS){
    const r=rrScenario({context:ctx,events:e.events,bars,clock:2700,trade:t,target});
    assert.equal(r.status,'complete');assert.equal(r.result.netR,target);assert.equal(r.result.initialRisk,t.initialRisk);
    assert.equal(r.result.exitTime,target===3?2700:1800);
  }
  assert.equal(JSON.stringify(e.serialize()),before);
});
test('final +2.5R alone cannot imply +3R: subsequent real reversal loses 1R',()=>{
  const e=engine(),bars=[bar(0),bar(900,100,126,96,120),bar(1800,120,124,89,95)],t=evaluated(e,bars);
  assert.equal(t.netR,2.5);
  const r=rrScenario({context:ctx,events:e.events,bars,clock:2700,trade:t,target:3});
  assert.equal(r.status,'complete');assert.equal(r.result.netR,-1);
});
test('RR never reads future candles; unclosed paths produce no result',()=>{
  const e=engine(),bars=[bar(0),bar(900,100,126,96,120),bar(1800,120,131,115,130)],t=evaluated(e,bars,1800);
  const r=rrScenario({context:ctx,events:e.events,bars,clock:1800,trade:t,target:3});
  assert.equal(r.status,'unresolved');assert.equal(r.result,null);
});
test('RR gaps, missing prefix and missing end coverage produce no results',()=>{
  const e=engine(),bars=[bar(0),bar(900),bar(1800,100,126,96,120)],t=evaluated(e,bars);
  for(const path of [[],[bars[2]],[bars[0],bars[2]],bars.slice(0,2)]){
    const r=rrScenario({context:ctx,events:e.events,bars:path,clock:2700,trade:t,target:2});
    assert.equal(r.status,'missing-data');assert.equal(r.result,null);
  }
});
test('RR collision is conservative SL-first for every target, not fabricated TP',()=>{
  const e=engine(),bars=[bar(0),bar(900,100,135,85,100)],t=evaluated(e,bars);
  for(const target of RR_TARGETS){
    const r=rrScenario({context:ctx,events:e.events,bars,clock:1800,trade:t,target});
    assert.equal(r.result.netR,-1);assert.equal(r.result.status,'Closed SL');
  }
});
test('RR short direction, adverse gaps and fees reuse Paper fill arithmetic',()=>{
  const e=engine({direction:'short',stopLoss:110,takeProfit:75,feeBps:10,slippageBps:1});
  const bars=[bar(0),bar(900,100,104,96,100),bar(1800,120,124,118,122)],t=evaluated(e,bars);
  for(const target of RR_TARGETS){
    const r=rrScenario({context:ctx,events:e.events,bars,clock:2700,trade:t,target});
    assert.equal(r.status,'complete');assert.equal(r.result.entryPrice,t.entryPrice);
    assert.equal(r.result.exitPrice,t.exitPrice);assert.equal(r.result.netR,t.netR);assert.ok(r.result.netR< -2);
  }
});
test('RR intrabar limit TP-only touches are deferred according to existing policy',()=>{
  const e=engine({orderType:'limit',entry:95,stopLoss:85,takeProfit:120});
  const bars=[bar(0),bar(900,100,132,94,100),bar(1800,100,126,94,120)],t=evaluated(e,bars);
  const r=rrScenario({context:ctx,events:e.events,bars,clock:2700,trade:t,target:3});
  assert.equal(r.status,'complete');assert.equal(r.result.entryPrice,95);assert.equal(r.result.exitTime,2700);assert.equal(r.result.netR,3);
});
test('RR preserves original SL edits and manual-close commands',()=>{
  const e=engine();e.command('edit',{tradeId:'t1',stopLoss:105,takeProfit:125},1800,'edit');
  const bars=[bar(0),bar(900,100,115,96,110),bar(1800,110,114,104,108)],t=evaluated(e,bars);
  assert.equal(rrScenario({context:ctx,events:e.events,bars,clock:2700,trade:t,target:3}).result.netR,.5);
  const m=engine();m.command('close',{tradeId:'t1'},1800,'close');
  const path=[bar(0),bar(900),bar(1800,110,114,108,112)],manual=evaluated(m,path);
  for(const target of RR_TARGETS){
    const r=rrScenario({context:ctx,events:m.events,bars:path,clock:2700,trade:manual,target});
    assert.equal(r.result.status,'Closed Manual');assert.equal(r.result.netR,1);
  }
});
test('RR rejects unresolved ambiguous, mismatched executions and wrong replay scope',()=>{
  const e=engine({policy:'ambiguous'}),bars=[bar(0),bar(900,100,135,85,100)],t=evaluated(e,bars);
  assert.equal(rrScenario({context:ctx,events:e.events,bars,clock:1800,trade:t,target:3}).status,'ineligible');
  const normal=engine(),path=[bar(0),bar(900,100,126,96,120)],actual=evaluated(normal,path);
  assert.equal(rrScenario({context:ctx,events:normal.events,bars:path,clock:1800,trade:{...actual,netR:99},target:2}).status,'missing-data');
  assert.equal(rrScenario({context:{...ctx,sessionId:'other'},events:normal.events,bars:path,clock:1800,trade:actual,target:2}).status,'ineligible');
});
test('RR preserves pre-fill stop edits and rejects non-positive short target prices',()=>{
  const e=engine();e.command('edit',{tradeId:'t1',stopLoss:80,takeProfit:125},900,'edit');
  const bars=[bar(0),bar(900,100,126,95,120),bar(1800,120,161,115,155)],t=evaluated(e,bars);
  const r=rrScenario({context:ctx,events:e.events,bars,clock:2700,trade:t,target:3});
  assert.equal(r.status,'complete');assert.equal(r.result.initialRisk,20);assert.equal(r.result.netR,3);
  const short=engine({direction:'short',stopLoss:200,takeProfit:50});short.command('close',{tradeId:'t1'},1800,'close');
  const path=[bar(0),bar(900),bar(1800)],actual=evaluated(short,path);
  const unsupported=rrScenario({context:ctx,events:short.events,bars:path,clock:2700,trade:actual,target:3});
  assert.equal(unsupported.status,'unsupported');assert.equal(unsupported.result,null);
});
test('duplicate saved clocks count once; divergent equal-save snapshots are excluded',()=>{
  const e=engine(),bars=[bar(0),bar(900,100,126,96,120)],p=payload(e,bars,1800,10);
  const active=source([],{context:{...ctx,sessionId:'active'}});
  const entries=[[paperKey('owner'),JSON.stringify(p)],
    ['alfa-replay-session:v1:owner:BTCUSDT:15m',JSON.stringify({paper:p})]];
  assert.equal(analyzeLab(savedLabSources(memory(entries),'owner',active).sources).summary.totalTrades,1);
  const conflict=structuredClone(p);conflict.labSnapshot.trades[0].netR=99;
  entries[1][1]=JSON.stringify({paper:conflict});
  const collection=savedLabSources(memory(entries),'owner',active);
  assert.equal(collection.sources.length,1);assert.match(collection.warnings.join(' '),/Conflicting/);
});
test('rewind updates Lab statistics from current Paper state, with no accumulated snapshots',()=>{
  const e=engine(),bars=[bar(0),bar(900,100,126,96,120)];
  assert.equal(analyzeLab([source(e.evaluate(bars,1800).trades)]).summary.totalTrades,1);
  assert.equal(analyzeLab([source(e.evaluate(bars,900).trades)]).summary.totalTrades,0);
  assert.equal(analyzeLab([source(e.evaluate(bars,1800).trades)]).summary.totalTrades,1);
});
test('saved research snapshots respect user isolation, scopes and newest SAVE rather than largest replay clock',()=>{
  const bars=[bar(0),bar(900,100,126,96,120)],e=engine();
  const saved=payload(e,bars,1800,10),rewound=payload(e,bars,900,20);
  const active=source([],{context:{...ctx,sessionId:'active'}});
  const storage=memory([[paperKey('owner'),JSON.stringify(saved)],
    ['alfa-replay-session:v1:owner:BTCUSDT:15m',JSON.stringify({paper:rewound})],
    [paperKey('someone-else'),JSON.stringify(saved)]]);
  const collection=savedLabSources(storage,'owner',active);
  assert.equal(collection.sources.length,2);
  assert.equal(collection.sources.find(s=>s.context.sessionId==='s1').clock,900);
  assert.equal(analyzeLab(collection.sources).summary.totalTrades,0);
});
test('active state overrides all saved clocks, preventing rewind double counting',()=>{
  const e=engine(),bars=[bar(0),bar(900,100,126,96,120)],saved=payload(e,bars,1800);
  const active=source(e.evaluate(bars,900).trades,{clock:900});
  const storage=memory([[paperKey('owner'),JSON.stringify(saved)]]);
  const collection=savedLabSources(storage,'owner',active);
  assert.equal(collection.sources.length,1);assert.equal(analyzeLab(collection.sources).summary.totalTrades,0);
});
test('saved snapshot malformed context, future exit, invalid lab and legacy data are not fabricated',()=>{
  const e=engine(),bars=[bar(0),bar(900,100,126,96,120)],saved=payload(e,bars,1800);
  const active=source([],{context:{...ctx,sessionId:'active'}});
  for(const bad of [{...saved,context:{...ctx,symbol:'ETHUSDT'}},
    {...saved,labSnapshot:{...saved.labSnapshot,clock:900}},
    {...saved,lab:{version:99}},e.serialize()]){
    const c=savedLabSources(memory([[paperKey('owner'),JSON.stringify(bad)]]),'owner',active);
    assert.equal(c.sources.length,1);assert.ok(c.warnings.length);
  }
});
test('save/restore keeps Lab templates, filters, tags and snapshots inside Paper payload',()=>{
  const e=engine(),bars=[bar(0),bar(900,100,126,96,120)],p=payload(e,bars,1800);
  p.lab=tag(p.lab,p.labSnapshot.trades[0],{htfBias:'aligned',session:'London'});
  p.lab.filters={scope:'saved',htfBias:'aligned'};p.lab.groupBy='session';
  const saved=JSON.parse(JSON.stringify(p)),restored=mergeLab([saved.lab]);
  assert.deepEqual(restored,p.lab);assert.equal(sourceKey(saved.context),sourceKey(ctx));
  assert.deepEqual(new PaperTradingEngine(saved.context,saved.events).evaluate(bars,1800).trades,p.labSnapshot.trades);
});
