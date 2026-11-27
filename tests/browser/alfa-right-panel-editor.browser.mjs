// Deterministic regression for the stacked right panel and sandboxed script editor.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const arg = key => process.argv.find(s => s.startsWith(`--${key}=`))?.slice(key.length + 3);
const { chromium } = await import(pathToFileURL(arg('playwright')));

const STEP = 900;
const END = Math.floor(Date.parse('2026-11-20T12:00:00Z') / 1000);
const COUNT = 1200;
const candles = Array.from({ length: COUNT }, (_, i) => {
  const time = END - (COUNT - 1 - i) * STEP;
  const base = 100 + i / 100;
  return [time * 1000, base.toFixed(2), (base + 1).toFixed(2), (base - 1).toFixed(2), (base + 0.2).toFixed(2), String(10 + i % 7), time * 1000 + STEP * 1000 - 1, '0'];
});

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => {
  window.WebSocket = class {
    constructor() { this.readyState = 0; queueMicrotask(() => { this.readyState = 1; this.onopen?.({}); }); }
    close() { this.readyState = 3; this.onclose?.({}); }
    send() {}
  };
});
await page.route('**/api/v3/klines?**', async route => {
  const url = new URL(route.request().url());
  const hasStart = url.searchParams.has('startTime'), hasEnd = url.searchParams.has('endTime');
  const start = hasStart ? Number(url.searchParams.get('startTime')) : NaN;
  const end = hasEnd ? Number(url.searchParams.get('endTime')) : NaN;
  let rows = candles;
  if (hasStart) rows = rows.filter(row => row[0] >= start);
  if (hasEnd) rows = rows.filter(row => row[0] <= end);
  if (!hasStart) rows = rows.slice(-1000);
  await route.fulfill({ contentType: 'application/json', body: JSON.stringify(rows) });
});
await page.route('**/api/**', async route => {
  if (route.request().url().includes('/api/v3/klines')) return route.continue();
  await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, quotes: {} }) });
});

try {
  await page.goto((arg('url') || 'http://127.0.0.1:8788') + '/alfa-charts.html?debug=1');
  await page.waitForFunction(() => window.__alfaDebug?.history.length >= 900 && window.__alfaDebug.drawings.ready, null, { timeout: 30000 });

  const sections = await page.locator('#right-panel > .right-panel-section').evaluateAll(nodes => nodes.map(node => node.id));
  assert.deepEqual(sections, ['right-watchlist', 'right-alarms', 'right-objects', 'right-data', 'right-script'],
    'right panel must stack watchlist, alarms, object tree, data window and script editor');
  const gaps = await page.locator('#right-panel > .right-panel-section').evaluateAll(nodes => nodes.slice(1).map((node, i) =>
    Math.round(node.getBoundingClientRect().top - nodes[i].getBoundingClientRect().bottom)));
  assert.ok(gaps.every(gap => gap >= 6), `sections need visible spacing: ${gaps.join(',')}`);

  await page.click('#right-alarm-open');
  await page.waitForFunction(() => !!document.querySelector('dialog[open].alarm-dialog'), null, { timeout: 5000 });
  await page.keyboard.press('Escape');
  await page.click('#right-object-open');
  assert.equal(await page.locator('#drawing-manager').isVisible(), true, 'object tree action must open the real tree');
  await page.click('#drawing-close');

  const data = await page.evaluate(() => ({
    symbol: document.getElementById('right-data-symbol').textContent.trim(),
    timeframe: document.getElementById('right-data-timeframe').textContent.trim(),
    ohlc: document.getElementById('right-data-ohlc').textContent.trim()
  }));
  assert.match(data.symbol, /BTCUSDT/);
  assert.match(data.timeframe, /1h/i);
  assert.match(data.ohlc, /\d/);

  const code = `study({ name: 'Sandbox test', overlay: true });
function onBar(ctx) {
  const safe = typeof parent === 'undefined' && typeof fetch === 'undefined' && typeof importScripts === 'undefined';
  ctx.plot('safe', safe ? 7 : -1);
}`;
  await page.fill('#script-code', code);
  await page.click('#script-run');
  await page.waitForFunction(() => window.__alfaDebug?.scripts?.lastResult?.ok === true, null, { timeout: 10000 });
  const result = await page.evaluate(() => window.__alfaDebug.scripts.lastResult);
  assert.equal(result.study.name, 'Sandbox test');
  assert.equal(result.plots.length, 1);
  assert.equal(result.plots[0].name, 'safe');
  assert.ok(result.plots[0].values.filter(v => v === 7).length >= 100, 'sandbox globals must be unavailable');
  assert.match(await page.locator('#script-output').textContent(), /Sandbox test/);
  assert.equal(await page.evaluate(() => document.querySelectorAll('canvas').length > 0), true);

  await page.fill('#script-code', 'function onBar(ctx) { missingFunction(); }');
  await page.click('#script-run');
  await page.waitForFunction(() => window.__alfaDebug?.scripts?.lastResult?.ok === false, null, { timeout: 10000 });
  assert.match(await page.locator('#script-output').textContent(), /missingFunction/);

  await page.click('#script-reset');
  assert.match(await page.locator('#script-code').inputValue(), /study\(/);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, sections: sections.length, spacing: true, actions: true, data: true, sandbox: true, errors: true }));
} finally { await browser.close(); }
