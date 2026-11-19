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
  await page.route('**/api/**', route => {
    const req = route.request(), url = new URL(req.url());
    requests.push({url:req.url(),method:req.method(),frame:req.frame() === page.mainFrame() ? 'parent' : 'preview'});
    if (url.searchParams.get('mentorTrades') === '1') {
      if (url.searchParams.has('image')) return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF1sAAAAASUVORK5CYII=','base64')});
      return route.fulfill({json:{ok:true,access:'premium',records:[{id:'mentortrade_'+'a'.repeat(64),coin:'GOLD',r:2,date:100,text:'PRIVATE_DESCRIPTION',imageCount:1}],more:false,counts:{all:1},summary:{points:[]}}});
    }
    if (url.pathname === '/api/access') return route.fulfill({json:{ok:true,admin:false,tier:'free'}});
    if (url.pathname === '/api/edu-shared') return route.fulfill({json:{ok:true,data:null,episode:null,channels:{},status:{channel:'ok'},channel:{results:{latest:[]}}}});
    return route.fulfill({json:{ok:true,rows:[],entries:[],applications:[]}});
  });
  await page.goto(arg('url') || 'http://127.0.0.1:4186');
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
  await bar.getByRole('button',{name:'Yeni kayıt',exact:true}).click();
  const getFrame = async () => (await page.locator('#admin-preview-frame').elementHandle()).contentFrame();
  let preview = await getFrame();
  await preview.waitForFunction(() => typeof SITE !== 'undefined' && SITE.loaded && !!document.getElementById('user-name').textContent);
  assert.equal(await page.locator('#admin-preview-frame').getAttribute('sandbox'),'allow-scripts');
  assert.equal(await preview.evaluate(() => SITE.tier), 'free');
  assert.equal(await preview.evaluate(() => localStorage.getItem('preview-parent-sentinel')),null);
  // Actual navigation handlers, not static DOM swaps controlled by the parent.
  await preview.locator('#home-quick a[href="?page=calc"]').click();
  await preview.waitForFunction(() => document.body.dataset.page === 'calc');
  await preview.locator('#tab-alfatrading').click();
  await preview.locator('.mentor-trade h3').first().waitFor();
  assert.doesNotMatch(await preview.locator('.mentor-trades').innerText(),/PRIVATE_DESCRIPTION/);
  assert.equal(await preview.locator('.mentor-trade img').count(),0);
  assert.equal(await preview.evaluate(() => siteCanOpen('egitim')),false);
  assert.equal(await preview.evaluate(() => siteCanOpen('alfacharts')),false);
  const start = requests.length;
  assert.equal(await preview.evaluate(async () => (await fetch('/api/analytics?education=1',{method:'POST',body:'{}'})).status),403);
  assert.equal(await preview.evaluate(async () => (await fetch('/api/access?op=list')).status),403);
  assert.equal(await preview.evaluate(async () => (await fetch('/api/analytics?education=1&mine=1')).json()).then(x => x.applications.length),0);
  assert.equal(requests.length,start,'writes and personal/admin reads never leave the broker');
  await bar.getByRole('button',{name:'Premium üye',exact:true}).click();
  preview = await getFrame();
  await preview.waitForFunction(() => typeof SITE !== 'undefined' && SITE.tier === 'ref' && !!document.getElementById('user-name').textContent);
  await preview.locator('#tab-alfatrading').click();
  await preview.locator('.mentor-trade-text').filter({hasText:'PRIVATE_DESCRIPTION'}).waitFor();
  await preview.locator('.mentor-trade img').first().waitFor();
  assert.equal(await preview.evaluate(() => siteCanOpen('egitim')),true);
  assert.equal(await preview.evaluate(() => siteCanOpen('trading')),false);
  // A non-home page stays navigable across role changes, and catalog JS renders.
  await preview.locator('.drop-btn[data-i18n="app.edu"]').hover();
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
  await preview.locator('#nav-mobile-btn').click();
  await preview.locator('#mnav-alfatrading').click();
  await preview.waitForFunction(() => document.body.dataset.page === 'alfatrading' && !document.getElementById('nav-mobile').classList.contains('open'));
  await preview.evaluate(() => history.back());
  await preview.waitForFunction(() => document.body.dataset.page === 'eduplans');
  await bar.getByRole('button',{name:'Giriş sayfası',exact:true}).click();
  preview = await getFrame();
  await preview.locator('#landing.open').waitFor();
  await preview.locator('#hero-register').click();
  await preview.locator('#auth-gate.open').waitFor();
  assert.equal(await preview.locator('#au-submit').innerText(),'Kayıt ol');
  await bar.getByRole('button',{name:'Yönetici',exact:true}).click();
  assert.equal(await page.locator('#admin-preview-frame').count(),0);
  assert.equal(await page.evaluate(() => AUTH.user.id),'real-admin-fixture');
  const apiReads = requests.slice(start);
  assert.equal(apiReads.every(r => r.method === 'GET'),true);
  assert.equal(requests.every(r => r.frame === 'parent'),true,'preview cannot send native API requests');
  await bar.getByRole('button',{name:'Yeni kayıt',exact:true}).click();
  await page.evaluate(() => { AUTH.user = null; SITE.admin = false; document.body.classList.add('landed'); });
  await page.waitForFunction(() => !document.getElementById('admin-preview-frame'));
  assert.equal(await bar.isVisible(),false);
  const appErrors = errors.filter(error => !/youtube\.com|ytembeds|Uncaught undefined/.test(error));
  assert.deepEqual(appErrors,[]);
  console.log(JSON.stringify({passed:true,liveNavigation:true,liveModules:true,isolatedStorage:true,noServerWrites:true,roles:4,mobile:true,appErrors,externalMediaWarnings:errors.length - appErrors.length}));
} finally { await browser.close(); }
