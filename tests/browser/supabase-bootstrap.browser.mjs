// Yeni Supabase projesinin beslediği public yüzeyin (site-features + alfanews)
// tarayıcıda hatsız görünürlüğünü doğrular. Veri, canlı DB yerine doğrulanmış
// seed satırlarının şekliyle stub'lanır; amaç sözleşmenin korunmasıdır.
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const arg = key => process.argv.find(s => s.startsWith(`--${key}=`))?.slice(key.length + 3);
const { chromium } = await import(pathToFileURL(path.resolve(arg('playwright'))));
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const base = arg('url') || 'http://127.0.0.1:4181';
const result = { passed: false, errors: [] };

const now = new Date().toISOString();
const features = [
  { id: 'morning-checkin', label: 'Sabah Kartı', since: '2026-11-20' },
  { id: 'checkin-config', label: 'Kendi kriterini ekle', since: '2026-11-20' },
];
const news = {
  ok: true,
  data: {
    issueNo: 1, weekLabel: '', authors: [], homeSections: {},
    entries: [{ id: 'seed_1195', title: 'Doğrulanmış dergi yazısı', body: 'Kısa analiz',
      publishedAt: now, sourceKind: 'mentorship-magazine', sourceThread: 977,
      sourceMessageId: 1195, category: 'Makro', images: [] }],
  },
};

const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(e.message));
try {
  await page.route('**/api/edu-shared?kind=site-features**', route => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({ ok: true, features }),
  }));
  await page.route('**/api/edu-shared?kind=news**', route => route.fulfill({
    contentType: 'application/json', body: JSON.stringify(news),
  }));

  await page.goto(base + '/?page=home', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('[data-new-feature]').length > 0);
  const badges = await page.locator('[data-new-feature]').evaluateAll(nodes => nodes.map(n => n.getAttribute('data-new-feature')));
  assert.ok(badges.includes('morning-checkin'), 'site-features seed must render the morning badge: ' + JSON.stringify(badges));
  assert.ok(badges.includes('checkin-config'), 'site-features seed must render the config badge: ' + JSON.stringify(badges));

  await page.goto(base + '/?page=news', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('#news-weekly-list .nw-card').length > 0);
  const titles = await page.locator('#news-weekly-list .nw-card').allTextContents();
  assert.ok(titles.some(text => text.includes('Doğrulanmış dergi yazısı')), 'alfanews seed must render a weekly card');
  assert.deepEqual(pageErrors, [], 'browser errors');
  result.passed = true;
  console.log(JSON.stringify({ ...result, badges, cards: titles.length }));
} catch (error) {
  result.error = error.message;
  console.log(JSON.stringify(result));
  process.exitCode = 1;
} finally { await page.close(); await browser.close(); }
