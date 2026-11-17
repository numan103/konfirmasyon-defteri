// Manual replay analytics only. Never changes execution prices, initial risk or trades.
import { imageDimensions } from './alfa-strategy-image-header.mjs?v=1';
export const DEFAULT_STRATEGIES=[
  {id:'fib-0382',name:'0.382 Retracement'},{id:'ifvg',name:'IFVG'},
  {id:'market-structure',name:'Market Structure'},{id:'custom',name:'Custom'}
];
export const SCREENSHOT_BYTES=256*1024, SESSION_IMAGE_BYTES=1024*1024;
const closed=new Set(['Closed TP','Closed SL','Closed Manual']);
const epsilon=0;
const safeTime=v=>Number.isFinite(v)&&Math.abs(v)<=8640000000000;
const forbidden=id=>['__proto__','constructor','prototype'].includes(id);
const canonical=value=>JSON.stringify(value, Object.keys(value).sort());
export function screenshotBytes(value) {
  if(value==null||value==='')return 0;
  if(typeof value!=='string'||!/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(value))throw new Error('Invalid screenshot');
  const data=value.split(',')[1];
  if(data.length%4!==0)throw new Error('Invalid screenshot encoding');
  const size=Math.floor(data.length*3/4)-(data.endsWith('==')?2:data.endsWith('=')?1:0);
  if(size>SCREENSHOT_BYTES)throw new Error('Screenshot limit: 256 KB');
  const decoded=Uint8Array.from(atob(data),c=>c.charCodeAt(0));
  const dims=imageDimensions(decoded,value.startsWith('data:image/png;')?'image/png':'image/jpeg');
  if(!dims.width||!dims.height||dims.width>1280||dims.height>1280)throw new Error('Saved screenshot dimensions exceed limit');
  return size;
}
export function validateAnalytics(doc) {
  if(!doc||doc.version!==1||!Number.isInteger(doc.revision)||doc.revision<0||
    !Array.isArray(doc.strategies)||doc.strategies.length>100||!doc.annotations||
    typeof doc.annotations!=='object'||Array.isArray(doc.annotations))throw new Error('Invalid analytics document');
  const ids=new Set();
  for(const s of doc.strategies){
    if(typeof s.id!=='string'||!s.id||s.id.length>100||ids.has(s.id)||typeof s.name!=='string'||!s.name.trim()||s.name.length>60)throw new Error('Invalid strategy category');
    ids.add(s.id);
  }
  let bytes=0;
  if(Object.keys(doc.annotations).length>10000)throw new Error('Journal limit');
  for(const [id,a] of Object.entries(doc.annotations)){
    if(!id||forbidden(id)||id.length>150||!a||!Number.isInteger(a.revision)||a.revision<1||!ids.has(a.strategyId))throw new Error('Invalid trade annotation');
    for(const field of ['setup','rationale','mistakes','notes'])if(typeof a[field]!=='string'||a[field].length>2000)throw new Error('Invalid journal text');
    bytes+=screenshotBytes(a.screenshot);
  }
  if(bytes>SESSION_IMAGE_BYTES)throw new Error('Replay screenshot limit: 1 MB');
  if(!doc.filters||typeof doc.filters!=='object'||Array.isArray(doc.filters))throw new Error('Invalid analytics filters');
  for(const k of ['strategyId','symbol','timeframe','direction','exitReason','orderType'])
    if(doc.filters[k]!=null&&(typeof doc.filters[k]!=='string'||doc.filters[k].length>150))throw new Error('Invalid filter');
  for(const k of ['from','to'])if(doc.filters[k]!=null&&!safeTime(doc.filters[k]))throw new Error('Invalid date range');
  if(doc.filters.from!=null&&doc.filters.to!=null&&doc.filters.from>doc.filters.to)throw new Error('Date range reversed');
  return structuredClone(doc);
}
export function emptyAnalytics(){
  return {version:1,revision:0,strategies:structuredClone(DEFAULT_STRATEGIES),annotations:{},filters:{}};
}
export function mergeAnalytics(documents) {
  const out=emptyAnalytics(),strategies=new Map(out.strategies.map(s=>[s.id,s]));
  const valid=documents.filter(Boolean).map(validateAnalytics);
  for(const doc of valid)for(const s of doc.strategies){
    if(strategies.has(s.id)&&strategies.get(s.id).name!==s.name)throw new Error('Strategy category conflict');
    strategies.set(s.id,s);
  }
  out.strategies=[...strategies.values()];
  for(const doc of valid){
    for(const [id,a] of Object.entries(doc.annotations)){
      const prev=out.annotations[id];
      if(prev&&prev.revision===a.revision&&canonical(prev)!==canonical(a))throw new Error('Trade journal conflict; copies preserved');
      if(!prev||a.revision>prev.revision)out.annotations[id]=a;
    }
    if(doc.revision>=out.revision){out.filters=doc.filters;out.revision=doc.revision;}
  }
  return validateAnalytics(out);
}
function metrics(rows){
  const wins=rows.filter(t=>t.netR>epsilon),losses=rows.filter(t=>t.netR< -epsilon);
  const finite=n=>{if(!Number.isFinite(n))throw new Error('Analytics numeric overflow');return n;};
  const sum=a=>a.reduce((n,t)=>finite(n+t.netR),0),winSum=sum(wins),lossSum=-sum(losses);
  let cumulative=0,peak=0,maxDrawdown=0,winStreak=0,lossStreak=0,longestWinStreak=0,longestLossStreak=0,previousDD=0;
  const curve=rows.map(t=>{
    cumulative+=t.netR;peak=Math.max(peak,cumulative);
    const drawdown=finite(Math.max(0,peak-cumulative));maxDrawdown=Math.max(maxDrawdown,drawdown);
    if(t.netR>epsilon){winStreak++;lossStreak=0;}else if(t.netR< -epsilon){lossStreak++;winStreak=0;}else{winStreak=lossStreak=0;}
    longestWinStreak=Math.max(longestWinStreak,winStreak);longestLossStreak=Math.max(longestLossStreak,lossStreak);
    const point={tradeId:t.id,time:t.exitTime,cumulativeNetR:cumulative,peakEquity:peak,drawdown,maxDrawdown,
      recovery:Math.max(0,previousDD-drawdown),recovered:previousDD>epsilon&&drawdown<=epsilon};
    previousDD=drawdown;return point;
  });
  const totalNetR=sum(rows),n=rows.length;
  return {totalTrades:n,winningTrades:wins.length,losingTrades:losses.length,breakevenTrades:n-wins.length-losses.length,
    winRate:n?wins.length/n*100:null,averageWinR:wins.length?winSum/wins.length:null,
    averageLossR:losses.length?-lossSum/losses.length:null,averageNetR:n?totalNetR/n:null,
    expectancy:n?totalNetR/n:null,totalGrossR:rows.reduce((s,t)=>finite(s+t.grossR),0),totalNetR,
    profitFactor:lossSum?finite(winSum/lossSum):null,profitFactorStatus:lossSum?'finite':winSum?'no-losses':'no-results',
    maximumDrawdown:maxDrawdown,longestWinStreak,longestLossStreak,
    averageTradeDuration:n?rows.reduce((s,t)=>s+t.duration,0)/n:null,
    recoveryFactor:maxDrawdown?finite(totalNetR/maxDrawdown):null,curve};
}
export function analyzeTrades(trades,{sessionId,branchId='main',filters={},annotations={},ambiguityIds=[]}={}) {
  const excluded={open:0,ambiguous:0,inactive:0,invalid:0,duplicates:0,conflicts:0};
  const groups=new Map(),ambiguousSet=new Set(ambiguityIds);
  for(const trade of trades){
    if(sessionId&&trade.sessionId!==sessionId)continue;
    if((trade.branchId||'main')!==branchId)continue;
    if(typeof trade.id!=='string'||!trade.id){excluded.invalid++;continue;}
    const key=(trade.sessionId||'')+':'+(trade.branchId||'main')+':'+trade.id;
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(trade);
  }
  const rows=[];
  for(const group of groups.values()){
    const t=group[0],signature=t=>JSON.stringify([t.status,t.symbol,t.timeframe,t.strategyId,t.entryTime,t.exitTime,t.entryPrice,t.exitPrice,t.initialRisk,t.realizedR,t.netR,t.fees,t.slippage,t.direction,t.orderType,!!t.ambiguous]);
    excluded.duplicates+=group.length-1;
    if(group.some(v=>signature(v)!==signature(t))){excluded.conflicts++;continue;}
    const a=Object.hasOwn(annotations,t.id)?annotations[t.id]:null;
    const row={...t,strategyId:a?.strategyId||t.strategyId||'custom',grossR:t.realizedR,
      duration: t.exitTime-t.entryTime,ambiguityStatus:t.ambiguous?'unresolved':ambiguousSet.has(t.id)?'resolved':'none'};
    if(['strategyId','symbol','timeframe','direction','orderType'].some(k=>filters[k]&&filters[k]!==row[k]))continue;
    if(filters.exitReason&&filters.exitReason!==t.status)continue;
    const date=t.exitTime??t.entryTime??t.orderCreatedAt;
    if(filters.from!=null&&date<filters.from || filters.to!=null&&date>filters.to)continue;
    if(t.ambiguous){excluded.ambiguous++;continue;}
    if(!closed.has(t.status)){excluded[t.status==='Open'?'open':'inactive']++;continue;}
    if(![t.entryTime,t.exitTime,t.entryPrice,t.exitPrice,t.initialRisk,row.grossR,t.netR,t.fees,t.slippage].every(Number.isFinite) ||
      !safeTime(t.entryTime)||!safeTime(t.exitTime)||t.entryPrice<=0||t.exitPrice<=0||
      t.fees<0||t.slippage<0||t.initialRisk<=0||row.duration<0){excluded.invalid++;continue;}
    rows.push(row);
  }
  rows.sort((a,b)=>a.exitTime-b.exitTime||a.id.localeCompare(b.id)||String(a.sessionId).localeCompare(String(b.sessionId)));
  const summary=metrics(rows),strategies=new Map();
  for(const r of rows){if(!strategies.has(r.strategyId))strategies.set(r.strategyId,[]);strategies.get(r.strategyId).push(r);}
  const comparison=[...strategies].map(([strategyId,rows])=>({strategyId,...metrics(rows)}));
  const histogram=[];
  if(rows.length){
    const min=rows.reduce((n,t)=>Math.min(n,t.netR),0),max=rows.reduce((n,t)=>Math.max(n,t.netR),0);
    const span=max-min;
    if(!Number.isFinite(span))throw new Error('Analytics histogram overflow');
    const width=Math.max(1,Math.ceil(span/30)),count=Math.min(31,Math.floor(span/width)+1);
    for(let i=0;i<count;i++)histogram.push({from:min+i*width,to:min+(i+1)*width,count:0});
    for(const t of rows)histogram[Math.min(count-1,Math.floor((t.netR-min)/width))].count++;
  }
  return {summary,rows,comparison,histogram,excluded};
}
