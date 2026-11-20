import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { wantsBiasChart, buildBiasChartModel, biasChartSvg, biasChartContext } from '../lib/telegram-bias-chart.mjs';
import { renderBiasChart } from '../lib/telegram-bias-image.mjs';
import { deliverQaReply } from '../lib/telegram-qa-delivery.mjs';
import { handleTelegramUpdate } from '../lib/telegram-qa.mjs';
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
  for(const label of ['SATIŞ','ALIŞ','teyit henüz yok','GELECEK MUM VERİSİ DEĞİL','OLASI YOLLAR'])
    assert.ok(svg.includes(label));
  assert.ok(!/NaN|Infinity/.test(svg));
});
test('embedded local font and real OHLC render a valid 1600x1000 PNG without web assets',()=>{
  const image=renderBiasChart(buildBiasChartModel({detail,asOf}));
  assert.equal(image.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(image.readUInt32BE(16),1600);
  assert.equal(image.readUInt32BE(20),1000);
  assert.ok(image.length>10000 && image.length<5*1024*1024);
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
  globalThis.fetch=async(url,opts={})=>{
    const u=String(url);calls.push({url:u,method:opts.method||'GET'});
    if(u.includes('api.groq.com')) {
      prompts.push(JSON.parse(opts.body));
      return Response.json({choices:[{message:{content:'Ana yön aşağı, fakat tepkide bölgenin korunmasını izlerim. Üst bölge kazanılırsa toparlanma senaryosu güçlenir; alt bölge kaybedilirse satış baskısı sürebilir.'}}]});
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
    assert.equal(calls.filter(c=>c.method!=='GET'&&!c.url.includes('api.groq.com')).length,0);
  } finally {
    globalThis.fetch=original;
    for(const [k,v] of Object.entries(saved)) if(v===undefined)delete process.env[k];else process.env[k]=v;
  }
});
