import { PaperTradingEngine } from './alfa-paper-model.mjs?v=1';
import { ReplayEngine,candleCloseTime } from './alfa-replay-model.mjs?v=3';
import { validateDocument } from './alfa-drawings-model.mjs?v=6';
import { validateAnalytics,mergeAnalytics } from './alfa-strategy-model.mjs?v=1';
import { validateLab,mergeLab } from './alfa-lab-model.mjs?v=1';
import { isMarketSymbol,TIMEFRAMES } from './alfa-charts-data.mjs?v=5';
export const RESEARCH_FORMAT='alfa-research';
export const canonical=value=>JSON.stringify(normalize(value));
function normalize(v){return Array.isArray(v)?v.map(normalize):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,normalize(v[k])])):v;}
const equal=(a,b)=>canonical(a)===canonical(b);
const clone=v=>v===undefined?undefined:structuredClone(v);
const validTime=v=>Number.isSafeInteger(v)&&v>0&&v<8640000000000;
export const researchId=p=>JSON.stringify([p.replay.id,p.replay.paper?.context?.branchId||'main']);
export const packetMetadata=p=>{const {priceData,...metadata}=p;return clone(metadata);};
function safeTree(v,depth=0){
  if(depth>35)throw new Error('Research nesting limit');
  if(v&&typeof v==='object')for(const [k,value] of Object.entries(v)){
    if(['__proto__','prototype','constructor'].includes(k))throw new Error('Unsafe research key');
    safeTree(value,depth+1);
  }
  else if(typeof v==='number'&&!Number.isFinite(v))throw new Error('Non-finite research value');
}
export function validatePacket(packet){
  safeTree(packet);
  if(!packet||packet.version!==1||!packet.replay||!packet.priceData||typeof packet.priceData!=='object'||Array.isArray(packet.priceData))
    throw new Error('Invalid research packet');
  const p=clone(packet),r=p.replay,step=candleCloseTime(0,r.timeframe);
  if(r.version!==1||typeof r.id!=='string'||!r.id||r.id.length>150||!isMarketSymbol(r.symbol)||
    r.exchange!=='Binance'||r.marketType!=='spot'||![r.dataStart,r.startTime,r.currentTime].every(validTime)||
    r.dataStart>r.startTime||r.startTime>r.currentTime||!validTime(p.watermark)||p.watermark<r.currentTime+step)
    throw new Error('Invalid replay identity/clock');
  if(r.drawings)validateDocument(r.drawings);
  if(r.paper){
    const c=r.paper.context;
    if(r.paper.version!==1||c?.sessionId!==r.id||c.symbol!==r.symbol||c.timeframe!==r.timeframe||
      c.exchange!=='Binance'||c.marketType!=='spot'||(c.branchId||'main')!=='main')throw new Error('Paper/replay scope mismatch');
    new PaperTradingEngine(c,r.paper.events);
    if(r.paper.analytics)validateAnalytics(r.paper.analytics);
    if(r.paper.lab)validateLab(r.paper.lab);
    delete r.paper.labSnapshot; // Recompute from events + immutable prices, never trust derived finance.
  }
  let count=0;
  for(const [tf,bars] of Object.entries(p.priceData)){
    const size=candleCloseTime(0,tf);
    if(!Array.isArray(bars)||bars.some((b,i)=>!Array.isArray(b)||b.length!==5||!validTime(b[0])||
      !b.slice(1).every(v=>Number.isFinite(v)&&v>0)||b[3]>Math.min(b[1],b[4])||b[2]<Math.max(b[1],b[4])||
      b[0]+size>p.watermark||i&&b[0]<=bars[i-1][0]))throw new Error('Invalid/duplicate/future research OHLC');
    count+=bars.length;
  }
  if(count>55000||new TextEncoder().encode(canonical(packetMetadata(p))).length>4*1024*1024)throw new Error('Research packet storage limit');
  const bars=packetBars(p);
  p.coverage='reference-only';
  if(bars.length&&bars[0].time<=r.dataStart&&bars.some(b=>b.time===r.currentTime)){
    const visible=bars.filter(b=>b.time>=r.dataStart&&b.time<=r.currentTime);
    const engine=new ReplayEngine({symbol:r.symbol,timeframe:r.timeframe,now:p.watermark});
    engine.restore(visible,r);
    if(r.paper)new PaperTradingEngine(r.paper.context,r.paper.events).evaluate(visible,r.currentTime+step);
    p.coverage='complete';
  }else if(bars.length)p.coverage='partial';
  return p;
}
export function packetBars(p,tf=p.replay.timeframe){
  return (p.priceData[tf]||[]).map(([time,open,high,low,close])=>({time,open,high,low,close}));
}
export function unionPrices(...streams){
  const maps=new Map();
  for(const data of streams)for(const [tf,bars] of Object.entries(data||{})){
    if(!maps.has(tf))maps.set(tf,new Map());
    for(const bar of bars){
      const prev=maps.get(tf).get(bar[0]);
      if(prev&&!equal(prev,bar))throw new Error('Immutable OHLC conflict: '+tf+' '+bar[0]);
      maps.get(tf).set(bar[0],clone(bar));
    }
  }
  return Object.fromEntries([...maps].map(([tf,map])=>[tf,[...map.values()].sort((a,b)=>a[0]-b[0])]));
}
export function assertEventExtension(oldEvents=[],events=[]){
  if(oldEvents.some((e,i)=>!equal(e,events[i])))throw new Error('Immutable execution event prefix conflict');
}
export function makePacket(replay,{previous=null,bars=[],lowerWindows=[],watermark=0}={}){
  const raw={};
  if(bars.length)raw[replay.timeframe]=bars.map(b=>[b.time,b.open,b.high,b.low,b.close]);
  for(const window of lowerWindows){
    const data={[window.timeframe]:window.bars.map(b=>[b.time,b.open,b.high,b.low,b.close])};
    Object.assign(raw,unionPrices(raw,data));
  }
  const priceData=unionPrices(previous?.priceData,raw);
  const maxClock=Math.max(replay.currentTime+candleCloseTime(0,replay.timeframe),watermark,previous?.watermark||0,
    replay.paper?.lab?.maxObservedClock||0,(replay.paper?.events||[]).reduce((n,e)=>Math.max(n,e.at),0));
  const p=validatePacket({version:1,replay,priceData,watermark:maxClock,
    algorithms:{paper:1,analytics:1,lab:1,excursion:1}});
  if(previous){
    for(const k of ['id','symbol','timeframe','dataStart','startTime'])if(previous.replay[k]!==p.replay[k])throw new Error('Research identity is immutable');
    assertEventExtension(previous.replay.paper?.events,p.replay.paper?.events);
  }
  return p;
}
function mergeValue(b,l,r,path){
  if(equal(l,r))return clone(l);
  if(equal(l,b))return clone(r);
  if(equal(r,b))return clone(l);
  const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
  if(object(l)&&object(r)){
    const out={};
    for(const k of new Set([...Object.keys(b||{}),...Object.keys(l),...Object.keys(r)])){
      const value=mergeValue(b?.[k],l[k],r[k],path+'.'+k);
      if(value!==undefined)out[k]=value;
    }
    return out;
  }
  throw new Error('Research conflict: '+path);
}
function mergeMap(b={},l={},r={},path){
  const out={};
  for(const k of new Set([...Object.keys(b),...Object.keys(l),...Object.keys(r)])){
    // A whole annotation is one revision. Never synthesize a same-revision hybrid.
    if(!equal(l[k],r[k])&&!equal(l[k],b[k])&&!equal(r[k],b[k]))throw new Error('Research conflict: '+path+'.'+k);
    const v=equal(l[k],b[k])?r[k]:l[k];if(v!==undefined)out[k]=clone(v);
  }
  return out;
}
export function mergePackets(base,local,remote){
  const l=validatePacket(local),r=validatePacket(remote);
  if(researchId(l)!==researchId(r)||l.replay.symbol!==r.replay.symbol||l.replay.timeframe!==r.replay.timeframe)throw new Error('Research merge scope mismatch');
  const prices=unionPrices(base?.priceData,l.priceData,r.priceData);
  if(!base){
    if(!equal(packetMetadata(l),packetMetadata(r)))throw new Error('Research conflict: no common base');
    return validatePacket({...l,priceData:prices,watermark:Math.max(l.watermark,r.watermark)});
  }
  const b=validatePacket(base),bm=packetMetadata(b),lm=packetMetadata(l),rm=packetMetadata(r);
  for(const k of ['coverage','watermark']){delete bm[k];delete lm[k];delete rm[k];}
  const bp=bm.replay.paper,lp=lm.replay.paper,rp=rm.replay.paper;
  let paper;
  if(lp&&rp){
    const be=bp?.events||[],le=lp.events,re=rp.events;assertEventExtension(be,le);assertEventExtension(be,re);
    let events;
    try{assertEventExtension(le,re);events=re;}catch{
      try{assertEventExtension(re,le);events=le;}catch{throw new Error('Research conflict: concurrent execution event tails');}
    }
    const a=bp?.analytics,la=lp.analytics,ra=rp.analytics;
    const lab=bp?.lab,ll=lp.lab,rl=rp.lab;
    for(const p of [bp,lp,rp])if(p){delete p.events;delete p.analytics;delete p.lab;}
    paper=mergeValue(bp,lp,rp,'paper');paper.events=events;
    if(la&&ra){
      const merged=mergeAnalytics([la,ra]);
      merged.annotations=mergeMap(a?.annotations,la.annotations,ra.annotations,'annotations');
      merged.filters=mergeValue(a?.filters,la.filters,ra.filters,'analytics.filters');
      merged.revision=Math.max(la.revision,ra.revision)+1;paper.analytics=validateAnalytics(merged);
    }else paper.analytics=clone(la||ra);
    if(ll&&rl){
      const merged=mergeLab([ll,rl]);merged.filters=mergeValue(lab?.filters,ll.filters,rl.filters,'lab.filters');
      merged.groupBy=mergeValue(lab?.groupBy,ll.groupBy,rl.groupBy,'lab.groupBy');
      merged.revision=Math.max(ll.revision,rl.revision)+1;paper.lab=validateLab(merged);
    }else paper.lab=clone(ll||rl);
  }else paper=mergeValue(bp,lp,rp,'paper');
  for(const m of [bm,lm,rm])delete m.replay.paper;
  const out=mergeValue(bm,lm,rm,'session');if(paper)out.replay.paper=paper;
  return validatePacket({...out,priceData:prices,watermark:Math.max(b.watermark,l.watermark,r.watermark)});
}
export function candleDelta(packet,base=null){
  const previous=base?.priceData||{},rows=[];
  for(const [tf,bars] of Object.entries(packet.priceData)){
    const old=new Map((previous[tf]||[]).map(b=>[b[0],b]));
    for(const b of bars){
      if(old.has(b[0])){if(!equal(old.get(b[0]),b))throw new Error('Immutable OHLC conflict');continue;}
      rows.push({tf,t:b[0],o:b[1],h:b[2],l:b[3],c:b[4]});
    }
  }
  return rows;
}
export function exportResearch(owner,records){
  return JSON.stringify({format:RESEARCH_FORMAT,version:1,owner,records:records.map(validatePacket)},null,2);
}
export function importResearch(text,owner,{allowGuest=false}={}){
  if(new TextEncoder().encode(text).length>16*1024*1024)throw new Error('Import limit: 16 MB');
  const file=JSON.parse(text);safeTree(file);
  if(file.format!==RESEARCH_FORMAT||file.version!==1||file.owner!==owner&&!(allowGuest&&file.owner==='guest')||
    !Array.isArray(file.records)||file.records.length>100)throw new Error('Import format/account mismatch');
  const records=file.records.map(validatePacket),ids=new Set();
  for(const p of records){if(ids.has(researchId(p)))throw new Error('Duplicate research session import');ids.add(researchId(p));}
  return records;
}
