// Phone regression suite for the mobile UX batch: no touch context menus, global
// timeframe, compact dialogs, sheet down-swipe, draggable FAB and no input zoom.
// Anonymous local-browser test; no credentials, account calls or production writes.
// node tests/browser/alfa-mobile-ux-batch.browser.mjs --url=http(s)://<origin> --playwright=<path> --shots=<dir>
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const arg = key => process.argv.find(s => s.startsWith(`--${key}=`))?.split('=').slice(1).join('=');
const origin = arg('url');
assert.ok(origin && /^https?:\/\//.test(origin), '--url=http(s)://<origin> is required');
const shotDir = path.resolve(arg('shots') || '.qa-reports/mobile-ux-batch');
fs.mkdirSync(shotDir, { recursive: true });

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
await context.addInitScript(() => {
  window.__chartRequests = [];
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    try {
      const url = typeof input === 'string' ? input : input?.url || String(input);
      let body = null;
      try { body = typeof init?.body === 'string' ? JSON.parse(init.body) : null; } catch {}
      const parsed = new URL(url, location.href);
      const interval = body?.interval || parsed.searchParams.get('interval') || '';
      if (/\/klines\b/.test(parsed.pathname) || String(body?.op || '').startsWith('chart-market-data')) {
        window.__chartRequests.push({ url, op: body?.op || '', ref: body?.ref || '', interval });
      }
    } catch {}
    return nativeFetch(input, init);
  };
  const NativeWebSocket = window.WebSocket;
  window.WebSocket = class extends NativeWebSocket {
    constructor(url, protocols) {
      super(url, protocols);
      try {
        const value = String(url);
        const interval = /@kline_([a-z0-9]+)/i.exec(value)?.[1]?.toLowerCase() || '';
        window.__chartRequests.push({ url: value, op: 'ws', ref: '', interval });
      } catch {}
    }
  };
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
let step = 'boot';
let cdp = null;
const blurPx = value => {
  const match = /blur\(([\d.]+)px\)/.exec(String(value || ''));
  return match ? Number(match[1]) : 0;
};
const wait = (fn, argValue, timeout = 8000) => page.waitForFunction(fn, argValue, { timeout });
const boxOf = selector => page.evaluate(selector => {
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
}, selector);
const touchPoint = async (type, x, y) => cdp.send('Input.dispatchTouchEvent', {
  type, touchPoints: [{ x, y, id: 1 }]
});
const touchHold = async (x, y, ms = 700) => {
  await touchPoint('touchStart', x, y);
  await page.waitForTimeout(ms);
  await touchPoint('touchEnd', x, y);
};
const touchDrag = async (x, y, dx, dy, moves = 6) => {
  await touchPoint('touchStart', x, y);
  for (let i = 1; i <= moves; i++) await touchPoint('touchMove', x + dx * i / moves, y + dy * i / moves);
  await touchPoint('touchEnd', x + dx, y + dy);
};
const openTools = async () => {
  await page.click('#mobile-draw-fab-button');
  await wait(() => document.body.classList.contains('tools-open'));
};
const closeTools = async () => {
  await page.click('#mobile-tools-close');
  await wait(() => !document.body.classList.contains('tools-open'));
};
const dialogGeometry = () => page.evaluate(() => {
  const dialog = document.querySelector('dialog.chart-dialog[open]');
  if (!dialog) return null;
  const r = dialog.getBoundingClientRect();
  const style = getComputedStyle(dialog, '::backdrop');
  return {
    top: r.top, bottom: r.bottom, left: r.left, right: r.right, w: r.width, h: r.height,
    vw: innerWidth, vh: innerHeight,
    backdropFilter: style.backdropFilter || style.webkitBackdropFilter || 'none'
  };
});
const assertDialogGeometry = (geometry, label) => {
  assert.ok(geometry, `${label}: dialog must be open`);
  assert.ok(geometry.left >= -1 && geometry.right <= geometry.vw + 1, `${label}: dialog must fit horizontally`);
  assert.ok(geometry.bottom <= geometry.vh + 1, `${label}: dialog must stay inside the viewport`);
  assert.ok(geometry.h <= geometry.vh * 0.75 + 1, `${label}: dialog must use at most three quarters of the viewport: ${geometry.h}/${geometry.vh}`);
  assert.ok(blurPx(geometry.backdropFilter) <= 1.2,
    `${label}: dialog blur must be reduced: ${geometry.backdropFilter}`);
};

try {
  await page.goto(origin + '/alfa-charts.html?debug=1', { waitUntil: 'domcontentloaded' });
  await wait(() => window.__alfaDebug?.ready === true && document.querySelector('#chart-loading')?.hidden === true, null, 30000);
  await wait(() => document.querySelector('#mobile-draw-fab-button') &&
    document.querySelectorAll('#mobile-all-tools [data-group]').length >= 5, null, 10000);
  cdp = await context.newCDPSession(page);

  step = 'fab style and drag';
  const fabInitial = await page.evaluate(() => {
    const fab = document.querySelector('#mobile-draw-fab');
    const button = document.querySelector('#mobile-draw-fab-button');
    const r = button.getBoundingClientRect();
    const style = getComputedStyle(button);
    const c = style.backgroundColor.match(/\d+/g)?.map(Number) || [];
    return {
      gripMissing: !document.querySelector('#mobile-draw-fab-grip'),
      buttons: fab.querySelectorAll('button').length,
      w: Math.round(r.width), h: Math.round(r.height),
      background: style.backgroundColor, rgb: c,
      position: JSON.parse(localStorage.getItem('alfa-mobile-draw-fab:v1') || 'null'),
      label: button.getAttribute('aria-label') || '',
      toolsOpen: document.body.classList.contains('tools-open')
    };
  });
  assert.equal(fabInitial.gripMissing, true, 'the separate FAB drag grip must be removed');
  assert.equal(fabInitial.buttons, 1, 'the FAB must expose only the brush button');
  assert.ok(fabInitial.w >= 44 && fabInitial.h >= 44, `brush FAB must stay thumb-sized: ${fabInitial.w}x${fabInitial.h}`);
  assert.ok(fabInitial.rgb.length >= 3 && fabInitial.rgb.slice(0, 3).every(v => v >= 215),
    `brush FAB must stay neutral/white, not blue: ${fabInitial.background}`);
  assert.doesNotMatch(fabInitial.background, /41,\s*98,\s*255|30,\s*64,\s*175/, 'brush FAB must not use the blue accent');

  const fabBox = await boxOf('#mobile-draw-fab-button');
  await touchDrag(fabBox.cx, fabBox.cy, -58, -72);
  await page.waitForTimeout(1000);
  const fabAfterDrag = await page.evaluate(() => ({
    position: JSON.parse(localStorage.getItem('alfa-mobile-draw-fab:v1') || 'null'),
    toolsOpen: document.body.classList.contains('tools-open')
  }));
  assert.notDeepEqual(fabAfterDrag.position, fabInitial.position, 'dragging the brush must persist a new FAB position');
  assert.equal(fabAfterDrag.toolsOpen, false, 'dragging the brush must not open the tool sheet');
  const tapBox = await boxOf('#mobile-draw-fab-button');
  await touchHold(tapBox.cx, tapBox.cy, 60);
  await wait(() => document.body.classList.contains('tools-open'));
  await closeTools();
  await page.screenshot({ path: path.join(shotDir, '01-neutral-fab.png') });

  step = 'touch hold date without menu';
  const chartBox = await boxOf('#chart');
  const holdX = chartBox.x + chartBox.w * 0.68;
  const holdY = chartBox.y + chartBox.h * 0.22;
  await touchHold(holdX, holdY, 720);
  await page.waitForTimeout(80);
  const afterDateHold = await page.evaluate(() => ({
    dateVisible: document.querySelector('#mobile-date-label')?.hidden === false,
    dateText: document.querySelector('#mobile-date-label')?.textContent.trim() || '',
    menus: document.querySelectorAll('.chart-context-menu').length,
    dialogs: document.querySelectorAll('dialog[open]').length,
    sheetClasses: ['tools-open', 'settings-open', 'share-open', 'menu-open', 'advanced-open', 'timeframes-open']
      .filter(name => document.body.classList.contains(name))
  }));
  assert.equal(afterDateHold.dateVisible, true, 'touch hold must keep the date readout visible');
  assert.ok(afterDateHold.dateText.length > 0, 'date readout must contain a date');
  assert.equal(afterDateHold.menus, 0, 'touch hold must not open a context menu');
  assert.equal(afterDateHold.dialogs, 0, 'touch hold must not open a dialog');
  assert.deepEqual(afterDateHold.sheetClasses, [], 'touch hold must not open a sheet');

  step = 'touch tap drawing without menu';
  await openTools();
  await page.click('#mobile-all-tools [data-group="shapes"]');
  await wait(() => !!document.querySelector('#mobile-all-tools [data-tool="rectangle"]'));
  await page.click('#mobile-all-tools [data-tool="rectangle"]');
  await wait(() => document.querySelector('#chart')?.dataset.drawingTool === 'rectangle', null, 5000);
  await closeTools();
  const drawBox = await boxOf('#chart');
  await page.mouse.click(drawBox.x + drawBox.w * 0.26, drawBox.y + drawBox.h * 0.46);
  await page.mouse.move(drawBox.x + drawBox.w * 0.52, drawBox.y + drawBox.h * 0.66, { steps: 6 });
  await page.mouse.click(drawBox.x + drawBox.w * 0.52, drawBox.y + drawBox.h * 0.66);
  await wait(() => window.__alfaDebug.drawings.history.doc.drawings.length === 1, null, 10000);
  const drawingPoint = await page.evaluate(() => {
    const el = document.querySelector('#chart [data-id]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  assert.ok(drawingPoint, 'the test drawing must render a selectable SVG node');
  await touchHold(drawingPoint.x, drawingPoint.y, 700);
  await page.waitForTimeout(120);
  const afterDrawingTouch = await page.evaluate(() => ({
    menus: document.querySelectorAll('.chart-context-menu').length,
    actions: document.querySelector('#mobile-draw-actions')?.hidden === false,
    dialogs: document.querySelectorAll('dialog[open]').length
  }));
  assert.equal(afterDrawingTouch.menus, 0, 'touching a drawing must not open the right-click menu');
  assert.equal(afterDrawingTouch.dialogs, 0, 'touching a drawing must not open a dialog');
  assert.equal(afterDrawingTouch.actions, true, 'the mobile action bar must remain the drawing edit surface');
  await page.screenshot({ path: path.join(shotDir, '02-drawing-touch-no-menu.png') });

  step = 'sheet down swipe';
  await page.click('#mobile-menu-open');
  await wait(() => document.body.classList.contains('menu-open') && (() => {
    const r = document.querySelector('#mobile-menu-sheet').getBoundingClientRect();
    return r.top >= 0 && r.bottom <= innerHeight + 1;
  })());
  await page.tap('#mobile-menu-sheet .sheet-head strong');
  await page.waitForTimeout(120);
  assert.equal(await page.evaluate(() => document.body.classList.contains('menu-open')), true,
    'a tap inside a sheet must not dismiss it');
  await page.evaluate(() => { document.querySelector('#mobile-menu-sheet').scrollTop = 0; });
  const bodyBox = await boxOf('#mobile-menu-sheet .menu-grid');
  await touchDrag(bodyBox.cx, bodyBox.cy, 0, 92, 8);
  await wait(() => !document.body.classList.contains('menu-open'));
  assert.equal(await page.getAttribute('#mobile-menu-sheet', 'aria-hidden'), 'true',
    'down-swiping a sheet body must hide it from assistive tech');
  assert.deepEqual(await page.evaluate(() => ['tools-open', 'settings-open', 'share-open', 'advanced-open', 'timeframes-open']
    .filter(name => document.body.classList.contains(name))), [], 'sheet swipe must not accidentally open another sheet');

  step = 'global timeframe across pairs';
  await page.evaluate(() => { window.__chartRequests.length = 0; });
  for (const [tf, label, pair] of [['5m', '5M', 'ETHUSDT'], ['15m', '15M', 'BNBUSDT'], ['30m', '30M', 'SOLUSDT']]) {
    await page.click('#mobile-timeframe');
    await wait(() => document.body.classList.contains('timeframes-open'));
    await page.click(`#mobile-tf-list [data-tf="${tf}"]`);
    await wait(expected => document.querySelector('#mobile-timeframe-label')?.textContent === expected &&
      new URL(location.href).searchParams.get('interval') === expected.toLowerCase(), label);
    await page.evaluate(() => { window.__chartRequests.length = 0; });
    await page.click('#mobile-market-pick');
    await wait(() => !!document.querySelector('dialog[open].pair-explorer-dialog'));
    await page.click(`dialog[open] [data-open-symbol="${pair}"]`);
    await wait(symbol => document.querySelector('#symbol')?.value === symbol, pair, 15000);
    const tfState = await page.evaluate(() => ({
      interval: window.__alfaDebug?.interval || null,
      label: document.querySelector('#mobile-timeframe-label')?.textContent || '',
      url: new URL(location.href).searchParams.get('interval'),
      visibleTop: document.querySelector('#timeframes button[aria-pressed="true"]')?.dataset.interval || null,
      requests: window.__chartRequests.slice()
    }));
    assert.equal(tfState.interval, tf, `${tf} must stay the global interval after switching to ${pair}`);
    assert.equal(tfState.label, label, `${pair} must keep the ${label} chip`);
    assert.equal(tfState.url, tf, `${pair} must keep ${tf} in the URL`);
    assert.equal(tfState.visibleTop, tf, `${pair} must keep the visible timeframe pressed`);
    assert.ok(tfState.requests.some(request => request.interval === tf &&
      (request.ref === pair || String(request.url).toLowerCase().includes(pair.toLowerCase()))),
      `${pair} data request must use ${tf}: ${JSON.stringify(tfState.requests)}`);
  }
  await page.screenshot({ path: path.join(shotDir, '03-global-timeframe.png') });

  step = 'compact dialogs and reduced blur';
  const viewportMeta = await page.getAttribute('meta[name=viewport]', 'content');
  assert.doesNotMatch(viewportMeta || '', /maximum-scale|user-scalable/, 'accessibility zoom must stay enabled');
  const zoomBaseline = await page.evaluate(() => ({
    scale: window.visualViewport?.scale || 1,
    width: document.documentElement.clientWidth,
    rootZoom: document.documentElement.style.zoom,
    bodyZoom: document.body.style.zoom
  }));
  await page.click('#mobile-menu-open');
  await wait(() => document.body.classList.contains('menu-open'));
  await page.click('#menu-indicators');
  await wait(() => !!document.querySelector('dialog[open].studies-dialog'));
  assertDialogGeometry(await dialogGeometry(), 'indicator dialog');
  const indicatorInput = await page.evaluate(() => {
    const input = document.querySelector('#ind-search');
    return { font: parseFloat(getComputedStyle(input).fontSize), value: input.value };
  });
  assert.ok(indicatorInput.font >= 16, `indicator search must be at least 16px to avoid iOS focus zoom: ${indicatorInput.font}`);
  await page.focus('#ind-search');
  await page.waitForTimeout(180);
  const zoomAfterIndicator = await page.evaluate(() => ({
    scale: window.visualViewport?.scale || 1,
    width: document.documentElement.clientWidth,
    rootZoom: document.documentElement.style.zoom,
    bodyZoom: document.body.style.zoom
  }));
  assert.ok(Math.abs(zoomAfterIndicator.scale - zoomBaseline.scale) < 0.01,
    `focusing an indicator input must not zoom the page: ${zoomBaseline.scale} -> ${zoomAfterIndicator.scale}`);
  assert.equal(zoomAfterIndicator.width, zoomBaseline.width, 'focusing an input must not change the layout width');
  assert.equal(zoomAfterIndicator.rootZoom, zoomBaseline.rootZoom, 'no documentElement zoom workaround is allowed');
  assert.equal(zoomAfterIndicator.bodyZoom, zoomBaseline.bodyZoom, 'no body zoom workaround is allowed');
  await page.keyboard.press('Escape');
  await wait(() => !document.querySelector('dialog[open]'));

  await page.click('#mobile-market-pick');
  await wait(() => !!document.querySelector('dialog[open].pair-explorer-dialog'));
  assertDialogGeometry(await dialogGeometry(), 'pair explorer');
  const explorer = await page.evaluate(() => {
    const input = document.querySelector('#pair-query');
    const r = input.getBoundingClientRect();
    const target = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      font: parseFloat(getComputedStyle(input).fontSize),
      hittable: input === target || input.contains(target),
      rows: document.querySelectorAll('#pair-results [data-open-symbol]').length
    };
  });
  assert.ok(explorer.font >= 16, `pair search must be at least 16px: ${explorer.font}`);
  assert.equal(explorer.hittable, true, 'pair search must stay hittable inside the compact dialog');
  assert.ok(explorer.rows > 0, 'compact explorer must keep the full pair list');
  await page.screenshot({ path: path.join(shotDir, '04-compact-explorer.png') });
  await page.click('#pair-close');
  await wait(() => !document.querySelector('dialog[open]'));

  step = 'landscape dialog';
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(300);
  await page.click('#mobile-market-pick');
  await wait(() => !!document.querySelector('dialog[open].pair-explorer-dialog'));
  assertDialogGeometry(await dialogGeometry(), 'landscape pair explorer');
  const landscapeButton = await page.evaluate(() => {
    const row = document.querySelector('#pair-results [data-open-symbol]');
    const r = row.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  });
  assert.ok(landscapeButton.h >= 36, `landscape explorer rows must stay tappable: ${landscapeButton.h}`);
  await page.screenshot({ path: path.join(shotDir, '05-landscape-explorer.png') });
  await page.click('#pair-close');
  await wait(() => !document.querySelector('dialog[open]'));

  assert.deepEqual(errors, [], 'page errors');
  console.log(JSON.stringify({
    result: 'PASS', fabInitial, fabAfterDrag, afterDateHold, afterDrawingTouch,
    globalTimeframes: ['5m', '15m', '30m'], dialogsCompact: true,
    zoomBaseline, zoomAfterIndicator, pageErrors: errors
  }, null, 2));
} catch (error) {
  let current = null;
  try { current = await page.evaluate(() => ({
    body: document.body.className,
    menus: document.querySelectorAll('.chart-context-menu').length,
    dialogs: [...document.querySelectorAll('dialog[open]')].map(d => d.className),
    symbol: document.querySelector('#symbol')?.value || '',
    interval: window.__alfaDebug?.interval || null
  })); } catch {}
  console.error(JSON.stringify({ result: 'FAIL', step, error: String(error?.message || error), current, errors }, null, 2));
  process.exitCode = 1;
} finally {
  await cdp?.detach().catch(() => {});
  await browser.close();
}
