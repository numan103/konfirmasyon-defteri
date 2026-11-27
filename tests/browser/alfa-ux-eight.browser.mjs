// UX round regression: eight mobile-first chart improvements. Anonymous only.
// node tests/browser/alfa-ux-eight.browser.mjs --url=http://127.0.0.1:8787 --playwright=<path/to/playwright/index.mjs> --shots=<dir>
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const arg = key => process.argv.find(s => s.startsWith(`--${key}=`))?.split('=').slice(1).join('=');
const origin = arg('url');
assert.ok(origin && /^https?:\/\//.test(origin), '--url=http(s)://<origin> is required');
const shotDir = path.resolve(arg('shots') || 'docs/upgrade-screenshots');
fs.mkdirSync(shotDir, { recursive: true });

const { chromium, devices } = await import(pathToFileURL(path.resolve(arg('playwright') || 'node_modules/playwright/index.mjs')));
const browser = await chromium.launch({
  executablePath: arg('chrome') || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true
});
const errors = [], passed = [];
let step = 'boot';

const display = (doc, selector) => doc.querySelector(selector) ? getComputedStyle(doc.querySelector(selector)).display : 'missing';
const ready = page => page.waitForFunction(
  () => window.__alfaDebug?.ready === true && document.querySelector('#chart-loading')?.hidden === true && window.__alfaDebug?.history?.length > 30,
  null, { timeout: 30000 });

async function run(name, fn) {
  step = name;
  await fn();
  passed.push(name);
  console.log('PASS', name);
}

try {
  // ---------------------------------------------------------------- mobile
  const mobileContext = await browser.newContext({
    ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true
  });
  const mobile = await mobileContext.newPage();
  mobile.on('pageerror', error => errors.push(`mobile: ${error.message}`));
  await mobile.goto(origin + '/alfa-charts.html?debug=1', { waitUntil: 'domcontentloaded' });
  await ready(mobile);

  await run('Mobil tek araç yüzeyi ve sürükleme sırasında tarih etiketi', async () => {
    const surface = await mobile.evaluate(() => {
      const fab = document.querySelector('#mobile-draw-fab');
      const buttons = [...(fab?.querySelectorAll('button') || [])];
      return {
        duplicateFavs: !!document.querySelector('#drawing-favs'),
        desktopRail: getComputedStyle(document.querySelector('.drawing-space')).display,
        quick: !!document.querySelector('#mobile-draw-quick'),
        fab: fab ? getComputedStyle(fab).display : 'missing',
        buttonCount: buttons.length,
        minHeight: Math.min(...buttons.map(b => Math.round(b.getBoundingClientRect().height))),
        groups: document.querySelectorAll('#mobile-all-tools [data-group]').length
      };
    });
    assert.equal(surface.duplicateFavs, false, 'duplicate favourites rail must stay removed');
    assert.equal(surface.desktopRail, 'none', 'desktop tool rail must not leak into the phone shell');
    assert.equal(surface.quick, false, 'the old quick bar must stay removed');
    assert.equal(surface.fab, 'flex', 'the single thumb-reachable pencil FAB must be visible');
    assert.equal(surface.buttonCount, 1, 'the FAB must have one brush button; the brush itself is the drag handle');
    assert.ok(surface.groups >= 5, 'the FAB must open every drawing category');
    assert.ok(surface.minHeight >= 44, `FAB targets too small: ${surface.minHeight}`);

    const chart = await mobile.locator('#chart').boundingBox();
    const x = chart.x + chart.width * 0.45, y = chart.y + chart.height * 0.4;
    await mobile.dispatchEvent('#chart', 'pointerdown', { pointerType: 'touch', pointerId: 41, clientX: x, clientY: y, bubbles: true });
    await mobile.waitForFunction(() => {
      const node = document.querySelector('#mobile-date-label');
      return node && !node.hidden && /\d/.test(node.textContent);
    }, null, { timeout: 5000 });
    const date = (await mobile.textContent('#mobile-date-label')).trim();
    assert.match(date, /\d{1,2}:\d{2}/, `date chip needs a time: ${date}`);
    await mobile.screenshot({ path: path.join(shotDir, 'ux-01-mobile-date-label.png'), fullPage: false });
    await mobile.dispatchEvent('#chart', 'pointerup', { pointerType: 'touch', pointerId: 41, clientX: x, clientY: y, bubbles: true });
  });

  await run('1h zaman dilimi oval ve gradyanlı', async () => {
    const tf = await mobile.evaluate(() => {
      const el = document.querySelector('#mobile-timeframe'), style = getComputedStyle(el), box = el.getBoundingClientRect();
      return { text: el.textContent.replace(/\s+/g, ' ').trim(), radius: style.borderRadius, background: style.backgroundImage,
        width: Math.round(box.width), height: Math.round(box.height) };
    });
    assert.match(tf.text, /1H/i, `timeframe label must show 1H: ${tf.text}`);
    assert.ok(parseFloat(tf.radius) >= 20 || tf.radius.includes('999px'), `timeframe must be oval: ${tf.radius}`);
    assert.match(tf.background, /linear-gradient/, 'timeframe needs the 1h gradient treatment');
    assert.ok(tf.height >= 44 && tf.width >= 60, `timeframe target too small: ${tf.width}x${tf.height}`);
  });

  await run('Açıklama panelleri gizli', async () => {
    await mobile.click('#mobile-menu-open');
    await mobile.waitForFunction(() => document.body.classList.contains('menu-open'), null, { timeout: 5000 });
    const notes = await mobile.evaluate(() => ({
      body: document.body.innerText,
      savePresent: !!document.querySelector('#mobile-save-state'),
      alarmPresent: !!document.querySelector('.mobile-alarm-note'),
      installPresent: !!document.querySelector('#mobile-install-hint'),
      advancedNotes: document.querySelectorAll('#mobile-advanced-sheet .advanced-note').length
    }));
    for (const phrase of [
      'MİSAFİR · yalnızca yerel kayıt',
      'Yerel alarm · yalnızca seçili sembol',
      'Test araçları simülasyondur; gerçek emir gönderilmez',
      'iOS Safari kurulumu bu çalışmada doğrulanmadı'
    ]) assert.equal(notes.body.includes(phrase), false, `removed explanation still visible: ${phrase}`);
    assert.equal(notes.savePresent, false);
    assert.equal(notes.alarmPresent, false);
    assert.equal(notes.installPresent, false);
    assert.equal(notes.advancedNotes, 0);
    await mobile.screenshot({ path: path.join(shotDir, 'ux-02-mobile-menu-clean.png'), fullPage: false });
    // Use the visible close control; a synthetic Escape can be swallowed by a
    // focused element after a screenshot and made this assertion flaky.
    await mobile.click('#mobile-menu-close');
    await mobile.waitForFunction(() => !document.body.classList.contains('menu-open'), null, { timeout: 5000 });
  });
  await mobileContext.close();

  // ---------------------------------------------------------------- desktop
  const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const desktop = await desktopContext.newPage();
  desktop.on('pageerror', error => errors.push(`desktop: ${error.message}`));
  await desktop.goto(origin + '/alfa-charts.html?debug=1', { waitUntil: 'domcontentloaded' });
  await ready(desktop);

  await run('Web grafik tam ekranı dolduruyor', async () => {
    const before = await desktop.evaluate(() => ({
      chartFirst: document.body.classList.contains('chart-first'),
      toolbar: getComputedStyle(document.querySelector('.toolbar')).display,
      watchlist: getComputedStyle(document.querySelector('#watchlist')).display
    }));
    assert.equal(before.chartFirst, true, 'desktop must start in chart-first mode');
    assert.notEqual(before.toolbar, 'none');
    assert.notEqual(before.watchlist, 'none');

    // Headless Chrome can disable the real Fullscreen API, so verify the action
    // route and the chart-full layout independently.
    const routed = await desktop.evaluate(() => {
      const button = document.getElementById('fullscreen');
      let clicks = 0;
      const original = button.click;
      button.click = () => { clicks++; };
      try { window.__alfaDebug.handleChartAction('fullscreen'); } finally { button.click = original; }
      return clicks;
    });
    assert.equal(routed, 1, 'fullscreen chart action must route to the fullscreen control');
    await desktop.evaluate(() => document.body.classList.add('chart-full'));
    const full = await desktop.evaluate(() => {
      const rect = document.querySelector('#chart').getBoundingClientRect();
      return {
        toolbar: getComputedStyle(document.querySelector('.toolbar')).display,
        watchlist: getComputedStyle(document.querySelector('#watchlist')).display,
        width: Math.round(rect.width), height: Math.round(rect.height), viewport: { w: innerWidth, h: innerHeight }
      };
    });
    assert.equal(full.toolbar, 'none', 'fullscreen must hide the toolbar');
    assert.equal(full.watchlist, 'none', 'fullscreen must hide the watchlist');
    assert.ok(full.width >= full.viewport.w - 8, `chart must fill width: ${full.width}/${full.viewport.w}`);
    assert.ok(full.height >= full.viewport.h - 40, `chart must fill height: ${full.height}/${full.viewport.h}`);
    await desktop.screenshot({ path: path.join(shotDir, 'ux-03-web-fullscreen.png'), fullPage: false });
    await desktop.evaluate(() => document.body.classList.remove('chart-full'));
  });

  await run('Web indikatör çipleri sembol altında ve sade', async () => {
    await desktop.click('#indicators-manage');
    await desktop.waitForSelector('[data-add="ema"]', { state: 'visible', timeout: 5000 });
    await desktop.click('[data-add="ema"]');
    await desktop.keyboard.press('Escape');
    await desktop.waitForFunction(() => document.querySelectorAll('#study-legend .study-chip[data-study-chip]').length >= 2, null, { timeout: 5000 });
    const panel = await desktop.evaluate(() => {
      const legend = document.getElementById('study-legend'), chart = document.getElementById('chart'), title = document.getElementById('market-title');
      const legendRect = legend.getBoundingClientRect(), chartRect = chart.getBoundingClientRect(), titleRect = title.getBoundingClientRect();
      const chips = [...legend.querySelectorAll('.study-chip[data-study-chip]')];
      const bulk = [...legend.querySelectorAll('[data-study-collapse-all],[data-study-expand-all],[data-study-remove-all]')]
        .filter(button => getComputedStyle(button).display !== 'none');
      return {
        underSymbol: legendRect.top >= titleRect.bottom - 4 && legendRect.left >= titleRect.left - 4,
        overlaysChart: legendRect.top >= chartRect.top && legendRect.bottom < chartRect.bottom &&
          legendRect.left >= chartRect.left - 4,
        legendText: legend.textContent.trim(),
        heights: chips.map(chip => Math.round(chip.getBoundingClientRect().height)),
        bulkButtons: bulk.length,
        bodyText: document.body.innerText
      };
    });
    assert.equal(panel.underSymbol, true, 'overlay indicator chips must sit under the symbol label');
    assert.equal(panel.overlaysChart, true, 'compact legend must overlay the plot instead of shrinking its height');
    assert.equal(panel.legendText.includes('İndikatörler'), false, 'the old legend heading must stay removed');
    assert.ok(panel.heights.length >= 2 && panel.heights.every(h => h <= 24), `indicator rows must stay compact: ${panel.heights}`);
    assert.equal(panel.bulkButtons, 0, 'bulk +/- controls must stay hidden in the legend');
    assert.equal(panel.bodyText.includes('+ İndikatör ekle'), false, 'old + label must not reappear');
  });

  await run('Parite arama, öneriler ve borsa sütunu', async () => {
    await desktop.click('#market-title');
    await desktop.waitForFunction(() => !!document.querySelector('dialog[open].pair-explorer-dialog'), null, { timeout: 5000 });
    await desktop.fill('#pair-query', 'EURUSD');
    await desktop.waitForFunction(() => document.querySelectorAll('#pair-results .pair-explorer-row').length > 0, null, { timeout: 5000 });
    const explorer = await desktop.evaluate(() => ({
      head: document.querySelector('.pair-explorer-head')?.textContent.replace(/\s+/g, ' ').trim() || '',
      suggestions: document.querySelectorAll('#pair-suggestion-chips button').length,
      rows: document.querySelectorAll('#pair-results .pair-explorer-row').length,
      venues: [...document.querySelectorAll('#pair-results .pair-explorer-row > small:first-of-type')].map(el => el.textContent.trim())
    }));
    assert.match(explorer.head, /Borsa/);
    assert.ok(explorer.suggestions > 0, 'search suggestions are missing');
    assert.ok(explorer.rows > 0, 'pair list is empty');
    assert.ok(explorer.venues.some(v => /OANDA|FX/.test(v)), `expected FX venues, got ${explorer.venues.join(',')}`);
    await desktop.screenshot({ path: path.join(shotDir, 'ux-04-pair-explorer.png'), fullPage: false });
    await desktop.click('#pair-close');
    await desktop.waitForFunction(() => !document.querySelector('dialog[open]'));
  });

  await run('Web araç çubuğu sürüklenebiliyor ve konumu saklanıyor', async () => {
    const readRail = () => desktop.evaluate(() => {
      const el = document.querySelector('.drawing-space'), rect = el.getBoundingClientRect();
      return { left: parseFloat(el.style.left) || 0, top: parseFloat(el.style.top) || 0, x: Math.round(rect.x), y: Math.round(rect.y) };
    });
    const before = await readRail();
    const grip = await desktop.locator('#drawing-rail-grip').boundingBox();
    assert.ok(grip && grip.width >= 24 && grip.height >= 24, 'tool rail needs a visible grip');
    const gx = grip.x + grip.width / 2, gy = grip.y + grip.height / 2;
    await desktop.mouse.move(gx, gy);
    await desktop.mouse.down();
    await desktop.mouse.move(gx + 220, gy - 160, { steps: 10 });
    await desktop.mouse.up();
    const after = await readRail();
    assert.ok(after.x > before.x + 100 && after.y < before.y - 80, `rail did not follow drag: ${JSON.stringify({ before, after })}`);
    const stored = await desktop.evaluate(() => JSON.parse(localStorage.getItem('alfa-drawing-rail-position:v1') || 'null'));
    assert.ok(stored && Number.isFinite(stored.x) && Number.isFinite(stored.y), 'rail position must persist');
    await desktop.screenshot({ path: path.join(shotDir, 'ux-05-tool-rail-dragged.png'), fullPage: false });
  });

  await run('İzleme listesi sağ tık ile bölme/aktarma', async () => {
    const symbols = await desktop.locator('#watch-rows .watch-row[data-symbol]').evaluateAll(rows => rows.map(row => row.dataset.symbol));
    assert.ok(symbols.length >= 3, 'watchlist rows are missing');
    const splitRef = symbols.find(s => s !== symbols[0]);
    await desktop.locator(`.watch-row[data-symbol="${splitRef}"]`).click({ button: 'right' });
    await desktop.waitForSelector('#watch-context-menu', { state: 'visible', timeout: 5000 });
    const menuText = await desktop.textContent('#watch-context-menu');
    assert.match(menuText, /Yeni panede böl/);
    assert.match(menuText, /Aktif pane aktar/);
    await desktop.click('[data-watch-action="split"]');
    await desktop.waitForFunction(() => {
      const state = window.__alfaDebug.multiState;
      return state.open === true && state.panes.length >= 2;
    }, null, { timeout: 8000 });
    const splitState = await desktop.evaluate(() => window.__alfaDebug.multiState);
    assert.ok(splitState.panes.some(pane => pane.symbol === splitRef), `split pane missing ${splitRef}`);

    const transferRef = symbols.find(s => s !== splitRef && s !== symbols[0]) || symbols[0];
    await desktop.locator(`.watch-row[data-symbol="${transferRef}"]`).click({ button: 'right' });
    await desktop.waitForSelector('#watch-context-menu', { state: 'visible', timeout: 5000 });
    await desktop.click('[data-watch-action="transfer"]');
    await desktop.waitForFunction(ref => {
      const state = window.__alfaDebug.multiState, pane = state.panes.find(p => p.id === state.active);
      return pane?.symbol === ref;
    }, transferRef, { timeout: 8000 });
    await desktop.screenshot({ path: path.join(shotDir, 'ux-06-watchlist-split.png'), fullPage: false });
  });

  assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
  await desktopContext.close();
  console.log(JSON.stringify({ result: 'PASS', steps: passed, shots: 6, pageErrors: [] }, null, 2));
} catch (error) {
  console.log(JSON.stringify({ result: 'FAIL', step, error: error.message, steps: passed, pageErrors: errors }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
