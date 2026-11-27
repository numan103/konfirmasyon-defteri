// Deterministic regression for branded screenshots and backend-backed chart links.
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
const page = await browser.newPage({ viewport: { width: 1440, height: 950 }, acceptDownloads: true });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const shareStore = new Map();
await page.addInitScript(() => {
  window.__shareText = [];
  window.__shareBlobs = [];
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: async text => { window.__shareText.push(String(text)); },
      write: async items => { window.__shareBlobs.push(items); }
    }
  });
  Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
  window.ClipboardItem = class { constructor(parts) { this.parts = parts; } };
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
  const url = new URL(route.request().url());
  if (url.pathname.includes('/api/v3/klines')) return route.continue();
  if (url.pathname === '/api/edu-shared' && url.searchParams.get('kind') === 'chart') {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      const id = (body.chart?.chartName || '').includes('ETH') ? 'ethshare1' : 'share0001';
      shareStore.set(id, body.chart);
      return route.fulfill({ json: { ok: true, id, url: `/alfa-charts.html?share=${id}` } });
    }
    const id = String(url.searchParams.get('id') || '');
    const snapshot = shareStore.get(id) || null;
    return route.fulfill({ json: { ok: true, found: !!snapshot, snapshot: snapshot ? { ...snapshot, createdAt: '2026-11-27T00:00:00Z' } : null } });
  }
  await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, quotes: {} }) });
});

const base = arg('url') || 'http://127.0.0.1:8788';
try {
  await page.goto(base + '/alfa-charts.html?debug=1');
  await page.waitForFunction(() => window.__alfaDebug?.history.length >= 900 && window.__alfaDebug.drawings.ready, null, { timeout: 30000 });
  const code = `study({ name: 'Paylaşılan ortalama', overlay: true });\nfunction onBar(ctx) { ctx.plot('Ortalama', ctx.close); }`;
  await page.fill('#script-code', code);
  await page.click('#script-run');
  await page.waitForFunction(() => window.__alfaDebug.scripts.lastResult?.ok === true, null, { timeout: 10000 });

  await page.click('#screenshot');
  assert.equal(await page.locator('#shot-menu [data-shot="download"]').isVisible(), true);
  assert.equal(await page.locator('#shot-menu [data-shot="copy-image"]').isVisible(), true);
  assert.equal(await page.locator('#shot-menu [data-shot="copy-link"]').isVisible(), true);
  assert.equal(await page.locator('#shot-menu [data-shot="dialog"]').isVisible(), true);
  await page.click('#shot-menu [data-shot="copy-image"]');
  await page.waitForFunction(() => window.__shareBlobs.length === 1, null, { timeout: 10000 });
  const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
  await page.click('#screenshot');
  await page.click('#shot-menu [data-shot="download"]');
  const download = await downloadPromise;
  assert.match(download.suggestedFilename(), /^chart-.*\.png$/);

  await page.click('#screenshot');
  await page.click('#shot-menu [data-shot="dialog"]');
  await page.waitForFunction(() => !!document.querySelector('dialog[open] #chart-share-dialog'), null, { timeout: 5000 });
  await page.fill('#share-chart-name', 'BTC trend paylaşımı');
  await page.fill('#share-author', 'Misafir analist');
  await page.fill('#share-site', 'alfa-trader.com');
  const metadata = await page.evaluate(() => ({
    date: document.getElementById('share-date').value,
    branding: window.__alfaDebug.share.branding
  }));
  assert.match(metadata.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(metadata.branding, 'A · alfa charts');
  await page.click('#share-create-link');
  await page.waitForFunction(() => !!window.__alfaDebug.share.lastCreated?.id, null, { timeout: 10000 });
  const created = await page.evaluate(() => window.__alfaDebug.share.lastCreated);
  const saved = shareStore.get(created.id);
  assert.ok(saved, 'share must be stored by the backend route');
  assert.equal(saved.symbol, 'BTCUSDT');
  assert.equal(saved.interval, '1h');
  assert.equal(saved.chartName, 'BTC trend paylaşımı');
  assert.equal(saved.sharer, 'Misafir analist');
  assert.equal(saved.site, 'alfa-trader.com');
  assert.match(saved.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(saved.scripts[0].code, code);

  await page.click('#screenshot');
  await page.click('#shot-menu [data-shot="copy-link"]');
  await page.waitForFunction(() => window.__shareText.some(text => text.includes('share=')), null, { timeout: 10000 });
  assert.ok((await page.evaluate(() => window.__shareText)).some(text => text.includes(`share=${created.id}`)));

  const restoreUrl = new URL(/^https?:\/\//.test(created.url) ? created.url : base + created.url);
  restoreUrl.searchParams.set('debug', '1');
  await page.goto(restoreUrl.toString());
  await page.waitForFunction(() => window.__alfaDebug?.history.length >= 900 && window.__alfaDebug.drawings.ready, null, { timeout: 30000 });
  const restored = await page.evaluate(() => ({
    symbol: window.__alfaDebug.symbol,
    interval: window.__alfaDebug.interval,
    banner: document.getElementById('share-banner').textContent,
    bannerVisible: !document.getElementById('share-banner').hidden,
    script: document.getElementById('script-code').value,
    scriptOk: window.__alfaDebug.scripts.lastResult?.ok === true
  }));
  assert.equal(restored.symbol, 'BTCUSDT');
  assert.equal(restored.interval, '1h');
  assert.equal(restored.bannerVisible, true);
  assert.match(restored.banner, /BTC trend paylaşımı/);
  assert.match(restored.banner, /Misafir analist/);
  assert.match(restored.banner, /alfa-trader\.com/);
  assert.equal(restored.script, code);
  await page.waitForFunction(() => window.__alfaDebug.scripts.lastResult?.ok === true, null, { timeout: 10000 });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, imageCopy: true, download: true, realLink: true, metadata: true, branding: true, restored: true }));
} finally { await browser.close(); }
