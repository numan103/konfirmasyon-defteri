// Anonymous deterministic desktop interaction regression. No production writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const arg = key => process.argv.find(s => s.startsWith(`--${key}=`))?.slice(key.length + 3);
const { chromium } = await import(pathToFileURL(path.resolve(arg('playwright'))));
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const origin = arg('url') || 'http://127.0.0.1:8787';
const errors = [];
const shots = path.resolve(arg('shots') || '.qa-reports/desktop-streamline');
fs.mkdirSync(shots, { recursive: true });
try {
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    window.supabase = { createClient: () => ({ auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } })
    } }) };
    localStorage.setItem('alfa-watchlist:tv-migrated:v1:guest', '1');
  });
  await page.routeWebSocket(/wss:\/\//, () => {});
  await page.route(/^https:\/\/(?:data-api\.binance\.vision|api\.binance\.com|fapi\.binance\.com)\//, route => {
    const u = new URL(route.request().url());
    if (u.pathname.endsWith('/klines')) {
      const tf = u.searchParams.get('interval') || '1h';
      const step = ({ '15m': 900, '1h': 3600, '4h': 14400 })[tf] || 3600;
      const end = Number(u.searchParams.get('endTime')) / 1000 || Date.parse('2026-11-24T12:00:00Z') / 1000;
      return route.fulfill({ json: Array.from({ length: 600 }, (_, i) =>
        [(end - (599 - i) * step) * 1000, '60000', '60300', '59800', '60100', '12', 0, 0, 100, '7']) });
    }
    if (u.pathname.endsWith('/exchangeInfo')) return route.fulfill({ json: { symbols: ['BTC', 'ETH'].map(baseAsset =>
      ({ symbol: baseAsset + 'USDT', baseAsset, quoteAsset: 'USDT', status: 'TRADING', isSpotTradingAllowed: true })) } });
    return route.fulfill({ json: [] });
  });
  await page.route(u => u.origin === new URL(origin).origin && u.pathname.startsWith('/api/'),
    route => route.fulfill({ json: { ok: true } }));
  await page.goto(origin + '/alfa-charts.html?debug=1');
  await page.waitForFunction(() => window.__alfaDebug?.ready && window.__alfaDebug.history.length > 0);
  const overflow = await page.evaluate(() => ({
    h: document.documentElement.scrollHeight, vh: innerHeight,
    sheets: [...document.querySelectorAll('.mobile-sheet')].filter(e => getComputedStyle(e).display !== 'none').length
  }));
  assert.equal(overflow.sheets, 0, 'phone menus must never form a page below the desktop chart');
  assert.ok(overflow.h <= overflow.vh + 1, 'desktop app must not scroll below the canvas');
  assert.equal(await page.evaluate(() => window.__alfaDebug.chart.options().layout.panes.separatorColor), '#283346',
    'pane separators must use the dark chart palette, not white');
  const width = () => page.locator('#chart').evaluate(e => e.getBoundingClientRect().width);
  const before = await width();
  await page.locator('#list-toggle').click();
  await page.waitForFunction(w => document.querySelector('#chart').getBoundingClientRect().width > w + 180, before);
  await page.locator('#list-toggle').click();
  await page.waitForFunction(w => document.querySelector('#chart').getBoundingClientRect().width <= w + 2, before);
  await page.locator('#mobile-tools-toggle').click();
  assert.equal(await page.locator('.drawing-space').isVisible(), false, 'pencil must toggle the actual drawing rail');
  await page.locator('#mobile-tools-toggle').click();
  assert.equal(await page.locator('.drawing-space').isVisible(), true);
  await page.screenshot({ path: path.join(shots, '01-chart-only.png'), fullPage: true });
  await page.locator('#market-title').click();
  await page.waitForSelector('dialog[open].pair-explorer-dialog');
  assert.equal(await page.locator('.pair-explorer-dialog .pair-add,.pair-explorer-dialog .pair-fav,.pair-explorer-dialog .pair-open').count(), 0,
    'symbol picker must use direct row selection, not add/star/open buttons');
  await page.screenshot({ path: path.join(shots, '02-direct-picker.png') });
  await page.locator('[data-pair-row="ETHUSDT"]').click();
  await page.waitForFunction(() => window.__alfaDebug.symbol === 'ETHUSDT' && !document.querySelector('dialog[open]'));
  for (const id of ['ema', 'cvdSpot', 'cvdPerp']) {
    await page.locator('#indicators-manage').click();
    await page.locator(`[data-add="${id}"]`).click();
    await page.keyboard.press('Escape');
  }
  await page.waitForFunction(() => window.__alfaDebug.chart.panes().length === 3);
  assert.equal(await page.locator('#study-legend .is-pane-study:visible').count(), 0,
    'pane studies must not be repeated in the top-left overlay legend');
  const plot = await page.locator('#chart').boundingBox();
  await page.mouse.dblclick(plot.x + plot.width * .65, plot.y + plot.height * .25);
  await page.waitForFunction(() => window.__alfaDebug.chart.panes().length === 1);
  await page.screenshot({ path: path.join(shots, '03-panels-hidden.png') });
  await page.mouse.dblclick(plot.x + plot.width * .65, plot.y + plot.height * .25);
  await page.waitForFunction(() => window.__alfaDebug.chart.panes().length === 3);
  const toggle = page.locator('#study-legend-toggle');
  await toggle.click();
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(await page.locator('#study-legend .study-chip-name:visible').count(), 0,
    'folding must hide names, not disable the overlays');
  assert.ok(await page.locator('#study-legend [data-study-values]:visible').count() > 0,
    'folding must keep the compact live values visible');
  await toggle.click();
  assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
  assert.ok(await page.locator('#study-legend .study-chip-name:visible').count() > 0);
  await page.locator('#watch-rows [data-symbol]').first().click({ button: 'right' });
  await page.locator('[data-watch-action="section-add"]').click();
  await page.waitForSelector('#watch-section-name');
  await page.locator('#watch-section-name').fill('Kripto');
  await page.locator('#watch-section-save').click();
  await page.waitForSelector('.watch-group-head:has-text("Kripto")');
  await page.screenshot({ path: path.join(shots, '04-custom-section.png') });
  const otherRow = page.locator('.watch-group:has(.watch-group-head:has-text("Diğer")) .watch-row').first();
  const dragged = await otherRow.getAttribute('data-symbol');
  const cryptoGroup = page.locator('.watch-group:has(.watch-group-head:has-text("Kripto"))');
  await otherRow.dragTo(cryptoGroup);
  await page.waitForFunction(symbol => {
    const list = window.__alfaDebug.watchlist.doc.lists.find(l => l.id === window.__alfaDebug.watchlist.doc.activeListId);
    return list?.sections?.some(section => section.name === 'Kripto' && section.symbols.includes(symbol));
  }, dragged, { timeout: 5000 });
  await page.screenshot({ path: path.join(shots, '05-dragged-section.png') });
  await page.reload();
  await page.waitForFunction(() => window.__alfaDebug?.ready);
  assert.ok(await page.locator('.watch-group-head:has-text("Kripto")').count(), 'custom section must survive reload');
  assert.ok(await page.evaluate(symbol => {
    const list = window.__alfaDebug.watchlist.doc.lists.find(l => l.id === window.__alfaDebug.watchlist.doc.activeListId);
    return list?.sections?.some(section => section.name === 'Kripto' && section.symbols.includes(symbol));
  }, dragged), 'dragged section membership must survive reload');
  await page.waitForFunction(() => window.__alfaDebug.history.length >= 500);
  const historicalCenter = await page.evaluate(() => {
    const d = window.__alfaDebug, bars = d.history;
    d.chart.timeScale().setVisibleRange({ from: bars[150].time, to: bars[200].time });
    return (bars[150].time + bars[200].time) / 2;
  });
  await page.locator('#timeframes [data-interval="4h"]').click();
  await page.waitForFunction(() => window.__alfaDebug.interval === '4h' && window.__alfaDebug.history.length > 0);
  await page.waitForFunction(center => {
    const r = window.__alfaDebug.chart.timeScale().getVisibleRange();
    return r && Math.abs((Number(r.from) + Number(r.to)) / 2 - center) < 8 * 3600;
  }, historicalCenter, { timeout: 5000 });
  await page.waitForFunction(() => window.__alfaDebug.publicStudies.replayClock != null, null, { timeout: 5000 });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, viewport: true, watchlistWidth: true, pencil: true,
    directPairSelection: true, paneHideRestore: true, compactLegend: true, persistedSections: true }));
} finally { await browser.close(); }
