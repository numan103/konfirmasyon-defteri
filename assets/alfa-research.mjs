import { ResearchStorage } from './alfa-research-storage.mjs?v=1';
import { ResearchSync } from './alfa-research-sync.mjs?v=3';
import { SupabaseResearchTransport } from './alfa-research-transport.mjs?v=1';
import { makePacket,validatePacket,packetBars,researchId,canonical } from './alfa-research-model.mjs?v=1';
import { PaperTradingEngine } from './alfa-paper-model.mjs?v=1';
import { candleCloseTime } from './alfa-replay-model.mjs?v=3';
import { assertEventExtension } from './alfa-research-model.mjs?v=1';
import { mergeAnalytics } from './alfa-strategy-model.mjs?v=1';
import { mergeLab } from './alfa-lab-model.mjs?v=1';
const labels={saved:'Kaydedildi',syncing:'Senkronize ediliyor',offline:'Çevrimdışı',error:'Hata',conflict:'Çakışma'};
const el=(tag,text)=>{const node=document.createElement(tag);if(text!=null)node.textContent=text;return node;};
export function legacyResearchRecords(storage,owner){
  const entries=[],sessions=[],linked=new Set(),warnings=[];
  const replayPrefix='alfa-replay-session:v1:'+owner+':',paperPrefix='alfa-paper:v1:'+owner+':';
  for(let i=0;i<storage.length;i++){
    const key=storage.key(i);
    if(!key?.startsWith(replayPrefix)&&!key?.startsWith(paperPrefix))continue;
    const raw=storage.getItem(key);let value;
    try{value=JSON.parse(raw);}catch{value={unparsedLocalText:raw};warnings.push('Bozuk JSON, ham yedek olarak korunuyor: '+key);}
    entries.push({key,document:value});
    if(key.startsWith(replayPrefix)&&value?.id){
      linked.add(value.id);
      try{
        if(key!==replayPrefix+value.symbol+':'+value.timeframe)throw new Error('Replay local key/context mismatch');
        const session=structuredClone(value),rawPaper=storage.getItem(paperPrefix+value.symbol+':'+value.timeframe+':'+value.id);
        if(rawPaper){
          const paper=JSON.parse(rawPaper),saved=session.paper;
          if(paper.context?.sessionId!==value.id||paper.context.symbol!==value.symbol||paper.context.timeframe!==value.timeframe)throw new Error('Local Paper context mismatch');
          if(saved){
            let events;
            try{assertEventExtension(saved.events,paper.events);events=paper.events;}
            catch{assertEventExtension(paper.events,saved.events);events=saved.events;}
            session.paper={...paper,events,analytics:mergeAnalytics([saved.analytics,paper.analytics]),lab:mergeLab([saved.lab,paper.lab])};
          }else session.paper=paper;
        }
        sessions.push(makePacket(session));
      }catch(error){warnings.push('Oturum açılamadı, ham kayıt yine arşivlenir: '+key+' · '+error.message);}
    }
    if(key.startsWith(paperPrefix)&&value?.context?.sessionId){
      if(key===paperPrefix+value.context.symbol+':'+value.context.timeframe+':'+value.context.sessionId)linked.add(value.context.sessionId);
      else warnings.push('Paper local key/context mismatch; raw copy only: '+key);
    }
  }
  for(const id of linked)for(const symbol of ['BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT']){
    const key='alfa-drawings:v1:'+id+':'+symbol,raw=storage.getItem(key);
    if(raw!=null){try{entries.push({key,document:JSON.parse(raw)});}catch{entries.push({key,document:{unparsedLocalText:raw}});}}
  }
  if(entries.length>1000)throw new Error('Migration scan exceeds 1000 owned records; export/narrow first');
  const orphanCount=[...linked].filter(id=>!sessions.some(p=>p.replay.id===id)).length;
  if(orphanCount)warnings.push(orphanCount+' orphan/invalid oturum ham arşivde korunur; replay tanımı olmadan açılmaz');
  return {entries,sessions,warnings};
}
function download(text,name){
  const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=document.createElement('a');
  a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export class ResearchPanel{
  constructor({getOwner,onOpen,isReplayActive,storage=new ResearchStorage()}){
    Object.assign(this,{getOwner,onOpen,isReplayActive,storage});this.pendingCaptures=0;this.generation=0;
    this.root=el('aside');this.root.id='research-panel';this.root.hidden=true;
    this.root.innerHTML=`<header><strong>Research Database</strong><button data-research="hide">Kapat</button></header>
      <p id="research-status" role="status"></p><p id="research-last-sync"></p>
      <p>Yerel kayıt ve yedekler silinmez. Misafir kayıtları hesaba otomatik taşınmaz. Çakışma otomatik ezilmez.</p>
      <nav><button data-research="retry">Senkronizasyonu yeniden dene</button><button data-research="refresh">Bulut listesini yenile</button>
      <button data-research="migrate">Yerel kayıtları buluta taşı</button><button data-research="export">JSON dışa aktar</button>
      <button data-research="backups">Yerel güvenlik yedekleri JSON</button>
      <label>JSON içe aktar <input type="file" id="research-import" accept="application/json,.json"></label></nav>
      <p>OHLC’siz eski oturumlar “reference-only” olarak saklanır; açıp kaydetmek fiyat yolunu tamamlar.
      Oturum üstüne yazmak/açmak yalnızca Replay durdurulduktan sonra yapılır.</p>
      <div id="research-records"></div>`;
    document.querySelector('.workspace').append(this.root);
    this.root.addEventListener('click',e=>{
      const button=e.target.closest('[data-research]');if(!button)return;
      const action=button.dataset.research;
      if(action==='hide'){this.root.hidden=true;return;}
      this.action(action,button.dataset.id).catch(error=>this.show({state:'error',message:error.message}));
    });
    this.root.querySelector('#research-import').onchange=async e=>{
      const file=e.target.files[0];if(!file)return;
      try{
        if(file.size>16*1024*1024)throw new Error('İçe aktarma sınırı 16 MB');
        const text=await file.text(),guest=JSON.parse(text).owner==='guest'&&this.core.owner!=='guest';
        if(guest&&!confirm('Misafir JSON yedeği bu hesaba kopyalansın mı? Asıl misafir kaydı silinmez.'))return;
        await this.core.import(text,{allowGuest:guest});await this.renderRecords();
      }catch(error){this.show({state:'error',message:error.message});}
      finally{e.target.value='';}
    };
    this.onlineHandler=()=>{if(this.core){this.core.paused=false;this.core.flush();}};
    this.offlineHandler=()=>this.show({state:'offline',message:'Çevrimdışı · yerel kayıt devam ediyor'});
    window.addEventListener('online',this.onlineHandler);window.addEventListener('offline',this.offlineHandler);
    this.unloadHandler=e=>{if(this.pendingCaptures){e.preventDefault();e.returnValue='';}};
    window.addEventListener('beforeunload',this.unloadHandler);
    this.account(null,null);
  }
  account(user,client){
    const owner=user?.id||'guest';
    if(this.core?.owner===owner&&this.client===client)return;
    this.core?.dispose();this.authSubscription?.unsubscribe();this.client=client;const generation=++this.generation;
    this.core=new ResearchSync({owner,storage:this.storage,transport:user?new SupabaseResearchTransport(client,owner):null,
      online:()=>navigator.onLine,onStatus:status=>{if(generation===this.generation){this.show(status);this.renderRecords().catch(()=>{});}}});
    if(client?.auth.onAuthStateChange)this.authSubscription=client.auth.onAuthStateChange((event,session)=>{
      if(event==='TOKEN_REFRESHED'&&session?.user?.id===this.core.owner)queueMicrotask(()=>{
        this.core.paused=false;this.core.schedule();
      });
    }).data.subscription;
    this.show({state:'saved',message:user?'Hesap hazır · yerel sıra yükleniyor':'Misafir · yalnızca yerel kayıt'});
    this.renderRecords().catch(error=>this.show({state:'error',message:error.message}));
    if(user)this.core.refresh().then(()=>this.core.flush()).then(()=>this.renderRecords())
      .catch(error=>{if(generation===this.generation)this.show({state:'error',message:'Bulut kurulumu/erişimi doğrulanamadı: '+error.message});});
  }
  show({state,message,lastSync}){
    this.root.querySelector('#research-status').textContent=(labels[state]||state)+' · '+message;
    this.root.dataset.state=state;
    const last=lastSync||this.core?.lastSync;
    this.root.querySelector('#research-last-sync').textContent='Son başarılı senkronizasyon: '+(last?new Date(last).toISOString():'henüz yok');
  }
  toggle(){this.root.hidden=!this.root.hidden;if(!this.root.hidden)this.renderRecords().catch(e=>this.show({state:'error',message:e.message}));}
  capture(owner,session,options){
    if(owner!==this.core.owner){this.show({state:'error',message:'Auth hesabı henüz eşleşmedi; localStorage kaydı korundu'});return Promise.resolve();}
    const core=this.core;this.pendingCaptures++;
    return core.capture(session,options).catch(error=>{if(core===this.core)this.show({state:'error',message:error.message});})
      .finally(()=>{this.pendingCaptures--;});
  }
  async renderRecords(){
    const core=this.core,records=await this.storage.list(core.owner);
    if(core!==this.core)return;
    const last=records.map(r=>r.lastSync).filter(Boolean).sort().at(-1);
    if(last&&!core.lastSync){core.lastSync=last;this.root.querySelector('#research-last-sync').textContent='Son başarılı senkronizasyon: '+new Date(last).toISOString();}
    const list=this.root.querySelector('#research-records');list.replaceChildren();
    for(const record of records){
      const row=el('article');
      row.append(el('p',`${record.local.replay.symbol} ${record.local.replay.timeframe} · ${record.local.replay.id} · ${record.state} · rev ${record.revision} · ${record.local.coverage}`));
      if(record.error)row.append(el('p',record.error));
      for(const [action,label] of [['open','Oturumu aç'],['export-one','JSON yedek'],['history','Bulut revision listesi']]){
        const b=el('button',label);b.dataset.research=action;b.dataset.id=record.id;row.append(b);
      }
      if(record.state==='conflict'){
        const b=el('button','Bulutu kullan (yerel kopya yedeklenir)');b.dataset.research='accept';b.dataset.id=record.id;row.append(b);
        const remote=el('button','Çakışan bulut kopyası JSON');remote.dataset.research='export-remote';remote.dataset.id=record.id;row.append(remote);
      }
      list.append(row);
    }
    if(!records.length)list.textContent='Bu hesaba ait araştırma kaydı henüz yok.';
  }
  async action(action,id){
    const core=this.core;
    if(action==='retry'){core.paused=false;await core.flush();}
    else if(action==='refresh'){await core.refresh();await this.renderRecords();}
    else if(action==='export'||action==='export-one')download(await core.export(id),'alfa-research.json');
    else if(action==='backups')download(await core.exportBackups(),'alfa-research-local-backups.json');
    else if(action==='export-remote'){
      const record=await this.storage.get(core.owner,id);
      if(!record?.remoteConflict)throw new Error('Cloud conflict copy unavailable');
      download(JSON.stringify({format:'alfa-research',version:1,owner:core.owner,records:[record.remoteConflict]},null,2),'alfa-research-conflict-cloud.json');
    }else if(action==='history'){
      if(!core.transport)throw new Error('Hesap girişi gerekli');
      const versions=await core.transport.history(id);
      if(core===this.core)this.show({state:'saved',message:'Bulut revision geçmişi (son 100): '+versions.map(v=>v.revision+' @ '+v.created_at).join(' · ')});
    }else if(action==='migrate'){
      if(!core.transport)throw new Error('Önce site hesabına giriş yapın');
      const migration=legacyResearchRecords(localStorage,core.owner);
      if(!confirm(`${migration.entries.length} yerel kayıt ham yedek olarak buluta aktarılacak; hiçbir yerel kayıt silinmez. Devam?`))return;
      this.show({state:'syncing',message:'Yerel migration başlatıldı'});
      for(const entry of migration.entries){
        if(core!==this.core)throw new Error('Migration sırasında hesap değişti');
        await this.storage.backup(core.owner,entry,'pre-migration localStorage original');
        await core.transport.archiveLegacy(entry.key,entry.document);
      }
      for(const packet of migration.sessions){
        if(core!==this.core)throw new Error('Migration sırasında hesap değişti');
        if(!await this.storage.get(core.owner,researchId(packet)))await core.capture(packet.replay);
      }
      await core.flush();
      const records=await this.storage.list(core.owner);
      const state=records.some(r=>r.state==='conflict')?'conflict':records.some(r=>r.pending?.length)?'error':'saved';
      this.show({state,message:`${migration.entries.length} ham yerel kayıt arşivlendi. ${migration.warnings.join(' · ')}`});
    }else if(action==='open'||action==='accept'){
      if(this.isReplayActive())throw new Error('Önce mevcut Replay oturumunu durdurun');
      let packet;
      if(action==='accept'){
        if(!confirm('Bulut çalışma kopyası kullanılacak. Önceki yerel araştırma kopyası IndexedDB güvenlik yedeğinde korunacak. Devam?'))return;
        packet=await core.acceptCloud(id);
      }else packet=(await this.storage.get(core.owner,id))?.local;
      if(!packet||core!==this.core||this.getOwner()!==core.owner)throw new Error('Research owner/session changed');
      await this.install(packet,core);await this.onOpen(packet);
    }
  }
  async install(packet,core=this.core){
    packet=validatePacket(packet);const r=structuredClone(packet.replay),owner=core.owner;
    if(core!==this.core||this.getOwner()!==owner)throw new Error('Research owner changed before install');
    if(r.paper&&packet.coverage==='complete'){
      const bars=packetBars(packet).filter(b=>b.time>=r.dataStart&&b.time<=r.currentTime);
      const state=new PaperTradingEngine(r.paper.context,r.paper.events).evaluate(bars,r.currentTime+candleCloseTime(0,r.timeframe));
      r.paper.labSnapshot={version:1,clock:r.currentTime+candleCloseTime(0,r.timeframe),capturedAt:Date.now(),
        trades:state.trades,ambiguityIds:state.history.filter(e=>e.type==='Ambiguous').map(e=>e.tradeId)};
    }
    const writes=[
      ['alfa-replay-session:v1:'+owner+':'+r.symbol+':'+r.timeframe,JSON.stringify(r)]
    ];
    if(r.paper){
      const key='alfa-paper:v1:'+owner+':'+r.symbol+':'+r.timeframe+':'+r.id;
      writes.unshift([key,JSON.stringify(r.paper)],[key+':lab-watermark',JSON.stringify({clock:packet.watermark})]);
    }
    const originals=writes.map(([key])=>({key,value:localStorage.getItem(key)}));
    if(originals.some((o,i)=>o.value!=null&&o.value!==writes[i][1])&&!confirm('Yerel çalışma kaydı bu araştırma kopyasıyla değiştirilsin mi? Asıl kayıt önce güvenlik yedeğine alınacak.'))
      throw new Error('Yerel çalışma kopyası değiştirilmedi');
    await this.storage.backup(owner,originals,'before explicit research open/install');
    if(core!==this.core||this.getOwner()!==owner)throw new Error('Research owner changed during backup');
    try{for(const [key,value] of writes)localStorage.setItem(key,value);}
    catch(error){
      for(const original of originals)try{
        if(original.value===null)localStorage.removeItem(original.key);else localStorage.setItem(original.key,original.value);
      }catch{/* Durable IndexedDB backup still contains every original value. */}
      throw new Error('Yerel kurulum başarısız; IndexedDB güvenlik yedeği korundu. '+error.message);
    }
  }
  dispose(){
    this.core?.dispose();this.authSubscription?.unsubscribe();
    window.removeEventListener('online',this.onlineHandler);window.removeEventListener('offline',this.offlineHandler);
    window.removeEventListener('beforeunload',this.unloadHandler);
  }
}
