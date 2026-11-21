// Isolated synthetic STUDENT fixture. Never connects to production or Telegram.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const arg = key => process.argv.find(s => s.startsWith('--' + key + '='))?.slice(key.length + 3);
const { chromium } = await import(pathToFileURL(path.resolve(arg('playwright'))));
const root = path.resolve('.');
const NOTE = 'edutg_' + 'a'.repeat(64);
const pageHtml = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<style>:root{--border:#444;--card:#222;--bg:#171717;--text:#eee;--text-2:#ccc;--text-3:#aaa;--pc:#aaf;--red:#f88}body{background:var(--bg);color:var(--text);font:14px sans-serif;margin:15px}button{cursor:pointer}*{box-sizing:border-box}</style>
<link rel="stylesheet" href="/assets/daily-note-social.css"><link rel="stylesheet" href="/assets/edu-learning-rewards.css">
<script>var AUTH={user:{id:'student-fixture'}};window.siteFetch=fetch;window.openAuth=()=>window.loginOpened=true;</script></head>
<body><h1>SENTETİK ÖĞRENCİ TESTİ — canlı veri yok</h1><div class="daily-social" data-note-id="${NOTE}"></div>
<section id="rewards" class="edu-learning-rewards"></section>
<script type="module" src="/assets/daily-note-social.mjs"></script>
<script type="module">import {learningRewards} from '/assets/edu-learning-rewards.mjs';
window.EduLearningRewards.draw(document.getElementById('rewards'),{account:'student-fixture',admin:false,page:'egitim',courses:[{id:'course',items:Array.from({length:5},(_,i)=>({id:'lesson'+i,done:true,locked:false}))}]});</script>
</body></html>`;
const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://local').pathname;
  if (pathname === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end(pageHtml); }
  if (!/^\/assets\/[\w.-]+$/.test(pathname)) { res.statusCode = 404; return res.end(); }
  try { const data = await fs.readFile(path.join(root, pathname)); res.setHeader('Content-Type', pathname.endsWith('.css') ? 'text/css' : 'text/javascript'); res.end(data); }
  catch { res.statusCode = 404; res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [], likes = new Set(); let comments = [], writes = 0;
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', dialog => dialog.accept());
  await page.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    assert.equal(url.origin, origin, 'fixture must never contact outside services');
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const account = await page.evaluate(() => AUTH.user?.id || '');
    const body = req.method() === 'POST' ? req.postDataJSON() : null;
    if (body) {
      writes++;
      if (body.op === 'like') body.liked ? likes.add(account) : likes.delete(account);
      if (body.op === 'comment') comments.unshift({ id: 'test-comment', name: body.name || 'Öğrenci', text: body.text, createdAt: new Date().toISOString(), owner: account });
      if (body.op === 'remove') comments = comments.filter(c => c.id !== body.id);
    }
    await route.fulfill({ json: { ok: true, social: true, likes: likes.size, liked: likes.has(account), commentCount: comments.length,
      hasMore: false, comments: comments.map(c => ({ id: c.id, name: c.name, text: c.text, createdAt: c.createdAt, mine: c.owner === account, removable: c.owner === account })) } });
  });
  await page.goto(origin);
  await page.getByRole('button', { name: '♡ Beğen · 0', exact: true }).click();
  await page.getByRole('button', { name: '♥ Beğendin · 1', exact: true }).waitFor();
  await page.getByRole('button', { name: '💬 Yorumlar · 0', exact: true }).click();
  await page.getByLabel('Takma ad (isteğe bağlı)').fill('Test Öğrenci');
  await page.getByLabel('Yorumun', { exact: true }).fill('<script>throw new Error("XSS")</script>');
  await page.getByRole('button', { name: 'Yorumu paylaş', exact: true }).click();
  await page.locator('.daily-social-comment').waitFor();
  assert.ok((await page.locator('.daily-social-comment p').textContent()).includes('<script>'));
  await page.getByRole('button', { name: 'Sil', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.daily-social-comment'));
  assert.equal(writes, 3);
  assert.ok((await page.locator('#rewards').textContent()).includes('225 XP'));
  assert.equal(await page.locator('.elr-badge.earned').count(), 3);
  await page.reload();
  await page.getByRole('button', { name: '♥ Beğendin · 1', exact: true }).waitFor();
  await page.evaluate(() => { AUTH.user.id = 'second-student'; window.DailyNoteSocial.reset(); window.DailyNoteSocial.scan(); });
  await page.getByRole('button', { name: '♡ Beğen · 1', exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - innerWidth)), 0);
  await page.evaluate(() => { window.ALFA_PREVIEW_CONFIG = { role: 'free' }; window.DailyNoteSocial.reset(); window.DailyNoteSocial.scan(); });
  await page.getByText('Önizleme salt okunur; beğeni ve yorum gönderilmez.', { exact: true }).waitFor();
  assert.equal(writes, 3);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, syntheticOnly: true, likesCommentsDeletion: true, accountIsolation: true, previewReadOnly: true, rewards: '225 XP / 3 earned badges', mobileOverflow: 0 }));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
