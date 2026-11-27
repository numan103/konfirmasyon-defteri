import { LAB_FIELDS,emptyLab,mergeLab,validateLab,analyzeLab,observationFor,recordObservation,sampleWarning,sourceKey } from './alfa-lab-model.mjs?v=1';
import { savedLabSources } from './alfa-lab-store.mjs?v=1';
import { rrScenario,RR_TARGETS } from './alfa-lab-scenarios.mjs?v=1';
import { analyzeTrades,validateAnalytics } from './alfa-strategy-model.mjs?v=1';
import { fmt,el,option,svgNode,lineChart,barChart } from './alfa-strategy.mjs?v=2';
import { ExcursionAnalysis } from './alfa-excursions.mjs?v=3';
const pf=m=>m.profitFactorStatus==='no-losses'?'∞ (kayıp yok)':fmt(m.profitFactor);
const labels={strategyId:'Strategy',symbol:'Symbol',timeframe:'Timeframe',direction:'Direction',
  ...Object.fromEntries(LAB_FIELDS),replaySessionId:'Replay Session',knowledge:'Etiket zamanı'};
const tips={
  session:['Asia','London','New York'],htfBias:['aligned','countertrend','neutral'],displacement:['yes','no'],
  confidence:['low','medium','high'],rrTarget:['2','2.5','3']
};
function cohortChart(title,rows,metric){
  const box=el('section',null,'tester-chart');box.append(el('h4',title));
  if(!rows.length){box.append(el('p','Kayıtlı sonuç yok.'));return box;}
  const max=Math.max(...rows.map(r=>Math.abs(r.summary[metric]||0)))||1;
  const svg=svgNode('svg',{viewBox:`0 0 700 ${rows.length*30+10}`,role:'img','aria-label':title});
  svg.append(svgNode('line',{x1:390,x2:390,y1:0,y2:rows.length*30,stroke:'#52627e'}));
  rows.forEach((r,i)=>{
    const v=r.summary[metric]||0,w=Math.abs(v)/max*190,y=i*30;
    const text=svgNode('text',{x:4,y:y+18,fill:'#aab6ca','font-size':11});
    text.textContent=r.value.slice(0,30)+' · n='+r.summary.totalTrades;svg.append(text);
    svg.append(svgNode('rect',{x:v<0?390-w:390,y:y+3,width:w,height:18,fill:v<0?'#ef6677':'#26c89c'}));
    const value=svgNode('text',{x:590,y:y+18,fill:'#aab6ca','font-size':11});
    value.textContent=fmt(v)+(metric==='winRate'?'%':' R');svg.append(value);
  });
  box.append(svg);return box;
}
export class StrategyLab{
  constructor(paper){
    this.paper=paper;this.doc=emptyLab();this.epoch=0;
    this.root=el('section',null,'strategy-lab');this.root.id='strategy-lab';this.root.hidden=true;paper.root.append(this.root);
    this.excursions=new ExcursionAnalysis(this);
  }
  start(context,documents,clock){
    this.context=context;this.doc=mergeLab(documents);this.reliable=true;
    try{
      const saved=JSON.parse(localStorage.getItem(this.paper.key+':lab-watermark')||'null');
      if(saved!=null&&(!Number.isFinite(saved.clock)||saved.clock<0||saved.clock>8640000000000))throw new Error('Invalid Lab watermark');
      this.doc.maxObservedClock=Math.max(this.doc.maxObservedClock,saved?.clock||0);
    }catch{this.reliable=false;}
    this.observe(clock);this.state=null;this.report=null;
  }
  observe(clock){
    if(!this.context||this.paper.owner()!==this.paper.ownerId||!Number.isFinite(clock))return;
    if(clock>this.doc.maxObservedClock){
      this.doc.maxObservedClock=clock;
      try{localStorage.setItem(this.paper.key+':lab-watermark',JSON.stringify({clock}));}
      catch{this.reliable=false;}
    }
  }
  stop(){
    this.excursions.stop();
    this.epoch++;this.context=null;this.state=null;this.report=null;this.scenarios=null;this.doc=emptyLab();
    this.root.replaceChildren();this.root.hidden=true;
    document.querySelectorAll('#lab-tag-dialog').forEach(d=>d.close());
  }
  serialize(){return structuredClone(this.doc);}
  prepareStrategyEdit(trade,strategyId){
    const clock=this.paper.getReplay().clock,previous=observationFor(trade,this.doc,clock);
    if((previous?.strategyId||trade.strategyId||'custom')===strategyId)return null;
    return recordObservation(this.doc,trade,previous?.values||{},previous?.custom||{},{clock,
      observedThrough:this.doc.maxObservedClock,reliable:this.reliable,strategyId});
  }
  commit(next,analytics){
    if(!this.context||this.paper.owner()!==this.paper.ownerId)throw new Error('Lab session changed');
    next.revision=this.doc.revision+1;
    const validated=validateLab(next),a=analytics?validateAnalytics(analytics):null;
    this.doc=validated;if(a)this.paper.tester.doc=a;
    if(this.paper.persist())this.paper.message('Strategy Lab etiketleri/şablonları/filtreleri yerel replay kaydına yazıldı.');
    this.paper.update();
  }
  update(state){
    this.excursions.invalidate();
    this.epoch++;this.scenarios=null;this.state=state;this.observe(this.paper.getReplay()?.clock);
    if(!this.root.hidden)this.render();
  }
  activeSource(){
    return {context:this.context,clock:this.paper.getReplay().clock,trades:this.state.trades,
      ambiguityIds:this.state.history.filter(e=>e.type==='Ambiguous').map(e=>e.tradeId),
      lab:this.doc,analytics:this.paper.tester.serialize()};
  }
  render(){
    if(this.root.hidden||!this.state||!this.context)return;
    if(this.paper.owner()!==this.paper.ownerId){this.paper.stop();return;}
    try{this.renderReport();}catch(error){this.report=null;this.root.replaceChildren(el('p','Lab analizi üretilemedi: '+error.message));}
  }
  renderReport(){
    const active=this.activeSource(),collection=this.doc.filters.scope==='saved'?savedLabSources(localStorage,this.paper.ownerId,active):{sources:[active],warnings:[]};
    this.sources=collection.sources;
    const report=analyzeLab(this.sources,{filters:this.doc.filters,groupBy:this.doc.groupBy});this.report=report;
    const m=report.summary,names=new Map();
    for(const source of this.sources)for(const s of source.analytics.strategies||[])names.set(s.id,s.name);
    this.root.replaceChildren(el('h3','ALFA Strategy Lab · Manuel Strateji Araştırması'));
    this.root.append(el('p','Gerçekleşmiş Paper sonuçları · Net R · Cumulative R hesap bakiyesi değildir. İlişkiler nedensellik veya gelecek başarı kanıtı değildir.'));
    this.root.append(el('p',`n=${m.totalTrades} · ${report.sampleWarning}. <30 düşük, 30–99 sınırlı, 100+ daha güçlü örneklem: bunlar istatistiksel kesinlik eşikleri değildir. Çoklu filtre denemeleri seçim yanlılığı yaratabilir.`,'lab-warning'));
    this.root.append(el('p',`Sonradan değerlendirme: ${report.retrospective} · Etiketsiz: ${report.unlabelled}. “İşlem öncesi” görünümü yalnızca o zamana kaydedilmiş etiket sürümlerini kullanır. Kullanıcının bilgisinin doğruluğunu garanti etmez.`));
    if(!this.reliable)this.root.append(el('p','Gözlem zamanı kaydı doğrulanamadı; yeni etiketler geriye dönük olarak saklanır.','lab-warning'));
    const cards=el('div',null,'tester-metrics');
    for(const [label,value] of [['Total Trades',m.totalTrades],['Win Rate',fmt(m.winRate)+'%'],['Avg Win R',fmt(m.averageWinR)],
      ['Avg Loss R',fmt(m.averageLossR)],['Expectancy',fmt(m.expectancy)],['Profit Factor',pf(m)],
      ['Total Net R',fmt(m.totalNetR)],['Max Drawdown R',fmt(m.maximumDrawdown)],['Longest Losing Streak',m.longestLossStreak]]){
      const card=el('div');card.append(el('small',label),el('strong',String(value)));cards.append(card);
    }
    this.root.append(cards);
    const filters=el('div',null,'tester-filters');
    const selectFilter=(key,options,label=labels[key])=>{
      const wrap=el('label',label),select=el('select');select.dataset.labFilter=key;
      for(const [id,name] of options)select.append(option(id,name));
      select.value=this.doc.filters[key]||'';
      select.onchange=()=>{try{this.commit({...this.serialize(),filters:{...this.doc.filters,[key]:select.value}});}catch(e){this.paper.message(e.message);}};
      wrap.append(select);filters.append(wrap);
    };
    selectFilter('scope',[['active','Yalnızca aktif oturum'],['saved','Kullanıcının kaydedilmiş oturumları']],'Araştırma kapsamı');
    const all=analyzeLab(this.sources).rows;
    for(const key of ['strategyId','symbol','timeframe','replaySessionId','direction','session','htfBias','setupType','displacement','entryModel','rrTarget']){
      let values;
      if(key==='strategyId')values=[...names].map(([id,name])=>[id,name]);
      else values=[...new Set(all.map(t=>key==='replaySessionId'?t.sessionId:
        ['symbol','timeframe','direction'].includes(key)?t[key]:t.labValues[key]).filter(Boolean))].map(v=>[v,v]);
      const selected=this.doc.filters[key];if(selected&&!values.some(([v])=>v===selected))values.push([selected,selected]);
      selectFilter(key,[['','Tümü'],...values]);
    }
    selectFilter('knowledge',[['','Tüm etiketler (retrospektif dahil)'],['pre-entry','Yalnızca işlem öncesi kayıtlar'],['retrospective','Yalnızca sonradan değerlendirme']]);
    for(const key of ['from','to']){
      const wrap=el('label',key==='from'?'Çıkış başlangıcı UTC':'Çıkış bitişi UTC'),input=el('input');
      input.type='datetime-local';input.dataset.labFilter=key;
      if(this.doc.filters[key]!=null)input.value=new Date(this.doc.filters[key]*1000).toISOString().slice(0,16);
      input.onchange=()=>{try{this.commit({...this.serialize(),filters:{...this.doc.filters,[key]:input.value?Date.parse(input.value+'Z')/1000:null}});}catch(e){this.paper.message(e.message);}};
      wrap.append(input);filters.append(wrap);
    }
    const reset=el('button','Lab filtrelerini temizle');reset.dataset.labReset='1';reset.onclick=()=>this.commit({...this.serialize(),filters:{scope:this.doc.filters.scope||'active'}});filters.append(reset);
    this.root.append(filters);
    for(const warning of collection.warnings)this.root.append(el('p',warning,'lab-warning'));
    this.root.append(el('p',`Kaynak genelinde hariç: Open ${report.excluded.open} · Ambiguous ${report.excluded.ambiguous} · Diğer ${report.excluded.inactive} · Geçersiz ${report.excluded.invalid} · Duplicate ${report.excluded.duplicates} · Çakışma ${report.excluded.conflicts}`));
    if(this.doc.filters.scope==='saved'){
      this.root.append(el('p','Diğer oturumlar son kaydedildikleri replay saatinin snapshot’ıdır; yeniden açıp kaydetmek günceller. Eski kayıtlara sonuç uydurulmaz. Aktif oturumun güncel state’i her snapshot’ın yerini alır.'));
      this.root.append(this.paper.tester.table(['Replay Session','Symbol','TF','Kayıtlı replay saati UTC'],this.sources.map(s=>[
        s.context.sessionId,s.context.symbol,s.context.timeframe,new Date(s.clock*1000).toISOString()])));
    }
    const charts=el('div',null,'tester-charts');
    charts.append(lineChart('Cumulative Net R',m.curve.map(p=>p.cumulativeNetR)),lineChart('Drawdown (R)',m.curve.map(p=>p.drawdown)),
      barChart('R Distribution',report.histogram.map(b=>({label:fmt(b.from)+'–'+fmt(b.to),count:b.count}))),
      cohortChart('Strategy Comparison · Expectancy R',report.cohorts.strategyId.map(r=>({...r,value:names.get(r.value)||r.value})),'expectancy'),
      cohortChart('Expectancy by Session',report.cohorts.session,'expectancy'),cohortChart('Expectancy by HTF Bias',report.cohorts.htfBias,'expectancy'),
      cohortChart('Win Rate by Setup Type',report.cohorts.setupType,'winRate'));
    this.root.append(charts);
    const compare=el('label','Karşılaştırma koşulu '),group=el('select');group.dataset.labGroup='1';
    for(const key of ['strategyId','session','htfBias','displacement','direction','symbol','timeframe','setupType','entryModel','rrTarget'])
      group.append(option(key,labels[key]));
    group.value=this.doc.groupBy;group.onchange=()=>this.commit({...this.serialize(),groupBy:group.value});compare.append(group);this.root.append(compare);
    const comparison=this.paper.tester.table(['Koşul','n','Win Rate','Avg Win R','Avg Loss R','Expectancy','PF','Net R','Max DD','Loss Streak','Örneklem'],
      report.cohorts[this.doc.groupBy].map(r=>{const s=r.summary;return [names.get(r.value)||r.value,s.totalTrades,fmt(s.winRate)+'%',fmt(s.averageWinR),
        fmt(s.averageLossR),fmt(s.expectancy),pf(s),fmt(s.totalNetR),fmt(s.maximumDrawdown),s.longestLossStreak,r.sampleWarning];}));
    comparison.id='lab-comparison';this.root.append(comparison);
    this.excursions.render(names);
    this.root.append(el('h4','Paper Trade etiketleri · aktif replay'));
    const table=this.paper.tester.table(['Trade','Strategy / Setup','Session / HTF','Displacement','Yön / Symbol / TF','Net R','Etiket zamanı','Etiketle'],
      this.state.trades.map(t=>{
        const o=observationFor(t,this.doc,active.clock),button=el('button','Lab etiketleri');button.dataset.labTag=t.id;button.onclick=()=>this.tagDialog(t);
        return [t.id.slice(0,8),(names.get(o?.strategyId||t.strategyId)||t.strategyId||'Custom')+' / '+(o?.values.setupType||'—'),`${o?.values.session||'—'} / ${o?.values.htfBias||'—'}`,
          o?.values.displacement||'—',`${t.direction} / ${t.symbol} / ${t.timeframe}`,fmt(t.netR),o?.provenance||'Etiketsiz',button];
      }));
    table.id='lab-trades';this.root.append(table);
    this.templateForm();
    this.root.append(el('h4','Alternatif RR senaryoları · gerçekleşmiş sonuçlardan AYRI'));
    this.root.append(el('p','2R / 2.5R / 3R: yalnızca aktif oturumun filtrelenmiş kapanmış işlemleri ve mevcut replay saatine kadar gerçek OHLC. Orijinal SL düzenlemeleri ve manuel kapanış korunur, TP hedefi değiştirilir, çakışma SL-first. Yeterli yol yoksa sonuç yok. Arşiv OHLC içermez; diğer oturumu açın. En fazla 200 işlem/istek; daha büyük kümeleri filtreleyin.'));
    const run=el('button','Gerçek OHLC ile RR senaryolarını hesapla');run.dataset.labScenarios='1';run.onclick=()=>this.runScenarios();
    const cancel=el('button','Senaryo hesabını iptal et');cancel.onclick=()=>{this.epoch++;this.scenarios=null;this.root.querySelector('#lab-scenarios').replaceChildren(el('p','İptal edildi; sonuç gösterilmiyor.'));};
    this.root.append(run,cancel);
    const results=el('div');results.id='lab-scenarios';this.root.append(results);
  }
  templateForm(){
    const form=el('form',null,'lab-template-form');form.id='lab-template-form';form.append(el('h4','Yeni strateji şablonu'));
    const name=el('input');name.name='templateName';name.maxLength=60;name.placeholder='Şablon / strateji adı';name.required=true;
    const fields=el('textarea');fields.name='templateFields';fields.maxLength=1800;fields.placeholder='Kullanıcı tanımlı alan adları (her satıra bir alan, en fazla 30)';
    const button=el('button','Şablon oluştur');button.type='submit';form.append(name,fields,button);
    form.onsubmit=e=>{
      e.preventDefault();
      try{
        const title=name.value.trim(),a=this.paper.tester.serialize();
        if(!title||a.strategies.some(s=>s.name.toLowerCase()===title.toLowerCase()))throw new Error('Yeni, benzersiz bir strateji adı girin');
        const id='strategy-'+crypto.randomUUID(),customFields=fields.value.split('\n').map(s=>s.trim()).filter(Boolean)
          .map(label=>({key:'field-'+crypto.randomUUID(),label}));
        const next=this.serialize();next.templates.push({id,name:title,fields:customFields});
        a.strategies.push({id,name:title});a.revision++;
        this.commit(next,a);
      }catch(error){this.paper.message(error.message);}
    };
    this.root.append(form);
  }
  tagDialog(trade){
    if(!this.context||this.paper.owner()!==this.paper.ownerId)return;
    this.paper.pause();this.observe(this.paper.getReplay()?.clock);
    const context=this.context,baseline=this.doc,clock=this.paper.getReplay().clock;
    const original=observationFor(trade,this.doc,clock),dialog=el('dialog');dialog.id='lab-tag-dialog';dialog.className='paper-dialog';
    const form=el('form'),strategy=el('select');strategy.name='strategyId';this.paper.tester.populate(strategy,original?.strategyId||trade.strategyId||'custom');
    dialog.append(el('h3','ALFA Strategy Lab · Trade etiketleri'));
    dialog.append(el('p','Zaman niteliği otomatik kaydedilir. Kapanmış/eski işlemleri etiketlemek ve ileri zamanı gördükten sonra geri sarmak “sonradan değerlendirme”dir. Önceki sürümler silinmez.'));
    const wrap=el('label','Strategy');wrap.append(strategy);form.append(wrap);
    for(const [key,label] of LAB_FIELDS){
      const wrap=el('label',label),input=el(key==='notes'?'textarea':'input');input.name=key;input.maxLength=key==='notes'?2000:300;
      input.value=original?.values[key]||'';
      if(tips[key]){
        const list=el('datalist');list.id='lab-options-'+key;
        for(const value of tips[key])list.append(option(value,value));
        input.setAttribute('list',list.id);form.append(list);
      }
      wrap.append(input);form.append(wrap);
    }
    const custom=el('fieldset');form.append(custom);
    const showFields=()=>{
      custom.replaceChildren(el('legend','Stratejiye özel alanlar'));
      for(const f of this.doc.templates.find(t=>t.id===strategy.value)?.fields||[]){
        if(LAB_FIELDS.some(([k])=>k===f.key))continue;
        const wrap=el('label',f.label),input=el('input');input.dataset.labCustom=f.key;input.maxLength=300;input.value=original?.custom[f.key]||'';
        wrap.append(input);custom.append(wrap);
      }
    };
    strategy.onchange=showFields;showFields();
    if(Object.hasOwn(this.doc.annotations,trade.id)){
      const history=el('details');history.append(el('summary','Etiket sürüm geçmişi'));
      for(const a of this.doc.annotations[trade.id])history.append(el('p',`v${a.revision} · ${a.provenance} · Replay ${new Date(a.recordedReplayTime*1000).toISOString()} · Gözlenen son saat ${new Date(a.observedThrough*1000).toISOString()} · ${JSON.stringify({strategyId:a.strategyId,...a.values,custom:a.custom})}`));
      form.append(history);
    }
    const error=el('p',null,'paper-error'),save=el('button','Etiketleri kaydet'),cancel=el('button','İptal');save.type='submit';cancel.type='button';cancel.onclick=()=>dialog.close();
    form.append(error,save,cancel);dialog.append(form);document.body.append(dialog);dialog.showModal();
    dialog.addEventListener('close',()=>dialog.remove(),{once:true});
    form.onsubmit=e=>{
      e.preventDefault();
      try{
        if(this.context!==context||this.doc!==baseline||this.paper.owner()!==this.paper.ownerId)throw new Error('Lab kaydı değişti; editörü yeniden açın');
        const values=Object.fromEntries(LAB_FIELDS.map(([key])=>[key,form.elements[key].value.trim()]));
        const custom=Object.fromEntries([...form.querySelectorAll('[data-lab-custom]')].map(input=>[input.dataset.labCustom,input.value.trim()]));
        const current=this.state.trades.find(t=>t.id===trade.id);if(!current)throw new Error('Trade current replay scope dışında');
        const next=recordObservation(this.doc,current,values,custom,{clock:this.paper.getReplay().clock,
          observedThrough:this.doc.maxObservedClock,reliable:this.reliable,strategyId:strategy.value});
        // Share the strategy tag with Tester without replacing notes, screenshots or financial records.
        const a=this.paper.tester.serialize(),old=a.annotations[trade.id];
        a.annotations[trade.id]={setup:'',rationale:'',mistakes:'',notes:trade.notes||'',screenshot:null,...old,
          strategyId:strategy.value,revision:(old?.revision||0)+1,updatedAt:Date.now(),recordedReplayTime:this.paper.getReplay().clock};
        a.revision++;this.commit(next,a);dialog.close();
      }catch(e){error.textContent=e.message;}
    };
  }
  async runScenarios(){
    const epoch=++this.epoch,output=this.root.querySelector('#lab-scenarios'),active=this.activeSource();
    const rows=this.report.rows.filter(t=>t.labSourceKey===sourceKey(this.context));
    this.scenarios=null;
    if(rows.length>200){output.replaceChildren(el('p','200 işlem sınırı: filtreleri daraltın. Hiçbir kısmi sonuç gösterilmedi.'));return;}
    const replay=this.paper.getReplay(),input={context:structuredClone(this.context),events:structuredClone(this.paper.engine.events),bars:replay.bars,clock:replay.clock};
    output.replaceChildren(el('p',`Hesaplanıyor: ${rows.length} işlem × 3 hedef…`));
    const results=[];
    for(const trade of rows){
      await new Promise(requestAnimationFrame);
      if(epoch!==this.epoch||!this.context||this.paper.owner()!==this.paper.ownerId)return;
      for(const target of RR_TARGETS)results.push(rrScenario({...input,trade,target}));
    }
    if(epoch!==this.epoch)return;
    this.scenarios={clock:active.clock,results};
    output.replaceChildren(el('p',`HİPOTETİK / AYRI · OHLC ufku ${new Date(active.clock*1000).toISOString()}. Paydalar farklı olabilir; yalnızca kapanabilen alt kümeyi doğrudan kazanan hedef diye yorumlamayın.`,'lab-warning'));
    output.append(this.paper.tester.table(['Hedef','Tamamlanan / Seçili','Eksik / Açık / Desteklenmeyen','Win Rate','PF','Net R','Expectancy','Max DD','Örneklem'],
      RR_TARGETS.map(target=>{
        const group=results.filter(r=>r.target===target),m=analyzeTrades(group.filter(r=>r.status==='complete').map(r=>r.result)).summary;
        return [target+'R',`${m.totalTrades} / ${rows.length}`,group.length-m.totalTrades,fmt(m.winRate)+'%',pf(m),fmt(m.totalNetR),fmt(m.expectancy),fmt(m.maximumDrawdown),sampleWarning(m.totalTrades)];
      })));
    output.append(this.paper.tester.table(['Trade','Hedef','Durum','Net R','Açıklama'],results.map(r=>[r.tradeId.slice(0,8),r.target+'R',r.status,r.result?fmt(r.result.netR):'Sonuç yok',r.reason])));
  }
}
