// TradingView-style list restore: exact legacy refs, display-only grouping,
// free/public quotes, settings persistence and multi-chart visibility.
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { LEGACY_TV_LIST } from '../../assets/alfa-watchlist-model.mjs';
import { candleCloseTime } from '../../assets/alfa-replay-model.mjs';

const arg = key => process.argv.find(s => s.startsWith(`--${key}=`))?.slice(key.length + 3);
const { chromium } = await import(pathToFileURL(path.resolve(arg('playwright'))));
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
const errors = [], apiCalls = [];
const origin = arg('url') || 'http://127.0.0.1:4173';
const output = arg('output');
const last = Date.parse('2026-11-24T12:00:00Z') / 1000;
const test = async (name, fn) => { await fn(); console.log('PASS', name); };
const ready = page => page.waitForFunction(() => window.__alfaDebug?.ready && window.__alfaDebug.drawings.ready, null, { timeout: 45000 });
const state = page => page.evaluate(() => {
  const w = window.__alfaDebug.watchlist;
  return {
    doc: structuredClone(w.doc),
    symbols: [...w.symbols],
    all: w.allSymbols(),
    activeId: w.doc.activeListId,
    title: document.getElementById('watchlist-title').textContent,
    count: document.getElementById('watch-count').textContent,
    options: [...document.querySelectorAll('#watch-list option')].map(o => o.value),
    groups: [...document.querySelectorAll('.watch-group-head strong')].map(n => n.textContent)
  };
});
const shot = async (page, name) => {
  if (!output) return;
  const fs = await import('node:fs/promises');
  await fs.mkdir(output, { recursive: true });
  await page.screenshot({ path: path.join(output, name + '.png') });
};

try {
  await context.addInitScript(seed => {
    try { if (sessionStorage.getItem('__tvWatchlistSeed')) return; } catch { return; }
    localStorage.setItem('alfa-watchlist', JSON.stringify(seed));
    localStorage.removeItem('alfa-watchlist:v1:guest');
    localStorage.removeItem('alfa-watchlist:tv-migrated:v1:guest');
    sessionStorage.setItem('__tvWatchlistSeed', '1');
  }, [...LEGACY_TV_LIST]);
  await context.addInitScript(() => {
    window.supabase = { createClient: () => ({ auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } })
    } }) };
  });
  await context.routeWebSocket(/wss:\/\//, () => {});
  await context.route(/^https:\/\/(?:data-api\.binance\.vision|api\.binance\.com)\//, async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/exchangeInfo')) return route.fulfill({ json: { symbols: ['BTC', 'ETH', 'BNB', 'SOL', 'XRP'].map(baseAsset => ({
      symbol: baseAsset + 'USDT', baseAsset, quoteAsset: 'USDT', status: 'TRADING', isSpotTradingAllowed: true,
      filters: [{ filterType: 'PRICE_FILTER', tickSize: '0.00001000' }]
    })) } });
    if (url.pathname.endsWith('/ticker/24hr')) return route.fulfill({ json: [
      { symbol: 'BTCUSDT', lastPrice: '60100', priceChangePercent: '1.25', closeTime: Date.now() },
      { symbol: 'ETHUSDT', lastPrice: '3200', priceChangePercent: '-0.75', closeTime: Date.now() }
    ] });
    if (url.pathname.endsWith('/klines')) {
      const step = candleCloseTime(0, url.searchParams.get('interval') || '1h');
      const end = url.searchParams.has('endTime') ? Math.floor(Number(url.searchParams.get('endTime')) / 1000) : last;
      const start = url.searchParams.has('startTime') ? Number(url.searchParams.get('startTime')) / 1000 : end - 119 * step;
      const count = Math.min(1000, Math.max(1, Math.floor((end - start) / step) + 1));
      return route.fulfill({ json: Array.from({ length: count }, (_, i) => [(start + i * step) * 1000, '60000', '60300', '59800', '60100', '25']) });
    }
    return route.fulfill({ json: [] });
  });
  await context.route(url => url.origin === new URL(origin).origin && url.pathname.startsWith('/api/'), async route => {
    const req = route.request(), body = req.postDataJSON?.() || {};
    apiCalls.push({ op: body.op || '', auth: !!req.headers()['authorization'] });
    if (body.op === 'chart-market-quotes-free') {
      const quotes = {};
      for (const ref of body.refs || []) {
        const price = ref.startsWith('CRYPTOCAP:') ? 3420000000000 : ref.includes('XAU') ? 3350.4 : ref === 'OKX:XAUTUSDT' ? 4200 : 1.1;
        quotes[ref] = { price, change: 1.25, at: Date.now() };
      }
      return route.fulfill({ json: { ok: true, quotes } });
    }
    if (body.op === 'chart-market-data-free') {
      const price = String(body.ref || '').includes('XAU') ? 3350.4 : 1.1;
      return route.fulfill({ json: { ok: true, chartable: false, quote: { price, change: 0.4 } } });
    }
    if (body.op === 'chart-market-quotes' || body.op === 'chart-market-data') return route.fulfill({ json: { ok: true, quotes: {}, chartable: false, quote: { price: 1, change: 0 } } });
    return route.fulfill({ json: { ok: true } });
  });
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  const page = await context.newPage();
  await page.goto(origin + '/alfa-charts.html?debug=1');
  await ready(page);

  await test('boot restores the exact 44 legacy refs into a dedicated list without rewriting venue identity', async () => {
    await page.waitForFunction(() => window.__alfaDebug.watchlist.allSymbols().length === 44, null, { timeout: 20000 });
    const snapshot = await state(page);
    assert.deepEqual(snapshot.doc.lists.find(l => l.id === 'tv-classic').symbols, [...LEGACY_TV_LIST]);
    assert.deepEqual(snapshot.all, [...LEGACY_TV_LIST]);
    assert.equal(snapshot.activeId, 'tv-classic');
    assert.equal(snapshot.count, '44');
    assert.ok(snapshot.options.includes('tv-classic'));
    for (const ref of ['CME:BTC1!', 'FX_IDC:XAUTRYG', 'CRYPTOCAP:BTC.D', 'BINANCE:BTCUSDT.P', 'BINANCE:ETHBTC', 'OKX:XAUTUSDT']) {
      assert.ok(snapshot.all.includes(ref), ref);
    }
    assert.equal(await page.evaluate(() => localStorage.getItem('alfa-watchlist:tv-migrated:v1:guest')), '1');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('alfa-watchlist:v1:guest')).version), 2);
    await shot(page, 'watchlist-tv-restored');
  });

  await test('free FX and crypto quotes render; a non-Spot ref opens without a Charts session', async () => {
    await page.waitForFunction(() => document.querySelector('[data-watch-price="CRYPTOCAP:TOTAL"]')?.textContent !== '—', null, { timeout: 20000 });
    assert.notEqual(await page.locator('[data-watch-price="CRYPTOCAP:TOTAL"]').textContent(), '—');
    assert.notEqual(await page.locator('[data-watch-price="FX:XAUUSD"]').textContent(), '—');
    assert.ok(apiCalls.some(c => c.op === 'chart-market-quotes-free'), JSON.stringify(apiCalls.slice(-10)));
    assert.equal(apiCalls.filter(c => c.op === 'chart-market-quotes-free' && c.auth).length, 0);
    await page.click('[data-symbol="FX:XAUUSD"]');
    await page.waitForFunction(() => document.getElementById('symbol').value === 'FX:XAUUSD' && window.__alfaDebug.ready, null, { timeout: 45000 });
    assert.ok(apiCalls.some(c => c.op === 'chart-market-data-free'));
    await page.click('[data-symbol="BINANCE:BTCUSDT"]');
    await page.waitForFunction(() => document.getElementById('symbol').value === 'BINANCE:BTCUSDT', null, { timeout: 45000 });
    assert.equal(await page.evaluate(() => window.__alfaDebug.watchlist.getSelected()), 'BINANCE:BTCUSDT');
  });

  await test('existing custom list is preserved; a later legacy source merges without trimming it', async () => {
    await page.evaluate(() => {
      localStorage.setItem('alfa-watchlist:v1:guest', JSON.stringify({ version: 1, name: 'Benim listem', symbols: ['BTCUSDT', 'XRPUSDT'] }));
      localStorage.removeItem('alfa-watchlist:tv-migrated:v1:guest');
    });
    await page.reload(); await ready(page);
    await page.waitForFunction(() => window.__alfaDebug.watchlist.allSymbols().length === 46, null, { timeout: 20000 });
    let snapshot = await state(page);
    assert.deepEqual(snapshot.symbols, ['BTCUSDT', 'XRPUSDT']);
    assert.deepEqual(snapshot.doc.lists.find(l => l.id === 'main').symbols, ['BTCUSDT', 'XRPUSDT']);
    assert.deepEqual(snapshot.doc.lists.find(l => l.id === 'tv-classic').symbols, [...LEGACY_TV_LIST]);
    assert.equal(snapshot.activeId, 'main');
    await page.evaluate(() => {
      localStorage.setItem('alfa-watchlist', JSON.stringify(['FX:EURUSD']));
      localStorage.removeItem('alfa-watchlist:tv-migrated:v1:guest');
    });
    await page.reload(); await ready(page);
    await page.waitForFunction(() => window.__alfaDebug.watchlist.allSymbols().includes('FX:EURUSD'), null, { timeout: 20000 });
    snapshot = await state(page);
    assert.deepEqual(snapshot.doc.lists.find(l => l.id === 'main').symbols, ['BTCUSDT', 'XRPUSDT']);
    assert.deepEqual(snapshot.doc.lists.find(l => l.id === 'tv-classic').symbols, [...LEGACY_TV_LIST, 'FX:EURUSD']);
    assert.equal(snapshot.activeId, 'main');
    assert.equal(snapshot.doc.activeListId, 'main');
  });

  await test('manual TV restore adds missing refs only and multi-chart picker sees every list', async () => {
    await page.evaluate(() => {
      localStorage.setItem('alfa-watchlist:v1:guest', JSON.stringify({
        version: 2, name: 'İzleme listesi', symbols: ['BTCUSDT', 'XRPUSDT'], activeListId: 'main',
        lists: [
          { id: 'main', name: 'Benim listem', symbols: ['BTCUSDT', 'XRPUSDT'], color: '#7da4ff', collapsed: false },
          { id: 'tv-classic', name: 'Klasik', symbols: ['FX:XAUUSD', 'OKX:BTCUSDT.P'], color: '#d5b16a', collapsed: false }
        ]
      }));
      localStorage.setItem('alfa-watchlist:tv-migrated:v1:guest', '1');
    });
    await page.reload(); await ready(page);
    await page.click('#watch-settings');
    await page.click('#ws-restore');
    const restored = await state(page);
    assert.deepEqual(restored.doc.lists.find(l => l.id === 'main').symbols, ['BTCUSDT', 'XRPUSDT']);
    assert.deepEqual(restored.doc.lists.find(l => l.id === 'tv-classic').symbols,
      ['FX:XAUUSD', 'OKX:BTCUSDT.P', ...LEGACY_TV_LIST.filter(ref => ref !== 'FX:XAUUSD' && ref !== 'OKX:BTCUSDT.P')]);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('dialog[open]'));
    await page.click('#multi-toggle');
    await page.waitForFunction(() => document.body.classList.contains('multi-open'));
    await page.click('#multi-add');
    for (const ref of ['FX:XAUUSD', 'CRYPTOCAP:TOTAL', 'OKX:HBARUSDT.P', 'BTCUSDT']) {
      assert.equal(await page.locator(`#multi-symbols option[value="${ref}"]`).count(), 1, ref);
    }
    await page.keyboard.press('Escape');
    await page.click('#multi-exit');
  });

  await test('settings: named lists, classification, flags and view options persist across reload', async () => {
    await page.click('#watch-list-add');
    await page.fill('#ws-name', 'FX Masası');
    await page.click('#ws-add');
    assert.equal(await page.locator('#watch-list option').count(), 3);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('dialog[open]'));
    await page.selectOption('#watch-list', 'tv-classic');
    await page.click('#watch-settings');
    await page.fill('#ws-name', 'Klasik FX/Kripto');
    await page.click('#ws-save');
    await page.selectOption('#ws-sort', 'venue');
    await page.selectOption('#ws-group', 'type');
    await page.check('#ws-compact');
    await page.uncheck('#ws-quotes');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('dialog[open]'));
    let snapshot = await state(page);
    assert.equal(snapshot.title, 'Klasik FX/Kripto');
    assert.deepEqual(snapshot.doc.settings, { sort: 'venue', direction: 'asc', groupBy: 'type', compact: true,
      showFlags: true, showQuotes: false, collapsedGroups: {} });
    assert.ok(snapshot.groups.includes('Kripto · Spot'));
    assert.ok(snapshot.groups.includes('Kripto · Vadeli'));
    assert.ok(snapshot.groups.includes('Döviz / Emtia'));
    assert.ok(snapshot.groups.includes('Kripto endeksleri'));
    assert.equal(await page.locator('.watch-item.watch-compact').count() > 0, true);
    await shot(page, 'watchlist-tv-settings');
    await page.reload(); await ready(page);
    snapshot = await state(page);
    assert.equal(snapshot.title, 'Klasik FX/Kripto');
    assert.equal(snapshot.doc.settings.sort, 'venue');
    assert.equal(snapshot.doc.settings.groupBy, 'type');
    assert.equal(snapshot.doc.settings.compact, true);
    assert.equal(snapshot.doc.settings.showQuotes, false);
  });

  await test('320/390/768 px layouts keep list controls inside the viewport', async () => {
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      await page.reload(); await ready(page);
      if (!(await page.locator('#watchlist').isVisible())) await page.click('#list-toggle');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${width}px overflow`);
      const box = await page.locator('#watch-settings').boundingBox();
      assert.ok(box && box.x >= 0 && box.x + box.width <= width, `${width}px settings button`);
      await shot(page, 'watchlist-tv-' + width);
    }
  });

  assert.deepEqual(errors, []);
  console.log('PASS no uncaught browser errors');
} finally { await browser.close(); }
