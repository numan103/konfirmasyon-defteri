import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const arg = k => process.argv.find(s => s.startsWith(`--${k}=`))?.slice(k.length + 3);
const { chromium } = await import(pathToFileURL(path.resolve(arg('playwright'))));
const browser = await chromium.launch({ executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe', headless:true });
try {
  const page = await browser.newPage({ viewport:{ width:1440,height:1000 } });
  const errors = [], requests = [];
  if (arg('debug')) {
    page.on('console',message => { if (message.type() === 'error') console.error('CONSOLE',message.text()); });
    page.on('requestfailed',request => console.error('FAILED',request.url(),request.failure()?.errorText));
  }
  page.on('pageerror', error => errors.push(error.stack || error.message));
  const stamp = day => Date.parse(day + 'T12:00:00+03:00') / 1000;
  const records = [
    { id:'mentortrade_' + 'a'.repeat(64), coin:'GOLD', r:2.3, date:stamp('2026-11-18'), text:'PRIVATE_DESCRIPTION', imageCount:1, category:'result' },
    { id:'mentortrade_' + 'b'.repeat(64), coin:'BTC', r:-1, date:stamp('2026-11-19'), text:'PRIVATE_SECOND', imageCount:0, category:'result' },
    { id:'mentortrade_' + 'c'.repeat(64), coin:'ETH', r:0.5, date:stamp('2026-10-20'), text:'OLD_HISTORY', imageCount:0, category:'result' }
  ];
  await page.route('**/api/**', route => {
    const req = route.request(), url = new URL(req.url()), q = url.searchParams;
    requests.push({url:req.url(),method:req.method(),frame:req.frame() === page.mainFrame() ? 'parent' : 'preview'});
    if (q.get('mentorTrades') === '1') {
      if (q.has('image')) return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF1sAAAAASUVORK5CYII=','base64')});
      if (q.get('summary') === '1') return route.fulfill({json:{ok:true,summary:{count:3,netR:1.8,wins:2,losses:1,flat:0,series:[
        {day:'2026-10-20',cumulativeR:0.5},{day:'2026-11-18',cumulativeR:2.8},{day:'2026-11-19',cumulativeR:1.8}],from:'2026-10-20',to:'2026-11-19'}}});
      return route.fulfill({json:{ok:true,access:'premium',records,more:false,counts:{all:3,result:3},summary:{count:3,netR:1.8,wins:2,losses:1,flat:0,series:[]}}});
    }
    if (url.pathname === '/api/access') return route.fulfill({json:{ok:true,admin:false,tier:'free'}});
    if (url.pathname === '/api/edu-shared' && q.get('kind') === 'youtube')
      return route.fulfill({json:{ok:true,video:{id:'MOKNqsj6WfU',title:'Güvenli video önizlemesi',publishedAt:'2026-11-10T10:00:00Z'}}});
    if (url.pathname === '/api/edu-shared' && q.get('kind') === 'landing')
      return route.fulfill({json:{ok:true,channel:{trades:{latest:[{id:'channel-1',date:new Date().toISOString(),title:'GOLD +2.3R sonuç',coin:'GOLD'}]},biases:{latest:[]}},status:{channel:'ok'}}});
    if (url.pathname === '/api/edu-shared' && q.get('kind') === 'news')
      return route.fulfill({json:{ok:true,data:{issueNo:1,weekLabel:'1 Kasım',rosterVer:2,authorsSeeded:true,authors:[{id:'a1',name:'Trader Ahmet',specialty:'BTC & Gold',photo:''}],entries:[
        {id:'n1',title:'Haftalık HTF Bias',body:'BTC için haftalık HTF bias bullish.',type:'',relId:'',result:'',authorId:'a1',category:'Teknik Analiz',sourceLink:'https://t.me/alfakasim/6/946',publishedAt:'2026-11-19T09:00:00.000Z',images:['/api/tg?magPhoto=tech_chart_file_id_456'],photoIds:['tech_chart_file_id_456']},
        {id:'n2',title:'Makro Analiz',body:'DXY ve altın tarafında risk iştahı zayıf.',type:'',relId:'',result:'',authorId:'a1',category:'Haber',sourceLink:'https://t.me/haberler/501',publishedAt:'2026-11-19T08:00:00.000Z',images:['/api/tg?magPhoto=news_photo_file_id_123'],photoIds:['news_photo_file_id_123']}
      ]}}});
    if (url.pathname === '/api/edu-shared') return route.fulfill({json:{ok:true,data:null,episode:null,channels:{},status:{channel:'ok'},channel:{trades:{latest:[]},biases:{latest:[]}}}});
    return route.fulfill({json:{ok:true,rows:[],entries:[],applications:[]}});
  });
  await page.goto(arg('url') || 'http://127.0.0.1:4187');
  await page.waitForSelector('#admin-view-switch',{state:'attached'});
  assert.equal(await page.locator('#admin-view-switch').isVisible(),false);
  await page.evaluate(() => {
    AUTH.user = {id:'real-admin-fixture',email:ADMIN_EMAIL}; SITE.admin = true; SITE.tier = 'admin';
    localStorage.setItem('preview-parent-sentinel','do-not-change');
    document.body.classList.remove('landed'); document.getElementById('landing').classList.remove('open'); showPage('home',true);
  });
  const bar = page.locator('#admin-view-switch');
  await bar.waitFor({state:'visible'});
  for (const label of ['Giriş sayfası','Yeni kayıt','Premium üye','Yönetici']) assert.equal(await bar.getByRole('button',{name:label,exact:true}).count(),1);
  assert.equal((await bar.locator('[data-preview-role="free"]').innerText()).trim(),'＋');
  assert.equal(await bar.evaluate(n => n.getBoundingClientRect().height <= 36),true);
  await bar.getByRole('button',{name:'Yeni kayıt',exact:true}).click();
  const getFrame = async () => (await page.locator('#admin-preview-frame').elementHandle()).contentFrame();
  let preview = await getFrame();
  await preview.waitForFunction(() => typeof SITE !== 'undefined' && SITE.loaded && !!document.getElementById('user-name').textContent);
  assert.equal(await page.locator('#admin-preview-frame').getAttribute('sandbox'),'allow-scripts');
  assert.equal(await preview.evaluate(() => SITE.tier), 'free');
  assert.equal(await preview.evaluate(() => document.documentElement.getAttribute('data-theme')),'light');
  assert.equal(await preview.evaluate(() => localStorage.getItem('preview-parent-sentinel')),null);
  await preview.locator('#home-results-slot > #home-results-panel .mentor-evaluation').waitFor();
  const evaluation = await preview.locator('#home-results-slot > #home-results-panel .mentor-evaluation').innerText();
  assert.match(evaluation,/1 KASIM/);
  assert.match(evaluation,/GOLD/);
  assert.match(evaluation,/2,3R/);
  assert.doesNotMatch(evaluation,/ETH/,'October result stays out of the November cumulative view');
  await preview.locator('.hc2-row .hc2-r.pos').first().waitFor();
  // Actual navigation handlers, not static DOM swaps controlled by the parent.
  await preview.locator('#home-quick a[href="?page=calc"]').click();
  await preview.waitForFunction(() => document.body.dataset.page === 'calc');
  await preview.locator('#tab-alfatrading').click();
  await preview.locator('.mentor-trade h3').first().waitFor();
  assert.equal(await preview.locator('.mentor-trades').isVisible(),true,'new members still get the transaction flow');
  assert.doesNotMatch(await preview.locator('.mentor-trades').innerText(),/PRIVATE_DESCRIPTION/);
  assert.equal(await preview.locator('.mentor-trade img').count(),0);
  assert.equal(await preview.evaluate(() => siteCanOpen('egitim')),false);
  assert.equal(await preview.evaluate(() => siteCanOpen('alfacharts')),false);
  assert.equal(await preview.evaluate(() => siteCanOpen('news')),true);
  await preview.evaluate(() => showPage('home'));
  await preview.locator('#hmr-stage .mag-page').first().waitFor();
  assert.equal(await preview.locator('#mag-tools:visible').count(),0,'embedded home flipbook stays read-only in preview');
  assert.equal(await preview.evaluate(() => document.querySelectorAll('#hmr-stage .mag-cover3').length),1,'preview embedded flipbook has a real cover');
  assert.equal(await preview.evaluate(() => document.querySelectorAll('#hmr-stage input, #hmr-stage textarea').length),0,'preview embedded flipbook has no editor fields');
  await preview.locator('#home-magazine-link').click();
  await preview.waitForFunction(() => document.body.dataset.page === 'news');
  await preview.locator('#news-weekly-list .nw-card').first().waitFor();
  assert.equal(await preview.locator('#mag-tools:visible').count(),0,'preview roles read the weekly magazine without editor tools');
  assert.equal(requests.some(r => /telesco|telegram\.org|telegram\.me/.test(r.url)),false,'magazine never hotlinks Telegram CDN');
  const photoSrcs = await preview.evaluate(() => [...document.querySelectorAll('#hmr-stage .e-img')].map(img => img.getAttribute('src')));
  assert.ok(photoSrcs.length >= 1 && photoSrcs.every(src => src.startsWith('/api/tg?magPhoto=')),'magazine photos use only the same-origin allowlisted proxy');
  await preview.evaluate(() => showPage('home'));
  const start = requests.length;
  assert.equal(await preview.evaluate(async () => (await fetch('/api/analytics?education=1',{method:'POST',body:'{}'})).status),403);
  assert.equal(await preview.evaluate(async () => (await fetch('/api/access?op=list')).status),403);
  assert.equal(await preview.evaluate(async () => (await fetch('/api/analytics?education=1&mine=1')).json()).then(x => x.applications.length),0);
  assert.equal(requests.length,start,'writes and personal/admin reads never leave the broker');
  await bar.getByRole('button',{name:'Premium üye',exact:true}).click();
  preview = await getFrame();
  await preview.waitForFunction(() => typeof SITE !== 'undefined' && SITE.tier === 'ref' && !!document.getElementById('user-name').textContent);
  assert.equal(await preview.evaluate(() => document.documentElement.getAttribute('data-theme')),'dark');
  await preview.evaluate(() => showPage('home'));
  await preview.locator('#home-results-bottom > #home-results-panel .mentor-evaluation').waitFor();
  await preview.locator('#tab-alfatrading').click();
  await preview.locator('.mentor-trades').waitFor({state:'attached'});
  await preview.locator('.mentor-trade-text').filter({hasText:'PRIVATE_DESCRIPTION'}).waitFor();
  await preview.locator('.mentor-trade img').first().waitFor();
  assert.equal(await preview.locator('.mentor-trades-head:visible').count(),0,'premium preview hides the detailed flow header and pager');
  assert.equal(await preview.locator('.mentor-trades-filters:visible').count(),0,'premium preview hides the detailed flow controls');
  assert.equal(await preview.evaluate(() => siteCanOpen('egitim')),true);
  assert.equal(await preview.evaluate(() => siteCanOpen('trading')),false);
  // A non-home page stays navigable across role changes, and catalog JS renders.
  await preview.locator('#tab-eduplans').click();
  await preview.locator('article[data-plan="video"]').waitFor();
  await preview.locator('.eduplan-cover').first().scrollIntoViewIfNeeded();
  await preview.waitForFunction(() => [...document.querySelectorAll('.eduplan-cover img')].every(img => img.complete && img.naturalWidth > 0));
  await preview.locator('article[data-plan="video"] button').first().click();
  await preview.locator('dialog.edu-checkout').waitFor();
  await preview.getByRole('button',{name:'Kapat',exact:true}).last().click();
  await preview.evaluate(() => localStorage.setItem('preview-only','temporary'));
  const realState = await page.evaluate(() => ({id:AUTH.user.id,tier:SITE.tier,admin:SITE.admin,sentinel:localStorage.getItem('preview-parent-sentinel'),leak:localStorage.getItem('preview-only')}));
  assert.deepEqual(realState,{id:'real-admin-fixture',tier:'admin',admin:true,sentinel:'do-not-change',leak:null});
  if (arg('screenshot')) await page.screenshot({path:path.resolve(arg('screenshot'))});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await bar.evaluate(n => n.getBoundingClientRect().bottom <= document.getElementById('admin-preview-frame').getBoundingClientRect().top + 1),true);
  await preview.evaluate(() => showPage('home'));
  await preview.locator('.member-video-frame .preview-video-poster').waitFor();
  assert.equal(await preview.locator('.member-video-frame iframe').count(),0,'opaque frame never boots the YouTube player');
  await preview.locator('.preview-video-poster').scrollIntoViewIfNeeded();
  await preview.locator('.preview-video-poster').click();
  await page.locator('.admin-preview-video-layer iframe').waitFor();
  assert.match(await page.locator('.admin-preview-video-layer iframe').getAttribute('src'),/youtube-nocookie\.com\/embed\/MOKNqsj6WfU/);
  await page.getByRole('button',{name:'Videoyu kapat'}).click();
  assert.equal(await page.locator('.admin-preview-video-layer').count(),0);
  await preview.locator('#nav-mobile-btn').click();
  await preview.locator('#mnav-alfatrading').click();
  await preview.waitForFunction(() => document.body.dataset.page === 'alfatrading' && !document.getElementById('nav-mobile').classList.contains('open'));
  await preview.evaluate(() => history.back());
  await preview.waitForFunction(() => document.body.dataset.page === 'home');
  await bar.getByRole('button',{name:'Giriş sayfası',exact:true}).click();
  preview = await getFrame();
  await preview.locator('#landing.open').waitFor();
  assert.equal(await preview.evaluate(() => document.documentElement.getAttribute('data-theme')),'light');
  await preview.locator('#hero-register').click();
  await preview.locator('#auth-gate.open').waitFor();
  assert.equal(await preview.locator('#au-submit').innerText(),'Kayıt ol');
  await bar.getByRole('button',{name:'Yönetici',exact:true}).click();
  assert.equal(await page.locator('#admin-preview-frame').count(),0);
  assert.equal(await page.evaluate(() => AUTH.user.id),'real-admin-fixture');
  const apiReads = requests.slice(start);
  assert.equal(apiReads.every(r => r.method === 'GET'),true);
  assert.equal(apiReads.filter(r => !r.url.includes('/api/tg?magPhoto=')).every(r => r.frame === 'parent'),true,'preview cannot send native API requests');
  assert.equal(apiReads.filter(r => r.url.includes('/api/tg?magPhoto=')).every(r => r.frame === 'preview'),true,'magazine proxy images are same-origin GETs');
  await bar.getByRole('button',{name:'Yeni kayıt',exact:true}).click();
  await page.evaluate(() => { AUTH.user = null; SITE.admin = false; document.body.classList.add('landed'); });
  await page.waitForFunction(() => !document.getElementById('admin-preview-frame'));
  assert.equal(await bar.isVisible(),false);
  const appErrors = errors.filter(error => !/youtube\.com|ytembeds|Uncaught undefined|writeEmbed/.test(error));
  assert.deepEqual(appErrors,[]);
  console.log(JSON.stringify({passed:true,liveNavigation:true,liveModules:true,isolatedStorage:true,noServerWrites:true,roles:4,lightLandingAndNewMember:true,lightweightSwitch:true,videoPoster:true,novemberEvaluation:true,mobile:true,appErrors,externalMediaWarnings:errors.length - appErrors.length}));
} finally { await browser.close(); }
