import test from 'node:test';
import assert from 'node:assert/strict';
import { sliceBars, clampIndex, replayTime } from '../assets/alfa-replay-model.mjs';
import { ReplayEngine, candleCloseTime } from '../assets/alfa-replay-model.mjs';

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
