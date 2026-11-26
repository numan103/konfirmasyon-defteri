// Mobile trust/status and touch-target regression test. Anonymous; no credentials or user-data mutations.
// node tests/browser/alfa-trust-touch.browser.mjs --url=http://127.0.0.1:8787 --playwright=<path/to/playwright/index.mjs> --shots=docs/upgrade-screenshots
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
const orderRequests = [];
let step = 'load';
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => {
  if (/\/(order|orders|trade)(\?|$)/.test(new URL(request.url()).pathname)) orderRequests.push(request.url());
});

const snapshot = () => page.evaluate(() => {
  const box = selector => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), display: style.display };
  };
  return {
    viewport: { w: innerWidth, h: innerHeight },
    overflow: document.documentElement.scrollWidth - innerWidth,
    body: document.body.className,
    save: { text: document.querySelector('#mobile-save-state')?.textContent.trim() || '', state: document.querySelector('#mobile-save-state')?.dataset.state || '', box: box('#mobile-save-state') },
    alarmNote: { text: document.querySelector('.mobile-alarm-note')?.textContent.replace(/\s+/g, ' ').trim() || '', box: box('.mobile-alarm-note') },
    dialog: { open: !!document.querySelector('dialog[open]'), text: document.querySelector('dialog[open]')?.textContent.replace(/\s+/g, ' ').trim().slice(0, 700) || '' },
    paper: {
      panel: box('#paper-panel'),
      badge: { text: document.querySelector('#paper-panel .paper-sim-badge')?.textContent.replace(/\s+/g, ' ').trim() || '', box: box('#paper-panel .paper-sim-badge') }
    },
    strip: { panel: box('#mobile-market-strip'), menu: box('#mobile-menu-open'), star: box('#mobile-tools-star'), tf: box('#mobile-timeframe'), symbol: box('#mobile-market-pick') },
    tfRows: [...document.querySelectorAll('#mobile-tf-list button')].map(b => {
      const r = b.getBoundingClientRect();
      return { text: b.textContent.trim(), w: Math.round(r.width), h: Math.round(r.height) };
    }),
    chart: box('#chart')
  };
});

try {
  await page.goto(origin + '/alfa-charts.html?debug=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__alfaDebug?.ready === true && document.querySelector('#chart-loading')?.hidden === true, null, { timeout: 30000 });

  step = 'visible save state and alarm scope';
  const initial = await snapshot();
  assert.ok(initial.overflow <= 1, `unexpected horizontal overflow: ${initial.overflow}`);
  await page.click('#mobile-menu-open');
  await page.waitForFunction(() => document.body.classList.contains('menu-open'), null, { timeout: 4000 });
  await page.waitForTimeout(350);
  const menu = await snapshot();
  assert.equal(menu.save.text, '', 'guest/save-state explanation must stay hidden');
  assert.equal(menu.alarmNote.text, '', 'local-alarm explanation must stay hidden');
  await page.screenshot({ path: path.join(shotDir, 'phase4-02-menu-status.png') });
  await page.click('#menu-alarm');
  await page.waitForFunction(() => !!document.querySelector('dialog[open]'), null, { timeout: 4000 });
  const alarm = await snapshot();
  assert.match(alarm.dialog.text, /sekme|cihaz kapalı/i);
  await page.screenshot({ path: path.join(shotDir, 'phase4-03-alarm-dialog.png') });
  await page.click('dialog[open] button[aria-label="Kapat"]');
  await page.waitForFunction(() => !document.querySelector('dialog[open]'), null, { timeout: 4000 });

  step = 'paper simulation badge';
  await page.click('#mobile-menu-open');
  await page.click('#menu-replay');
  await page.waitForSelector('#replay-date-start', { state: 'visible' });
  const replayTime = await page.evaluate(() => window.__alfaDebug.history[600].time);
  await page.fill('#replay-date', new Date(replayTime * 1000).toISOString().slice(0, 16));
  await page.click('#replay-date-start');
  await page.waitForFunction(() => document.body.classList.contains('replay-mode'), null, { timeout: 10000 });
  await page.click('#paper-toggle');
  await page.waitForFunction(() => document.querySelector('#paper-panel')?.hidden === false, null, { timeout: 6000 });
  const paper = await snapshot();
  assert.ok(paper.paper.badge.box && paper.paper.badge.box.h >= 24, 'permanent simulation badge must be visible');
  assert.match(paper.paper.badge.text, /EMİR YOK/i);
  assert.deepEqual(orderRequests, [], 'no real order request may be sent');
  await page.screenshot({ path: path.join(shotDir, 'phase4-04-paper-badge.png') });
  await page.click('#paper-panel [data-filter="tester"]');
  await page.waitForTimeout(200);
  const testerTab = await snapshot();
  assert.match(testerTab.paper.badge.text, /EMİR YOK/i, 'badge must survive tab switches');
  await page.click('#paper-panel [data-filter="all"]');
  await page.waitForTimeout(200);
  const allTab = await snapshot();
  assert.match(allTab.paper.badge.text, /EMİR YOK/i, 'badge must survive re-render');

  step = 'touch targets';
  await page.click('#paper-panel [data-action="hide"]');
  await page.waitForFunction(() => document.querySelector('#paper-panel')?.hidden === true, null, { timeout: 6000 });
  const portrait = await snapshot();
  for (const key of ['menu', 'star', 'tf']) {
    assert.ok(portrait.strip[key].w >= 44 && portrait.strip[key].h >= 44, `portrait ${key} target too small: ${JSON.stringify(portrait.strip[key])}`);
  }
  assert.ok(portrait.chart.h >= 700, `portrait chart too small: ${portrait.chart.h}`);

  step = 'timeframe rows';
  await page.click('#mobile-timeframe');
  await page.waitForFunction(() => document.body.classList.contains('timeframes-open'), null, { timeout: 4000 });
  await page.waitForTimeout(250);
  const tf = await snapshot();
  assert.ok(tf.tfRows.length >= 9, `expected 9 timeframe rows, got ${tf.tfRows.length}`);
  assert.ok(tf.tfRows.every(row => row.h >= 44), `timeframe rows must be >=44px: ${JSON.stringify(tf.tfRows)}`);
  assert.ok(tf.overflow <= 1, `timeframe sheet caused horizontal overflow: ${tf.overflow}`);
  await page.screenshot({ path: path.join(shotDir, 'phase4-05-timeframes.png') });
  await page.click('#mobile-tf-close');
  await page.waitForFunction(() => !document.body.classList.contains('timeframes-open'), null, { timeout: 4000 });

  step = 'landscape preserved';
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(500);
  const landscape = await snapshot();
  assert.ok(landscape.strip.panel.h >= 44 && landscape.strip.panel.h <= 56, `landscape strip must keep 44px targets: ${landscape.strip.panel.h}`);
  for (const key of ['menu', 'star', 'tf']) {
    assert.ok(landscape.strip[key].w >= 44 && landscape.strip[key].h >= 44, `landscape ${key} target too small: ${JSON.stringify(landscape.strip[key])}`);
  }
  assert.ok(landscape.chart.h >= 300, `landscape chart too small: ${landscape.chart.h}`);
  assert.ok(landscape.overflow <= 1, `landscape horizontal overflow: ${landscape.overflow}`);
  await page.screenshot({ path: path.join(shotDir, 'phase4-06-landscape.png') });

  step = 'desktop smoke';
  const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const desktopPage = await desktopContext.newPage();
  const desktopErrors = [];
  desktopPage.on('pageerror', error => desktopErrors.push(error.message));
  await desktopPage.goto(origin + '/alfa-charts.html?debug=1', { waitUntil: 'domcontentloaded' });
  await desktopPage.waitForFunction(() => window.__alfaDebug?.ready === true && document.querySelector('#chart canvas'), null, { timeout: 30000 });
  const desktop = await desktopPage.evaluate(() => {
    const box = selector => { const el = document.querySelector(selector); if (!el) return null; const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), display: getComputedStyle(el).display }; };
    return { toolbar: box('.toolbar'), chart: box('#chart'), watchlist: box('#watchlist') };
  });
  assert.equal(desktop.toolbar.display, 'flex');
  assert.ok(desktop.chart.w >= 1100 && desktop.watchlist.w >= 240);
  assert.deepEqual(desktopErrors, []);
  await desktopContext.close();

  assert.deepEqual(errors, [], 'page errors');
  console.log(JSON.stringify({ result: 'PASS', initial, menu, alarm, paper, testerTab, allTab, portrait, tf, landscape, desktop, orderRequests, errors }, null, 2));
} catch (error) {
  let current = null;
  try { current = await snapshot(); } catch {}
  console.error(JSON.stringify({ result: 'FAIL', step, error: String(error?.message || error), current, orderRequests, errors }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
