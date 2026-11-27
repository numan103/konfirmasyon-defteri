// Deterministic regression: replay/backtest controls are reachable and functional.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const arg = key => process.argv.find(s => s.startsWith(`--${key}=`))?.slice(key.length + 3);
const { chromium } = await import(pathToFileURL(arg('playwright')));

const STEP = 900;
const END = Math.floor(Date.parse('2026-11-20T12:00:00Z') / 1000);
const COUNT = 1800;
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
  // Keep history deterministic: no live WebSocket frames can reset the chart.
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

try {
  await page.goto((arg('url') || 'http://127.0.0.1:8788') + '/alfa-charts.html?debug=1');
  try {
    await page.waitForFunction(() => window.__alfaDebug?.history.length >= 900 && window.__alfaDebug.drawings.ready, { timeout: 30000 });
  } catch (error) {
    console.log('replay boot state', await page.evaluate(() => ({
      history: window.__alfaDebug?.history?.length,
      ready: window.__alfaDebug?.drawings?.ready,
      connection: document.getElementById('connection')?.textContent,
      message: document.getElementById('message')?.textContent
    })), errors);
    throw error;
  }
  await page.locator('#timeframes [data-interval="15m"]').click();
  await page.waitForFunction(() => window.__alfaDebug.interval === '15m' && window.__alfaDebug.history.length >= 900);
  assert.equal(await page.locator('#replay-bar').isVisible(), false, 'replay controls stay hidden until a session starts');

  await page.click('#lab-menu summary');
  await page.click('#replay-toggle');
  assert.equal(await page.locator('#replay-quick-start').count(), 1, 'replay dialog must expose a direct start button');
  await page.click('#replay-quick-start');
  await page.waitForFunction(() => document.body.classList.contains('replay-mode'), { timeout: 30000 });
  assert.equal(await page.locator('#replay-bar').isVisible(), true, 'replay control bar must appear after direct start');
  for (const id of ['replay-save', 'paper-toggle', 'replay-timeline', 'replay-play', 'replay-pause', 'replay-prev', 'replay-next', 'replay-restart', 'replay-stop', 'replay-speed']) {
    assert.equal(await page.locator('#' + id).isVisible(), true, `#${id} must be visible in replay`);
  }
  assert.match(await page.locator('#connection').textContent(), /REPLAY/);
  const at = await page.evaluate(() => window.__alfaDebug.history.length);
  await page.click('#replay-next');
  await page.waitForFunction(n => window.__alfaDebug.history.length === n, at + 1);
  await page.click('#replay-prev');
  await page.waitForFunction(n => window.__alfaDebug.history.length === n, at);
  await page.click('#replay-play');
  await page.waitForFunction(n => window.__alfaDebug.history.length > n, at, { timeout: 10000 });
  await page.click('#replay-pause');
  const paused = await page.evaluate(() => window.__alfaDebug.history.length);
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.__alfaDebug.history.length), paused, 'pause must stop the replay clock');
  await page.click('#paper-toggle');
  assert.equal(await page.evaluate(() => document.getElementById('paper-panel').hidden), false, 'paper trading panel must open for backtesting');
  await page.click('#replay-stop');
  await page.waitForFunction(() => !document.body.classList.contains('replay-mode'));

  await page.click('#lab-menu summary');
  await page.click('#tester-open');
  await page.click('#tester-replay');
  await page.waitForFunction(() => document.body.classList.contains('replay-mode'), { timeout: 30000 });
  assert.equal(await page.locator('#replay-bar').isVisible(), true, 'tester entry must go straight into a usable replay session');
  await page.click('#replay-stop');
  await page.waitForFunction(() => !document.body.classList.contains('replay-mode'));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, directStart: true, controlsVisible: true, nextPrevious: true, playPause: true, paperPanel: true, testerEntry: true }));
} finally { await browser.close(); }
