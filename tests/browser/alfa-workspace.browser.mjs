// End-to-end regression of the chart workspace using real Binance candles.
// node tests/browser/alfa-workspace.browser.mjs --playwright=<path> --url=http://127.0.0.1:4181 --output=<directory>
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';
const arg = key => process.argv.find(s => s.startsWith(`--${key}=`))?.slice(key.length + 3);
const { chromium } = await import(pathToFileURL(arg('playwright')));
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
const page = await context.newPage(), errors = [];
page.on('pageerror', e => errors.push(e.message));
const origin = arg('url') || 'http://127.0.0.1:4181';
const output = arg('output');
const test = async (name, fn) => { await fn(); console.log('PASS', name); };
const ready = () => page.waitForFunction(() => window.__alfaDebug?.ready && window.__alfaDebug.drawings.ready, null, { timeout: 45000 });
const state = fn => page.evaluate(fn);
const catalogue = async () => { await page.click('#indicators-manage'); await page.fill('#ind-search', ''); await page.click('[data-cat=all]'); };
const add = async type => { await page.locator(`[data-add="${type}"]`).click(); };
const close = async () => { await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.querySelector('dialog[open]')); };
const shot = async name => { if (output) { await fs.mkdir(output, { recursive: true }); await page.screenshot({ path: path.join(output, name + '.png') }); } };
try {
  await page.goto(origin + '/alfa-charts.html?debug=1'); await ready();
  await test('clean entry, compact toolbar, grouped drawing rail, no unsolicited overlays', async () => {
    assert.equal(await page.locator('#drawing-tools>button').count(), 8);
    assert.equal(await page.locator('#drawing-favs>[data-tool]').count(), 4);
    assert.equal(await state(() => window.__alfaDebug.marketStructure.priceLines.length), 0);
    assert.equal(await state(() => window.__alfaDebug.sessionLevels.lines.length), 0);
    const geometry = await state(() => ({ toolbar: document.querySelector('.toolbar').getBoundingClientRect().height, chart: document.querySelector('#chart').clientHeight, overflow: document.documentElement.scrollWidth > innerWidth }));
    assert.equal(geometry.toolbar, 54); assert.ok(geometry.chart > 700); assert.equal(geometry.overflow, false);
    assert.equal(await page.locator('#message').isHidden(), true);
    assert.equal((await page.locator('#message').textContent()).trim(), '');
    assert.doesNotMatch(await page.locator('body').innerText(), /Lightweight Charts|by TradingView/i);
    assert.equal(await state(() => document.querySelectorAll('a[href*="tradingview.com"]').length), 0);
    await shot('workspace-desktop');
  });
  await test('all indicators, FVG, sessions and MTF share one searchable, favoritable catalogue', async () => {
    await catalogue();
    for (const id of ['ema', 'rsi', 'macd', 'fvg', 'structure', 'sessions', 'levels', 'mtf']) assert.equal(await page.locator(`[data-add="${id}"]`).count(), 1, id);
    await page.click('[data-cat="Market Data"]');
    for (const id of ['oi', 'longShort', 'cvdSpot', 'cvdPerp', 'marketDelta', 'footprint', 'heatmap']) {
      assert.equal(await page.locator(`[data-add="${id}"]`).count(), 1, id);
    }
    await page.click('[data-cat=all]');
    assert.equal(await page.locator('.studies-dialog #replay-toggle').count(), 0);
    await page.fill('#ind-search', 'FVG');
    assert.equal(await page.locator('[data-add=fvg]').count(), 1);
    await page.fill('#ind-search', 'no-such-indicator');
    assert.match(await page.locator('#ind-list').textContent(), /Sonuç bulunamadı/);
    await page.fill('#ind-search', '');
    await page.click('[data-fav=macd]');
    await page.click('[data-cat=fav]'); assert.equal(await page.locator('[data-add=macd]').count(), 1);
    await page.click('[data-cat=all]'); await add('ema'); await add('rsi'); await add('macd');
    await shot('indicator-center');
    await close();
    assert.equal(await state(() => window.__alfaDebug.chart.panes().length), 3);
    assert.equal(await state(() => window.__alfaDebug.indicators.items.find(i => i.type === 'macd').series[2].seriesType()), 'Histogram');
  });
  await test('native settings keep identity; oscillator eye/removal collapses the correct pane', async () => {
    const ema = await state(() => window.__alfaDebug.indicators.items.find(i => i.type === 'ema').id);
    await page.locator(`#study-legend [data-study-settings="${ema}"]`).click();
    await page.fill('[data-k=period]', '50'); await page.click('#is-apply'); await close();
    assert.equal(await state(() => window.__alfaDebug.indicators.items.find(i => i.type === 'ema').params.period), 50);
    assert.equal(await state(() => window.__alfaDebug.indicators.items.find(i => i.type === 'ema').id), ema);
    const rsi = await state(() => window.__alfaDebug.indicators.items.find(i => i.type === 'rsi').id);
    await page.click(`#study-legend [data-study-eye="${rsi}"]`);
    assert.equal(await state(() => window.__alfaDebug.chart.panes().length), 2);
    await page.click(`#study-legend [data-study-eye="${rsi}"]`);
    assert.equal(await state(() => window.__alfaDebug.chart.panes().length), 3);
    const macd = await state(() => window.__alfaDebug.indicators.items.find(i => i.type === 'macd').id);
    await page.locator(`#study-legend [data-study-remove="${macd}"]`).click();
    assert.equal(await state(() => window.__alfaDebug.chart.panes().length), 2);
  });
  await test('session UTC editor, overlay settings, capped market structure and pane clipping', async () => {
    await catalogue(); await add('sessions'); await add('structure'); await add('fvg');
    await page.click('[data-cat=active]');
    await page.click('[data-active-study=sessions] [data-study-settings]');
    await page.fill('[data-start=asia]', '01:00'); await page.fill('[data-end=asia]', '06:00');
    await page.fill('[data-days]', '7'); await page.click('#is-apply'); await close();
    assert.deepEqual(await state(() => window.__alfaDebug.sessionBoxes.config.utc.asia), { start: '01:00', end: '06:00' });
    await page.waitForFunction(() => document.querySelector('.session-boxes-overlay rect'));
    const dimensions = await state(() => ({
      plot: window.__alfaDebug.candles.getPane().getHeight(),
      drawings: Number(window.__alfaDebug.drawings.svg.getAttribute('height')),
      sessions: Number(window.__alfaDebug.sessionBoxes.svg.getAttribute('height')),
      lines: window.__alfaDebug.marketStructure.priceLines.map(p => p.options()),
    }));
    assert.equal(dimensions.sessions, dimensions.plot);
    assert.equal(dimensions.drawings, dimensions.plot);
    assert.ok(dimensions.lines.length <= 2);
    assert.ok(dimensions.lines.every(p => !p.axisLabelVisible));
    await shot('workspace-with-studies');
  });
  await test('grid, optional axis labels and non-destructive clean mode work', async () => {
    await page.click('#view-menu summary'); await page.uncheck('#view-grid'); await page.check('#view-axis-labels'); await page.check('#view-clean');
    assert.equal(await state(() => window.__alfaDebug.chart.panes().length), 1);
    assert.equal(await state(() => window.__alfaDebug.indicators.items.length), 2);
    assert.equal(await state(() => window.__alfaDebug.fvg.enabled), false);
    await page.uncheck('#view-clean'); await page.uncheck('#view-axis-labels'); await page.check('#view-grid');
    assert.equal(await state(() => window.__alfaDebug.chart.panes().length), 2);
    await page.keyboard.press('Escape');
  });
  await test('auto scale is a real on/off toggle', async () => {
    const scaleAuto = () => state(() => window.__alfaDebug.chart.priceScale('right').options().autoScale);
    assert.equal(await scaleAuto(), true);
    assert.equal(await page.locator('#auto-scale').getAttribute('aria-pressed'), 'true');
    await page.click('#auto-scale');
    assert.equal(await scaleAuto(), false);
    assert.equal(await page.locator('#auto-scale').getAttribute('aria-pressed'), 'false');
    await page.click('#auto-scale');
    assert.equal(await scaleAuto(), true);
    assert.equal(await page.locator('#auto-scale').getAttribute('aria-pressed'), 'true');
  });
  await test('grouped tools, real brush selection, visible delete button and undo', async () => {
    await page.click('#drawing-tools [data-group=shapes]');
    await page.click('.tool-flyout [data-tool=brush]');
    const plot = await state(() => { const d = window.__alfaDebug.drawings, r = d.host.getBoundingClientRect(); return { x: r.x, y: r.y, ...d.dimensions() }; });
    const x = plot.x + plot.width * .45, y = plot.y + plot.height * .55;
    await page.mouse.move(x, y); await page.mouse.down();
    await page.mouse.move(x + 100, y - 30, { steps: 12 }); await page.mouse.up();
    await page.waitForFunction(() => window.__alfaDebug.drawings.history.doc.drawings.length === 1);
    assert.equal(await page.locator('.drawing [data-handle]').count(), 2);
    await page.mouse.click(plot.x + plot.width * .1, plot.y + plot.height * .65);
    await page.mouse.click(x + 50, y - 15);
    await page.locator('#drawing-selection [aria-label="Seçili çizimi sil"]').click();
    assert.equal(await state(() => window.__alfaDebug.drawings.history.doc.drawings.length), 0);
    await page.keyboard.press('Control+z');
    assert.equal(await state(() => window.__alfaDebug.drawings.history.doc.drawings.length), 1);
  });
  await test('right click adds price alarm and opens the full TradingView-style chart menu', async () => {
    const r = await page.locator('#chart').boundingBox();
    await page.mouse.click(r.x + 200, r.y + 180, { button: 'right' });
    const labels = await page.locator('.chart-context-menu button').allTextContents();
    assert.match(labels[0], /Alarm: fiyat/);
    assert.match(labels[1], /Alarm: fiyat/);
    for (const expected of ['Grafik görünümü sıfırla', 'Grafik ayarları…', 'Görünümü sığdır', 'Son muma dön',
      'Tam ekran', 'Izgara çizgileri', 'Sade mod', 'Logaritmik fiyat ölçeği', 'Gösterge ekle / yönet…',
      'Ekran görüntüsü indir', 'Bağlantıyı kopyala']) {
      assert.ok(labels.some(text => text.includes(expected)), expected);
    }
    assert.equal(await page.locator('.chart-context-menu .context-shortcut', { hasText: 'Alt+R' }).count(), 1);
    await page.locator('.chart-context-menu button').first().click();
    assert.equal(await state(() => JSON.parse(localStorage.getItem('alfa-alarms:v1:guest')).length), 1);
    await page.click('#lab-menu summary');
    assert.equal(await page.locator('#lab-menu #replay-toggle').isVisible(), true);
    assert.equal(await page.locator('#lab-menu [data-add=fvg]').count(), 0);
    await page.click('#tester-open'); assert.match(await page.locator('dialog').textContent(), /Strateji testleri/); await close();
  });
  await test('alarm manager exposes conditions, sound presets and delivery options', async () => {
    await page.click('#alarm-toggle');
    await page.waitForFunction(() => !!document.querySelector('#alarm-form'));
    assert.equal(await page.locator('#alarm-cond option').count(), 6);
    assert.equal(await page.locator('#alarm-sound option').count(), 7);
    assert.equal(await page.locator('#alarm-repeat option').count(), 3);
    assert.equal(await page.locator('#alarm-telegram').count(), 1);
    assert.equal(await page.locator('#alarm-webhook').count(), 1);
    await page.selectOption('#alarm-cond', 'pctUp');
    await page.selectOption('#alarm-sound', 'chime');
    await page.selectOption('#alarm-repeat', 'three');
    await page.fill('#alarm-pct', '2');
    await page.fill('#alarm-note', 'Browser alarm');
    await page.click('#alarm-add');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('alfa-alarms:v1:guest') || '[]').length === 2);
    const alarm = await state(() => JSON.parse(localStorage.getItem('alfa-alarms:v1:guest')).at(-1));
    assert.deepEqual({ cond: alarm.cond, sound: alarm.sound, repeat: alarm.repeat, note: alarm.note, pct: alarm.pct },
      { cond: 'pctUp', sound: 'chime', repeat: 'three', note: 'Browser alarm', pct: 2 });
    assert.ok(alarm.basePrice > 0 && alarm.price > 0);
    await close();
  });
  await test('chart settings apply and view reset is non-destructive', async () => {
    const before = await state(() => ({
      drawings: window.__alfaDebug.drawings.history.doc.drawings.length,
      indicators: window.__alfaDebug.indicators.items.length,
    }));
    assert.ok(before.drawings > 0);
    await page.click('#view-menu summary'); await page.click('#chart-settings');
    await page.waitForFunction(() => !!document.querySelector('#chart-settings-form'));
    await page.uncheck('#chart-settings-form input[name=grid]');
    await page.check('#chart-settings-form input[name=logScale]');
    await page.click('#chart-settings-form button[type=submit]');
    await page.waitForFunction(() => !document.querySelector('#chart-settings-form'));
    assert.equal(await state(() => window.__alfaDebug.viewConfig.grid), false);
    assert.equal(await state(() => window.__alfaDebug.chart.priceScale('right').options().mode), 1);
    await page.keyboard.press('Alt+r');
    assert.equal(await state(() => window.__alfaDebug.viewConfig.grid), true);
    assert.equal(await state(() => window.__alfaDebug.chart.priceScale('right').options().mode), 0);
    assert.deepEqual(await state(() => ({
      drawings: window.__alfaDebug.drawings.history.doc.drawings.length,
      indicators: window.__alfaDebug.indicators.items.length,
    })), before);
    assert.match(await page.locator('#connection').textContent(), /sıfırlandı/);
  });
  await test('free public microstructure studies render from keyless Binance data', async () => {
    const klineRow = [1700000000000, '0', '0', '0', '0', '10', '1700000300000', '0', 12, '7', '0', '0'];
    const publicRoute = /^https:\/\/api\.binance\.com\/api\/v3\/klines/;
    const handler = route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([klineRow]) });
    await page.route(publicRoute, handler);
    try {
      await catalogue(); await add('marketDelta'); await close();
      await page.waitForFunction(() => window.__alfaDebug.publicStudies.seriesById.marketDelta.length === 1, null, { timeout: 15000 });
      assert.equal(await state(() => window.__alfaDebug.chart.panes().length), 3);
      assert.equal(await state(() => window.__alfaDebug.publicStudies.seriesById.marketDelta[0].data()[0].value), 4);
      assert.equal(await state(() => window.__alfaDebug.publicStudies.facades.marketDelta.enabled), true);
      await page.click('#study-legend [data-study-remove="marketDelta"]');
      await page.waitForFunction(() => window.__alfaDebug.publicStudies.seriesById.marketDelta.length === 0);
      assert.equal(await state(() => window.__alfaDebug.chart.panes().length), 2);
    } finally { await page.unroute(publicRoute, handler); }
  });
  await test('candle palette settings and numeric timeframe shortcuts', async () => {
    const r = await page.locator('#chart').boundingBox();
    await page.mouse.click(r.x + 200, r.y + 160, { button: 'right' });
    await page.locator('.chart-context-menu button').filter({ hasText: 'Mum ve zemin renkleri' }).click();
    await page.waitForFunction(() => !!document.querySelector('#candle-settings-form'));
    await page.fill('#candle-settings-form input[name=up]', '#00ff88');
    await page.fill('#candle-settings-form input[name=down]', '#ff3366');
    await page.click('#candle-settings-form button[type=submit]');
    await page.waitForFunction(() => !document.querySelector('#candle-settings-form'));
    const saved = await state(() => JSON.parse(localStorage.getItem('alfa-chart-palette:v1') || '{}'));
    assert.equal(saved.up, '#00ff88');
    assert.equal(saved.down, '#ff3366');
    assert.match(saved.gridVert, /^#[0-9a-f]{8}$/i, 'alpha grid colour survives palette apply');
    assert.equal(await state(() => window.__alfaDebug.candles.options().upColor), '#00ff88');
    await page.keyboard.press('1'); await page.keyboard.press('5');
    await page.waitForFunction(() => document.getElementById('market-title').textContent.includes('15M'), null, { timeout: 45000 });
    await page.keyboard.press('6'); await page.keyboard.press('0');
    await page.waitForFunction(() => document.getElementById('market-title').textContent.includes('1H'), null, { timeout: 45000 });
  });
  await test('layout, hidden states and UTC overrides survive reload', async () => {
    const ema = await state(() => window.__alfaDebug.indicators.items.find(i => i.type === 'ema').id);
    await page.click(`#study-legend [data-study-eye="${ema}"]`);
    await page.reload(); await ready();
    assert.equal(await state(() => window.__alfaDebug.indicators.items.find(i => i.type === 'ema').visible), false);
    assert.deepEqual(await state(() => window.__alfaDebug.sessionBoxes.config.utc.asia), { start: '01:00', end: '06:00' });
    assert.equal(await state(() => window.__alfaDebug.studiesUI.state.structure.added), true);
  });
  await test('empty drawing favorites stay empty; star editor adds a persisted favorite', async () => {
    await page.evaluate(() => localStorage.setItem('alfa-draw-fav:v1', '[]'));
    await page.reload(); await ready();
    assert.equal(await page.locator('#drawing-favs').isVisible(), false);
    await page.click('#drawing-favorites-edit');
    await page.click('.tool-flyout [data-favorite=trend]');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#drawing-favs [data-tool=trend]').count(), 1);
    await page.reload(); await ready();
    assert.equal(await page.locator('#drawing-favs>[data-tool]').count(), 1);
  });
  await test('searchable venue picker, bounded TXT import and scoped watchlist persistence', async () => {
    await page.evaluate(() => {
      const w = window.__alfaDebug.watchlist;
      w.markets = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT', 'ETHBTC'].map(symbol => ({ symbol,
        base: symbol.replace(/(USDT|BTC)$/, ''), quote: symbol.endsWith('BTC') ? 'BTC' : 'USDT', precision: 5 }));
      w.catalogState = 'ready';
    });
    await page.click('#symbol-search');
    await page.fill('#symbol-query', 'XRP');
    assert.equal(await page.locator('[data-open-symbol="XRPUSDT"]').count(), 1);
    assert.equal(await page.locator('[data-add-symbol="DOGEUSDT"]').count(), 0);
    await page.click('[data-add-symbol="XRPUSDT"]');
    await page.fill('#symbol-query', '');
    await page.selectOption('#symbol-venue', 'OKX');
    assert.equal(await page.locator('[data-open-symbol="OKX:ETHUSDT.P"]').count(), 1);
    assert.match(await page.locator('[data-open-symbol="OKX:ETHUSDT.P"] .venue-badge').textContent(), /OKX · PERP/);
    await close();
    assert.equal(await state(() => window.__alfaDebug.watchlist.symbols.includes('XRPUSDT')), true);
    await page.click('#watch-import');
    await page.fill('#watchlist-source', 'BINANCE:BTCUSDT,BINANCE:DOGEUSDT,BYBIT:BTCUSDT,BINANCE:BTCUSDT.P,OKX:XAUTUSDT,CBOE:VIX,CRYPTOCAP:TOTAL,OANDA:EURUSD,<img onerror=alert(1)>');
    await page.click('#watchlist-preview');
    await page.waitForFunction(() => document.querySelector('#import-result strong'));
    const preview = await page.locator('#import-result').textContent();
    assert.match(preview, /sembol/);
    assert.match(preview, /2 kayıt atlandı/);
    assert.match(preview, /BYBIT:BTCUSDT/);
    assert.match(preview, /BINANCE:BTCUSDT\.P/);
    assert.match(preview, /CRYPTOCAP:TOTAL/);
    assert.doesNotMatch(preview, /Farklı borsa/);
    assert.doesNotMatch(preview, /Vadeli/);
    await page.click('#watchlist-apply');
    await page.waitForFunction(() => window.__alfaDebug.watchlist.symbols.includes('BYBIT:BTCUSDT'));
    assert.equal(await page.locator('[data-watch-price="BYBIT:BTCUSDT"]').count(), 1);
    assert.equal(await state(() => window.__alfaDebug.watchlist.symbols.includes('BINANCE:BTCUSDT.P')), true);
    await page.reload(); await ready();
    assert.equal(await state(() => window.__alfaDebug.watchlist.symbols.includes('BYBIT:BTCUSDT')), true);
    await shot('watchlist-import');
  });
  await test('switching back to a cached market paints instantly without loading overlays', async () => {
    assert.ok(await state(() => [...window.__alfaDebug.historyCache.keys()].some(k => k.startsWith('BTCUSDT|'))));
    await page.click('[data-symbol="BYBIT:BTCUSDT"]');
    await page.waitForFunction(() => document.getElementById('symbol').value === 'BYBIT:BTCUSDT' && window.__alfaDebug.ready, null, { timeout: 45000 });
    assert.ok(await state(() => window.__alfaDebug.historyCache.has('BYBIT:BTCUSDT|1h')));
    await page.click('[data-symbol="BTCUSDT"]');
    const immediate = await state(() => ({
      hidden: document.getElementById('message').hidden,
      text: document.getElementById('message').textContent.trim(),
      bars: window.__alfaDebug.history.length,
    }));
    assert.equal(immediate.hidden, true);
    assert.equal(immediate.text, '');
    assert.ok(immediate.bars > 0);
    await ready();
    assert.equal(await state(() => document.getElementById('symbol').value), 'BTCUSDT');
  });
  await test('multi-chart tabs, layouts and embedded panes work without static iframes', async () => {
    const embedRoute = /\/alfa-charts\.html\?embed=1/;
    const handler = route => route.fulfill({ contentType: 'text/html', body: '<html><body>embed pane</body></html>' });
    await page.route(embedRoute, handler);
    try {
      // Symbol switches in earlier tests naturally create tabs; start from one known pane.
      await page.evaluate(() => {
        const m = window.__alfaDebug.multiChart;
        for (const p of [...m.state.panes].slice(1)) m.removePane(p.id);
        m.state.active = m.state.panes[0].id;
        document.querySelector('[data-layout="1"]').click();
      });
      await page.click('#multi-toggle');
      await page.waitForFunction(() => document.body.classList.contains('multi-open') && !document.getElementById('multi-chart').hidden);
      assert.equal(await page.locator('#chart-tabs .chart-tab').count(), 1);
      assert.equal(await state(() => window.__alfaDebug.multiState.open), true);
      await page.click('#view-menu summary'); await page.click('[data-layout="2"]'); await page.keyboard.press('Escape');
      assert.equal(await state(() => document.getElementById('multi-grid').dataset.layout), '2');
      assert.equal(await page.locator('#multi-grid .multi-cell').count(), 2);
      await page.click('#multi-add');
      await page.fill('#multi-add-symbol', 'ETHUSDT');
      await page.click('#multi-add-form button[type=submit]');
      await page.waitForFunction(() => window.__alfaDebug.multiState.panes.length === 2);
      assert.equal(await page.locator('#multi-grid iframe').count(), 2, JSON.stringify(await state(() => window.__alfaDebug.multiState)));
      assert.match(await page.locator('#multi-grid iframe').first().getAttribute('src'), /embed=1&symbol=BTCUSDT&interval=1h/);
      assert.equal(await page.locator('#multi-tabs .chart-tab').count(), 2);
      await page.click('#multi-tabs .chart-tab >> nth=1');
      assert.equal(await state(() => window.__alfaDebug.multiState.active),
        await state(() => window.__alfaDebug.multiState.panes.at(-1).id));
      await page.click('#multi-exit');
      assert.equal(await state(() => document.body.classList.contains('multi-open')), false);
      assert.equal(await page.locator('#chart-panel-single').isVisible(), true);
      await page.evaluate(() => {
        const m = window.__alfaDebug.multiChart;
        for (const p of [...m.state.panes].slice(1)) m.removePane(p.id);
        document.querySelector('[data-layout="1"]').click();
      });
      assert.equal(await state(() => window.__alfaDebug.multiState.panes.length), 1);
    } finally { await page.unroute(embedRoute, handler); }
  });
  await test('object tree: Ctrl multi-select, grouping, bulk delete, undo and rename', async () => {
    await page.evaluate(() => { const d = window.__alfaDebug.drawings; d.history.commit({ ...d.history.doc, drawings: [] }); });
    const plot = await state(() => { const d = window.__alfaDebug.drawings, r = d.host.getBoundingClientRect(); return { x: r.x, y: r.y, ...d.dimensions() }; });
    for (const [index, offset] of [.3, .6].entries()) {
      await page.click('#drawing-tools [data-group=lines]');
      await page.click('.tool-flyout [data-tool=trend]');
      const x = plot.x + plot.width * offset, y = plot.y + plot.height * .5;
      await page.mouse.click(x, y);
      await page.mouse.click(x + 80, y - 45);
      await page.waitForFunction(count => window.__alfaDebug.drawings.history.doc.drawings.length === count, index + 1);
    }
    await page.click('#drawing-manage');
    assert.equal(await page.locator('#drawing-objects [data-object-id]').count(), 2);
    await page.click('#drawing-objects [data-object-id] >> nth=0');
    await page.click('#drawing-objects [data-object-id] >> nth=1', { modifiers: ['Control'] });
    assert.equal(await state(() => window.__alfaDebug.drawings.selection.size), 2);
    assert.match(await page.locator('#tree-selection-status').textContent(), /2 seçili/);
    await page.click('#tree-group');
    await page.fill('.chart-dialog input[name=group]', 'Destekler');
    await page.click('.chart-dialog .apply');
    assert.equal(await state(() => window.__alfaDebug.drawings.history.doc.drawings.every(d => d.group === 'Destekler')), true);
    assert.equal(await page.locator('.object-folder-label').count(), 1);
    await page.locator('#drawing-objects [data-object-id] >> nth=0 >> [data-object-action=select]').dblclick();
    await page.fill('.chart-dialog input[name=name]', 'Ana trend');
    await page.click('.chart-dialog .apply');
    assert.match(await page.locator('#drawing-objects').textContent(), /Ana trend/);
    await page.click('#drawing-objects [data-object-id] >> nth=0');
    await page.click('#drawing-objects [data-object-id] >> nth=1', { modifiers: ['Control'] });
    assert.equal(await state(() => window.__alfaDebug.drawings.selection.size), 2);
    await page.click('#tree-remove');
    assert.equal(await state(() => window.__alfaDebug.drawings.history.doc.drawings.length), 0);
    await page.keyboard.press('Control+z');
    assert.equal(await state(() => window.__alfaDebug.drawings.history.doc.drawings.length), 2);
    await shot('object-tree');
  });
  await test('favorite toolbar grip drags within the plot and survives reload', async () => {
    const before = await state(() => window.__alfaDebug.drawings.floating.position);
    const grip = await page.locator('#drawing-favs [data-toolbar-grip]').boundingBox();
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(grip.x + 130, grip.y + 70, { steps: 8 });
    await page.mouse.up();
    const after = await state(() => window.__alfaDebug.drawings.floating.position);
    assert.notDeepEqual(after, before);
    await page.reload(); await ready();
    assert.deepEqual(await state(() => window.__alfaDebug.drawings.floating.position), after);
  });
  await test('mobile/tablet layouts and catalogue fit 320, 390 and 768 px viewports', async () => {
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 844 }); await page.reload(); await ready();
      assert.equal(await state(() => document.documentElement.scrollWidth > innerWidth), false, `${width}px page overflow`);
      const chart = await page.locator('#chart').boundingBox(); assert.ok(chart.height > 450, `${width}px chart too small`);
      await catalogue();
      assert.equal(await state(() => { const r = document.querySelector('dialog').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }), true, `${width}px dialog overflow`);
      await page.fill('#ind-search', 'FVG'); assert.equal(await page.locator('[data-add=fvg]').isVisible(), true);
      await shot('workspace-mobile-' + width); await close();
    }
  });
  assert.deepEqual(errors, []);
  console.log('PASS no uncaught browser errors');
} finally { await browser.close(); }
