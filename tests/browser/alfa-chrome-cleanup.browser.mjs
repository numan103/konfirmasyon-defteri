// Deterministic regression for the desktop chrome cleanup batch.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const arg = key => process.argv.find(s => s.startsWith(`--${key}=`))?.slice(key.length + 3);
const { chromium } = await import(pathToFileURL(arg('playwright')));

const STEP = 3600;
const END = Math.floor(Date.parse('2026-11-20T12:00:00Z') / 1000);
const COUNT = 1200;
const candles = Array.from({ length: COUNT }, (_, i) => {
  const time = END - (COUNT - 1 - i) * STEP;
  const base = 100 + i / 100;
  return [time * 1000, base.toFixed(2), (base + 1).toFixed(2), (base - 1).toFixed(2), (base + 0.2).toFixed(2), String(10 + i % 7), time * 1000 + STEP * 1000 - 1, '0'];
});

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
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
  await page.waitForFunction(() => window.__alfaDebug?.history.length >= 900 && window.__alfaDebug.drawings.ready, { timeout: 30000 });

  // Search icon is gone; the visible BTCUSDT title opens the full explorer.
  assert.equal(await page.locator('#symbol-search').count(), 0, 'top search icon must be removed');
  await page.click('#market-title');
  await page.waitForFunction(() => !!document.querySelector('dialog[open].pair-explorer-dialog'), null, { timeout: 5000 });
  await page.keyboard.press('Escape');

  // Range presets remain reachable, but not as a top toolbar marker.
  assert.equal(await page.evaluate(() => !!document.querySelector('.actions > #range-menu')), false, 'range menu must not sit in the top toolbar');
  assert.equal(await page.evaluate(() => !!document.querySelector('#view-menu #range-menu')), true, 'range menu must live inside settings/view');
  assert.equal(await page.locator('#range-menu [data-range]').count(), 5);
  await page.click('#view-menu > summary');
  assert.match(await page.locator('#view-menu #range-menu').textContent(), /ZAMAN ARALIĞI/);
  await page.click('#view-menu > summary');

  // Classic gear icon, with a single all-settings entry in the view popover.
  const gear = await page.locator('#view-menu > summary [data-icon="settings"] svg').evaluate(el => ({
    paths: el.querySelectorAll('path').length,
    circles: el.querySelectorAll('circle').length,
    pathLength: el.querySelector('path')?.getAttribute('d')?.length || 0
  }));
  assert.ok(gear.paths >= 1 && gear.circles >= 1 && gear.pathLength > 100, `classic gear icon expected, got ${JSON.stringify(gear)}`);
  await page.click('#view-menu > summary');
  assert.equal(await page.locator('#all-settings').count(), 1, 'settings popover must expose the all-settings entry');
  await page.click('#all-settings');
  await page.waitForFunction(() => !!document.querySelector('dialog[open] #settings-all'));
  for (const heading of ['GRAFİK', 'RENKLER', 'GÖRÜNÜM', 'ÇOKLU GRAFİK', 'İNDİKATÖRLER', 'ALARMLAR', 'REPLAY & TEST', 'PAYLAŞIM', 'SCRIPT EDITOR']) {
    assert.ok((await page.locator('#settings-all').textContent()).includes(heading), `${heading} must be visible in all settings`);
  }
  await page.keyboard.press('Escape');

  // Bottom chart watermark is removed; cloud/workspace conflict controls stay functional.
  assert.equal(await page.locator('#chart-watermark').count(), 0, 'bottom chart watermark must be removed');
  assert.equal(await page.locator('#cloud-conflict').count(), 1);
  assert.equal(await page.locator('#workspace-conflict').count(), 1);

  // Brand badge sits beside volume with the alfa charts hover text.
  const badge = page.locator('#study-legend [data-study-chip="volume"] .volume-brand-badge');
  assert.equal(await badge.count(), 1, 'volume chip needs the A badge');
  assert.equal((await badge.textContent()).trim(), 'A');
  assert.equal(await badge.getAttribute('title'), 'alfa charts');

  // Tighter timeframe spacing.
  const tf = await page.locator('#timeframes').evaluate(el => ({
    gap: getComputedStyle(el).gap,
    padding: getComputedStyle(el.querySelector('button')).paddingLeft
  }));
  assert.ok(parseFloat(tf.gap) <= 1, `timeframe gap too wide: ${tf.gap}`);
  assert.ok(parseFloat(tf.padding) <= 5, `timeframe padding too wide: ${tf.padding}`);

  // One desktop drawing rail entry opens every tool (brush included).
  await page.click('#drawing-all-tools');
  await page.waitForFunction(() => !!document.querySelector('.tool-flyout'), null, { timeout: 5000 });
  const tools = await page.locator('.tool-flyout [data-tool]').evaluateAll(nodes => nodes.map(node => node.dataset.tool));
  for (const tool of ['cursor', 'trend', 'horizontal', 'vertical', 'ray', 'arrow', 'fibonacci', 'rectangle', 'brush', 'text', 'label', 'long', 'short', 'ruler', 'delete']) {
    assert.ok(tools.includes(tool), `full tool set must expose ${tool}`);
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, searchRemoved: true, rangeRelocated: true, gear: true, allSettings: true, watermarkRemoved: true, volumeBadge: true, tightTimeframes: true, fullBrushTools: true }));
} finally { await browser.close(); }
