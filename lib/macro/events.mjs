import { dayKey, hash } from './core.mjs';
import { macroStore } from './store.mjs';
import { macroTarget } from './target.mjs';
import { readSource, research } from './research.mjs';
import { generateReport } from './report.mjs';
import { collectActual, collectEventAgenda, collectForecasts, FORECAST_URL, parseForecasts } from './event-sources.mjs';
import { eventReport } from './event-report.mjs';
import { sendTelegram } from '../telegram.mjs';

const terminal = new Set(['sending','sent','delivery_unknown','delivery_failed','skipped','expired']);
export function dueStages(event,now) {
  const age=now-Date.parse(event.at);
  if (!Number.isFinite(age)) return [];
  return [ ...(age>=-15*60000&&age<-5*60000?['pre']:[]), ...(age>=5*60000&&age<=60*60000?['post']:[]), ...(age>=35*60000&&age<=90*60000?['follow']:[]) ];
}
export function macroEvents(deps={}) {
  const store=deps.store||macroStore(), clock=deps.clock||Date.now, targetFor=deps.target||macroTarget;
  const agenda=deps.agenda||collectEventAgenda, forecastsFor=deps.forecasts||collectForecasts, actualFor=deps.actual||collectActual;
  const collect=deps.research||research, generate=deps.generate||generateReport, send=deps.send||sendTelegram;
  const enabled=s=>s.payload.enabled===true&&s.payload.eventUpdatesEnabled===true&&process.env.MACRO_ENABLED!=='0';
  const range=()=>[new Date(clock()-86400000).toISOString(),new Date(clock()+7*86400000).toISOString()];
  async function status() {
    const settings=await store.settings();
    const rows=await store.events(...range());
    return {storageReady:true,enabled:enabled(settings),configured:settings.payload.eventUpdatesEnabled===true,agenda:settings.payload.eventAgenda||null,events:rows.filter(r=>!r.payload.invalidated).map(r=>({id:r.id,...r.payload.event,forecasts:r.payload.forecasts||{}}))};
  }
  async function refreshAgenda(force=false) {
    let settings=await store.settings();
    if(!force&&!enabled(settings))return {phase:'disabled'};
    const known=await store.events(...range()); // Fail before HTTP if event storage is absent.
    const budget=AbortSignal.timeout(43000);
    const result=await agenda({now:clock(),signal:budget});
    const page=!deps.forecasts&&result.events.some(e=>Date.parse(e.at)>clock())?await readSource(FORECAST_URL,budget).catch(()=>null):null;
    const ids=new Set(result.events.map(e=>e.id));
    for(const row of known) {
      const authority=['employment','cpi'].includes(row.payload.event.kind)?'BLS':'BEA';
      if(!ids.has(row.id)&&result.authorities?.includes(authority)&&Date.parse(row.payload.event.at)>clock())await store.saveEvent(row,{...row.payload,invalidated:true,invalidatedReason:'removed_from_official_calendar'});
    }
    for(const event of result.events) {
      let row=await store.event(event.id);
      let forecasts=row?.payload.event.at===event.at?row.payload.forecasts||{}:{};
      if(Date.parse(event.at)>clock()) {
        try { if(deps.forecasts)forecasts=await forecastsFor(event,{signal:budget}); else if(page)forecasts=parseForecasts(page.text,event,page.fetchedAt); }
        catch { /* Preserve only previously captured, pre-release expectations. */ }
      }
      const payload={...row?.payload,event,forecasts,invalidated:false};
      if(row)await store.saveEvent(row,payload);
      else { row=await store.createEvent(event); if(row)await store.saveEvent(row,payload); }
    }
    settings=await store.settings();
    const summary={fetchedAt:new Date(clock()).toISOString(),count:result.events.length,failures:result.failures,authorities:result.authorities};
    await store.saveSettings(settings,{...settings.payload,eventAgenda:summary});
    return {phase:'ready',...summary};
  }
  async function prepare(eventRow,stage,targetHash,preview=false) {
    const event=eventRow.payload.event;
    const id=(preview?'preview:':'')+event.id+':'+stage;
    let row=await store.update(id);
    if(row&&terminal.has(row.payload.phase))return row;
    if(row?.payload.phase==='researching'&&row.payload.leaseUntil>clock())throw new Error('macro_busy');
    if(row?.payload.nextAttemptAt>clock())return row;
    if((row?.payload.attempts||0)>=3)return row;
    if(row?.payload.phase==='ready'&&row.payload.targetHash===targetHash&&clock()-Date.parse(row.payload.report.cutoff)<10*60000)return row;
    const payload={phase:'researching',eventId:event.id,stage,preview,targetHash,attempts:(row?.payload.attempts||0)+1,leaseUntil:clock()+90000};
    row=row?await store.saveUpdate(row,payload):await store.createUpdate(id,payload);
    if(!row)throw new Error('macro_busy');
    try {
      let forecasts=eventRow.payload.forecasts||{}, actual=null, previousActual=null;
      if(stage==='pre') {
        try { forecasts=await forecastsFor(event,{signal:AbortSignal.timeout(10000)}); await store.saveEvent(eventRow,{...eventRow.payload,forecasts}); } catch { /* Missing forecast is explicit, never an invented number. */ }
      } else {
        actual=await actualFor(event,{now:clock(),signal:AbortSignal.timeout(30000)});
        if(stage==='follow') {
          const post=await store.update(event.id+':post');
          if(post?.payload.phase!=='sent')return store.saveUpdate(row,{...payload,phase:'skipped',reason:'no_confirmed_initial_delivery',leaseUntil:null});
          previousActual=post.payload.actual;
        }
      }
      const baseline=(await store.read(dayKey(new Date(clock()))))?.payload.report;
      const report=eventReport({event,stage,forecasts,actual,previousActual,baseline,now:clock()});
      if(!report)return store.saveUpdate(row,{...payload,phase:'skipped',reason:'no_material_change',leaseUntil:null});
      return store.saveUpdate(row,{...payload,phase:'ready',leaseUntil:null,report,actual,forecasts});
    }catch(e) {
      await store.saveUpdate(row,{...payload,phase:'research_failed',leaseUntil:null,error:/^(source_|report_|macro_)[a-z_]+$/.test(e.message)?e.message:'source_release_unavailable',nextAttemptAt:clock()+(payload.attempts===1?10:15)*60000}).catch(()=>{});
      throw e;
    }
  }
  async function deliver(row,target) {
    if(row.payload.preview||row.payload.phase!=='ready'||row.payload.targetHash!==target.public.targetHash)throw new Error('macro_confirmation_required');
    const eventRow=await store.event(row.payload.eventId), event=eventRow?.payload.event;
    if(!event||eventRow.payload.invalidated||!dueStages(event,clock()).includes(row.payload.stage)||Date.parse(row.payload.report.cutoff)>clock()||clock()-Date.parse(row.payload.report.cutoff)>10*60000)throw new Error('macro_report_expired');
    const settings=await store.settings();
    if(!enabled(settings)||settings.payload.approvedTargetHash!==target.public.targetHash||settings.payload.testedTargetHash!==target.public.targetHash)throw new Error('macro_target_not_approved');
    const text=row.payload.report.text;
    if(typeof text!=='string'||text.length>3900||hash(text)!==row.payload.report.reportHash)throw new Error('macro_invalid_chunks');
    row=await store.saveUpdate(row,{...row.payload,phase:'sending',sendingAt:new Date(clock()).toISOString()});
    let result;
    try { result=await send(text,target.chatId,target.threadId,null,{signal:AbortSignal.timeout(15000)}); }
    catch { await store.saveUpdate(row,{...row.payload,phase:'delivery_unknown'}).catch(()=>{});throw new Error('telegram_delivery_unknown'); }
    if(!result.ok||!result.result?.message_id) {
      const known=result.ok===false&&result.http>=400&&result.http<500;
      await store.saveUpdate(row,{...row.payload,phase:known?'delivery_failed':'delivery_unknown'}).catch(()=>{});
      throw new Error(known?'telegram_rejected':'telegram_delivery_unknown');
    }
    await store.saveUpdate(row,{...row.payload,phase:'sent',messageId:result.result.message_id,sentAt:new Date(clock()).toISOString()});
    return {phase:'sent',parts:1,eventId:event.id,stage:row.payload.stage};
  }
  async function run() {
    const settings=await store.settings();
    if(!enabled(settings))return {phase:'disabled'};
    const rows=await store.events(new Date(clock()-90*60000).toISOString(),new Date(clock()+15*60000).toISOString());
    const due=rows.filter(r=>!r.payload.invalidated&&Date.parse(r.payload.event.verifiedAt)<=clock()&&clock()-Date.parse(r.payload.event.verifiedAt)<18*3600000).flatMap(r=>dueStages(r.payload.event,clock()).map(stage=>({row:r,stage})));
    due.sort((a,b)=>['post','pre','follow'].indexOf(a.stage)-['post','pre','follow'].indexOf(b.stage));
    for(const item of due) {
      const old=await store.update(item.row.id+':'+item.stage);
      if(old&&(terminal.has(old.payload.phase)||old.payload.nextAttemptAt>clock()||old.payload.attempts>=3))continue;
      if(item.stage==='follow'&&(await store.update(item.row.id+':post'))?.payload.phase!=='sent')continue;
      const target=await targetFor(AbortSignal.timeout(5000));
      if(target.public.warning||settings.payload.approvedTargetHash!==target.public.targetHash||settings.payload.testedTargetHash!==target.public.targetHash)throw new Error('macro_target_not_approved');
      const prepared=await prepare(item.row,item.stage,target.public.targetHash);
      return prepared.payload.phase==='ready'?deliver(prepared,target):{phase:prepared.payload.phase};
    }
    return {phase:'no_due_event'};
  }
  return {
    status,run,refreshAgenda,
    preview:async body=>{
      const row=await store.event(body.eventId);
      if(!row||row.payload.invalidated||!['pre','post','follow'].includes(body.stage))throw new Error('macro_event_not_found');
      if(body.stage==='pre'?clock()>=Date.parse(row.payload.event.at):!dueStages(row.payload.event,clock()).includes(body.stage))throw new Error('macro_event_not_due');
      const target=await targetFor(AbortSignal.timeout(5000));
      const prepared=await prepare(row,body.stage,target.public.targetHash,true);
      return {phase:prepared.payload.phase,target:target.public,report:prepared.payload.report||null,preview:true};
    },
    previewMorning:async(body={})=>{
      await store.settings();
      const id='preview:morning-v2:'+dayKey(new Date(clock()));
      let row=await store.update(id);
      if(row?.payload.phase==='ready'&&clock()-Date.parse(row.payload.report.cutoff)<15*60000&&(!body.observationsOnly||row.payload.report.research?.generation==='verified-observations-v1'))return {phase:'ready',report:row.payload.report,preview:true};
      if(row?.payload.phase==='researching'&&row.payload.leaseUntil>clock())throw new Error('macro_busy');
      if(row?.payload.attempts>=3)throw new Error('macro_attempt_limit');
      const priorPreviewFailures=[...(row?.payload.priorPreviewFailures||[]),...(row?.payload.diagnostic?[{error:row.payload.error,diagnostic:row.payload.diagnostic}]:[])];
      const payload={phase:'researching',preview:true,attempts:(row?.payload.attempts||0)+1,leaseUntil:clock()+90000,...(priorPreviewFailures.length?{priorPreviewFailures}:{})};
      row=row?await store.saveUpdate(row,payload):await store.createUpdate(id,payload);
      if(!row)throw new Error('macro_busy');
      try {
        const signal=AbortSignal.timeout(45000);
        const evidence=await collect({now:clock(),signal});
        const previous=store.previous?await store.previous(dayKey(new Date(clock()))):null;
        const report=await generate(evidence,previous,signal,{requireObservations:body.observationsOnly===true});
        await store.saveUpdate(row,{...payload,phase:'ready',leaseUntil:null,report});
        return {phase:'ready',report,preview:true};
      }catch(e){await store.saveUpdate(row,{...payload,phase:'research_failed',leaseUntil:null,error:e.message,...(e.diagnostic?{diagnostic:e.diagnostic}:{})}).catch(()=>{});throw e;}
    },
    setEnabled:async body=>{
      const settings=await store.settings();
      if(body.enabled===false){await store.saveSettings(settings,{...settings.payload,eventUpdatesEnabled:false});return {enabled:false};}
      const target=await targetFor(AbortSignal.timeout(5000));
      if(body.confirmEnable!==true||body.targetHash!==target.public.targetHash||settings.payload.testedTargetHash!==target.public.targetHash)throw new Error('macro_test_required');
      await store.events(...range());
      await store.saveSettings(settings,{...settings.payload,eventUpdatesEnabled:true,eventPipelineVersion:'events-v1'});
      return {enabled:true,requiresDailyEnable:settings.payload.enabled!==true};
    },
  };
}
