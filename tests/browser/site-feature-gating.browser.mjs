// Trading terminal and Alfa Charts links are visible only to the site admin.
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const arg = key => process.argv.find(s => s.startsWith(`--${key}=`))?.slice(key.length + 3);
const { chromium } = await import(pathToFileURL(path.resolve(arg('playwright'))));
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }), errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.route('**/api/access**', route => route.fulfill({ json: { ok: true, admin: false, tier: 'free', status: 'none' } }));
await page.route('**/api/edu-shared?kind=landing**', route => route.fulfill({ json: { status: { channel: 'ok' }, channel: { results: { latest: [] } } } }));
const visibility = () => page.evaluate(() => {
  const ids = ['tab-trading', 'mnav-trading', 'tab-alfacharts', 'mnav-alfacharts'];
  const out = {};
  for (const id of ids) out[id] = document.getElementById(id)?.style.display !== 'none';
  const term = document.querySelector('.tv-term');
  out['tv-term'] = !!term && term.style.display !== 'none';
  const quick = document.querySelector('#home-quick [data-admin-only]');
  out['home-quick-terminal'] = !!quick && quick.style.display !== 'none';
  const card = document.querySelector('#page-home .home-card[data-admin-only]');
  out['home-card-terminal'] = !!card && card.style.display !== 'none';
  return out;
});
try {
  await page.goto((arg('url') || 'http://127.0.0.1:4173') + '/?page=home');
  await page.waitForFunction(() => typeof applyTierUi === 'function' && document.getElementById('tab-trading'));
  // Markup must already hide everything, even if init has not resolved access yet.
  const initial = await visibility();
  assert.deepEqual(initial, {
    'tab-trading': false, 'mnav-trading': false,
    'tab-alfacharts': false, 'mnav-alfacharts': false,
    'tv-term': false, 'home-quick-terminal': false, 'home-card-terminal': false
  });
  // Init awaits Supabase session/access; invoke the tier gate directly for a deterministic check.
  await page.evaluate(() => applyTierUi());
  const anon = await visibility();
  assert.deepEqual(anon, {
    'tab-trading': false, 'mnav-trading': false,
    'tab-alfacharts': false, 'mnav-alfacharts': false,
    'tv-term': false, 'home-quick-terminal': false, 'home-card-terminal': false
  });
  await page.evaluate(() => showPage('trading'));
  assert.equal(await page.evaluate(() => document.body.dataset.page), 'erisim');

  await page.evaluate(() => { siteIsAdmin = () => true; applyTierUi(); showPage('home'); });
  const admin = await visibility();
  assert.deepEqual(admin, {
    'tab-trading': true, 'mnav-trading': true,
    'tab-alfacharts': true, 'mnav-alfacharts': true,
    'tv-term': true, 'home-quick-terminal': true, 'home-card-terminal': true
  });
  await page.evaluate(() => showPage('trading'));
  assert.equal(await page.evaluate(() => document.body.dataset.page), 'trading');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, markupHidden: initial, anonymousHidden: anon, adminVisible: admin, pageErrors: errors }));
} catch (error) {
  console.log(JSON.stringify({ passed: false, error: error.message, pageErrors: errors }));
  process.exitCode = 1;
} finally { await browser.close(); }
