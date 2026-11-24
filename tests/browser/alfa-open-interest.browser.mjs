// Isolated chart + synthetic Binance transports. Futures statistics reject
// unsupported periods just as the real endpoint rejects "60m".
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { candleCloseTime } from '../../assets/alfa-replay-model.mjs';
const arg = key => process.argv.find(s => s.startsWith(`--${key}=`))?.slice(key.length + 3);
const { chromium } = await import(pathToFileURL(path.resolve(arg('playwright'))));
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
const origin = arg('url') || 'http://127.0.0.1:4173';
const last = Math.floor(Date.now() / 3600000) * 3600, requests = [], errors = [], writes = [];
let mode = 'ok', socket;
const ready = () => page.waitForFunction(() => window.__alfaDebug?.ready && window.__alfaDebug.drawings.ready);
const status = (id, state) => page.waitForFunction(({ id, state }) =>
  document.querySelector(`#study-legend [data-study-status="${id}"]`)?.dataset.state === state, { id, state });
const close = async () => { await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.querySelector('dialog[open]')); };
const add = async id => {
  await page.locator('#indicators-manage').click();
  await page.locator(`[data-add="${id}"]`).click();
  await close();
};
const settings = async period => {
  await page.locator('#study-legend [data-study-settings=oi]').click();
  await page.locator('[data-k=period]').selectOption(period);
  await page.locator('#is-apply').click();
  await close();
};
try {
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (request.method() !== 'GET' && new URL(request.url()).origin === new URL(origin).origin) writes.push(request.url());
  });
  await page.addInitScript(({ last }) => {
    if (!/^https?:$/.test(location.protocol)) return;
    window.supabase = { createClient: () => ({ auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } })
    } }) };
    if (!localStorage.getItem('oi-fixture-seeded')) {
      localStorage.setItem('oi-fixture-seeded', '1');
      localStorage.setItem('alfa-drawings:v1:guest:BTCUSDT', JSON.stringify({
        doc: { version: 1, templates: [], drawings: [{
          id: 'oi-fixture-line', type: 'horizontal', points: [{ time: last - 7200, price: 60000 }],
          color: '#8ea7ff', width: 2, hidden: false, locked: true
        }] }, dirty: false, revision: 0
      }));
      localStorage.setItem('alfa-alarms:v1:guest', '[]');
      // Keep this futures-statistics regression on bare Binance Spot refs;
      // the legacy TV watchlist restore is verified in its own browser suite.
      localStorage.setItem('alfa-watchlist:v1:guest', JSON.stringify({
        version: 2, name: 'İzleme listesi', symbols: ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT']
      }));
      localStorage.setItem('alfa-watchlist:tv-migrated:v1:guest', '1');
    }
  }, { last });
  await page.routeWebSocket(/wss:\/\//, route => { socket = route; });
  await page.route(/^https:\/\/(?:data-api\.binance\.vision|api\.binance\.com)\//, route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/klines')) {
      const step = candleCloseTime(0, url.searchParams.get('interval') || '1h');
      return route.fulfill({ json: Array.from({ length: 240 }, (_, i) =>
        [(last - (239 - i) * step) * 1000, '60000', '60300', '59800', '60100', '10']) });
    }
    if (url.pathname.endsWith('/exchangeInfo')) return route.fulfill({ json: { symbols: [{
      symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', status: 'TRADING', isSpotTradingAllowed: true
    }] } });
    return route.fulfill({ json: [] });
  });
  await page.route(/^https:\/\/fapi\.binance\.com\/futures\/data\//, route => {
    const url = new URL(route.request().url()), period = url.searchParams.get('period');
    requests.push({ path: url.pathname, period });
    if (!['5m', '15m', '30m', '1h', '2h', '4h', '6h', '12h', '1d'].includes(period)) {
      return route.fulfill({ status: 400, json: { code: -1130, msg: "parameter 'period' is invalid." } });
    }
    if (mode === 'error') return route.fulfill({ status: 503, json: { msg: 'unavailable' } });
    if (mode === 'empty') return route.fulfill({ json: [] });
    const step = candleCloseTime(0, period), end = Math.floor(last / step) * step;
    return route.fulfill({ json: Array.from({ length: 20 }, (_, i) => ({
      timestamp: (end - (19 - i) * step) * 1000,
      sumOpenInterest: String(1000 + i), sumOpenInterestValue: String((1000 + i) * 60000),
      longShortRatio: '1.5', longAccount: '0.6', shortAccount: '0.4'
    })) });
  });
  await page.goto(origin + '/alfa-charts.html?debug=1'); await ready();
  const documentBefore = await page.evaluate(() => structuredClone(window.__alfaDebug.drawings.history.doc));
  assert.equal(documentBefore.drawings.length, 1);
  await add('oi'); await status('oi', 'ready');
  await page.waitForFunction(() => window.__alfaDebug.publicStudies.seriesById.oi[0]?.getPane().getHeight() >= 80);
  assert.equal(requests[0].period, '1h', '1H must request 1h, not 60m');
  const result = await page.evaluate(() => {
    const api = window.__alfaDebug, series = api.publicStudies.seriesById.oi[0];
    return { values: series.data().map(row => row.value), height: series.getPane().getHeight(), panes: api.chart.panes().length,
      symbol: document.getElementById('market-title').textContent, source: api.publicStudies.facades.oi.status.message };
  });
  assert.equal(result.panes, 2);
  assert.equal(result.values.length, 20);
  assert.equal(result.values.at(-1), 1019);
  assert.ok(result.height >= 80);
  assert.equal(result.symbol, 'BTCUSDT · 1H', 'Spot chart must not be converted to perpetual');
  assert.match(result.source, /Binance Futures.*1h/);
  await page.locator('#study-legend [data-study-settings=oi]').click();
  assert.match(await page.locator('[data-study-scope=oi]').textContent(), /fiyat grafiği Spot kalır/);
  await close();

  await settings('4h'); await status('oi', 'ready');
  assert.equal(requests.at(-1).period, '4h');
  await settings('auto'); await status('oi', 'ready');
  mode = 'error';
  await settings('auto'); await status('oi', 'error');
  assert.match(await page.locator('#study-legend [data-study-status=oi]').textContent(), /HTTP 503.*son veri korunuyor/);
  assert.equal(await page.evaluate(() => window.__alfaDebug.publicStudies.seriesById.oi.length), 1);
  socket.send(JSON.stringify({ e: 'kline', s: 'BTCUSDT', k: {
    s: 'BTCUSDT', i: '1h', t: last * 1000, o: '60000', h: '60300', l: '59800', c: '60100', v: '10'
  } }));
  await page.waitForFunction(() => document.getElementById('connection').textContent.includes('WebSocket'));
  assert.equal(await page.locator('#study-legend [data-study-status=oi]').getAttribute('data-state'), 'error',
    'a live price tick must not erase the study error');
  mode = 'ok';
  await page.locator('#study-legend [data-study-retry=oi]').click(); await status('oi', 'ready');

  mode = 'empty';
  await page.locator('#timeframes [data-interval="1m"]').click(); await ready();
  await add('oi'); await status('oi', 'empty');
  assert.equal(requests.at(-1).period, '5m', '1m charts use the supported minimum statistics period');
  assert.equal(await page.evaluate(() => window.__alfaDebug.publicStudies.seriesById.oi.length), 0);
  assert.match(await page.locator('#study-legend [data-study-status=oi]').textContent(), /veri yok/);
  mode = 'ok';
  await page.locator('#study-legend [data-study-retry=oi]').click(); await status('oi', 'ready');
  await add('longShort'); await status('longShort', 'ready');
  assert.equal(requests.at(-1).period, '5m');
  assert.equal(await page.evaluate(() => window.__alfaDebug.publicStudies.seriesById.longShort[0].data()[0].value), 1.5);
  await page.reload(); await ready(); await status('oi', 'ready');
  assert.ok(!requests.some(request => request.period === '60m'));
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth);
    // ResizeObserver and the chart's native pane layout run on rendering frames.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const geometry = await page.evaluate(() => ({
      oi: window.__alfaDebug.publicStudies.seriesById.oi[0].getPane().getHeight(),
      chart: document.getElementById('chart').clientHeight,
      panes: window.__alfaDebug.chart.panes().map(pane => pane.getHeight())
    }));
    assert.ok(geometry.oi >= 80, JSON.stringify({ width, ...geometry }));
  }
  assert.deepEqual(await page.evaluate(() => window.__alfaDebug.drawings.history.doc), documentBefore);
  assert.equal(await page.evaluate(() => localStorage.getItem('alfa-alarms:v1:guest')), '[]');
  assert.deepEqual(writes, []);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, default1hVisible: true, futuresSourceExplicit: true, spotUnchanged: true,
    manual4h: true, minimum5m: true, persistentError: true, retry: true, emptyState: true, longShort: true,
    reload: true, mobile: [390, 320], productionWrites: false, pageErrors: errors }));
} finally { await browser.close(); }
