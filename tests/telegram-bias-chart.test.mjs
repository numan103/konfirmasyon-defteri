import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { wantsBiasChart, buildBiasChartModel, biasChartSvg, biasChartContext, biasChartViewport, biasScenarioGeometry } from '../lib/telegram-bias-chart.mjs';
import { renderBiasChart, createBiasChartRenderer } from '../lib/telegram-bias-image.mjs';
import { deliverQaReply } from '../lib/telegram-qa-delivery.mjs';
import { handleTelegramUpdate, briefMarketFallback, needsBriefRewrite, hasPriceScaleError } from '../lib/telegram-qa.mjs';
import { closedBars, TF_MS } from '../lib/alpha-strategy-v16.mjs';

const history=JSON.parse(fs.readFileSync(new URL('./fixtures/alpha-v16/btc-2025-01.json',import.meta.url)));
const asOf=history.end;
const detail=history.detail;

test('chart is explicit opt-in; normal opinions and negative requests stay text-only',()=>{
  for(const q of ['BTC grafikle yorumla','BTC grafiğini at','/grafik BTC','/chart BTC','BTC görselle','BTC çizsene'])
    assert.equal(wantsBiasChart(q),true,q);
  for(const q of ['BTC hakkında fikrin nedir?','BTC grafiksiz anlat','grafik gönderme','grafik istemem','grafik değil','görselsiz yorum'])
    assert.equal(wantsBiasChart(q),false,q);
});
test('two scenarios use real observable pivots; both confirmations remain hypothetical',()=>{
  const model=buildBiasChartModel({detail,asOf,symbol:'BTC'});
  const actual=new Set(detail['15m'].candles.flatMap(b=>[b.h,b.l]));
  for(const p of [model.upper,model.lower,model.above,model.below]) assert.ok(actual.has(p));
  assert.ok(model.lower<model.price && model.price<model.upper);
  assert.equal(model.scenarios.short.confirmed,false);
  assert.equal(model.scenarios.long.confirmed,false);
  assert.equal(model.executionAuthorized,false);
  assert.equal(model.schematic,true);
  assert.ok(model.bars.every(b=>b.closeTime<=asOf));
  assert.match(biasChartContext(model),/henüz gerçekleşmiş teyit/);
});
test('wider 36h frame leaves display space above/below data with rounded price ticks',()=>{
  const model=buildBiasChartModel({detail,asOf,symbol:'BTC'});
  assert.equal(model.bars.length,144);
  const viewport=biasChartViewport(model);
  assert.ok(viewport.bottom<Math.min(...model.bars.map(b=>b.l)));
  assert.ok(viewport.top>Math.max(...model.bars.map(b=>b.h)));
  assert.ok(viewport.ticks.length>=5);
  assert.ok(viewport.ticks.every(p=>Math.abs(p/viewport.step-Math.round(p/viewport.step))<1e-8));
  assert.equal((model.lastClosedAt-model.bars[0].t)/3600000,36);
  assert.doesNotMatch(biasChartSvg(model),/Görünen tepe|Görünen dip|BIAS:|Anlık/);
});
test('live quote is distinct from the last closed bar and rejects future or different-venue quotes',()=>{
  const base=buildBiasChartModel({detail,asOf});
  const quote={price:(base.lower+base.upper)/2,at:asOf,source:detail['15m'].source};
  const m=buildBiasChartModel({detail,asOf,quote});
  assert.equal(m.price,base.price);
  assert.equal(m.anchorPrice,quote.price);
  assert.ok(biasChartSvg(m).includes(Number(quote.price).toLocaleString('tr-TR',{maximumFractionDigits:0})));
  assert.doesNotMatch(biasChartSvg(m),/mum teyidi ayrı|canlı tick/);
  for(const q of [{...quote,at:asOf+1},{...quote,source:'different venue'},{...quote,at:asOf-600000}])
    assert.equal(buildBiasChartModel({detail,asOf,quote:q}).liveQuote,null);
});
test('fresh all-time-in-window low/high quote still renders, without inventing support or resistance beyond it',()=>{
  const base=buildBiasChartModel({detail,asOf}),actual=new Set(detail['15m'].candles.flatMap(b=>[b.h,b.l]));
  for(const [price,side,state] of [[base.below-500,'below','new_low'],[base.above+500,'above','new_high']]){
    const m=buildBiasChartModel({detail,asOf,quote:{price,at:asOf,source:detail['15m'].source}});
    assert.equal(m.boundaryState,state);assert.equal(m.unmappedSide,side);
    assert.ok(actual.has(m.lower)&&actual.has(m.upper));
    assert.equal(side==='below'?m.scenarios.short.continuationReference:m.scenarios.long.continuationReference,null);
    assert.ok(renderBiasChart(m).length>10000);
    const text=briefMarketFallback({symbol:'BTC',price},m);
    assert.equal(needsBriefRewrite(text),false);
    assert.match(text,/teyitli yeni pivot yok/);
    assert.match(biasChartContext(m),/VARMIŞ GİBİ SUNMA/);
  }
});
test('price exactly at a historical low/high does not fail the reference bracket check',()=>{
  const base=buildBiasChartModel({detail,asOf});
  for(const [price,state] of [[base.below,'at_low'],[base.above,'at_high']]){
    const m=buildBiasChartModel({detail,asOf,quote:{price,at:asOf,source:detail['15m'].source}});
    assert.equal(m.boundaryState,state);
    assert.ok(m.lower<m.upper);
  }
});
test('currency range scale sanity catches 60–61 dollars, without silently multiplying units or rejecting explicit thousands/risk amounts',()=>{
  const ref={symbol:'BTC',price:60461};
  for(const text of ['Fiyat 60-61 $ aralığında.','Fiyat 60‑61 $ aralığında.','BTC $60–$61 arasında.'])
    assert.equal(hasPriceScaleError(text,ref),true,text);
  for(const text of ['60.000–61.000 $ aralığı.','60–61 bin $ aralığı.','$60–$61 bin aralığı.','İşlem başına risk 20–30 $.'])
    assert.equal(hasPriceScaleError(text,ref),false,text);
});
test('local event labels only use observable completed candles and never assert a canonical M2 signal',()=>{
  const m=buildBiasChartModel({detail,asOf});
  if(m.recentEvent) {
    assert.ok(m.recentEvent.at<=asOf);
    assert.ok(!m.recentEvent.reclaimedAt||m.recentEvent.reclaimedAt<=asOf);
    assert.equal(m.recentEvent.candidateOnly,true);
    assert.match(biasChartContext(m),/M2 ana swing teyidi değildir/);
  }
});
test('chart fallback remains short but contains the actual two references, not canned placeholder commentary',()=>{
  const m=buildBiasChartModel({detail,asOf});
  const reply=briefMarketFallback({symbol:'BTC',price:m.price,trend:'aşağı'},m);
  assert.ok(reply.includes(Number(m.lower).toLocaleString('tr-TR',{maximumFractionDigits:0})));
  assert.ok(reply.includes(Number(m.upper).toLocaleString('tr-TR',{maximumFractionDigits:0})));
  assert.equal(needsBriefRewrite(reply),false);
  assert.doesNotMatch(reply,/eldeki 1 saatlik görünüm/);
  assert.match(briefMarketFallback({symbol:'BTC',price:null},m),/son 15M kapanışı/);
});
test('chart model cannot see future candles or incomplete OHLC bars',()=>{
  const cutoff=detail['15m'].candles.at(-30).t+TF_MS['15m'];
  const prefix=Object.fromEntries(Object.entries(detail).map(([tf,row])=>[tf,{...row,candles:closedBars(row.candles,tf,cutoff)}]));
  assert.deepEqual(buildBiasChartModel({detail,asOf:cutoff}),buildBiasChartModel({detail:prefix,asOf:cutoff}));
});
test('missing, flat, untrusted symbol or stale data cannot create a fabricated chart',()=>{
  assert.throws(()=>buildBiasChartModel({detail:{},asOf}),/missing/);
  assert.throws(()=>buildBiasChartModel({detail,asOf:asOf+3600000}),/stale/);
  assert.throws(()=>buildBiasChartModel({detail,asOf,symbol:'SOL'}),/unsupported/);
  const flat=Array.from({length:60},(_,i)=>({t:asOf-(60-i)*900000,o:100,h:100,l:100,c:100}));
  assert.throws(()=>buildBiasChartModel({detail:{'15m':{candles:flat,source:'fixture'}},asOf}),/levels_missing/);
});
test('SVG escapes external metadata, separates future sketch, never labels confirmation as occurred',()=>{
  const model=buildBiasChartModel({detail,asOf});
  const svg=biasChartSvg({...model,source:'<script>alert("x")</script>'});
  assert.doesNotMatch(svg,/<script>/);
  assert.match(svg,/&lt;script&gt;/);
  for(const label of ['data-scenario="short"','data-scenario="long"','Yollar şematik','beklenen teyit','hedef / işlem planı değil'])
    assert.ok(svg.includes(label));
  assert.ok(!/NaN|Infinity/.test(svg));
});
test('clean brush paths are both solid, curve below the observed low, and never modify strategy levels',()=>{
  const m=buildBiasChartModel({detail,asOf}),before=structuredClone(m);
  const short=biasScenarioGeometry(m,true),long=biasScenarioGeometry(m,false);
  const svg=biasChartSvg(m);
  const paths=[...svg.matchAll(/<path data-scenario="(?:short|long)"[^>]+>/g)].map(p=>p[0]);
  assert.equal(paths.length,2);
  assert.ok(paths.every(p=>!p.includes('stroke-dasharray')));
  for(const g of [short,long]){
    assert.equal(g.illustrationOnly,true);
    assert.ok(g.knots.every(([x,y],i)=>Number.isFinite(x)&&Number.isFinite(y)&&(!i||x>g.knots[i-1][0])));
    assert.equal((g.path.match(/ C/g)||[]).length,g.knots.length-1);
  }
  assert.ok(short.knots.at(-1)[1]-short.cy>100);
  assert.ok(long.knots.at(-1)[1]<long.cy);
  const v=biasChartViewport(m),lowY=135+(v.top-v.lo)/(v.top-v.bottom)*620;
  assert.ok(short.knots.at(-1)[1]>lowY,'red extension must visibly continue below the observed low');
  assert.deepEqual(m,before,'pixel illustration must not manufacture new strategy targets or mutate evidence');
  assert.doesNotMatch(svg,/ANA SENARYO|KARŞI SENARYO|Görünen dip|Görünen tepe|ana swing teyidi|Anlık|GELECEK MUM/);
});
test('embedded local font and real OHLC render a valid 1600x1000 PNG without web assets',()=>{
  const image=renderBiasChart(buildBiasChartModel({detail,asOf}));
  assert.equal(image.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(image.readUInt32BE(16),1600);
  assert.equal(image.readUInt32BE(20),1000);
  assert.ok(image.length>10000 && image.length<5*1024*1024);
});
test('production-like no-system-font rendering actually paints title and right-axis digits, not just a valid blank PNG',()=>{
  const renderer=createBiasChartRenderer(buildBiasChartModel({detail,asOf}));
  const image=renderer.render(),pixels=image.pixels;
  const count=(x0,y0,x1,y1,min)=>{
    let n=0;
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
      const p=(y*image.width+x)*4;
      if(pixels[p]>min&&pixels[p+1]>min&&pixels[p+2]>min)n++;
    }
    return n;
  };
  // Renderer explicitly disables system fonts. These regions contain text only,
  // not candles/grid/price badges, so a font loading regression cannot pass.
  assert.ok(count(60,35,430,110,150)>500,'title text missing');
  assert.ok(count(1440,200,1550,740,140)>150,'right price-axis digits missing');
});
test('photo reply carries short caption and original topic without duplicate text',async()=>{
  const original=globalThis.fetch,calls=[];
  globalThis.fetch=async(url,opts)=>{
    calls.push({url:String(url),opts});
    return Response.json({ok:true});
  };
  try {
    await deliverQaReply({chatId:-1001,threadId:63,reply:'Kısa yorum.',photo:Buffer.from('mock-png')});
    assert.equal(calls.length,1);
    assert.match(calls[0].url,/\/sendPhoto$/);
    const f=calls[0].opts.body;
    assert.equal(f.get('chat_id'),'-1001');assert.equal(f.get('message_thread_id'),'63');
    assert.equal(f.get('caption'),'Kısa yorum.');
    assert.equal(f.get('photo').name,'alfa-bias.png');
  } finally {globalThis.fetch=original}
});
test('photo failure falls back to text, no automatic photo retry and no mutation',async()=>{
  const original=globalThis.fetch,calls=[];
  globalThis.fetch=async(url,opts)=>{
    calls.push({url:String(url),opts});
    return Response.json({ok:!String(url).endsWith('/sendPhoto')});
  };
  const input={chatId:11,threadId:5,reply:'Kısa yorum.',photo:Buffer.from('mock-png')};
  try {
    await deliverQaReply(input);
    assert.equal(calls.filter(c=>c.url.endsWith('/sendPhoto')).length,1);
    assert.equal(calls.filter(c=>c.url.endsWith('/sendMessage')).length,1);
    const payload=JSON.parse(calls[1].opts.body);
    assert.match(payload.text,/Kısa yorum/);
    assert.match(payload.text,/Grafik gönderilemedi/);
    assert.equal(payload.message_thread_id,5);
    assert.equal(input.reply,'Kısa yorum.');
  } finally {globalThis.fetch=original}
});
test('long detailed reply is separate text, never an over-limit photo caption',async()=>{
  const original=globalThis.fetch,calls=[];
  globalThis.fetch=async(url,opts)=>{calls.push({url:String(url),opts});return Response.json({ok:true})};
  try {
    await deliverQaReply({chatId:11,reply:'uzun '.repeat(600),photo:Buffer.from('mock-png')});
    assert.equal(calls[0].opts.body.get('caption'),null);
    assert.equal(calls.length,2);
    assert.match(calls[1].url,/sendMessage$/);
  } finally {globalThis.fetch=original}
});
test('Telegram normal /ask stays text-only; graph /ask and /grafik produce PNG with matching prompt snapshot',async()=>{
  const original=globalThis.fetch;
  const keys=['GROQ_API_KEY','SUPABASE_SERVICE_ROLE','COINALYZE_API_KEY','OPENMARKET_API_KEY','TG_QA_CHAT_ID','TG_QA_THREAD'];
  const saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  process.env.GROQ_API_KEY='unit';for(const k of keys.slice(1)) delete process.env[k];
  const prompts=[],calls=[];
  let verbose=false;
  globalThis.fetch=async(url,opts={})=>{
    const u=String(url);calls.push({url:u,method:opts.method||'GET'});
    if(u.includes('api.groq.com')) {
      prompts.push(JSON.parse(opts.body));
      return Response.json({choices:[{message:{content:verbose?'Piyasa yorumu çok uzun. '.repeat(80):'Ana yön aşağı, fakat tepkide bölgenin korunmasını izlerim. Üst bölge kazanılırsa toparlanma senaryosu güçlenir; alt bölge kaybedilirse satış baskısı sürebilir.'}}]});
    }
    if(u.includes('/rest/v1/edu_shared')) return Response.json([]);
    if(u.includes('/api/v3/ticker/24hr')) return Response.json({lastPrice:'100000'});
    if(u.includes('/api/v3/klines')){
      const tf=new URL(u).searchParams.get('interval'),d=TF_MS[tf],at=Math.floor(Date.now()/d)*d;
      return Response.json(Array.from({length:80},(_,i)=>{
        const p=100000+Math.sin(i)*100;
        return [at-(79-i)*d,String(p),String(p+200),String(p-200),String(p+10),'10'];
      }));
    }
    if(u.includes('gold-api.com')) return Response.json({price:2500});
    return new Response('{}',{status:503});
  };
  const update=text=>({message:{text,chat:{id:123,type:'private'},from:{id:7},message_thread_id:63}});
  try {
    const plain=await handleTelegramUpdate(update('/ask BTC hakkında fikrin nedir?'));
    assert.equal(plain.photo,undefined);
    const graph=await handleTelegramUpdate(update('/ask BTC grafikle yorumla'));
    assert.ok(Buffer.isBuffer(graph.photo));
    assert.equal(graph.threadId,63);
    assert.match(prompts.at(-1).messages[0].content,/GÖRSELLE AYNI VERİ/);
    const command=await handleTelegramUpdate(update('/grafik BTC'));
    assert.ok(Buffer.isBuffer(command.photo));
    assert.equal(command.photo.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    const unsupported=await handleTelegramUpdate(update('/grafik SOL'));
    assert.equal(unsupported.photo,undefined);
    assert.match(unsupported.reply,/Şimdilik BTC, ETH/);
    verbose=true;
    const fallback=await handleTelegramUpdate(update('/grafik BTC'));
    assert.ok(Buffer.isBuffer(fallback.photo));
    assert.match(fallback.reply,/kaybedilip tepki satılırsa/);
    assert.match(fallback.reply,/geri kazanılıp korunursa/);
    assert.doesNotMatch(fallback.reply,/eldeki 1 saatlik görünüm/);
    assert.equal(calls.filter(c=>c.method!=='GET'&&!c.url.includes('api.groq.com')).length,0);
  } finally {
    globalThis.fetch=original;
    for(const [k,v] of Object.entries(saved)) if(v===undefined)delete process.env[k];else process.env[k]=v;
  }
});
test('Telegram fresh-low request delivers PNG and repairs wrong dollar range; genuine missing OHLC gets a distinct error',async()=>{
  const original=globalThis.fetch;
  const keys=['GROQ_API_KEY','SUPABASE_SERVICE_ROLE','COINALYZE_API_KEY','OPENMARKET_API_KEY','TG_QA_CHAT_ID','TG_QA_THREAD'];
  const saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  process.env.GROQ_API_KEY='unit';for(const k of keys.slice(1))delete process.env[k];
  const prompts=[],calls=[];let missing=false;
  globalThis.fetch=async(url,opts={})=>{
    const u=String(url);calls.push({url:u,method:opts.method||'GET'});
    if(u.includes('api.groq.com')){
      prompts.push(JSON.parse(opts.body));
      return Response.json({choices:[{message:{content:'BTC fiyatı 60-61 $ aralığında sıkışabilir.'}}]});
    }
    if(u.includes('/rest/v1/edu_shared'))return Response.json([]);
    if(u.includes('/api/v3/ticker/24hr'))return Response.json({lastPrice:'60000'});
    if(u.includes('/api/v3/klines')&&!missing){
      const tf=new URL(u).searchParams.get('interval'),d=TF_MS[tf],at=Math.floor(Date.now()/d)*d;
      return Response.json(Array.from({length:80},(_,i)=>{
        const p=62000+Math.sin(i)*150;
        return [at-(79-i)*d,String(p),String(p+200),String(p-200),String(p+15),'10'];
      }));
    }
    if(u.includes('gold-api.com'))return Response.json({price:2500});
    return new Response('{}',{status:503});
  };
  const update={message:{text:'/grafik BTC',chat:{id:123,type:'private'},from:{id:7}}};
  try {
    const qa=await import('../lib/telegram-qa.mjs?fresh-low='+Math.random());
    const result=await qa.handleTelegramUpdate(update);
    assert.ok(Buffer.isBuffer(result.photo),'fresh low must not suppress graph');
    assert.equal(prompts.length,2,'wrong range gets one correction attempt');
    assert.match(prompts[0].messages[0].content,/DİP SINIRI/);
    assert.match(prompts[1].messages.at(-1).content,/dolar\/bin dolar ölçeği yanlış/);
    assert.doesNotMatch(result.reply,/60-61 \$|Grafik üretilemedi/);
    assert.match(result.reply,/eski dip olarak üstümüzde/);
    assert.match(result.reply,/teyitli yeni pivot yok/);
    missing=true;
    const noData=await import('../lib/telegram-qa.mjs?missing-ohlc='+Math.random());
    const unavailable=await noData.handleTelegramUpdate(update);
    assert.equal(unavailable.photo,undefined);
    assert.match(unavailable.reply,/Grafik için yeterli mum verisi alınamadı/);
    assert.doesNotMatch(unavailable.reply,/Mum verisi güncel değil/);
    assert.equal(calls.filter(c=>c.method!=='GET'&&!c.url.includes('api.groq.com')).length,0);
  } finally {
    globalThis.fetch=original;
    for(const [k,v] of Object.entries(saved))if(v===undefined)delete process.env[k];else process.env[k]=v;
  }
});
