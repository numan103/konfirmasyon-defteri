// Counterfactual research only. Replays the existing Paper engine, never sends commands to it.
import { PaperTradingEngine } from './alfa-paper-model.mjs?v=1';
import { candleCloseTime } from './alfa-replay-model.mjs?v=3';
export const RR_TARGETS=[2,2.5,3];
const closed=t=>t&&!t.ambiguous&&['Closed TP','Closed SL','Closed Manual'].includes(t.status);
export function rrScenario({context,events,bars,clock,trade,target}){
  const fail=(status,reason)=>({tradeId:trade?.id,target,status,reason,result:null});
  if(!RR_TARGETS.includes(target))return fail('unsupported','Only 2R / 2.5R / 3R');
  if(!closed(trade)||trade.sessionId!==context.sessionId||trade.symbol!==context.symbol||trade.timeframe!==context.timeframe||
    (trade.branchId||'main')!==(context.branchId||'main'))
    return fail('ineligible','Only active-scope resolved closed trades');
  const create=events.find(e=>e.type==='create'&&e.id===trade.id);
  if(!create)return fail('missing-data','Original create command unavailable');
  try{
    const step=candleCloseTime(0,context.timeframe),known=bars.filter(b=>b.time+step<=clock);
    if(!known.length||known[0].time>create.at||known.at(-1).time+step!==clock)
      return fail('missing-data','OHLC must cover the original order through the current closed replay clock');
    const journal=events.filter(e=>e.id===trade.id&&e.type==='create'||e.tradeId===trade.id);
    // Validation includes OHLC holes and original fill reproduction; final R alone is never used.
    const actual=new PaperTradingEngine(context,journal).evaluate(known,clock).trades.find(t=>t.id===trade.id);
    if(!closed(actual)||['entryPrice','entryTime','initialRisk','initialRiskPerUnit','initialSL','exitPrice','exitTime','netR','realizedR','status']
      .some(k=>actual[k]!==trade[k]))return fail('missing-data','Original execution cannot be reproduced from this price path');
    const price=trade.entryPrice+(trade.direction==='long'?1:-1)*target*trade.initialRiskPerUnit;
    if(!Number.isFinite(price)||price<=0)return fail('unsupported','Invalid scenario target price');
    const alternate=structuredClone(journal).filter(e=>e.type!=='resolve');
    for(const e of alternate){
      if(e.type==='create'){e.order.takeProfit=price;e.order.policy='conservative';}
      if(e.type==='edit')e.takeProfit=price; // Preserve original stop edits and their clocks.
    }
    const result=new PaperTradingEngine(context,alternate).evaluate(known,clock).trades.find(t=>t.id===trade.id);
    if(!result||['entryPrice','entryTime','initialRisk','initialSL'].some(k=>result[k]!==trade[k]))
      return fail('unsupported','Target change cannot preserve the original fill and initial risk');
    if(!closed(result))return fail('unresolved','Scenario has not closed within the known OHLC path');
    return {tradeId:trade.id,target,status:'complete',reason:'Conservative Paper execution; original SL/manual commands retained',result};
  }catch(error){return fail('missing-data','Scenario not produced: '+error.message);}
}
