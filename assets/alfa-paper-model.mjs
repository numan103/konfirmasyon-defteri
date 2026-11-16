// Deterministic replay-only simulator. No network, exchange client or real orders.
import { candleCloseTime } from './alfa-replay-model.mjs?v=3';
const copy=v=>structuredClone(v);
const positive=v=>Number.isFinite(v)&&v>0;
export function validateOrder(order) {
  if(!order || !['long','short'].includes(order.direction) || !['market','limit'].includes(order.orderType) ||
    !positive(order.entry) || !positive(order.stopLoss) || !positive(order.takeProfit) ||
    !positive(order.positionSize) || !Number.isFinite(order.riskPercentage) || order.riskPercentage<0 ||
    !['conservative','ambiguous'].includes(order.policy))throw new Error('Invalid paper order');
  const d=order.direction==='long'?1:-1;
  if(d*(order.entry-order.stopLoss)<=0 || d*(order.takeProfit-order.entry)<=0)throw new Error('Wrong-side SL/TP or zero risk');
  if(!Number.isFinite(order.entry*order.positionSize) ||
    !Number.isFinite(Math.abs(order.entry-order.stopLoss)*order.positionSize))throw new Error('Paper order size overflow');
  for(const key of ['feeBps','slippageBps','spread'])if(!Number.isFinite(order[key]) || order[key]<0 ||
    order[key]>(key==='spread'?order.entry:1000))throw new Error('Invalid execution cost');
  if(order.notes!=null && (typeof order.notes!=='string'||order.notes.length>2000))throw new Error('Invalid trade notes');
  if(order.expiresAt!=null && !Number.isFinite(order.expiresAt))throw new Error('Invalid expiration');
  return copy(order);
}
export function createPaperOrder(input) {
  const order={direction:'long',orderType:'market',riskPercentage:1,feeBps:0,slippageBps:0,spread:0,policy:'conservative',notes:'',...input};
  if(order.takeProfit==null)order.takeProfit=order.entry+(order.direction==='long'?1:-1)*2.5*Math.abs(order.entry-order.stopLoss);
  if(order.positionSize==null && positive(order.riskAmount))order.positionSize=order.riskAmount/Math.abs(order.entry-order.stopLoss);
  order.expiresAt=order.expiresAt??null;
  for(const key of Object.keys(order))if(order[key]===undefined)delete order[key];
  return validateOrder(order);
}
function execution(reference, side, order, limit=null) {
  let price=reference+side*(order.spread/2+reference*order.slippageBps/10000);
  if(limit!=null)price=side===1?Math.min(price,limit):Math.max(price,limit);
  if(!positive(price))throw new Error('Non-positive execution price');
  const total=Math.abs(price-reference);
  return {price,slippage:Math.max(0,total-order.spread/2)*order.positionSize,
    spreadCost:Math.min(total,order.spread/2)*order.positionSize};
}
export class PaperTradingEngine {
  constructor(context, journal=[]) {
    if(!context?.sessionId || !context.symbol || !context.timeframe)throw new Error('Paper replay context required');
    candleCloseTime(0,context.timeframe);
    this.context=copy(context);
    this.events=copy(journal);
    this.validateJournal();
  }
  validateJournal(){
    const ids=new Set();
    if(!Array.isArray(this.events)||this.events.length>10000)throw new Error('Paper journal size limit');
    for(const e of this.events){
      if(!e || typeof e.id!=='string' || ids.has(e.id) || !Number.isFinite(e.at) ||
        !['create','cancel','close','edit','resolve'].includes(e.type))throw new Error('Invalid paper event');
      ids.add(e.id);
      if(e.type==='create')createPaperOrder(e.order);
    }
  }
  command(type,payload,at,id) {
    if(!Number.isFinite(at)||!id || this.events.some(e=>e.id===id))throw new Error('Invalid/duplicate paper event');
    const event={...copy(payload),id,at,type,version:1};
    if(type==='create')event.order=createPaperOrder(event.order);
    this.events.push(event);
    try{this.validateJournal();}catch(error){this.events.pop();throw error;}
    return id;
  }
  serialize(){return {version:1,context:copy(this.context),events:copy(this.events)};}
  evaluate(bars,clock) {
    const step=candleCloseTime(0,this.context.timeframe), known=bars.filter(b=>b.time+step<=clock);
    if(known.length)for(let i=0;i<known.length;i++){
      const b=known[i];
      if(![b.time,b.open,b.high,b.low,b.close].every(Number.isFinite) ||
        b.low>Math.min(b.open,b.close)||b.high<Math.max(b.open,b.close) ||
        (i && b.time!==known[i-1].time+step))throw new Error('Missing/invalid paper candle');
    }
    const trades=new Map(), history=[];
    const events=this.events.map((e,index)=>({...e,index})).filter(e=>e.at<=clock).sort((a,b)=>a.at-b.at||a.index-b.index);
    let ei=0, mark=null;
    const close=(t,reference,time,reason)=>{
      const fill=execution(reference,-t.side,t);
      t.exitTime=time;t.exitPrice=fill.price;t.status=reason;
      t.slippage+=fill.slippage;
      t.spreadCost+=fill.spreadCost;
      t.fees+=Math.abs(fill.price*t.positionSize)*t.feeBps/10000;
      t.realizedR=t.side*(fill.price-t.entryPrice)/t.initialRiskPerUnit;
      t.netR=t.realizedR-t.fees/t.initialRisk;
      t.ambiguous=null;t.closeRequested=false;
      t.fills.push({kind:'exit',price:fill.price,quantity:t.positionSize,time});
      history.push({tradeId:t.id,type:reason,at:time,price:fill.price});
    };
    const apply=e=>{
      if(e.type==='create'){
        if(trades.has(e.id))throw new Error('Duplicate trade');
        const o=createPaperOrder(e.order);
        trades.set(e.id,{...o,...this.context,id:e.id,side:o.direction==='long'?1:-1,
          orderCreatedAt:e.at,entryTime:null,entryPrice:null,initialSL:o.stopLoss,initialRisk:null,
          initialRiskPerUnit:null,riskReward:Math.abs(o.takeProfit-o.entry)/Math.abs(o.entry-o.stopLoss),
          status:'Pending',exitTime:null,exitPrice:null,realizedR:null,netR:null,fees:0,slippage:0,spreadCost:0,
          fills:[],notes:o.notes,version:1,ambiguous:null});
        history.push({tradeId:e.id,type:'Created',at:e.at});
        return;
      }
      const t=trades.get(e.tradeId);if(!t)return;
      if(e.type==='cancel' && t.status==='Pending'){t.status='Cancelled';history.push({tradeId:t.id,type:'Cancelled',at:e.at});}
      if(e.type==='close' && t.status==='Open' && !t.closeRequested){
        t.closeRequested=true;history.push({tradeId:t.id,type:'Close Requested',at:e.at});
      }
      if(e.type==='edit' && ['Pending','Open'].includes(t.status)){
        if(t.ambiguous)return;
        const entry=t.entryPrice??t.entry,sl=e.stopLoss,tp=e.takeProfit;
        const stopReference=t.status==='Open'?(mark??entry):entry;
        if(!positive(sl)||!positive(tp)||t.side*(stopReference-sl)<=0||t.side*(tp-entry)<=0 ||
          t.side*(tp-sl)<=0)throw new Error('Invalid SL/TP edit');
        t.stopLoss=sl;t.takeProfit=tp;t.version++;
        history.push({tradeId:t.id,type:'Edited',at:e.at,stopLoss:sl,takeProfit:tp});
      }
      if(e.type==='resolve' && t.status==='Open' && t.ambiguous && ['sl','tp'].includes(e.outcome)){
        const a=t.ambiguous;
        close(t,e.outcome==='sl'?a.sl:a.tp,e.at,e.outcome==='sl'?'Closed SL':'Closed TP');
      }
    };
    for(const bar of known){
      while(ei<events.length && events[ei].at<=bar.time)apply(events[ei++]);
      for(const t of trades.values()){
        if(t.status==='Pending' && t.expiresAt!=null && bar.time>=t.expiresAt){t.status='Expired';history.push({tradeId:t.id,type:'Expired',at:bar.time});}
        let intrabarLimit=false;
        if(t.status==='Pending'){
          const touched=t.orderType==='market' || (t.side===1?bar.low<=t.entry:bar.high>=t.entry);
          if(!touched)continue;
          const improved=t.side===1?bar.open<=t.entry:bar.open>=t.entry;
          intrabarLimit=t.orderType==='limit'&&!improved;
          const reference=t.orderType==='market'||improved?bar.open:t.entry;
          const fill=execution(reference,t.side,t,t.orderType==='limit'?t.entry:null);
          const risk=t.side*(fill.price-t.stopLoss);
          if(risk<=0 || !Number.isFinite(risk*t.positionSize) || t.side*(t.takeProfit-fill.price)<=0){
            t.status='Cancelled';t.reason='Gap invalidated planned risk';
            history.push({tradeId:t.id,type:'Cancelled',at:bar.time,reason:t.reason});continue;
          }
          t.entryTime=intrabarLimit?bar.time+step:bar.time;
          t.entryPrice=fill.price;t.initialSL=t.stopLoss;t.initialRiskPerUnit=risk;
          t.initialRisk=risk*t.positionSize;t.riskReward=t.side*(t.takeProfit-fill.price)/risk;
          t.status='Open';t.slippage=fill.slippage;t.spreadCost=fill.spreadCost;t.fees=Math.abs(fill.price*t.positionSize)*t.feeBps/10000;
          t.fills.push({kind:'entry',price:fill.price,quantity:t.positionSize,candleTime:bar.time,timePrecision:intrabarLimit?'candle':'open'});
          history.push({tradeId:t.id,type:'Filled',at:t.entryTime,price:fill.price});
        }
        if(t.status!=='Open'||t.ambiguous)continue;
        if(t.closeRequested){close(t,bar.open,bar.time,'Closed Manual');continue;}
        const stopGap=t.side===1?bar.open<=t.stopLoss:bar.open>=t.stopLoss;
        const targetGap=t.side===1?bar.open>=t.takeProfit:bar.open<=t.takeProfit;
        const sl=t.side===1?bar.low<=t.stopLoss:bar.high>=t.stopLoss;
        const tp=t.side===1?bar.high>=t.takeProfit:bar.low<=t.takeProfit;
        if(!intrabarLimit && stopGap){close(t,bar.open,bar.time,'Closed SL');continue;}
        if(!intrabarLimit && targetGap){close(t,bar.open,bar.time,'Closed TP');continue;}
        if(sl&&tp && t.policy==='ambiguous'){
          t.ambiguous={at:bar.time+step,sl:t.stopLoss,tp:t.takeProfit};
          history.push({tradeId:t.id,type:'Ambiguous',at:bar.time+step});continue;
        }
        if(sl){close(t,t.stopLoss,bar.time+step,'Closed SL');continue;}
        // A limit filled intrabar may have seen TP before entry: never award that profit.
        if(tp&&!intrabarLimit)close(t,t.takeProfit,bar.time+step,'Closed TP');
      }
      mark=bar.close;
    }
    while(ei<events.length)apply(events[ei++]); // new orders/edits visible, but no retroactive fill
    for(const t of trades.values()){
      if(t.status==='Pending' && t.expiresAt!=null && clock>=t.expiresAt){
        t.status='Expired';history.push({tradeId:t.id,type:'Expired',at:Math.max(t.orderCreatedAt,t.expiresAt)});
      }
      t.currentR=t.status==='Open'&&known.length?t.side*(known.at(-1).close-t.entryPrice)/t.initialRiskPerUnit:null;
    }
    return {trades:copy([...trades.values()]),history:copy(history)};
  }
}
