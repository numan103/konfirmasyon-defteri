import { analyzeTrades, emptyAnalytics, mergeAnalytics, validateAnalytics } from './alfa-strategy-model.mjs?v=1';
import { sanitizeScreenshot } from './alfa-strategy-images.mjs?v=1';
export { fmt,el,option,svgNode,lineChart,barChart };
const fmt=n=>Number.isFinite(n)?n.toFixed(3):'N/A';
const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;return e;};
const option=(value,name)=>{const o=el('option',name);o.value=value;return o;};
const NS='http://www.w3.org/2000/svg';
function svgNode(tag,attrs){const e=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v));return e;}
function lineChart(title,values){
  const box=el('section',null,'tester-chart');box.append(el('h4',title));
  if(!values.length){box.append(el('p','Gerçekleşmiş işlem yok.'));return box;}
  const series=[0,...values],lo=Math.min(0,...series),hi=Math.max(0,...series),range=hi-lo||1;
  const svg=svgNode('svg',{viewBox:'0 0 500 170',role:'img','aria-label':title});
  svg.append(svgNode('line',{x1:50,x2:485,y1:145,y2:145,stroke:'#52627e'}));
  const path=series.map((v,i)=>(i?'L':'M')+(50+i*435/(series.length-1))+','+(145-(v-lo)*120/range)).join(' ');
  svg.append(svgNode('path',{d:path,fill:'none',stroke:title.includes('Drawdown')?'#ef6677':'#26c89c','stroke-width':2}));
  for(const [v,y] of [[hi,25],[lo,145]]){
    const t=svgNode('text',{x:2,y,fill:'#aab6ca','font-size':11});t.textContent=fmt(v)+'R';svg.append(t);
  }
  const caption=svgNode('text',{x:50,y:165,fill:'#aab6ca','font-size':10});caption.textContent='Kapanış sırası → (aynı zamandaki işlemler Trade ID ile sıralanır)';svg.append(caption);
  box.append(svg);return box;
}
function barChart(title,bins){
  const box=el('section',null,'tester-chart');box.append(el('h4',title));
  if(!bins.length){box.append(el('p','Gerçekleşmiş işlem yok.'));return box;}
  const svg=svgNode('svg',{viewBox:'0 0 500 170',role:'img','aria-label':title}),max=Math.max(1,...bins.map(b=>b.count));
  bins.forEach((b,i)=>{
    const w=440/bins.length,h=b.count/max*110,x=40+i*w;
    const rect=svgNode('rect',{x,y:125-h,width:Math.max(1,w-3),height:h,fill:'#7b8df5'});
    const tip=svgNode('title',{});tip.textContent=b.label+': '+b.count;rect.append(tip);svg.append(rect);
    if(bins.length<10 || i%Math.ceil(bins.length/8)===0){
      const text=svgNode('text',{x,y:145,fill:'#aab6ca','font-size':9});text.textContent=b.label;svg.append(text);
    }
  });
  box.append(svg);return box;
}
function comparisonChart(rows,names){
  const box=el('section',null,'tester-chart');box.append(el('h4','Strategy Comparison · Total Net R'));
  if(!rows.length){box.append(el('p','Gerçekleşmiş işlem yok.'));return box;}
  const max=Math.max(...rows.map(r=>Math.abs(r.totalNetR)))||1;
  const svg=svgNode('svg',{viewBox:`0 0 700 ${rows.length*32+15}`,role:'img','aria-label':'Strateji bazında toplam Net R'});
  svg.append(svgNode('line',{x1:430,x2:430,y1:0,y2:rows.length*32,stroke:'#52627e'}));
  rows.forEach((r,i)=>{
    const width=Math.abs(r.totalNetR)/max*190,y=i*32;
    const label=svgNode('text',{x:5,y:y+18,fill:'#aab6ca','font-size':11});
    label.textContent=(names.get(r.strategyId)||r.strategyId).slice(0,30);svg.append(label);
    svg.append(svgNode('rect',{x:r.totalNetR<0?430-width:430,y:y+4,width,height:18,fill:r.totalNetR<0?'#ef6677':'#26c89c'}));
    const value=svgNode('text',{x:630,y:y+18,fill:'#aab6ca','font-size':11});value.textContent=fmt(r.totalNetR)+' R';svg.append(value);
  });
  box.append(svg);return box;
}
export class StrategyTester {
  constructor(paper){
    this.paper=paper;this.doc=emptyAnalytics();this.root=el('section',null,'strategy-tester');
    this.root.id='strategy-tester';this.root.hidden=true;paper.root.append(this.root);
  }
  start(context,documents){this.context=context;this.doc=mergeAnalytics(documents);this.state=null;this.report=null;}
  stop(){this.doc=emptyAnalytics();this.state=null;this.report=null;this.context=null;this.root.replaceChildren();this.root.hidden=true;}
  serialize(){return structuredClone(this.doc);}
  changed(next,labNext=null){
    if(!this.context||this.paper.owner()!==this.paper.ownerId)throw new Error('Oturum değişti');
    next.revision=this.doc.revision+1;const validated=validateAnalytics(next);
    this.doc=validated;if(labNext)this.paper.lab.doc=labNext;
    if(this.paper.persist())this.paper.message('Analiz tercihleri ve işlem günlüğü yerel replay oturumuna kaydedildi.');
    this.render();
  }
  populate(select,value='custom',all=false){
    select.replaceChildren();if(all)select.append(option('','Tümü'));
    for(const s of this.doc.strategies)select.append(option(s.id,s.name));
    select.value=value;
  }
  update(state){
    this.state=state;
    if(!this.root.hidden)this.render();
  }
  table(headers,rows){
    const wrap=el('div',null,'tester-table-wrap'),table=el('table');
    const head=el('thead'),tr=el('tr');for(const h of headers)tr.append(el('th',h));head.append(tr);table.append(head);
    const body=el('tbody');for(const row of rows){const tr=el('tr');for(const value of row){const td=el('td');value instanceof Node?td.append(value):td.textContent=String(value);tr.append(td);}body.append(tr);}
    table.append(body);wrap.append(table);return wrap;
  }
  render(){
    if(!this.state||this.root.hidden)return;
    if(this.paper.owner()!==this.paper.ownerId){this.paper.stop();return;}
    let report;
    try{report=analyzeTrades(this.state.trades,{sessionId:this.context.sessionId,branchId:'main',
      filters:this.doc.filters,annotations:this.doc.annotations,
      ambiguityIds:this.state.history.filter(e=>e.type==='Ambiguous').map(e=>e.tradeId)});
    }catch(error){this.root.replaceChildren(el('p','Analiz hesaplanamadı: '+error.message));return;}
    this.report=report;
    const m=report.summary,pf=s=>s.profitFactorStatus==='no-losses'?'∞ (kayıp yok)':fmt(s.profitFactor);
    this.root.replaceChildren(el('h3','Strategy Tester · Manuel Replay Analizi'));
    this.root.append(el('p','Cumulative R sanal işlem performansıdır; gerçek hesap bakiyesi değildir. Net R varsayılandır. Yalnızca mevcut replay zamanında gerçekleşmiş kapanışlar sayılır.'));
    this.root.append(el('p',`Replay Session: ${this.context.sessionId} · Branch: main · Yerel kayıt (bulut senkronizasyonu değil)`));
    const cards=el('div',null,'tester-metrics');
    for(const [label,value] of [
      ['Total Trades',m.totalTrades],['Win Rate',fmt(m.winRate)+'%'],['Expectancy',fmt(m.expectancy)+' R'],
      ['Total Net R',fmt(m.totalNetR)+' R'],['Profit Factor',pf(m)],['Max Drawdown',fmt(m.maximumDrawdown)+' R']
    ]){const card=el('div');card.append(el('small',label),el('strong',String(value)));cards.append(card);}
    this.root.append(cards);
    const f=el('div',null,'tester-filters');
    const choices={
      strategyId:this.doc.strategies.map(s=>[s.id,s.name]),
      symbol:[...new Set(this.state.trades.map(t=>t.symbol))].map(v=>[v,v]),
      timeframe:[...new Set(this.state.trades.map(t=>t.timeframe))].map(v=>[v,v]),
      direction:[['long','Long'],['short','Short']],
      exitReason:[['Closed TP','TP'],['Closed SL','SL'],['Closed Manual','Manual']],
      orderType:[['market','Market'],['limit','Limit']]
    };
    for(const [key,options] of Object.entries(choices)){
      const labels={strategyId:'Strateji',symbol:'Symbol',timeframe:'Timeframe',direction:'Yön',exitReason:'Çıkış nedeni',orderType:'Emir tipi'};
      const label=el('label',labels[key]),select=el('select');select.dataset.testerFilter=key;
      select.append(option('','Tümü'));for(const [id,name] of options)select.append(option(id,name));
      select.value=this.doc.filters[key]||'';
      select.onchange=()=>this.changed({...structuredClone(this.doc),filters:{...this.doc.filters,[key]:select.value}});
      label.append(select);f.append(label);
    }
    for(const key of ['from','to']){
      const label=el('label',key==='from'?'Çıkış başlangıcı UTC':'Çıkış bitişi UTC'),input=el('input');
      input.type='datetime-local';input.dataset.testerFilter=key;
      if(this.doc.filters[key]!=null)input.value=new Date(this.doc.filters[key]*1000).toISOString().slice(0,16);
      input.onchange=()=>{try{this.changed({...structuredClone(this.doc),filters:{...this.doc.filters,[key]:input.value?Date.parse(input.value+'Z')/1000:null}});}catch(error){this.paper.message(error.message);}};
      label.append(input);f.append(label);
    }
    const reset=el('button','Filtreleri temizle');reset.dataset.testerReset='1';reset.onclick=()=>this.changed({...structuredClone(this.doc),filters:{}});f.append(reset);
    this.root.append(f);
    this.root.append(el('p',`Hariç: Open ${report.excluded.open} · Ambiguous ${report.excluded.ambiguous} · Pending/Cancelled/Expired ${report.excluded.inactive} · Geçersiz ${report.excluded.invalid} · Duplicate ${report.excluded.duplicates} · Çakışan ID ${report.excluded.conflicts}`,'tester-excluded'));
    const charts=el('div',null,'tester-charts');
    charts.append(lineChart('Cumulative Net R',m.curve.map(p=>p.cumulativeNetR)),lineChart('Drawdown (R)',m.curve.map(p=>p.drawdown)),
      barChart('R Distribution Histogram',report.histogram.map(b=>({label:b.from+'–'+b.to+'R',count:b.count}))),
      barChart('Win / Loss / Breakeven',m.totalTrades?[{label:'Win',count:m.winningTrades},{label:'Loss',count:m.losingTrades},{label:'BE',count:m.breakevenTrades}]:[]));
    this.root.append(charts);
    const last=m.curve.at(-1);
    this.root.append(el('p',`Peak Equity ${fmt(last?.peakEquity??0)} R · Current Drawdown ${fmt(last?.drawdown??0)} R · Last Recovery ${fmt(last?.recovery??0)} R · Tam toparlanma ${m.curve.filter(p=>p.recovered).length}`));
    this.root.append(this.table(['W / L / BE','Avg Win R','Avg Loss R','Avg Net R','Gross R','Win streak','Loss streak','Avg süre (sn)','Recovery factor'],
      [[`${m.winningTrades} / ${m.losingTrades} / ${m.breakevenTrades}`,fmt(m.averageWinR),fmt(m.averageLossR),fmt(m.averageNetR),fmt(m.totalGrossR),
        m.longestWinStreak,m.longestLossStreak,fmt(m.averageTradeDuration),fmt(m.recoveryFactor)]]));
    const names=new Map(this.doc.strategies.map(s=>[s.id,s.name]));
    this.root.append(el('h4','Strategy Comparison'));
    const comparison=this.table(['Strategy','Total Trades','Win Rate','Expectancy R','Profit Factor','Max DD R','Total Net R'],
      report.comparison.map(s=>[names.get(s.strategyId)||s.strategyId,s.totalTrades,fmt(s.winRate)+'%',fmt(s.expectancy),pf(s),fmt(s.maximumDrawdown),fmt(s.totalNetR)]));
    comparison.id='tester-comparison';this.root.append(comparison);
    this.root.append(comparisonChart(report.comparison,names));
    this.root.append(el('h4','Gerçekleşmiş işlemler · Trade Journal'));
    const trades=this.table(['Trade / Strategy','Symbol / TF','Yön / Emir','Entry → Exit UTC','Fiyatlar','Risk','Gross / Net R','Fees / Slippage','Süre','Exit / Ambiguity','Journal'],
      report.rows.map(t=>{
        const button=el('button','Not / Screenshot');button.dataset.journalTrade=t.id;button.onclick=()=>this.journalDialog(t);
        return [t.id.slice(0,8)+' / '+(names.get(t.strategyId)||t.strategyId),t.symbol+' / '+t.timeframe,t.direction+' / '+t.orderType,
          new Date(t.entryTime*1000).toISOString()+' → '+new Date(t.exitTime*1000).toISOString(),fmt(t.entryPrice)+' → '+fmt(t.exitPrice),
          fmt(t.initialRisk),fmt(t.grossR)+' / '+fmt(t.netR),fmt(t.fees)+' / '+fmt(t.slippage),t.duration+'s',t.status+' / '+t.ambiguityStatus,button];
      }));
    trades.id='tester-trades';this.root.append(trades);
    const categories=el('form'),name=el('input');name.maxLength=60;name.placeholder='Yeni strateji kategorisi';name.name='strategyName';
    const add=el('button','Strateji ekle');add.type='submit';categories.append(name,add);
    categories.onsubmit=e=>{
      e.preventDefault();const value=name.value.trim();if(!value)return;
      if(this.doc.strategies.some(s=>s.name.toLocaleLowerCase()===value.toLocaleLowerCase())){this.paper.message('Bu strateji zaten var');return;}
      try{this.changed({...structuredClone(this.doc),strategies:[...this.doc.strategies,{id:'strategy-'+crypto.randomUUID(),name:value}]});}
      catch(error){this.paper.message(error.message);}
    };
    this.root.append(categories);
  }
  journalDialog(trade){
    if(!this.context||this.paper.owner()!==this.paper.ownerId)return;
    this.paper.pause();
    const context=this.context,baseline=this.doc;
    const original=this.doc.annotations[trade.id],doc=structuredClone(this.doc),dialog=document.createElement('dialog');
    dialog.className='paper-dialog';dialog.id='trade-journal-dialog';
    dialog.innerHTML=`<h3>Trade Journal</h3><form>
      <label>Strategy tag<select name="strategyId"></select></label>
      <label>Setup açıklaması<textarea name="setup" maxlength="2000"></textarea></label>
      <label>İşlem gerekçesi<textarea name="rationale" maxlength="2000"></textarea></label>
      <label>Hata notları<textarea name="mistakes" maxlength="2000"></textarea></label>
      <label>Notlar<textarea name="notes" maxlength="2000"></textarea></label>
      <label>Screenshot (PNG/JPEG ≤2 MB; yerelde küçültülür, kayıt ≤256 KB)<input name="screenshot" type="file" accept="image/png,image/jpeg"></label>
      <label><input type="checkbox" name="removeScreenshot"> Kayıtlı screenshot’ı kaldır</label>
      <div class="journal-image"></div><p class="paper-error" role="status"></p>
      <button type="submit">Günlüğü kaydet</button><button type="button" class="paper-cancel">İptal</button></form>`;
    const form=dialog.querySelector('form');this.populate(form.elements.strategyId,original?.strategyId||trade.strategyId||'custom');
    for(const field of ['setup','rationale','mistakes','notes'])form.elements[field].value=original?.[field]??(field==='notes'?trade.notes||'':'');
    if(original?.screenshot){const img=el('img');img.src=original.screenshot;img.alt='İşlem screenshot';dialog.querySelector('.journal-image').append(img);}
    document.body.append(dialog);dialog.showModal();
    dialog.querySelector('.paper-cancel').onclick=()=>dialog.close();
    dialog.addEventListener('close',()=>dialog.remove(),{once:true});
    form.onsubmit=async event=>{
      event.preventDefault();const button=form.querySelector('[type="submit"]');button.disabled=true;
      try{
        let screenshot=form.elements.removeScreenshot.checked?null:original?.screenshot||null;
        if(form.elements.screenshot.files[0])screenshot=await sanitizeScreenshot(form.elements.screenshot.files[0]);
        if(!dialog.isConnected||this.context!==context||this.doc!==baseline||this.paper.owner()!==this.paper.ownerId)throw new Error('Oturum veya günlük değişti; yeniden açın');
        const a={strategyId:form.elements.strategyId.value,screenshot,revision:(original?.revision||0)+1,
          updatedAt:Date.now(),recordedReplayTime:this.paper.getReplay()?.clock??null};
        for(const field of ['setup','rationale','mistakes','notes'])a[field]=form.elements[field].value;
        doc.annotations[trade.id]=a;
        const labNext=this.paper.lab?.prepareStrategyEdit(trade,a.strategyId);
        this.changed(doc,labNext);dialog.close();this.paper.update();
      }catch(error){dialog.querySelector('.paper-error').textContent=error.message;button.disabled=false;}
    };
  }
}
