// Anonymous production smoke test: no credentials, no content mutations.
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const arg = key => process.argv.find(s => s.startsWith(`--${key}=`))?.split('=').slice(1).join('=');
const { chromium } = await import(pathToFileURL(path.resolve(arg('playwright') || 'node_modules/playwright/index.mjs')));
const browser = await chromium.launch({ executablePath: arg('chrome') || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const page = await browser.newPage(), origin = arg('url') || 'https://alfa-trader.com';
const errors = [], requests = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => requests.push(request.url()));
try {
  const landingWait = page.waitForResponse(r => r.url().includes('/api/edu-shared?kind=landing') && r.request().method() === 'GET', { timeout: 40000 });
  await page.goto(origin + '/?page=home');
  const landing = await landingWait, data = await landing.json();
  assert.equal(landing.status(), 200); assert.equal(data.status.channel, 'ok');
  await page.waitForFunction(() => !!window.AlfaSharedDocuments);
  const state = await page.evaluate(async () => ({
    helper: !!window.AlfaSharedDocuments,
    newsNotLoaded: await loadNews() === false,
    mentorNotLoaded: await loadMentor() === false,
    page: currentPage
  }));
  assert.equal(state.page, 'home'); assert.equal(state.newsNotLoaded, true); assert.equal(state.mentorNotLoaded, true);
  assert.equal(requests.filter(url => url.includes('/rest/v1/alfanews')).length, 0);
  assert.equal(requests.filter(url => url.includes('/api/contrib?store=alfatrading')).length, 0, 'home must not download the full feed');
  const post = [...data.channel.trades.latest, ...data.channel.biases.latest].find(p => p.image);
  assert.ok(post, 'a real published preview with an image is available');
  const picture = await page.request.get(origin + post.image);
  assert.equal(picture.status(), 200); assert.match(picture.headers()['content-type'], /^image\//);
  for (const endpoint of ['/api/contrib?store=pano', '/api/analytics?days=7']) {
    const denied = await page.request.get(origin + endpoint);
    assert.equal(denied.status(), 401, endpoint + ' must remain protected');
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, homepage: 200, previewImage: picture.status(), noStartupNewsReads: true,
    noFullFeedOnHome: true, privateEndpointsDenied: true, pageErrors: errors }, null, 2));
} finally { await browser.close(); }
