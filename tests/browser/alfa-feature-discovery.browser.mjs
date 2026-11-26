// Phone feature-discovery regression test. Anonymous; no credentials or user-data mutations.
// node tests/browser/alfa-feature-discovery.browser.mjs --url=http://127.0.0.1:8787 --playwright=<path/to/playwright/index.mjs> --shots=docs/upgrade-screenshots
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

const snapshot = () => page.evaluate(() => {
  const box = selector => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), display: getComputedStyle(el).display };
  };
  return {
    viewport: { w: window.innerWidth, h: window.innerHeight },
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    body: document.body.className,
    menuButtons: [...document.querySelectorAll('#mobile-menu-sheet .menu-grid button')].map(b => {
      const r = b.getBoundingClientRect();
      return { id: b.id, w: Math.round(r.width), h: Math.round(r.height), pressed: b.getAttribute('aria-pressed'), expanded: b.getAttribute('aria-expanded') };
    }),
    multi: {
      panel: box('#multi-chart'), single: box('#chart-panel-single'), layout: document.querySelector('#multi-grid')?.dataset.layout,
      cells: [...document.querySelectorAll('.multi-cell')].map(c => { const r = c.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; }),
      exit: box('#multi-exit')
    },
    research: { panel: box('#research-panel'), status: document.querySelector('#research-status')?.textContent.trim().replace(/\s+/g, ' ').slice(0, 80) || '' },
    advanced: {
      open: document.body.classList.contains('advanced-open'), panel: box('#mobile-advanced-sheet'),
      cards: document.querySelectorAll('#mobile-advanced-sheet .advanced-grid article').length,
      note: document.querySelector('#mobile-advanced-sheet .advanced-note')?.textContent.trim() || ''
    },
    dialog: { open: !!document.querySelector('dialog[open]'), text: document.querySelector('dialog[open]')?.textContent.replace(/\s+/g, ' ').trim().slice(0, 500) || '' }
  };
});

try {
  await page.goto(origin + '/alfa-charts.html?debug=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__alfaDebug?.ready === true && document.querySelector('#chart-loading')?.hidden === true, null, { timeout: 30000 });

  step = 'menu entries';
  await page.click('#mobile-menu-open');
  await page.waitForFunction(() => document.body.classList.contains('menu-open'), null, { timeout: 4000 });
  const menu = await snapshot();
  for (const id of ['menu-multi', 'menu-tester', 'menu-research', 'menu-advanced']) {
    const button = menu.menuButtons.find(b => b.id === id);
    assert.ok(button && button.w >= 44 && button.h >= 44, `missing 44px menu entry: ${id}`);
  }
  assert.ok(menu.menuButtons.length >= 22, `expected at least 22 menu entries, got ${menu.menuButtons.length}`);
  await page.screenshot({ path: path.join(shotDir, 'phase3-01-menu-after.png'), fullPage: false });

  step = 'multi-chart';
  await page.click('#menu-multi');
  await page.waitForFunction(() => document.body.classList.contains('multi-open') && document.querySelector('#multi-grid')?.dataset.layout === '2', null, { timeout: 6000 });
  await page.waitForFunction(() => document.querySelectorAll('.multi-cell').length >= 2, null, { timeout: 6000 });
  const multi = await snapshot();
  assert.notEqual(multi.multi.panel.display, 'none', 'multi workspace must be visible');
  assert.equal(multi.multi.single.display, 'none', 'single chart must yield to multi workspace');
  assert.ok(multi.multi.exit.h >= 44 && multi.multi.exit.w >= 44, 'multi exit must be thumb-sized');
  assert.equal(multi.multi.cells.length, 2);
  assert.ok(multi.multi.cells.every(c => c.h >= 100 && c.w >= 300), `phones need stacked 2-pane cells: ${JSON.stringify(multi.multi.cells)}`);
  assert.ok(multi.overflow <= 1, `unexpected horizontal overflow: ${multi.overflow}`);
  await page.screenshot({ path: path.join(shotDir, 'phase3-02-multi-two.png'), fullPage: false });

  await page.click('#multi-exit');
  await page.waitForFunction(() => !document.body.classList.contains('multi-open') && !document.querySelector('#chart-panel-single')?.hidden, null, { timeout: 6000 });
  await page.waitForFunction(() => document.querySelector('#menu-multi')?.getAttribute('aria-pressed') === 'false', null, { timeout: 4000 });

  step = 'tester';
  await page.click('#mobile-menu-open');
  await page.click('#menu-tester');
  await page.waitForFunction(() => !!document.querySelector('dialog[open]'), null, { timeout: 4000 });
  const tester = await snapshot();
  assert.match(tester.dialog.text, /Strateji testleri/);
  assert.match(tester.dialog.text, /Replay başlat/);
  await page.click('#tester-close');
  await page.waitForFunction(() => !document.querySelector('dialog[open]'), null, { timeout: 4000 });

  step = 'research';
  await page.click('#mobile-menu-open');
  await page.click('#menu-research');
  await page.waitForFunction(() => document.querySelector('#research-panel')?.hidden === false, null, { timeout: 4000 });
  const research = await snapshot();
  assert.ok(research.research.panel?.w >= 340 && research.research.panel.h >= 200, 'research panel must fit a phone');
  assert.match(research.research.status, /Misafir/);
  assert.ok(research.overflow <= 1, `research caused horizontal overflow: ${research.overflow}`);
  await page.screenshot({ path: path.join(shotDir, 'phase3-03-research.png'), fullPage: false });
  await page.click('#research-panel [data-research="hide"]');
  await page.waitForFunction(() => document.querySelector('#research-panel')?.hidden === true, null, { timeout: 4000 });

  step = 'advanced sheet';
  await page.click('#mobile-menu-open');
  await page.click('#menu-advanced');
  await page.waitForFunction(() => document.body.classList.contains('advanced-open'), null, { timeout: 4000 });
  await page.waitForTimeout(300);
  const advanced = await snapshot();
  assert.equal(advanced.advanced.cards, 4);
  assert.equal(advanced.advanced.note, '', 'explanatory notes must stay removed');
  assert.equal(await page.locator('#mobile-advanced-sheet .advanced-note').count(), 0);
  const advancedText = await page.locator('#mobile-advanced-sheet').innerText();
  assert.match(advancedText, /2 grafik düzenini aç/);
  assert.equal(advancedText.toLowerCase().includes('gerçek emir'), false, 'simulation disclaimer must stay removed');
  await page.screenshot({ path: path.join(shotDir, 'phase3-04-advanced.png'), fullPage: false });
  await page.click('#mobile-advanced-back');
  await page.waitForFunction(() => document.body.classList.contains('menu-open') && !document.body.classList.contains('advanced-open'), null, { timeout: 4000 });
  await page.click('#menu-advanced');
  await page.waitForFunction(() => document.body.classList.contains('advanced-open'), null, { timeout: 4000 });
  await page.waitForTimeout(300);
  await page.click('#advanced-tester');
  await page.waitForFunction(() => !!document.querySelector('dialog[open]'), null, { timeout: 4000 });
  await page.click('#tester-close');

  step = 'landscape';
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(500);
  await page.click('#mobile-menu-open');
  const landscapeMenu = await snapshot();
  for (const id of ['menu-multi', 'menu-tester', 'menu-research', 'menu-advanced']) {
    const button = landscapeMenu.menuButtons.find(b => b.id === id);
    assert.ok(button && button.w >= 44 && button.h >= 44, `landscape entry too small: ${id}`);
  }
  await page.click('#menu-multi');
  await page.waitForFunction(() => document.body.classList.contains('multi-open') && document.querySelector('#multi-grid')?.dataset.layout === '2', null, { timeout: 6000 });
  const landscapeMulti = await snapshot();
  assert.ok(landscapeMulti.multi.cells.length === 2 && landscapeMulti.multi.cells.every(c => c.h >= 80), `landscape 2-pane cells too small: ${JSON.stringify(landscapeMulti.multi.cells)}`);
  await page.screenshot({ path: path.join(shotDir, 'phase3-05-landscape-multi.png'), fullPage: false });
  await page.click('#multi-exit');

  step = 'desktop smoke';
  const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const desktopPage = await desktopContext.newPage();
  const desktopErrors = [];
  desktopPage.on('pageerror', error => desktopErrors.push(error.message));
  await desktopPage.goto(origin + '/alfa-charts.html?debug=1', { waitUntil: 'domcontentloaded' });
  await desktopPage.waitForFunction(() => window.__alfaDebug?.ready === true && document.querySelector('#chart canvas'), null, { timeout: 30000 });
  const desktop = await desktopPage.evaluate(() => {
    const box = selector => { const el = document.querySelector(selector); if (!el) return null; const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), display: getComputedStyle(el).display }; };
    return { toolbar: box('.toolbar'), chart: box('#chart'), watchlist: box('#watchlist'), multiToggle: box('#multi-toggle') };
  });
  assert.equal(desktop.toolbar.display, 'flex');
  assert.equal(desktop.multiToggle.display, 'flex', 'desktop multi toggle must remain visible');
  assert.ok(desktop.chart.w >= 1100 && desktop.watchlist.w >= 240);
  assert.deepEqual(desktopErrors, []);
  await desktopContext.close();

  assert.deepEqual(errors, [], 'page errors');
  console.log(JSON.stringify({ result: 'PASS', menu, multi, tester, research, advanced, landscapeMenu, landscapeMulti, desktop, errors }, null, 2));
} catch (error) {
  let current = null;
  try { current = await snapshot(); } catch {}
  console.error(JSON.stringify({ result: 'FAIL', step, error: String(error?.message || error), current, errors }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
