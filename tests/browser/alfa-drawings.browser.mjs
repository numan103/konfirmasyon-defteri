// Real Chromium pointer/keyboard tests; no production accounts or database writes.
// node tests/browser/alfa-drawings.browser.mjs --playwright=<path/to/playwright/index.mjs>
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const arg = key => process.argv.find(s => s.startsWith(`--${key}=`))?.split('=').slice(1).join('=');
const { chromium } = await import(pathToFileURL(path.resolve(arg('playwright') || 'node_modules/playwright/index.mjs')));
const browser = await chromium.launch({ executablePath: arg('chrome') || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
const page = await context.newPage(), errors = [], results = [];
page.on('pageerror', e => errors.push(e.message));
const origin = arg('url') || 'http://localhost:4173';
const debug = fn => page.evaluate(fn);
const waitMarket = async (symbol, tf) => {
  await page.waitForFunction(({ symbol, tf }) => window.__alfaDebug?.ready &&
    window.__alfaDebug.drawings.ready && document.getElementById('market-title').textContent === `${symbol} · ${tf}`, { symbol, tf }, { timeout: 40000 });
};
const documentState = () => debug(() => structuredClone(window.__alfaDebug.drawings.history.doc));
const lastDrawing = async () => (await documentState()).drawings.at(-1);
const count = async () => (await documentState()).drawings.length;
async function assertNativeProjection(type = 'trend') {
  // Chart autoscale and the SVG overlay update on animation frames. Wait for the
  // actual projection to converge; don't compare different rendering frames.
  const handle = await page.waitForFunction(type => {
    const api = window.__alfaDebug, d = api.drawings.history.doc.drawings.find(d => d.type === type);
    if (!d) return { skipped: true };
    const p = d.points[0], bars = api.candles.data(), ts = api.chart.timeScale();
    let i = bars.findIndex(bar => bar.time > p.time); if (i < 1) return { error: 'anchor outside test history' };
    const a = bars[i - 1], b = bars[i], ratio = (p.time - a.time) / (b.time - a.time);
    const nativeX = ts.timeToCoordinate(a.time) + (ts.timeToCoordinate(b.time) - ts.timeToCoordinate(a.time)) * ratio;
    const active = document.getElementById('chart-type').value === 'line' ? api.line : api.candles;
    const nativeY = active.priceToCoordinate(p.price);
    const line = document.querySelector(`[data-id="${d.id}"] line[pointer-events=none]`);
    if (!line) return { error: 'rendered line missing' };
    const result = { dx: Math.abs(Number(line.getAttribute('x1')) - nativeX), dy: Math.abs(Number(line.getAttribute('y1')) - nativeY),
      nativeX, renderedX: Number(line.getAttribute('x1')), engineX: api.drawings.project(p).x,
      anchor: p.time, lo: a.time, hi: b.time, index: i, engineStep: api.drawings.step(), engineCount: api.drawings.getBars().length,
      nativeFirst: bars[0].time, engineFirst: api.drawings.getBars()[0]?.time };
    return result.dx < .1 && result.dy < .1 ? result : false;
  }, type, { timeout: 5000 });
  const result = await handle.jsonValue();
  await handle.dispose();
  if (!result.skipped) { assert.ok(result.dx < .1 && result.dy < .1, JSON.stringify(result)); }
}
const plot = () => debug(() => {
  const d = window.__alfaDebug.drawings, r = d.host.getBoundingClientRect();
  return { x: r.x, y: r.y, ...d.dimensions() };
});
const clickAt = async (fx, fy) => {
  const r = await plot(); await page.mouse.click(r.x + r.width * fx, r.y + r.height * fy);
};
async function create(type, points) {
  const before = await count();
  await page.locator(`#drawing-tools [data-tool="${type}"]`).click();
  for (const [x, y] of points) await clickAt(x, y);
  await page.waitForFunction(n => window.__alfaDebug.drawings.history.doc.drawings.length === n, before + 1);
  assert.equal(await page.locator('#drawing-tools [data-tool=cursor]').getAttribute('aria-pressed'), 'true');
  return lastDrawing();
}
async function handleDrag(id, handle, dx, dy) {
  const loc = page.locator(`[data-id="${id}"] circle[data-handle="${handle}"]`);
  const r = await loc.boundingBox(); assert.ok(r, `${handle} visible`);
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await page.mouse.down(); await page.mouse.move(r.x + r.width / 2 + dx, r.y + r.height / 2 + dy, { steps: 10 }); await page.mouse.up();
}
const test = async (name, fn) => { await fn(); results.push({ name, passed: true }); console.log('PASS', name); };
try {
  await page.goto(origin + '/alfa-charts.html?debug=1');
  await waitMarket('BTCUSDT', '1H');
  await test('BTCUSDT 1H loads real Binance and 15 drawing toolbar controls', async () => {
    assert.equal(await page.locator('#drawing-tools button').count(), 15);
    assert.equal(await debug(() => window.__alfaDebug.history.length), 1000);
    assert.match(await page.locator('#drawing-status').textContent(), /Misafir/);
  });
  let horizontal, trend, fib, long;
  await test('Horizontal Line draws and moves with a real pointer drag', async () => {
    horizontal = await create('horizontal', [[.3, .52]]);
    const r = await plot();
    await page.mouse.move(r.x + r.width * .4, r.y + r.height * .52);
    await page.mouse.down(); await page.mouse.move(r.x + r.width * .4, r.y + r.height * .44, { steps: 10 }); await page.mouse.up();
    const after = (await documentState()).drawings.find(d => d.id === horizontal.id);
    assert.notEqual(after.points[0].price, horizontal.points[0].price);
    assert.ok(after.points[0].price > horizontal.points[0].price);
  });
  await test('Trend Line anchors resize independently', async () => {
    trend = await create('trend', [[.2, .7], [.65, .32]]);
    await handleDrag(trend.id, 'p1', 45, 25);
    const after = await lastDrawing();
    assert.deepEqual(after.points[0], trend.points[0]); assert.notDeepEqual(after.points[1], trend.points[1]);
  });
  await test('Fibonacci 0.382 renders the mathematically correct price', async () => {
    fib = await create('fibonacci', [[.22, .72], [.7, .23]]);
    const expected = fib.points[1].price + (fib.points[0].price - fib.points[1].price) * .382;
    const labels = await page.locator(`[data-id="${fib.id}"] text`).allTextContents();
    const label = labels.find(s => s.startsWith('0.382'));
    assert.ok(label, '0.382 label exists');
    const rendered = Number(label.match(/\((.+)\)/)[1].replaceAll('.', '').replace(',', '.'));
    assert.ok(Math.abs(rendered - expected) <= .0001, `${rendered} vs ${expected}`);
    await handleDrag(fib.id, 'p0', -25, -15);
    assert.notDeepEqual((await lastDrawing()).points[0], fib.points[0]);
    fib = await lastDrawing();
    const r = await plot(), y = await debug(() => {
      const e = window.__alfaDebug.drawings, d = e.history.doc.drawings.at(-1);
      return e.project({ time: d.points[0].time, price: d.points[1].price + (d.points[0].price - d.points[1].price) * .705 }).y;
    });
    const before = await lastDrawing();
    await page.mouse.move(r.x + r.width * .45, r.y + y);
    await page.mouse.down(); await page.mouse.move(r.x + r.width * .45 + 30, r.y + y + 15, { steps: 10 }); await page.mouse.up();
    const moved = await lastDrawing();
    assert.notEqual(moved.points[0].time, before.points[0].time);
    assert.ok(Math.abs((moved.points[0].price - before.points[0].price) - (moved.points[1].price - before.points[1].price)) < 1e-7);
  });
  await test('Fibonacci settings add/remove levels, reverse, style and persist a template', async () => {
    await page.locator('#drawing-manage').click();
    await page.locator('#fib-levels').fill('0, 0.382, 0.618, 0.705, 1, 1.618');
    await page.locator('#drawing-color').fill('#ffcc00');
    await page.locator('#drawing-width').fill('3');
    await page.locator('#fib-reverse').check();
    await page.locator('#fib-prices').uncheck();
    await page.locator('#drawing-settings button[type=submit]').click();
    const d = await lastDrawing(); assert.equal(d.levels.length, 6); assert.equal(d.reversed, true); assert.equal(d.width, 3); assert.equal(d.showPrices, false);
    assert.equal(await page.locator(`[data-id="${d.id}"] text`).filter({ hasText: '0.382' }).textContent(), '0.382');
    await page.locator('#fib-template-name').fill('Browser verified');
    await page.locator('#fib-template-save').click();
    assert.equal((await documentState()).templates.length, 1);
    await page.locator('#drawing-width').fill('1'); await page.locator('#drawing-settings button[type=submit]').click();
    await page.locator('#fib-template-load').click(); assert.equal((await lastDrawing()).width, 3);
    await page.locator('#drawing-close').click();
  });
  await test('Long Position starts at 2.5R; stop and entry/TP handles recalculate live', async () => {
    long = await create('long', [[.3, .52], [.72, .64]]);
    const risk = long.points[0].price - long.points[1].price;
    assert.ok(Math.abs((long.target - long.points[0].price) / risk - 2.5) < 1e-8);
    await handleDrag(long.id, 'stop', 0, 25);
    let d = await lastDrawing();
    const rr = (d.target - d.points[0].price) / (d.points[0].price - d.points[1].price);
    assert.ok(Math.abs(rr - 2.5) > .01);
    assert.ok((await page.locator(`[data-id="${long.id}"] text`).allTextContents()).some(s => s.includes(rr.toFixed(2))));
    await handleDrag(long.id, 'entry', 0, 5);
    await handleDrag(long.id, 'target', 0, -10);
    d = await lastDrawing(); assert.notEqual(d.target, long.target); assert.notEqual(d.points[0].price, long.points[0].price);
    const stopLine = page.locator(`[data-id="${long.id}"] line[data-handle=stop]`), bounds = await stopLine.boundingBox();
    const before = await lastDrawing();
    const lineY = bounds.y + bounds.height / 2;
    await page.mouse.move(bounds.x + bounds.width * .2, lineY);
    await page.mouse.down(); await page.mouse.move(bounds.x + bounds.width * .2, lineY + 10, { steps: 5 }); await page.mouse.up();
    const after = await lastDrawing();
    assert.equal(after.points[0].price, before.points[0].price);
    assert.equal(after.target, before.target);
    assert.notEqual(after.points[1].price, before.points[1].price);
  });
  if (arg('desktop')) await page.screenshot({ path: arg('desktop') });
  await test('Wheel zoom over SVG drawings and in an active drawing tool still works', async () => {
    const location = await debug(() => {
      const e = window.__alfaDebug.drawings, d = e.history.doc.drawings.at(-1), p = e.project(d.points[0]), r = e.host.getBoundingClientRect();
      const b = e.project(d.points[1]); return { x: r.x + (p.x + b.x) / 2 + 15, y: r.y + p.y };
    });
    const before = await debug(() => window.__alfaDebug.chart.timeScale().getVisibleLogicalRange());
    await page.mouse.move(location.x, location.y); await page.mouse.wheel(0, -150);
    await page.waitForFunction(span => {
      const range = window.__alfaDebug.chart.timeScale().getVisibleLogicalRange();
      return Math.abs(range.to - range.from - span) > 1;
    }, before.to - before.from);
    await page.locator('#drawing-tools [data-tool=trend]').click();
    const r = await plot(), old = await debug(() => window.__alfaDebug.chart.timeScale().getVisibleLogicalRange());
    await page.mouse.move(r.x + r.width * .9, r.y + r.height * .9); await page.mouse.wheel(0, 150);
    await page.waitForFunction(span => {
      const range = window.__alfaDebug.chart.timeScale().getVisibleLogicalRange();
      return Math.abs(range.to - range.from - span) > 1;
    }, old.to - old.from);
    await page.keyboard.press('Escape');
  });
  await test('Zoom and pan change projections, never stored timestamps/prices', async () => {
    const before = await documentState(), r = await plot();
    const range = await debug(() => window.__alfaDebug.chart.timeScale().getVisibleLogicalRange());
    await page.mouse.move(r.x + r.width * .88, r.y + r.height * .85);
    await page.mouse.wheel(0, -350);
    await page.waitForFunction(old => {
      const range = window.__alfaDebug.chart.timeScale().getVisibleLogicalRange();
      return Math.abs((range.to - range.from) - old) > 1;
    }, range.to - range.from);
    const zoomed = await debug(() => window.__alfaDebug.chart.timeScale().getVisibleLogicalRange());
    // Empty bottom edge: native chart pan, not a drawing grab.
    await page.mouse.move(r.x + r.width * .87, r.y + r.height * .95); await page.mouse.down();
    await page.mouse.move(r.x + r.width * .7, r.y + r.height * .95, { steps: 15 }); await page.mouse.up();
    const panned = await debug(() => window.__alfaDebug.chart.timeScale().getVisibleLogicalRange());
    assert.ok(Math.abs(panned.from - zoomed.from) > 1);
    assert.deepEqual(await documentState(), before);
    const checks = await debug(() => {
      const e = window.__alfaDebug.drawings;
      return e.history.doc.drawings.filter(d => !d.hidden).map(d => {
        const g = e.svg.querySelector(`[data-id="${d.id}"]`), p = e.project(d.points[0]);
        const handle = g.querySelector('[data-handle=p0]');
        return !handle || (Math.abs(Number(handle.getAttribute('cx')) - p.x) < .1 && Math.abs(Number(handle.getAttribute('cy')) - p.y) < .1);
      });
    });
    assert.ok(checks.every(Boolean));
    // Restore enough recent history for following pointer tests.
    await page.locator('#live').click();
  });
  await test('Timeframe, resize and reload preserve coordinates and Fibonacci template', async () => {
    const before = await documentState();
    await page.locator('#timeframes button').filter({ hasText: /^4H$/ }).click(); await waitMarket('BTCUSDT', '4H');
    assert.deepEqual(await documentState(), before);
    await assertNativeProjection();
    await page.setViewportSize({ width: 1200, height: 850 });
    await page.waitForFunction(() => document.querySelector('.drawing-overlay').getAttribute('width') === String(window.__alfaDebug.chart.timeScale().width()));
    await assertNativeProjection();
    assert.deepEqual(await documentState(), before);
    await page.reload(); await waitMarket('BTCUSDT', '1H');
    assert.deepEqual(await documentState(), before);
    await assertNativeProjection();
  });
  await test('Symbol isolation ETH/BTC and per-symbol undo stacks', async () => {
    const btc = await documentState();
    await page.locator('#symbol').selectOption('ETHUSDT'); await waitMarket('ETHUSDT', '1H');
    assert.equal(await count(), 0); assert.equal((await documentState()).templates.length, 0);
    await create('vertical', [[.5, .45]]);
    await page.locator('#symbol').selectOption('BTCUSDT'); await waitMarket('BTCUSDT', '1H');
    assert.deepEqual(await documentState(), btc);
    await page.locator('#symbol').selectOption('ETHUSDT'); await waitMarket('ETHUSDT', '1H');
    assert.equal(await count(), 1);
    await page.locator('#drawing-undo').click(); assert.equal(await count(), 0);
    await page.locator('#drawing-redo').click(); assert.equal(await count(), 1);
  });
  await test('Remaining tools: ray, rectangle, short 2.5R, ruler and editable text', async () => {
    await create('ray', [[.25, .65], [.6, .45]]);
    const ray = await lastDrawing();
    await handleDrag(ray.id, 'p1', 12, 10); assert.notDeepEqual((await lastDrawing()).points[1], ray.points[1]);
    const rect = await create('rectangle', [[.25, .25], [.7, .55]]);
    await handleDrag(rect.id, 'p1', 20, 15); assert.notDeepEqual((await lastDrawing()).points[1], rect.points[1]);
    const short = await create('short', [[.3, .5], [.7, .35]]);
    assert.ok(short.points[1].price > short.points[0].price && short.target < short.points[0].price);
    assert.ok(Math.abs((short.points[0].price - short.target) / (short.points[1].price - short.points[0].price) - 2.5) < 1e-8);
    await handleDrag(short.id, 'stop', 0, -8); await handleDrag(short.id, 'target', 0, 8);
    const ruler = await create('ruler', [[.3, .4], [.6, .7]]);
    await handleDrag(ruler.id, 'p1', 15, -10); assert.notDeepEqual((await lastDrawing()).points[1], ruler.points[1]);
    const text = await create('text', [[.4, .4]]);
    await page.locator('#drawing-text').fill('<script>not executable</script> Alfa');
    await page.locator('#drawing-font-size').fill('18');
    await page.locator('#drawing-settings button[type=submit]').click();
    assert.equal((await lastDrawing()).text, '<script>not executable</script> Alfa');
    assert.equal((await lastDrawing()).fontSize, 18);
    assert.ok(await page.locator(`[data-id="${text.id}"] text`).textContent());
  });
  await test('Hide/show, lock/unlock, copy, delete, undo/redo and Escape cancellation', async () => {
    const before = await count(), original = await lastDrawing();
    await page.locator('#drawing-hide').click();
    assert.equal(await page.locator(`[data-id="${original.id}"]`).count(), 0);
    await page.locator('#drawing-hide').click(); assert.equal(await page.locator(`[data-id="${original.id}"]`).count(), 1);
    await page.locator('#drawing-lock').click();
    assert.equal(await page.locator(`[data-id="${original.id}"] circle[data-handle]`).count(), 0);
    assert.equal(await page.locator('#drawing-remove').isDisabled(), true);
    await page.locator('#drawing-close').click();
    const lockedPoint = await debug(() => {
      const e = window.__alfaDebug.drawings, d = e.history.doc.drawings.at(-1), p = e.project(d.points[0]), r = e.host.getBoundingClientRect();
      return { x: r.x + p.x + 20, y: r.y + p.y - 3 };
    });
    await page.mouse.move(lockedPoint.x, lockedPoint.y); await page.mouse.down();
    await page.mouse.move(lockedPoint.x + 25, lockedPoint.y + 20, { steps: 5 }); await page.mouse.up();
    assert.deepEqual((await lastDrawing()).points, original.points);
    await page.locator('#drawing-manage').click();
    await page.locator('#drawing-lock').click();
    await page.locator('#drawing-copy').click(); assert.equal(await count(), before + 1);
    await page.locator('#drawing-remove').click(); assert.equal(await count(), before);
    await page.locator('#drawing-undo').click(); assert.equal(await count(), before + 1);
    await page.locator('#drawing-redo').click(); assert.equal(await count(), before);
    await page.locator('#drawing-close').click();
    await page.locator('#drawing-tools [data-tool=trend]').click(); await clickAt(.3, .6); await page.keyboard.press('Escape');
    assert.equal(await count(), before); assert.equal(await page.locator('#drawing-tools [data-tool=cursor]').getAttribute('aria-pressed'), 'true');
    const textPoint = await debug(() => {
      const e = window.__alfaDebug.drawings, d = e.history.doc.drawings.find(d => d.type === 'text'), p = e.project(d.points[0]), r = e.host.getBoundingClientRect();
      return { x: r.x + p.x + 30, y: r.y + p.y - 3 };
    });
    await page.locator('#drawing-tools [data-tool=delete]').click(); await page.mouse.click(textPoint.x, textPoint.y);
    assert.equal(await count(), before - 1);
    await page.keyboard.press('Control+z'); assert.equal(await count(), before);
    await page.keyboard.press('Control+Shift+z'); assert.equal(await count(), before - 1);
  });
  await test('Line chart preserves drawings, crosshair, live data and mobile layout', async () => {
    const before = await documentState();
    await page.locator('#chart-type').selectOption('line');
    assert.deepEqual(await documentState(), before);
    await assertNativeProjection('ray');
    await page.setViewportSize({ width: 390, height: 844 });
    const layout = await debug(() => ({ overflow: document.documentElement.scrollWidth > innerWidth, h: document.getElementById('chart').clientHeight }));
    assert.equal(layout.overflow, false); assert.ok(layout.h > 200);
    const r = await plot();
    await page.mouse.move(r.x + r.width * .5, r.y + r.height * .8);
    assert.match(await page.locator('#connection').textContent(), /Canlı/);
  });
  await test('Touchscreen taps create a horizontal line and two-point trend', async () => {
    const touchContext = await browser.newContext({ viewport: { width: 430, height: 900 }, hasTouch: true, isMobile: true });
    const touch = await touchContext.newPage();
    try {
      await touch.goto(origin + '/alfa-charts.html?debug=1');
      await touch.waitForFunction(() => window.__alfaDebug?.ready && window.__alfaDebug.drawings.ready, null, { timeout: 40000 });
      const r = await touch.evaluate(() => {
        const e = window.__alfaDebug.drawings, b = e.host.getBoundingClientRect(); return { x: b.x, y: b.y, ...e.dimensions() };
      });
      await touch.locator('#drawing-tools [data-tool=horizontal]').tap();
      await touch.touchscreen.tap(r.x + r.width * .3, r.y + r.height * .5);
      assert.equal(await touch.evaluate(() => window.__alfaDebug.drawings.history.doc.drawings.length), 1);
      await touch.locator('#drawing-tools [data-tool=trend]').tap();
      await touch.touchscreen.tap(r.x + r.width * .2, r.y + r.height * .65);
      await touch.touchscreen.tap(r.x + r.width * .7, r.y + r.height * .35);
      assert.equal(await touch.evaluate(() => window.__alfaDebug.drawings.history.doc.drawings.length), 2);
      const d = await touch.evaluate(() => window.__alfaDebug.drawings.history.doc.drawings.at(-1));
      assert.ok(d.points[1].time > d.points[0].time);
    } finally { await touchContext.close(); }
  });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: results.length, tests: results, pageErrors: errors, persistence: 'Guest/local only; authenticated live database NOT verified' }, null, 2));
  if (arg('screenshot')) await page.screenshot({ path: arg('screenshot') });
} catch (error) {
  console.error('FAIL', error.stack, '\nCompleted:', results.map(r => r.name), '\nPage errors:', errors);
  if (arg('screenshot')) await page.screenshot({ path: arg('screenshot') });
  process.exitCode = 1;
} finally { await browser.close(); }
