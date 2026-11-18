import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const arg = key => process.argv.find(s => s.startsWith(`--${key}=`))?.slice(key.length + 3);
const { chromium } = await import(pathToFileURL(path.resolve(arg('playwright'))));
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  let requests = 0;
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('kind') === 'youtube') {
      requests++;
      return route.fulfill({ json: { video: { id: 'g1z4tZUnEF8', title: '<img onerror=alert(1)> Son video', publishedAt: '2026-11-13T17:49:59Z' } } });
    }
    if (url.searchParams.get('kind') === 'podcast') return route.fulfill({ json: { episode: {
      id: '11111111-2222-3333-4444-555555555555', title: 'Üye podcastı',
      audioUrl: 'https://media.example.com/episode.mp3', publishedAt: '2026-11-16T00:00:00Z', cadence: 'weekly',
    } } });
    return route.fulfill({ json: { ok: false } });
  });
  await page.route('https://www.youtube-nocookie.com/**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Mock video player</h1>' }));
  await page.goto((arg('url') || 'http://127.0.0.1:4186') + '/?page=home');
  await page.waitForFunction(() => window.AlfaPodcast && window.AlfaMemberVideo);
  await page.evaluate(() => {
    showLanding = () => {}; hideLanding(); document.body.dataset.page = 'home';
    AUTH.user = null; SITE.admin = false; SITE.tier = 'free'; siteIsAdmin = () => false;
    window.refUnlocked = () => false; AlfaPodcast.refreshContext(); AlfaMemberVideo.refreshContext();
  });
  assert.equal(await page.locator('#home-member-video').isVisible(), false);
  assert.equal(await page.locator('#home-podcast-slot').isVisible(), false);
  assert.equal(requests, 0, 'anonymous sessions must not request the member video');
  await page.evaluate(() => {
    AUTH.user = { id: 'new-member', email: 'new@example.com' };
    AlfaPodcast.refreshContext(); AlfaMemberVideo.refreshContext();
  });
  await page.locator('#home-podcast-slot .ap-podcast').waitFor({ state: 'visible' });
  await page.locator('#home-member-video iframe').waitFor({ state: 'attached' });
  assert.equal(await page.locator('.ap-manage').isVisible(), false);
  assert.equal(await page.evaluate(() => document.getElementById('alfa-podcast-audio').paused), true);
  assert.match(await page.locator('#home-member-video iframe').getAttribute('src'), /^https:\/\/www\.youtube-nocookie\.com\/embed\/g1z4tZUnEF8\?/);
  assert.equal(await page.locator('#home-member-video img').count(), 0, 'video title is rendered as text');
  await page.setViewportSize({ width: 320, height: 900 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.evaluate(() => {
    AUTH.user = null; AlfaPodcast.refreshContext(); AlfaMemberVideo.refreshContext();
  });
  assert.equal(await page.locator('#home-member-video').isVisible(), false);
  assert.equal(await page.locator('#home-member-video iframe').count(), 0, 'logout unloads the video');
  assert.equal(await page.locator('#home-podcast-slot').isVisible(), false);
  assert.equal(await page.evaluate(() => document.getElementById('alfa-podcast-audio').hasAttribute('src')), false);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, freeMemberPodcast: true, latestVideoEmbedded: true, anonymousHidden: true, logoutUnloads: true, mobile: true, pageErrors: errors }));
} finally { await browser.close(); }
