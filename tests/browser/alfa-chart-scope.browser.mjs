// Real chart boot + mocked study data/notification permission in an ephemeral
// guest profile. No account credentials, real delivery or production writes.
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const arg = key => process.argv.find(s => s.startsWith(`--${key}=`))?.slice(key.length + 3);
const { chromium } = await import(pathToFileURL(path.resolve(arg('playwright'))));
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
const origin = arg('url') || 'http://127.0.0.1:4173';
const errors = [], writes = [];
const alarmRaw = JSON.stringify([{ id: 'scope-fixture-alarm', symbol: 'BTCUSDT', cond: 'above', price: 1,
  enabled: false, sound: 'none', repeat: 'once', note: 'disabled isolated fixture', createdAt: 1000 }]);
const ready = () => page.waitForFunction(() => window.__alfaDebug?.ready && window.__alfaDebug.drawings.ready, null, { timeout: 45000 });
const close = async () => { await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.querySelector('dialog[open]')); };
const openCatalogue = async query => {
  await page.locator('#indicators-manage').click();
  await page.locator('#ind-search').fill(query);
};
try {
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (request.method() !== 'GET' && new URL(request.url()).origin === new URL(origin).origin &&
      new URL(request.url()).pathname.startsWith('/api/')) writes.push(request.url());
  });
  await page.addInitScript(({ alarmRaw }) => {
    if (!/^https?:$/.test(location.protocol)) return;
    Object.defineProperty(window, 'Notification', { configurable: true, value: class {
      static permission = 'denied';
      static async requestPermission() { return 'denied'; }
    } });
    if (!localStorage.getItem('scope-fixture-seeded')) {
      localStorage.setItem('scope-fixture-seeded', '1');
      // Keep the symbol picker deterministic; the TV watchlist migration has
      // its own dedicated browser suite and would otherwise replace options.
      localStorage.setItem('alfa-watchlist:v1:guest', JSON.stringify({
        version: 2, name: 'İzleme listesi', symbols: ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT']
      }));
      localStorage.setItem('alfa-watchlist:tv-migrated:v1:guest', '1');
      localStorage.setItem('alfa-alarms:v1:guest', alarmRaw);
      localStorage.setItem('alfa-ind-fav:v1', JSON.stringify(['footprint', 'heatmap']));
      localStorage.setItem('alfa-drawings:v1:guest:BTCUSDT', JSON.stringify({
        doc: { version: 1, templates: [], drawings: [{
          id: 'scope-fixture-line', type: 'horizontal',
          points: [{ time: Math.floor(Date.now() / 3600000) * 3600 - 7200, price: 60000 }],
          color: '#8ea7ff', width: 2, hidden: false, locked: true
        }] }, dirty: false, revision: 0
      }));
    }
  }, { alarmRaw });
  await page.goto(origin + '/alfa-charts.html?debug=1');
  await ready();
  const initialDoc = await page.evaluate(() => structuredClone(window.__alfaDebug.drawings.history.doc));
  assert.equal(initialDoc.drawings.length, 1);
  await page.locator('#alarm-toggle').click();
  const scope = page.locator('#alarm-scope');
  assert.equal(await scope.isVisible(), true);
  assert.match(await scope.textContent(), /yerel alarm · BTCUSDT/);
  assert.match(await scope.textContent(), /7\/24 sunucu alarmı değildir/);
  assert.match(await scope.textContent(), /Replay sırasında çalışmaz/);
  const scopeText = await scope.textContent();
  await page.locator('#alarm-permission').click();
  await page.waitForFunction(() => document.getElementById('alarm-permission-hint').textContent.includes('Bildirim izni verilmedi'));
  assert.equal(await scope.textContent(), scopeText, 'permission feedback must never hide the alarm scope');
  await page.locator('[data-edit-alarm="scope-fixture-alarm"]').click();
  assert.equal(await scope.textContent(), scopeText, 'edit/reopen keeps permanent guidance');
  await close();
  await page.locator('#symbol').selectOption('ETHUSDT'); await ready();
  await page.locator('#alarm-toggle').click();
  assert.match(await scope.textContent(), /yerel alarm · ETHUSDT/);
  await close();
  assert.equal(await page.evaluate(() => localStorage.getItem('alfa-alarms:v1:guest')), alarmRaw);
  await page.locator('#symbol').selectOption('BTCUSDT'); await ready();

  const flowTime = await page.evaluate(() => window.__alfaDebug.history.at(-1).time * 1000);
  await page.route(/^https:\/\/api\.binance\.com\/api\/v3\/klines/, route => {
    if (new URL(route.request().url()).searchParams.get('limit') !== '500') return route.fallback();
    return route.fulfill({ json: [[flowTime, '60000', '60300', '59800', '60100', '10', flowTime + 3599999, '0', 12, '7', '0', '0']] });
  });
  await page.route(/^https:\/\/api\.binance\.com\/api\/v3\/depth/, route => route.fulfill({
    json: { bids: [['60000', '2'], ['59950', '3']], asks: [['60100', '1'], ['60200', '4']] }
  }));
  await openCatalogue('footprint');
  const footprintRow = page.locator('.study-row').filter({ has: page.locator('[data-add=footprint]') });
  assert.match(await footprintRow.textContent(), /Mum deltası · Footprint özeti/);
  assert.match(await footprintRow.textContent(), /fiyat kademeli bid\/ask footprint değildir/);
  await page.locator('[data-add=footprint]').click(); await close();
  await page.waitForFunction(() => window.__alfaDebug.publicStudies.seriesById.footprint.length === 1);
  assert.equal(await page.evaluate(() => window.__alfaDebug.publicStudies.seriesById.footprint[0].data()[0].value), 4);
  assert.match(await page.locator('[data-study-chip=footprint]').textContent(), /Footprint özeti/);
  await page.locator('#study-legend [data-study-settings=footprint]').click();
  assert.match(await page.locator('[data-study-scope=footprint]').textContent(), /imbalance hücreleri gösterilmez/);
  await close();

  await openCatalogue('heatmap');
  const heatmapRow = page.locator('.study-row').filter({ has: page.locator('[data-add=heatmap]') });
  assert.match(await heatmapRow.textContent(), /Likidite seviyeleri · anlık emir defteri/);
  assert.match(await heatmapRow.textContent(), /tarihsel heatmap \/ ısı haritası değildir/);
  await page.locator('[data-add=heatmap]').click(); await close();
  await page.waitForFunction(() => window.__alfaDebug.publicStudies.priceLines.length === 4);
  assert.equal(await page.evaluate(() => window.__alfaDebug.publicStudies.priceLines[0].options().title),
    'Likidite seviyeleri · anlık emir defteri');
  await page.locator('#study-legend [data-study-settings=heatmap]').click();
  assert.match(await page.locator('[data-study-scope=heatmap]').textContent(), /tarihsel ısı haritası veya kesintisiz veri akışı değildir/);
  await close();
  await page.reload(); await ready();
  await page.waitForFunction(() => window.__alfaDebug.publicStudies.seriesById.footprint.length === 1 &&
    window.__alfaDebug.publicStudies.priceLines.length === 4);
  assert.deepEqual(await page.evaluate(() => ({
    footprint: window.__alfaDebug.studiesUI.toJSON().footprint,
    heatmap: window.__alfaDebug.studiesUI.toJSON().heatmap
  })), { footprint: { added: true, visible: true, collapsed: false },
    heatmap: { added: true, visible: true, collapsed: false } });
  await openCatalogue('');
  await page.locator('[data-cat=fav]').click();
  assert.equal(await page.locator('[data-add=footprint]').count(), 1);
  assert.equal(await page.locator('[data-add=heatmap]').count(), 1);
  await close();

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.locator('#alarm-toggle').click();
    assert.equal(await scope.isVisible(), true);
    assert.equal(await page.locator('dialog').evaluate(el => el.scrollWidth <= el.clientWidth), true, 'alarm scope wraps on mobile');
    await close();
    await openCatalogue('heatmap');
    await page.locator('.studies-dialog [data-study-settings=heatmap]').click();
    assert.equal(await page.locator('[data-study-scope=heatmap]').isVisible(), true);
    assert.equal(await page.locator('dialog').evaluate(el => el.scrollWidth <= el.clientWidth), true, 'study scope wraps on mobile');
    await close();
  }
  assert.equal(await page.evaluate(() => localStorage.getItem('alfa-alarms:v1:guest')), alarmRaw);
  assert.deepEqual(await page.evaluate(() => window.__alfaDebug.drawings.history.doc), initialDoc);
  assert.deepEqual(writes, []);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, alarmScope: true, permissionDoesNotHideScope: true,
    honestStudyNames: true, originalCalculations: true, legacyIdsAndFavorites: true, mobile: [390, 320],
    alarmStorageUnchanged: true, productionWrites: false, pageErrors: errors }));
} finally { await browser.close(); }
