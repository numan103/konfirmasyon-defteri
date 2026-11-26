// FAZ 9 phone alarm trust regression test. Anonymous; no notification permission, credentials or real orders.
// node tests/browser/alfa-mobile-alarm-trust.browser.mjs --url=http(s)://<origin> --playwright=<path> --shots=<dir>
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
const errors = [];
let step = 'boot';

const targetSelectors = [
  '#alarm-close-x', '#alarm-cond', '#alarm-price', '#alarm-pct', '#alarm-note',
  '#alarm-sound', '#alarm-repeat', '#alarm-volume', '#alarm-test-sound',
  '#alarm-telegram', '#alarm-webhook', '#alarm-permission', '#alarm-add',
  '#alarm-history', '#alarm-close'
];
const targetBoxes = page => page.evaluate(selectors => selectors.map(selector => {
  const el = document.querySelector(selector), r = el?.getBoundingClientRect();
  return { selector, w: r ? Math.round(r.width) : 0, h: r ? Math.round(r.height) : 0,
    display: el ? getComputedStyle(el).display : 'missing' };
}), targetSelectors);

const assertTargets = (label, targets) => {
  for (const item of targets) {
    assert.notEqual(item.display, 'missing', `${label}: missing ${item.selector}`);
    assert.notEqual(item.display, 'none', `${label}: hidden ${item.selector}`);
    assert.ok(item.w >= 44 && item.h >= 44, `${label}: small target ${item.selector} ${item.w}x${item.h}`);
  }
};

const waitMenuButton = page => page.waitForFunction(() => {
  const r = document.querySelector('#mobile-menu-open')?.getBoundingClientRect();
  return r && r.top >= 0 && r.bottom <= window.innerHeight;
}, null, { timeout: 5000 });

const openAlarm = async page => {
  await waitMenuButton(page);
  await page.click('#mobile-menu-open');
  await page.waitForFunction(() => document.body.classList.contains('menu-open'), null, { timeout: 5000 });
  await page.click('#menu-alarm');
  await page.waitForSelector('#alarm-scope', { state: 'visible', timeout: 5000 });
};

try {
  const context = await browser.newContext({
    ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/alfa-charts.html?debug=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__alfaDebug?.ready === true && document.querySelector('#chart-loading')?.hidden === true, null, { timeout: 30000 });

  step = 'menu-card';
  await waitMenuButton(page);
  await page.click('#mobile-menu-open');
  await page.waitForFunction(() => document.body.classList.contains('menu-open'), null, { timeout: 5000 });
  const menuCard = await page.evaluate(() => {
    const el = document.querySelector('.mobile-alarm-note');
    return { exists: !!el, hidden: el?.hidden === true, text: (el?.textContent || '').replace(/\s+/g, ' ').trim() };
  });
  assert.equal(menuCard.exists, false, 'local-alarm explanation must be removed from the menu');
  await page.screenshot({ path: path.join(shotDir, 'phase9-10-after-menu-card.png'), fullPage: false });

  step = 'dialog-card-and-targets';
  await page.click('#menu-alarm');
  await page.waitForSelector('#alarm-scope', { state: 'visible', timeout: 5000 });
  const dialogState = await page.evaluate(() => {
    const scope = document.querySelector('#alarm-scope'), quick = document.querySelector('#alarm-scope .alarm-scope-quick');
    const form = document.querySelector('#alarm-form');
    return {
      dialogClass: document.querySelector('dialog[open]')?.className || '',
      scopeText: scope?.textContent || '',
      quickText: quick?.textContent || '',
      quickDisplay: quick ? getComputedStyle(quick).display : 'missing',
      scopeBottom: scope?.getBoundingClientRect().bottom || 0,
      formTop: form?.getBoundingClientRect().top || Infinity,
      describedBy: form?.getAttribute('aria-describedby')
    };
  });
  assert.match(dialogState.dialogClass, /alarm-dialog/);
  assert.equal(dialogState.describedBy, 'alarm-scope');
  assert.match(dialogState.scopeText, /yalnızca seçili sembol/);
  assert.match(dialogState.scopeText, /Sekme\/cihaz kapalıyken/);
  assert.match(dialogState.scopeText, /Replay sırasında çalışmaz/);
  assert.match(dialogState.scopeText, /7\/24 sunucu alarmı değildir/);
  assert.match(dialogState.scopeText, /Telegram ve webhook/);
  assert.notEqual(dialogState.quickDisplay, 'none');
  assert.match(dialogState.quickText, /Yalnızca bu sekme açıkken/);
  assert.match(dialogState.quickText, /7\/24 sunucu alarmı değildir/);
  assert.ok(dialogState.scopeBottom <= dialogState.formTop + 1, 'scope card must stay above the form');
  assertTargets('alarm dialog', await targetBoxes(page));
  const reachable = [];
  for (const selector of ['#alarm-close-x', '#alarm-test-sound', '#alarm-permission', '#alarm-add']) {
    await page.locator(selector).scrollIntoViewIfNeeded();
    reachable.push(await page.evaluate(sel => {
      const el = document.querySelector(sel), r = el?.getBoundingClientRect();
      if (!r) return { selector: sel, ok: false };
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { selector: sel, ok: hit === el || el.contains(hit) };
    }, selector));
  }
  assert.ok(reachable.every(x => x.ok), `unreachable alarm controls: ${JSON.stringify(reachable.filter(x => !x.ok))}`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 1, `portrait horizontal overflow: ${overflow}px`);
  await page.screenshot({ path: path.join(shotDir, 'phase9-11-after-alarm-dialog.png'), fullPage: false });

  step = 'escape-parity';
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('dialog[open]'), null, { timeout: 5000 });
  assert.equal(await page.evaluate(() => document.body.classList.contains('menu-open')), false,
    'alarm Escape must not reopen the mobile menu closed by the dialog entry');
  await openAlarm(page);

  step = 'alarm-list-targets';
  await page.fill('#alarm-price', '1');
  await page.click('#alarm-add');
  await page.waitForFunction(() => document.querySelectorAll('#alarm-list button').length >= 5, null, { timeout: 5000 });
  const rowButtons = await page.evaluate(() => [...document.querySelectorAll('#alarm-list button')].map(el => {
    const r = el.getBoundingClientRect();
    return { selector: el.dataset.editAlarm ? 'edit' : el.dataset.toggleAlarm ? 'toggle' : el.dataset.muteAlarm ? 'mute' : el.dataset.testAlarm ? 'test' : 'delete',
      w: Math.round(r.width), h: Math.round(r.height) };
  }));
  for (const item of rowButtons) assert.ok(item.w >= 44 && item.h >= 44, `alarm row target ${item.selector} ${item.w}x${item.h}`);
  await page.screenshot({ path: path.join(shotDir, 'phase9-12-after-alarm-list.png'), fullPage: false });
  await page.click('#alarm-close');
  await page.waitForFunction(() => !document.querySelector('dialog[open]'), null, { timeout: 5000 });
  await context.close();

  step = 'landscape-after';
  const landscape = await browser.newContext({
    ...devices['iPhone 13'], viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true
  });
  const lp = await landscape.newPage();
  lp.on('pageerror', error => errors.push(`landscape: ${error.message}`));
  await lp.goto(origin + '/alfa-charts.html?debug=1', { waitUntil: 'domcontentloaded' });
  await lp.waitForFunction(() => window.__alfaDebug?.ready === true && document.querySelector('#chart-loading')?.hidden === true, null, { timeout: 30000 });
  await openAlarm(lp);
  const landscapeQuick = await lp.evaluate(() => {
    const el = document.querySelector('#alarm-scope .alarm-scope-quick'), r = el?.getBoundingClientRect();
    return { text: el?.textContent || '', display: el ? getComputedStyle(el).display : 'missing', h: r ? Math.round(r.height) : 0 };
  });
  assert.notEqual(landscapeQuick.display, 'none');
  assert.ok(landscapeQuick.h >= 44, `landscape warning card too short: ${landscapeQuick.h}`);
  assert.match(landscapeQuick.text, /Yalnızca bu sekme açıkken/);
  assertTargets('landscape alarm dialog', await targetBoxes(lp));
  const landscapeOverflow = await lp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(landscapeOverflow <= 1, `landscape horizontal overflow: ${landscapeOverflow}px`);
  await lp.screenshot({ path: path.join(shotDir, 'phase9-13-after-landscape.png'), fullPage: false });
  await landscape.close();

  step = 'desktop-smoke';
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const dp = await desktop.newPage();
  dp.on('pageerror', error => errors.push(`desktop: ${error.message}`));
  await dp.goto(origin + '/alfa-charts.html?debug=1', { waitUntil: 'domcontentloaded' });
  await dp.waitForFunction(() => window.__alfaDebug?.ready === true && document.querySelector('#chart-loading')?.hidden === true, null, { timeout: 30000 });
  const desktopBoxes = await dp.evaluate(() => {
    const box = sel => { const r = document.querySelector(sel)?.getBoundingClientRect(); return { w: r ? Math.round(r.width) : 0, h: r ? Math.round(r.height) : 0 }; };
    return { toolbar: box('.toolbar'), chart: box('#chart'), watchlist: box('#watchlist') };
  });
  assert.ok(desktopBoxes.toolbar.h >= 40 && desktopBoxes.chart.h >= 400 && desktopBoxes.watchlist.w >= 200,
    `desktop smoke: ${JSON.stringify(desktopBoxes)}`);
  await desktop.close();

  assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
  console.log(JSON.stringify({ result: 'PASS', step: 'complete', shots: 4 }, null, 2));
} catch (error) {
  console.log(JSON.stringify({ result: 'FAIL', step, error: String(error?.message || error), pageErrors: errors }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
