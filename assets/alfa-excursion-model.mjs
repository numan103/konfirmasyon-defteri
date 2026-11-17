// Price-path excursions only. Never changes orders, initial risk or realized results.
import { PaperTradingEngine } from './alfa-paper-model.mjs?v=1';
import { candleCloseTime } from './alfa-replay-model.mjs?v=3';
import { analyzeTrades } from './alfa-strategy-model.mjs?v=1';
const closed=t=>t&&!t.ambiguous&&['Closed TP','Closed SL','Closed Manual'].includes(t.status);
const near=(a,b)=>Math.abs(a-b)<=1e-10*Math.max(1,Math.abs(a),Math.abs(b));
const finite=n=>{if(!Number.isFinite(n))throw new Error('Excursion numeric overflow');return n;};
export const excursionKey=t=>JSON.stringify([t.sessionId,t.symbol,t.timeframe,t.branchId||'main',t.id]);
const range=(lower,upper)=>({lower,upper});
function envelope(trade,segments){
  const entry=trade.entryPrice;let low=entry,high=entry,possibleLow=entry,possibleHigh=entry;
  const certain=price=>{low=Math.min(low,price);high=Math.max(high,price);};
  for(const s of segments){
    const b=s.bar;
    if(s.end==='open'){certain(b.open);possibleLow=Math.min(possibleLow,b.open);possibleHigh=Math.max(possibleHigh,b.open);continue;}
    if(!s.partialStart&&!s.partialEnd){certain(b.low);certain(b.high);}
    else{
      if(!s.partialStart)certain(b.open);
      if(!s.partialEnd)certain(b.close);
      if(s.partialEnd)certain(s.exitReference);
    }
    let lo=b.low,hi=b.high;
    if(s.partialEnd){
      // Only the part BEFORE the simulated first exit can contribute. The rest
      // of this candle is an uncertainty envelope, never a measured extremum.
      if(trade.status==='Closed SL'){
        if(trade.direction==='long'){lo=Math.max(lo,s.exitReference);if(!s.deferTarget)hi=Math.min(hi,trade.takeProfit);}
        else{hi=Math.min(hi,s.exitReference);if(!s.deferTarget)lo=Math.max(lo,trade.takeProfit);}
      }else if(trade.status==='Closed TP'){
        if(trade.direction==='long'){hi=Math.min(hi,s.exitReference);lo=Math.max(lo,trade.stopLoss);}
        else{lo=Math.max(lo,s.exitReference);hi=Math.min(hi,trade.stopLoss);}
      }
    }
    possibleLow=Math.min(possibleLow,lo);possibleHigh=Math.max(possibleHigh,hi);
  }
  // Known entry/exit points and full active candles always belong to both envelopes.
  possibleLow=Math.min(possibleLow,low);possibleHigh=Math.max(possibleHigh,high);
  const side=trade.direction==='long'?1:-1;
  return {
    mae:side===1?range(Math.max(0,entry-low),Math.max(0,entry-possibleLow)):range(Math.max(0,high-entry),Math.max(0,possibleHigh-entry)),
    mfe:side===1?range(Math.max(0,high-entry),Math.max(0,possibleHigh-entry)):range(Math.max(0,entry-low),Math.max(0,entry-possibleLow))
  };
}
function subBars(parent,lower,step,clock,context){
  if(!lower||lower.symbol!==context.symbol)return null;
  const subStep=candleCloseTime(0,lower.timeframe);
  if(subStep>=step||step%subStep)return null;
  const bars=lower.bars.filter(b=>b.time>=parent.time&&b.time<parent.time+step&&b.time+subStep<=clock);
  if(bars.length!==step/subStep||bars.some((b,i)=>b.time!==parent.time+i*subStep||
    ![b.open,b.high,b.low,b.close].every(Number.isFinite)||b.low<=0||b.low>Math.min(b.open,b.close)||b.high<Math.max(b.open,b.close)))return null;
  if(!near(bars[0].open,parent.open)||!near(bars.at(-1).close,parent.close)||
    !near(Math.max(...bars.map(b=>b.high)),parent.high)||!near(Math.min(...bars.map(b=>b.low)),parent.low))return null;
  return bars;
}
function refineSegments(trade,base,lower,step,clock,context){
  let used=0,incompatible=false;const warnings=[],segments=[];
  for(const s of base){
    if(!s.partialStart&&!s.partialEnd){segments.push(s);continue;}
    const bars=subBars(s.bar,lower,step,clock,context);
    if(!bars){segments.push(s);warnings.push('Incomplete/mismatched lower-timeframe boundary data');continue;}
    const long=trade.direction==='long';
    let start=0,partialStart=false;
    if(s.partialStart){
      start=bars.findIndex(b=>long?b.low<=trade.entry:b.high>=trade.entry);
      if(start<0){segments.push(s);warnings.push('Lower path cannot locate the original limit fill');continue;}
      partialStart=!(long?bars[start].open<=trade.entry:bars[start].open>=trade.entry);
    }
    let end=bars.length-1,endMode='',conflict=false;
    if(s.partialEnd){
      end=-1;
      for(let i=start;i<bars.length;i++){
        const b=bars[i],sl=long?b.low<=trade.stopLoss:b.high>=trade.stopLoss;
        const tp=!s.deferTarget&&(long?b.high>=trade.takeProfit:b.low<=trade.takeProfit);
        if(!sl&&!tp)continue;
        const outcome=sl?'Closed SL':'Closed TP',reference=sl?trade.stopLoss:trade.takeProfit;
        const gap=long?(sl?b.open<=reference:b.open>=reference):(sl?b.open>=reference:b.open<=reference);
        if(outcome!==trade.status||gap&&!near(b.open,reference)){conflict=true;break;}
        // A touched level in the first intrabar-entry subcandle still has unknown ordering.
        end=i;endMode=gap&&!(i===start&&partialStart)?'open':'candle';break;
      }
      if(end<0)conflict=true;
    }
    if(conflict){
      incompatible=true;segments.push(s);warnings.push('Lower path conflicts with original conservative execution');continue;
    }
    for(let i=start;i<=end;i++)segments.push({bar:bars[i],partialStart:i===start&&partialStart,
      partialEnd:i===end&&s.partialEnd&&endMode!=='open',end:i===end?endMode:'',
      exitReference:s.exitReference,deferTarget:s.deferTarget});
    used++;
  }
  return {segments,used,incompatible,warnings:[...new Set(warnings)]};
}
export function measureExcursion({context,events,bars,clock,trade,lowerData=null}){
  const fail=(status,reason)=>({tradeId:trade?.id,tradeKey:trade?excursionKey(trade):'',status,reason,mae:null,mfe:null});
  if(!closed(trade)||trade.exitTime>clock)return fail('ineligible','Only currently realized, resolved trades');
  if(trade.sessionId!==context.sessionId||trade.symbol!==context.symbol||trade.timeframe!==context.timeframe||
    (trade.branchId||'main')!==(context.branchId||'main'))return fail('ineligible','Trade/replay scope mismatch');
  try{
    const step=candleCloseTime(0,context.timeframe),create=events.find(e=>e.type==='create'&&e.id===trade.id);
    if(!create)return fail('missing-data','Original create command unavailable');
    const horizon=Math.min(clock,trade.exitTime+step),known=bars.filter(b=>b.time+step<=horizon);
    if(!known.length||known[0].time>create.at)return fail('missing-data','Original order/entry OHLC coverage missing');
    const journal=events.filter(e=>e.type==='create'&&e.id===trade.id||e.tradeId===trade.id);
    const engine=new PaperTradingEngine(context,journal),state=engine.evaluate(known,horizon);
    const actual=state.trades.find(t=>t.id===trade.id);
    if(!closed(actual)||['entryTime','exitTime','entryPrice','exitPrice','initialRisk','initialRiskPerUnit','initialSL','realizedR','netR','status']
      .some(k=>trade[k]!==actual[k]))return fail('missing-data','Original closed execution cannot be reproduced from OHLC');
    if(state.history.some(e=>e.tradeId===trade.id&&e.type==='Ambiguous'))
      return fail('ambiguous-resolution','Explicit ambiguity resolution has no reliable active exit boundary; no excursion produced');
    const fill=actual.fills.find(f=>f.kind==='entry');
    if(!fill||!['open','candle'].includes(fill.timePrecision))return fail('missing-data','Entry candle provenance unavailable');
    const start=known.findIndex(b=>b.time===fill.candleTime);
    const atExit=engine.evaluate(known,actual.exitTime).trades.find(t=>t.id===trade.id);
    const exitMode=closed(atExit)&&atExit.exitPrice===actual.exitPrice&&atExit.status===actual.status?'candle':'open';
    const end=known.findIndex(b=>b.time===(exitMode==='open'?actual.exitTime:actual.exitTime-step));
    if(start<0||end<start)return fail('missing-data','Entry/exit candle unavailable or inconsistent');
    if(exitMode==='candle'&&actual.status==='Closed Manual')return fail('missing-data','Manual exit boundary is not an open');
    const exitReference=exitMode==='open'?known[end].open:actual.status==='Closed SL'?actual.stopLoss:actual.takeProfit;
    if(!(exitReference>0)||exitMode==='candle'&&(exitReference<known[end].low||exitReference>known[end].high))
      return fail('missing-data','Exit reference outside observed price range');
    const base=[];
    for(let i=start;i<=end;i++){
      const b=known[i];
      if(b.low<=0)throw new Error('Invalid active OHLC price');
      base.push({bar:b,partialStart:i===start&&fill.timePrecision==='candle',
        partialEnd:i===end&&exitMode==='candle',end:i===end?exitMode:'',exitReference,
        deferTarget:i===start&&fill.timePrecision==='candle'});
    }
    let prices=envelope(actual,base),refinement={used:0,timeframe:null,warnings:[]};
    if(lowerData){
      try{
        const refined=refineSegments(actual,base,lowerData,step,clock,context),candidate=envelope(actual,refined.segments);
        if(refined.incompatible)return {...fail('boundary-conflict','Lower OHLC contradicts the original simulated exit sequence; no excursion produced'),
          refinement:{used:0,timeframe:lowerData.timeframe,warnings:refined.warnings}};
        if(['mae','mfe'].some(k=>candidate[k].lower<prices[k].lower&&!near(candidate[k].lower,prices[k].lower)||
          candidate[k].upper>prices[k].upper&&!near(candidate[k].upper,prices[k].upper)))throw new Error('Lower path is not a compatible refinement');
        prices=candidate;refinement={used:refined.used,timeframe:lowerData.timeframe,warnings:refined.warnings};
      }catch(error){refinement.warnings=[error.message];}
    }
    const metric=p=>({price:p,percent:range(finite(p.lower/actual.entryPrice*100),finite(p.upper/actual.entryPrice*100)),
      r:range(finite(p.lower/actual.initialRiskPerUnit),finite(p.upper/actual.initialRiskPerUnit)),exact:p.lower===p.upper});
    const mae=metric(prices.mae),mfe=metric(prices.mfe),positiveRealized=Math.max(0,actual.realizedR);
    return {tradeId:trade.id,tradeKey:excursionKey(trade),status:mae.exact&&mfe.exact?'exact':'bounded',reason:'Observed active OHLC; uncertain boundary envelopes are not measured extrema',
      mae,mfe,initialRisk:actual.initialRisk,initialRiskPerUnit:actual.initialRiskPerUnit,realizedR:actual.realizedR,netR:actual.netR,
      exitReason:actual.status,entryBoundary:fill.timePrecision,exitBoundary:exitMode,
      entryCandleTime:known[start].time,exitCandleTime:known[end].time,refinement,
      stopDistance:{price:actual.initialRiskPerUnit,percent:finite(actual.initialRiskPerUnit/actual.entryPrice*100),
        utilizationPercent:range(finite(mae.r.lower*100),finite(mae.r.upper*100))},
      missedProfitR:range(Math.max(0,mfe.r.lower-positiveRealized),Math.max(0,mfe.r.upper-positiveRealized))};
  }catch(error){return fail('missing-data',error.message);}
}
export function excursionReport(trades,measurements){
  // Reuse closed-trade scope/deduplication; metadata is retained on its selected rows.
  const eligible=analyzeTrades(trades),byId=new Map();
  for(const m of measurements){
    const previous=byId.get(m.tradeKey);
    if(previous&&JSON.stringify(previous)!==JSON.stringify(m))byId.set(m.tradeKey,{tradeId:m.tradeId,tradeKey:m.tradeKey,
      status:'conflict',reason:'Conflicting excursion measurements excluded',mae:null,mfe:null});
    else byId.set(m.tradeKey,m);
  }
  const rows=eligible.rows.map(t=>({...t,excursion:byId.get(excursionKey(t))||{tradeId:t.id,status:'missing-data',reason:'No OHLC path in this session',mae:null,mfe:null}}));
  const summary=items=>{
    const valid=items.filter(t=>t.excursion.mae&&t.excursion.mfe),n=valid.length;
    const avg=(metric,edge)=>n?finite(valid.reduce((s,t)=>finite(s+t.excursion[metric].r[edge]),0)/n):null;
    return {total:items.length,measured:n,exact:valid.filter(t=>t.excursion.status==='exact').length,
      bounded:valid.filter(t=>t.excursion.status==='bounded').length,unavailable:items.length-n,
      maeR:range(avg('mae','lower'),avg('mae','upper')),mfeR:range(avg('mfe','lower'),avg('mfe','upper'))};
  };
  const groups={};
  for(const dimension of ['strategyId','outcome','session','htfBias']){
    const map=new Map();
    for(const t of rows){
      const key=dimension==='outcome'?(t.netR>0?'Winning':t.netR<0?'Losing':'Breakeven'):
        dimension==='strategyId'?t.strategyId:t.labValues?.[dimension]||'Belirtilmemiş';
      if(!map.has(key))map.set(key,[]);map.get(key).push(t);
    }
    groups[dimension]=[...map].map(([value,items])=>({value,...summary(items)}));
  }
  return {rows,summary:summary(rows),groups,excluded:eligible.excluded};
}
