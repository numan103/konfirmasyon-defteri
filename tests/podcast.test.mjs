import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { audioURL, cleanEpisode, episodeBadge, timeLabel, resumePosition } from '../assets/podcast-model.mjs';
const NOW=Date.parse('2026-11-16T10:00:00Z');
const episode=()=>({title:'Piyasa notları',description:'Haftanın gündemi',audioUrl:'https://media.example.com/episode.mp3',
  cadence:'weekly',publishedAt:'2026-11-16T00:00:00Z',durationSeconds:720});
const res=()=>({code:0,body:null,headers:{},setHeader(k,v){this.headers[k]=v;},status(c){this.code=c;return this;},json(v){this.body=v;return this;}});
test('audio URLs are direct HTTPS audio, never HTML embeds, inline data, credentials or Supabase traffic',()=>{
  assert.equal(audioURL('https://media.example.com/audio.m4a?sig=abc'),'https://media.example.com/audio.m4a?sig=abc');
  for(const url of ['http://example.com/a.mp3','javascript:alert(1)','data:audio/mp3;base64,aA==','https://user:pass@example.com/a.mp3',
    'https://open.spotify.com/episode/123','https://youtube.com/watch?v=123','https://localhost/a.mp3','https://127.0.0.1/a.mp3',
    'https://fssrtlpjqbavzomynwmg.supabase.co/storage/v1/object/public/audio/a.mp3'])assert.equal(audioURL(url),null,url);
});
test('episode sanitization bounds metadata, dates, formats and durations',()=>{
  const cleaned=cleanEpisode({...episode(),title:'  Deneme  ',extra:'not stored'},NOW);
  assert.equal(cleaned.title,'Deneme');assert.equal(cleaned.extra,undefined);
  for(const patch of [{title:''},{title:'x'.repeat(121)},{description:'x'.repeat(501)},{cadence:'monthly'},
    {publishedAt:'2026-11-17T00:00:00Z'},{durationSeconds:-1},{durationSeconds:Infinity},{audioUrl:'https://example.com/a.html'}])
    assert.equal(cleanEpisode({...episode(),...patch},NOW),null);
});
test('daily/weekly badges never label stale episodes as current; Istanbul date boundaries apply',()=>{
  assert.equal(episodeBadge(episode(),NOW),'Haftanın Podcast’i');
  assert.equal(episodeBadge({...episode(),cadence:'daily'},NOW),'Günün Podcast’i');
  assert.equal(episodeBadge({...episode(),publishedAt:'2026-11-15T10:00:00Z'},NOW),'Son Bölüm');
  assert.equal(episodeBadge({...episode(),cadence:'daily',publishedAt:'2026-11-15T22:30:00Z'},NOW),'Günün Podcast’i');
});
test('time display and resume reset ended/invalid positions without autoplay',()=>{
  assert.equal(timeLabel(65),'1:05');assert.equal(timeLabel(3665),'1:01:05');
  assert.equal(resumePosition(40,100),40);assert.equal(resumePosition(99,100),0);
  assert.equal(resumePosition(-5,100),0);assert.equal(resumePosition('bad',100),0);
});
async function mock(run,storage,user='admin'){
  const before=global.fetch,oldKey=process.env.SUPABASE_SERVICE_ROLE;
  process.env.SUPABASE_SERVICE_ROLE='sb_secret_test_only';
  const calls=[];
  global.fetch=async(url,init={})=>{
    if(url.endsWith('/auth/v1/user'))return{ok:user!=='invalid',json:async()=>({id:'user-test',email:user==='admin'?'ahmetnuman20@gmail.com':'member@example.com'})};
    calls.push({url,init});return storage(url,init);
  };
  try{const {default:handler}=await import('../lib/podcast.mjs?case='+Math.random());await run(handler,calls);}
  finally{global.fetch=before;if(oldKey===undefined)delete process.env.SUPABASE_SERVICE_ROLE;else process.env.SUPABASE_SERVICE_ROLE=oldKey;}
}
test('public metadata uses a single bounded cached query and exposes no admin revision/config',async()=>{
  await mock(async(handler,calls)=>{
    const a=res(),b=res();await Promise.all([handler({method:'GET',query:{}},a),handler({method:'GET',query:{}},b)]);
    assert.equal(calls.length,1);assert.equal(a.code,200);assert.equal(a.body.episode.title,'Piyasa notları');
    assert.equal(a.body.revision,undefined);assert.equal(a.body.uploadAvailable,undefined);
    assert.match(a.headers['Cache-Control'],/s-maxage=60/);
  },async()=>({ok:true,json:async()=>[{episode:episode(),updated_at:'2026-11-16T00:00:00Z'}]}));
});
test('metadata failure is not cached as a fake empty episode',async()=>{
  await mock(async handler=>{const r=res();await handler({method:'GET',query:{}},r);assert.equal(r.code,503);assert.equal(r.body.episode,undefined);},
    async()=>({ok:false,status:402}));
});
test('anonymous/non-admin publication and admin metadata access are rejected before storage',async()=>{
  await mock(async(handler,calls)=>{
    const noAuth=res();await handler({method:'POST',query:{},body:{action:'publish'}},noAuth);assert.equal(noAuth.code,401);
    const member=res();await handler({method:'POST',query:{},headers:{authorization:'Bearer member'},body:{action:'publish'}},member);assert.equal(member.code,403);
    const manage=res();await handler({method:'GET',query:{manage:'1'},headers:{authorization:'Bearer member'}},manage);assert.equal(manage.code,403);
    assert.equal(calls.length,0);
  },async()=>{throw new Error('no storage');},'member');
});
test('publish uses verified admin and exact revision; conflicts never overwrite newer metadata',async()=>{
  await mock(async(handler,calls)=>{
    const body={action:'publish',revision:'2026-11-16T00:00:00Z',episode:{...episode(),publishedAt:'2026-01-01T00:00:00Z'}};
    const r=res();await handler({method:'POST',query:{},headers:{authorization:'Bearer admin'},body},r);
    assert.equal(r.code,409);assert.equal(calls.length,1);assert.match(calls[0].url,/rpc\/podcast_publish$/);
    const payload=JSON.parse(calls[0].init.body);assert.equal(payload.p_revision,body.revision);assert.equal(payload.p_episode.audioUrl,body.episode.audioUrl);
  },async()=>({ok:true,json:async()=>null}));
});
test('unpublish requires explicit confirmation and upload callback requires a real signature',async()=>{
  await mock(async(handler,calls)=>{
    const r=res();await handler({method:'POST',query:{},headers:{authorization:'Bearer admin'},
      body:{action:'unpublish',revision:'2026-11-16T00:00:00Z'}},r);
    assert.equal(r.code,400);assert.equal(calls.length,0);
  },async()=>{throw new Error('no storage');});
  const old=process.env.BLOB_READ_WRITE_TOKEN;process.env.BLOB_READ_WRITE_TOKEN='vercel_blob_rw_test_invalid';
  try{
    const {default:handler}=await import('../lib/podcast.mjs?callback-test');
    const r=res();await handler({method:'POST',query:{upload:'1'},headers:{},body:{type:'blob.upload-completed',payload:{}}},r);
    assert.equal(r.code,400);
  }finally{if(old===undefined)delete process.env.BLOB_READ_WRITE_TOKEN;else process.env.BLOB_READ_WRITE_TOKEN=old;}
});
test('publisher cache invalidates on successful update and returns the real published episode',async()=>{
  let saved=null;
  await mock(async(handler,calls)=>{
    const r=res();await handler({method:'POST',query:{},headers:{authorization:'Bearer admin'},
      body:{action:'publish',revision:'2026-01-01T00:00:00Z',episode:{...episode(),publishedAt:'2026-01-01T00:00:00Z'}}},r);
    assert.equal(r.code,200);assert.equal(r.body.ok,true);assert.ok(r.body.episode.id);
    assert.equal(saved.p_episode.title,'Piyasa notları');assert.equal(calls.length,1);
  },async(url,init)=>{saved=JSON.parse(init.body);return{ok:true,json:async()=> '2026-11-16T10:00:00Z'};});
});
test('audio upload token requests are admin-only and rate limited before storage',async()=>{
  const old=process.env.BLOB_READ_WRITE_TOKEN;process.env.BLOB_READ_WRITE_TOKEN='vercel_blob_rw_test_invalid';
  try{
    await mock(async handler=>{
      const first=res();
      await handler({method:'POST',query:{upload:'1'},headers:{authorization:'Bearer admin'},
        body:{type:'blob.generate-client-token',payload:{pathname:'podcasts/abc.mp3',multipart:false}}},first);
      assert.notEqual(first.code,429,'first upload token request must not be throttled');
      const second=res();
      await handler({method:'POST',query:{upload:'1'},headers:{authorization:'Bearer admin'},
        body:{type:'blob.generate-client-token',payload:{pathname:'podcasts/def.mp3',multipart:false}}},second);
      assert.equal(second.code,429,'repeated token requests must be throttled');
    },async()=>{throw new Error('no storage');});
    await mock(async handler=>{
      const r=res();
      await handler({method:'POST',query:{upload:'1'},headers:{authorization:'Bearer member'},
        body:{type:'blob.generate-client-token',payload:{pathname:'podcasts/abc.mp3',multipart:false}}},r);
      assert.equal(r.code,403,'non-admin upload token requests are refused');
    },async()=>{throw new Error('no storage');},'member');
  }finally{if(old===undefined)delete process.env.BLOB_READ_WRITE_TOKEN;else process.env.BLOB_READ_WRITE_TOKEN=old;}
});
test('podcast schema is isolated and owner-only writes; no binary audio in DB or service-worker cache',()=>{
  const sql=fs.readFileSync(new URL('../supabase/site/012_site_podcast.sql',import.meta.url),'utf8');
  assert.match(sql,/enable row level security/);assert.match(sql,/grant execute[\s\S]*to service_role/);
  assert.match(sql,/where id='current' and updated_at=p_revision/);
  assert.doesNotMatch(sql,/alter table public\.(journals|edu_shared)/i);
  const source=fs.readFileSync(new URL('../assets/alfa-podcast.mjs',import.meta.url),'utf8');
  assert.match(source,/audio\.preload='none'/);assert.doesNotMatch(source,/audio\.autoplay/);
  assert.match(source,/headers,abortSignal/);
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(html,/window\.AlfaPodcast && window\.AlfaPodcast\.isBusy\(\)/);
  assert.match(html,/id="landing-podcast-slot"/);assert.match(html,/id="home-podcast-slot"/);
});
