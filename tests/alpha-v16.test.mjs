import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { closedBars, msbCheck, m2Levels, evaluateM2, replayPending, analyzeV16, formatV16Report, CANONICAL_V16, TF_MS } from '../lib/alpha-strategy-v16.mjs';
import { validatePlan } from '../lib/trade-plan.mjs';
import { formatStrategyContext } from '../lib/telegram-qa.mjs';
import { splitQaReply } from '../lib/telegram-qa-delivery.mjs';
import { getCandles, answerQuestion, TELEGRAM_ANALYSIS_STYLE, wantsTechnicalAudit, wantsDetailedAnalysis, needsBriefRewrite, briefMarketFallback } from '../lib/telegram-qa.mjs';

const D = 900000, T = Date.parse('2025-01-08T00:00:00Z');
const bar = (i,o,h,l,c) => ({ t:T+i*D, o,h,l,c });
const point = (b,price) => ({ t:b.t, price, knownAt:b.t+D });
function fixture(direction='long') {
  const bars = [
    bar(0,105,110,100,106), bar(1,108,120,106,112),
    bar(2,104,108,90,95), bar(3,100,130,99,128),
    bar(4,130,140,125,138), bar(5,138,139,132,134),
  ];
  if(direction==='short') for(const b of bars) {
    const {o,h,l,c}=b; Object.assign(b,{o:300-o,h:300-l,l:300-h,c:300-c});
  }
  const long = direction === 'long', p=(b,k)=>point(b,b[k]);
  const evidence = {
    reviewed:true,knownAt:T+6*D,direction,variant:'new_extreme_reversal',
    previousExtreme:p(bars[0],long?'l':'h'),swing:p(bars[1],long?'h':'l'),
    start:p(bars[2],long?'l':'h'),end:p(bars[4],long?'h':'l'),msbTime:bars[3].t,
    relation:{type:'zone',tf:'1h',event:'touch',eventTime:T,knownAt:T+D,
      low:long?90:200,high:long?100:210,rationale:'Manually reviewed historical zone touch; synthetic unit fixture.'},
    pullback:{reviewed:true,knownAt:T+6*D,rationale:'Explicit manual first pullback annotation, not a numeric threshold.'},
  };
  return {bars,asOf:T+6*D,evidence};
}
test('v16 precedence and no invented session/ATR/other model constraints',()=>{
  assert.match(CANONICAL_V16,/önceki strateji/);
  assert.match(CANONICAL_V16,/2.5R yalnız M2/);
  const txt=formatStrategyContext('btc',{}, {},{}, {},new Date(T));
  assert.doesNotMatch(txt,/08:00–12:00|UYGUN DEĞİL|0.382–0.5/);
  assert.match(txt,/mevcut değil/);
});
test('normal Telegram opinions get market analysis, not mandatory manual labeling',()=>{
  assert.equal(wantsTechnicalAudit('BTC hakkında fikrin nedir?'),false);
  assert.equal(wantsTechnicalAudit('BTC teknik denetim raporu'),true);
  assert.match(TELEGRAM_ANALYSIS_STYLE,/iki senaryoyu ENGELLEMEZ/);
  assert.match(TELEGRAM_ANALYSIS_STYLE,/manuel etiketleme isteme/);
});
test('brief delivery enforces length, excludes tables/internal models; detail is opt-in',()=>{
  assert.equal(wantsDetailedAnalysis('BTC hakkında fikrin nedir?'),false);
  assert.equal(wantsDetailedAnalysis('BTC detaylı analiz'),true);
  assert.equal(needsBriefRewrite('kelime '.repeat(91)),true);
  assert.equal(needsBriefRewrite('| TF | Fiyat |'),true);
  assert.equal(needsBriefRewrite('M2 NEEDS_REVIEW, manuel onay bekliyor'),true);
  assert.equal(needsBriefRewrite('Ana yön aşağı; hızlı geri kazanım sonrası güçsüzlük beklerim.'),false);
  const fallback=briefMarketFallback({symbol:'BTC',price:61000,trend:'aşağı'});
  assert.equal(needsBriefRewrite(fallback),false);
  assert.match(fallback,/1 saatlik/);
});
test('full v16 analysis delivery does not exceed Telegram message length',()=>{
  const text=('MSB ve swing kontrolü 🧭\n').repeat(400);
  const chunks=splitQaReply(text);
  assert.ok(chunks.length>1);
  assert.ok(chunks.every(c=>c.length<=3500));
  assert.equal(chunks.join(' ').replace(/\s+/g,' ').trim(),text.replace(/\s+/g,' ').trim());
});
test('only completed bars at cutoff; malformed/future/unconfirmed bars rejected',()=>{
  const b=bar(0,100,110,90,105);
  assert.equal(closedBars([b],'15m',T+D-1).length,0);
  assert.equal(closedBars([b],'15m',T+D).length,1);
  assert.equal(closedBars([{...b,confirmed:false}],'15m',T+D).length,0);
  assert.equal(closedBars([{...b,o:undefined}],'15m',T+D).length,0);
  assert.equal(closedBars([{...b,l:106}],'15m',T+D).length,0);
});
test('MSB strict close, 0.60 inclusive, wick-only and zero-range rejected in both directions',()=>{
  for(const direction of ['long','short']) {
    const b=direction==='long'?bar(0,100,110,100,106):bar(0,110,110,100,104);
    const swing={price:105};
    assert.equal(msbCheck(b,swing,direction).valid,true);
    assert.equal(msbCheck({...b,c:105},swing,direction).valid,false);
    assert.equal(msbCheck({...b,c:direction==='long'?105.9:104.1},swing,direction).valid,false);
    assert.equal(msbCheck({o:100,h:100,l:100,c:100},swing,direction).valid,false);
  }
});
test('M2 long and short 0.382 / 0.805 / 2.5R exact calculations',()=>{
  for(const [d,s,e] of [['long',100,200],['short',200,100]]) {
    const p=m2Levels(d,s,e);
    assert.equal(p.entry,d==='long'?161.8:138.2);
    assert.equal(p.stop,d==='long'?119.5:180.5);
    assert.ok(Math.abs(Math.abs(p.tp-p.entry)/p.risk-2.5)<1e-12);
  }
  assert.throws(()=>m2Levels('long',200,100));
});
test('reviewed evidence produces symmetric analysis plans, never orders',()=>{
  for(const d of ['long','short']) {
    const r=evaluateM2(fixture(d));
    assert.equal(r.status,'PENDING_LIMIT',JSON.stringify(r));
    assert.equal(r.executionAuthorized,false);assert.equal(r.levels.rr,2.5);
  }
});
test('reviewed plans flow through analysis and report, not just numeric helpers',()=>{
  for(const direction of ['long','short']) {
    const f=fixture(direction), detail={'15m':{candles:f.bars,source:'synthetic reviewed unit fixture'}};
    const r=analyzeV16(detail,f.asOf,{evidence:f.evidence});
    assert.equal(r.status,'PENDING_LIMIT');assert.equal(r.approvedPlans.length,1);
    const text=formatV16Report(r);
    for(const label of ['Ana swing','MSB','Fibonacci','Giriş','Stop','TP','Karar gerekçesi']) assert.ok(text.includes(label));
    assert.ok(text.includes(new Date(f.evidence.start.t).toISOString()));
  }
});
test('reviewed replay cannot see a future TP or retroactively use a future annotation',()=>{
  const f=fixture(),detail={'15m':{candles:f.bars}},p=evaluateM2(f),l=p.levels;
  const future=bar(8,l.entry+2,l.tp+1,l.entry+1,l.tp);
  const full={'15m':{candles:[...f.bars,future]}};
  assert.deepEqual(analyzeV16(full,f.asOf,{evidence:f.evidence}),analyzeV16(detail,f.asOf,{evidence:f.evidence}));
  assert.equal(analyzeV16(full,T+5*D,{evidence:f.evidence}).status,'NEEDS_REVIEW');
  assert.equal(analyzeV16(full,T+9*D,{evidence:f.evidence}).status,'MISSED_TP_BEFORE_ENTRY');
});
test('undefined relation, proximity, anchors, future annotations and pullback do not become signals',()=>{
  for(const change of [
    e=>{delete e.relation},e=>{e.relation.event='near'},
    e=>{e.variant='first_A_B'},e=>{delete e.pullback},
    e=>{e.knownAt+=D},e=>{e.swing.knownAt=T+4*D},
    e=>{e.end.price+=1},e=>{delete e.previousExtreme},
  ]) {
    const f=fixture();change(f.evidence);
    assert.equal(evaluateM2(f).status,'NEEDS_REVIEW');
  }
});
test('protected relation never accepts wick-only or unfinished HTF evidence',()=>{
  const f=fixture();
  const c={t:T-3600000,closeTime:T,o:100,h:140,l:95,c:119};
  f.evidence.relation={type:'protected',tf:'1h',direction:'long',knownAt:T,rationale:'test',
    confirmation:c,protected:{t:T-7200000,price:95},previous:{t:T-10800000,price:120},
    priorCorrection:{t:T-14400000,price:90}};
  f.htf={'1h':{candles:[{t:T-14400000,o:100,h:110,l:90,c:105},{t:T-10800000,o:110,h:120,l:100,c:115},
    {t:T-7200000,o:105,h:115,l:95,c:110},c]}};
  assert.equal(evaluateM2(f).status,'NEEDS_REVIEW');
  c.c=125;f.htf['1h'].candles.at(-1).c=125;
  assert.equal(evaluateM2(f).status,'PENDING_LIMIT');
  c.closeTime=T+3600000;
  assert.equal(evaluateM2(f).status,'NEEDS_REVIEW');
});
test('pending TP before fill is cancellation with zero profit, symmetric',()=>{
  for(const d of ['long','short']) {
    const p=evaluateM2(fixture(d)),l=p.levels;
    const b=d==='long'?bar(6,l.entry+2,l.tp+1,l.entry+1,l.tp):bar(6,l.entry-2,l.entry-1,l.tp-1,l.tp);
    const r=replayPending(p,[b],T+7*D);
    assert.equal(r.status,'MISSED_TP_BEFORE_ENTRY');assert.equal(r.action,'CANCEL_PENDING');
    assert.equal(r.realizedR,0);assert.equal(r.filledAt,null);
  }
});
test('same bar entry/TP or stop ambiguity never counts a win',()=>{
  const p=evaluateM2(fixture()),l=p.levels;
  const r=replayPending(p,[bar(6,l.entry+1,l.tp+1,l.entry-1,l.tp)],T+7*D);
  assert.equal(r.status,'INTRABAR_SEQUENCE_UNKNOWN');assert.equal(r.realizedR,null);
});
test('fill first then target is a simulated exit, not pending cancellation',()=>{
  const p=evaluateM2(fixture()),l=p.levels;
  const bs=[bar(6,l.entry+1,l.entry+2,l.entry-1,l.entry),bar(7,l.entry+2,l.tp+1,l.entry+1,l.tp)];
  const r=replayPending(p,bs,T+8*D);
  assert.equal(r.status,'CLOSED_TP');assert.equal(r.realizedR,2.5);
  assert.equal(r.simulated,true);
});
test('lock bar cannot retrofill; new extreme never automatically reanchors/cancels',()=>{
  const p=evaluateM2(fixture()),l=p.levels;
  const early=bar(5,l.entry+1,l.tp+1,l.entry-1,l.entry);
  assert.equal(replayPending(p,[early],T+7*D).status,'PENDING_LIMIT');
  const b=bar(6,l.entry+2,l.tp-1,l.entry+1,l.entry+3);
  const r=replayPending(p,[b],T+7*D);
  assert.equal(r.status,'PENDING_LIMIT');assert.equal(r.events[0].type,'NEW_EXTREME_REVIEW');
  assert.deepEqual(r.levels,p.levels);
});
test('v16 validator requires motor evidence; no legacy ATR or percent veto',()=>{
  const setup=evaluateM2(fixture()),l=setup.levels;
  const plan={hasPlan:true,strategy:'M2 BTC 15M 0.382',direction:'LONG',entry:l.entry,stop:l.stop,target:l.tp};
  const ref={canonicalVersion:'v16',symbol:'BTC',price:l.entry*2,atr:10000};
  assert.equal(validatePlan(plan,ref).ok,false);
  assert.equal(validatePlan(plan,{...ref,approvedPlans:[setup]}).ok,true);
  assert.equal(validatePlan({...plan,entry:l.entry+1},{...ref,approvedPlans:[setup]}).ok,false);
  assert.equal(validatePlan({...plan,hasPlan:false,stop:null,target:null},ref).ok,false);
  assert.equal(validatePlan({...plan,strategy:'M3 HTF POI',target:l.entry+10},ref).ok,true);
});
test('real BTC fixture: historical prefixes equal future-suffix evaluation',()=>{
  const data=JSON.parse(fs.readFileSync(new URL('./fixtures/alpha-v16/btc-2025-01.json',import.meta.url)));
  for(let i=80;i<data.detail['15m'].candles.length;i+=37) {
    const asOf=data.detail['15m'].candles[i].t+D;
    const prefix=Object.fromEntries(Object.entries(data.detail).map(([tf,d])=>[tf,{...d,candles:closedBars(d.candles,tf,asOf)}]));
    const result=analyzeV16(prefix,asOf);
    assert.deepEqual(result,analyzeV16(data.detail,asOf));
    assert.equal(result.status,'NEEDS_REVIEW');assert.deepEqual(result.approvedPlans,[]);
    for(const m of result.msbs) assert.ok(m.swing.knownAt<=m.t&&m.closeTime<=asOf);
  }
});
test('QA end-to-end mocked data preserves timestamps, drops open bars, refuses invented M2 plans',async()=>{
  const original=globalThis.fetch;
  const saved={GROQ_API_KEY:process.env.GROQ_API_KEY,SUPABASE_SERVICE_ROLE:process.env.SUPABASE_SERVICE_ROLE,
    COINALYZE_API_KEY:process.env.COINALYZE_API_KEY,OPENMARKET_API_KEY:process.env.OPENMARKET_API_KEY};
  process.env.GROQ_API_KEY='unit';delete process.env.SUPABASE_SERVICE_ROLE;
  delete process.env.COINALYZE_API_KEY;delete process.env.OPENMARKET_API_KEY;
  const calls=[],prompts=[];
  globalThis.fetch=async(url,options={})=>{
    const u=String(url);calls.push({url:u,method:options.method||'GET'});
    if(u.includes('api.groq.com')) {
      prompts.push(JSON.parse(options.body));
      if(prompts.length===2) return Response.json({choices:[{message:{content:'Piyasa yorumunda kapanışları izliyorum. '.repeat(80)}}]});
      if(prompts.length>1) return Response.json({choices:[{message:{content:'Görüşüm: fiyat range içinde. Yukarıda kapanış alıcı lehine; alt sınır kaybı satıcı lehine. 0.382 için anchor henüz net değil; kesin işlem planı vermiyorum.'}}]});
      return Response.json({choices:[{message:{content:'**Strateji:** M2 BTC 15M 0.382\n**Yön:** LONG\n**Giriş:** $100000\n**Stop:** $99000\n**Hedef:** $102500\n**Gerekçe:** test'}}]});
    }
    if(u.includes('/rest/v1/edu_shared')) return Response.json([]);
    if(u.includes('/api/v3/ticker/24hr')) return Response.json({lastPrice:'100000'});
    if(u.includes('/api/v3/klines')) {
      const tf=new URL(u).searchParams.get('interval'),d=TF_MS[tf],at=Math.floor(Date.now()/d)*d;
      return Response.json(Array.from({length:80},(_,i)=>[at-(79-i)*d,'100000','100500','99500','100100','10']));
    }
    if(u.includes('gold-api.com')) return Response.json({price:2500});
    return new Response('{}',{status:503});
  };
  try {
    const data=await getCandles('BTC','15m');
    assert.equal(data.candles.length,79);
    assert.ok(data.candles.every(b=>Number.isFinite(b.o)&&Number.isFinite(b.t)&&b.closeTime<=Date.now()));
    const reply=await answerQuestion('BTC hakkında fikrin nedir?',123);
    assert.equal(prompts.length,3,'invalid plan corrected once, verbose commentary shortened once');
    assert.match(prompts[0].messages[0].content,/KANONİK v16/);
    assert.doesNotMatch(reply,/\*\*Giriş:\*\* \$100000/);
    assert.doesNotMatch(reply,/Kanonik denetim/);
    assert.match(reply,/Görüşüm: fiyat range içinde/);
    assert.equal(needsBriefRewrite(reply),false);
    assert.match(prompts[0].messages[0].content,/TELEGRAM SOHBET AMACI/);
    assert.equal(calls.filter(c=>c.method!=='GET'&&!c.url.includes('api.groq.com')).length,0,'no DB/trade writes');
  } finally {
    globalThis.fetch=original;
    for(const [k,v] of Object.entries(saved)) if(v===undefined) delete process.env[k]; else process.env[k]=v;
  }
});
