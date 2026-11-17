// Research metadata and cohorts. All performance arithmetic stays in Strategy Tester.
import { analyzeTrades } from './alfa-strategy-model.mjs?v=1';
export const LAB_FIELDS=[
  ['setupType','Setup Type'],['session','Session'],['htfBias','HTF Bias'],
  ['marketStructure','Market Structure'],['displacement','Displacement'],
  ['entryModel','Entry Model'],['stopModel','Stop Model'],['targetModel','Target Model'],
  ['rrTarget','RR Target'],['confidence','Confidence'],['notes','Notes']
];
const fields=keys=>keys.map(([key,label])=>({key,label}));
export const DEFAULT_TEMPLATES=[
  {id:'fib-0382',name:'0.382 Retracement',fields:fields([
    ['swingType','Swing Type'],['msb','MSB'],['displacement','Displacement'],
    ['htfConfirmation','HTF Confirmation'],['entry0382','Entry 0.382'],
    ['stopLocation','Stop Location'],['rrTarget','RR Target']])},
  {id:'ifvg',name:'IFVG',fields:fields([
    ['polarity','Bullish / Bearish'],['fvgTimeframe','FVG Timeframe'],
    ['invalidationType','Invalidation Type'],['retest','Retest'],
    ['htfContext','HTF Context'],['entryType','Entry Type'],['rrTarget','RR Target']])},
  {id:'custom',name:'Custom Strategy',fields:[]}
];
const safeKey=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v)&&!['__proto__','constructor','prototype'].includes(v);
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const time=v=>Number.isFinite(v)&&v>=0&&v<=8640000000000;
const normalize=v=>Array.isArray(v)?v.map(normalize):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,normalize(v[k])])):v;
const canonical=v=>JSON.stringify(normalize(v));
export const sourceKey=c=>JSON.stringify([c.sessionId,c.symbol,c.timeframe,c.branchId||'main']);
export function emptyLab(){return {version:1,revision:0,maxObservedClock:0,templates:structuredClone(DEFAULT_TEMPLATES),annotations:{},filters:{scope:'active'},groupBy:'htfBias'};}
export function validateLab(doc){
  if(!object(doc)||doc.version!==1||!Number.isSafeInteger(doc.revision)||doc.revision<0||
    !time(doc.maxObservedClock)||!Array.isArray(doc.templates)||doc.templates.length>100||
    !object(doc.annotations)||Object.keys(doc.annotations).length>10000||!object(doc.filters))throw new Error('Invalid Lab document');
  const ids=new Set();
  for(const t of doc.templates){
    if(!object(t)||!safeKey(t.id)||ids.has(t.id)||typeof t.name!=='string'||!t.name.trim()||t.name.length>60||
      !Array.isArray(t.fields)||t.fields.length>30)throw new Error('Invalid strategy template');
    ids.add(t.id);const keys=new Set();
    for(const f of t.fields){
      if(!safeKey(f.key)||keys.has(f.key)||typeof f.label!=='string'||!f.label.trim()||f.label.length>60)throw new Error('Invalid template field');
      keys.add(f.key);
    }
  }
  for(const [id,history] of Object.entries(doc.annotations)){
    if(!safeKey(id)||!Array.isArray(history)||!history.length||history.length>100)throw new Error('Invalid Lab annotation history');
    const revisions=new Set();
    for(const a of history){
      if(!object(a)||!Number.isSafeInteger(a.revision)||a.revision<1||revisions.has(a.revision)||
        !time(a.recordedReplayTime)||!time(a.observedThrough)||!time(a.recordedAt)||
        a.observedThrough<a.recordedReplayTime||!['pre-entry','retrospective'].includes(a.provenance)||
        !safeKey(a.strategyId)||!object(a.values)||!object(a.custom))throw new Error('Invalid Lab observation');
      revisions.add(a.revision);
      if(a.provenance==='pre-entry'&&a.observedThrough>a.recordedReplayTime)throw new Error('Lookahead observation cannot be pre-entry');
      for(const values of [a.values,a.custom]){
        if(Object.keys(values).length>50)throw new Error('Too many Lab fields');
        for(const [k,v] of Object.entries(values))if(!safeKey(k)||typeof v!=='string'||v.length>(k==='notes'?2000:300))throw new Error('Invalid Lab field value');
      }
    }
  }
  for(const [k,v] of Object.entries(doc.filters)){
    if(!safeKey(k)||!['string','number'].includes(typeof v)&&v!==null||typeof v==='string'&&v.length>300)throw new Error('Invalid Lab filter');
  }
  for(const k of ['from','to'])if(doc.filters[k]!=null&&!time(doc.filters[k]))throw new Error('Invalid Lab date');
  if(doc.filters.from!=null&&doc.filters.to!=null&&doc.filters.from>doc.filters.to)throw new Error('Lab date range reversed');
  if(!['strategyId','symbol','timeframe','direction',...LAB_FIELDS.map(f=>f[0])].includes(doc.groupBy))throw new Error('Invalid Lab comparison');
  return structuredClone(doc);
}
export function mergeLab(documents){
  const out=emptyLab(),templates=new Map(out.templates.map(t=>[t.id,t]));
  for(const doc of documents.filter(Boolean).map(validateLab)){
    for(const t of doc.templates){
      if(templates.has(t.id)&&canonical(templates.get(t.id))!==canonical(t))throw new Error('Lab template conflict; copies preserved');
      templates.set(t.id,t);
    }
    for(const [id,history] of Object.entries(doc.annotations)){
      const merged=new Map((out.annotations[id]||[]).map(a=>[a.revision,a]));
      for(const a of history){
        if(merged.has(a.revision)&&canonical(merged.get(a.revision))!==canonical(a))throw new Error('Lab observation conflict; copies preserved');
        merged.set(a.revision,a);
      }
      out.annotations[id]=[...merged.values()].sort((a,b)=>a.revision-b.revision);
    }
    out.maxObservedClock=Math.max(out.maxObservedClock,doc.maxObservedClock);
    if(doc.revision>=out.revision){out.filters=doc.filters;out.groupBy=doc.groupBy;out.revision=doc.revision;}
  }
  out.templates=[...templates.values()];return validateLab(out);
}
export function sampleWarning(n){
  return n<30?'Düşük örneklem':n<100?'Sınırlı örneklem':'Daha güçlü örneklem';
}
export function observationFor(trade,doc,clock,knowledge=''){
  const history=Object.hasOwn(doc.annotations,trade.id)?doc.annotations[trade.id]:[];
  return history?.filter(a=>a.recordedReplayTime<=clock&&(knowledge!=='pre-entry'||a.provenance==='pre-entry'))
    .sort((a,b)=>b.revision-a.revision)[0]||null;
}
export function recordObservation(doc,trade,values,custom,{clock,observedThrough,reliable=true,strategyId}){
  if(!safeKey(trade.id))throw new Error('Invalid Lab trade ID');
  const next=structuredClone(doc),history=next.annotations[trade.id]||[];
  const preEntry=reliable&&trade.status==='Pending'&&trade.labOrigin?.reliable===true&&trade.labOrigin.clock===trade.orderCreatedAt&&
    trade.labOrigin.observedThrough<=trade.orderCreatedAt&&clock>=trade.orderCreatedAt&&observedThrough<=clock;
  const record={revision:Math.max(0,...history.map(a=>a.revision))+1,recordedAt:Date.now(),
    recordedReplayTime:clock,observedThrough:Math.max(clock,observedThrough),provenance:preEntry?'pre-entry':'retrospective',
    strategyId,values:structuredClone(values),custom:structuredClone(custom)};
  next.annotations[trade.id]=[...history,record];next.revision++;
  next.maxObservedClock=Math.max(next.maxObservedClock,observedThrough,clock);
  return validateLab(next);
}
export function analyzeLab(sources,{filters={},groupBy='htfBias'}={}){
  const selected=[],excluded={open:0,ambiguous:0,inactive:0,invalid:0,duplicates:0,conflicts:0};
  let retrospective=0,unlabelled=0;
  for(const source of sources){
    const {context,clock,lab=emptyLab(),analytics={annotations:{}}}=source;
    if((context.branchId||'main')!=='main')continue;
    const annotations=Object.fromEntries(Object.entries(analytics.annotations||{}).filter(([,a])=>
      Number.isFinite(a.recordedReplayTime)&&a.recordedReplayTime<=clock));
    const base=analyzeTrades(source.trades,{sessionId:context.sessionId,branchId:'main',
      annotations,ambiguityIds:source.ambiguityIds||[]});
    for(const k of Object.keys(excluded))excluded[k]+=base.excluded[k];
    for(const t of base.rows){
      const obs=observationFor(t,lab,clock,filters.knowledge),values=obs?.values||{};
      const row={...t,strategyId:obs?.strategyId||t.strategyId,labValues:values,labCustom:obs?.custom||{},
        labKnowledge:obs?.provenance||(Object.hasOwn(annotations,t.id)?'retrospective':'unlabelled'),labObservation:obs,labSourceKey:sourceKey(context)};
      if(filters.knowledge==='pre-entry'&&!obs)continue;
      if(filters.knowledge==='retrospective'&&row.labKnowledge!=='retrospective')continue;
      if(filters.replaySessionId&&context.sessionId!==filters.replaySessionId)continue;
      if(['strategyId','symbol','timeframe','direction'].some(k=>filters[k]&&row[k]!==filters[k]))continue;
      if(LAB_FIELDS.some(([k])=>filters[k]&&values[k]!==filters[k]))continue;
      if(filters.from!=null&&t.exitTime<filters.from||filters.to!=null&&t.exitTime>filters.to)continue;
      if(row.labKnowledge==='retrospective')retrospective++;
      if(row.labKnowledge==='unlabelled')unlabelled++;
      selected.push(row);
    }
  }
  // Reuse scoped deduplication, cumulative R, drawdown and all metric arithmetic.
  const report=analyzeTrades(selected);
  for(const k of Object.keys(excluded))report.excluded[k]+=excluded[k];
  const dimensions=['strategyId','session','htfBias','setupType','displacement','direction','symbol','timeframe'];
  const cohorts={};
  for(const dimension of new Set([...dimensions,groupBy])){
    const groups=new Map();
    for(const row of report.rows){
      const value=['strategyId','symbol','timeframe','direction'].includes(dimension)?row[dimension]:row.labValues[dimension];
      const key=value||'Belirtilmemiş';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);
    }
    cohorts[dimension]=[...groups].map(([value,rows])=>{
      const summary=analyzeTrades(rows).summary;
      return {value,summary,sampleWarning:sampleWarning(summary.totalTrades)};
    });
  }
  return {...report,cohorts,retrospective,unlabelled,sampleWarning:sampleWarning(report.summary.totalTrades)};
}
