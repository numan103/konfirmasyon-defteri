// Local-only synthetic authoring fixture. Never contacts production or writes DB.
// node scripts/preview-edu-studio.mjs -> http://127.0.0.1:4319
import http from 'node:http';
import fs from 'node:fs';
const image = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="360"><rect width="100%" height="100%" fill="#151b2c"/><path d="M40 280 L160 130 L240 230 L380 50 L510 230 L600 130 L710 280" fill="none" stroke="#59d4a9" stroke-width="5"/><path d="M40 230H850" stroke="#edae56" stroke-width="2"/><text x="40" y="330" fill="white" font-size="22">OBO – boyun çizgisi / sentetik örnek</text></svg>');
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1:4319');
  if (u.pathname === '/assets/edu-author-drafts.mjs') {
    res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
    res.end(fs.readFileSync(new URL('../assets/edu-author-drafts.mjs', import.meta.url))); return;
  }
  if (u.pathname === '/example.svg') { res.setHeader('Content-Type', 'image/svg+xml'); res.end(decodeURIComponent(image.split(',')[1])); return; }
  if (u.pathname !== '/') { res.statusCode = 404; res.end(); return; }
  const wanted = u.searchParams.get('role');
  const role = wanted === 'reader' || wanted === 'premium' ? wanted : 'admin';
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const style = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
  const fragment = html.slice(html.indexOf('<div id="page-edustudio"'), html.indexOf('<div id="page-strategies"'));
  const homeStart = html.indexOf('<section id="home-daily-notes"');
  const home = '<div id="page-home" class="hidden">' + html.slice(homeStart, html.indexOf('</section>', homeStart) + 10) + '</div>';
  const code = html.slice(html.indexOf("const EGITIM_KEY ="), html.indexOf('function panoRoomId()'));
  const authCallback = html.slice(html.indexOf('AUTH.client.auth.onAuthStateChange((event, session)'), html.indexOf("  $('auth-form').addEventListener"));
  const bootstrap = `
    const AUTH={user:{id:'local-synthetic',email:${JSON.stringify(role === 'admin' ? 'admin@test.dev' : 'reader@test.dev')}},client:{auth:{onAuthStateChange(fn){window.syntheticAuthEvent=fn}}}}, ADMIN_EMAIL='admin@test.dev', SITE={admin:${role === 'admin'},tier:${JSON.stringify(role === 'premium' ? 'ref' : 'free')}};
    let currentPage='egitim'; const lang='tr'; const LANG='tr';
    function siteIsAdmin(){return SITE.admin}
    function magIsAdmin(){return SITE.admin}
    function refUnlocked(){return SITE.admin||SITE.tier==='ref'}
    function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
    function showPage(name){chDraftCapture();chStudioNavigate(name);currentPage=name;document.querySelectorAll('[id^="page-"]').forEach(e=>e.classList.toggle('hidden',e.id!=='page-'+name));if(name==='edustudio')renderEduStudio();if(name==='egitim')renderEgitim();if(name==='home')chLoadHomeDaily()}
    function mountEduFeedback(){}
    window.syntheticFail=false; window.syntheticWrites=[];
    window.syntheticDailyRecords=new Map();
    const sampleId='edutg_'+'b'.repeat(64);
    syntheticDailyRecords.set(sampleId,{id:sampleId,title:'Sentetik günlük not',body:'Alfa Edu günlük eğitsel paylaşımı.\\n{{foto:1}}',photos:[{url:'http://127.0.0.1:4319/example.svg',caption:'Günlük örnek'}],publication:'daily',publishedAt:Date.now(),source:'telegram'});
    const originalFetch=window.fetch.bind(window);
    window.fetch=async(url,opts={})=>{
      const u=new URL(String(url),location.href),view=u.searchParams.get('view');
      if(u.pathname!=='/api/edu-shared'||!['daily-notes','telegram-inbox'].includes(view))return originalFetch(url,opts);
      const records=[...syntheticDailyRecords.values()];
      if(opts.method==='POST'){
        if(!SITE.admin)return Response.json({error:'forbidden'},{status:403});
        if(syntheticFail)return Response.json({error:'failed'},{status:503});
        const b=JSON.parse(opts.body);syntheticWrites.push({daily:b});
        let id=b.id;
        if(!id){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(b.draftId));id='edutg_'+[...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('');}
        const old=syntheticDailyRecords.get(id);
        const item=b.action==='save'?{...old,...b.fields,id,publication:'daily',manualOverride:true,publishedAt:old?.publishedAt||Date.now()}:{...old,publication:b.action==='restore'?'daily':'hidden',manualOverride:true};
        syntheticDailyRecords.set(id,item);return Response.json({ok:true,item});
      }
      if(view==='telegram-inbox'){
        if(!SITE.admin)return Response.json({error:'forbidden'},{status:403});
        if(u.searchParams.has('manage'))return Response.json({ok:true,item:syntheticDailyRecords.get(u.searchParams.get('manage'))});
        return Response.json({ok:true,items:records.map(r=>({id:r.id,title:r.title,excerpt:r.body.slice(0,260),photoCount:r.photos?.length||0,publication:r.publication,source:r.source,manualOverride:r.manualOverride})),configured:false,connection:{ready:false,sourceReady:false,webhookReady:false,botUsername:'synthetic_bot'}});
      }
      if(u.searchParams.has('note')){
        const item=syntheticDailyRecords.get(u.searchParams.get('note'));
        return item?.publication==='daily'?Response.json({ok:true,item}):Response.json({error:'not_found'},{status:404});
      }
      const visible=records.filter(r=>r.publication==='daily').sort((a,b)=>b.publishedAt-a.publishedAt),offset=Number(u.searchParams.get('offset')||0);
      return Response.json({ok:true,items:visible.slice(offset,offset+3).map(r=>({id:r.id,title:r.title,excerpt:r.body.replace(/\\{\\{foto:\\d+\\}\\}/g,''),publishedAt:r.publishedAt,photoUrl:r.photos?.[0]?.url||''})),hasMore:offset+3<visible.length});
    };
    async function siteFetch(url,opts={}){if(/view=(?:telegram-inbox|daily-notes)/.test(String(url)))return window.fetch(url,opts);if(opts.method==='POST'){const b=JSON.parse(opts.body);window.syntheticWrites.push(b);return window.syntheticFail?Response.json({error:'failed'},{status:500}):Response.json({ok:true,trader:b.trader})} return Response.json({ok:true,data:channelsData})}
  `;
  const init = `
    channelsLoaded=true;
    channelsData={traders:{teacher:{id:'teacher',name:'Eğitmen · Yerel Test',owner:'admin@test.dev',seeded:true,sections:{paid:[{id:'obo',title:'OBO – TOBO',videos:[{id:'lesson',title:'Oluşum, teyit ve trickler',type:'video',url:${JSON.stringify(role !== 'reader' ? 'https://youtu.be/abcdefghijk' : '')},access:'paid',plans:['video'],locked:${role === 'reader'},body:${JSON.stringify(role !== 'reader' ? '## Formasyonu nasıl okuyoruz?\nBaş ve omuzları ayır; boyun çizgisi kapanışını bekle.\n{{foto:1}}' : '')},tricks:${JSON.stringify(role !== 'reader' ? '- Kırılım öncesinde kesinleşmiş formasyon sayma.\n- Retestte tepkiyi izle.' : '')},photos:${role !== 'reader' ? "[{url:'http://127.0.0.1:4319/example.svg',caption:'Boyun çizgisi — sentetik örnek'}]" : '[]'},vids:[]}]}]},secMeta:[{id:'paid',title:'Ücretli Teknik Eğitim',access:'paid',plans:['video']}]}},order:['teacher']};
    ${authCallback}
    bindChannelsPage(); chSec='paid';
    ${role === 'reader' ? "channelOpen='teacher';" : ''}
    showPage(${role === 'admin' ? "'edustudio'" : "'egitim'"}); ${role === 'reader' ? "openCourse('teacher','paid');" : ''}
    document.body.dataset.fixtureRole=${JSON.stringify(role)};
  `;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Alfa Edu · yerel sentetik test</title><style>${style}\nbody{padding:24px;max-width:1550px;margin:auto}.fixture-note{padding:12px;border:1px dashed #888;margin-bottom:20px}</style></head><body><p class="fixture-note">YEREL SENTETİK TEST · Gerçek hesap / kayıt / ödeme yok · ${role}</p>${home}${fragment}<script>${bootstrap}\n${code}\n${init}</script></body></html>`);
}).listen(4319, '127.0.0.1', () => console.log('Synthetic Edu preview: http://127.0.0.1:4319/?role=admin'));
