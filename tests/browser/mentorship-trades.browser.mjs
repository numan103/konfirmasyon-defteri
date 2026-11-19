import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const arg = key => process.argv.find(s => s.startsWith(`--${key}=`))?.slice(key.length + 3);
const { chromium } = await import(pathToFileURL(path.resolve(arg('playwright'))));
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const id = 'mentortrade_' + 'a'.repeat(64); let reads = 0;
  await page.route('**/api/**', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.searchParams.get('mentorTrades') === '1') {
      reads++;
      if (url.searchParams.get('image')) return route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aU1sAAAAASUVORK5CYII=', 'base64') });
      return route.fulfill({ json: { ok: true, more: false, records: [{ id, coin: 'BTC', r: 2.3, date: 1795019005, text: 'BTC +2.3R', rootText: '<img src=x onerror=alert(1)>', hasImage: true, imageCount: 1, needsReview: false, link: 'https://t.me/alfakasim/6/946' }] } });
    }
    if (url.pathname === '/api/contrib') return route.fulfill({ json: { posts: [] } });
    return route.fulfill({ json: { ok: true, admin: false, tier: 'free', episode: null } });
  });
  await page.goto((arg('url') || 'http://127.0.0.1:4186') + '/?page=eduplans');
  assert.equal(reads, 0);
  await page.evaluate(() => {
    AUTH.user = { id: 'mentor-test-user', email: 'user@example.com' }; SITE.tier = 'ref'; SITE.admin = false;
    hideLanding(); showLanding = () => {}; siteIsAdmin = () => false;
    window.siteFetch = (url, init = {}) => fetch(url, init);
    showPage('alfatrading', true);
    AlfaMentorTrades.refreshContext();
  });
  await page.locator('[data-mentor-trade]').waitFor();
  assert.match(await page.locator('.mentor-trade-title').innerText(), /BTC\s+\+2.3R/);
  assert.equal(await page.locator('.mentor-trade-text img').count(), 0, 'source text is never HTML');
  await page.waitForFunction(() => document.querySelector('.mentor-trade-media img')?.complete);
  assert.ok((await page.locator('.mentor-trade-media img').getAttribute('src')).startsWith('blob:'));
  assert.equal(await page.locator('.mentor-trades-admin').count(), 0);
  await page.setViewportSize({ width: 360, height: 900 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.evaluate(() => { AUTH.user = null; SITE.tier = 'free'; AlfaMentorTrades.refreshContext(); });
  assert.equal(await page.locator('.mentor-trades').textContent(), '');
  assert.equal(await page.locator('.mentor-trades').isVisible(), false);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, signedR: true, authenticatedImages: true, escapedSourceText: true, mobile: true, logoutClearsPrivateData: true, productionWrites: false }));
} finally { await browser.close(); }
