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
  await page.waitForFunction(() => document.querySelectorAll('#drawing-tools button').length > 0, { timeout: 30000 });

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
      marketStrip: box('#mobile-market-strip'),
      tools: box('#drawing-tools'),
      grip: box('#price-scale-grip'),
      timeframeCount: document.querySelectorAll('#timeframes button').length,
      studyChipCount: document.querySelectorAll('#study-legend .study-chip').length,
      brandDisplay: getComputedStyle(document.querySelector('.brand')).display,
      chartTouchAction: getComputedStyle(document.querySelector('#chart')).touchAction,
      toolsOpen: document.body.classList.contains('tools-open'),
      settingsOpen: document.body.classList.contains('settings-open'),
      toolsInSheet: document.querySelector('#mobile-tools-sheet')?.contains(document.querySelector('#drawing-tools')),
      toolButtonCount: document.querySelectorAll('#drawing-tools button').length,
      paletteControls: document.querySelectorAll('#mobile-palette-form input').length,
      marketSymbol: document.querySelector('#mobile-market-symbol')?.textContent || ''
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
  assert.equal(before.toolsInSheet, true, 'drawing tools must live in the mobile sheet');
  assert.ok(before.toolButtonCount > 4, 'drawing tool buttons must render in the sheet');
  assert.ok(before.marketStrip && before.marketStrip.h >= 30, 'market swipe strip must be visible');
  assert.ok(before.studyChipCount > 0, 'indicator chips must be embedded in the legend');

  // Tools icon opens a centered bottom sheet, not a side rail.
  await page.click('#mobile-tools-toggle');
  await page.waitForFunction(() => {
    const el = document.querySelector('#drawing-tools');
    const sheet = document.querySelector('#mobile-tools-sheet');
    if (!el || !sheet) return false;
    const r = el.getBoundingClientRect();
    return document.body.classList.contains('tools-open') && r.y > innerHeight * 0.25 && r.y < innerHeight - 20;
  }, { timeout: 5000 });
  const opened = await read();
  assert.equal(opened.toolsOpen, true);
  assert.ok(opened.tools.w > 250, 'tool grid must be wide enough to tap');
  await page.click('#mobile-tools-close');
  await page.waitForFunction(() => !document.body.classList.contains('tools-open'));

  // Settings sheet exposes live palette controls and day/night mode.
  await page.click('#mobile-settings-toggle');
  await page.waitForFunction(() => document.body.classList.contains('settings-open') &&
    document.querySelectorAll('#mobile-palette-form input').length >= 8, { timeout: 5000 });
  assert.ok((await read()).paletteControls >= 8);
  await page.click('[data-mobile-theme="light"]');
  await page.waitForFunction(() => document.body.classList.contains('mobile-light'));
  const lightBackground = await page.evaluate(() => document.querySelector('#chart').style.background || getComputedStyle(document.querySelector('#chart')).backgroundColor);
  assert.match(lightBackground, /247|f7f9fc/i, 'light theme must repaint the canvas');
  await page.click('#mobile-settings-done');
  await page.waitForFunction(() => !document.body.classList.contains('settings-open'));

  // Indicator browser becomes a bottom sheet instead of a centered dialog.
  await page.click('#indicators-manage');
  await page.waitForFunction(() => !!document.querySelector('dialog.chart-dialog[open]'), { timeout: 5000 });
  const dialogTop = await page.evaluate(() => document.querySelector('dialog.chart-dialog').getBoundingClientRect().top);
  assert.ok(dialogTop > before.viewport.h * 0.15, 'indicator dialog must anchor to the bottom on phones');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('dialog.chart-dialog[open]'));

  // Vertical swipe on the market strip cycles symbols.
  const strip = await page.$('#mobile-market-strip');
  const stripBox = await strip.boundingBox();
  const sx = stripBox.x + stripBox.width / 2;
  const sy = stripBox.y + stripBox.height / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx, sy + 52, { steps: 6 });
  await page.mouse.up();
  await page.waitForFunction(initial => document.querySelector('#mobile-market-symbol')?.textContent !== initial,
    before.marketSymbol, { timeout: 10000 });
  const afterSwipe = await read();
  assert.notEqual(afterSwipe.marketSymbol, before.marketSymbol, 'swipe must change the active symbol');

  // Price scale grip still engages on vertical drag.
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
    studyChipCount: before.studyChipCount, toolButtonCount: before.toolButtonCount,
    marketSymbolBefore: before.marketSymbol, marketSymbolAfter: afterSwipe.marketSymbol,
    toolsSheetChecked: true, settingsSheetChecked: true, indicatorSheetChecked: true,
    marketSwipeChecked: true, priceScaleDragChecked: true, screenshot: shot, pageErrors: errors }, null, 2));
} finally {
  await browser.close();
}
