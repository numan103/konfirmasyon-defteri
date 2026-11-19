import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const arg = key => process.argv.find(s => s.startsWith(`--${key}=`))?.slice(key.length + 3);
const { chromium } = await import(pathToFileURL(path.resolve(arg('playwright'))));
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  let mode = 'premium', images = 0;
  const summary = { count: 2, netR: 1.3, wins: 1, losses: 1, flat: 0, from: '2026-11-18', to: '2026-11-19', series: [{ day: '2026-11-18', cumulativeR: 2.3 }, { day: '2026-11-19', cumulativeR: 1.3 }] };
  const safe = [{ id: 'mentortrade_' + 'a'.repeat(64), coin: 'BTC', r: 2.3, date: 1795019005 }, { id: 'mentortrade_' + 'd'.repeat(64), coin: 'ETH', r: -1, date: 1795105405 }];
  const records = [
    { ...safe[0], category: 'result', text: 'BTC +2.3R\nRisk azaltıldı.', rootText: 'BTC', imageCount: 2, hasImage: true, link: 'https://t.me/alfakasim/6/946' },
    { id: 'mentortrade_' + 'b'.repeat(64), category: 'bias', coin: 'GOLD', text: 'GOLD bias yukarı SECRET_BIAS', date: 1795019004, r: null, imageCount: 0 },
    { id: 'mentortrade_' + 'c'.repeat(64), category: 'trade', coin: 'NZDCAD', text: 'NZDCAD long entry SECRET_PLAN', date: 1795019003, r: null, imageCount: 0 },
  ];
  await page.route('**/api/**', async route => {
    const u = new URL(route.request().url());
    if (u.searchParams.get('mentorTrades') === '1') {
      if (u.searchParams.get('summary')) return route.fulfill({ json: { ok: true, summary } });
      if (u.searchParams.get('image')) {
        images++;
        assert.equal(mode, 'premium', 'free client must not request protected media');
        return route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aU1sAAAAASUVORK5CYII=', 'base64') });
      }
      if (mode === 'free' || u.searchParams.get('results')) return route.fulfill({ json: { ok: true, access: mode === 'free' ? 'results' : 'premium', records: safe, summary, more: false } });
      const category = u.searchParams.get('category');
      return route.fulfill({ json: { ok: true, access: 'premium', records: !category || category === 'all' ? records : records.filter(r => r.category === category), summary, more: false, counts: { trade: 1, bias: 1, result: 1, post: 0 } } });
    }
    if (u.pathname === '/api/contrib') return route.fulfill({ json: { posts: [] } });
    return route.fulfill({ json: { ok: true, tier: 'free', admin: false, episode: null } });
  });
  await page.goto((arg('url') || 'http://127.0.0.1:4186') + '/?page=eduplans');
  await page.locator('#lp-live-trades .mentor-curve-svg').waitFor({ state: 'attached' });
  assert.match(await page.locator('#lp-live-trades').innerText(), /1 eksi/);
  assert.equal(await page.locator('#lp-live-trades img').count(), 0);
  await page.evaluate(() => {
    AUTH.user = { id: 'preview-member', email: 'member@example.com' }; SITE.tier = 'ref'; SITE.admin = false;
    hideLanding(); showLanding = () => {}; siteIsAdmin = () => false; window.siteFetch = (url, init = {}) => fetch(url, init);
    showPage('alfatrading', true); AlfaMentorTrades.refreshContext(); AlfaMentorPreview.refresh();
  });
  const root = page.locator('.mentor-trades');
  await root.locator('[data-mentor-trade]').first().waitFor();
  assert.equal(await root.locator('[data-mentor-trade]').count(), 3);
  const result = root.locator('[data-mentor-trade]').first();
  assert.equal(await result.locator('.mentor-trade-text').innerText(), 'Risk azaltıldı.');
  await result.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => !!document.querySelector('.mentor-trade-media img')?.complete);
  assert.equal(images, 1, 'original image stays deferred in closed details');
  await result.locator('details summary').click();
  await page.waitForFunction(() => document.querySelectorAll('.mentor-trade-media img').length === 2);
  await root.getByRole('button', { name: /^Bias/ }).click();
  await page.waitForFunction(() => document.querySelectorAll('[data-mentor-trade]').length === 1 && document.querySelector('[data-mentor-trade] h3')?.textContent === 'GOLD');
  mode = 'free';
  await page.evaluate(() => { SITE.tier = 'free'; AlfaMentorTrades.refreshContext(); AlfaMentorPreview.refresh(); });
  await page.waitForFunction(() => document.body.dataset.mentorAccess === 'results');
  assert.equal(await root.locator('[data-mentor-trade]').count(), 2);
  assert.equal(await root.locator('img').count(), 0);
  assert.equal(await root.locator('a[href*="t.me"]').count(), 0);
  assert.ok(!(await root.innerText()).includes('SECRET'));
  assert.equal(await root.getByRole('button', { name: /^Bias/ }).isDisabled(), true);
  await page.setViewportSize({ width: 360, height: 900 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.evaluate(() => { AUTH.user = null; AlfaMentorTrades.refreshContext(); AlfaMentorPreview.refresh(); });
  assert.equal(await root.textContent(), '');
  await page.waitForFunction(() => document.getElementById('lp-live-results').textContent.includes('ücretsiz kaydol'));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, categories: true, cleanDescriptions: true, lossInCurve: true, deferredOriginalImage: true, freeResultsOnly: true, downgradeClearsPlans: true, mobile: true, productionWrites: false }));
} finally { await browser.close(); }
