import { MAX_AUDIO_BYTES, AUDIO_TYPES, audioURL, cleanEpisode, episodeBadge, timeLabel, resumePosition } from './podcast-model.mjs?v=1';
const API='/api/edu-shared?kind=podcast';
const home=document.getElementById('home-podcast-slot'), landing=document.getElementById('landing-podcast-slot');
if (home && landing) start();
function start() {
  const audio=document.createElement('audio'); audio.id='alfa-podcast-audio'; audio.preload='none';
  audio.hidden=true; document.body.append(audio);
  const dock=document.createElement('div'); dock.className='ap-dock'; dock.hidden=true; document.body.append(dock);
  const card=document.createElement('section'); card.className='ap-podcast'; card.hidden=true;
  card.setAttribute('aria-label','ALFA Podcast');
  card.innerHTML=`<div class="ap-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><rect x="9" y="2" width="6" height="13" rx="3" stroke="currentColor" stroke-width="1.7"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></div>
    <div class="ap-copy"><div class="ap-kicker">ALFA PODCAST <span class="ap-badge"></span></div><strong class="ap-title"></strong><div class="ap-description"></div></div>
    <div class="ap-controls"><button type="button" class="ap-button ap-back" aria-label="15 saniye geri" title="15 saniye geri">−15</button><button type="button" class="ap-button ap-play" aria-label="Podcast’i oynat" title="Oynat">▶</button>
    <div class="ap-timeline"><input type="range" class="ap-seek" aria-label="Podcast konumu" min="0" max="1" step="1" value="0" disabled><div class="ap-times"><span class="ap-current">0:00</span><span class="ap-duration">—</span></div></div>
    <button type="button" class="ap-button ap-forward" aria-label="15 saniye ileri" title="15 saniye ileri">+15</button></div>
    <select class="ap-speed" aria-label="Oynatma hızı"><option value="0.75">0,75×</option><option value="1">1×</option><option value="1.25">1,25×</option><option value="1.5">1,5×</option><option value="2">2×</option></select>
    <button type="button" class="ap-manage" hidden>Bölüm ekle</button><button type="button" class="ap-button ap-close" aria-label="Mini oynatıcıyı kapat" title="Kapat">×</button><p class="ap-status" role="status"></p>`;
  const $=s=>card.querySelector(s);
  let episode=null, hasPlayed=false, dismissed=false, uploading=false, editing=false, prefs={}, lastSaved=0, lastFetched=0;
  try { prefs=JSON.parse(localStorage.getItem('alfa-podcast-listening-v1')||'{}')||{}; } catch {}
  prefs.positions=prefs.positions&&typeof prefs.positions==='object'?prefs.positions:{};
  audio.playbackRate=[.75,1,1.25,1.5,2].includes(Number(prefs.rate))?Number(prefs.rate):1;
  $('.ap-speed').value=String(audio.playbackRate);
  function admin() { try { return typeof window.siteIsAdmin==='function'&&window.siteIsAdmin(); } catch { return false; } }
  function status(text='') { $('.ap-status').textContent=text; }
  function persist() {
    if (!episode) return;
    prefs.rate=audio.playbackRate;
    prefs.positions[episode.id]={time:audio.ended?0:Math.max(0,audio.currentTime||0),url:episode.audioUrl,at:Date.now()};
    const entries=Object.entries(prefs.positions).sort((a,b)=>(b[1].at||0)-(a[1].at||0)).slice(0,12);
    prefs.positions=Object.fromEntries(entries);
    try { localStorage.setItem('alfa-podcast-listening-v1',JSON.stringify(prefs)); } catch {}
    lastSaved=Date.now();
  }
  function context() {
    const isLanding=document.body.classList.contains('landed');
    const isHome=isLanding || document.body.dataset.page==='home' || !document.body.dataset.page;
    const mini=!isHome&&hasPlayed&&!dismissed&&!!episode;
    const host=mini?dock:isLanding?landing:home;
    if (card.parentNode!==host) host.append(card);
    dock.hidden=!mini;
    document.body.classList.toggle('ap-has-dock',mini);
    card.hidden=(!isHome&&!mini)||(!episode&&!admin());
    home.hidden=card.hidden||card.parentNode!==home;
    landing.hidden=card.hidden||card.parentNode!==landing;
    $('.ap-manage').hidden=!admin();
    $('.ap-manage').textContent=episode?'Düzenle':'Bölüm ekle';
  }
  function update() {
    const duration=Number.isFinite(audio.duration)?audio.duration:episode?.durationSeconds||0;
    $('.ap-play').textContent=audio.paused?'▶':'Ⅱ';
    $('.ap-play').setAttribute('aria-label',audio.paused?'Podcast’i oynat':'Podcast’i duraklat');
    $('.ap-play').title=audio.paused?'Oynat':'Duraklat';
    $('.ap-seek').disabled=!Number.isFinite(audio.duration)||audio.duration<=0;
    $('.ap-seek').max=String(duration||1); $('.ap-seek').value=String(audio.currentTime||0);
    $('.ap-current').textContent=timeLabel(audio.currentTime);
    $('.ap-duration').textContent=duration?timeLabel(duration):'—';
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState=audio.paused?'paused':'playing';
      try { if (duration>0&&Number.isFinite(audio.duration)) navigator.mediaSession.setPositionState({duration,playbackRate:audio.playbackRate,position:Math.min(duration,audio.currentTime||0)}); } catch {}
    }
  }
  function apply(next) {
    if (next && (!audioURL(next.audioUrl)||!next.id)) throw new Error('Geçersiz podcast kaydı.');
    const changed=episode?.id!==next?.id||episode?.audioUrl!==next?.audioUrl;
    if (changed) {
      persist(); audio.pause(); audio.removeAttribute('src'); audio.load(); hasPlayed=false; dismissed=false;
    }
    episode=next;
    card.classList.toggle('ap-empty',!episode);
    $('.ap-title').textContent=episode?.title||'İlk bölümü yayınla';
    $('.ap-description').textContent=episode?new Date(episode.publishedAt).toLocaleDateString('tr-TR')+(episode.description?' · '+episode.description:''):'Ses dosyanı yükle veya doğrudan ses bağlantısını ekle.';
    $('.ap-badge').textContent=episodeBadge(episode);
    if ('mediaSession' in navigator && typeof MediaMetadata!=='undefined' && episode) {
      navigator.mediaSession.metadata=new MediaMetadata({title:episode.title,artist:'Alfa Traders',album:episodeBadge(episode),
        artwork:[{src:new URL('/favicon.png',location.href).href,type:'image/png'}]});
    }
    status(); update(); context();
  }
  async function play() {
    if (!episode) return;
    if (!audio.paused) { audio.pause(); return; }
    status();
    if (!audio.getAttribute('src')) audio.src=episode.audioUrl;
    try { await audio.play(); hasPlayed=true; dismissed=false; context(); }
    catch { status('Ses başlatılamadı. Bağlantıyı kontrol edip yeniden oynata dokun.'); update(); }
  }
  function seek(delta) {
    if (!Number.isFinite(audio.duration)) return;
    audio.currentTime=Math.min(audio.duration,Math.max(0,audio.currentTime+delta)); persist(); update();
  }
  $('.ap-play').onclick=play; $('.ap-back').onclick=()=>seek(-15); $('.ap-forward').onclick=()=>seek(15);
  $('.ap-seek').oninput=()=>{if(Number.isFinite(audio.duration)){audio.currentTime=Number($('.ap-seek').value);persist();update();}};
  $('.ap-speed').onchange=()=>{audio.playbackRate=Number($('.ap-speed').value);persist();update();};
  $('.ap-close').onclick=()=>{audio.pause();dismissed=true;context();};
  audio.addEventListener('loadedmetadata',()=>{
    const saved=prefs.positions[episode?.id];
    if (saved?.url===episode?.audioUrl) audio.currentTime=resumePosition(saved.time,audio.duration);
    update();
  });
  audio.addEventListener('timeupdate',()=>{update();if(Date.now()-lastSaved>5000)persist();});
  for(const event of ['play','pause','ended','ratechange']) audio.addEventListener(event,()=>{persist();update();context();});
  audio.addEventListener('error',()=>{status('Ses dosyası açılamadı. Bağlantıyı veya dosya adresini kontrol et.');update();});
  if ('mediaSession' in navigator) {
    const handlers={play:()=>{if(audio.paused)play();},pause:()=>audio.pause(),seekbackward:d=>seek(-(d.seekOffset||15)),
      seekforward:d=>seek(d.seekOffset||15),seekto:d=>{if(Number.isFinite(d.seekTime)&&Number.isFinite(audio.duration)){audio.currentTime=Math.min(audio.duration,d.seekTime);persist();update();}}};
    for(const [name,handler] of Object.entries(handlers)) try { navigator.mediaSession.setActionHandler(name,handler); } catch {}
  }
  async function refresh() {
    if (!audio.paused||editing||uploading) return;
    try {
      const r=await fetch(API);
      if(!r.ok)throw new Error('Podcast yüklenemedi.');
      const data=await r.json(); apply(data.episode||null); lastFetched=Date.now();
    } catch { if(admin()){context();status('Podcast bilgisi yüklenemedi. Daha sonra yeniden dene.');} }
  }
  async function authorized(url,init) {
    if(typeof window.siteFetch!=='function')throw new Error('Önce yönetici hesabına giriş yap.');
    const r=await window.siteFetch(url,init), data=await r.json();
    if(!r.ok)throw new Error(r.status===409?'Bölüm başka yerde değişti. Formu kapatıp güncel kaydı yeniden aç.':
      r.status===401?'Oturum doğrulanamadı. Yeniden giriş yap.':data.error==='audio_upload_not_configured'?'Ses yükleme yapılandırılmamış. Doğrudan ses adresi kullan.':'İşlem tamamlanamadı ('+r.status+').');
    return data;
  }
  async function editor() {
    if(!admin()||editing)return;
    editing=true;
    const dialog=document.createElement('dialog'); dialog.className='ap-editor'; dialog.setAttribute('aria-label','Podcast yayınlama');
    dialog.innerHTML=`<h2>ALFA Podcast</h2><small>Ses Vercel Blob / verdiğin ses kaynağından çalınır; Supabase yalnızca bölüm bilgisini tutar. Dosya yüklemek tek başına yayınlamaz.</small>
      <form><label>Başlık<input name="title" maxlength="120" required placeholder="Haftanın piyasa notları"></label>
      <label>Kısa açıklama<textarea name="description" maxlength="500" placeholder="Bu bölümde neler var?"></textarea></label>
      <label>Yayın türü<select name="cadence"><option value="weekly">Haftalık</option><option value="daily">Günlük</option></select></label>
      <label>Bölüm tarihi<input type="date" name="date" required></label>
      <label>Ses dosyası (en fazla 30 MB)<input type="file" name="file" accept=".mp3,.m4a,.aac,.ogg,.opus,.wav,audio/*"></label>
      <button type="button" class="ap-upload">Seçilen dosyayı yükle</button><small class="ap-upload-note">MP3 önerilir; konuşma için 64–96 kbps mono yeterlidir. Dosya doğrudan ses deposuna yüklenir; ücretsiz kota 1 GB depolama ve 10 GB/ay trafiktir.</small>
      <label>veya doğrudan HTTPS ses adresi<input type="url" name="audioUrl" required placeholder="https://…/bolum.mp3"></label>
      <p class="ap-editor-status" role="status">Yönetici kaydı yükleniyor…</p>
      <div class="ap-editor-actions"><button class="ap-publish" type="submit" disabled>Yayınla</button><button class="ap-unpublish" type="button" hidden>Yayından kaldır</button><button class="ap-cancel" type="button">Kapat</button></div></form>`;
    document.body.append(dialog); dialog.showModal();
    const form=dialog.querySelector('form'), field=name=>form.elements.namedItem(name), feedback=dialog.querySelector('.ap-editor-status');
    const publish=dialog.querySelector('.ap-publish'), upload=dialog.querySelector('.ap-upload'), remove=dialog.querySelector('.ap-unpublish');
    let current=null, revision=null, duration=0, dirty=false, busy=false, controller=null;
    function message(text){feedback.textContent=text;}
    function lock(value){busy=value;publish.disabled=value||!revision;upload.disabled=value||upload.dataset.available!=='true';remove.disabled=value;}
    function close(){if(busy){message('İşlem sürüyor; tamamlanmasını bekle.');return;}if(dirty&&!confirm('Yayınlanmamış değişiklikler kapatılsın mı?'))return;dialog.close();}
    dialog.querySelector('.ap-cancel').onclick=close;
    dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
    dialog.addEventListener('close',()=>{controller?.abort();editing=false;uploading=false;dialog.remove();});
    form.addEventListener('input',()=>{dirty=true;});
    try {
      const data=await authorized(API+'&manage=1');
      current=data.episode;revision=data.revision;
      field('title').value=current?.title||'';field('description').value=current?.description||'';
      field('cadence').value=current?.cadence||'weekly';field('audioUrl').value=current?.audioUrl||'';
      field('date').value=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(current?new Date(current.publishedAt):new Date());
      duration=current?.durationSeconds||0;
      upload.dataset.available=String(data.uploadAvailable);
      field('file').disabled=!data.uploadAvailable;remove.hidden=!current;lock(false);
      if(!data.uploadAvailable)dialog.querySelector('.ap-upload-note').textContent='Dosya yükleme yapılandırılmamış; doğrudan MP3/M4A ses adresiyle yayınlayabilirsin.';
      message('Hazır. Bölüm ancak Yayınla düğmesine basınca görünür.');
    } catch(error){message(error.message);upload.disabled=true;}
    upload.onclick=async()=>{
      const file=field('file').files?.[0];
      if(!file){message('Önce ses dosyası seç.');return;}
      if(!file.size||file.size>MAX_AUDIO_BYTES||!/\.(mp3|m4a|aac|ogg|opus|wav)$/i.test(file.name)||
        file.type&&!AUDIO_TYPES.includes(file.type)){message('MP3/M4A/AAC/OGG/OPUS/WAV, en fazla 30 MB yükleyebilirsin.');return;}
      lock(true);uploading=true;controller=new AbortController();
      try {
        const {upload:send}=await import('./vendor/vercel-blob-upload.mjs?v=1');
        const headers=await window.siteAuthHeaders();
        const extension=file.name.split('.').at(-1).toLowerCase();
        const result=await send('podcasts/'+crypto.randomUUID()+'.'+extension,file,{access:'public',handleUploadUrl:API+'&upload=1',
          headers,abortSignal:controller.signal,multipart:file.size>5*1024*1024,
          onUploadProgress:p=>message('Ses yükleniyor: %'+Math.round(p.percentage))});
        field('audioUrl').value=result.url;dirty=true;duration=0;
        message('Ses yüklendi. Başlığı kontrol edip Yayınla’ya bas.');
      } catch {message('Ses yüklenemedi. Bağlantıyı kontrol et veya doğrudan ses adresi kullan.');}
      finally{uploading=false;lock(false);}
    };
    form.onsubmit=async event=>{
      event.preventDefault();if(busy||!revision)return;
      const next=cleanEpisode({title:field('title').value,description:field('description').value,cadence:field('cadence').value,
        publishedAt:new Date(field('date').value+'T00:00:00+03:00').toISOString(),audioUrl:field('audioUrl').value,durationSeconds:duration});
      if(!next){message('Başlık, tarih ve doğrudan ses adresini kontrol et. YouTube/Spotify sayfa bağlantısı değil, ses dosyası gerekir.');return;}
      if(current?.audioUrl===next.audioUrl)next.id=current.id;
      lock(true);message('Yayınlanıyor…');
      try {
        const result=await authorized(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'publish',revision,episode:next})});
        dirty=false;audio.pause();apply(result.episode);dialog.close();
      } catch(error){message(error.message);}
      finally{lock(false);}
    };
    remove.onclick=async()=>{
      if(busy||!current||!confirm('Bu bölüm ana sayfadan kaldırılsın mı? Ses dosyası silinmeyecek.'))return;
      lock(true);
      try {
        await authorized(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'unpublish',confirmation:'UNPUBLISH',revision})});
        dirty=false;audio.pause();apply(null);dialog.close();
      }catch(error){message(error.message);}finally{lock(false);}
    };
  }
  $('.ap-manage').onclick=editor;
  new MutationObserver(context).observe(document.body,{attributes:true,attributeFilter:['class','data-page']});
  const homeStatus=document.getElementById('home-status');
  if(homeStatus)new MutationObserver(context).observe(homeStatus,{childList:true,subtree:true});
  window.addEventListener('focus',context);
  window.addEventListener('pagehide',persist);
  document.addEventListener('visibilitychange',()=>{persist();if(!document.hidden&&Date.now()-lastFetched>300000)refresh();});
  window.AlfaPodcast={isBusy:()=>!audio.paused||uploading||editing,refresh,refreshContext:context};
  refresh();context();
  setTimeout(context,1500);setTimeout(context,4500);
}
