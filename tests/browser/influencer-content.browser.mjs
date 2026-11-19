import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const arg = key => process.argv.find(v => v.startsWith('--' + key + '='))?.split('=').slice(1).join('=');
const { chromium } = await import(pathToFileURL(path.resolve(arg('playwright'))));
const root = fileURLToPath(new URL('../../', import.meta.url));
const server = http.createServer((req, res) => {
  if (req.url === '/') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end('<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/assets/influencer-content.css"><style>body{background:#101321;color:#eee;font-family:Arial;--border:#444;--card:#171b2b;--bg2:#202438;--text:#eee;--text-3:#aaa;--pc:#e879f9;--pc-soft:#392142}</style><div id="library"></div><script type="module">import * as lib from "/assets/influencer-content.mjs"; window.lib=lib;</script>');
  }
  const file = path.resolve(root, '.' + new URL(req.url, 'http://local').pathname);
  if (!file.startsWith(root) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', file.endsWith('.html') ? 'text/html; charset=utf-8' : /\.(?:mjs|js)$/.test(file) ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'image/jpeg');
  res.end(fs.readFileSync(file));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  let stored = { topics: [] }, writes = 0;
  await page.route('**/api/edu-shared?kind=influencer-content', async route => {
    const req = route.request(), token = req.headers().authorization;
    if (req.method() === 'POST') {
      assert.equal(token, 'Bearer admin');
      stored = req.postDataJSON().data; writes++;
      return route.fulfill({ json: { ok: true, data: stored, revision: '2026-11-19T12:00:00Z' } });
    }
    return route.fulfill({ json: { ok: true, data: token === 'Bearer admin' ? stored : { topics: stored.topics.filter(t => t.published) }, revision: null } });
  });
  await page.goto(base); await page.waitForFunction(() => window.lib);
  async function mount(role) {
    await page.evaluate(role => {
      window.lib.mount(document.getElementById('library'), { admin: role === 'admin', unlocked: role !== 'free', userId: role, getToken: async () => role });
    }, role);
  }
  await mount('admin');
  await page.getByRole('button', { name: 'Viral Gönderi taslağı ekle', exact: true }).click();
  assert.equal(await page.getByLabel('Alt başlık', { exact: true }).count(), 3);
  await page.getByLabel('Konu başlığı', { exact: true }).fill('Viral Gönderi Atölyesi');
  await page.getByLabel('Konu açıklaması', { exact: true }).fill('Örnekler ve uygulamalar');
  await page.getByRole('button', { name: '+ Alt başlık ekle', exact: true }).click();
  await page.getByLabel('Alt başlık', { exact: true }).last().fill('Görsel ve video örnekleri');
  const section = page.locator('.ic-section').last();
  await section.locator('input[type=file]').setInputFiles(path.join(root, 'assets/alfa-influencer-writing.jpg'));
  await page.waitForSelector('.ic-block img');
  page.once('dialog', d => d.accept('https://youtu.be/abcdefghijk'));
  await section.getByRole('button', { name: '+ Video', exact: true }).click();
  assert.equal(await page.locator('iframe').count(), 1);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Değişiklikleri kaydet', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Kaydedildi.' }).waitFor();
  assert.equal(writes, 1); assert.equal(stored.topics[0].published, true);
  assert.ok(stored.topics[0].sections.at(-1).blocks.some(b => b.type === 'image' && b.url.startsWith('data:image/webp')));
  await page.getByRole('button', { name: 'Okuyucu önizlemesi', exact: true }).click();
  assert.equal(await page.locator('textarea').count(), 0);
  await mount('paid');
  await page.getByRole('heading', { name: 'Viral Gönderi Atölyesi', exact: true }).waitFor();
  assert.equal(await page.locator('textarea,input').count(), 0);
  assert.equal(await page.getByRole('button', { name: '+ Konu ekle', exact: true }).count(), 0);
  assert.equal(await page.locator('img').count(), 1);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await mount('free');
  assert.equal(await page.locator('#library').textContent(), '');
  assert.deepEqual(errors, []);
  const app = await browser.newPage();
  await app.route('**/api/**', route => {
    const u = new URL(route.request().url());
    if (u.searchParams.get('kind') === 'influencer-content') return route.fulfill({ json: { ok: true, data: stored, revision: null } });
    return route.fulfill({ json: { ok: true, admin: false, tier: 'free', unlocked: true, orders: [], outline: [], posts: [], data: null } });
  });
  await app.goto(base + '/index.html?page=influencer', { waitUntil: 'domcontentloaded' });
  await app.waitForFunction(() => typeof renderInfluencer === 'function');
  await app.evaluate(() => {
    AUTH.user = { id: 'admin-fixture', email: ADMIN_EMAIL };
    AUTH.client = { auth: { getSession: async () => ({ data: { session: { access_token: 'admin' } } }) } };
    siteIsAdmin = () => true; SITE.admin = true;
    hideLanding(); showPage('influencer'); renderInfluencer(true);
  });
  await app.locator('#inf-content-library').getByRole('heading', { name: 'İçerik Kütüphanesi' }).waitFor();
  assert.equal(await app.locator('#inf-content-library').getByRole('button', { name: '+ Konu ekle', exact: true }).count(), 1);
  await app.close();
  console.log(JSON.stringify({ passed: true, adminEditor: true, topicsAndSubheadings: true, imageUpload: true, videoEmbed: true, save: true, reader: true, mobile: true, logoutClears: true, productionWrites: false }));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
