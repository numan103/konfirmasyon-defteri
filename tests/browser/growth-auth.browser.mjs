import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const arg = key => process.argv.find(v => v.startsWith('--'+key+'='))?.slice(key.length+3);
const {chromium} = await import(pathToFileURL(path.resolve(arg('playwright'))));
const root = fileURLToPath(new URL('../../',import.meta.url));
const server = http.createServer((req,res)=>{
  const p = new URL(req.url,'http://local').pathname;
  const file = path.resolve(root,'.'+(p==='/'?'/index.html':p));
  if (!file.startsWith(root)||!fs.existsSync(file)) {res.writeHead(404);return res.end();}
  const ext=path.extname(file);
  res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg'})[ext]||'text/plain');
  res.end(fs.readFileSync(file));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=arg('url')||'http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.route(/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js/,route=>route.fulfill({contentType:'text/javascript',body:`
    window.__authCalls=[];window.__authCase='verify';
    window.supabase={createClient(){return {auth:{
      onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}}},
      async getSession(){return {data:{session:window.__hasSession?{user:{id:'test-user'}}:null}}},
      async updateUser(){window.__authCalls.push({type:'password'});return {data:{user:{id:'test-user'}}}},
      async getUser(){return {data:{user:{id:'test-user'}}}},
      async signUp(args){window.__authCalls.push({type:'signup',redirect:args.options.emailRedirectTo});
        if(window.__authCase==='rate')return {error:{message:'Email rate limit exceeded'}};
        return {data:{user:{id:'test-user'},session:window.__authCase==='session'?{access_token:'test'}:null}}},
      async resend(args){window.__authCalls.push({type:'resend',redirect:args.options.emailRedirectTo});return {}},
      async signInWithPassword(){window.__authCalls.push({type:'login'});return {error:{message:'Email not confirmed'}}},
      async resetPasswordForEmail(){window.__authCalls.push({type:'reset'});return {}},
    },async rpc(){return {data:[],error:null}},from(){const q=new Proxy({},{get(_,name){if(name==='then')return fn=>Promise.resolve({data:[],error:null}).then(fn);return ()=>q;}});return q}}}};
  `}));
  await page.route('**/api/**',route=>route.fulfill({json:{ok:true,admin:false,tier:'free',status:'none',data:null,summary:{count:0},orders:[],posts:[],reviews:[],applications:[]}}));
  // Safety net: no real auth writes or email delivery requests can leave this test.
  await page.route('**/auth/v1/**',route=>route.fulfill({status:401,json:{error:'test_isolation'}}));
  await page.goto(base);
  await page.waitForFunction(()=>typeof AUTH!=='undefined'&&AUTH.client&&document.getElementById('landing').classList.contains('open'));
  await page.evaluate(()=>{onAuthed=async user=>{window.__authenticated=user.id;hideGate();};});
  assert.equal(await page.locator('.lp-pricing').count(),0);
  assert.equal(await page.locator('.auth-pricing').count(),0);
  for(const name of ['Alfa Dergi','Alfa Influencer','Alfa Edu'])assert.equal(await page.locator('.growth-features').getByRole('heading',{name,exact:true}).count(),1);
  assert.ok(await page.locator('#hero-register').evaluate(n=>n.getBoundingClientRect().top<innerHeight),'registration is visible without scrolling');
  if(arg('screenshot')) await page.screenshot({path:arg('screenshot')});
  await page.locator('[data-growth-register]').first().click();
  await page.locator('#auth-gate.open').waitFor();
  assert.equal(await page.locator('#f-name').isVisible(),true);
  assert.equal(await page.locator('#au-name').evaluate(n=>n===document.activeElement),true,'register focuses first visible field');
  if(arg('auth-screenshot')) await page.screenshot({path:arg('auth-screenshot')});
  await page.locator('#au-name').fill('Test Kullanıcı');
  await page.locator('#au-email').fill('fixture@example.test');
  await page.locator('#au-pass').fill('test-password-123');
  await page.locator('#au-submit').click();
  await page.locator('#auth-verify:not(.hidden)').waitFor();
  assert.match(await page.locator('#au-msg').textContent(),/Kayıt isteğin alındı/);
  assert.equal(await page.locator('#auth-verify-email').textContent(),'fixture@example.test');
  assert.equal(await page.locator('#au-pass').inputValue(),'');
  assert.equal(await page.locator('#au-submit').isVisible(),false);
  await page.locator('#resend-verify').click();
  await page.locator('#resend-verify').click();
  assert.equal(await page.evaluate(()=>window.__authCalls.filter(x=>x.type==='resend').length),1,'resend cooldown prevents duplicate delivery requests');
  assert.equal(await page.evaluate(()=>window.__authCalls[0].redirect),new URL(base).origin+'/');
  await page.locator('#back-login').click();
  await page.locator('#au-pass').fill('test-password-123');
  await page.locator('#au-submit').click();
  await page.getByText('E-postan henüz onaylanmamış. Gelen kutunu kontrol et.',{exact:true}).waitFor();
  assert.equal(await page.locator('#resend-verify').isVisible(),true);
  await page.locator('#forgot-link').click();
  assert.equal(await page.locator('#f-pass').isVisible(),false);
  await page.locator('#au-submit').click();
  await page.getByText('Sıfırlama bağlantısı e-postana gönderildi. Gelen kutunu (ve spam) kontrol et.',{exact:true}).waitFor();
  await page.locator('#au-submit').click();
  assert.equal(await page.evaluate(()=>window.__authCalls.filter(x=>x.type==='reset').length),1,'reset requests have a cooldown');
  await page.locator('#back-login').click();
  await page.locator('#tab-register').click();
  await page.evaluate(()=>window.__authCase='rate');
  await page.locator('#au-pass').fill('test-password-123');
  await page.locator('#au-submit').click();
  await page.getByText('E-posta servisinin gönderim sınırına ulaşıldı.',{exact:false}).waitFor();
  assert.equal(await page.locator('#au-submit').isEnabled(),true);
  await page.evaluate(()=>window.__authCase='session');
  await page.locator('#au-submit').click();
  await page.waitForFunction(()=>window.__authenticated==='test-user');
  assert.equal(await page.locator('#auth-gate').evaluate(n=>n.classList.contains('open')),false);
  await page.locator('#hero-login').click();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#auth-gate').evaluate(n=>n.classList.contains('open')),false);
  await page.setViewportSize({width:390,height:844});
  await page.locator('#hero-register').click();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const box=await page.locator('.auth-box').boundingBox();
  assert.ok(box.width<=390&&box.x>=0);
  await page.locator('#auth-close').click();
  await page.evaluate(()=>{
    AUTH.user={id:'test-user'};window.__hasSession=true;hideLanding();
    document.getElementById('user-badge').classList.remove('hidden');
    window.scrollTo(0,0);
  });
  await page.locator('#btn-password').click();
  await page.getByText('Açık oturumundan şifreni belirleyebilirsin. Yeni e-posta gönderilmeyecek.',{exact:true}).waitFor();
  assert.equal(await page.locator('#f-email').isVisible(),false);
  await page.locator('#au-pass').fill('new-test-password-123');
  await page.locator('#au-submit').click();
  await page.waitForFunction(()=>!document.getElementById('auth-gate').classList.contains('open'));
  assert.equal(await page.evaluate(()=>window.__authCalls.filter(x=>x.type==='password').length),1);
  await page.goto(base+'/?auth-test=expired#error=access_denied&error_code=otp_expired&error_description=expired');
  await page.getByText('Doğrulama bağlantısı geçersiz veya süresi dolmuş olabilir. E-postanı yazıp yeni bir bağlantı iste.',{exact:true}).waitFor();
  assert.equal(await page.locator('#resend-verify').isVisible(),true);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,registrationCTA:true,currentFeatures:true,compactAuth:true,verificationFeedback:true,resend:true,resendCooldown:true,unconfirmedLogin:true,passwordReset:true,recoveryCooldown:true,emailQuotaFeedback:true,authenticatedPasswordChange:true,expiredLink:true,mobile:true,productionSignups:false,productionEmails:false}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
