import { hash, istanbul, publicUrl, verifiedDate } from './core.mjs';
import { EVENT_TYPES, METRICS } from './event-sources.mjs';

const fmt = (value,key) => (key === 'payrolls' ? new Intl.NumberFormat('tr-TR',{maximumFractionDigits:1}).format(value) + ' bin kişi' : '%' + new Intl.NumberFormat('tr-TR',{maximumFractionDigits:1}).format(value));
export function surpriseBalance(event,actual,forecasts = {}) {
  const votes = [];
  for (const key of EVENT_TYPES[event.kind].metrics) {
    const a = actual.metrics[key], f = forecasts[key];
    if (!a || !f) continue;
    if (!Number.isFinite(a.value) || !Number.isFinite(f.value) || a.unit !== METRICS[key].unit || f.unit !== a.unit || f.eventAt !== event.at || f.referencePeriod !== event.referencePeriod || f.source?.url !== 'https://nfs.faireconomy.media/ff_calendar_thisweek.json' || !verifiedDate(f.source.fetchedAt) || Date.parse(f.source.fetchedAt) >= Date.parse(event.at) || Date.parse(f.source.fetchedAt)<Date.parse(event.at)-36*3600000) throw new Error('source_forecast_mismatch');
    votes.push(Math.sign(Math.round((a.value-f.value)*1000000)) * METRICS[key].polarity);
  }
  if (!votes.length) return {stance:'mixed',reason:'verified_forecast_missing'};
  if (votes.some(v=>v>0) && votes.some(v=>v<0)) return {stance:'mixed',reason:'conflicting_surprises'};
  return {stance:votes.some(v=>v>0)?'pressure':votes.some(v=>v<0)?'support':'mixed',reason:votes.every(v=>v===0)?'inline':'forecast_comparison'};
}
export function morningBalance(sources,cutoff) {
  const s = sources.find(s=>s.instrument==='real_yield' && s.comparisonDirection);
  if (!s || !verifiedDate(s.observedAt) || Date.parse(s.observedAt)>Date.parse(cutoff) || Date.parse(cutoff)-Date.parse(s.observedAt)>72*3600000) return {stance:'mixed',reason:'current_yield_comparison_missing'};
  const a=Number(s.currentTenYearValue), b=Number(s.previousTenYearValue);
  if (!/^-?\d+(?:\.\d+)?$/.test(s.currentTenYearValue||'')||!/^-?\d+(?:\.\d+)?$/.test(s.previousTenYearValue||'')||!Number.isFinite(a)||!Number.isFinite(b)||!verifiedDate(s.previousObservedAt)||Date.parse(s.previousObservedAt)>=Date.parse(s.observedAt)||s.comparisonDirection!==(a>b?'increase':a<b?'decrease':'unchanged')) throw new Error('report_invalid_observation');
  return {stance:a>b?'pressure':a<b?'support':'mixed',reason:'dated_real_yield_comparison',asOf:s.observedAt};
}
const verdict = outlook => outlook.stance==='pressure'
  ? 'Makro ağırlık şimdilik faiz kaynaklı baskı tarafında; bu, kesin fiyat düşüşü tahmini değil.'
  : outlook.stance==='support' ? 'Makro ağırlık şimdilik faiz baskısının hafiflemesi tarafında; bu, kesin fiyat yükselişi tahmini değil.'
    : 'Şu anda BTC veya altın için net bir makro üstünlük yok; doğrulanmış veriler tek yönlü sonuç vermiyor.';
export function morningBrief({cutoff,developments,sources,events,freshNewsCount,previous=null,observationFacts=false}) {
  const outlook = morningBalance(sources,cutoff);
  const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul'}).format(new Date(cutoff));
  const focus = events.filter(e=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul'}).format(new Date(e.at))===today).slice(0,2);
  const agenda = focus.length ? 'Bugünün odağı ' + focus.map(e=>istanbul(e.at)+' Türkiye saatiyle '+(EVENT_TYPES[e.kind]?.title||e.title)).join(' ve ') + '. Açıklama öncesinde beklenti, ardından gerçekleşen sonuç ayrıca değerlendirilecek.'
    : 'Bugün için saati resmî takvimden teyit edilmiş kritik bir veri bulunamadı. Bu, takvimin boş veya risksiz olduğu anlamına gelmez; teyitsiz saat paylaşmıyorum.';
  const periods=[...new Set(sources.map(s=>s.referencePeriod).filter(p=>/^\d{4}-(?:0[1-9]|1[0-2])$/.test(p||'')))];
  const context = periods.length ? 'Bu değerlendirmedeki aylık veriler '+periods.map(p=>new Intl.DateTimeFormat('tr-TR',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(p+'-01T12:00:00Z'))).join(' ve ')+' referans dönemine ait. '
    : freshNewsCount===0 ? 'Yeni bülten teyidi yok; aşağıdaki karşılaştırmalar mevcut verilerin değerlendirmesidir. ' : '';
  const yieldDate=outlook.asOf?new Intl.DateTimeFormat('tr-TR',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(outlook.asOf))+' tarihli':'Son tarihli';
  const analysis = outlook.stance==='pressure'
    ? yieldDate+' reel faiz karşılaştırması yukarı yönlü. Bu durum altının fırsat maliyetini artırırken BTC için de finansal koşullar üzerinden baskı oluşturabilir. Ancak büyüme iyimserliği BTC’de bu etkiyle çelişebilir; altındaki güvenli liman talebi ise ayrı bir kanal.'
    : outlook.stance==='support' ? yieldDate+' reel faiz karşılaştırması aşağı yönlü. Bu, altının fırsat maliyetini azaltabilir ve BTC için finansal koşulları rahatlatabilir. Yine de doların güçlenmesi bu desteği sınırlayabilir; yalnız faiz hareketinden kurumsal talep veya kalıcı fiyat eğilimi sonucu çıkarmıyorum.'
      : 'Bu kesitte faiz ve doların birlikte hangi yönde ilerlediğine dair yeterli teyit yok. BTC’de likidite ve risk iştahı, altında reel faiz ve güvenli liman talebi ayrı değerlendirilmeli. İki varlığın aynı habere aynı yönde tepki vermesi zorunlu değil.';
  const observations=sources.filter(s=>['LNS14000000','CES0000000001'].includes(s.seriesId));
  const currentYield=sources.find(s=>s.instrument==='real_yield'),oldYield=previous?.sources?.find(s=>s.instrument==='real_yield');
  const sameYield=outlook.asOf&&currentYield&&oldYield&&['observedAt','previousObservedAt','currentTenYearValue','previousTenYearValue'].every(k=>currentYield[k]===oldYield[k]);
  const quiet=observationFacts&&sameYield&&observations.length===2&&previous?.outlook?.stance===outlook.stance&&previous.outlook.asOf===outlook.asOf&&observations.every(s=>{
    const old=previous.sources?.find(o=>o.seriesId===s.seriesId);
    return old&&['referencePeriod','currentValue','previousValue','previousPeriod'].every(k=>old[k]===s[k]);
  });
  if(quiet) {
    const text=['ALFA MAKRO · Sabah',istanbul(cutoff)+' · Türkiye saati','','Takip edilen aylık istihdam göstergeleri ve son tarihli reel faiz karşılaştırması önceki raporla aynı; aynı rakamları yeni gelişme gibi tekrarlamıyorum. '+verdict(outlook),'',agenda+' Yeni veri veya doğrulanmış beklenti farkı oluşursa değerlendirme yenilenir. Önceki görüşün korunması, bugünkü fiyatların da aynı yönde hareket ettiği anlamına gelmez; yeni bir piyasa tepkisi iddia etmiyorum.'].join('\n');
    return {text,outlook,quiet:true};
  }
  const text=['ALFA MAKRO · Sabah',istanbul(cutoff)+' · Türkiye saati','',context+developments.slice(0,2).join(' '),'',analysis+' '+agenda,'',verdict(outlook)+' Görüşü değiştirecek unsur, dolar ve reel faizin ters yönde kalıcı hareketi ya da açıklanacak verinin doğrulanmış beklentiden ayrışması. Bu bir işlem sinyali değil.'].join('\n');
  return {text,outlook,quiet:false};
}

function validateActual(event,actual,now) {
  const releaseDay=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(event.at));
  if (actual.eventId!==event.id || actual.eventAt!==event.at || actual.releaseDate!==releaseDay || !verifiedDate(actual.observedAt) || !actual.observedAt.includes('T') || Date.parse(actual.observedAt)<Date.parse(event.at) || Date.parse(actual.observedAt)>now || now-Date.parse(actual.observedAt)>15*60000 || now<Date.parse(event.at)+5*60000) throw new Error('source_release_unconfirmed');
  if (!actual.sources?.length || actual.sources.some(s=>s.kind!=='primary'||!publicUrl(s.url)||!/(^|\.)bls\.gov$|(^|\.)bea\.gov$/.test(new URL(s.url).hostname))) throw new Error('source_release_unconfirmed');
  for (const key of Object.keys(actual.metrics||{})) if (!EVENT_TYPES[event.kind].metrics.includes(key)||!Number.isFinite(actual.metrics[key].value)||actual.metrics[key].unit!==METRICS[key].unit||(actual.metrics[key].previous!==null&&!Number.isFinite(actual.metrics[key].previous))||(event.kind!=='gdp'&&actual.metrics[key].referencePeriod!==event.referencePeriod)) throw new Error('source_release_unit_invalid');
  if (!Object.keys(actual.metrics).length) throw new Error('source_release_unconfirmed');
}
export function eventFingerprint(actual) {
  return hash(Object.entries(actual.metrics).sort(([a],[b])=>a.localeCompare(b)).map(([key,m])=>[key,m.referencePeriod,m.value,m.previous]));
}
const revisionThreshold={payrolls:25,unemployment:0.1,cpi:0.1,coreCpi:0.1,pce:0.1,corePce:0.1,gdp:0.2};
export function materialRevision(event,current,previous,forecasts={}) {
  if(!previous||eventFingerprint(current)===eventFingerprint(previous))return false;
  if(surpriseBalance(event,current,forecasts).stance!==surpriseBalance(event,previous,forecasts).stance)return true;
  return Object.entries(current.metrics).some(([key,m])=>{
    const old=previous.metrics[key];if(!old)return false;
    return Math.abs(m.value-old.value)+1e-9>=revisionThreshold[key]||(m.previous!==null&&old.previous!==null&&Math.abs(m.previous-old.previous)+1e-9>=revisionThreshold[key]);
  });
}
export function eventReport({event,stage,forecasts={},actual=null,baseline=null,previousActual=null,now=Date.now()}) {
  const title=EVENT_TYPES[event.kind]?.title;
  if (!title||!['pre','post','follow'].includes(stage)) throw new Error('report_event_unsupported');
  const age=now-Date.parse(event.at);
  if(!Number.isFinite(age)||(stage==='pre'&&age>=0)||(stage==='post'&&(age<5*60000||age>60*60000))||(stage==='follow'&&(age<35*60000||age>90*60000)))throw new Error('macro_event_not_due');
  forecasts=Object.fromEntries(Object.entries(forecasts).filter(([,f])=>{
    const captured=Date.parse(f.source?.fetchedAt);
    return Number.isFinite(captured)&&captured<=now&&captured<Date.parse(event.at)&&captured>=Date.parse(event.at)-36*3600000&&f.eventAt===event.at;
  }));
  let text,outlook=null,fingerprint=null;
  if (stage==='pre') {
    const expectations=Object.entries(forecasts).map(([key,f])=>{
      surpriseBalance(event,{metrics:{[key]:{value:f.value,unit:METRICS[key].unit}}},{[key]:f});
      return METRICS[key].label+' için takvim beklentisi '+fmt(f.value,key)+(f.previousCalendar!==null?' (önceki takvim değeri '+fmt(f.previousCalendar,key)+')':'')+'.';
    }).join(' ');
    const driver=event.kind==='employment'?'güçlü istihdam':event.kind==='gdp'?'güçlü büyüme':'yüksek enflasyon';
    text=title+' · Veri öncesi\n'+istanbul(now)+' · Türkiye saati\n\n'+istanbul(event.at)+' Türkiye saatiyle açıklanması planlanıyor. '+(expectations?expectations+' Bu rakamlar takvim beklentisidir; kesin sonuç değildir.':'Açıklama öncesi doğrulanmış beklenti değeri alınamadı; tahmin vermiyorum.')+'\n\nBeklentiden '+driver+', faizlerin daha uzun süre sıkı kalması düşüncesini güçlendirebilir; zayıf sonuç bunu tersine çevirebilir. BTC’de büyüme endişesi ile faiz etkisi çelişebilir. Altında reel faiz ve dolar belirleyici olur; risk iştahı otomatik destek değildir. Resmî sonuç doğrulanabilirse güncellemede sabahki görüşle farkını açıkça belirteceğim.';
  } else {
    validateActual(event,actual,now);
    fingerprint=eventFingerprint(actual);
    if (stage==='follow' && !materialRevision(event,actual,previousActual,forecasts)) return null;
    outlook=surpriseBalance(event,actual,forecasts);
    const numbers=stage==='follow'?Object.entries(actual.metrics).flatMap(([key,a])=>{
      const old=previousActual.metrics[key];
      if(!old)return [];
      return [ ...(old.value!==a.value?[METRICS[key].label+' ilk teyitte '+fmt(old.value,key)+' iken '+fmt(a.value,key)+' oldu.']:[]), ...(old.previous!==a.previous&&old.previous!==null&&a.previous!==null?['Önceki dönem değeri '+fmt(old.previous,key)+' yerine '+fmt(a.previous,key)+' olarak güncellendi.']:[]) ];
    }).join(' '):Object.entries(actual.metrics).map(([key,a])=>METRICS[key].label+' '+fmt(a.value,key)+(forecasts[key]?', takvim beklentisi '+fmt(forecasts[key].value,key):', açıklama öncesi beklenti teyidi yok')+(a.previous!==null?', önceki '+fmt(a.previous,key):'')+'.').join(' ');
    const impact=outlook.reason==='verified_forecast_missing' ? 'Önceki değere göre değişim, beklenti sürpriziyle aynı şey değil. Beklenti teyidi olmadığından bu sonuçtan kesin bir faiz veya fiyat yönü çıkarmıyorum.'
      : outlook.stance==='pressure' ? 'Beklentiye göre fark, sıkı para politikası ihtimalini güçlendiren tarafta. Bu, faiz ve dolar üzerinden BTC ve altına baskı oluşturabilir; gerçekleşmiş fiyat tepkisi henüz teyit edilmiş değil.'
        : outlook.stance==='support' ? 'Beklentiye göre fark, faiz baskısının hafiflemesini destekleyen tarafta. Bu BTC ve altın için destekleyici olabilir; BTC’de büyüme kaygısı, altında doların seyri sonucu değiştirebilir.'
          : 'Sonuçlar beklentiyle uyumlu veya kendi içinde çelişkili; tek yönlü bir makro sürpriz sonucu çıkarmıyorum.';
    const comparison=!baseline?.outlook ? 'Sabah görüşü için karşılaştırılabilir bir kayıt yok; bu değerlendirme yalnız yeni açıklama içindir.'
      : outlook.reason==='verified_forecast_missing' ? 'Sabah görüşünü değiştirmek için yeterli beklenti karşılaştırması yok.'
        : outlook.reason==='inline' ? 'Sonuç beklentiye yakın; sabahki görüşü değiştiren belirgin bir sürpriz yok.'
        : baseline.outlook.stance===outlook.stance ? 'Sabahki makro değerlendirme korunuyor.'
          : outlook.stance==='mixed' ? 'Sabahki tek yönlü değerlendirme zayıfladı; yeni sonuç daha dengeli bir tabloya işaret ediyor.'
            : 'Sabahki değerlendirme değişti: yeni veri '+(outlook.stance==='pressure'?'baskı':'destek')+' senaryosunu öne çıkarıyor.';
    const previousMissing=stage==='post'&&Object.values(actual.metrics).some(m=>m.previous===null)?' Önceki resmî değer bu kesitte teyit edilemedi.':'';
    text=title+(stage==='follow'?' · Revizyon güncellemesi':' · Veri açıklandı')+'\n'+istanbul(now)+' · Türkiye saati\n\n'+numbers+previousMissing+'\n\n'+impact+' '+comparison+' İlk açıklama ile sonradan revize edilen değerler birbirinden ayrılır; takvimdeki saat yerine resmî sonuç erişimi esas alınmıştır. Bu bir işlem sinyali değildir.';
  }
  const words=text.trim().split(/\s+/u).length;
  if(text.length>3900||words>180)throw new Error('report_event_length');
  return {text,chunks:[text],telegramFormat:'event-v1',reportHash:hash(text),cutoff:new Date(now).toISOString(),outlook,fingerprint,sources:actual?.sources||Object.values(forecasts).map(f=>f.source),wordCount:words,stage,eventId:event.id};
}
