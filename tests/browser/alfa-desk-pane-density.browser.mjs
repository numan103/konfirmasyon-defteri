// Desktop chart-first density: lower data panes must give the price plot its
// space back on a chart double-click, and their legend rows must tuck for real.
import assert from 'node:assert/strict';
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
      return route.fulfill({ json: Array.from({ length: count }, (_, i) =>
        [(last - (count - 1 - i) * step) * 1000, '60000', '60300', '59800', '60100', '12', 0, 0, 100, '7']) });
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
  assert.ok(empty.chartHeight >= empty.viewportHeight * .7, `chart host too short: ${empty.chartHeight}/${empty.viewportHeight}`);

  for (const id of ['cvdSpot', 'cvdPerp', 'marketDelta']) {
    await page.locator('#indicators-manage').click();
    await page.locator(`[data-add="${id}"]`).click();
    await page.keyboard.press('Escape');
    await page.waitForFunction(i => document.querySelector(`#study-legend [data-study-chip="${i}"]`), id);
  }
  await page.waitForFunction(() => window.__alfaDebug.chart.panes().length >= 4, null, { timeout: 15000 });
  await page.waitForFunction(() => window.__alfaDebug.chart.panes().slice(1).every(p => p.getHeight() >= 80));
  const loaded = await geometry();
  assert.deepEqual(loaded.paneIds, ['cvdSpot', 'cvdPerp', 'marketDelta']);
  assert.ok(loaded.chartHeight >= loaded.viewportHeight * .7, `data panes shrank the chart host: ${loaded.chartHeight}`);

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

  assert.deepEqual(writes, []);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, chartFirst: true,
    loaded: loaded.heights, tucked: tucked.heights, restored: restored.heights,
    chartDoubleClick: true, legendDoubleClick: true, productionWrites: false }));
} finally {
  await browser.close();
}
