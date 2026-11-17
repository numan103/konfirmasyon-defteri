const key=(owner,id)=>JSON.stringify([owner,id]);
export class ResearchStorage{
  constructor(indexedDB=globalThis.indexedDB){this.indexedDB=indexedDB;}
  async db(){
    if(!this.opening)this.opening=new Promise((resolve,reject)=>{
      if(!this.indexedDB){reject(new Error('Research IndexedDB unavailable; localStorage originals retained'));return;}
      const req=this.indexedDB.open('alfa-research-v1',1);
      req.onupgradeneeded=()=>{
        const db=req.result;
        for(const name of ['records','backups']){
          const store=db.createObjectStore(name,{keyPath:'key'});store.createIndex('owner','owner');
        }
      };
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });
    return this.opening;
  }
  async get(owner,id){
    const db=await this.db();return new Promise((resolve,reject)=>{
      const r=db.transaction('records').objectStore('records').get(key(owner,id));
      r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error);
    });
  }
  async list(owner,store='records'){
    const db=await this.db();return new Promise((resolve,reject)=>{
      const r=db.transaction(store).objectStore(store).index('owner').getAll(owner);
      r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
    });
  }
  async backup(owner,document,reason){
    const db=await this.db();return new Promise((resolve,reject)=>{
      const tx=db.transaction('backups','readwrite');
      tx.objectStore('backups').put({key:key(owner,crypto.randomUUID()),owner,document,reason,createdAt:Date.now()});
      tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Backup transaction aborted'));
    });
  }
  async update(owner,id,change,{expectedVersion,backupReason}={}){
    const db=await this.db();return new Promise((resolve,reject)=>{
      const tx=db.transaction(['records','backups'],'readwrite'),store=tx.objectStore('records');
      const request=store.get(key(owner,id));let result,error;
      request.onsuccess=()=>{
        try{
          const old=request.result||null;
          if(expectedVersion!=null&&(old?.localVersion||0)!==expectedVersion)throw new Error('Research local revision conflict');
          result=change(old);
          if(!result)return;
          if(backupReason&&old)tx.objectStore('backups').put({key:key(owner,crypto.randomUUID()),owner,
            document:old,reason:backupReason,createdAt:Date.now()});
          result={...result,key:key(owner,id),id,owner,localVersion:(old?.localVersion||0)+1};
          store.put(result);
        }catch(e){error=e;tx.abort();}
      };
      tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(error||tx.error);tx.onabort=()=>reject(error||tx.error||new Error('Research transaction aborted'));
    });
  }
}
