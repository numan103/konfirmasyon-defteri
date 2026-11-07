import { verifiedDate } from './core.mjs';
const number=value=>new Intl.NumberFormat('tr-TR',{useGrouping:false,maximumFractionDigits:10}).format(value);
// Application-written facts from typed official observations. No model output is
// repaired or stripped. A reference month is NEVER invented as a publication day.
export function monthlyObservationFact(source) {
  if(!['LNS14000000','CES0000000001'].includes(source?.seriesId))return null;
  const url=new URL(source.url);
  if(source.kind!=='primary'||url.hostname!=='api.bls.gov'||!url.pathname.endsWith('/'+source.seriesId)||!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(source.referencePeriod||'')||!verifiedDate(source.referencePeriod+'-01'))throw new Error('report_invalid_observation');
  const prior=new Date(source.referencePeriod+'-01T12:00:00Z');prior.setUTCMonth(prior.getUTCMonth()-1);
  if(source.previousPeriod!==prior.toISOString().slice(0,7)||!/^\d+(?:\.\d+)?$/.test(source.currentValue||'')||!/^\d+(?:\.\d+)?$/.test(source.previousValue||''))throw new Error('report_invalid_observation');
  const current=Number(source.currentValue),previous=Number(source.previousValue),delta=current-previous;
  if(!Number.isFinite(delta))throw new Error('report_invalid_observation');
  let text;
  if(source.seriesId==='LNS14000000') {
    if(current>100||previous>100)throw new Error('report_invalid_observation');
    text=delta===0?'İşsizlik oranı önceki ayla aynı kalarak %'+number(current)+' oldu.':'İşsizlik oranı önceki ayın %'+number(previous)+' düzeyinden %'+number(current)+' düzeyine '+(delta<0?'geriledi.':'yükseldi.');
  }else text=delta===0?'Tarım dışı istihdam önceki aya göre değişmedi.':'Tarım dışı istihdam önceki aya kıyasla '+number(Math.abs(delta))+' bin kişi '+(delta>0?'arttı.':'azaldı.');
  return {text,sourceIds:[source.id],referencePeriod:source.referencePeriod,asOf:null,eventAt:null,opinion:false};
}
