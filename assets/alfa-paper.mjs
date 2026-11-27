import { PaperTradingEngine, createPaperOrder } from './alfa-paper-model.mjs?v=1';
import { StrategyTester } from './alfa-strategy.mjs?v=2';
import { StrategyLab } from './alfa-lab.mjs?v=4';
import { labSnapshot } from './alfa-lab-store.mjs?v=1';
const fmt=v=>Number.isFinite(v)?Number(v.toFixed(8)).toLocaleString('en-US',{maximumFractionDigits:8}):'—';
const sameContext=(a,b)=>['sessionId','symbol','timeframe','exchange','marketType'].every(k=>a?.[k]===b?.[k]);
export class PaperTradingPanel {
  constructor({series,getReplay,owner,pause,onPersist}) {
    Object.assign(this,{series,getReplay,owner,pause,onPersist});
    this.lines=[];this.engine=null;this.filter='all';
    this.unsaved=new Map();
    window.addEventListener('beforeunload',event=>{
      if(this.unsaved.size){event.preventDefault();event.returnValue='';}
    });
    this.root=document.createElement('aside');this.root.id='paper-panel';this.root.hidden=true;
    this.root.setAttribute('aria-label','Paper Trading simülasyonu');
    this.root.innerHTML=`<header><strong>Paper Trading · SİMÜLASYON</strong><span class="paper-sim-badge" role="status">GERÇEK EMİR YOK</span><button type="button" data-action="hide">Kapat</button></header>
      <p>Gerçek emir gönderilmez. Market / manuel kapanış: sonraki mum açılışı.
      Limit: daha iyi açılış fiyatı, en kötü limit fiyatı. SL/TP aynı mumda: varsayılan SL-first.
      Intrabar limit fill sonrası aynı mumdaki belirsiz TP kâr sayılmaz.</p>
      <nav aria-label="Paper Trading sekmeleri"><button data-filter="paper">Paper Trading</button>
      <button data-filter="history">Trade History</button><button data-filter="tester">Strategy Tester</button>
      <button data-filter="lab">Strategy Lab</button></nav>
      <nav><button data-action="new">Yeni emir</button><button data-filter="all">Tümü</button>
      <button data-filter="Pending">Pending Orders</button><button data-filter="Open">Open Positions</button>
      <button data-filter="closed">Closed Trades</button>
      <button data-action="export">JSON yedek</button></nav>
      <p id="paper-status" role="status"></p><div id="paper-list"></div>`;
    document.querySelector('.workspace').append(this.root);
    this.tester=new StrategyTester(this);
    this.lab=new StrategyLab(this);
    this.root.addEventListener('click',event=>{
      const b=event.target.closest('button');if(!b)return;
      if(b.dataset.filter){this.filter=b.dataset.filter==='paper'?'all':b.dataset.filter;this.update();return;}
      if(b.dataset.action==='hide'){this.root.hidden=true;return;}
      if(b.dataset.action==='export'){this.export();return;}
      if(b.dataset.action==='new'){this.orderDialog();return;}
      const t=this.state?.trades.find(t=>t.id===b.dataset.id);if(!t)return;
      if(b.dataset.action==='select'){this.selected=t.id;this.update();return;}
      if(b.dataset.action==='journal'){this.tester.journalDialog(t);return;}
      if(b.dataset.action==='lab-tag'){this.lab.tagDialog(t);return;}
      if(b.dataset.action==='edit'){this.editDialog(t);return;}
      if(b.dataset.action==='resolve')this.command('resolve',{tradeId:t.id,outcome:b.dataset.outcome});
      else if(['cancel','close'].includes(b.dataset.action))this.command(b.dataset.action,{tradeId:t.id});
    });
  }
  start(context,saved=null){
    this.stop();this.context=context;this.ownerId=this.owner();
    this.key='alfa-paper:v1:'+this.ownerId+':'+context.symbol+':'+context.timeframe+':'+context.sessionId;
    let local;
    try {local=JSON.parse(localStorage.getItem(this.key)||'null');}
    catch{throw new Error('Yerel Paper günlüğü okunamadı; kayıt silinmedi');}
    const merged=new Map();
    const journals=[saved,local,this.unsaved.get(this.key)];
    for(const journal of journals) {
      if(!journal)continue;
      if(journal.version!==1||!sameContext(journal.context,context))throw new Error('Paper oturumu bağlamı uyuşmuyor');
      for(const e of journal.events) {
        if(merged.has(e.id) && JSON.stringify(merged.get(e.id))!==JSON.stringify(e))throw new Error('Paper günlüğünde çakışma; yedekler korundu');
        merged.set(e.id,e);
      }
    }
    this.engine=new PaperTradingEngine(context,[...merged.values()]);
    this.tester.start(context,journals.map(j=>j?.analytics));
    this.lab.start(context,journals.map(j=>j?.lab),this.getReplay()?.clock??0);
    this.selected=null;this.message('Replay hesabı hazır. Gelecekteki komutlar geri sararken silinmez; o saate gelince yeniden uygulanır.');
  }
  serialize(){
    if(this.owner()!==this.ownerId||!this.engine)return null;
    const replay=this.getReplay();
    this.lab.observe(replay?.clock);
    this.snapshotCounter=Math.max(Date.now(),(this.snapshotCounter||0)+1);
    return {...this.engine.serialize(),analytics:this.tester.serialize(),lab:this.lab.serialize(),
      ...(replay?{labSnapshot:labSnapshot(this.engine,replay,this.snapshotCounter)}:{})};
  }
  message(text){this.root.querySelector('#paper-status').textContent=text;}
  persist(){
    if(!this.engine)return;
    if(this.owner()!==this.ownerId){this.stop();return false;}
    try {localStorage.setItem(this.key,JSON.stringify(this.serialize()));}
    catch {this.unsaved.set(this.key,this.serialize());this.message('Yerel kayıt başarısız. JSON yedek indirin; oturumu kapatmayın.');return false;}
    this.unsaved.delete(this.key);
    this.onPersist?.();
    return true;
  }
  command(type,payload){
    this.pause();
    const replay=this.getReplay();if(!replay||!this.engine||this.owner()!==this.ownerId){this.stop();this.message('Yalnızca kendi Replay oturumunuzda kullanılabilir');return;}
    try{
      if(type==='create'){
        this.lab.observe(replay.clock);
        payload={...payload,order:{...payload.order,labOrigin:{clock:replay.clock,
          observedThrough:this.lab.doc.maxObservedClock,reliable:this.lab.reliable}}};
      }
      const candidate=new PaperTradingEngine(this.context,this.engine.events);
      candidate.command(type,payload,replay.clock,crypto.randomUUID());
      candidate.evaluate(replay.bars,replay.clock);
      this.engine=candidate;const saved=this.persist();this.update();
      if(saved)this.message(type==='close'?'Manuel kapanış sonraki mum açılışında yapılacak.':'Komut kaydedildi.');
      return true;
    }catch(error){this.message(error.message);return false;}
  }
  toggle(){
    if(!this.getReplay())return;
    this.root.hidden=!this.root.hidden;this.update();
  }
  canLeave(){
    return !this.engine || !this.unsaved.has(this.key) ||
      confirm('Paper günlüğü kaydedilemedi. JSON yedek almadan çıkarsanız değişiklikler kaybolabilir. Yine de çıkılsın mı?');
  }
  stop(){
    this.tester?.stop();
    this.lab?.stop();
    document.querySelectorAll('#trade-journal-dialog').forEach(d=>d.close());
    for(const line of this.lines)try{this.series.removePriceLine(line);}catch{}
    this.lines=[];this.root.hidden=true;this.engine=null;this.state=null;
  }
  update(){
    const replay=this.getReplay();if(!this.engine||!replay)return;
    if(this.owner()!==this.ownerId){this.stop();return;}
    try{this.state=this.engine.evaluate(replay.bars,replay.clock);}
    catch(error){this.pause();this.message('Simülasyon durduruldu: '+error.message);return;}
    this.tester.root.hidden=this.filter!=='tester';
    this.lab.root.hidden=this.filter!=='lab';
    this.root.classList.toggle('tester-active',['tester','lab'].includes(this.filter));
    this.root.querySelector('#paper-list').hidden=['tester','lab'].includes(this.filter);
    for(const b of this.root.querySelectorAll('[data-filter]'))b.setAttribute('aria-pressed',String(b.dataset.filter===this.filter||
      b.dataset.filter==='paper'&&!['history','tester','lab'].includes(this.filter)));
    this.tester.update(this.state);
    this.lab.update(this.state);
    for(const line of this.lines)this.series.removePriceLine(line);
    this.lines=[];
    for(const t of this.state.trades.filter(t=>t.status==='Open'||t.status==='Pending')){
      for(const [label,price,color] of [['Entry',t.entryPrice??t.entry,'#42a5f5'],['SL',t.stopLoss,'#ef5350'],['TP',t.takeProfit,'#26a69a']]){
        this.lines.push(this.series.createPriceLine({price,color,lineWidth:this.selected===t.id?2:1,lineStyle:t.status==='Pending'?2:0,
          title:'PAPER '+t.direction.toUpperCase()+' '+label}));
      }
    }
    const list=this.root.querySelector('#paper-list');list.replaceChildren();
    if(['tester','lab'].includes(this.filter))return;
    if(this.filter==='history'){
      for(const event of this.state.history){
        const row=document.createElement('div');
        row.textContent=new Date(event.at*1000).toISOString()+' · '+event.type+' · '+event.tradeId.slice(0,8)+' · '+fmt(event.price);
        list.append(row);
      }
      return;
    }
    const trades=this.state.trades.filter(t=>this.filter==='all'||(this.filter==='closed'?!['Pending','Open'].includes(t.status):t.status===this.filter));
    for(const t of trades){
      const row=document.createElement('article'),text=document.createElement('div');
      text.textContent=`${t.id.slice(0,8)} · ${t.direction.toUpperCase()} ${t.orderType} · ${t.status}${t.ambiguous?' · AMBIGUOUS':''}
Entry ${fmt(t.entryPrice??t.entry)} / SL ${fmt(t.stopLoss)} / TP ${fmt(t.takeProfit)} / Qty ${fmt(t.positionSize)}
RR ${fmt(t.riskReward)} · Current R ${fmt(t.currentR)} · Realized R ${fmt(t.realizedR)} · Net R ${fmt(t.netR)}
Initial risk ${fmt(t.initialRisk)} · Fees ${fmt(t.fees)} · Slippage ${fmt(t.slippage)} · Spread cost ${fmt(t.spreadCost)}${t.reason?' · '+t.reason:''}
${t.notes?'Not: '+t.notes:''}`;
      row.append(text);
      const button=(label,action,outcome)=>{
        const b=document.createElement('button');b.type='button';b.textContent=label;
        b.dataset.id=t.id;b.dataset.action=action;if(outcome)b.dataset.outcome=outcome;row.append(b);
        if(action==='select')b.setAttribute('aria-pressed',String(this.selected===t.id));
      };
      button('Seç','select');
      button('Günlük / Strateji','journal');
      button('Lab etiketleri','lab-tag');
      if(t.status==='Pending')button('Emri iptal et','cancel');
      if(t.status==='Open'&&!t.ambiguous)button(t.closeRequested?'Kapanış bekliyor':'Manuel kapat','close');
      if(['Open','Pending'].includes(t.status)&&!t.ambiguous)button('SL / TP','edit');
      if(t.ambiguous){button('Belirsizliği SL ile çöz','resolve','sl');button('Belirsizliği TP ile çöz','resolve','tp');}
      list.append(row);
    }
    if(!trades.length)list.textContent='Bu replay zamanında işlem yok.';
  }
  dialog(title,html,onSubmit){
    this.pause();
    const dialog=document.createElement('dialog');dialog.className='paper-dialog';
    dialog.innerHTML='<h3></h3><form>'+html+'<p class="paper-error" role="status"></p><button type="submit">Uygula</button><button type="button" class="paper-cancel">İptal</button></form>';
    dialog.querySelector('h3').textContent=title;
    document.body.append(dialog);
    dialog.querySelector('.paper-cancel').onclick=()=>dialog.close();
    dialog.addEventListener('close',()=>dialog.remove(),{once:true});
    dialog.querySelector('form').onsubmit=event=>{
      event.preventDefault();
      try{onSubmit(new FormData(event.target));dialog.close();}
      catch(error){dialog.querySelector('.paper-error').textContent=error.message;}
    };
    dialog.showModal();
    return dialog;
  }
  orderDialog(){
    const replay=this.getReplay();if(!replay)return;
    const close=replay.bars.at(-1)?.close;if(!close)return;
    const parse=form=>{
      const input=Object.fromEntries(form);
      for(const k of ['entry','stopLoss','takeProfit','riskAmount','positionSize','riskPercentage','feeBps','slippageBps','spread'])
        input[k]=input[k]===''?undefined:Number(input[k]);
      input.expiresAt=input.expiresAt?Date.parse(input.expiresAt+'Z')/1000:undefined;
      return createPaperOrder(input);
    };
    const dialog=this.dialog('Yeni sanal emir',`
      <label>Strategy tag<select name="strategyId"></select></label>
      <label>Yön<select name="direction"><option value="long">Long</option><option value="short">Short</option></select></label>
      <label>Emir<select name="orderType"><option value="market">Market (sonraki açılış)</option><option value="limit">Limit</option></select></label>
      <label>Planlanan entry / limit fiyatı<input name="entry" type="number" min="0" step="any" required value="${close}"></label>
      <label>Stop Loss<input name="stopLoss" type="number" min="0" step="any" required></label>
      <label>Take Profit (boşsa 2.5R)<input name="takeProfit" type="number" min="0" step="any"></label>
      <label>Risk tutarı (quote para birimi)<input name="riskAmount" type="number" min="0" step="any" value="100"></label>
      <label>veya pozisyon miktarı (doluysa risk tutarının yerine geçer)<input name="positionSize" type="number" min="0" step="any"></label>
      <label>Risk % (bilgi amaçlı; hesap bakiyesi simüle edilmez)<input name="riskPercentage" type="number" min="0" step="any" value="1"></label>
      <label>Komisyon (bps, her fill)<input name="feeBps" type="number" min="0" max="1000" step="any" value="0"></label>
      <label>Slippage (bps, her fill)<input name="slippageBps" type="number" min="0" max="1000" step="any" value="0"></label>
      <label>Spread (fiyat birimi)<input name="spread" type="number" min="0" step="any" value="0"></label>
      <label>SL/TP çakışma politikası<select name="policy"><option value="conservative">Conservative · SL first</option><option value="ambiguous">Ambiguous · karar bekle</option></select></label>
      <label>Bekleyen emrin sona erme zamanı (UTC, isteğe bağlı)<input name="expiresAt" type="datetime-local"></label>
      <label>Not<textarea name="notes" maxlength="2000"></textarea></label>
      <output id="paper-preview">Entry / SL girin. Varsayılan hedef 2.5R.</output>`,form=>{
        const order=parse(form);
        if(!this.command('create',{order}))throw new Error('Emir kabul edilmedi; paneldeki hata mesajını kontrol edin.');
      });
    this.tester.populate(dialog.querySelector('[name="strategyId"]'));
    dialog.querySelector('form').addEventListener('input',()=>{
      try {
        const o=parse(new FormData(dialog.querySelector('form')));
        dialog.querySelector('#paper-preview').textContent='Planlanan Qty '+fmt(o.positionSize)+' · Risk '+fmt(Math.abs(o.entry-o.stopLoss)*o.positionSize)+' · RR '+fmt(Math.abs(o.takeProfit-o.entry)/Math.abs(o.entry-o.stopLoss))+' · Fill sonrası gerçek risk güncellenir.';
      }catch{dialog.querySelector('#paper-preview').textContent='Geçerli entry ve SL girin; long/short yönünü kontrol edin.';}
    });
  }
  editDialog(t){
    this.dialog('SL / TP düzenle · başlangıç 1R değişmez',`
      <label>Stop Loss<input name="stopLoss" type="number" step="any" value="${t.stopLoss}" required></label>
      <label>Take Profit<input name="takeProfit" type="number" step="any" value="${t.takeProfit}" required></label>`,form=>{
        const stopLoss=Number(form.get('stopLoss')),takeProfit=Number(form.get('takeProfit'));
        const reference=t.status==='Open'?this.getReplay().bars.at(-1).close:t.entry;
        if(!(stopLoss>0&&takeProfit>0) || t.side*(reference-stopLoss)<=0 || t.side*(takeProfit-(t.entryPrice??t.entry))<=0)throw new Error('Yanlış yönde SL / TP');
        if(!this.command('edit',{tradeId:t.id,stopLoss,takeProfit}))throw new Error('SL / TP düzenlenemedi');
      });
  }
  export(){
    if(!this.engine)return;
    const url=URL.createObjectURL(new Blob([JSON.stringify(this.serialize(),null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='paper-'+this.context.sessionId+'.json';a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
}
