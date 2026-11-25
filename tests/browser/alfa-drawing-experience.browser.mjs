// Phone drawing-UX regression test. Anonymous; no credentials or user-data mutations.
// node tests/browser/alfa-drawing-experience.browser.mjs --url=http://127.0.0.1:8787 --playwright=<path/to/playwright/index.mjs> --shots=docs/upgrade-screenshots
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
let step = 'load';
page.on('pageerror', error => errors.push(error.message));

const state = () => page.evaluate(() => {
  const box = selector => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), display: getComputedStyle(el).display };
  };
  const buttons = selector => [...document.querySelectorAll(`${selector} button`)].map(b => ({
    key: b.dataset.quick || null, tool: b.dataset.tool || null, pressed: b.getAttribute('aria-pressed'),
    disabled: b.disabled, w: Math.round(b.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height)
  }));
  const d = window.__alfaDebug?.drawings?.history?.doc?.drawings?.at(-1);
  return {
    quick: box('#mobile-draw-quick'),
    quickButtons: buttons('#mobile-draw-quick'),
    actions: box('#mobile-draw-actions'),
    actionButtons: buttons('#mobile-draw-actions'),
    hint: document.querySelector('#mobile-draw-hint')?.hidden ? '' : document.querySelector('#mobile-draw-hint')?.textContent.trim(),
    tool: document.querySelector('#chart')?.dataset.drawingTool,
    selectedClass: document.body.classList.contains('drawing-selected'),
    drawing: d ? { id: d.id, type: d.type, locked: !!d.locked, hidden: !!d.hidden, points: d.points.map(p => ({ time: p.time, price: p.price })) } : null,
    count: window.__alfaDebug?.drawings?.history?.doc?.drawings?.length ?? -1,
    favs: [...(window.__alfaDebug?.drawings?.favs || [])],
    range: window.__alfaDebug?.chart?.timeScale?.().getVisibleLogicalRange?.() || null
  };
});

const chartBox = () => page.evaluate(() => {
  const r = document.querySelector('#chart').getBoundingClientRect();
  return { left: r.left, top: r.top, w: r.width, h: r.height };
});

try {
  await page.goto(origin + '/alfa-charts.html?debug=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__alfaDebug?.ready === true && document.querySelector('#chart-loading')?.hidden === true, null, { timeout: 30000 });
  await page.waitForFunction(() => document.querySelector('#mobile-draw-quick')?.querySelectorAll('button').length >= 5, null, { timeout: 10000 });

  const initial = await state();
  assert.equal(initial.quick.display, 'flex', 'quick tools must be visible on a phone');
  for (const tool of ['fibonacci', 'horizontal', 'trend', 'long', 'short']) {
    assert.ok(initial.quickButtons.some(b => b.tool === tool && b.w >= 44 && b.h >= 44), `missing 44px quick tool: ${tool}`);
  }
  for (const key of ['undo', 'redo', 'tools']) {
    assert.ok(initial.quickButtons.some(b => b.key === key && b.w >= 44 && b.h >= 44), `missing quick action: ${key}`);
  }
  assert.equal(initial.actions.display, 'none', 'edit actions must stay hidden without a selection');
  assert.equal(initial.hint, '');

  // One tap arms a tool; long press toggles the persistent favorite list.
  await page.locator('#mobile-draw-quick [data-tool="long"]').dispatchEvent('contextmenu');
  await page.waitForFunction(() => window.__alfaDebug.drawings.favs.includes('long'), null, { timeout: 4000 });
  const favorited = await state();
  assert.ok(favorited.favs.includes('long'));
  const storedFavs = await page.evaluate(() => JSON.parse(localStorage.getItem('alfa-draw-fav:v1') || '[]'));
  assert.ok(storedFavs.includes('long'), 'favorite must be persisted locally');

  // Chart panning must keep working while no tool is armed.
  step = 'pan';
  const box = await chartBox();
  const beforePan = (await state()).range.from;
  await page.mouse.move(box.left + box.w * 0.3, box.top + box.h * 0.55);
  await page.mouse.down();
  await page.mouse.move(box.left + box.w * 0.62, box.top + box.h * 0.55, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(350);
  const afterPan = (await state()).range.from;
  assert.ok(Math.abs(afterPan - beforePan) > 1, `chart did not pan with cursor tool: ${beforePan} -> ${afterPan}`);

  // Tapping a quick button must arm the tool, not draw on the chart.
  const beforeArm = (await state()).count;
  step = 'arm';
  await page.click('#mobile-draw-quick [data-tool="fibonacci"]');
  await page.waitForFunction(() => document.querySelector('#chart')?.dataset.drawingTool === 'fibonacci', null, { timeout: 5000 });
  await page.waitForFunction(() => document.querySelector('#mobile-draw-quick [data-tool="fibonacci"]')?.getAttribute('aria-pressed') === 'true', null, { timeout: 4000 });
  const armed = await state();
  assert.equal(armed.count, beforeArm, 'quick-tool tap must not create a drawing');
  assert.equal(armed.quickButtons.find(b => b.tool === 'fibonacci')?.pressed, 'true', 'selected tool must be visibly pressed');
  assert.match(armed.hint, /başlangıç noktasını seçin/i, 'first-point guidance missing');
  await page.screenshot({ path: path.join(shotDir, 'phase2-01-armed.png'), fullPage: false });

  const box2 = await chartBox();
  step = 'first-point';
  await page.mouse.click(box2.left + 80, box2.top + box2.h * 0.35);
  await page.waitForFunction(() => /ikinci noktayı seçin/i.test(document.querySelector('#mobile-draw-hint')?.textContent || ''), null, { timeout: 4000 });
  const firstPoint = await state();
  assert.match(firstPoint.hint, /ikinci noktayı seçin/i, 'second-point guidance missing');
  await page.screenshot({ path: path.join(shotDir, 'phase2-02-second-point.png'), fullPage: false });

  step = 'second-point';
  await page.mouse.move(box2.left + box2.w * 0.55, box2.top + box2.h * 0.62, { steps: 8 });
  await page.mouse.click(box2.left + box2.w * 0.55, box2.top + box2.h * 0.62);
  await page.waitForFunction(() => window.__alfaDebug.drawings.history.doc.drawings.length === 1, null, { timeout: 6000 });
  await page.waitForFunction(() => !document.querySelector('#mobile-draw-actions')?.hidden, null, { timeout: 4000 });
  const completed = await state();
  assert.equal(completed.count, 1);
  assert.equal(completed.drawing.type, 'fibonacci');
  assert.equal(completed.tool, 'cursor', 'engine keeps returning to cursor after a completed drawing');
  assert.equal(completed.selectedClass, true);
  assert.equal(completed.quick.display, 'none', 'quick tools yield to contextual edit actions');
  for (const key of ['settings', 'undo', 'redo', 'lock', 'hide', 'remove', 'tools']) {
    assert.ok(completed.actionButtons.some(b => b.key === key && b.w >= 44 && b.h >= 44), `missing edit action: ${key}`);
  }
  assert.match(completed.hint, /seçildi/i);
  await page.screenshot({ path: path.join(shotDir, 'phase2-03-edit-actions.png'), fullPage: false });

  step = 'lock';
  await page.click('#mobile-draw-actions [data-quick="lock"]');
  await page.waitForFunction(() => window.__alfaDebug.drawings.history.doc.drawings.at(-1)?.locked === true, null, { timeout: 4000 });
  await page.click('#mobile-draw-actions [data-quick="unlock"]');
  await page.waitForFunction(() => window.__alfaDebug.drawings.history.doc.drawings.at(-1)?.locked !== true, null, { timeout: 4000 });

  step = 'hide';
  await page.click('#mobile-draw-actions [data-quick="hide"]');
  await page.waitForFunction(() => window.__alfaDebug.drawings.history.doc.drawings.at(-1)?.hidden === true, null, { timeout: 4000 });
  await page.waitForSelector('#mobile-draw-actions [data-quick="show"]', { state: 'visible', timeout: 4000 });
  const hiddenState = await state();
  assert.equal(hiddenState.actions.display, 'flex', 'hidden drawing must remain editable to allow unhiding');
  await page.click('#mobile-draw-actions [data-quick="show"]');
  await page.waitForFunction(() => window.__alfaDebug.drawings.history.doc.drawings.at(-1)?.hidden !== true, null, { timeout: 4000 });

  step = 'undo-redo';
  await page.click('#mobile-draw-actions [data-quick="undo"]');
  await page.waitForFunction(() => window.__alfaDebug.drawings.history.doc.drawings.at(-1)?.hidden === true, null, { timeout: 4000 });
  const undone = await state();
  assert.ok(undone.drawing?.hidden, 'undo must reverse the last edit');
  await page.click('#mobile-draw-actions [data-quick="redo"]');
  await page.waitForFunction(() => window.__alfaDebug.drawings.history.doc.drawings.at(-1)?.hidden !== true, null, { timeout: 4000 });
  const restored = (await state()).drawing;

  step = 'reload';
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__alfaDebug?.ready === true && document.querySelector('#chart-loading')?.hidden === true, null, { timeout: 30000 });
  await page.waitForFunction(() => window.__alfaDebug.drawings.history.doc.drawings.length === 1, null, { timeout: 10000 });
  const afterReload = await state();
  assert.deepEqual(afterReload.drawing, restored, 'drawing must survive reload with unchanged coordinates');
  assert.ok(afterReload.favs.includes('long'), 'favorite must survive reload');

  // Landscape keeps the same one-tap tools reachable.
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(500);
  const landscape = await state();
  assert.equal(landscape.quick.display, 'flex', 'quick tools must stay reachable in landscape');
  for (const tool of ['fibonacci', 'horizontal', 'trend', 'long', 'short']) {
    assert.ok(landscape.quickButtons.some(b => b.tool === tool && b.w >= 44 && b.h >= 44), `landscape quick tool too small: ${tool}`);
  }
  await page.screenshot({ path: path.join(shotDir, 'phase2-04-landscape.png'), fullPage: false });

  assert.deepEqual(errors, [], 'page errors');
  console.log(JSON.stringify({ result: 'PASS', initial, armed, firstPoint, completed, hiddenState, afterReload, landscape, errors }, null, 2));
} catch (error) {
  let current = null;
  try { current = await state(); } catch {}
  console.error(JSON.stringify({ result: 'FAIL', step, error: String(error?.message || error), current, errors }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
