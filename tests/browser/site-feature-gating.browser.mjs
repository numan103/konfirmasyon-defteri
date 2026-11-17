// Alfa Charts is admin-only; Trading Terminal is reachable only from the Ek page.
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
const state = () => page.evaluate(() => ({
  alfaDesktop: document.getElementById('tab-alfacharts')?.style.display !== 'none',
  alfaMobile: document.getElementById('mnav-alfacharts')?.style.display !== 'none',
  tradingNav: !!document.querySelector('[id="tab-trading"], [id="mnav-trading"], .tv-term'),
  tradingShortcut: !!document.querySelector('#home-quick a[href="?page=trading"], #page-home .home-card[href="?page=trading"]'),
  ekTrading: !!document.querySelector('#ek-grid a[href="?page=trading"]')
}));
try {
  await page.goto((arg('url') || 'http://127.0.0.1:4173') + '/?page=home');
  await page.waitForFunction(() => typeof applyTierUi === 'function' && document.getElementById('tab-alfacharts'));
  const initial = await state();
  assert.deepEqual(initial, { alfaDesktop: false, alfaMobile: false, tradingNav: false, tradingShortcut: false, ekTrading: false });

  await page.evaluate(() => applyTierUi());
  const anon = await state();
  assert.deepEqual(anon, initial);
  await page.evaluate(() => showPage('trading'));
  assert.equal(await page.evaluate(() => document.body.dataset.page), 'erisim');

  await page.evaluate(() => { siteIsAdmin = () => true; applyTierUi(); showPage('ek'); });
  const admin = await state();
  assert.deepEqual(admin, { alfaDesktop: true, alfaMobile: true, tradingNav: false, tradingShortcut: false, ekTrading: true });
  assert.equal(await page.evaluate(() => document.body.dataset.page), 'ek');
  await page.evaluate(() => showPage('trading'));
  assert.equal(await page.evaluate(() => document.body.dataset.page), 'trading');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, markup: initial, anonymous: anon, admin, pageErrors: errors }));
} catch (error) {
  console.log(JSON.stringify({ passed: false, error: error.message, pageErrors: errors }));
  process.exitCode = 1;
} finally { await browser.close(); }
