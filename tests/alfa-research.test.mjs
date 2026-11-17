import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import { makePacket,validatePacket,packetBars,packetMetadata,canonical,researchId,unionPrices,mergePackets,
  candleDelta,exportResearch,importResearch } from '../assets/alfa-research-model.mjs';
import { ResearchSync } from '../assets/alfa-research-sync.mjs';
import { legacyResearchRecords } from '../assets/alfa-research.mjs';
import { PaperTradingEngine,createPaperOrder } from '../assets/alfa-paper-model.mjs';
import { emptyAnalytics } from '../assets/alfa-strategy-model.mjs';
import { emptyLab,recordObservation } from '../assets/alfa-lab-model.mjs';
import { measureExcursion } from '../assets/alfa-excursion-model.mjs';
const B=1700000000,owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const clone=v=>v==null?v:structuredClone(v);
function fixture(){
  const context={sessionId:'replay-research-test',symbol:'BTCUSDT',timeframe:'15m',exchange:'Binance',marketType:'spot'};
  const e=new PaperTradingEngine(context);
  e.command('create',{order:createPaperOrder({entry:100,stopLoss:90,takeProfit:140,positionSize:1,strategyId:'fib-0382'})},B+900,'t1');
  e.command('close',{tradeId:'t1'},B+1800,'close1');
  const bars=[{time:B,open:100,high:104,low:96,close:100},{time:B+900,open:100,high:115,low:95,close:110},
    {time:B+1800,open:108,high:120,low:105,close:110}];
  const replay={version:1,id:context.sessionId,symbol:'BTCUSDT',timeframe:'15m',exchange:'Binance',marketType:'spot',
    dataStart:B,startTime:B,currentTime:B+1800,speed:1,drawings:{version:1,drawings:[],templates:[]},indicators:[],
    paper:{...e.serialize(),analytics:emptyAnalytics(),lab:emptyLab()}};
  return {replay,bars,packet:makePacket(replay,{bars}),engine:e};
}
function note(replay,text,id='t1'){
  const r=clone(replay),a=r.paper.analytics;a.revision++;
  a.annotations[id]={strategyId:'fib-0382',setup:'',rationale:'',mistakes:'',notes:text,screenshot:null,
    revision:(a.annotations[id]?.revision||0)+1,recordedReplayTime:B+2700};
  return r;
}
class MemoryStorage{
  constructor(){this.rows=new Map();this.backups=[];}
  key(o,id){return JSON.stringify([o,id]);}
  async get(o,id){return clone(this.rows.get(this.key(o,id))||null);}
  async list(o,store='records'){return clone(store==='backups'?this.backups.filter(r=>r.owner===o):[...this.rows.values()].filter(r=>r.owner===o));}
  async backup(o,document,reason){this.backups.push({owner:o,document:clone(document),reason});}
  async update(o,id,fn,{expectedVersion,backupReason}={}){
    const old=await this.get(o,id);
    if(expectedVersion!=null&&(old?.localVersion||0)!==expectedVersion)throw new Error('Research local revision conflict');
    const result=fn(old);
    if(result){
      if(backupReason&&old)await this.backup(o,old,backupReason);
      const row={...clone(result),owner:o,id,localVersion:(old?.localVersion||0)+1};this.rows.set(this.key(o,id),row);return clone(row);
    }
    return result;
  }
}
class Server{
  constructor(){this.rows=new Map();this.versions=[];this.writes=0;}
  transport(o){
    const self=this;
    return {
      async list(){return [...self.rows.values()].filter(r=>r.owner===o).map(r=>({session_id:r.packet.replay.id,branch_id:'main',revision:r.revision}));},
      async load(id){return clone(self.rows.get(o+id)||null);},
      async commit(packet,base,revision){
        const key=o+researchId(packet),old=self.rows.get(key);
        if((old?.revision||0)!==revision)throw Object.assign(new Error('research_revision_conflict'),{code:'40001'});
        const row={owner:o,packet:clone(packet),revision:revision+1,updatedAt:new Date().toISOString()};
        self.rows.set(key,row);self.versions.push(clone(row));self.writes++;
        return {revision:row.revision,updatedAt:row.updatedAt};
      }
    };
  }
}
const cores=[];
function core(storage,transport,options={}){const c=new ResearchSync({owner,storage,transport,delay:1e8,...options});cores.push(c);return c;}
afterEach(()=>{for(const c of cores.splice(0))c.dispose();});
test('packet preserves Replay/Trade IDs, original events and complete closed OHLC',()=>{
  const {packet,replay}=fixture();
  assert.equal(packet.coverage,'complete');assert.equal(packet.replay.id,replay.id);
  assert.deepEqual(packet.replay.paper.events,replay.paper.events);
  assert.deepEqual(packet.priceData['15m'][1],[B+900,100,115,95,110]);
});
test('Tester/Lab metadata, revision history and MAE parameters round trip with immutable initial risk',()=>{
  const {packet,engine,bars}=fixture(),trade=engine.evaluate(bars,B+2700).trades[0];
  packet.replay.paper.lab=recordObservation(packet.replay.paper.lab,trade,{session:'London',htfBias:'aligned'},{},
    {clock:B+2700,observedThrough:B+2700,strategyId:'fib-0382'});
  const restored=importResearch(exportResearch(owner,[packet]),owner)[0],p=restored.replay.paper;
  const state=new PaperTradingEngine(p.context,p.events).evaluate(packetBars(restored),B+2700);
  assert.equal(state.trades[0].initialRisk,trade.initialRisk);
  const input={context:p.context,events:p.events,bars:packetBars(restored),clock:B+2700,trade:state.trades[0]};
  assert.deepEqual(measureExcursion(input),measureExcursion({...input,bars,trade}));
  assert.equal(restored.replay.paper.lab.annotations.t1.length,1);
});
test('derived trade snapshots are stripped, not accepted as financial truth',()=>{
  const {replay,bars}=fixture();replay.paper.labSnapshot={trades:[{netR:999}]};
  assert.equal(makePacket(replay,{bars}).replay.paper.labSnapshot,undefined);
});
test('legacy metadata without raw price path is explicit reference-only',()=>{
  const {replay}=fixture();assert.equal(makePacket(replay).coverage,'reference-only');
});
test('immutable prices and event prefix reject conflicting updates',()=>{
  const {packet,replay,bars}=fixture();
  assert.throws(()=>unionPrices(packet.priceData,{'15m':[[B+900,100,999,95,110]]}),/OHLC conflict/);
  const changed=clone(replay);changed.paper.events[0].order.stopLoss=95;
  assert.throws(()=>makePacket(changed,{previous:packet,bars}),/event prefix/);
});
test('future/malformed/duplicate OHLC and unsafe JSON are rejected',()=>{
  const {packet}=fixture();
  const future=clone(packet);future.priceData['15m'].push([B+2700,100,110,95,105]);
  assert.throws(()=>validatePacket(future),/future/);
  const duplicate=clone(packet);duplicate.priceData['15m'].push(duplicate.priceData['15m'].at(-1));
  assert.throws(()=>validatePacket(duplicate),/duplicate/);
  assert.throws(()=>importResearch('{"format":"alfa-research","__proto__":{}}',owner),/Unsafe/);
});
test('OHLC gaps within saved replay prefix do not become complete snapshots',()=>{
  const {packet}=fixture();packet.priceData['15m'].splice(1,1);
  assert.throws(()=>validatePacket(packet),/Missing/);
});
test('rewind retains event log, already-observed price data and watermark',()=>{
  const {packet,replay,bars}=fixture(),rewind=clone(replay);rewind.currentTime=B;
  const p=makePacket(rewind,{previous:packet,bars:bars.slice(0,1)});
  assert.equal(p.priceData['15m'].length,3);assert.equal(p.watermark,B+2700);assert.equal(p.replay.paper.events.length,2);
});
test('price deltas upload a candle only once and preserve lower timeframe data',()=>{
  const {packet}=fixture();assert.equal(candleDelta(packet).length,3);assert.equal(candleDelta(packet,packet).length,0);
  const p=clone(packet);p.priceData['5m']=[[B,100,104,96,100]];
  assert.equal(candleDelta(validatePacket(p),packet).length,1);
});
test('three-way merge combines independent metadata, but not concurrent financial event tails',()=>{
  const {packet}=fixture(),left=clone(packet),right=clone(packet);
  left.replay.paper.analytics=note(left.replay,'A','a').paper.analytics;
  right.replay.paper.analytics=note(right.replay,'B','b').paper.analytics;
  const merged=mergePackets(packet,left,right);
  assert.equal(merged.replay.paper.analytics.annotations.a.notes,'A');assert.equal(merged.replay.paper.analytics.annotations.b.notes,'B');
  left.replay.paper.events.push({id:'newA',type:'close',tradeId:'t1',at:B+2700});
  right.replay.paper.events.push({id:'newB',type:'close',tradeId:'t1',at:B+2700});
  assert.throws(()=>mergePackets(packet,left,right),/event tails/);
});
test('same-record note edits and divergent replay cursors raise conflicts, never last-write-wins',()=>{
  const {packet}=fixture();
  const left=makePacket(note(packet.replay,'left'),{bars:packetBars(packet)});
  const right=makePacket(note(packet.replay,'right'),{bars:packetBars(packet)});
  assert.throws(()=>mergePackets(packet,left,right),/conflict/i);
  const a=clone(packet),b=clone(packet);a.replay.currentTime=B;b.replay.currentTime=B+900;
  assert.throws(()=>mergePackets(packet,a,b),/currentTime/);
});
test('no common base cannot silently overwrite a different local migration',()=>{
  const {packet}=fixture(),other=clone(packet);other.replay.speed=2;
  assert.throws(()=>mergePackets(null,packet,other),/no common base/);
});
test('JSON import/export enforces owner, explicit guest adoption and unique session IDs',()=>{
  const {packet}=fixture();
  assert.equal(importResearch(exportResearch(owner,[packet]),owner).length,1);
  assert.throws(()=>importResearch(exportResearch(other,[packet]),owner),/account mismatch/);
  assert.throws(()=>importResearch(exportResearch('guest',[packet]),owner),/account mismatch/);
  assert.equal(importResearch(exportResearch('guest',[packet]),owner,{allowGuest:true}).length,1);
  assert.throws(()=>importResearch(exportResearch(owner,[packet,packet]),owner),/Duplicate/);
});
test('offline capture is durable; reconnect uploads pending revisions in order without duplicates',async()=>{
  const {replay,bars}=fixture(),storage=new MemoryStorage(),server=new Server();let online=false;
  const c=core(storage,server.transport(owner),{online:()=>online});
  await c.capture(replay,{bars});await c.capture(note(replay,'one'),{bars});await c.capture(note(note(replay,'one'),'two'),{bars});
  await c.flush();assert.equal(server.writes,0);
  assert.equal((await storage.list(owner))[0].pending.length,3);
  online=true;await c.flush();assert.equal(server.writes,3);
  const record=(await storage.list(owner))[0];assert.equal(record.pending.length,0);assert.equal(record.state,'clean');
  assert.equal(server.versions[1].packet.replay.paper.analytics.annotations.t1.notes,'one');
  assert.equal(server.versions[2].packet.replay.paper.analytics.annotations.t1.notes,'two');
  await c.flush();assert.equal(server.writes,3);
});
test('second isolated storage downloads a session and can reproduce Paper and MAE',async()=>{
  const {replay,bars}=fixture(),server=new Server(),first=core(new MemoryStorage(),server.transport(owner));
  await first.capture(replay,{bars});await first.flush();
  const storage=new MemoryStorage(),second=core(storage,server.transport(owner));await second.refresh();
  const r=(await storage.list(owner))[0],p=r.local.replay.paper;
  const state=new PaperTradingEngine(p.context,p.events).evaluate(packetBars(r.local),B+2700);
  assert.equal(state.trades[0].netR,.8);
  assert.equal(measureExcursion({context:p.context,events:p.events,bars:packetBars(r.local),clock:B+2700,trade:state.trades[0]}).mfe.r.lower,1.5);
});
test('two simulated devices merge disjoint notes; same-note conflict retains both copies',async()=>{
  const {replay,bars}=fixture(),server=new Server(),s1=new MemoryStorage(),s2=new MemoryStorage();
  const a=core(s1,server.transport(owner)),b=core(s2,server.transport(owner));
  await a.capture(replay,{bars});await a.flush();await b.refresh();
  await a.capture(note(replay,'A','a'),{bars});await b.capture(note(replay,'B','b'),{bars});
  await a.flush();await b.flush();
  const remote=await server.transport(owner).load(researchId({replay}));
  assert.equal(remote.packet.replay.paper.analytics.annotations.a.notes,'A');
  assert.equal(remote.packet.replay.paper.analytics.annotations.b.notes,'B');
  await a.refresh();await b.refresh();
  await a.capture(note(remote.packet.replay,'left'),{bars});await b.capture(note(remote.packet.replay,'right'),{bars});
  await a.flush();await b.flush();
  const conflict=(await s2.list(owner))[0];
  assert.equal(conflict.state,'conflict');assert.equal(conflict.local.replay.paper.analytics.annotations.t1.notes,'right');
  assert.equal(conflict.remoteConflict.replay.paper.analytics.annotations.t1.notes,'left');assert.ok(s2.backups.length>0);
});
test('accept cloud is explicit and keeps the previous local branch in backup',async()=>{
  const {replay,bars}=fixture(),server=new Server(),store=new MemoryStorage(),c=core(store,server.transport(owner));
  await c.capture(replay,{bars});await c.flush();
  await c.capture(note(replay,'unuploaded local'),{bars});
  await c.acceptCloud(researchId({replay}));
  assert.equal((await store.list(owner))[0].pending.length,0);
  assert.ok(store.backups.some(b=>b.reason.startsWith('explicit accept-cloud')&&b.document.local.replay.paper.analytics.annotations.t1.notes==='unuploaded local'));
});
test('lost HTTP acknowledgment retries idempotently without adding a duplicate version',async()=>{
  const {replay,bars}=fixture(),store=new MemoryStorage(),server=new Server(),transport=server.transport(owner);
  const commit=transport.commit;let first=true;
  transport.commit=async(...args)=>{const ack=await commit(...args);if(first){first=false;throw new Error('network lost ack');}return ack;};
  const c=core(store,transport);await c.capture(replay,{bars});await c.flush();assert.equal(server.writes,1);
  await c.flush();assert.equal(server.writes,1);assert.equal((await store.list(owner))[0].state,'clean');
});
test('new capture during an in-flight commit is not cleared by the older acknowledgment',async()=>{
  const {replay,bars}=fixture(),store=new MemoryStorage(),server=new Server(),transport=server.transport(owner);
  const commit=transport.commit;let release,entered;
  const gate=new Promise(r=>release=r),start=new Promise(r=>entered=r);let once=true;
  transport.commit=async(...args)=>{if(once){once=false;entered();await gate;}return commit(...args);};
  const c=core(store,transport);await c.capture(replay,{bars});const flushing=c.flush();await start;
  await c.capture(note(replay,'during flight'),{bars});release();await flushing;
  assert.equal((await store.list(owner))[0].state,'clean');assert.equal(server.writes,2);
  assert.equal(server.versions.at(-1).packet.replay.paper.analytics.annotations.t1.notes,'during flight');
});
test('prices appended during an in-flight commit survive the acknowledgement',async()=>{
  const {replay,bars}=fixture(),store=new MemoryStorage(),server=new Server(),transport=server.transport(owner);
  const commit=transport.commit;let release,entered;
  const gate=new Promise(r=>release=r),start=new Promise(r=>entered=r);let once=true;
  transport.commit=async(...args)=>{if(once){once=false;entered();await gate;}return commit(...args);};
  const c=core(store,transport);await c.capture(replay,{bars});const flushing=c.flush();await start;
  await c.capture(replay,{bars,lowerWindows:[{timeframe:'5m',bars:[{time:B,open:100,high:102,low:99,close:101}]}]});
  release();await flushing;
  const record=(await store.list(owner))[0];
  assert.equal(record.pending.length,0);assert.equal(record.state,'clean');
  assert.equal(record.local.priceData['5m'].length,1);
  assert.equal(server.versions.length,2);
  assert.equal(server.versions[0].packet.priceData['5m'],undefined);
  assert.equal(server.versions[1].packet.priceData['5m'].length,1);
});
test('owners have separate local and simulated remote namespaces (not a real RLS claim)',async()=>{
  const {replay,bars}=fixture(),store=new MemoryStorage(),server=new Server();
  const a=core(store,server.transport(owner));await a.capture(replay,{bars});await a.flush();
  const b=core(store,server.transport(other),{owner:other});await b.refresh();
  assert.equal((await store.list(other)).length,0);assert.equal((await store.list(owner)).length,1);
  assert.equal(importResearch(await b.export(),other).length,0);
});
test('legacy migration only scans this owner, preserves raw orphan journals and does not delete originals',()=>{
  const {replay}=fixture(),rows=new Map([
    [`alfa-replay-session:v1:${owner}:BTCUSDT:15m`,JSON.stringify(replay)],
    [`alfa-paper:v1:${owner}:BTCUSDT:15m:${replay.id}`,JSON.stringify(replay.paper)],
    [`alfa-paper:v1:${owner}:BTCUSDT:15m:orphan`,JSON.stringify({...replay.paper,context:{...replay.paper.context,sessionId:'orphan'}})],
    [`alfa-replay-session:v1:${other}:BTCUSDT:15m`,JSON.stringify(replay)],
    ['sb-auth-token','secret-not-scanned']]);
  const storage={get length(){return rows.size;},key:i=>[...rows.keys()][i],getItem:k=>rows.get(k)||null};
  const before=canonical([...rows]),result=legacyResearchRecords(storage,owner);
  assert.equal(result.entries.length,3);assert.equal(result.sessions.length,1);assert.ok(result.warnings.some(w=>w.includes('orphan')));
  assert.equal(canonical([...rows]),before);assert.ok(!canonical(result).includes('secret-not-scanned'));
});
