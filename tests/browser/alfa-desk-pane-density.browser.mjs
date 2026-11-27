// Desktop chart-first density: lower data panes must give the price plot its
// space back on a chart double-click, and their legend rows must tuck for real.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { candleCloseTime } from '../../assets/alfa-replay-model.mjs';

const arg = key => process.argv.find(s => s.startsWith(`--${key}=`))?.slice(key.length + 3);
const { chromium } = await import(pathToFileURL(path.resolve(arg('playwright'))));
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const origin = arg('url') || 'http://127.0.0.1:8787';
const last = Date.parse('2026-11-24T12:00:00Z') / 1000;
const errors = [], writes = [];
const ready = () => page.waitForFunction(() => window.__alfaDebug?.ready && window.__alfaDebug.drawings.ready, null, { timeout: 30000 });
const geometry = () => page.evaluate(() => {
  const chart = document.getElementById('chart');
  const panes = window.__alfaDebug.chart.panes();
  const ids = [...document.querySelectorAll('#study-legend .study-chip.is-pane-study')].map(el => el.dataset.studyChip);
  return {
    chartHeight: Math.round(chart.getBoundingClientRect().height),
    viewportHeight: innerHeight,
    chartFirst: document.body.classList.contains('chart-first'),
    paneIds: ids,
    heights: panes.map(pane => Math.round(pane.getHeight())),
    collapsed: Object.fromEntries(ids.map(id => [id, !!window.__alfaDebug.studiesUI.state[id]?.collapsed]))
  };
});
const tuckState = (collapsed) => page.waitForFunction(expected => {
  const ids = [...document.querySelectorAll('#study-legend .study-chip.is-pane-study')].map(el => el.dataset.studyChip);
  return ids.length >= 3 && ids.every(id => !!window.__alfaDebug.studiesUI.state[id]?.collapsed === expected);
}, collapsed, { timeout: 10000 });
const dblclickPlot = async () => {
  const box = await page.locator('#chart').boundingBox();
  await page.mouse.dblclick(box.x + box.width * .5, box.y + box.height * .22);
};
try {
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (request.method() !== 'GET' && new URL(request.url()).origin === new URL(origin).origin) writes.push(request.url());
  });
  await page.addInitScript(() => {
    window.supabase = { createClient: () => ({ auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } })
    } }) };
    localStorage.setItem('alfa-watchlist:v1:guest', JSON.stringify({ version: 2, name: 'İzleme listesi', symbols: ['BTCUSDT'] }));
    localStorage.setItem('alfa-watchlist:tv-migrated:v1:guest', '1');
  });
  await page.routeWebSocket(/wss:\/\//, () => {});
  await page.route(/^https:\/\/(?:data-api\.binance\.vision|api\.binance\.com|fapi\.binance\.com)\//, route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/klines')) {
      const step = candleCloseTime(0, url.searchParams.get('interval') || '1h');
      const count = Math.min(240, Number(url.searchParams.get('limit')) || 240);
      return route.fulfill({ json: Array.from({ length: count }, (_, i) => {
        const open = 60000 + i * 4 + Math.sin(i / 11) * 180;
        const close = open + Math.sin(i * 1.7) * 65;
        return [(last - (count - 1 - i) * step) * 1000, String(open),
          String(Math.max(open, close) + 35), String(Math.min(open, close) - 30),
          String(close), '12', 0, 0, 100, '7'];
      }) });
    }
    if (url.pathname.endsWith('/exchangeInfo')) return route.fulfill({ json: { symbols: [{
      symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', status: 'TRADING', isSpotTradingAllowed: true
    }] } });
    return route.fulfill({ json: [] });
  });
  await page.route(url => url.origin === new URL(origin).origin && url.pathname.startsWith('/api/'),
    route => route.fulfill({ json: { ok: true } }));

  await page.goto(origin + '/alfa-charts.html?debug=1');
  await ready();
  const empty = await geometry();
  assert.equal(empty.chartFirst, true, 'desktop starts chart-first');
  assert.equal(await page.locator('#mobile-swipe-overlay').isVisible(), false,
    'empty phone carousel buttons must never leak into the desktop canvas');
  assert.ok(empty.chartHeight >= empty.viewportHeight * .7, `chart host too short: ${empty.chartHeight}/${empty.viewportHeight}`);

  // Exercise the visible desktop controls rather than invoking debug actions.
  for (const type of ['bars', 'line', 'area', 'heikin', 'candles']) {
    await page.locator('#chart-type').selectOption(type);
    assert.equal(await page.locator('#chart-type').inputValue(), type);
    assert.equal(await page.evaluate(() => window.__alfaDebug.candles.options().visible), type === 'candles');
    assert.ok(await page.locator('#chart canvas').count() > 0);
  }
  for (const id of ['range-menu', 'lab-menu', 'view-menu']) {
    await page.locator(`#${id} > summary`).click();
    assert.equal(await page.locator(`#${id}`).evaluate(el => el.open), true);
    const popover = await page.locator(`#${id} .workspace-popover`).boundingBox();
    assert.ok(popover && popover.x >= 0 && popover.y >= 0 &&
      popover.x + popover.width <= 1441 && popover.y + popover.height <= 901,
    `${id} must fit the desktop viewport`);
    await page.locator(`#${id} > summary`).click();
  }
  await page.locator('#view-menu > summary').click();
  await page.locator('#view-grid').uncheck();
  assert.equal(await page.evaluate(() => window.__alfaDebug.viewConfig.grid), false);
  await page.locator('#view-grid').check();
  await page.locator('#chart-settings').click();
  await page.waitForSelector('#chart-settings-form');
  await page.keyboard.press('Escape');
  await page.waitForSelector('dialog[open]', { state: 'detached' });
  await page.locator('#screenshot').click();
  await page.waitForSelector('#shot-menu', { state: 'visible' });
  assert.equal(await page.locator('#shot-menu [data-shot]').count(), 3);
  await page.keyboard.press('Escape');
  await page.locator('#list-toggle').click();
  assert.equal(await page.locator('#list-toggle').getAttribute('aria-pressed'), 'false');
  await page.locator('#list-toggle').click();
  assert.equal(await page.locator('#list-toggle').getAttribute('aria-pressed'), 'true');

  for (const id of ['cvdSpot', 'cvdPerp', 'marketDelta']) {
    await page.locator('#indicators-manage').click();
    await page.locator(`[data-add="${id}"]`).click();
    await page.keyboard.press('Escape');
    await page.waitForFunction(i => document.querySelector(`#study-legend [data-study-chip="${i}"]`), id);
  }
  await page.waitForFunction(() => window.__alfaDebug.chart.panes().length >= 4, null, { timeout: 15000 });
  await page.waitForFunction(() => window.__alfaDebug.chart.panes().slice(1).every(p => p.getHeight() >= 80));
  const loaded = await geometry();
  await page.waitForFunction(() => document.querySelectorAll('.pane-study-label').length >= 3, null, { timeout: 3000 });
  const captions = await page.locator('.pane-study-label').allTextContents();
  assert.ok(captions.some(text => text.includes('CVD · Spot')), 'spot pane needs its own caption');
  assert.equal(await page.evaluate(() => window.__alfaDebug.publicStudies.seriesById.cvdSpot[0].options().title), '',
    'pane captions must not be duplicated as coloured price-axis badges');
  assert.deepEqual(loaded.paneIds, ['cvdSpot', 'cvdPerp', 'marketDelta']);
  assert.ok(loaded.chartHeight >= loaded.viewportHeight * .7, `data panes shrank the chart host: ${loaded.chartHeight}`);
  const desktopLegend = await page.evaluate(() => ({
    chartTop: document.querySelector('#chart').getBoundingClientRect().top,
    toolbarBottom: document.querySelector('.toolbar').getBoundingClientRect().bottom,
    metadataVisible: [...document.querySelectorAll('#study-legend .study-chip-meta')]
      .some(el => getComputedStyle(el).display !== 'none'),
    controls: [...document.querySelectorAll('#study-legend [data-study-eye]')].map(el => {
      const r = el.getBoundingClientRect(); return { w: r.width, h: r.height };
    })
  }));
  assert.ok(desktopLegend.chartTop <= desktopLegend.toolbarBottom + 2,
    'study legend must overlay the plot instead of reserving a large empty header');
  assert.equal(desktopLegend.metadataVisible, false, 'verbose provider descriptions must not crowd the desktop legend');
  assert.ok(desktopLegend.controls.every(r => r.w >= 24 && r.h >= 24),
    'desktop study visibility controls must be easy to click');

  await dblclickPlot();
  await tuckState(true);
  await page.waitForFunction(() => window.__alfaDebug.chart.panes().slice(1).every(p => p.getHeight() <= 30));
  const tucked = await geometry();
  assert.ok(tucked.heights[0] >= tucked.chartHeight * .8,
    `double-click must give the price plot its space back: ${tucked.heights[0]}/${tucked.chartHeight}`);
  assert.ok(tucked.heights.slice(1).every(h => h <= 30), `lower panes must tuck: ${tucked.heights.join(',')}`);

  await dblclickPlot();
  await tuckState(false);
  await page.waitForFunction(() => window.__alfaDebug.chart.panes().slice(1).every(p => p.getHeight() >= 80));
  const restored = await geometry();
  assert.ok(restored.heights[0] >= restored.chartHeight * .45,
    `restored price plot must stay usable: ${restored.heights[0]}/${restored.chartHeight}`);

  const chipName = page.locator('#study-legend [data-study-chip="cvdSpot"] .study-chip-name');
  await chipName.dblclick();
  await page.waitForFunction(() => {
    const id = window.__alfaDebug.publicStudies.seriesById.cvdSpot[0]?.getPane?.();
    return !!window.__alfaDebug.studiesUI.state.cvdSpot.collapsed && id && id.getHeight() <= 30;
  }, null, { timeout: 10000 });
  await chipName.dblclick();
  await page.waitForFunction(() => {
    const id = window.__alfaDebug.publicStudies.seriesById.cvdSpot[0]?.getPane?.();
    return !window.__alfaDebug.studiesUI.state.cvdSpot.collapsed && id && id.getHeight() >= 80;
  }, null, { timeout: 10000 });

  // Hiding a study is not collapsing it: its native pane must disappear.
  const beforeHide = await page.evaluate(() => window.__alfaDebug.chart.panes().length);
  await page.locator('#study-legend [data-study-eye="cvdSpot"]').click();
  await page.waitForFunction(count => window.__alfaDebug.chart.panes().length === count - 1, beforeHide);
  assert.equal(await page.evaluate(() => window.__alfaDebug.studiesUI.state.cvdSpot.visible), false);
  await page.locator('#study-legend [data-study-eye="cvdSpot"]').click();
  await page.waitForFunction(count => window.__alfaDebug.chart.panes().length === count, beforeHide);

  // Session boundaries must be readable without opening settings.
  await page.evaluate(() => window.__alfaDebug.sessionBoxes.setEnabled(true));
  await page.waitForFunction(() => document.querySelectorAll('.session-boxes-overlay text').length > 0);
  const sessionLabels = await page.locator('.session-boxes-overlay text').allTextContents();
  assert.ok(sessionLabels.every(label => /\d{2}:\d{2}–\d{2}:\d{2} UTC/.test(label)),
    `session labels must include their actual UTC boundaries: ${sessionLabels.join(', ')}`);

  // Delay the new timeframe response and inspect the cache before it arrives.
  // The outgoing hourly candles must never be relabelled as 15-minute data.
  await page.locator('#indicators-manage').click();
  await page.locator('[data-add="ema"]').click();
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__alfaDebug.indicators.items.some(item => item.type === 'ema'));
  await page.route(/\/api\/v3\/klines.*interval=15m/, async route => {
    await new Promise(resolve => setTimeout(resolve, 1500));
    await route.fallback();
  });
  await page.locator('#timeframes [data-interval="15m"]').click();
  const wrongCache = await page.evaluate(() => {
    const bars = window.__alfaDebug.historyCache.get('BTCUSDT|15m')?.bars;
    return bars?.length > 1 && bars[1].time - bars[0].time !== 900;
  });
  assert.equal(!!wrongCache, false, 'hourly candles must not leak into the 15m cache');
  // Switch back before the delayed request resolves. Empty transitional series
  // must not overwrite the user's persisted indicator layout.
  await page.locator('#timeframes [data-interval="1h"]').click();
  await page.waitForFunction(() => window.__alfaDebug.history.length > 1);
  assert.equal(await page.evaluate(() => window.__alfaDebug.indicators.items.some(item => item.type === 'ema')), true,
    'rapid timeframe switching must preserve indicators');
  await page.locator('#timeframes [data-interval="15m"]').click();
  await page.waitForFunction(() => {
    const bars = window.__alfaDebug.history;
    return bars.length > 1 && bars[1].time - bars[0].time === 900;
  });

  assert.deepEqual(writes, []);
  assert.deepEqual(errors, []);
  await page.waitForFunction(() => document.querySelectorAll('.pane-study-label').length >= 3);
  await page.waitForFunction(() => new Set([...document.querySelectorAll('.pane-study-label')]
    .map(el => Math.round(el.getBoundingClientRect().top))).size >= 3, null, { timeout: 3000 });
  const shots = path.resolve(arg('shots') || '.qa-reports/desktop-polish');
  fs.mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: path.join(shots, 'desktop-studies-sessions.png') });
  console.log(JSON.stringify({ passed: true, chartFirst: true,
    loaded: loaded.heights, tucked: tucked.heights, restored: restored.heights,
    chartDoubleClick: true, legendDoubleClick: true, productionWrites: false }));
} finally {
  await browser.close();
}
