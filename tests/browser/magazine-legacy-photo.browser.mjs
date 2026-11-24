// Arşiv dergi mesajlarının süresi dolmuş Telegram CDN görseli tarayıcıda
// doğrudan istenmemeli; aynı kökenli publicmag proxy'sine çevrilmelidir.
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const arg = key => process.argv.find(s => s.startsWith(`--${key}=`))?.slice(key.length + 3);
const { chromium } = await import(pathToFileURL(path.resolve(arg('playwright'))));
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const base = arg('url') || 'http://127.0.0.1:4181';
const result = { passed: false, errors: [] };
const tinyJpeg = Buffer.from('/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwcJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPDs0NDT/wAALCAABAAEBAREA/8QAFAABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AmAA//9k=', 'base64');

const now = new Date().toISOString();
const entry = (id, message, images) => ({
  id, title: id, body: 'Kısa dergi analizi', publishedAt: now, authorId: 'traderahmetd',
  sourceKind: 'mentorship-magazine', sourceThread: 977, sourceMessageId: message,
  category: 'Makro', images,
});
const fixture = {
  ok: true,
  data: {
    issueNo: 1, weekLabel: '', authors: [{ id: 'traderahmetd', name: 'Trader Ahmet' }], homeSections: {},
    entries: [entry('mag_old_1195', 1195, ['https://cdn4.telesco.pe/file/expired-photo.jpg']),
      entry('mag_ext', 987, ['https://example.com/chart.jpg'])],
  },
};

const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const pageErrors = [], cdnRequests = [];
page.on('pageerror', e => pageErrors.push(e.message));
page.on('request', r => { if (/cdn\d*\.telesco\.pe/i.test(r.url())) cdnRequests.push(r.url()); });
try {
  await page.route('**/api/edu-shared?kind=news**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(fixture) }));
  await page.route('**/api/tg?magPhoto=publicmag_1195_0**', route => route.fulfill({ status: 200, contentType: 'image/jpeg', body: tinyJpeg }));
  await page.route('**/example.com/chart.jpg**', route => route.fulfill({ status: 200, contentType: 'image/jpeg', body: tinyJpeg }));
  await page.goto(base + '/?page=news', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('#mag-stage img').length >= 2 && typeof magData !== 'undefined' && magData.entries.length >= 2);
  const images = await page.locator('#mag-stage img').evaluateAll(nodes => nodes.map(n => n.getAttribute('src') || ''));
  assert.ok(images.some(src => src.includes('/api/tg?magPhoto=publicmag_1195_0')), 'archived photo must use the same-origin proxy: ' + JSON.stringify(images));
  assert.ok(images.some(src => src.includes('https://example.com/chart.jpg')), 'unrelated external image must be preserved');
  assert.ok(images.every(src => !/cdn\d*\.telesco\.pe/i.test(src)), 'no expired CDN URL may reach the DOM');
  assert.deepEqual(cdnRequests, [], 'no direct Telegram CDN request is allowed');
  assert.deepEqual(pageErrors, [], 'browser errors');
  result.passed = true;
  console.log(JSON.stringify({ ...result, images }));
} catch (error) {
  result.error = error.message;
  console.log(JSON.stringify(result));
  process.exitCode = 1;
} finally { await page.close(); await browser.close(); }
