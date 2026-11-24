// Deterministic, synthetic Binance transport; no real login, upstream or DB writes.
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { candleCloseTime } from '../../assets/alfa-replay-model.mjs';

const arg = key => process.argv.find(s => s.startsWith(`--${key}=`))?.slice(key.length + 3);
const { chromium } = await import(pathToFileURL(path.resolve(arg('playwright'))));
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
const errors = [], writes = [];
const last = Date.parse('2026-11-24T12:00:00Z') / 1000;
const origin = arg('url') || 'http://127.0.0.1:4173';
const ready = page => page.waitForFunction(() => window.__alfaDebug?.ready && window.__alfaDebug.drawings.ready);
const choose = async (page, value) => {
  await page.locator('#chart-timezone').click();
  await page.locator('#timezone-form select').selectOption(value);
  await page.locator('#timezone-form button[type=submit]').click();
  await page.waitForFunction(zone => document.getElementById('chart-timezone').dataset.timezone === zone, value);
};
const snapshot = page => page.evaluate(() => {
  const api = window.__alfaDebug;
  return {
    doc: structuredClone(api.drawings.history.doc), bars: api.candles.data(),
    indicators: api.indicators.toJSON(), sessions: structuredClone(api.sessionBoxes.config),
    levels: structuredClone(api.sessionLevels.config), range: api.chart.timeScale().getVisibleLogicalRange()
  };
});
try {
  await context.addInitScript(({ last }) => {
    if (!/^https?:$/.test(location.protocol)) return; // new tabs start as opaque about:blank
    window.supabase = { createClient: () => ({ auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } })
    } }) };
    if (!localStorage.getItem('timezone-fixture-seeded')) {
      localStorage.setItem('timezone-fixture-seeded', '1');
      localStorage.setItem('alfa-drawings:v1:guest:BTCUSDT', JSON.stringify({
        doc: { version: 1, templates: [], drawings: [{
          id: 'timezone-fixture-line', type: 'horizontal', points: [{ time: last - 7200, price: 60100 }],
          color: '#8ea7ff', width: 2, hidden: false, locked: false
        }] }, dirty: false, revision: 0
      }));
      localStorage.setItem('alfa-alarms:v1:guest', '[]');
    }
  }, { last });
  await context.routeWebSocket(/wss:\/\//, () => {});
  await context.route(/^https:\/\/(?:data-api\.binance\.vision|api\.binance\.com)\//, async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/klines')) {
      const step = candleCloseTime(0, url.searchParams.get('interval') || '1h');
      const end = url.searchParams.has('endTime') ? Math.floor(Number(url.searchParams.get('endTime')) / 1000) : last;
      const start = url.searchParams.has('startTime') ? Number(url.searchParams.get('startTime')) / 1000 : end - 239 * step;
      const count = Math.min(1000, Math.floor((end - start) / step) + 1);
      const rows = Array.from({ length: count }, (_, i) => [
        (start + i * step) * 1000, '60000', '60300', '59800', '60100', '25'
      ]);
      return route.fulfill({ json: rows });
    }
    if (url.pathname.endsWith('/exchangeInfo')) return route.fulfill({ json: { symbols: ['BTC', 'ETH', 'BNB', 'SOL'].map(baseAsset => ({
      symbol: baseAsset + 'USDT', baseAsset, quoteAsset: 'USDT', status: 'TRADING', isSpotTradingAllowed: true
    })) } });
    return route.fulfill({ json: [] });
  });
  await context.route(url => url.origin === new URL(origin).origin && url.pathname.startsWith('/api/'),
    route => route.fulfill({ json: { ok: true } }));
  context.on('page', page => {
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', req => { if (req.method() !== 'GET' && req.url().includes('/api/')) writes.push(req.url()); });
  });
  const page = await context.newPage();
  await page.goto(origin + '/alfa-charts.html?debug=1');
  await ready(page);
  assert.equal(await page.locator('#chart-timezone').textContent(), 'UTC');
  assert.match(await page.locator('#price-time').textContent(), /2026-11-24 12:00 · UTC/);
  await page.locator('#indicators-manage').click();
  await page.locator('[data-add=ema]').click();
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__alfaDebug.chart.timeScale().setVisibleLogicalRange({ from: 80, to: 190 }));
  await page.waitForFunction(() => {
    const range = window.__alfaDebug.chart.timeScale().getVisibleLogicalRange();
    return range?.from === 80 && range.to === 190;
  });
  const before = await snapshot(page);
  assert.equal(before.doc.drawings.length, 1);
  assert.equal(before.indicators.length, 1);
  await choose(page, 'Europe/Istanbul');
  assert.deepEqual(await snapshot(page), before, 'formatting must not move the view, rewrite data, studies or drawing epochs');
  assert.match(await page.locator('#price-time').textContent(), /2026-11-24 15:00 · İstanbul/);
  const labels = await page.evaluate(time => {
    const chart = window.__alfaDebug.chart;
    return {
      crosshair: chart.options().localization.timeFormatter(time),
      axis: chart.timeScale().options().tickMarkFormatter(time, 3)
    };
  }, last);
  assert.deepEqual(labels, { crosshair: '2026-11-24 15:00', axis: '15:00' });
  await page.locator('#chart-timezone').click();
  await page.locator('#timezone-form select').selectOption('Asia/Tokyo');
  await page.locator('#timezone-cancel').click();
  assert.equal(await page.locator('#chart-timezone').textContent(), 'İstanbul');
  await page.locator('#chart-timezone').click();
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'chart-timezone');

  await page.locator('#view-menu summary').click();
  await page.locator('#chart-settings').click();
  await page.locator('#chart-settings-form select[name=timezone]').selectOption('America/New_York');
  await page.locator('#chart-settings-form button[type=submit]').click();
  assert.deepEqual(await snapshot(page), before, 'changing only the settings time zone must not fit or reset the view');
  assert.match(await page.locator('#price-time').textContent(), /2026-11-24 07:00 · New York/);

  const peer = await context.newPage();
  await peer.goto(origin + '/alfa-charts.html?debug=1&embed=1');
  await ready(peer);
  assert.equal(await peer.locator('#chart-timezone').textContent(), 'New York');
  await choose(page, 'Europe/London');
  await peer.waitForFunction(() => document.getElementById('chart-timezone').dataset.timezone === 'Europe/London');
  assert.match(await peer.locator('#price-time').textContent(), /12:00 · Londra/);
  await peer.close();

  await page.reload(); await ready(page);
  assert.equal(await page.locator('#chart-timezone').textContent(), 'Londra');
  assert.deepEqual((await snapshot(page)).doc, before.doc, 'reload must retain the original drawing');
  await page.locator('#symbol').selectOption('ETHUSDT'); await ready(page);
  await page.waitForFunction(() => document.getElementById('market-title').textContent === 'ETHUSDT · 1H');
  assert.equal(await page.locator('#chart-timezone').textContent(), 'Londra');
  await page.locator('#symbol').selectOption('BTCUSDT'); await ready(page);
  await page.waitForFunction(() => document.getElementById('market-title').textContent === 'BTCUSDT · 1H');

  await page.locator('#lab-menu summary').click();
  await page.locator('#replay-toggle').click();
  await page.locator('#replay-date').fill('2026-11-20T12:00');
  await page.locator('#replay-date-start').click();
  await page.waitForFunction(() => document.body.classList.contains('replay-mode'));
  const clock = await page.evaluate(() => window.__alfaDebug.replayClock);
  await choose(page, 'Asia/Tokyo');
  assert.equal(await page.evaluate(() => window.__alfaDebug.replayClock), clock);
  assert.match(await page.locator('#replay-info').textContent(), /2026-11-20T13:00:00.000Z/);
  await page.locator('#replay-stop').click(); await ready(page);
  assert.deepEqual((await snapshot(page)).doc, before.doc, 'leaving replay must retain the live drawing');
  await page.keyboard.press('Alt+r');
  assert.equal(await page.locator('#chart-timezone').textContent(), 'Tokyo', 'view reset must not erase time-zone preference');

  await choose(page, 'Europe/Istanbul');
  // A desktop-open watchlist becomes an intentional overlay on phones; close
  // it through its real control before tapping the chart's bottom bar.
  await page.locator('#list-toggle').click();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth);
    const geometry = await page.locator('#chart-timezone').boundingBox();
    assert.ok(geometry && geometry.x >= 0 && geometry.x + geometry.width <= width, 'mobile time-zone button stays on screen');
    await page.locator('#chart-timezone').click();
    await page.locator('#timezone-form select').selectOption('America/New_York');
    await page.locator('#timezone-form button[type=submit]').click();
    await choose(page, 'Europe/Istanbul');
  }
  assert.deepEqual(writes, [], 'time-zone changes never write to production APIs');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, syntheticTransport: true, axisAndCrosshair: true, viewAndDataUnchanged: true,
    drawingsPreserved: true, savedLocally: true, peerSync: true, replayUTC: true, mobile: [390, 320], productionWrites: false }));
} finally { await browser.close(); }
