// FAZ 6 phone chart-interaction regression test. Anonymous; no credentials or user-data mutations.
// node tests/browser/alfa-mobile-chart-interactions.browser.mjs --url=http://127.0.0.1:8787 --playwright=<path/to/playwright/index.mjs> --shots=<dir>
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

try {
  await page.goto(origin + '/alfa-charts.html?debug=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__alfaDebug?.ready === true && document.querySelector('#chart-loading')?.hidden === true, null, { timeout: 30000 });
  await page.waitForFunction(() => window.__alfaDebug?.history?.length > 30, null, { timeout: 30000 });

  step = 'readout-baseline';
  const baseline = await page.evaluate(() => {
    const node = document.querySelector('#mobile-candle-readout');
    return { hidden: node?.hidden, display: node ? getComputedStyle(node).display : 'missing',
      reset: !!document.querySelector('#menu-reset'), pointerEvents: node ? getComputedStyle(node).pointerEvents : 'missing' };
  });
  assert.equal(baseline.hidden, true, 'readout must start hidden');
  assert.equal(baseline.display, 'none', 'hidden readout must not take layout space');
  assert.equal(baseline.reset, true, 'mobile reset entry is missing');

  step = 'tap-readout';
  const chart = await page.locator('#chart').boundingBox();
  await page.mouse.click(chart.x + chart.width * 0.42, chart.y + chart.height * 0.38);
  await page.waitForFunction(() => {
    const node = document.querySelector('#mobile-candle-readout');
    return node && !node.hidden && /O\s/.test(node.textContent) && /H\s/.test(node.textContent) && /L\s/.test(node.textContent) && /C\s/.test(node.textContent);
  }, null, { timeout: 8000 });
  const readout = await page.evaluate(() => {
    const node = document.querySelector('#mobile-candle-readout');
    const r = node.getBoundingClientRect();
    return { text: node.textContent, hidden: node.hidden, top: r.top, bottom: r.bottom, width: r.width };
  });
  assert.match(readout.text, /V\s+[\d.]+[KMB]?/, 'volume missing from crosshair readout');
  assert.match(readout.text, /\d{1,2}:\d{2}/, 'time missing from crosshair readout');
  assert.ok(readout.width > 100, 'readout must be legible on a phone');
  await page.screenshot({ path: path.join(shotDir, 'phase6-10-after-tap-readout.png'), fullPage: false });

  step = 'mobile-reset';
  await page.evaluate(() => {
    const host = document.querySelector('#chart');
    host.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'touch', pointerId: 90, clientX: 120, clientY: 300, bubbles: true }));
    window.__alfaDebug.chart.timeScale().setVisibleLogicalRange({ from: 12, to: 48 });
  });
  await page.waitForFunction(() => Object.keys(localStorage).some(k => k.startsWith('alfa-chart-viewport:v1')), null, { timeout: 6000 });
  await page.click('#mobile-menu-open');
  await page.waitForFunction(() => document.body.classList.contains('menu-open'), null, { timeout: 5000 });
  await page.click('#menu-reset');
  await page.waitForFunction(() => !document.body.classList.contains('menu-open'), null, { timeout: 5000 });
  await page.waitForTimeout(1000);
  const reset = await page.evaluate(() => {
    const debug = window.__alfaDebug;
    return { range: debug.chart.timeScale().getVisibleLogicalRange(), length: debug.history.length,
      scale: debug.chart.priceScale('right').options().scaleMargins,
      saved: Object.keys(localStorage).filter(k => k.startsWith('alfa-chart-viewport:v1')) };
  });
  assert.ok(reset.range.to >= reset.length - 1 && reset.range.to - reset.range.from < 80, 'reset must show recent candles');
  assert.deepEqual(reset.scale, { top: 0.12, bottom: 0.22 }, 'reset must restore price margins');
  assert.equal(reset.saved.length, 0, 'reset must clear a persisted viewport');

  step = 'viewport-persistence';
  await page.evaluate(() => {
    const host = document.querySelector('#chart');
    host.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'touch', pointerId: 91, clientX: 120, clientY: 300, bubbles: true }));
    window.__alfaDebug.chart.timeScale().setVisibleLogicalRange({ from: 12, to: 48 });
  });
  await page.waitForFunction(() => {
    const key = Object.keys(localStorage).find(k => k.startsWith('alfa-chart-viewport:v1'));
    if (!key) return false;
    const vp = JSON.parse(localStorage.getItem(key) || 'null');
    return vp && Math.abs(vp.from - 12) < 2 && Math.abs(vp.to - 48) < 2;
  }, null, { timeout: 6000 });
  const stored = await page.evaluate(() => {
    const key = Object.keys(localStorage).find(k => k.startsWith('alfa-chart-viewport:v1'));
    return JSON.parse(localStorage.getItem(key));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__alfaDebug?.ready === true && document.querySelector('#chart-loading')?.hidden === true, null, { timeout: 30000 });
  await page.waitForFunction(() => window.__alfaDebug?.history?.length > 30, null, { timeout: 30000 });
  const restored = await page.evaluate(() => window.__alfaDebug.chart.timeScale().getVisibleLogicalRange());
  assert.ok(Math.abs(restored.from - stored.from) < 3 && Math.abs(restored.to - stored.to) < 3,
    `viewport not restored after reload: ${JSON.stringify(stored)} -> ${JSON.stringify(restored)}`);
  await page.screenshot({ path: path.join(shotDir, 'phase6-11-after-persisted-viewport.png'), fullPage: false });

  step = 'drawing-pan-guard';
  await page.click('#mobile-draw-quick [data-tool="fibonacci"]');
  await page.waitForFunction(() => document.querySelector('#chart')?.dataset.drawingTool === 'fibonacci', null, { timeout: 5000 });
  const box = await page.locator('#chart').boundingBox();
  await page.mouse.click(box.x + 80, box.y + box.height * 0.36);
  await page.waitForFunction(() => /ikinci noktayı seçin/i.test(document.querySelector('#mobile-draw-hint')?.textContent || ''), null, { timeout: 5000 });
  await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.55);
  await page.waitForFunction(() => window.__alfaDebug?.drawings?.history?.doc?.drawings?.length >= 1, null, { timeout: 8000 });
  const hitPoint = await page.evaluate(() => {
    const hit = document.querySelector('#chart [data-id]');
    if (!hit) return null;
    const r = hit.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  assert.ok(hitPoint, 'drawing hit target missing');
  const before = await page.evaluate(() => ({ ...window.__alfaDebug.chart.priceScale('right').options().scaleMargins }));
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: hitPoint.x, y: hitPoint.y, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: hitPoint.x, y: hitPoint.y + 140, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const guard = { hit: true, before, after: await page.evaluate(() => ({ ...window.__alfaDebug.chart.priceScale('right').options().scaleMargins })) };
  assert.equal(guard.hit, true, 'drawing hit target missing');
  assert.deepEqual(guard.after, guard.before, 'touch-dragging a drawing must not pan the price scale');
  await page.screenshot({ path: path.join(shotDir, 'phase6-12-after-drawing-guard.png'), fullPage: false });

  step = 'landscape-after';
  const landscapeContext = await browser.newContext({
    ...devices['iPhone 13'],
    viewport: { width: 844, height: 390 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });
  const landscapePage = await landscapeContext.newPage();
  landscapePage.on('pageerror', error => errors.push(`landscape: ${error.message}`));
  await landscapePage.goto(origin + '/alfa-charts.html?debug=1', { waitUntil: 'domcontentloaded' });
  await landscapePage.waitForFunction(() => window.__alfaDebug?.ready === true && document.querySelector('#chart-loading')?.hidden === true, null, { timeout: 30000 });
  await landscapePage.screenshot({ path: path.join(shotDir, 'phase6-13-after-landscape.png'), fullPage: false });
  await landscapeContext.close();

  assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
  console.log(JSON.stringify({ result: 'PASS', step: 'complete', shots: 4 }, null, 2));
} catch (error) {
  console.log(JSON.stringify({ result: 'FAIL', step, error: String(error?.message || error), pageErrors: errors }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
