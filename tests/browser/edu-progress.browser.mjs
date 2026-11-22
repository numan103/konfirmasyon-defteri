// Synthetic B1 browser fixture: server-backed progress isolation + certificate print.
// Never connects to production.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const arg = key => process.argv.find(s => s.startsWith('--' + key + '='))?.slice(key.length + 3);
const { chromium } = await import(pathToFileURL(path.resolve(arg('playwright'))));
const root = path.resolve('.');

const mime = f => f.endsWith('.css') ? 'text/css' : f.endsWith('.mjs') ? 'text/javascript' : f.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8';
const read = f => fs.readFile(path.join(root, f));

const pageHtml = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<style>:root{--border:#444;--card:#222;--bg:#171717;--bg-1:#121212;--text:#eee;--text-2:#ccc;--text-3:#aaa;--pc:#aaf}body{background:var(--bg);color:var(--text);font:14px sans-serif;margin:0}*{box-sizing:border-box}</style>
<link rel="stylesheet" href="/assets/edu-learning-rewards.css">
<link rel="stylesheet" href="/assets/edu-certificate.css">
<script>window.AUTH={user:null};window.currentPage='egitim';window.ALFA_PREVIEW_CONFIG=null;window.siteIsAdmin=()=>false;window.eduCourses=()=>[];window.chItemLocked=()=>false;window.chProgKey=(c,s,t,v)=>[c,s,t,v].map(x=>encodeURIComponent(String(x||''))).join(':');window.chIsDone=()=>false;window.renderChannelView=()=>{};window.chToast=(m)=>{window.__toasts=(window.__toasts||[]);window.__toasts.push(String(m));};window.printCalls=0;window.print=()=>{window.printCalls++;};</script>
</head><body>
<div id="edu-learning-rewards"></div>
<script type="module" src="/assets/edu-progress.mjs"></script>
<script type="module" src="/assets/edu-certificate.mjs"></script>
<script type="module" src="/assets/edu-learning-rewards.mjs"></script>
</body></html>`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(pageHtml);
  }
  const file = url.pathname.replace(/^\/+/, '');
  if (/^assets\/(edu-progress|edu-certificate|edu-learning-rewards)\.(mjs|css)$/.test(file)) {
    try {
      const buf = await read(file);
      res.writeHead(200, { 'content-type': mime(file) });
      return res.end(buf);
    } catch { /* fallthrough */ }
  }
  res.writeHead(404); res.end('not found');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;

const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e && e.message || e)));

  // Per-user in-memory progress stores, keyed by user id
  const stores = {};
  const certs = {};
  const mkStore = (uid) => (stores[uid] ||= { marks: {}, revision: 'r0' });
  const mkCerts = (uid) => (certs[uid] ||= {});
  const courseKey = 'ch1:sec1';
  const itemKey = [ 'ch1', 'sec1', 'top1', 'v1' ].map(x => encodeURIComponent(x)).join(':');

  await page.route('**/api/edu-shared**', async route => {
    const req = route.request();
    const u = new URL(req.url());
    if (u.searchParams.get('kind') !== 'progress') return route.fulfill({ status: 404, json: { ok: false } });
    const auth = req.headers()['authorization'] || '';
    const uid = auth.includes('user-a') ? 'user-a' : auth.includes('user-b') ? 'user-b' : '';
    if (!uid) return route.fulfill({ status: 401, json: { ok: false, error: 'login_required' } });
    const store = mkStore(uid);
    const userCerts = mkCerts(uid);
    if (req.method() === 'GET') {
      return route.fulfill({ json: {
        ok: true, revision: store.revision,
        data: { v: 1, marks: store.marks },
        certificates: [{ course: courseKey, chId: 'ch1', secId: 'sec1', title: 'Bölüm 1', items: 1, eligible: !!store.marks[itemKey]?.d, serial: userCerts[courseKey]?.serial || null, issuedAt: userCerts[courseKey]?.issuedAt || null }]
      }});
    }
    const body = req.postDataJSON() || {};
    if (body.op === 'merge') {
      for (const m of (body.marks || [])) {
        if (m && m.k) store.marks[m.k] = { d: m.d ? 1 : 0, t: m.t || Date.now(), src: m.src || 'user' };
      }
      store.revision = 'r' + Date.now();
      return route.fulfill({ json: {
        ok: true, accepted: (body.marks || []).length, ignored: 0, revision: store.revision,
        data: { v: 1, marks: store.marks },
        certificates: [{ course: courseKey, chId: 'ch1', secId: 'sec1', title: 'Bölüm 1', items: 1, eligible: !!store.marks[itemKey]?.d, serial: userCerts[courseKey]?.serial || null, issuedAt: userCerts[courseKey]?.issuedAt || null }]
      }});
    }
    if (body.op === 'issueCertificate') {
      if (!store.marks[itemKey]?.d) return route.fulfill({ status: 409, json: { ok: false, error: 'course_incomplete' } });
      if (!userCerts[courseKey]) userCerts[courseKey] = { serial: 'ALFAEDU-' + uid.toUpperCase() + '-0001-0001-0001', name: uid === 'user-a' ? 'Kullanıcı A' : 'Kullanıcı B', courseTitle: 'Bölüm 1', instructor: 'Eğitmen', items: 1, completedAt: '2026-01-01T00:00:00.000Z', issuedAt: '2026-01-02T00:00:00.000Z', fingerprint: 'fp-' + uid };
      return route.fulfill({ json: { ok: true, certificate: { course: courseKey, ...userCerts[courseKey] } } });
    }
    return route.fulfill({ status: 400, json: { ok: false, error: 'invalid_operation' } });
  });

  await page.goto(base + '/', { waitUntil: 'load' });
  await page.waitForFunction(() => window.EduProgress && window.EduCertificate && window.EduLearningRewards);

  // Guest starts empty
  await page.evaluate(async () => { await window.EduProgress.boot('', 1); });
  assert.equal(await page.evaluate(() => window.EduProgress.get('ch1:sec1:top1:v1')), false);

  // User A boots, sets mark, sees it
  await page.evaluate(async () => {
    window.AUTH = { user: { id: 'user-a', email: 'a@test.dev' } };
    window.siteFetch = (url, opts = {}) => fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: 'Bearer user-a' } });
    await window.EduProgress.boot('user-a', 2);
  });
  await page.evaluate(() => window.EduProgress.set([ 'ch1','sec1','top1','v1' ].map(x=>encodeURIComponent(x)).join(':'), true));
  await page.waitForFunction(() => window.EduProgress.get(['ch1','sec1','top1','v1'].map(x=>encodeURIComponent(x)).join(':')) === true);
  await page.evaluate(() => window.EduProgress.flush && window.EduProgress.flush());

  // Switch to user B: must not see user A mark
  await page.evaluate(async () => {
    window.AUTH = { user: { id: 'user-b', email: 'b@test.dev' } };
    window.siteFetch = (url, opts = {}) => fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: 'Bearer user-b' } });
    await window.EduProgress.boot('user-b', 3);
  });
  await page.waitForFunction(() => window.EduProgress._state().loaded === true && window.EduProgress._state().userId === 'user-b');
  assert.equal(await page.evaluate(() => window.EduProgress.get(['ch1','sec1','top1','v1'].map(x=>encodeURIComponent(x)).join(':'))), false);

  // Switch back to user A: mark restored from server
  await page.evaluate(async () => {
    window.AUTH = { user: { id: 'user-a', email: 'a@test.dev' } };
    window.siteFetch = (url, opts = {}) => fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: 'Bearer user-a' } });
    await window.EduProgress.boot('user-a', 4);
  });
  await page.waitForFunction(() => window.EduProgress._state().loaded === true && window.EduProgress._state().userId === 'user-a');
  assert.equal(await page.evaluate(() => window.EduProgress.get(['ch1','sec1','top1','v1'].map(x=>encodeURIComponent(x)).join(':'))), true);

  // Certificate issue + print flow
  const cert = await page.evaluate(async () => {
    return await window.EduProgress.issueCertificate('ch1:sec1');
  });
  assert.equal(cert.serial, 'ALFAEDU-USER-A-0001-0001-0001');
  assert.equal(cert.courseTitle, 'Bölüm 1');

  await page.evaluate((c) => window.EduCertificate.show(c), cert);
  await page.locator('#edu-certificate-host .ec-sheet').waitFor({ state: 'visible' });
  assert.match(await page.locator('.ec-type').innerText(), /Tamamlama \/ Katılım Belgesi/);
  assert.match(await page.locator('.ec-name').innerText(), /Kullanıcı A/);
  assert.match(await page.locator('.ec-serial').innerText(), /ALFAEDU-USER-A-0001-0001-0001/);
  await page.locator('#ec-print').click();
  assert.equal(await page.evaluate(() => window.printCalls), 1);
  await page.locator('.ec-actions [data-ec-close="1"]').first().click();
  await page.waitForFunction(() => document.getElementById('edu-certificate-host')?.hidden === true);

  // Certificate should not bleed to user B view state
  await page.evaluate(async () => {
    window.AUTH = { user: { id: 'user-b', email: 'b@test.dev' } };
    window.siteFetch = (url, opts = {}) => fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: 'Bearer user-b' } });
    await window.EduProgress.boot('user-b', 5);
  });
  await page.waitForFunction(() => window.EduProgress._state().userId === 'user-b' && window.EduProgress._state().loaded === true);
  const bCerts = await page.evaluate(() => window.EduProgress.certificates());
  assert.equal(bCerts[0].serial, null);

  assert.deepEqual(errors, []);
  console.log('PASS edu-progress browser');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}