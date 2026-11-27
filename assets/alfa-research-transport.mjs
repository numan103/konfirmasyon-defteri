import { validatePacket,packetMetadata,candleDelta,canonical } from './alfa-research-model.mjs?v=4';
export class SupabaseResearchTransport{
  constructor(client,owner){this.client=client;this.owner=owner;}
  async guard(){
    const {data,error}=await this.client.auth.getSession();
    if(error||data.session?.user?.id!==this.owner)throw new Error('Research authenticated owner changed');
  }
  scoped(table,columns,id){
    let q=this.client.from(table).select(columns).eq('user_id',this.owner);
    if(id){const [session,branch]=JSON.parse(id);q=q.eq('session_id',session).eq('branch_id',branch);}
    return q;
  }
  async list(){
    await this.guard();
    const rows=[];
    for(let offset=0;offset<1000;offset+=100){
      const {data,error}=await this.scoped('research_sessions','session_id,branch_id,symbol,timeframe,revision,updated_at')
        .order('session_id').order('branch_id').range(offset,offset+99);
      if(error)throw error;rows.push(...data);if(data.length<100)return rows;
    }
    throw new Error('Research list exceeds 1000 sessions; narrow/export with administrator');
  }
  async load(id){
    await this.guard();
    const {data,error}=await this.scoped('research_sessions','payload,revision,updated_at',id).maybeSingle();
    if(error)throw error;if(!data)return null;
    const priceData={};let count=0;
    for(let offset=0;offset<=55000;offset+=1000){
      const {data:rows,error}=await this.scoped('research_candles','timeframe,time,open,high,low,close',id)
        .order('timeframe').order('time').range(offset,offset+999);
      if(error)throw error;
      for(const r of rows){(priceData[r.timeframe]??=[]).push([Number(r.time),r.open,r.high,r.low,r.close]);}
      count+=rows.length;if(count>55000)throw new Error('Research OHLC limit exceeded');
      if(rows.length<1000)break;
    }
    // Detect a concurrent save during the multi-page price read. Never acknowledge
    // metadata revision N with a mixture silently labelled as revision N+1.
    const {data:head,error:headError}=await this.scoped('research_sessions','revision',id).maybeSingle();
    if(headError)throw headError;
    if(head?.revision!==data.revision)throw new Error('Research changed during download; retry');
    const packet=validatePacket({...data.payload,priceData});
    if(data.payload.coverage==='complete'&&packet.coverage!=='complete')throw new Error('Incomplete cloud OHLC for a complete session');
    return {packet,revision:data.revision,updatedAt:data.updated_at};
  }
  async commit(packet,base,revision){
    await this.guard();
    const session=packet.replay.id,branch=packet.replay.paper?.context?.branchId||'main';
    const {data,error}=await this.client.rpc('research_commit_session',{p_user_id:this.owner,p_session_id:session,p_branch_id:branch,
      p_expected_revision:revision,p_payload:packetMetadata(packet),p_candles:candleDelta(packet,base)});
    if(error)throw error;
    const row=Array.isArray(data)?data[0]:data;if(!row?.revision)throw new Error('Research commit not acknowledged');
    return {revision:row.revision,updatedAt:row.updated_at};
  }
  async archiveLegacy(recordKey,document){
    await this.guard();
    const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(document))))]
      .map(v=>v.toString(16).padStart(2,'0')).join('');
    const {error}=await this.client.from('research_legacy_records').insert({user_id:this.owner,record_key:recordKey,digest,document});
    if(error?.code==='23505'){
      const {data,error:readError}=await this.client.from('research_legacy_records').select('document')
        .eq('user_id',this.owner).eq('record_key',recordKey).eq('digest',digest).single();
      if(readError||canonical(data.document)!==canonical(document))throw new Error('Legacy archive conflict');
    }else if(error)throw error;
    return digest;
  }
  async history(id){
    await this.guard();
    const {data,error}=await this.scoped('research_session_versions','revision,created_at',id).order('revision',{ascending:false}).limit(100);
    if(error)throw error;return data;
  }
}
