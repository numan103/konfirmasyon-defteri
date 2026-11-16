// Podcast player behaviour in a real Chrome build. The API and audio bytes are mocked.
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const arg = key => process.argv.find(s => s.startsWith(`--${key}=`))?.slice(key.length + 3);
const { chromium } = await import(pathToFileURL(path.resolve(arg('playwright'))));
const browser = await chromium.launch({ executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless:true });
const page = await browser.newPage(), errors=[];
page.on('pageerror', e => errors.push(e.message));
const originalEpisode = {
  id:'11111111-2222-3333-4444-555555555555', title:'Haftanın piyasa notları',
  description:'Faiz, dolares ve kripto görünümü', audioUrl:'https://media.example.com/bolum.wav',
  cadence:'weekly', publishedAt:'2026-11-16T00:00:00Z', durationSeconds:3
};
let episode = originalEpisode;
function wav(seconds=3, rate=8000) {
  const n = seconds * rate, data = Buffer.alloc(n, 128), b = Buffer.alloc(44 + n);
  b.write('RIFF',0); b.writeUInt32LE(36+n,4); b.write('WAVE',8); b.write('fmt ',12);
  b.writeUInt32LE(16,16); b.writeUInt16LE(1,20); b.writeUInt16LE(1,22);
  b.writeUInt32LE(rate,24); b.writeUInt32LE(rate,28); b.writeUInt16LE(1,32);
  b.writeUInt16LE(8,34); b.write('data',36); b.writeUInt32LE(n,40);
  return b;
}
await page.route('https://media.example.com/bolum.wav', route => route.fulfill({
  status:200, headers:{'Content-Type':'audio/wav','Accept-Ranges':'none'}, body:wav()
}));
await page.route('**/api/edu-shared?kind=podcast**', async route => {
  if (route.request().method() === 'GET') {
    if (new URL(route.request().url()).searchParams.has('manage')) {
      return route.fulfill({ json:{ episode, revision:'2026-11-16T00:00:00Z', uploadAvailable:false } });
    }
    return route.fulfill({ json:{ episode } });
  }
  return route.fulfill({ json:{ ok:true, episode, revision:'2026-11-16T01:00:00Z' } });
});
try {
  await page.goto((arg('url') || 'http://127.0.0.1:4173') + '/?page=home');
  const landingCard = page.locator('#landing-podcast-slot .ap-podcast');
  await landingCard.waitFor({ state:'visible' });
  assert.match(await landingCard.locator('.ap-title').textContent(), /Haftanın piyasa notları/);
  assert.match(await landingCard.locator('.ap-badge').textContent(), /Haftanın Podcast/);
  assert.equal(await page.evaluate(() => document.getElementById('alfa-podcast-audio').paused), true, 'must not autoplay');
  assert.equal(await landingCard.locator('.ap-manage').isVisible(), false, 'anonymous visitors never see publishing controls');
  assert.equal(await landingCard.locator('.ap-description').textContent(), '16.11.2026 · Faiz, dolares ve kripto görünümü');

  await landingCard.locator('.ap-play').click();
  await page.waitForFunction(() => {
    const a = document.getElementById('alfa-podcast-audio');
    return a && !a.paused && a.currentTime > 0.15;
  });
  const started = await page.evaluate(() => document.getElementById('alfa-podcast-audio').currentTime);

  // Backgrounding the tab must not pause or unload the audio.
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForFunction(t => document.getElementById('alfa-podcast-audio').currentTime > t + 0.1, started);
  assert.equal(await page.evaluate(() => document.getElementById('alfa-podcast-audio').paused), false, 'backgrounding must not pause');

  // Entering the app moves the same audio element to the homepage slot.
  await page.evaluate(() => hideLanding());
  const homeCard = page.locator('#home-podcast-slot .ap-podcast');
  await homeCard.waitFor({ state:'visible' });
  assert.equal(await page.evaluate(() => document.getElementById('alfa-podcast-audio').paused), false, 'entering the app must not interrupt audio');

  // Navigating inside the app keeps a persistent mini player and uninterrupted audio.
  await page.evaluate(() => { showPage('portfoy'); });
  const dock = page.locator('.ap-dock .ap-podcast');
  await dock.waitFor({ state:'visible' });
  assert.equal(await page.evaluate(() => document.body.classList.contains('ap-has-dock')), true);
  assert.equal(await page.evaluate(() => document.getElementById('alfa-podcast-audio').paused), false);
  assert.match(await dock.locator('.ap-title').textContent(), /Haftanın piyasa notları/);

  await dock.locator('.ap-close').click();
  assert.equal(await page.evaluate(() => document.getElementById('alfa-podcast-audio').paused), true, 'closing the mini player stops audio');
  await page.evaluate(() => { showPage('home'); });
  await homeCard.waitFor({ state:'visible' });
  await homeCard.locator('.ap-play').click();
  await page.waitForFunction(() => document.getElementById('alfa-podcast-audio').currentTime > 0.2);
  await homeCard.locator('.ap-play').click();
  await page.waitForFunction(() => document.getElementById('alfa-podcast-audio').paused);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('alfa-podcast-listening-v1')));
  assert.ok(saved.positions[episode.id].time > 0, 'pause stores resume position');

  // An empty podcast feed shows no player at all to normal visitors.
  episode = null;
  await page.reload();
  await page.waitForFunction(() => window.AlfaPodcast);
  await page.waitForFunction(() => document.getElementById('landing-podcast-slot').hidden === true
    && document.getElementById('home-podcast-slot').hidden === true);
  assert.equal(await page.locator('.ap-podcast').isVisible(), false, 'no empty player before first episode');

  // Admin sees the publishing entry point once the access tier is known.
  episode = { ...originalEpisode };
  await page.reload();
  await page.waitForFunction(() => window.AlfaPodcast);
  await page.evaluate(() => { siteIsAdmin = () => true; });
  await page.evaluate(() => window.AlfaPodcast.refreshContext());
  const manage = page.locator('.ap-podcast .ap-manage');
  await manage.waitFor({ state:'visible' });
  await manage.click();
  const dialog = page.locator('dialog.ap-editor');
  await dialog.waitFor({ state:'visible' });
  assert.equal(await dialog.locator('input[name="title"]').inputValue(), 'Haftanın piyasa notları');
  assert.equal(await dialog.locator('.ap-upload').isDisabled(), true, 'upload disabled when Blob is not configured');
  await dialog.locator('.ap-cancel').click();

  const podcastErrors = errors.filter(e => /podcast|Audio|media/i.test(e));
  assert.deepEqual(podcastErrors, []);
  console.log(JSON.stringify({ passed:true, mockedPodcastAPI:true, noAutoplay:true, continuousAcrossBackground:true,
    miniPlayerAcrossPages:true, resumeStored:true, hiddenBeforeFirstEpisode:true, adminEntry:true, pageErrors:errors }));
} finally { await browser.close(); }
