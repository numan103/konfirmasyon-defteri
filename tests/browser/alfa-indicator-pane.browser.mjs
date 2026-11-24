// Deterministic chart transport: studies must survive period/symbol changes and
// expose TradingView-style vertical, collapsible legend controls.
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { candleCloseTime } from '../../assets/alfa-replay-model.mjs';

const arg = key => process.argv.find(s => s.startsWith(`--${key}=`))?.slice(key.length + 3);
const { chromium } = await import(pathToFileURL(path.resolve(arg('playwright'))));
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
const errors = [], writes = [];
const origin = arg('url') || 'http://127.0.0.1:4173';
const last = Date.parse('2026-11-24T12:00:00Z') / 1000;
const ready = page => page.waitForFunction(() => window.__alfaDebug?.ready && window.__alfaDebug.drawings.ready, null, { timeout: 30000 });
const state = page => page.evaluate(() => {
  const api = window.__alfaDebug;
  return {
    indicators: api.indicators.toJSON(),
    overlays: structuredClone(api.studiesUI.state),
    panes: api.chart.panes().length,
    studyKey: api.studyContext ? { ...api.studyContext } : null
  };
});
try {
  await context.addInitScript(() => {
    window.supabase = { createClient: () => ({ auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } })
    } }) };
  });
  await context.routeWebSocket(/wss:\/\//, () => {});
  await context.route(/^https:\/\/(?:data-api\.binance\.vision|api\.binance\.com)\//, async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/klines')) {
      const step = candleCloseTime(0, url.searchParams.get('interval') || '1h');
      const end = url.searchParams.has('endTime') ? Math.floor(Number(url.searchParams.get('endTime')) / 1000) : last;
      const start = url.searchParams.has('startTime') ? Number(url.searchParams.get('startTime')) / 1000 : end - 239 * step;
      const count = Math.min(1000, Math.floor((end - start) / step) + 1);
      return route.fulfill({ json: Array.from({ length: count }, (_, i) => [(start + i * step) * 1000, '60000', '60300', '59800', '60100', '25']) });
    }
    if (url.pathname.endsWith('/exchangeInfo')) return route.fulfill({ json: { symbols: ['BTC', 'ETH'].map(baseAsset => ({
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

  await page.locator('#indicators-manage').click();
  for (const id of ['ema', 'rsi', 'macd', 'fvg']) await page.locator(`[data-add="${id}"]`).click();
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.querySelectorAll('#study-legend .study-chip[data-study-chip]').length === 5);
  const geometry = await page.evaluate(() => [...document.querySelectorAll('#study-legend .study-chip[data-study-chip]')]
    .map(el => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y) }; }));
  assert.ok(geometry.every((g, i) => i === 0 || (g.x === geometry[0].x && g.y > geometry[i - 1].y)), 'legend rows stack down from top-left');
  const ids = await page.evaluate(() => ({
    ema: window.__alfaDebug.indicators.items.find(i => i.type === 'ema').id,
    rsi: window.__alfaDebug.indicators.items.find(i => i.type === 'rsi').id,
    macd: window.__alfaDebug.indicators.items.find(i => i.type === 'macd').id
  }));
  for (const id of [ids.ema, ids.rsi, ids.macd, 'fvg', 'volume']) {
    assert.equal(await page.locator(`#study-legend [data-study-settings="${id}"]`).count(), id === 'volume' ? 0 : 1, id);
  }
  assert.equal(await page.locator('#study-legend .study-chip-foot [data-study-remove]').count(), 5);
  assert.equal(await page.locator('#study-legend .study-chip-foot [data-study-collapse]').count(), 5);

  const emaId = ids.ema;
  await page.locator('#indicators-manage').click();
  await page.click('[data-cat=active]');
  await page.locator(`[data-active-study="${emaId}"] [data-study-settings]`).click();
  await page.fill('[data-k=period]', '50');
  await page.click('#is-apply');
  await page.keyboard.press('Escape');
  const rsiId = await page.evaluate(() => window.__alfaDebug.indicators.items.find(i => i.type === 'rsi').id);
  await page.locator(`#study-legend [data-study-collapse="${rsiId}"]`).click();
  await page.waitForFunction(id => document.querySelector(`[data-study-chip="${id}"]`).classList.contains('is-collapsed'), rsiId);
  assert.equal(await page.evaluate(() => window.__alfaDebug.chart.panes()[1].getHeight()), 30);
  const before = await state(page);
  assert.equal(before.indicators.find(i => i.type === 'ema').params.period, 50);
  assert.equal(before.indicators.find(i => i.type === 'rsi').collapsed, true);
  assert.equal(before.overlays.fvg.added, true);
  assert.equal(before.studyKey.symbol, 'BTCUSDT');

  // Period change is the actual "zaman dilimi" regression: studies must follow
  // the market instead of being cleared for the new interval's layout key.
  await page.locator('#timeframes button[data-interval="4h"]').click();
  await ready(page);
  await page.waitForFunction(() => document.querySelectorAll('#study-legend .study-chip[data-study-chip]').length === 5);
  const afterTf = await state(page);
  assert.deepEqual(afterTf.indicators, before.indicators, 'period change keeps indicator IDs, settings and collapse');
  assert.deepEqual(afterTf.overlays, before.overlays, 'period change keeps overlay states');
  assert.equal(await page.locator('#market-title').textContent(), 'BTCUSDT · 4H');

  await page.locator('#symbol').selectOption('ETHUSDT');
  await ready(page);
  assert.equal((await state(page)).indicators.length, 0, 'other market starts clean');
  await page.locator('#symbol').selectOption('BTCUSDT');
  await ready(page);
  await page.waitForFunction(() => document.querySelectorAll('#study-legend .study-chip[data-study-chip]').length === 5);
  assert.deepEqual((await state(page)).indicators, before.indicators, 'returning to the market restores studies');

  await page.reload(); await ready(page);
  await page.waitForFunction(() => document.querySelectorAll('#study-legend .study-chip[data-study-chip]').length === 5);
  assert.deepEqual((await state(page)).indicators, before.indicators, 'reload restores the shared study bundle');

  // Display-only time-zone changes are a separate axis and must not touch studies.
  await page.locator('#chart-timezone').click();
  await page.locator('#timezone-form select').selectOption('Asia/Tokyo');
  await page.locator('#timezone-form button[type=submit]').click();
  await page.waitForFunction(() => document.getElementById('chart-timezone').dataset.timezone === 'Asia/Tokyo');
  assert.deepEqual((await state(page)).indicators, before.indicators, 'time-zone display change keeps studies');

  assert.deepEqual(writes, [], 'study changes never write to production APIs');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, verticalLegend: true, collapseAndFooter: true,
    periodChange: 'BTCUSDT 1H -> 4H', marketReturn: true, reload: true, timezone: true, productionWrites: false }));
} finally { await browser.close(); }
