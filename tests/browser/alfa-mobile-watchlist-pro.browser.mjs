// FAZ 8 phone watchlist/symbol-flow regression test. Anonymous; no credentials or user-data mutations.
// node tests/browser/alfa-mobile-watchlist-pro.browser.mjs --url=http(s)://<origin> --playwright=<path> --shots=<dir>
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const arg = key => process.argv.find(s => s.startsWith(`--${key}=`))?.split('=').slice(1).join('=');
const origin = arg('url');
assert.ok(origin && /^https?:\/\//.test(origin), '--url=http(s)://<origin> is required');
const shotDir = path.resolve(arg('shots') || 'docs/upgrade-screenshots');
fs.mkdirSync(shotDir, { recursive: true });

const { chromium, devices } = await import(pathToFileURL(path.resolve(arg('playwright') || 'node_modules/playwright/index.mjs')));
const browser = await chromium.launch({
  executablePath: arg('chrome') || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true
});
const context = await browser.newContext({
  ...devices['iPhone 13'],
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
let step = 'boot';

const boxes = selectors => page.evaluate(list => list.map(selector => {
  const el = document.querySelector(selector), r = el?.getBoundingClientRect();
  return { selector, w: r ? Math.round(r.width) : 0, h: r ? Math.round(r.height) : 0,
    display: el ? getComputedStyle(el).display : 'missing' };
}), selectors);

const assertTargets = (label, targets) => {
  for (const item of targets) {
    assert.notEqual(item.display, 'missing', `${label}: missing ${item.selector}`);
    assert.notEqual(item.display, 'none', `${label}: hidden ${item.selector}`);
    assert.ok(item.w >= 44 && item.h >= 44, `${label}: small target ${item.selector} ${item.w}x${item.h}`);
  }
};

const watchTargets = [
  '#watch-mobile-close', '#watch-add', '#watch-settings', '#watch-list-add',
  '#watch-import', '#watch-export', '#watch-share',
  '.watch-item>.watch-star', '.watch-item>.watch-flag', '.watch-item>.watch-remove'
];
const pickerTargets = [
  '#symbols-close', '#symbol-query', '#symbol-venue', '#symbol-quote', '#catalog-retry',
  '#symbol-results .symbol-result [data-open-symbol]', '#symbol-results .symbol-result [data-add-symbol]'
];
const importTargets = [
  '#import-close', '#watchlist-file', '#watchlist-source', '.watchlist-import-dialog .import-options label',
  '#watchlist-preview', '#watchlist-apply'
];

try {
  await page.goto(origin + '/alfa-charts.html?debug=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__alfaDebug?.ready === true && document.querySelector('#chart-loading')?.hidden === true, null, { timeout: 30000 });
  assert.equal(await page.evaluate(() => document.querySelector('.workspace')?.classList.contains('no-list')), true,
    'phone watchlist must start closed');

  step = 'watchlist-sheet';
  await page.click('#mobile-market-pick');
  await page.waitForFunction(() => document.querySelector('.workspace')?.classList.contains('no-list') === false &&
    document.querySelectorAll('.watch-row[data-symbol]').length > 0, null, { timeout: 5000 });
  const sheetTargets = await boxes(watchTargets);
  assertTargets('portrait watchlist', sheetTargets);
  const groupHead = (await boxes(['.watch-group-head']))[0];
  if (groupHead.display !== 'missing') assertTargets('watchlist group head', [groupHead]);
  const reachable = await page.evaluate(selectors => selectors.map(selector => {
    const el = document.querySelector(selector), r = el?.getBoundingClientRect();
    if (!r) return { selector, ok: false };
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { selector, ok: hit?.closest('button,summary') === el || el.contains(hit) };
  }), ['#watch-mobile-close', '#watch-add', '#watch-settings', '#watch-list-add', '#watch-import', '#watch-export', '#watch-share']);
  assert.ok(reachable.every(x => x.ok), `unreachable watchlist controls: ${JSON.stringify(reachable.filter(x => !x.ok))}`);
  await page.screenshot({ path: path.join(shotDir, 'phase8-10-after-sheet.png'), fullPage: false });

  step = 'symbol-picker';
  await page.click('#watch-add');
  await page.waitForSelector('#symbol-query', { state: 'visible', timeout: 5000 });
  await page.waitForSelector('#symbol-results .symbol-result', { state: 'attached', timeout: 15000 });
  assertTargets('symbol picker', await boxes(pickerTargets));
  const pickerState = await page.evaluate(() => ({
    open: !!document.querySelector('dialog[open].symbol-dialog'),
    watchOpen: !document.querySelector('.workspace')?.classList.contains('no-list'),
    count: document.querySelectorAll('#symbol-results .symbol-result').length
  }));
  assert.equal(pickerState.open, true);
  assert.equal(pickerState.watchOpen, true);
  assert.ok(pickerState.count > 0);
  await page.screenshot({ path: path.join(shotDir, 'phase8-11-after-picker.png'), fullPage: false });

  step = 'escape-parity';
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('dialog[open]'), null, { timeout: 5000 });
  assert.equal(await page.evaluate(() => document.querySelector('.workspace')?.classList.contains('no-list')), false,
    'dialog Escape must not also close the watchlist');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.querySelector('.workspace')?.classList.contains('no-list') === true, null, { timeout: 5000 });

  step = 'import-dialog';
  await page.click('#mobile-market-pick');
  await page.waitForFunction(() => document.querySelector('.workspace')?.classList.contains('no-list') === false, null, { timeout: 5000 });
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#watch-import')).display), 'flex',
    'import must be reachable from the phone watchlist');
  await page.click('#watch-import');
  await page.waitForSelector('#watchlist-source', { state: 'visible', timeout: 5000 });
  assertTargets('import dialog', await boxes(importTargets));
  await page.screenshot({ path: path.join(shotDir, 'phase8-12-after-import.png'), fullPage: false });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('dialog[open]'), null, { timeout: 5000 });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.querySelector('.workspace')?.classList.contains('no-list') === true, null, { timeout: 5000 });

  step = 'landscape-after';
  const landscape = await browser.newContext({
    ...devices['iPhone 13'],
    viewport: { width: 844, height: 390 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });
  const lp = await landscape.newPage();
  lp.on('pageerror', error => errors.push(`landscape: ${error.message}`));
  await lp.goto(origin + '/alfa-charts.html?debug=1', { waitUntil: 'domcontentloaded' });
  await lp.waitForFunction(() => window.__alfaDebug?.ready === true && document.querySelector('#chart-loading')?.hidden === true, null, { timeout: 30000 });
  await lp.click('#mobile-market-pick');
  await lp.waitForFunction(() => document.querySelector('.workspace')?.classList.contains('no-list') === false &&
    document.querySelectorAll('.watch-row[data-symbol]').length > 0, null, { timeout: 5000 });
  const landscapeTargets = await lp.evaluate(list => list.map(selector => {
    const el = document.querySelector(selector), r = el?.getBoundingClientRect();
    return { selector, w: r ? Math.round(r.width) : 0, h: r ? Math.round(r.height) : 0,
      display: el ? getComputedStyle(el).display : 'missing' };
  }), watchTargets);
  for (const item of landscapeTargets) {
    assert.notEqual(item.display, 'missing', `landscape: missing ${item.selector}`);
    assert.notEqual(item.display, 'none', `landscape: hidden ${item.selector}`);
    assert.ok(item.w >= 44 && item.h >= 44, `landscape: small target ${item.selector} ${item.w}x${item.h}`);
  }
  const overflow = await lp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 1, `landscape horizontal overflow: ${overflow}px`);
  await lp.screenshot({ path: path.join(shotDir, 'phase8-13-after-landscape.png'), fullPage: false });
  await landscape.close();

  assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
  console.log(JSON.stringify({ result: 'PASS', step: 'complete', shots: 4 }, null, 2));
} catch (error) {
  console.log(JSON.stringify({ result: 'FAIL', step, error: String(error?.message || error), pageErrors: errors }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
