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
  let stored = { topics: [] }, writes = 0, failSave = false;
  await page.route('**/api/edu-shared?kind=influencer-content', async route => {
    const req = route.request(), token = req.headers().authorization;
    if (req.method() === 'POST') {
      assert.equal(token, 'Bearer admin');
      if (failSave) return route.fulfill({ status:503, json:{ ok:false, error:'storage_unavailable' } });
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
  await page.getByRole('heading', { name: 'İçerik Yönetim Paneli', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Okuyucu önizlemesi', exact: true }).count(), 1, 'admin starts directly in editor mode');
  await page.getByRole('button', { name: 'Viral Gönderi örneğini ekle', exact: true }).click();
  assert.equal(await page.locator('.ic-section-open').count(), 3);
  assert.equal(await page.locator('.ic-section').count(), 0, 'map does not show every editor at once');
  await page.getByText('Konu adını / açıklamasını düzenle', { exact:true }).click();
  await page.getByLabel('Konu başlığı', { exact: true }).fill('Viral Gönderi Atölyesi');
  await page.getByLabel('Konu açıklaması', { exact: true }).fill('Örnekler ve uygulamalar');
  await page.getByRole('button', { name: '+ Alt başlık ekle', exact: true }).click();
  await page.getByLabel('Alt başlık', { exact: true }).last().fill('Görsel ve video örnekleri');
  const section = page.locator('.ic-section').last();
  await section.locator('input[type=file]').setInputFiles([
    path.join(root, 'assets/alfa-influencer-writing.jpg'), path.join(root, 'assets/alfa-influencer-network.jpg'),
  ]);
  await page.waitForFunction(() => document.querySelectorAll('.ic-block img').length === 2);
  await browser.contexts()[0].grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate(async () => {
    const image = await createImageBitmap(await (await fetch('/assets/alfa-influencer-writing.jpg')).blob());
    const canvas = document.createElement('canvas'); canvas.width = 120; canvas.height = 80;
    canvas.getContext('2d').drawImage(image, 0, 0, 120, 80); image.close();
    const png = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
  });
  await section.locator('.ic-image-zone').click({ position: { x: 12, y: 12 } });
  await page.keyboard.press('Control+v');
  await page.waitForFunction(() => document.querySelectorAll('.ic-block img').length === 3);
  assert.equal(await section.locator('.ic-image-zone').evaluate(n => n === document.activeElement), true, 'paste area stays focused for repeated pastes');
  await section.locator('.ic-image-zone').evaluate(async zone => {
    const bytes = await (await fetch('/assets/alfa-influencer-network.jpg')).arrayBuffer();
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], 'one.jpg', { type: 'image/jpeg' }));
    transfer.items.add(new File([bytes], 'two.jpg', { type: 'image/jpeg' }));
    zone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  });
  await page.waitForFunction(() => document.querySelectorAll('.ic-block img').length === 5);
  await section.getByRole('button', { name: '+ Gönderi örneği', exact: true }).click();
  await page.getByLabel('Gönderi metni / örneği', { exact: true }).fill('Kendi yorumumla yeniden yazdığım gönderi.');
  await page.getByLabel('Kaynak gönderi bağlantısı (isteğe bağlı)', { exact: true }).fill('https://x.com/example/status/123');
  page.once('dialog', d => d.accept('https://youtu.be/abcdefghijk'));
  await section.getByRole('button', { name: '+ Video', exact: true }).click();
  assert.equal(await page.locator('iframe').count(), 1);
  assert.equal(await page.getByRole('checkbox').count(), 0, 'saving is publishing, no separate publish toggle');
  failSave = true;
  await page.getByRole('button', { name:'Değişiklikleri kaydet', exact:true }).click();
  await page.getByRole('status').filter({ hasText:'İçerik yüklenemedi veya kaydedilemedi.' }).waitFor();
  assert.equal(await page.locator('.ic-topic-node small').textContent(), '4 alt başlık · Kaydedilmedi', 'failed save does not pretend to publish');
  failSave = false;
  await page.getByRole('button', { name: 'Değişiklikleri kaydet', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Kaydedildi ve yayınlandı.' }).waitFor();
  assert.equal(writes, 1); assert.equal(stored.topics[0].published, true);
  assert.equal(await page.locator('.ic-topic-node small').textContent(), '4 alt başlık · Yayında');
  assert.ok(stored.topics[0].sections.at(-1).blocks.some(b => b.type === 'image' && b.url.startsWith('data:image/webp')));
  await page.getByRole('button', { name: '+ Konu ekle', exact:true }).click();
  assert.equal(await page.getByRole('button', { name:'Konuyu sil: Yeni konu', exact:true }).count(), 1);
  page.once('dialog', d => d.dismiss());
  await page.getByRole('button', { name:'Konuyu sil: Yeni konu', exact:true }).click();
  assert.equal(await page.locator('.ic-topic-node').count(), 2, 'cancel preserves the topic');
  page.once('dialog', d => d.accept());
  await page.getByRole('button', { name:'Konuyu sil: Yeni konu', exact:true }).click();
  assert.equal(await page.locator('.ic-topic-node').count(), 1, 'topic deleted directly from its map node');
  await page.getByRole('button', { name:'Değişiklikleri kaydet', exact:true }).click();
  await page.getByRole('status').filter({ hasText:'Kaydedildi ve yayınlandı.' }).waitFor();
  assert.equal(stored.topics.length, 1);
  await page.locator('.ic-section-open').filter({ hasText:'Görsel ve video örnekleri' }).click();
  await page.getByRole('button', { name: 'Okuyucu önizlemesi', exact: true }).click();
  assert.equal(await page.locator('textarea').count(), 0);
  await mount('paid');
  await page.getByRole('heading', { name: 'Viral Gönderi Atölyesi', exact: true }).waitFor();
  assert.equal(await page.locator('img').count(), 0, 'reader starts on topic map');
  await page.locator('.ic-section-open').filter({ hasText:'Görsel ve video örnekleri' }).click();
  assert.equal(await page.locator('textarea,input').count(), 0);
  assert.equal(await page.getByRole('button', { name: '+ Konu ekle', exact: true }).count(), 0);
  assert.equal(await page.locator('img').count(), 5);
  assert.equal(await page.getByRole('link', { name: 'Kaynak gönderiyi aç ↗' }).getAttribute('href'), 'https://x.com/example/status/123');
  await page.getByRole('button', { name:'← Alt başlık haritasına dön', exact:true }).click();
  assert.equal(await page.locator('.ic-section-open').count(), 4);
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
  await app.goto((arg('url') || base) + '/index.html?page=influencer', { waitUntil: 'domcontentloaded' });
  await app.waitForFunction(() => typeof renderInfluencer === 'function');
  await app.evaluate(() => {
    AUTH.user = { id: 'admin-fixture', email: ADMIN_EMAIL };
    AUTH.client = { auth: { getSession: async () => ({ data: { session: { access_token: 'admin' } } }) } };
    siteIsAdmin = () => true; SITE.admin = true;
    hideLanding(); showPage('influencer'); renderInfluencer(true);
  });
  await app.locator('#inf-content-library').getByRole('heading', { name: 'İçerik Yönetim Paneli' }).waitFor();
  assert.equal(await app.locator('#inf-content-library').getByRole('button', { name: '+ Konu ekle', exact: true }).count(), 1);
  assert.equal(await app.locator('#inf-teaser').isVisible(), false, 'admin does not see marketing');
  assert.equal(await app.locator('#page-influencer > .inf-showcase:visible').count(), 0, 'admin does not see growth cases, engagement or sample tweets');
  assert.equal(await app.locator('#page-influencer > .inf-faq:visible').count(), 0, 'admin does not see customer FAQ');
  const visibleChildren = await app.locator('#page-influencer').evaluate(node =>
    [...node.children].filter(child => child.getBoundingClientRect().height > 0)
      .map(child => child.id || child.className));
  assert.ok(visibleChildren.every(value => ['eg-brand', 'inf-full', 'inf-admin'].includes(value)), 'admin page only contains brand, editor and access management');
  assert.equal(await app.locator('#inf-checks').isVisible(), false, 'admin does not see student checklist');
  assert.equal(await app.locator('#inf-outline').isVisible(), false, 'legacy notes collapsed by default');
  assert.equal(await app.getByRole('heading', { name: 'İçerik Yönetim Paneli', exact: true }).isVisible(), true);
  await app.mouse.move(700, 700);
  await app.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 1000); });
  await app.waitForFunction(() => document.body.classList.contains('nav-scrolled') && document.querySelector('.navbar').getBoundingClientRect().bottom <= 0);
  await app.mouse.move(400, 4);
  await app.waitForFunction(() => document.querySelector('.navbar').getBoundingClientRect().top >= -1);
  await app.mouse.move(700, 700);
  await app.waitForFunction(() => document.querySelector('.navbar').getBoundingClientRect().bottom <= 0);
  await app.locator('.navbar a').first().focus();
  await app.waitForFunction(() => document.querySelector('.navbar').getBoundingClientRect().top >= -1);
  await app.evaluate(() => document.activeElement?.blur());
  await app.setViewportSize({ width:390, height:844 });
  await app.getByRole('button', { name:'☰ Menü', exact:true }).click();
  await app.waitForFunction(() => document.querySelector('.navbar').getBoundingClientRect().top >= -1);
  await app.locator('#nav-mobile-btn').click();
  await app.waitForFunction(() => document.getElementById('nav-mobile').classList.contains('open'));
  await app.locator('#nav-mobile-close').click();
  await app.evaluate(() => window.scrollTo(0, 0));
  await app.evaluate(() => {
    siteIsAdmin = () => false; SITE.admin = false; infAccess = false;
    AUTH.user = { id: 'new-member-fixture' }; renderInfluencer(true);
  });
  assert.equal(await app.locator('#inf-teaser').isVisible(), true, 'new member still sees introduction');
  assert.equal(await app.locator('#page-influencer > .inf-showcase:visible').count(), 2, 'new member still sees showcase sections');
  assert.equal(await app.locator('#page-influencer > .inf-faq').isVisible(), true, 'new member still sees customer FAQ');
  assert.equal(await app.locator('#inf-content-library').isVisible(), false);
  await app.close();
  console.log(JSON.stringify({ passed: true, adminEditor: true, topicMap:true, sectionDrilldown:true, topicDelete:true, savePublishes:true, failedSavePreservesState:true, topicsAndSubheadings: true, multiImageUpload: true, nativeCtrlVPaste: true, multiImageDrop: true, postExamples: true, adminMarketingHidden: true, newMemberMarketingVisible: true, navAutoHide:true, navHoverReveal:true, navKeyboardReveal:true, navMobileReveal:true, videoEmbed: true, save: true, reader: true, mobile: true, logoutClears: true, productionWrites: false }));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
