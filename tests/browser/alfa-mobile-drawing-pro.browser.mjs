// FAZ 7 phone drawing/Fibonacci Pro regression test. Anonymous; no credentials or user-data mutations.
// node tests/browser/alfa-mobile-drawing-pro.browser.mjs --url=http(s)://<origin> --playwright=<path> --shots=<dir>
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

const doc = () => page.evaluate(() => {
  const d = window.__alfaDebug.drawings;
  return {
    count: d.history.doc.drawings.length,
    templates: d.history.doc.templates.map(t => ({ name: t.name, levels: t.style.levels })),
    selected: d.selected,
    current: d.current() ? { type: d.current().type, points: d.current().points, levels: d.current().levels } : null
  };
});

try {
  await page.goto(origin + '/alfa-charts.html?debug=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__alfaDebug?.ready === true && document.querySelector('#chart-loading')?.hidden === true, null, { timeout: 30000 });
  await page.waitForFunction(() => document.querySelector('#mobile-draw-fab-button') &&
    document.querySelectorAll('#mobile-all-tools [data-group]').length >= 5, null, { timeout: 10000 });

  step = 'create-fib';
  await page.click('#mobile-draw-fab-button');
  await page.waitForFunction(() => document.body.classList.contains('tools-open'), null, { timeout: 5000 });
  await page.click('#mobile-all-tools [data-group="fib"]');
  await page.click('#mobile-all-tools [data-tool="fibonacci"]');
  await page.click('#mobile-tools-close');
  await page.waitForFunction(() => document.querySelector('#chart')?.dataset.drawingTool === 'fibonacci', null, { timeout: 5000 });
  const chart = await page.locator('#chart').boundingBox();
  await page.mouse.click(chart.x + 80, chart.y + chart.height * 0.35);
  await page.waitForFunction(() => /ikinci noktayı seçin/i.test(document.querySelector('#mobile-draw-hint')?.textContent || ''), null, { timeout: 5000 });
  await page.mouse.click(chart.x + chart.width * 0.55, chart.y + chart.height * 0.58);
  await page.waitForFunction(() => window.__alfaDebug?.drawings?.history?.doc?.drawings?.length === 1, null, { timeout: 8000 });
  assert.equal((await doc()).current?.type, 'fibonacci');

  step = 'mobile-copy';
  await page.waitForSelector('#mobile-draw-actions [data-quick="copy"]', { state: 'attached', timeout: 5000 });
  const copy = page.locator('#mobile-draw-actions [data-quick="copy"]');
  assert.equal(await copy.count(), 1, 'mobile contextual copy action is missing');
  await copy.click();
  await page.waitForFunction(() => window.__alfaDebug?.drawings?.history?.doc?.drawings?.length === 2, null, { timeout: 5000 });
  const copied = await doc();
  assert.notEqual(copied.selected, null, 'copy must become the selected drawing');
  assert.ok((await page.evaluate(() => Object.keys(localStorage))).some(k => k.startsWith('alfa-drawings:v1:')), 'drawing document must be persisted locally');
  await page.screenshot({ path: path.join(shotDir, 'phase7-10-after-copy.png'), fullPage: false });

  step = 'mobile-settings';
  await page.click('#mobile-draw-actions [data-quick="settings"]');
  await page.waitForFunction(() => document.querySelector('#drawing-manager')?.hidden === false && !document.querySelector('#drawing-fib-fields')?.hidden, null, { timeout: 5000 });
  const touch = await page.evaluate(() => {
    const targets = ['#fib-levels', '#fib-template-name', '#fib-template-save', '#fib-templates', '#fib-template-load', '#drawing-settings > button[type=submit]'];
    return targets.map(selector => {
      const el = document.querySelector(selector), r = el?.getBoundingClientRect();
      return { selector, w: r ? Math.round(r.width) : 0, h: r ? Math.round(r.height) : 0 };
    });
  });
  for (const item of touch) assert.ok(item.h >= 44 && item.w >= 44, `small phone control: ${item.selector} ${item.w}x${item.h}`);
  const managerBox = await page.evaluate(() => {
    const r = document.querySelector('#drawing-manager').getBoundingClientRect();
    const bar = document.querySelector('#mobile-draw-actions').getBoundingClientRect();
    return { managerBottom: Math.round(r.bottom), barTop: Math.round(bar.top), left: Math.round(r.left), right: Math.round(r.right) };
  });
  assert.ok(managerBox.managerBottom <= managerBox.barTop + 1, 'drawing manager must not cover the action bar');

  step = 'template-save-load';
  await page.fill('#fib-template-name', 'Mobil Fib');
  await page.click('#fib-template-save');
  await page.waitForFunction(() => window.__alfaDebug.drawings.history.doc.templates.some(t => t.name === 'Mobil Fib'), null, { timeout: 5000 });
  const saved = await doc();
  assert.ok(saved.templates.length >= 1 && saved.templates.at(-1).levels.length >= 1);
  await page.fill('#fib-levels', '0, 0.382, 0.618, 1');
  await page.click('#drawing-settings > button[type=submit]');
  await page.waitForFunction(() => window.__alfaDebug.drawings.current()?.levels?.join(',') === '0,0.382,0.618,1', null, { timeout: 5000 });
  await page.selectOption('#fib-templates', { label: 'Mobil Fib' });
  await page.click('#fib-template-load');
  await page.waitForFunction(() => (window.__alfaDebug.drawings.current()?.levels?.length || 0) > 4, null, { timeout: 5000 });
  await page.screenshot({ path: path.join(shotDir, 'phase7-11-after-template.png'), fullPage: false });

  step = 'coordinate-edit';
  const editor = await page.evaluate(() => {
    const fs = document.querySelector('#drawing-coordinate-fields');
    return { hidden: fs?.hidden, rows: document.querySelectorAll('#drawing-anchors [data-anchor]').length };
  });
  assert.equal(editor.hidden, false, 'coordinate editor must be available for Fibonacci');
  assert.equal(editor.rows, 2, 'Fibonacci must expose two precise anchors');
  const target = await page.evaluate(() => {
    const p = window.__alfaDebug.drawings.current().points;
    return { time: p[0].time + 60, price: Number((p[0].price * 1.01).toFixed(2)) };
  });
  await page.fill('#drawing-anchors [data-anchor="0"] [data-time]', String(target.time));
  await page.fill('#drawing-anchors [data-anchor="0"] [data-price]', String(target.price));
  await page.click('#drawing-settings > button[type=submit]');
  await page.waitForFunction(t => {
    const p = window.__alfaDebug.drawings.current()?.points?.[0];
    return p && Math.abs(p.time - t.time) < 0.001 && Math.abs(p.price - t.price) < 0.001;
  }, target, { timeout: 5000 });
  const edited = await doc();
  assert.deepEqual(edited.current.points[0], target);
  await page.screenshot({ path: path.join(shotDir, 'phase7-12-after-coordinates.png'), fullPage: false });

  step = 'reload-persistence';
  const selectedId = edited.selected;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__alfaDebug?.ready === true && document.querySelector('#chart-loading')?.hidden === true, null, { timeout: 30000 });
  await page.waitForFunction(() => window.__alfaDebug?.drawings?.history?.doc?.drawings?.length >= 2, null, { timeout: 10000 });
  const persisted = await page.evaluate(id => {
    const d = window.__alfaDebug.drawings.history.doc;
    return { drawing: d.drawings.find(x => x.id === id) || null, templates: d.templates.map(t => t.name) };
  }, selectedId);
  assert.ok(persisted.drawing, 'edited drawing must survive reload');
  assert.deepEqual(persisted.drawing.points[0], target);
  assert.ok(persisted.templates.includes('Mobil Fib'), 'Fib template must survive reload');

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
  await lp.evaluate(() => { document.querySelector('#drawing-manager').hidden = false; window.__alfaDebug.drawings.updatePanel(); });
  const landscapeTargets = await lp.evaluate(() => {
    const r = document.querySelector('#drawing-manager').getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height), w: Math.round(r.width) };
  });
  assert.ok(landscapeTargets.height > 180 && landscapeTargets.w > 700, 'landscape manager must stay usable');
  await lp.screenshot({ path: path.join(shotDir, 'phase7-13-after-landscape.png'), fullPage: false });
  await landscape.close();

  assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
  console.log(JSON.stringify({ result: 'PASS', step: 'complete', shots: 4 }, null, 2));
} catch (error) {
  console.log(JSON.stringify({ result: 'FAIL', step, error: String(error?.message || error), pageErrors: errors }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
