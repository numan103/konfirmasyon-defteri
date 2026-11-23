import { makePacket,validatePacket,packetMetadata,packetBars,canonical,researchId,mergePackets,
  unionPrices,importResearch,exportResearch,assertEventExtension } from './alfa-research-model.mjs?v=2';
import { candleCloseTime } from './alfa-replay-model.mjs?v=3';
const equal=(a,b)=>canonical(a)===canonical(b);
function hydrate(metadata,prices){
  const priceData=Object.fromEntries(Object.entries(prices||{}).map(([tf,bars])=>
    [tf,bars.filter(b=>b[0]+candleCloseTime(0,tf)<=metadata.watermark)]));
  return validatePacket({...metadata,priceData});
}
export class ResearchSync{
  constructor({owner,storage,transport=null,onStatus=()=>{},online=()=>true,delay=2000}){
    Object.assign(this,{owner,storage,transport,onStatus,online,delay});
    this.active=true;this.work=Promise.resolve();this.retryDelay=2000;this.lastSync=null;
  }
  status(state,message){if(this.active)this.onStatus({state,message,lastSync:this.lastSync});}
  dispose(){this.active=false;clearTimeout(this.timer);}
  schedule(){
    clearTimeout(this.timer);
    if(this.active&&this.transport&&!this.paused)this.timer=setTimeout(()=>this.flush(),this.delay);
  }
  capture(replay,options={}){
    const captured=structuredClone({replay,options});
    const task=this.work.catch(()=>{}).then(()=>this.captureNow(captured.replay,captured.options));
    this.work=task;return task;
  }
  async captureNow(replay,options){
    if(!this.active)throw new Error('Research account changed');
    const id=researchId({replay});let incoming;
    for(let attempt=0;attempt<3;attempt++){
      const old=await this.storage.get(this.owner,id);
      try{
        incoming=makePacket(replay,{...options,previous:old?.local});
      }catch(error){
        incoming=makePacket(replay,options);
        incoming=validatePacket({...incoming,priceData:unionPrices(old?.local?.priceData,incoming.priceData),
          watermark:Math.max(incoming.watermark,old?.local?.watermark||0)});
        await this.storage.backup(this.owner,incoming,'capture conflict: '+error.message);
        await this.storage.update(this.owner,id,current=>({...current,local:incoming,state:'conflict',
          remoteConflict:current?.base||current?.local,error:error.message}),{expectedVersion:old?.localVersion||0,backupReason:'capture conflict'});
        this.status('conflict','Yerel/bulut geçmişi farklı; iki kopya korundu. '+error.message);return incoming;
      }
      if(old&&equal(old.local,incoming)){this.schedule();return incoming;}
      try{
        await this.storage.update(this.owner,id,current=>({...current,local:incoming,base:current?.base||null,
          revision:current?.revision||0,pending:[...(current?.pending||[]),packetMetadata(incoming)],
          state:current?.state==='conflict'?'conflict':'pending',error:current?.state==='conflict'?current.error:null}),
        {expectedVersion:old?.localVersion||0,backupReason:'local research revision'});
        this.status(this.online()?'saved':'offline',this.transport?'Yerel yedek kaydedildi; bulut sırası bekliyor':'Kaydedildi · yalnız yerel / misafir');
        this.schedule();return incoming;
      }catch(error){
        if(!/local revision conflict/.test(error.message)||attempt===2){
          await this.storage.backup(this.owner,incoming,'capture not queued: '+error.message).catch(()=>{});
          this.status('error','Araştırma kuyruğu yazılamadı; mevcut localStorage kayıtları korundu. '+error.message);throw error;
        }
      }
    }
  }
  async acknowledge(id,sent,ack,sentMetadata){
    await this.storage.update(this.owner,id,current=>{
      if(!current||current.revision>ack.revision)return current;
      const pending=[...(current.pending||[])];
      if(equal(pending[0],sentMetadata))pending.shift();
      // Preserve any OHLC appended while the commit was in flight. Metadata changes
      // remain queued, so a newer journal never gets replaced by the acknowledged copy.
      const local=pending.length?current.local:validatePacket({...sent,
        priceData:unionPrices(sent.priceData,current.local.priceData),
        watermark:Math.max(sent.watermark,current.local.watermark)});
      return {...current,base:sent,revision:ack.revision,lastSync:ack.updatedAt,pending,
        local,state:pending.length?'pending':'clean',error:null,remoteConflict:null};
    });
    this.lastSync=ack.updatedAt;this.status('saved','Buluta kaydedildi; yerel yedek korundu');
  }
  async conflict(id,remote,reason){
    await this.storage.update(this.owner,id,current=>({...current,state:'conflict',remoteConflict:remote?.packet||null,error:reason}),
      {backupReason:'cloud conflict: '+reason});
    this.status('conflict','Çakışma: otomatik üzerine yazılmadı. '+reason);
  }
  async syncRecord(id){
    for(let count=0;count<100&&this.active;count++){
      const record=await this.storage.get(this.owner,id);
      if(!record||record.state==='conflict'||!record.pending?.length)return;
      const sentMetadata=record.pending[0],sent=hydrate(sentMetadata,record.local.priceData);
      try{
        assertEventExtension(record.base?.replay.paper?.events,sent.replay.paper?.events);
        const ack=await this.transport.commit(sent,record.base,record.revision);
        await this.acknowledge(id,sent,ack,sentMetadata);
      }catch(error){
        if(error.code!=='40001'&&!/revision_conflict/.test(error.message||'')){
          if(/Immutable execution|research_.*immutable|research_annotation_revision_required/.test(error.message||'')){
            const remote=await this.transport.load(id);await this.conflict(id,remote,error.message);return;
          }
          throw error;
        }
        const remote=await this.transport.load(id);
        if(!this.active)return;
        if(!remote){await this.conflict(id,null,'Cloud revision disappeared');return;}
        if(equal(packetMetadata(sent),packetMetadata(remote.packet))){
          await this.acknowledge(id,remote.packet,remote,sentMetadata);continue; // Lost ack / duplicate retry.
        }
        try{
          const merged=record.pending.map(meta=>mergePackets(record.base,hydrate(meta,record.local.priceData),remote.packet));
          await this.storage.update(this.owner,id,current=>({...current,base:remote.packet,revision:remote.revision,
            local:merged.at(-1),pending:merged.map(packetMetadata),state:'pending',error:null}),
          {expectedVersion:record.localVersion,backupReason:'three-way merge sources'});
        }catch(mergeError){
          if(/local revision conflict/.test(mergeError.message))continue;
          await this.conflict(id,remote,mergeError.message);return;
        }
      }
    }
    this.schedule();
  }
  async flush(){
    if(!this.active||!this.transport||this.flushing||this.paused)return;
    clearTimeout(this.timer);
    if(!this.online()){this.status('offline','Çevrimdışı · yerel sıra ve yedekler korunuyor');return;}
    this.flushing=true;this.status('syncing','Senkronize ediliyor');
    const previousLastSync=this.lastSync;
    try{
      await this.work.catch(()=>{});
      const records=await this.storage.list(this.owner);
      for(const record of records){
        if(!this.active)return;
        if(record.state!=='conflict')await this.syncRecord(record.id);
      }
      const current=await this.storage.list(this.owner);
      if(current.some(r=>r.state==='conflict'))this.status('conflict','Çakışan oturumlar var; yerel ve bulut kopyaları korundu');
      else if(current.some(r=>r.pending?.length)){this.status('syncing','Yerel revision sırası devam ediyor');this.schedule();}
      else if(this.lastSync&&this.lastSync!==previousLastSync)this.status('saved','Buluta kaydedildi; yerel yedek korundu');
      else this.status('saved',this.lastSync?'Senkronize · yerel yedek korundu':'Yerel hazır · henüz bulut kaydı yok');
      this.retryDelay=2000;
    }catch(error){
      this.paused=['42501','PGRST205','PGRST202','401','403','404'].includes(error.code);
      this.status(this.online()?'error':'offline','Bulut hatası; sıra silinmedi: '+(error.message||'network'));
      if(this.active&&!this.paused){this.retryDelay=Math.min(60000,this.retryDelay*2);this.timer=setTimeout(()=>this.flush(),this.retryDelay);}
    }finally{this.flushing=false;}
  }
  async refresh(){
    if(!this.transport)return [];
    const list=await this.transport.list();
    for(const entry of list){
      if(!this.active)return [];
      const id=JSON.stringify([entry.session_id,entry.branch_id]),old=await this.storage.get(this.owner,id);
      if(old?.revision===entry.revision)continue;
      if(old?.pending?.length||old?.state==='conflict')continue; // CAS path handles local work; never overwrite it here.
      const remote=await this.transport.load(id);
      if(!this.active)return [];
      await this.storage.update(this.owner,id,current=>{
        if(current?.pending?.length||current?.state==='conflict')return current;
        return {...current,local:remote.packet,base:remote.packet,revision:remote.revision,pending:[],state:'clean',lastSync:remote.updatedAt};
      },{backupReason:'cloud refresh source'});
      this.lastSync=remote.updatedAt;
    }
    this.schedule();return list;
  }
  async acceptCloud(id){
    if(this.flushing)throw new Error('Senkronizasyonun bitmesini bekleyin');
    const remote=await this.transport.load(id);if(!remote||!this.active)throw new Error('Cloud session unavailable/account changed');
    await this.storage.update(this.owner,id,current=>({...current,local:remote.packet,base:remote.packet,revision:remote.revision,
      pending:[],state:'clean',error:null,remoteConflict:null,lastSync:remote.updatedAt}),{backupReason:'explicit accept-cloud; previous local branch retained'});
    return remote.packet;
  }
  async import(text,options={}){
    const packets=importResearch(text,this.owner,options);
    for(let packet of packets){
      const id=researchId(packet),old=await this.storage.get(this.owner,id);
      if(old)packet=validatePacket({...packet,priceData:unionPrices(old.local.priceData,packet.priceData),
        watermark:Math.max(old.local.watermark,packet.watermark)});
      let conflict=false;
      try{assertEventExtension(old?.local?.replay.paper?.events,packet.replay.paper?.events);}
      catch{conflict=true;}
      await this.storage.update(this.owner,id,current=>({...current,local:packet,base:current?.base||null,revision:current?.revision||0,
        pending:[...(current?.pending||[]),packetMetadata(packet)],state:conflict?'conflict':'pending',
        remoteConflict:conflict?current?.base:null,error:conflict?'Imported execution conflicts with cloud base':null}),
      {expectedVersion:old?.localVersion||0,backupReason:'JSON import source'});
    }
    this.schedule();return packets.length;
  }
  async export(id=null){
    const records=await this.storage.list(this.owner);
    return exportResearch(this.owner,records.filter(r=>!id||r.id===id).map(r=>r.local));
  }
  async exportBackups(){
    return JSON.stringify({format:'alfa-research-backups',version:1,owner:this.owner,backups:await this.storage.list(this.owner,'backups')},null,2);
  }
}
