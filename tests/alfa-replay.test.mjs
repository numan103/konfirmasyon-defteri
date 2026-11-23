import test from 'node:test';
import assert from 'node:assert/strict';
import { sliceBars, clampIndex, replayTime } from '../assets/alfa-replay-model.mjs';
import { ReplayEngine, candleCloseTime } from '../assets/alfa-replay-model.mjs';
import { replayRange } from '../assets/alfa-replay-data.mjs';
import { strictSessionLevels } from '../assets/alfa-session-levels-model.mjs';
import { computeFvg } from '../assets/alfa-fvg-model.mjs';
import { computeMarketStructure, findSwings } from '../assets/alfa-market-structure-model.mjs';
import { ema } from '../assets/alfa-indicators-model.mjs';
import { TIMEFRAMES } from '../assets/alfa-charts-data.mjs';

const bars = [{ time: 1 }, { time: 2 }, { time: 3 }, { time: 4 }];

test('sliceBars returns first n bars', () => {
  assert.deepEqual(sliceBars(bars, 2).map(b => b.time), [1, 2]);
  assert.deepEqual(sliceBars(bars, 0), []);
  assert.equal(sliceBars(bars, 10).length, 4);
});

test('clampIndex bounds the index', () => {
  assert.equal(clampIndex(-5, 4), 0);
  assert.equal(clampIndex(2.7, 4), 2);
  assert.equal(clampIndex(10, 4), 4);
});

test('replayTime returns the last visible bar time', () => {
  assert.equal(replayTime(bars, 2), 2);
  assert.equal(replayTime(bars, 0), null);
});

const fixture = (count=3005) => Array.from({length:count}, (_,i) =>
  ({time: i*900, open:100+i, high:103+i, low:99+i, close:102+i, volume:10}));
test('3000+ bars deduplicate/sort; snapshots never expose the full future', () => {
  const data=fixture(), engine=new ReplayEngine({symbol:'BTCUSDT',timeframe:'15m',now:1e9});
  engine.load([...data].reverse().concat(data[0]), 90000);
  assert.equal(engine.snapshot().length,101);
  const before=engine.snapshot();
  before[0].close=-500;
  assert.equal(engine.snapshot()[0].close,102);
  assert.equal(engine.step(1).length,102);
  assert.equal(engine.step(-1).length,101);
  assert.deepEqual(engine.snapshot(),data.slice(0,101));
});
test('HTF close boundary: 4H data cannot close on a 15M close', () => {
  const engine=new ReplayEngine({symbol:'BTCUSDT',timeframe:'15m',now:1e9});
  engine.load(fixture(),12600); // clock = 13500; 4H closes at 14400
  const htf=[{time:0,open:1,high:3,low:1,close:2}];
  assert.equal(engine.confirmedSource(htf,'4h').length,0);
  engine.step();
  assert.equal(engine.clock,14400);
  assert.equal(engine.confirmedSource(htf,'4h').length,1);
  engine.step(-1);
  assert.equal(engine.confirmedSource(htf,'4h').length,0);
});
test('developing base candles are excluded and unavailable start fails explicitly', () => {
  const engine=new ReplayEngine({symbol:'BTCUSDT',timeframe:'15m',now:1800});
  engine.load(fixture(4),0);
  assert.equal(engine.step(10).length,2);
  assert.throws(()=>engine.load(fixture(4),2700),/outside/);
});
test('missing data pauses progression without moving clock', () => {
  const engine=new ReplayEngine({symbol:'BTCUSDT',timeframe:'15m',now:1e9});
  engine.load(fixture(5).filter((_,i)=>i!==2),900);
  const clock=engine.clock;
  assert.throws(()=>engine.step(),/Missing/);
  assert.equal(engine.clock,clock);
});
test('repeat runs, rewind and restart produce identical snapshots', () => {
  const run=()=>{
    const engine=new ReplayEngine({symbol:'BTCUSDT',timeframe:'15m',now:1e9});
    engine.load(fixture(),9000);
    const results=[engine.snapshot(),engine.step(12),engine.step(-6),engine.restart()];
    return {results,session:engine.serialize()};
  };
  assert.deepEqual(run(),run());
  assert.equal(candleCloseTime(0,'1h'),3600);
});

test('every chart timeframe has a replay close boundary', () => {
  const expected = {
    '1m': 60, '3m': 180, '5m': 300, '15m': 900, '30m': 1800,
    '1h': 3600, '2h': 7200, '4h': 14400, '6h': 21600, '12h': 43200,
    '1d': 86400, '3d': 259200, '1w': 604800
  };
  assert.deepEqual(Object.values(TIMEFRAMES).sort(), Object.keys(expected).sort());
  for (const [timeframe, seconds] of Object.entries(expected)) {
    assert.equal(candleCloseTime(1000, timeframe), 1000 + seconds, timeframe);
    assert.doesNotThrow(() => new ReplayEngine({ symbol: 'BTCUSDT', timeframe }), timeframe);
  }
  assert.throws(() => candleCloseTime(0, '7h'), /Unsupported timeframe/);
});

test('save/restore uses exact start, current candle and warm-up seed', () => {
  const e=new ReplayEngine({symbol:'BTCUSDT',timeframe:'15m',now:1e9});
  e.load(fixture(350),270000);e.step(5);
  const saved=e.serialize(), restored=new ReplayEngine({symbol:'BTCUSDT',timeframe:'15m',now:1e9});
  restored.restore(fixture(350),saved);
  assert.deepEqual(restored.snapshot(),e.snapshot());
  assert.deepEqual(restored.restart(),fixture(301));
  assert.throws(()=>restored.restore(fixture(350).slice(1),saved),/unavailable/);
  assert.throws(()=>restored.restore(fixture(350).filter((_,i)=>i!==304),saved),/Missing/);
});
test('pagination loads 3000+ bars sequentially with bounded requests and rejects holes',async()=>{
  const calls=[],data=fixture(3100).map(b=>({...b,time:b.time+900}));
  const fetcher=async url=>{
    const u=new URL(url),from=Number(u.searchParams.get('startTime'))/1000;
    calls.push(from);
    const page=data.filter(b=>b.time>=from).slice(0,1000);
    return {ok:true,json:async()=>page.map(b=>[b.time*1000,b.open,b.high,b.low,b.close,10])};
  };
  const loaded=await replayRange({symbol:'BTCUSDT',timeframe:'15m',start:900,end:3100*900,fetcher});
  assert.equal(loaded.length,3100);assert.equal(calls.length,4);
  await assert.rejects(()=>replayRange({symbol:'BTCUSDT',timeframe:'15m',start:1,end:3000,fetcher}),/Missing/);
});
test('next block remains private until stepped; bad append is atomic',()=>{
  const e=new ReplayEngine({symbol:'BTCUSDT',timeframe:'15m',now:1e9});
  e.load(fixture(3),1800);assert.equal(e.exhausted,true);
  assert.throws(()=>e.append([fixture(6)[5]]),/Missing/);
  assert.equal(e.lastTime,1800);
  e.append(fixture(6));assert.equal(e.snapshot().length,3);
  assert.equal(e.step().length,4);
});
test('HTF FVG, IFVG and pivots only consume closed HTF candles; rewind removes future events',()=>{
  const htf=[
    {time:0,open:10,high:11,low:9,close:10},
    {time:14400,open:10,high:14,low:10,close:13},
    {time:28800,open:13,high:15,low:12,close:14},
    {time:43200,open:14,high:14,low:8,close:9},
  ];
  const ltf=Array.from({length:65},(_,i)=>({time:i*900,open:10,high:11,low:9,close:10}));
  const e=new ReplayEngine({symbol:'BTCUSDT',timeframe:'15m',now:1e9});
  e.load(ltf,41400);
  const calc=()=>computeFvg(e.confirmedSource(htf,'4h'),{displacement:false});
  assert.equal(calc().length,0);
  e.step();assert.ok(calc().some(r=>r.type==='fvg'));
  e.step(16);assert.ok(calc().some(r=>r.type==='ifvg'));
  e.step(-17);assert.equal(calc().length,0);
  assert.deepEqual(findSwings(htf.slice(0,2),1,1),[]);
  // Structures cannot change when only LTF data changes within the same HTF close bucket.
  const a=computeMarketStructure(e.confirmedSource(htf,'4h'),{left:1,right:1});
  e.step(-1);
  assert.deepEqual(computeMarketStructure(e.confirmedSource(htf,'4h'),{left:1,right:1}),a);
});
test('strict replay session levels reject holes and never include future session highs',()=>{
  const start=Date.UTC(2026,0,5)/1000;
  const data=Array.from({length:192},(_,i)=>({time:start+i*900,open:100+i,high:102+i,low:99+i,close:101+i}));
  const config={sessions:[{id:'asia',tz:'UTC',start:{h:0,m:0},end:{h:8,m:0}}]};
  const clock=start+86400+3600;
  const levels=strictSessionLevels(data,config,{clock,step:900});
  assert.equal(levels.find(l=>l.id==='DO').price,196);
  assert.equal(levels.find(l=>l.id==='PDH').price,197);
  assert.equal(levels.find(l=>l.id==='asia_H').price,201);
  const changed=data.map(b=>b.time>=clock?{...b,high:999999}:b);
  assert.deepEqual(strictSessionLevels(changed,config,{clock,step:900}),levels);
  assert.equal(strictSessionLevels(data.slice(1),config,{clock,step:900}).some(l=>l.id==='PDH'),false);
});
test('strict NYMO boundaries honor US DST in winter and summer',()=>{
  for(const [month,day,hour] of [[0,12,5],[6,12,4],[2,8,5],[2,9,4],[10,1,4],[10,2,5]]){
    const time=Date.UTC(2026,month,day,hour)/1000;
    const b={time,open:123,high:125,low:122,close:124};
    assert.equal(strictSessionLevels([b],{}, {clock:time+3600,step:3600}).find(l=>l.id==='NYMO')?.price,123);
  }
});
test('previous week extrema need all source bars and cannot absorb current-week highs',()=>{
  const monday=Date.UTC(2026,0,5)/1000;
  const data=Array.from({length:24*15},(_,i)=>({time:monday+i*3600,open:100,high:101+i,low:99-i*.1,close:100}));
  const clock=monday+604800+3600;
  const levels=strictSessionLevels(data,{}, {clock,step:3600});
  assert.equal(levels.find(l=>l.id==='WO').price,100);
  assert.equal(levels.find(l=>l.id==='PWH').price,268);
  assert.equal(levels.find(l=>l.id==='PWL').price,99-167*.1);
  assert.equal(strictSessionLevels(data.slice(1),{}, {clock,step:3600}).some(l=>l.id==='PWH'),false);
});
test('1H/4H BOS, CHoCH and protected breaks remain frozen within source candles and rewind deterministically',()=>{
  for(const tf of ['1h','4h']){
    const step=candleCloseTime(0,tf);
    const source=Array.from({length:160},(_,i)=>{
      const p=i<80?100+i*.6+Math.sin(i*.8)*5:200-i*.6+Math.sin(i*.8)*5;
      return {time:i*step,open:p-.2,high:p+1,low:p-1,close:p+.5};
    });
    const ltf=Array.from({length:160*step/900},(_,i)=>({time:i*900,open:100,high:101,low:99,close:100}));
    const engine=new ReplayEngine({symbol:'BTCUSDT',timeframe:'15m',now:1e9});
    engine.load(ltf,0);
    const analyze=()=>computeMarketStructure(engine.confirmedSource(source,tf),{left:2,right:2,displacement:false});
    engine.step(ltf.length-1);
    const all=analyze();
    assert.ok(all.bos.length>0 && all.choch.length>0);
    assert.ok(all.protected.some(p=>p.brokenAt!=null));
    const event=all.choch[0];
    const close=candleCloseTime(event.time,tf);
    const before=Math.round(close/900)-2; // 15M candle closes one interval before HTF confirmation
    engine.load(ltf,before*900);
    assert.equal(analyze().choch.some(e=>e.time===event.time),false);
    engine.step();
    assert.ok(analyze().choch.some(e=>e.time===event.time));
    engine.step(-1);
    assert.equal(analyze().choch.some(e=>e.time===event.time),false);
    const clock=engine.clock;
    assert.ok(analyze().protected.every(p=>p.brokenAt==null||candleCloseTime(p.brokenAt,tf)<=clock));
  }
});
test('EMA200 warm-up is retained exactly through restore and cannot see appended prices',()=>{
  const engine=new ReplayEngine({symbol:'BTCUSDT',timeframe:'15m',now:1e9});
  engine.load(fixture(301),300*900);
  const expected=ema(engine.snapshot(),200);
  assert.equal(expected[198],null);assert.ok(Number.isFinite(expected[199]));
  engine.append(fixture(600));
  assert.deepEqual(ema(engine.snapshot(),200),expected);
  const restored=new ReplayEngine({symbol:'BTCUSDT',timeframe:'15m',now:1e9});
  restored.restore(fixture(600),engine.serialize());
  assert.deepEqual(ema(restored.snapshot(),200),expected);
});
