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
  const role = u.searchParams.get('role') === 'reader' ? 'reader' : 'admin';
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const style = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
  const fragment = html.slice(html.indexOf('<div id="page-edustudio"'), html.indexOf('<div id="page-strategies"'));
  const code = html.slice(html.indexOf("const EGITIM_KEY ="), html.indexOf('function panoRoomId()'));
  const authCallback = html.slice(html.indexOf('AUTH.client.auth.onAuthStateChange((event, session)'), html.indexOf("  $('auth-form').addEventListener"));
  const bootstrap = `
    const AUTH={user:{id:'local-synthetic',email:${JSON.stringify(role === 'admin' ? 'admin@test.dev' : 'reader@test.dev')}},client:{auth:{onAuthStateChange(fn){window.syntheticAuthEvent=fn}}}}, ADMIN_EMAIL='admin@test.dev', SITE={admin:${role === 'admin'},tier:'free'};
    let currentPage='egitim'; const lang='tr'; const LANG='tr';
    function siteIsAdmin(){return SITE.admin}
    function magIsAdmin(){return SITE.admin}
    function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
    function showPage(name){chDraftCapture();chStudioNavigate(name);currentPage=name;document.querySelectorAll('[id^="page-"]').forEach(e=>e.classList.toggle('hidden',e.id!=='page-'+name));if(name==='edustudio')renderEduStudio();if(name==='egitim')renderEgitim()}
    function mountEduFeedback(){}
    window.syntheticFail=false; window.syntheticWrites=[];
    async function siteFetch(url,opts={}){if(String(url).includes('telegram-inbox'))return Response.json({ok:true,items:[],configured:false});if(opts.method==='POST'){const b=JSON.parse(opts.body);window.syntheticWrites.push(b);return window.syntheticFail?Response.json({error:'failed'},{status:500}):Response.json({ok:true,trader:b.trader})} return Response.json({ok:true,data:channelsData})}
  `;
  const init = `
    channelsLoaded=true;
    channelsData={traders:{teacher:{id:'teacher',name:'Eğitmen · Yerel Test',owner:'admin@test.dev',seeded:true,sections:{paid:[{id:'obo',title:'OBO – TOBO',videos:[{id:'lesson',title:'Oluşum, teyit ve trickler',type:'video',url:${JSON.stringify(role === 'admin' ? 'https://youtu.be/abcdefghijk' : '')},access:'paid',plans:['video'],locked:${role === 'reader'},body:${JSON.stringify(role === 'admin' ? '## Formasyonu nasıl okuyoruz?\nBaş ve omuzları ayır; boyun çizgisi kapanışını bekle.\n{{foto:1}}' : '')},tricks:${JSON.stringify(role === 'admin' ? '- Kırılım öncesinde kesinleşmiş formasyon sayma.\n- Retestte tepkiyi izle.' : '')},photos:${role === 'admin' ? "[{url:'http://127.0.0.1:4319/example.svg',caption:'Boyun çizgisi — sentetik örnek'}]" : '[]'},vids:[]}]}]},secMeta:[{id:'paid',title:'Ücretli Teknik Eğitim',access:'paid',plans:['video']}]}},order:['teacher']};
    ${authCallback}
    bindChannelsPage(); channelOpen='teacher';chSec='paid';
    showPage(${role === 'admin' ? "'edustudio'" : "'egitim'"}); if(${role === 'reader'})openCourse('teacher','paid');
    document.body.dataset.fixtureRole=${JSON.stringify(role)};
  `;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Alfa Edu · yerel sentetik test</title><style>${style}\nbody{padding:24px;max-width:1550px;margin:auto}.fixture-note{padding:12px;border:1px dashed #888;margin-bottom:20px}</style></head><body><p class="fixture-note">YEREL SENTETİK TEST · Gerçek hesap / kayıt / ödeme yok · ${role}</p>${fragment}<script>${bootstrap}\n${code}\n${init}</script></body></html>`);
}).listen(4319, '127.0.0.1', () => console.log('Synthetic Edu preview: http://127.0.0.1:4319/?role=admin'));
