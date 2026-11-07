import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalEvent, collectActual, collectEventAgenda, FORECAST_URL, parseForecasts, parseMonthlySeries } from '../lib/macro/event-sources.mjs';
import { eventFingerprint, eventReport, morningBalance, surpriseBalance } from '../lib/macro/event-report.mjs';
import { dueStages, macroEvents } from '../lib/macro/events.mjs';

const AT=Date.parse('2026-11-06T13:30:00Z');
const event=()=>({id:'employment-2026-11-06',kind:'employment',title:'ABD istihdam verisi',officialTitle:'Employment Situation',at:new Date(AT).toISOString(),referencePeriod:'2026-10',verifiedAt:new Date(AT-3600000).toISOString(),source:{url:'https://www.bls.gov/schedule/news_release/bls.ics'}});
const feed=()=>JSON.stringify([
  {title:'Non-Farm Employment Change',country:'CAD',date:new Date(AT).toISOString(),forecast:'99K',previous:'1K'},
  {title:'Non-Farm Employment Change',country:'USD',date:new Date(AT).toISOString(),forecast:'65K',previous:'29K'},
  {title:'Unemployment Rate',country:'USD',date:new Date(AT).toISOString(),forecast:'4.2%',previous:'4.2%'},
]);
const forecasts=()=>parseForecasts(feed(),event(),new Date(AT-3600000).toISOString());
const actual=(now=AT+5*60000,value=165)=>({eventId:event().id,eventAt:event().at,releaseDate:'2026-11-06',observedAt:new Date(now).toISOString(),verification:'release_and_api',metrics:{payrolls:{value,previous:29,unit:'bin kişi',referencePeriod:'2026-10'},unemployment:{value:4.1,previous:4.2,unit:'%',referencePeriod:'2026-10'}},sources:[{url:'https://www.bls.gov/news.release/empsit.nr0.htm',kind:'primary',text:'Test release',fetchedAt:new Date(now).toISOString()}]});

test('official calendar alone defines events; source identifiers and DST never come from forecast feed',()=>{
  const e=canonicalEvent({title:'Employment Situation',at:event().at},{kind:'primary',url:'https://www.bls.gov/schedule/news_release/bls.ics',fetchedAt:event().verifiedAt});
  assert.equal(e.kind,'employment');assert.equal(e.referencePeriod,'2026-10');
  assert.equal(canonicalEvent({title:'Employment Situation',at:event().at},{kind:'secondary',url:FORECAST_URL}),null);
  assert.equal(canonicalEvent({title:'Employment Situation',at:event().at},{kind:'primary',url:'https://www.bea.gov/calendar'}),null);
  assert.equal(canonicalEvent({title:'Employment Situation',at:'2026-11-06'},{kind:'primary',url:'https://www.bls.gov/calendar'}),null);
});
test('forecast snapshot is metric/unit/time matched, missing values are unknown, post-release snapshots refused',()=>{
  const f=forecasts();assert.equal(f.payrolls.value,65);assert.equal(f.unemployment.value,4.2);
  assert.equal(f.payrolls.source.kind,'secondary_calendar');
  assert.equal(parseForecasts(feed().replace('65K',''),event(),event().verifiedAt).payrolls,undefined);
  assert.equal(parseForecasts(feed().replace('65K','0K'),event(),event().verifiedAt).payrolls.value,0);
  assert.equal(parseForecasts(feed().replace('65K','0.065M'),event(),event().verifiedAt).payrolls,undefined);
  assert.throws(()=>parseForecasts(feed(),event(),new Date(AT).toISOString()),/after_release/);
  const duplicate=JSON.parse(feed());duplicate.push(duplicate[1]);
  assert.throws(()=>parseForecasts(JSON.stringify(duplicate),event(),event().verifiedAt),/ambiguous/);
});
const api=(id,values)=>JSON.stringify({status:'REQUEST_SUCCEEDED',Results:{series:[{seriesID:id,data:values.map(([period,value])=>({year:period.slice(0,4),period:'M'+period.slice(5),value:String(value)}))}]}});
const payrollApi=()=>api('CES0000000001',[['2026-10',159293],['2026-09',159128],['2026-08',159099]]);
test('official API verifies correct reference month, chronological continuity, numeric values and duplicate periods',()=>{
  assert.equal(parseMonthlySeries(payrollApi(),'CES0000000001','2026-10')[0].value,159293);
  assert.throws(()=>parseMonthlySeries(payrollApi(),'CES0000000001','2026-11'),/period_unconfirmed/);
  assert.throws(()=>parseMonthlySeries(payrollApi().replace('M09','M07'),'CES0000000001','2026-10'),/period_gap/);
  assert.throws(()=>parseMonthlySeries(payrollApi().replace('M09','M10'),'CES0000000001','2026-10'),/api_invalid/);
  const withGap = api('LNS14000000',[['2026-10',4.1],['2026-09',4.2],['2026-08',4.1],['2025-10','-']]);
  assert.equal(parseMonthlySeries(withGap,'LNS14000000','2026-10').length,3);
  assert.throws(()=>parseMonthlySeries(api('LNS14000000',[['2026-10','-'],['2026-09',4.2]]),'LNS14000000','2026-10'),/period_unconfirmed/);
});
const release='<h1>THE EMPLOYMENT SITUATION -- OCTOBER 2026</h1><p>Transmission of material in this release is embargoed until 8:30 a.m. (ET) Friday, November 6, 2026</p><p>Total nonfarm payroll employment rose by 165,000 in October. The unemployment rate was little changed at 4.1 percent.</p>';
test('employment result requires official release date AND matching API observations, not scheduled time alone',async()=>{
  const read=async url=>({url,fetchedAt:new Date(AT+5*60000).toISOString(),text:url.includes('nr0')?release:url.includes('CES000')?payrollApi():api('LNS14000000',[['2026-10',4.1],['2026-09',4.2],['2026-08',4.2]])});
  const out=await collectActual(event(),{now:AT+5*60000,read});
  assert.equal(out.metrics.payrolls.value,165);assert.equal(out.metrics.payrolls.previous,29);assert.equal(out.metrics.unemployment.value,4.1);
  assert.equal(out.sources.length,3);
  await assert.rejects(()=>collectActual(event(),{now:AT+4*60000,read}),/not_due/);
  await assert.rejects(()=>collectActual(event(),{now:AT+5*60000,read:async url=>({...await read(url),...(url.includes('nr0')?{text:release.replace('November 6','October 6')}: {})})}),/date_unconfirmed/);
  await assert.rejects(()=>collectActual(event(),{now:AT+5*60000,read:async url=>({...await read(url),...(url.includes('nr0')?{text:release.replace('165,000','166,000')}: {})})}),/crosscheck_failed/);
});
test('a blocked BLS release page falls back to API-only verification with an explicit disclosure',async()=>{
  const read=async url=>{
    if(url.includes('nr0')){const e=new Error('source_unavailable');e.status=403;throw e;}
    return {url,fetchedAt:new Date(AT+5*60000).toISOString(),text:url.includes('CES000')?payrollApi():api('LNS14000000',[['2026-10',4.1],['2026-09',4.2],['2026-08',4.2]])};
  };
  const out=await collectActual(event(),{now:AT+5*60000,read});
  assert.equal(out.verification,'api_only');
  assert.equal(out.metrics.payrolls.value,165);assert.equal(out.metrics.unemployment.value,4.1);
  assert.equal(out.sources.length,2);
  assert.ok(out.sources.every(s=>new URL(s.url).hostname==='api.bls.gov'));
  const p=eventReport({event:event(),stage:'post',actual:out,now:AT+5*60000});
  assert.match(p.text,/yalnız resmî BLS API üzerinden doğrulandı/);
  assert.match(p.text,/manşet metniyle çapraz kontrol yapılamadı/);
});
test('API-only fallback cannot announce a result before the new official period exists',async()=>{
  const stale=()=>api('CES0000000001',[['2026-09',159128],['2026-08',159099],['2026-07',159050]]);
  const read=async url=>{
    if(url.includes('nr0')){const e=new Error('source_unavailable');e.status=403;throw e;}
    return {url,fetchedAt:new Date(AT+5*60000).toISOString(),text:url.includes('CES000')?stale():api('LNS14000000',[['2026-10',4.1],['2026-09',4.2],['2026-08',4.2]])};
  };
  await assert.rejects(()=>collectActual(event(),{now:AT+5*60000,read}),/period_unconfirmed/);
});
test('CPI monthly change uses seasonally adjusted series and crosschecks the official monthly release',async()=>{
  const e={...event(),id:'cpi-test',kind:'cpi',officialTitle:'Consumer Price Index'};
  const html='<h1>CONSUMER PRICE INDEX -- OCTOBER 2026</h1>Transmission embargoed until 8:30 a.m. Friday, November 6, 2026. The Consumer Price Index for All Urban Consumers (CPI-U) increased 0.3 percent in October on a seasonally adjusted basis. The index for all items less food and energy rose 0.3 percent.';
  const out=await collectActual(e,{now:AT+5*60000,read:async url=>({url,fetchedAt:new Date(AT+5*60000).toISOString(),text:url.includes('nr0')?html:api(url.includes('SA0L1E')?'CUSR0000SA0L1E':'CUSR0000SA0',[['2026-10',307.6],['2026-09',306.7],['2026-08',306.1]])})});
  assert.equal(out.metrics.cpi.value,0.3);assert.equal(out.metrics.cpi.previous,0.2);
});
test('BEA GDP is annualized quarter growth and PCE is month-over-month, never substituted',async()=>{
  const gdpAt=Date.parse('2026-10-29T12:30:00Z');
  const e={...event(),id:'gdp',kind:'gdp',at:new Date(gdpAt).toISOString(),officialTitle:'Gross Domestic Product (Advance Estimate)',referencePeriod:null};
  const listing='<table><tr><td><a href="/news/2026/gdp">Gross Domestic Product, Third Quarter 2026 (Advance Estimate)</a></td><td><time datetime="2026-10-29T08:30:00-04:00">October 29, 2026</time></td></tr></table>';
  const out=await collectActual(e,{now:gdpAt+5*60000,read:async url=>({url,fetchedAt:new Date(gdpAt+5*60000).toISOString(),text:url.includes('current-releases')?listing:'Real gross domestic product (GDP) increased at an annual rate of 2.3 percent in the third quarter of 2026.'})});
  assert.equal(out.metrics.gdp.value,2.3);assert.equal(out.metrics.gdp.referencePeriod,'2026-Q3');assert.equal(out.metrics.gdp.previous,null);
  const pce={...event(),id:'pce',kind:'pce',officialTitle:'Personal Income and Outlays'};
  const pListing='<table><tr><td><a href="/news/2026/pce">Personal Income and Outlays, October 2026</a></td><td><time datetime="2026-11-06T08:30:00-05:00">November 6, 2026</time></td></tr></table>';
  const p=await collectActual(pce,{now:AT+5*60000,read:async url=>({url,fetchedAt:new Date(AT+5*60000).toISOString(),text:url.includes('current-releases')?pListing:'Personal Income and Outlays, October 2026 From the preceding month, the PCE price index increased 0.3 percent. Excluding food and energy, the PCE price index increased 0.2 percent.'})});
  assert.equal(p.metrics.pce.value,0.3);assert.equal(p.metrics.corePce.value,0.2);
});
test('event verdict uses frozen expectation surprise; previous month is not a substitute for consensus',()=>{
  assert.equal(surpriseBalance(event(),actual(),forecasts()).stance,'pressure');
  assert.equal(surpriseBalance(event(),actual(),{}).reason,'verified_forecast_missing');
  const a=actual();a.metrics.unemployment.value=4.4;
  assert.equal(surpriseBalance(event(),a,forecasts()).reason,'conflicting_surprises');
  const f=forecasts();f.payrolls.source.fetchedAt=new Date(AT+1).toISOString();
  assert.throws(()=>surpriseBalance(event(),actual(),f),/forecast_mismatch/);
});
test('headline and core inflation surprises are evaluated together, not forced into one direction',()=>{
  const e={...event(),kind:'cpi'};
  const make=value=>({value,unit:'%',eventAt:e.at,referencePeriod:e.referencePeriod,source:{url:FORECAST_URL,fetchedAt:event().verifiedAt}});
  const result=surpriseBalance(e,{metrics:{cpi:{value:0.2,unit:'%'},coreCpi:{value:0.4,unit:'%'}}},{cpi:make(0.3),coreCpi:make(0.3)});
  assert.equal(result.stance,'mixed');assert.equal(result.reason,'conflicting_surprises');
});
test('expired event previews are refused rather than repackaging yesterday as a new release',()=>{
  assert.throws(()=>eventReport({event:event(),stage:'pre',now:AT+1}),/event_not_due/);
  assert.throws(()=>eventReport({event:event(),stage:'post',actual:actual(AT+2*3600000),now:AT+2*3600000}),/event_not_due/);
});
test('release update explains change from morning and skips unchanged follow-ups despite fresh HTTP timestamps',()=>{
  const a=actual();const args={event:event(),forecasts:forecasts(),actual:a,baseline:{outlook:{stance:'support'}},now:AT+5*60000};
  const p=eventReport({...args,stage:'post'});
  assert.match(p.text,/Sabahki değerlendirme değişti/);assert.match(p.text,/165 bin kişi/);assert.match(p.text,/takvim beklentisi 65 bin kişi/);
  assert.ok(!/https?:|\[S\d+\]|^•/m.test(p.text));assert.ok(p.wordCount<=180);
  const again={...a,observedAt:new Date(AT+35*60000).toISOString()};
  assert.equal(eventFingerprint(a),eventFingerprint(again));
  assert.equal(eventReport({...args,actual:again,previousActual:a,stage:'follow',now:AT+35*60000}),null);
  again.metrics={...again.metrics,payrolls:{...again.metrics.payrolls,value:166}};
  assert.equal(eventReport({...args,actual:again,previousActual:a,stage:'follow',now:AT+35*60000}),null);
  again.metrics.payrolls.value=200;
  assert.match(eventReport({...args,actual:again,previousActual:a,stage:'follow',now:AT+35*60000}).text,/Revizyon güncellemesi/);
});
test('no forecast means no surprise claim; inline values do not falsely reverse the morning view',()=>{
  const a=actual();
  let p=eventReport({event:event(),stage:'post',actual:a,now:AT+5*60000,baseline:{outlook:{stance:'pressure'}}});
  assert.match(p.text,/Beklenti teyidi olmadığından/);
  a.metrics.payrolls.value=65;a.metrics.unemployment.value=4.2;
  p=eventReport({event:event(),stage:'post',actual:a,forecasts:forecasts(),now:AT+5*60000,baseline:{outlook:{stance:'pressure'}}});
  assert.match(p.text,/görüşü değiştiren belirgin bir sürpriz yok/);
});
test('stale or future-dated forecast captures are not presented as a current pre-release expectation',()=>{
  const f=forecasts();for(const value of Object.values(f))value.source.fetchedAt=new Date(AT-40*3600000).toISOString();
  const p=eventReport({event:event(),stage:'post',actual:actual(),forecasts:f,now:AT+5*60000});
  assert.equal(p.outlook.reason,'verified_forecast_missing');assert.ok(!p.text.includes('takvim beklentisi 65'));
});
test('due windows never send late catch-up messages or announce a result before actual confirmation',()=>{
  assert.deepEqual(dueStages(event(),AT-15*60000),['pre']);
  assert.deepEqual(dueStages(event(),AT-4*60000),[]);
  assert.deepEqual(dueStages(event(),AT+5*60000),['post']);
  assert.deepEqual(dueStages(event(),AT+35*60000),['post','follow']);
  assert.deepEqual(dueStages(event(),AT+91*60000),[]);
  const old=actual(AT-60000);
  assert.throws(()=>eventReport({event:event(),stage:'post',actual:old,now:AT+5*60000}),/unconfirmed/);
});

function memory() {
  let rev=0,settings={revision:'0',payload:{enabled:true,eventUpdatesEnabled:true,approvedTargetHash:'target',testedTargetHash:'target'}};
  const events=new Map(),updates=new Map();const copy=x=>x?structuredClone(x):null;
  const create=(map,id,payload)=>{if(map.has(id))return null;const row={id,revision:String(++rev),payload:copy(payload)};map.set(id,row);return copy(row);};
  const save=(map,row,payload)=>{if(map.get(row.id)?.revision!==row.revision)throw new Error('macro_conflict');const next={...row,revision:String(++rev),payload:copy(payload)};map.set(row.id,next);return copy(next);};
  return {settings:async()=>copy(settings),saveSettings:async(row,payload)=>{if(row.revision!==settings.revision)throw new Error('macro_conflict');settings={revision:String(++rev),payload:copy(payload)};return copy(settings);},read:async()=>({payload:{report:{outlook:{stance:'support'}}}}),event:async id=>copy(events.get(id)),events:async()=>[...events.values()].map(copy),createEvent:async e=>create(events,e.id,{event:e}),saveEvent:async(r,p)=>save(events,r,p),update:async id=>copy(updates.get(id)),createUpdate:async(id,p)=>create(updates,id,p),saveUpdate:async(r,p)=>save(updates,r,p)};
}
async function engine({uncertain=false,failAck=false,failResearch=false}={}) {
  const store=memory();await store.createEvent(event());let row=await store.event(event().id);await store.saveEvent(row,{...row.payload,forecasts:forecasts()});
  let now=AT+5*60000,sends=0,collections=0;
  const originalSave=store.saveUpdate;
  if(failAck)store.saveUpdate=async(r,p)=>{if(p.phase==='sent')throw new Error('macro_storage_unavailable');return originalSave(r,p);};
  const svc=macroEvents({store,clock:()=>now,target:async()=>({chatId:'test',threadId:772,public:{targetHash:'target'}}),actual:async()=>{collections++;if(failResearch)throw new Error('source_unavailable');return actual(now);},send:async()=>{sends++;assert.equal((await store.update(event().id+':post')).payload.phase,'sending');if(uncertain)throw new Error('timeout');return {ok:true,result:{message_id:123}};}});
  return {store,svc,sends:()=>sends,collections:()=>collections,advance:minutes=>{now+=minutes*60000;}};
}
test('parallel event workers claim one durable release update and persist Telegram acknowledgement',async()=>{
  const f=await engine();const results=await Promise.allSettled([f.svc.run(),f.svc.run()]);
  assert.equal(results.filter(r=>r.status==='fulfilled'&&r.value.phase==='sent').length,1);assert.equal(f.sends(),1);
  assert.equal((await f.store.update(event().id+':post')).payload.messageId,123);
  await f.svc.run();assert.equal(f.sends(),1);
});
test('unknown event delivery and lost acknowledgement commits never reclaim a sending slot',async()=>{
  for(const options of [{uncertain:true},{failAck:true}]){
    const f=await engine(options);await assert.rejects(()=>f.svc.run(),/delivery_unknown|storage_unavailable/);
    await f.svc.run();assert.equal(f.sends(),1);
    assert.ok(['sending','delivery_unknown'].includes((await f.store.update(event().id+':post')).payload.phase));
  }
});
test('event research retries are bounded and back off; disabled pipeline spends on neither sources nor Telegram',async()=>{
  const f=await engine({failResearch:true});
  await assert.rejects(()=>f.svc.run(),/source_unavailable/);await f.svc.run();assert.equal(f.collections(),1);
  f.advance(10);await assert.rejects(()=>f.svc.run(),/source_unavailable/);
  f.advance(15);await assert.rejects(()=>f.svc.run(),/source_unavailable/);
  f.advance(5);await f.svc.run();assert.equal(f.collections(),3);assert.equal(f.sends(),0);
  const settings=await f.store.settings();await f.store.saveSettings(settings,{...settings.payload,eventUpdatesEnabled:false});
  assert.equal((await f.svc.run()).phase,'disabled');assert.equal(f.collections(),3);
});
test('preview outbox cannot consume or deliver the real event slot',async()=>{
  const f=await engine();const p=await f.svc.preview({eventId:event().id,stage:'post'});
  assert.equal(p.preview,true);assert.equal(f.sends(),0);assert.equal(await f.store.update(event().id+':post'),null);
  await f.svc.run();assert.equal(f.sends(),1);
});
test('official agenda fetch failures produce gaps rather than fabricated events',async()=>{
  const out=await collectEventAgenda({now:AT,read:async()=>{throw new Error('source_unavailable');}});
  assert.deepEqual(out.events,[]);assert.deepEqual(out.failures.map(f=>f.name).sort(),['BEA','BLS','ForexFactory']);assert.equal(out.secondaryCount,0);
});
test('dated real yield alone can set a conditional morning balance, nominal or old levels cannot',()=>{
  const s={instrument:'real_yield',observedAt:'2026-11-06',previousObservedAt:'2026-11-05',currentTenYearValue:'2.63',previousTenYearValue:'2.60',comparisonDirection:'increase'};
  assert.equal(morningBalance([s],new Date(AT).toISOString()).stance,'pressure');
  assert.equal(morningBalance([{...s,instrument:'nominal_yield'}],new Date(AT).toISOString()).stance,'mixed');
  assert.equal(morningBalance([s],'2026-11-12T06:00:00Z').stance,'mixed');
});
