import { measureExcursion,excursionReport } from './alfa-excursion-model.mjs?v=1';
import { sourceKey } from './alfa-lab-model.mjs?v=1';
import { candleCloseTime } from './alfa-replay-model.mjs?v=3';
import { fetchHistory } from './alfa-charts-data.mjs?v=11';
import { el,option,svgNode,fmt,barChart } from './alfa-strategy.mjs?v=2';
const LOWER={'5m':'1m','15m':'1m','30m':'5m','1h':'5m','4h':'15m','1d':'1h','1w':'4h'};
const interval=(r,suffix='')=>r?.lower!=null?(r.lower===r.upper?fmt(r.lower):`${fmt(r.lower)}–${fmt(r.upper)}`)+suffix:'Sonuç yok';
function distribution(title,rows,key){
  const values=rows.filter(t=>t.excursion[key]?.exact).map(t=>t.excursion[key].r.lower);
  const max=values.reduce((m,v)=>Math.max(m,v),0),width=Math.max(.1,max/12),bins=[];
  if(values.length){
    for(let i=0;i<Math.min(13,Math.floor(max/width)+1);i++)bins.push({label:fmt(i*width),count:0});
    for(const v of values)bins[Math.min(bins.length-1,Math.floor(v/width))].count++;
  }
  const chart=barChart(`${title} (R) · yalnız kesin değerler, n=${values.length}`,bins);
  chart.append(el('p','Belirsiz sınırlar histogramda kesin değer veya orta nokta olarak sayılmaz. X: R alt sınırı, Y: işlem sayısı.'));
  return chart;
}
function scatter(title,rows,realized=false){
  const box=el('section',null,'tester-chart');box.append(el('h4',title));
  const valid=rows.filter(t=>t.excursion.mae&&t.excursion.mfe);
  if(!valid.length){box.append(el('p','Yeterli aktif OHLC yok.'));return box;}
  const xs=t=>realized?t.excursion.mfe.r:t.excursion.mae.r;
  const ys=t=>realized?{lower:t.realizedR,upper:t.realizedR}:t.excursion.mfe.r;
  const maxX=Math.max(.1,...valid.map(t=>xs(t).upper)),loY=Math.min(0,...valid.map(t=>ys(t).lower)),hiY=Math.max(.1,...valid.map(t=>ys(t).upper));
  const x=v=>50+v/maxX*420,y=v=>175-(v-loY)/(hiY-loY)*145;
  const svg=svgNode('svg',{viewBox:'0 0 500 215',role:'img','aria-label':title});
  svg.append(svgNode('line',{x1:50,x2:475,y1:175,y2:175,stroke:'#52627e'}));
  for(const t of valid){
    const a=xs(t),b=ys(t),exact=a.lower===a.upper&&b.lower===b.upper;
    const node=exact?svgNode('circle',{cx:x(a.lower),cy:y(b.lower),r:3,fill:'#26c89c'}):
      svgNode('rect',{x:x(a.lower),y:y(b.upper),width:Math.max(1,x(a.upper)-x(a.lower)),height:Math.max(1,y(b.lower)-y(b.upper)),fill:'#e9ad5022',stroke:'#e9ad50'});
    const tip=svgNode('title',{});tip.textContent=`${t.id.slice(0,8)} · X ${interval(a)} R · Y ${interval(b)} R · ${exact?'Kesin':'Belirsizlik aralığı'}`;node.append(tip);svg.append(node);
  }
  for(const [text,px,py] of [[`0 → ${fmt(maxX)} R`,50,195],[`${fmt(hiY)} R`,1,25],[`${fmt(loY)} R`,1,175]]){
    const label=svgNode('text',{x:px,y:py,fill:'#aab6ca','font-size':10});label.textContent=text;svg.append(label);
  }
  box.append(svg,el('p',`${valid.length} işlem · X: ${realized?'MFE':'MAE'} R · Y: ${realized?'Gross Realized':'MFE'} R. Yeşil nokta: kesin; turuncu kutu/çizgi: olası sınırlar, tahmin/orta nokta değil.`));
  return box;
}
function cohortChart(title,groups,key,names){
  const box=el('section',null,'tester-chart');box.append(el('h4',title));
  const valid=groups.filter(g=>g.measured),max=Math.max(.1,...valid.map(g=>g[key].upper));
  if(!valid.length){box.append(el('p','Ölçülebilir işlem yok.'));return box;}
  const svg=svgNode('svg',{viewBox:`0 0 700 ${valid.length*32+10}`,role:'img','aria-label':title});
  valid.forEach((g,i)=>{
    const label=svgNode('text',{x:4,y:i*32+20,fill:'#aab6ca','font-size':11});
    label.textContent=(names.get(g.value)||g.value).slice(0,27)+` · n=${g.measured}`;svg.append(label);
    const lo=260+g[key].lower/max*240,hi=260+g[key].upper/max*240;
    svg.append(svgNode('line',{x1:lo,x2:hi,y1:i*32+16,y2:i*32+16,stroke:key==='maeR'?'#e9ad50':'#26c89c','stroke-width':4}));
    svg.append(svgNode('circle',{cx:lo,cy:i*32+16,r:3,fill:'#aab6ca'}));
    const value=svgNode('text',{x:515,y:i*32+20,fill:'#aab6ca','font-size':10});value.textContent=interval(g[key],' R');svg.append(value);
  });
  box.append(svg,el('p','Ortalama alt–üst sınırlar; kesin olmayan değerler tek nokta tahmini değildir.'));return box;
}
export class ExcursionAnalysis{
  constructor(lab){this.lab=lab;this.generation=0;this.cache=new Map();this.report=null;}
  invalidate(){this.generation++;this.controller?.abort();this.report=null;}
  stop(){this.invalidate();this.cache.clear();}
  render(names){
    this.invalidate();
    const box=el('section');box.id='lab-excursion-analysis';
    box.append(el('h3','MAE & MFE Analysis'));
    box.append(el('p','Yalnızca pozisyon aktifken gözlenen OHLC. Giriş/çıkış sırası bilinmeyen mumlarda kesin değer yerine alt–üst sınır verilir. Sınırlar Paper ilk-çıkış / SL-first politikasına koşulludur; tüm sınır mumunun ekstremi işlem içi ölçüm değildir. Maliyetler fiyat yolundan çıkarılmaz; R, değişmeyen ilk riskle normalize edilir.'));
    const button=el('button',this.lab.doc.filters.excursions==='on'?'MAE/MFE analizini kapat':'MAE/MFE analizini aç');
    button.dataset.excursionsToggle='1';button.onclick=()=>this.lab.commit({...this.lab.serialize(),
      filters:{...this.lab.doc.filters,excursions:this.lab.doc.filters.excursions==='on'?'off':'on'}});
    box.append(button);
    const label=el('label',' Sınır mumu hassasiyeti '),select=el('select');select.dataset.excursionsPrecision='1';
    select.append(option('primary','Mevcut timeframe OHLC'),option('lower','Uygunsa alt timeframe ile daralt (ücretsiz Binance)'));
    select.value=this.lab.doc.filters.excursionPrecision||'primary';
    select.onchange=()=>this.lab.commit({...this.lab.serialize(),filters:{...this.lab.doc.filters,excursionPrecision:select.value}});
    label.append(select);box.append(label);
    const output=el('div');output.id='lab-excursion-results';box.append(output);this.lab.root.append(box);
    if(this.lab.doc.filters.excursions==='on')this.run(output,names).catch(error=>{
      if(output.isConnected&&this.lab.context)output.replaceChildren(el('p','MAE/MFE hesaplanamadı: '+error.message));
    });
  }
  async run(output,names){
    const token=this.generation,lab=this.lab,paper=lab.paper,context=structuredClone(lab.context),replay=paper.getReplay();
    const selected=lab.report.rows,input={context,events:structuredClone(paper.engine.events),bars:replay.bars,clock:replay.clock};
    const active=selected.filter(t=>t.labSourceKey===sourceKey(context));
    this.controller=new AbortController();
    const current=()=>token===this.generation&&lab.context&&paper.owner()===paper.ownerId;
    output.replaceChildren(el('p','Aktif fiyat yolu hesaplanıyor…'));
    if(active.length>200){output.replaceChildren(el('p','MAE/MFE: en fazla 200 aktif işlem/istek. Filtreleri daraltın; kısmi örneklem gösterilmedi.'));return;}
    const measurements=[];
    for(const trade of active){
      await new Promise(requestAnimationFrame);if(!current())return;
      measurements.push(measureExcursion({...input,trade}));
    }
    const warnings=[];
    if(lab.doc.filters.excursionPrecision==='lower'){
      const timeframe=LOWER[context.timeframe],step=candleCloseTime(0,context.timeframe),windows=new Set();
      for(const m of measurements.filter(m=>m.status==='bounded')){
        if(m.entryBoundary==='candle')windows.add(m.entryCandleTime);
        if(m.exitBoundary==='candle')windows.add(m.exitCandleTime);
      }
      if(!timeframe)warnings.push('Bu timeframe için desteklenen daha düşük OHLC yok; mevcut sınırlar korundu.');
      else if(windows.size>40)warnings.push('40 sınır mumu istek sınırı: filtreleri daraltın. Alt-timeframe uygulanmadı.');
      else{
        const subStep=candleCloseTime(0,timeframe),merged=new Map();
        for(const start of windows){
          if(!current())return;
          const end=Math.min(start+step,input.clock),key=context.symbol+':'+timeframe+':'+start;
          try{
            let bars=this.cache.get(key);
            if(!bars){
              bars=(await fetchHistory(context.symbol,timeframe,this.controller.signal,fetch,end*1000-1,start*1000))
                .filter(b=>b.time>=start&&b.time+subStep<=end);
              if(this.cache.size>=64)this.cache.delete(this.cache.keys().next().value);
              if(bars.length===step/subStep)this.cache.set(key,bars);
            }
            for(const b of bars)merged.set(b.time,b);
          }catch(error){if(!current())return;warnings.push('Alt-timeframe alınamadı; mevcut güvenli sınırlar korundu: '+error.message);}
        }
        const lowerData={symbol:context.symbol,timeframe,bars:[...merged.values()].sort((a,b)=>a.time-b.time)};
        for(let i=0;i<active.length;i++){
          await new Promise(requestAnimationFrame);if(!current())return;
          if(measurements[i].status==='bounded')measurements[i]=measureExcursion({...input,trade:active[i],lowerData});
        }
      }
    }
    if(!current())return;
    const report=excursionReport(selected,measurements);this.report=report;
    this.draw(output,report,names,[...new Set(warnings)]);
  }
  draw(output,report,names,warnings){
    const s=report.summary;
    output.replaceChildren(el('p',`Seçili ${s.total} · Ölçülen ${s.measured} · İki metrik de kesin ${s.exact} · Aralıklı ${s.bounded} · Veri yok/belirsiz ${s.unavailable}`));
    output.append(el('p','Arşiv snapshot’ları OHLC içermez; diğer oturum için replay’i açın. Açık/çözümlenmemiş işlemler dahil değildir. Alt timeframe de tick sırasını garanti etmez. Örneklem küçüklüğü ve belirsiz değerler nedeniyle sonuçlar stop/TP önerisi değildir.','lab-warning'));
    for(const warning of warnings)output.append(el('p',warning,'lab-warning'));
    const charts=el('div',null,'tester-charts');
    charts.append(distribution('MAE Distribution',report.rows,'mae'),distribution('MFE Distribution',report.rows,'mfe'),
      scatter('MAE vs MFE · R',report.rows),scatter('MFE vs Realized R · Gross',report.rows,true),
      cohortChart('MAE by Strategy',report.groups.strategyId,'maeR',names),cohortChart('MFE by Strategy',report.groups.strategyId,'mfeR',names),
      cohortChart('MAE by Winning / Losing Trades · Net R sınıfı',report.groups.outcome,'maeR',names),
      cohortChart('MFE by Session',report.groups.session,'mfeR',names),cohortChart('MAE by HTF Bias',report.groups.htfBias,'maeR',names));
    output.append(charts);
    const table=this.lab.paper.tester.table(['Strategy','Ölçülen / Seçili','Kesin / Aralıklı','Avg MAE R alt–üst','Avg MFE R alt–üst'],
      report.groups.strategyId.map(g=>[names.get(g.value)||g.value,`${g.measured} / ${g.total}`,`${g.exact} / ${g.bounded}`,interval(g.maeR),interval(g.mfeR)]));
    table.id='excursion-strategy-comparison';output.append(table);
    output.append(el('h4','Stop Distance & Missed Profit Analysis'));
    output.append(el('p','Stop kullanımı = MAE / ilk stop mesafesi. Missed Profit = max(0, MFE R − max(Gross Realized R, 0)); yalnız geriye dönük fiyat aralığıdır, yakalanabilir kâr veya optimal stop iddiası değildir.'));
    const trades=this.lab.paper.tester.table(['Trade / Strategy','Initial Risk (tutar)','İlk 1R fiyat / %','MAE fiyat / %','MAE R','MFE fiyat / %','MFE R',
      'Realized R (Gross)','Exit Reason','Stop kullanımı %','Missed Profit R','Doğruluk / Kaynak'],
      report.rows.map(t=>{
        const m=t.excursion;return [t.id.slice(0,8)+' / '+(names.get(t.strategyId)||t.strategyId),fmt(t.initialRisk),
          m.mae?fmt(m.stopDistance.price)+' / '+fmt(m.stopDistance.percent)+'%':'Sonuç yok',
          m.mae?interval(m.mae.price)+' / '+interval(m.mae.percent,'%'):'Sonuç yok',interval(m.mae?.r),
          m.mfe?interval(m.mfe.price)+' / '+interval(m.mfe.percent,'%'):'Sonuç yok',interval(m.mfe?.r),
          fmt(t.realizedR),t.status,interval(m.stopDistance?.utilizationPercent),interval(m.missedProfitR),
          `${m.status}${m.refinement?.used?' · '+m.refinement.timeframe+' ('+m.refinement.used+' sınır)':''} · ${m.reason}${m.refinement?.warnings.length?' · '+m.refinement.warnings.join('; '):''}`];
      }));
    trades.id='excursion-trades';output.append(trades);
  }
}
