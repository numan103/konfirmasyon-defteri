// End-to-end regression of the chart workspace using real Binance candles.
// node tests/browser/alfa-workspace.browser.mjs --playwright=<path> --url=http://127.0.0.1:4181 --output=<directory>
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';
const arg = key => process.argv.find(s => s.startsWith(`--${key}=`))?.slice(key.length + 3);
const { chromium } = await import(pathToFileURL(arg('playwright')));
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
const page = await context.newPage(), errors = [];
page.on('pageerror', e => errors.push(e.message));
const origin = arg('url') || 'http://127.0.0.1:4181';
const output = arg('output');
const test = async (name, fn) => { await fn(); console.log('PASS', name); };
const ready = () => page.waitForFunction(() => window.__alfaDebug?.ready && window.__alfaDebug.drawings.ready, null, { timeout: 45000 });
const state = fn => page.evaluate(fn);
const catalogue = async () => { await page.click('#indicators-manage'); await page.fill('#ind-search', ''); await page.click('[data-cat=all]'); };
const add = async type => { await page.locator(`[data-add="${type}"]`).click(); };
const close = async () => { await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.querySelector('dialog[open]')); };
const shot = async name => { if (output) { await fs.mkdir(output, { recursive: true }); await page.screenshot({ path: path.join(output, name + '.png') }); } };
try {
  await page.goto(origin + '/alfa-charts.html?debug=1'); await ready();
  await test('clean entry, compact toolbar, grouped drawing rail, no unsolicited overlays', async () => {
    assert.equal(await page.locator('#drawing-tools>button').count(), 8);
    assert.equal(await page.locator('#drawing-favs>button').count(), 4);
    assert.equal(await state(() => window.__alfaDebug.marketStructure.priceLines.length), 0);
    assert.equal(await state(() => window.__alfaDebug.sessionLevels.lines.length), 0);
    const geometry = await state(() => ({ toolbar: document.querySelector('.toolbar').getBoundingClientRect().height, chart: document.querySelector('#chart').clientHeight, overflow: document.documentElement.scrollWidth > innerWidth }));
    assert.equal(geometry.toolbar, 54); assert.ok(geometry.chart > 700); assert.equal(geometry.overflow, false);
    await shot('workspace-desktop');
  });
  await test('all indicators, FVG, sessions and MTF share one searchable, favoritable catalogue', async () => {
    await catalogue();
    for (const id of ['ema', 'rsi', 'macd', 'fvg', 'structure', 'sessions', 'levels', 'mtf']) assert.equal(await page.locator(`[data-add="${id}"]`).count(), 1, id);
    assert.equal(await page.locator('.studies-dialog #replay-toggle').count(), 0);
    await page.fill('#ind-search', 'FVG');
    assert.equal(await page.locator('[data-add=fvg]').count(), 1);
    await page.fill('#ind-search', 'no-such-indicator');
    assert.match(await page.locator('#ind-list').textContent(), /Sonuç bulunamadı/);
    await page.fill('#ind-search', '');
    await page.click('[data-fav=macd]');
    await page.click('[data-cat=fav]'); assert.equal(await page.locator('[data-add=macd]').count(), 1);
    await page.click('[data-cat=all]'); await add('ema'); await add('rsi'); await add('macd');
    await shot('indicator-center');
    await close();
    assert.equal(await state(() => window.__alfaDebug.chart.panes().length), 3);
    assert.equal(await state(() => window.__alfaDebug.indicators.items.find(i => i.type === 'macd').series[2].seriesType()), 'Histogram');
  });
  await test('native settings keep identity; oscillator eye/removal collapses the correct pane', async () => {
    const ema = await state(() => window.__alfaDebug.indicators.items.find(i => i.type === 'ema').id);
    await page.locator(`#study-legend [data-study-settings="${ema}"]`).click();
    await page.fill('[data-k=period]', '50'); await page.click('#is-apply'); await close();
    assert.equal(await state(() => window.__alfaDebug.indicators.items.find(i => i.type === 'ema').params.period), 50);
    assert.equal(await state(() => window.__alfaDebug.indicators.items.find(i => i.type === 'ema').id), ema);
    const rsi = await state(() => window.__alfaDebug.indicators.items.find(i => i.type === 'rsi').id);
    await page.click(`#study-legend [data-study-eye="${rsi}"]`);
    assert.equal(await state(() => window.__alfaDebug.chart.panes().length), 2);
    await page.click(`#study-legend [data-study-eye="${rsi}"]`);
    assert.equal(await state(() => window.__alfaDebug.chart.panes().length), 3);
    const macd = await state(() => window.__alfaDebug.indicators.items.find(i => i.type === 'macd').id);
    await page.locator(`#study-legend [data-study-remove="${macd}"]`).click();
    assert.equal(await state(() => window.__alfaDebug.chart.panes().length), 2);
  });
  await test('session UTC editor, overlay settings, capped market structure and pane clipping', async () => {
    await catalogue(); await add('sessions'); await add('structure'); await add('fvg');
    await page.click('[data-cat=active]');
    await page.click('[data-active-study=sessions] [data-study-settings]');
    await page.fill('[data-start=asia]', '01:00'); await page.fill('[data-end=asia]', '06:00');
    await page.fill('[data-days]', '7'); await page.click('#is-apply'); await close();
    assert.deepEqual(await state(() => window.__alfaDebug.sessionBoxes.config.utc.asia), { start: '01:00', end: '06:00' });
    await page.waitForFunction(() => document.querySelector('.session-boxes-overlay rect'));
    const dimensions = await state(() => ({
      plot: window.__alfaDebug.candles.getPane().getHeight(),
      drawings: Number(window.__alfaDebug.drawings.svg.getAttribute('height')),
      sessions: Number(window.__alfaDebug.sessionBoxes.svg.getAttribute('height')),
      lines: window.__alfaDebug.marketStructure.priceLines.map(p => p.options()),
    }));
    assert.equal(dimensions.sessions, dimensions.plot);
    assert.equal(dimensions.drawings, dimensions.plot);
    assert.ok(dimensions.lines.length <= 2);
    assert.ok(dimensions.lines.every(p => !p.axisLabelVisible));
    await shot('workspace-with-studies');
  });
  await test('grid, optional axis labels and non-destructive clean mode work', async () => {
    await page.click('#view-menu summary'); await page.uncheck('#view-grid'); await page.check('#view-axis-labels'); await page.check('#view-clean');
    assert.equal(await state(() => window.__alfaDebug.chart.panes().length), 1);
    assert.equal(await state(() => window.__alfaDebug.indicators.items.length), 2);
    assert.equal(await state(() => window.__alfaDebug.fvg.enabled), false);
    await page.uncheck('#view-clean'); await page.uncheck('#view-axis-labels'); await page.check('#view-grid');
    assert.equal(await state(() => window.__alfaDebug.chart.panes().length), 2);
    await page.keyboard.press('Escape');
  });
  await test('grouped tools, real brush selection, visible delete button and undo', async () => {
    await page.click('#drawing-tools [data-group=shapes]');
    await page.click('.tool-flyout [data-tool=brush]');
    const plot = await state(() => { const d = window.__alfaDebug.drawings, r = d.host.getBoundingClientRect(); return { x: r.x, y: r.y, ...d.dimensions() }; });
    const x = plot.x + plot.width * .45, y = plot.y + plot.height * .55;
    await page.mouse.move(x, y); await page.mouse.down();
    await page.mouse.move(x + 100, y - 30, { steps: 12 }); await page.mouse.up();
    await page.waitForFunction(() => window.__alfaDebug.drawings.history.doc.drawings.length === 1);
    assert.equal(await page.locator('.drawing [data-handle]').count(), 2);
    await page.mouse.click(plot.x + plot.width * .1, plot.y + plot.height * .65);
    await page.mouse.click(x + 50, y - 15);
    await page.locator('#drawing-selection [aria-label="Seçili çizimi sil"]').click();
    assert.equal(await state(() => window.__alfaDebug.drawings.history.doc.drawings.length), 0);
    await page.keyboard.press('Control+z');
    assert.equal(await state(() => window.__alfaDebug.drawings.history.doc.drawings.length), 1);
  });
  await test('right click adds price alarm; test tools have a separate menu', async () => {
    const r = await page.locator('#chart').boundingBox();
    await page.mouse.click(r.x + 200, r.y + 180, { button: 'right' });
    await page.locator('.chart-context-menu button').first().click();
    assert.equal(await state(() => JSON.parse(localStorage.getItem('alfa-alarms:v1:guest')).length), 1);
    await page.click('#lab-menu summary');
    assert.equal(await page.locator('#lab-menu #replay-toggle').isVisible(), true);
    assert.equal(await page.locator('#lab-menu [data-add=fvg]').count(), 0);
    await page.click('#tester-open'); assert.match(await page.locator('dialog').textContent(), /Strateji testleri/); await close();
  });
  await test('layout, hidden states and UTC overrides survive reload', async () => {
    const ema = await state(() => window.__alfaDebug.indicators.items.find(i => i.type === 'ema').id);
    await page.click(`#study-legend [data-study-eye="${ema}"]`);
    await page.reload(); await ready();
    assert.equal(await state(() => window.__alfaDebug.indicators.items.find(i => i.type === 'ema').visible), false);
    assert.deepEqual(await state(() => window.__alfaDebug.sessionBoxes.config.utc.asia), { start: '01:00', end: '06:00' });
    assert.equal(await state(() => window.__alfaDebug.studiesUI.state.structure.added), true);
  });
  await test('empty drawing favorites stay empty; star editor adds a persisted favorite', async () => {
    await page.evaluate(() => localStorage.setItem('alfa-draw-fav:v1', '[]'));
    await page.reload(); await ready();
    assert.equal(await page.locator('#drawing-favs').isVisible(), false);
    await page.click('#drawing-favorites-edit');
    await page.click('.tool-flyout [data-favorite=trend]');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#drawing-favs [data-tool=trend]').count(), 1);
    await page.reload(); await ready();
    assert.equal(await page.locator('#drawing-favs>button').count(), 1);
  });
  await test('mobile/tablet layouts and catalogue fit 320, 390 and 768 px viewports', async () => {
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 844 }); await page.reload(); await ready();
      assert.equal(await state(() => document.documentElement.scrollWidth > innerWidth), false, `${width}px page overflow`);
      const chart = await page.locator('#chart').boundingBox(); assert.ok(chart.height > 450, `${width}px chart too small`);
      await catalogue();
      assert.equal(await state(() => { const r = document.querySelector('dialog').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }), true, `${width}px dialog overflow`);
      await page.fill('#ind-search', 'FVG'); assert.equal(await page.locator('[data-add=fvg]').isVisible(), true);
      await shot('workspace-mobile-' + width); await close();
    }
  });
  assert.deepEqual(errors, []);
  console.log('PASS no uncaught browser errors');
} finally { await browser.close(); }
