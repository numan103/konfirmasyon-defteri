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
    return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom), display: getComputedStyle(el).display };
  };
  const hit = selector => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const target = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { inside: !!target && (el === target || el.contains(target)), tag: target?.id || target?.className || null };
  };
  const buttons = selector => [...document.querySelectorAll(`${selector} button`)].map(b => ({
    key: b.dataset.quick || null, tool: b.dataset.tool || null, group: b.dataset.group || null,
    pressed: b.getAttribute('aria-pressed'),
    disabled: b.disabled, w: Math.round(b.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height)
  }));
  const d = window.__alfaDebug?.drawings?.history?.doc?.drawings?.at(-1);
  return {
    duplicateRail: !!document.querySelector('#drawing-favs'),
    quickRail: !!document.querySelector('#mobile-draw-quick'),
    fab: box('#mobile-draw-fab'),
    fabButtons: buttons('#mobile-draw-fab'),
    toolsOpen: document.body.classList.contains('tools-open'),
    toolGroups: buttons('#mobile-all-tools').filter(b => b.group),
    actions: box('#mobile-draw-actions'),
    actionButtons: buttons('#mobile-draw-actions'),
    strip: box('#mobile-market-strip'),
    menuHit: hit('#mobile-menu-open'),
    pairHit: hit('#mobile-market-pick'),
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
const openTools = async () => {
  await page.click('#mobile-draw-fab-button');
  await page.waitForFunction(() => document.body.classList.contains('tools-open'), null, { timeout: 5000 });
};
const closeTools = async () => {
  await page.click('#mobile-tools-close');
  await page.waitForFunction(() => !document.body.classList.contains('tools-open'), null, { timeout: 5000 });
};

try {
  await page.goto(origin + '/alfa-charts.html?debug=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__alfaDebug?.ready === true && document.querySelector('#chart-loading')?.hidden === true, null, { timeout: 30000 });
  await page.waitForFunction(() => document.querySelector('#mobile-draw-fab-button') &&
    document.querySelectorAll('#mobile-all-tools [data-group]').length >= 5, null, { timeout: 10000 });

  const initial = await state();
  assert.equal(initial.duplicateRail, false, 'the duplicate favourites rail must stay removed');
  assert.equal(initial.quickRail, false, 'the old quick bar must stay removed');
  assert.equal(initial.fab.display, 'flex', 'the single pencil FAB must stay visible');
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.drawing-space')).display), 'none',
    'desktop tool rail must not leak into the phone shell');
  assert.ok(initial.fabButtons.length >= 2, 'the FAB needs a tool button and a drag grip');
  assert.ok(initial.fabButtons.every(b => b.w >= 44 && b.h >= 44), 'FAB controls must be thumb-sized');
  assert.equal(initial.actions.display, 'none', 'edit actions must stay hidden without a selection');
  assert.equal(initial.hint, '');
  assert.ok(initial.fab.bottom <= initial.strip.top + 1, 'the FAB must not overlap the bottom pair strip');
  assert.ok(initial.menuHit.inside && initial.pairHit.inside, 'menu and pair controls must stay tappable');

  await openTools();
  const groups = (await state()).toolGroups;
  assert.equal(groups.length, 5, 'the FAB must expose all five tool categories');
  assert.ok(groups.every(g => g.w >= 44 && g.h >= 44), 'tool categories must be thumb-sized');
  await closeTools();

  // One tap opens the full sheet; long press toggles the persistent favorite list.
  step = 'favorite';
  await openTools();
  await page.click('#mobile-all-tools [data-group="positions"]');
  await page.waitForFunction(() => !!document.querySelector('#mobile-all-tools [data-tool="long"]'), null, { timeout: 4000 });
  await page.locator('#mobile-all-tools [data-tool="long"]').dispatchEvent('contextmenu');
  await page.waitForFunction(() => window.__alfaDebug.drawings.favs.includes('long'), null, { timeout: 4000 });
  const favorited = await state();
  assert.ok(favorited.favs.includes('long'));
  const storedFavs = await page.evaluate(() => JSON.parse(localStorage.getItem('alfa-draw-fav:v1') || '[]'));
  assert.ok(storedFavs.includes('long'), 'favorite must be persisted locally');
  await page.click('#mobile-tools-back');
  await page.waitForFunction(() => document.querySelectorAll('#mobile-all-tools [data-group]').length === 5);
  await closeTools();

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

  // Selecting a tool from the full sheet must arm it, not draw on the chart.
  const beforeArm = (await state()).count;
  step = 'arm';
  await openTools();
  await page.click('#mobile-all-tools [data-group="fib"]');
  await page.click('#mobile-all-tools [data-tool="fibonacci"]');
  await page.waitForFunction(() => document.querySelector('#mobile-all-tools [data-tool="fibonacci"]')?.getAttribute('aria-pressed') === 'true', null, { timeout: 4000 });
  assert.equal(await page.getAttribute('#mobile-all-tools [data-tool="fibonacci"]', 'aria-pressed'), 'true', 'selected tool must be visibly pressed');
  await closeTools();
  await page.waitForFunction(() => document.querySelector('#chart')?.dataset.drawingTool === 'fibonacci', null, { timeout: 5000 });
  await page.waitForFunction(() => /başlangıç noktasını seçin/i.test(document.querySelector('#mobile-draw-hint')?.textContent || ''), null, { timeout: 4000 });
  const armed = await state();
  assert.equal(armed.count, beforeArm, 'tool selection must not create a drawing');
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
  assert.equal(completed.actions.display, 'flex', 'contextual edit actions must take over from the tool sheet');
  assert.equal(completed.fab.display, 'flex', 'the single FAB stays available with a selection');
  for (const key of ['settings', 'undo', 'redo', 'lock', 'hide', 'remove']) {
    assert.ok(completed.actionButtons.some(b => b.key === key && b.w >= 44 && b.h >= 44), `missing edit action: ${key}`);
  }
  assert.match(completed.hint, /seçildi/i);
  assert.ok(completed.actions.bottom <= completed.strip.top + 1, 'edit actions must not overlap the bottom pair strip');
  assert.ok(completed.fab.bottom <= completed.strip.top + 1, 'the FAB must not overlap the bottom pair strip');
  assert.ok(completed.menuHit.inside && completed.pairHit.inside, 'menu and pair controls must stay tappable with a selected drawing');
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

  // Landscape keeps the same one-FAB tool surface reachable.
  step = 'landscape';
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(500);
  const landscape = await state();
  assert.equal(landscape.fab.display, 'flex', 'the FAB must stay reachable in landscape');
  await openTools();
  const landscapeGroups = (await state()).toolGroups;
  assert.equal(landscapeGroups.length, 5, 'landscape must expose every tool category');
  assert.ok(landscapeGroups.every(g => g.w >= 44 && g.h >= 44), `landscape tool categories too small: ${JSON.stringify(landscapeGroups)}`);
  await closeTools();
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
