// Saved research snapshots live inside existing Paper / Replay payloads, not a new database.
import { emptyLab,validateLab,sourceKey } from './alfa-lab-model.mjs?v=1';
import { validateAnalytics } from './alfa-strategy-model.mjs?v=1';
export function labSnapshot(engine,replay,capturedAt=Date.now()){
  const state=engine.evaluate(replay.bars,replay.clock);
  return {version:1,clock:replay.clock,capturedAt,trades:state.trades,
    ambiguityIds:state.history.filter(e=>e.type==='Ambiguous').map(e=>e.tradeId)};
}
export function savedLabSources(storage,owner,active){
  const sources=new Map(),warnings=[],conflicts=new Set();
  if(!owner||!active)return {sources:[],warnings:['Active owner/session required']};
  const activeKey=sourceKey(active.context);
  const paperPrefix='alfa-paper:v1:'+owner+':',replayPrefix='alfa-replay-session:v1:'+owner+':';
  let inspected=0;
  for(let i=0;i<storage.length;i++){
    const key=storage.key(i);
    if(!key||key.endsWith(':lab-watermark')||!key.startsWith(paperPrefix)&&!key.startsWith(replayPrefix))continue;
    if(++inspected>500){warnings.push('Saved session scan limited to 500 records');break;}
    try{
      const raw=JSON.parse(storage.getItem(key)),journal=key.startsWith(replayPrefix)?raw?.paper:raw;
      if(!journal?.labSnapshot){warnings.push('Legacy session without research snapshot; reopen and save it to include');continue;}
      const c=journal.context,s=journal.labSnapshot;
      if(!c?.sessionId||!c.symbol||!c.timeframe||journal.version!==1||s.version!==1||
        !Number.isFinite(s.clock)||s.clock<0||s.clock>8640000000000||!Number.isFinite(s.capturedAt)||s.capturedAt<0||
        !Array.isArray(s.trades)||s.trades.length>10000||
        !Array.isArray(s.ambiguityIds)||!Array.isArray(journal.events))throw new Error('Invalid research snapshot');
      // Check key/context isolation and the presence of every original create command.
      const expected=key.startsWith(paperPrefix)?paperPrefix+c.symbol+':'+c.timeframe+':'+c.sessionId:replayPrefix+c.symbol+':'+c.timeframe;
      if(key!==expected)throw new Error('Saved research context mismatch');
      const ids=new Set(journal.events.filter(e=>e.type==='create'&&e.at<=s.clock).map(e=>e.id));
      if(s.trades.some(t=>!t||!ids.has(t.id)||t.sessionId!==c.sessionId||t.symbol!==c.symbol||t.timeframe!==c.timeframe||
        t.exitTime!=null&&t.exitTime>s.clock))throw new Error('Snapshot trade scope mismatch');
      const id=sourceKey(c);
      if(id===activeKey)continue; // Current evaluated state ALWAYS replaces every saved clock.
      if(conflicts.has(id))continue;
      const source={context:c,clock:s.clock,capturedAt:s.capturedAt,trades:s.trades,ambiguityIds:s.ambiguityIds,
        lab:journal.lab?validateLab(journal.lab):emptyLab(),analytics:journal.analytics?validateAnalytics(journal.analytics):{annotations:{}}};
      const previous=sources.get(id);
      if(!previous||previous.capturedAt<source.capturedAt)sources.set(id,source);
      else if(previous.capturedAt===source.capturedAt&&JSON.stringify(previous)!==JSON.stringify(source)){
        sources.delete(id);conflicts.add(id);warnings.push('Conflicting saved snapshot excluded: '+c.sessionId);
      }
    }catch(error){warnings.push(error.message);}
  }
  sources.set(activeKey,active);
  return {sources:[...sources.values()],warnings:[...new Set(warnings)]};
}
