// Phone-shell smoke test for alfa-charts.html. Anonymous; no credentials or mutations.
// node tests/browser/alfa-mobile-shell.browser.mjs --url=<staging-origin> --playwright=<path/to/playwright/index.mjs>
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const arg = key => process.argv.find(s => s.startsWith(`--${key}=`))?.split('=').slice(1).join('=');
const origin = arg('url');
assert.ok(origin && /^https:\/\//.test(origin), '--url=https://<staging-origin> is required');
const { chromium, devices } = await import(pathToFileURL(path.resolve(arg('playwright') || 'node_modules/playwright/index.mjs')));
const browser = await chromium.launch({
  executablePath: arg('chrome') || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true
});
const context = await browser.newContext({
  ...devices['iPhone 13'],
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto(origin + '/alfa-charts.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('#timeframes button').length > 0, { timeout: 30000 });
  await page.waitForFunction(() => !!document.querySelector('#chart canvas'), { timeout: 30000 });

  const read = () => page.evaluate(() => {
    const box = selector => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    };
    return {
      viewport: { w: innerWidth, h: innerHeight },
      doc: { w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight },
      toolbar: box('.toolbar'),
      chart: box('#chart'),
      tools: box('#drawing-tools'),
      toggle: box('#mobile-tools-toggle'),
      grip: box('#price-scale-grip'),
      timeframeCount: document.querySelectorAll('#timeframes button').length,
      brandDisplay: getComputedStyle(document.querySelector('.brand')).display,
      chartTouchAction: getComputedStyle(document.querySelector('#chart')).touchAction,
      toolsOpen: document.body.classList.contains('tools-open'),
      toggleExpanded: document.querySelector('#mobile-tools-toggle')?.getAttribute('aria-expanded')
    };
  });

  const before = await read();
  assert.equal(before.brandDisplay, 'none', 'brand header must be hidden on phones');
  assert.ok(before.timeframeCount > 4, 'timeframes must render');
  assert.ok(before.toolbar.h > 0 && before.toolbar.h <= 60, 'top bar must be a single compact row');
  assert.ok(before.chart.h > before.viewport.h * 0.55, 'chart must occupy most of the screen');
  assert.equal(before.doc.h, before.viewport.h, 'document must not scroll vertically');
  assert.equal(before.doc.w, before.viewport.w, 'document must not scroll horizontally');
  assert.equal(before.chartTouchAction, 'none', 'chart touch gestures must stay inside the chart');
  assert.equal(before.toolsOpen, false);

  await page.click('#mobile-tools-toggle');
  await page.waitForFunction(() => {
    const el = document.querySelector('#drawing-tools');
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.y > innerHeight * 0.6 && r.y < innerHeight - 20;
  }, { timeout: 5000 });
  const opened = await read();
  assert.equal(opened.toolsOpen, true, 'tool dock must open');
  assert.equal(opened.toggleExpanded, 'true');
  assert.ok(opened.tools.w > 300, 'tool dock must be horizontal');
  assert.ok(opened.tools.y < opened.viewport.h - 20 && opened.tools.y > opened.viewport.h * 0.6,
    'tool dock must sit above the bottom navigation');
  await page.click('#mobile-tools-toggle');

  const grip = await page.$('#price-scale-grip');
  assert.ok(grip, 'price scale grip must exist');
  const box = await grip.boundingBox();
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX, startY + 60, { steps: 6 });
  const scaling = await page.evaluate(() => document.body.classList.contains('price-scaling'));
  await page.mouse.up();
  assert.equal(scaling, true, 'vertical price-scale drag must engage');

  const shot = 'C:/Users/Pc/AppData/Local/ALFA/PrivateBackups/alfa-mobile-shell.png';
  await page.screenshot({ path: shot, fullPage: false });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, origin, viewport: before.viewport, document: before.doc,
    toolbarHeight: before.toolbar.h, chartHeight: before.chart.h, timeframeCount: before.timeframeCount,
    toolsOpenChecked: true, priceScaleDragChecked: true, screenshot: shot, pageErrors: errors }, null, 2));
} finally {
  await browser.close();
}
