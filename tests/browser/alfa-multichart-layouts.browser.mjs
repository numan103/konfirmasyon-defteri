// Isolated regression for TradingView-style layout presets and per-cell state.
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const arg = key => process.argv.find(s => s.startsWith(`--${key}=`))?.slice(key.length + 3);
const { chromium } = await import(pathToFileURL(arg('playwright')));

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const base = arg('url') || 'http://127.0.0.1:4181';
const layouts = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16];
await page.route('**/multichart-layouts-test.html', route => route.fulfill({ contentType: 'text/html', body: `
  <nav id="chart-tabs"></nav><div id="chart-panel-single"></div>
  <section id="multi-chart"><nav id="multi-tabs"></nav><div id="multi-grid"></div></section>
  <div class="layout-buttons"></div>
  <input type="checkbox" data-multi-sync="symbol"><input type="checkbox" data-multi-sync="crosshair">
  <input type="checkbox" data-multi-sync="range"><input type="checkbox" data-multi-sync="interval">
  <script type="module">
    import { initMultiChart } from '/assets/alfa-multichart.mjs';
    window.m = initMultiChart({ getSymbol: () => 'BTCUSDT', getInterval: () => '1h' });
  </script>` }));
await page.route('**/alfa-charts.html?embed=1**', route => route.fulfill({ contentType: 'text/html', body: `
  <script type="module">
    const q = new URLSearchParams(location.search);
    window.context = { symbol: q.get('symbol'), interval: q.get('interval') };
  </script>` }));
try {
  await page.goto(base + '/multichart-layouts-test.html');
  await page.waitForFunction(() => window.m);
  const buttons = page.locator('.layout-buttons [data-layout]');
  assert.deepEqual(await buttons.evaluateAll(nodes => nodes.map(n => Number(n.dataset.layout))), layouts);
  for (const count of layouts) {
    assert.equal(await page.locator(`.layout-buttons [data-layout="${count}"] .layout-grid i`).count(), count,
      `layout ${count} must show its cell diagram`);
  }
  await page.evaluate(() => {
    m.addPane('BTCUSDT', '15m');
    m.addPane('BTCUSDT', '4h');
    m.addPane('BTCUSDT', '5m');
  });
  const before = await page.evaluate(() => m.state.panes.map(p => p.interval));
  await page.locator('.layout-buttons [data-layout="9"]').click();
  await page.waitForFunction(() => document.querySelectorAll('#multi-grid .multi-cell').length === 9);
  assert.equal(await page.locator('#multi-grid').getAttribute('data-layout'), '9');
  assert.deepEqual(await page.evaluate(() => m.state.panes.slice(0, 4).map(p => p.interval)), before,
    'layout change must not reset existing cell timeframes');
  assert.ok(await page.evaluate(() => document.querySelector('#multi-chart').hidden === false));
  await page.locator('.layout-buttons [data-layout="4"]').click();
  await page.waitForFunction(() => document.querySelectorAll('#multi-grid .multi-cell').length === 4);
  assert.deepEqual(await page.evaluate(() => m.state.panes.slice(0, 4).map(p => p.interval)), before);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('alfa-chart-tabs:v1:guest')));
  assert.equal(saved.layout, 4);
  assert.deepEqual(saved.panes.slice(0, 4).map(p => p.interval), before);
  await page.reload();
  await page.waitForFunction(() => window.m && m.state.layout === 4 && m.state.panes.length === 4);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, layouts: layouts.length, diagram: true, preservedIntervals: true, persisted: true }));
} finally { await browser.close(); }
