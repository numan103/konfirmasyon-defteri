import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const arg = key => process.argv.find(s => s.startsWith(`--${key}=`))?.slice(key.length + 3);
const { chromium } = await import(pathToFileURL(arg('playwright')));
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
const base = arg('url') || 'http://127.0.0.1:4183', errors = [];
page.on('pageerror', e => errors.push(e.message));
const end = Date.parse('2026-11-24T12:00:00Z') / 1000, first = end - 120 * 86400;
let olderCalls = 0;
await page.addInitScript(() => {
  window.supabase = { createClient: () => ({ auth: {
    getSession: async () => ({ data: { session: null } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } })
  } }) };
});
await page.routeWebSocket(/wss:\/\//, () => {});
await page.route(/https:\/\/(?:data-api\.binance\.vision|api\.binance\.com)\//, route => {
  const u = new URL(route.request().url());
  if (!u.pathname.endsWith('/klines')) return route.fulfill({ json: u.pathname.endsWith('/exchangeInfo') ? { symbols: [] } : [] });
  const older = u.searchParams.has('endTime');
  if (older) olderCalls++;
  const to = Math.min(end, Math.floor(Number(u.searchParams.get('endTime') || end * 1000) / 1000 / 3600) * 3600);
  const from = Math.max(first, to - ((older ? 1000 : 150) - 1) * 3600);
  const rows = [];
  for (let time = from; time <= to; time += 3600) rows.push([time * 1000, '60000', '60300', '59800', String(60000 + (time % 13)), '25']);
  return route.fulfill({ json: rows });
});
await page.route(url => url.origin === new URL(base).origin && url.pathname.startsWith('/api/'), route => route.fulfill({ json: { ok: true, quotes: {} } }));
try {
  await page.goto(base + '/alfa-charts.html?debug=1&symbol=BTCUSDT&interval=1h');
  await page.waitForFunction(() => window.__alfaDebug?.ready && window.__alfaDebug.drawings.ready);
  // Draw through the real toolbar and canvas, not by injecting a drawing document.
  await page.click('#drawing-tools [data-group=lines]');
  await page.click('.tool-flyout [data-tool=trend]');
  const box = await page.locator('#chart').boundingBox();
  await page.mouse.click(box.x + 200, box.y + 150);
  await page.mouse.click(box.x + 330, box.y + 180);
  await page.waitForFunction(() => window.__alfaDebug.drawings.history.doc.drawings.length === 1);
  const drawing = await page.evaluate(() => structuredClone(window.__alfaDebug.drawings.history.doc));
  // Normal navigation must not start Replay.
  await page.click('#view-menu > summary');
  await page.fill('#goto-date', '2026-09-15T12:00');
  await page.click('#goto-date-btn');
  await page.waitForFunction(() => document.getElementById('connection').textContent === 'Tarih aralığı yüklendi');
  assert.ok(olderCalls >= 2);
  assert.equal(await page.locator('body').evaluate(el => el.classList.contains('replay-mode')), false);
  assert.deepEqual(await page.evaluate(() => window.__alfaDebug.drawings.history.doc), drawing);
  const target = Date.parse('2026-09-15T12:00:00Z') / 1000;
  assert.ok(await page.evaluate(t => {
    const range = window.__alfaDebug.chart.timeScale().getVisibleRange();
    return range.from <= t && range.to >= t;
  }, target));
  const chooseRange = async value => {
    if (!await page.evaluate(() => document.getElementById('view-menu').open)) await page.click('#view-menu > summary');
    const nested = page.locator('#view-menu #range-menu');
    if (!await nested.evaluate(el => el.open)) await page.click('#view-menu #range-menu > summary');
    await page.click(`#view-menu #range-menu [data-range="${value}"]`);
    await page.waitForFunction(v => document.querySelector(`#view-menu #range-menu [data-range="${v}"]`).getAttribute('aria-pressed') === 'true', value);
    await page.click('#view-menu #range-menu > summary');
    await page.click('#view-menu > summary');
  };
  for (const duration of [86400, 432000, 2592000, 7776000]) {
    await chooseRange(duration);
    assert.ok(await page.evaluate(t => window.__alfaDebug.history[0].time <= t, end - duration));
  }
  await chooseRange('all');
  await page.waitForFunction(() => document.getElementById('connection').textContent.includes('sağlayıcının mevcut geçmişi'));
  assert.equal(await page.evaluate(() => window.__alfaDebug.history[0].time), first);
  assert.deepEqual(await page.evaluate(() => window.__alfaDebug.drawings.history.doc), drawing);
  const before = await page.evaluate(() => window.__alfaDebug.chart.timeScale().getVisibleLogicalRange());
  await page.click('#view-menu > summary');
  await page.fill('#goto-date', '2025-01-01T00:00');
  await page.click('#goto-date-btn');
  await page.waitForFunction(() => document.getElementById('connection').textContent.includes('görünüm korundu'));
  assert.deepEqual(await page.evaluate(() => window.__alfaDebug.chart.timeScale().getVisibleLogicalRange()), before);
  assert.deepEqual(errors, []);
  console.log('PASS: normal goto backfills, all five presets, unchanged drawing anchors, unavailable date preserves view, no Replay');
} catch (error) {
  console.error(await page.evaluate(() => ({ connection: document.getElementById('connection')?.textContent, message: document.getElementById('message')?.textContent, debug: !!window.__alfaDebug })), errors);
  throw error;
} finally { await browser.close(); }
