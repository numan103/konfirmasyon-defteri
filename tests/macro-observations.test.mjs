import test from 'node:test';
import assert from 'node:assert/strict';
import { monthlyObservationFact } from '../lib/macro/observations.mjs';
import { generateReport } from '../lib/macro/report.mjs';
const source=(id,seriesId,currentValue,previousValue)=>({id,seriesId,currentValue,previousValue,previousPeriod:'2026-09',referencePeriod:'2026-10',kind:'primary',topic:'employment',title:seriesId==='LNS14000000'?'BLS API İşsizlik oranı':'BLS API Tarım dışı istihdam',url:'https://api.bls.gov/publicAPI/v1/timeseries/data/'+seriesId,text:'October '+currentValue+'; September '+previousValue+'; aylık değişim '+(Number(currentValue)-Number(previousValue))+' bin.'});
const evidence=()=>({cutoff:'2026-11-07T06:36:00Z',sources:[source('S1','LNS14000000','4.1','4.2'),source('S2','CES0000000001','159293','159128'),{id:'S3',kind:'primary',title:'ABD reel getiri eğrisi',instrument:'real_yield',observedAt:'2026-11-06',previousObservedAt:'2026-11-05',currentTenYearValue:'2.63',previousTenYearValue:'2.60',comparisonDirection:'increase',text:'2026-11-06 2.63; 2026-11-05 2.60',url:'https://home.treasury.gov/yield'}],events:[],calendarFailures:['BLS'],disclosures:[],provider:'test',freshCount:1,freshNewsCount:0});
test('monthly numeric facts retain a reference period without inventing publication on month day one',()=>{
  const fact=monthlyObservationFact(evidence().sources[0]);
  assert.match(fact.text,/%4,2 düzeyinden %4,1 düzeyine geriledi/);
  assert.equal(fact.referencePeriod,'2026-10');assert.equal(fact.asOf,null);assert.equal(fact.eventAt,null);
});
test('official observation summaries bypass model entirely and yield a short explicit morning conclusion',async()=>{
  let calls=0;
  const report=await generateReport(evidence(),null,undefined,{complete:async()=>{calls++;throw new Error('must not call model');}});
  assert.equal(calls,0);assert.equal(report.research.model,null);assert.equal(report.research.generation,'verified-observations-v1');
  assert.ok(report.wordCount>=120&&report.wordCount<=200);assert.match(report.text,/165 bin kişi arttı/);
  assert.match(report.text,/Ekim 2026 referans dönemine/);assert.match(report.text,/6 Kasım 2026 tarihli/);
  assert.match(report.text,/ağırlık şimdilik faiz kaynaklı baskı/);
  assert.ok(!/gerilim|2026-10-01|https?:|\[S\d+\]/.test(report.text));
});
test('numeric provenance is still enforced when reference-period numbers are generated in code',async()=>{
  const e=evidence();e.sources[0].text=e.sources[0].text.replace('4.1','4.9');
  await assert.rejects(()=>generateReport(e),/unsupported_number/);
});
test('observation mode rejects wrong provider, missing month continuity and impossible unemployment',()=>{
  const s=evidence().sources[0];
  assert.throws(()=>monthlyObservationFact({...s,url:'https://home.treasury.gov/'+s.seriesId}),/invalid_observation/);
  assert.throws(()=>monthlyObservationFact({...s,previousPeriod:'2026-08'}),/invalid_observation/);
  assert.throws(()=>monthlyObservationFact({...s,currentValue:'101'}),/invalid_observation/);
});
test('unchanged macro observations get a short continuity note, not another verbose monthly data recap',async()=>{
  const e=evidence();
  const previous=await generateReport(e);
  const next=await generateReport({...e,cutoff:'2026-11-08T06:00:00Z'},previous);
  assert.equal(next.format,'quiet-morning-v1');assert.ok(next.wordCount>=50&&next.wordCount<=120);
  assert.match(next.text,/aynı rakamları yeni gelişme gibi tekrarlamıyorum/);
  assert.ok(!next.text.includes('165 bin kişi'));
});
