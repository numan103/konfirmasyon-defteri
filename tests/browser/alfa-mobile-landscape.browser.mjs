// Landscape phone-shell regression test. Anonymous; no credentials or user-data mutations.
// node tests/browser/alfa-mobile-landscape.browser.mjs --url=http://127.0.0.1:8787 --playwright=<path/to/playwright/index.mjs> --shots=docs/upgrade-screenshots
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

const metrics = () => page.evaluate(() => {
  const box = selector => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), display: getComputedStyle(el).display };
  };
  const drawing = window.__alfaDebug?.drawings?.history?.doc?.drawings?.at(-1);
  return {
    viewport: { w: innerWidth, h: innerHeight },
    doc: { w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight },
    landscape: matchMedia('(orientation: landscape)').matches,
    mobileShell: document.body.classList.contains('mobile-shell'),
    mobileLandscape: document.body.classList.contains('mobile-landscape'),
    toolbar: box('.toolbar'),
    chart: box('#chart'),
    strip: box('.mobile-market-strip'),
    home: box('#chart-home'),
    menuToggle: box('#mobile-menu-open'),
    activeTool: document.querySelector('#chart')?.dataset.drawingTool,
    drawingCount: window.__alfaDebug?.drawings?.history?.doc?.drawings?.length ?? -1,
    drawing: drawing ? { id: drawing.id, type: drawing.type, points: drawing.points.map(p => ({ time: p.time, price: p.price })) } : null,
    range: window.__alfaDebug?.chart?.timeScale?.().getVisibleLogicalRange?.() || null
  };
});

const closeSheet = async () => {
  await page.click('#mobile-tools-close', { force: true }).catch(() => {});
  await page.waitForFunction(() => !document.body.classList.contains('tools-open'), null, { timeout: 4000 });
};

// The tools sheet remembers its last group, so return to the category list first.
const openTools = async () => {
  await page.click('#mobile-menu-open');
  await page.waitForFunction(() => document.body.classList.contains('menu-open'), null, { timeout: 4000 });
  await page.click('#menu-tools');
};
const armFibonacci = async () => {
  await openTools();
  await page.waitForFunction(() => document.body.classList.contains('tools-open'), null, { timeout: 4000 });
  if (!await page.locator('#mobile-all-tools [data-group="fib"]').count()) {
    await page.click('#mobile-tools-back');
  }
  await page.click('#mobile-all-tools [data-group="fib"]');
  await page.click('#mobile-all-tools [data-tool="fibonacci"]');
  await page.waitForFunction(() => document.querySelector('#chart')?.dataset.drawingTool === 'fibonacci', null, { timeout: 5000 });
  await closeSheet();
};

try {
  await page.goto(origin + '/alfa-charts.html?debug=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__alfaDebug?.ready === true && !!document.querySelector('#chart canvas'), null, { timeout: 30000 });
  await page.waitForFunction(() => document.querySelector('#chart-loading')?.hidden === true, null, { timeout: 30000 });

  const portraitBefore = await metrics();
  assert.equal(portraitBefore.toolbar.display, 'none', 'portrait toolbar must stay hidden');
  assert.ok(portraitBefore.chart.h >= 700, `portrait chart too small: ${portraitBefore.chart.h}`);

  // Create a real Fibonacci with the same two-tap gesture a phone user uses.
  await armFibonacci();
  const chartBox = await page.evaluate(() => {
    const r = document.querySelector('#chart').getBoundingClientRect();
    return { left: r.left, top: r.top, w: r.width, h: r.height };
  });
  await page.mouse.click(chartBox.left + 70, chartBox.top + chartBox.h * 0.32);
  await page.mouse.move(chartBox.left + chartBox.w * 0.55, chartBox.top + chartBox.h * 0.64, { steps: 8 });
  await page.mouse.click(chartBox.left + chartBox.w * 0.55, chartBox.top + chartBox.h * 0.64);
  await page.waitForFunction(() => window.__alfaDebug.drawings.history.doc.drawings.length === 1, null, { timeout: 6000 });
  const drawn = await metrics();
  assert.equal(drawn.drawing?.type, 'fibonacci');
  await page.screenshot({ path: path.join(shotDir, 'phase1-01-portrait-drawn.png'), fullPage: false });

  // Completing a drawing returns the engine to cursor. Arm Fibonacci again so
  // rotation has a real active tool to preserve.
  await armFibonacci();
  const beforeRotate = await metrics();
  assert.equal(beforeRotate.activeTool, 'fibonacci');

  // Portrait -> landscape.
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(700);
  const landscape = await metrics();
  await page.screenshot({ path: path.join(shotDir, 'phase1-02-landscape.png'), fullPage: false });
  assert.equal(landscape.landscape, true);
  assert.equal(landscape.mobileShell, true);
  assert.equal(landscape.mobileLandscape, true);
  assert.equal(landscape.toolbar.display, 'none', 'landscape must not restore the desktop toolbar');
  assert.ok(landscape.chart.h >= 300, `landscape chart too small: ${landscape.chart.h}`);
  assert.ok(landscape.doc.h <= 400, `landscape page still scrolls: ${landscape.doc.h}`);
  assert.ok(landscape.strip.h >= 44 && landscape.strip.h <= 56, `landscape strip must keep 44px targets without eating the chart: ${landscape.strip.h}`);
  assert.equal(landscape.home.display, 'flex', 'landscape home icon should stay reachable');
  assert.equal(landscape.activeTool, 'fibonacci', 'active tool must survive rotation');
  assert.equal(landscape.drawingCount, 1);
  assert.deepEqual(landscape.drawing, drawn.drawing, 'drawing coordinates must survive rotation');
  assert.ok(Math.abs(landscape.range.from - drawn.range.from) < 2, 'visible range start drifted on rotation');

  // Drawing tools must be reachable in landscape through the compact strip menu.
  assert.equal(landscape.menuToggle.display, 'flex');
  await openTools();
  if (!await page.locator('#mobile-all-tools [data-group="fib"]').count()) {
    await page.click('#mobile-tools-back');
  }
  await page.click('#mobile-all-tools [data-group="fib"]');
  await page.waitForSelector('#mobile-all-tools [data-tool="fibonacci"]', { state: 'visible', timeout: 4000 });
  await closeSheet();

  // Landscape -> portrait.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(700);
  const portraitAfter = await metrics();
  await page.screenshot({ path: path.join(shotDir, 'phase1-03-portrait-restored.png'), fullPage: false });
  assert.equal(portraitAfter.landscape, false);
  assert.equal(portraitAfter.mobileShell, true);
  assert.equal(portraitAfter.mobileLandscape, false);
  assert.equal(portraitAfter.toolbar.display, 'none');
  assert.ok(portraitAfter.chart.h >= 700, `portrait chart not restored: ${portraitAfter.chart.h}`);
  assert.ok(portraitAfter.doc.h <= 844, `portrait page still scrolls: ${portraitAfter.doc.h}`);
  assert.equal(portraitAfter.activeTool, 'fibonacci');
  assert.deepEqual(portraitAfter.drawing, drawn.drawing, 'drawing coordinates must survive the return to portrait');
  assert.ok(Math.abs(portraitAfter.range.from - drawn.range.from) < 2, 'visible range start drifted after returning to portrait');

  assert.deepEqual(errors, [], 'page errors');
  console.log(JSON.stringify({ result: 'PASS', portraitBefore, drawn, landscape, portraitAfter, errors }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ result: 'FAIL', error: String(error?.message || error), errors }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
