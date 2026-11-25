// Phone-shell smoke test for alfa-charts.html. Anonymous; no credentials or mutations.
// node tests/browser/alfa-mobile-shell.browser.mjs --url=<staging-origin> --playwright=<path/to/playwright/index.mjs>
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const arg = key => process.argv.find(s => s.startsWith(`--${key}=`))?.split('=').slice(1).join('=');
const origin = arg('url');
assert.ok(origin && /^https:\/\//.test(origin), '--url=https://<staging-origin> is required');
const { chromium, devices } = await import(pathToFileURL(path.resolve(arg('playwright') || 'node_modules/playwright/index.mjs')));
const browser = await chromium.launch({
  executablePath: arg('chrome') || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true
});
const context = await browser.newContext({
  ...devices['iPhone 13'],
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto(origin + '/alfa-charts.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('#timeframes button').length > 0, { timeout: 30000 });
  await page.waitForFunction(() => !!document.querySelector('#chart canvas'), { timeout: 30000 });
  await page.waitForFunction(() => document.querySelectorAll('#drawing-tools button').length > 0, { timeout: 30000 });
  await page.waitForFunction(() => !!document.querySelector('#chart-data-state') && document.querySelector('#chart-loading')?.hidden, { timeout: 30000 });

  const read = () => page.evaluate(() => {
    const box = selector => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    };
    const display = selector => {
      const el = document.querySelector(selector);
      return el ? getComputedStyle(el).display : 'missing';
    };
    const checked = selector => document.querySelector(selector)?.getAttribute('aria-pressed') === 'true';
    return {
      viewport: { w: innerWidth, h: innerHeight },
      doc: { w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight },
      toolbar: box('.toolbar'),
      chart: box('#chart'),
      legend: box('.legend'),
      legendPosition: getComputedStyle(document.querySelector('.legend')).position,
      chartTitle: document.querySelector('#market-title')?.textContent || '',
      marketStrip: box('#mobile-market-strip'),
      menuButton: box('#mobile-menu-open'),
      pairButton: box('#mobile-market-pick'),
      tools: box('#drawing-tools'),
      starButton: box('#mobile-tools-star'),
      timeframeButton: box('#mobile-timeframe'),
      grip: box('#price-scale-grip'),
      menu: box('#mobile-menu-sheet'),
      toolbarDisplay: display('.toolbar'),
      chartNavDisplay: display('.chart-navigation'),
      dataStateDisplay: display('#chart-data-state'),
      watchFilterHidden: (() => { const el = document.querySelector('#watch-filter'); return !el || el.getClientRects().length === 0; })(),
      drawingSpaceDisplay: display('.drawing-space'),
      marketPrice: document.querySelector('#mobile-market-price') ? display('#mobile-market-price') : 'missing',
      stripHint: document.querySelector('#mobile-strip-hint') ? display('#mobile-strip-hint') : 'missing',
      stripArrows: document.querySelectorAll('.market-strip-arrow,[data-strip-step],.market-strip-commit').length,
      menuInStrip: document.querySelector('#mobile-market-strip')?.contains(document.querySelector('#mobile-menu-open')) === true,
      focusButtonMissing: !document.querySelector('#menu-focus'),
      timeframeCount: document.querySelectorAll('#timeframes button').length,
      topTimeframesDisplay: display('#timeframes'),
      actionsDisplay: display('.actions'),
      studyChipCount: document.querySelectorAll('#study-legend .study-chip').length,
      chartTouchAction: getComputedStyle(document.querySelector('#chart')).touchAction,
      toolsOpen: document.body.classList.contains('tools-open'),
      settingsOpen: document.body.classList.contains('settings-open'),
      shareOpen: document.body.classList.contains('share-open'),
      menuOpen: document.body.classList.contains('menu-open'),
      timeframesOpen: document.body.classList.contains('timeframes-open'),
      toolsHidden: document.body.classList.contains('tools-hidden'),
      starPressed: checked('#mobile-tools-star'),
      toolsInSheet: document.querySelector('#mobile-tools-sheet')?.contains(document.querySelector('#drawing-tools')),
      toolButtonCount: document.querySelectorAll('#drawing-tools button').length,
      allToolGroups: document.querySelectorAll('#mobile-all-tools [data-group]').length,
      allToolButtons: document.querySelectorAll('#mobile-all-tools [data-tool]').length,
      chartLoadingHidden: document.querySelector('#chart-loading')?.hidden === true,
      dataState: document.querySelector('#chart-data-state')?.dataset.state || '',
      menuButtons: document.querySelectorAll('#mobile-menu-sheet .menu-grid button').length,
      paletteControls: document.querySelectorAll('#mobile-palette-form input').length,
      stripSymbol: document.querySelector('#mobile-market-symbol')?.textContent || '',
      overlayActive: document.body.classList.contains('strip-preview'),
      swipePrev: document.querySelector('#mobile-swipe-prev')?.textContent || '',
      swipeCurrent: document.querySelector('#mobile-swipe-symbol')?.textContent || '',
      swipeNext: document.querySelector('#mobile-swipe-next')?.textContent || '',
      swipeCount: document.querySelector('#mobile-swipe-count')?.textContent || '',
      activeSymbol: document.querySelector('#symbol')?.value || '',
      mobileTimeframe: document.querySelector('#mobile-timeframe-label')?.textContent || '',
      tfRows: document.querySelectorAll('#mobile-tf-list [data-tf]').length,
      tfStars: document.querySelectorAll('#mobile-tf-list [data-tf-fav]').length,
      listVisible: document.querySelector('.workspace')?.classList.contains('no-list') === false,
      watchPressed: checked('#menu-watchlist'),
      range1dPressed: checked('[data-range="86400"]')
    };
  });

  const before = await read();
  assert.equal(before.toolbarDisplay, 'none', 'top toolbar must be removed on phones');
  assert.equal(before.chartNavDisplay, 'none', 'range/UTC/Log/Oto row must be hidden on phones');
  assert.equal(before.dataStateDisplay, 'none', 'data-state badge must be hidden on phones');
  assert.equal(before.watchFilterHidden, true, 'watchlist search must not cover the screen');
  assert.equal(before.marketPrice, 'missing', 'strip must not show a price next to the pair');
  assert.equal(before.stripHint, 'missing', 'strip must not show an extra hint');
  assert.equal(before.stripArrows, 0, 'strip must not show up/down arrows or commit chevron');
  assert.equal(before.menuInStrip, true, 'menu button must sit in the strip, left of the pair');
  assert.ok(before.menuButton && before.pairButton && before.starButton && before.timeframeButton);
  assert.ok(before.menuButton.x < before.pairButton.x && before.pairButton.x < before.starButton.x &&
    before.starButton.x < before.timeframeButton.x, 'strip order must be menu, pair, tools star, timeframe');
  assert.equal(before.legendPosition, 'absolute', 'market title must be inside the chart, not a separate row');
  assert.ok(before.legend && before.chart && before.legend.y >= before.chart.y - 2 && before.legend.y < before.chart.y + 40);
  assert.ok(before.chartTitle.length > 0, 'in-chart title must show the active market');
  assert.equal(before.focusButtonMissing, true, 'old focus-mode menu item must be removed');
  assert.ok(before.timeframeCount > 4, 'timeframes must still render for the app state');
  assert.equal(before.topTimeframesDisplay, 'none', 'top timeframe row must be hidden on phones');
  assert.equal(before.actionsDisplay, 'none', 'top action cluster must be hidden on phones');
  assert.ok(before.chart.h > before.viewport.h * 0.6, 'chart must occupy most of the screen');
  assert.equal(before.doc.h, before.viewport.h, 'document must not scroll vertically');
  assert.equal(before.doc.w, before.viewport.w, 'document must not scroll horizontally');
  assert.equal(before.chartTouchAction, 'none', 'chart touch gestures must stay inside the chart');
  assert.equal(before.toolsOpen, false);
  assert.equal(before.toolsInSheet, true, 'drawing tools must live in the mobile sheet');
  assert.ok(before.toolButtonCount > 4, 'drawing tool buttons must render in the sheet');
  assert.ok(before.marketStrip && before.marketStrip.h >= 36, 'compact strip must be visible');
  assert.ok(before.studyChipCount > 0, 'indicator chips must be embedded in the legend');
  assert.equal(before.chartLoadingHidden, true, 'loading overlay must clear after data arrives');
  assert.ok(['live', 'ready'].includes(before.dataState), 'chart state must still be tracked internally');
  assert.equal(before.allToolGroups, 5, 'all drawing tool categories must render');
  assert.equal(before.allToolButtons, 3, 'utility tools must render alongside categories');
  assert.ok(before.mobileTimeframe.length > 0, 'bottom-right timeframe chip must show the active interval');

  await page.click('#mobile-menu-open');
  await page.waitForFunction(() => document.body.classList.contains('menu-open') &&
    document.querySelectorAll('#mobile-menu-sheet .menu-grid button').length >= 18, { timeout: 5000 });
  const menu = await read();
  assert.equal(menu.menuOpen, true);
  assert.ok(menu.menuButtons >= 18, 'menu must expose tools, lists, share and range/scale controls');
  assert.ok(menu.menu && menu.menu.y > before.viewport.h * 0.25, 'menu must anchor to the bottom of the screen');

  await page.click('#menu-tools');
  await page.waitForFunction(() => document.body.classList.contains('tools-open'), { timeout: 5000 });
  const opened = await read();
  assert.ok(opened.tools.w > 250, 'tool grid must be wide enough to tap');
  await page.click('#mobile-all-tools [data-group]');
  await page.waitForFunction(() => {
    const back = document.querySelector('#mobile-tools-back');
    return back && !back.hidden && document.querySelectorAll('#mobile-all-tools [data-tool]').length >= 2;
  }, { timeout: 5000 });
  const grouped = await read();
  assert.ok(grouped.allToolButtons >= 2, 'group drill-down must expose its full tool list');
  await page.click('#mobile-tools-back');
  await page.waitForFunction(() => document.querySelector('#mobile-tools-back')?.hidden === true &&
    document.querySelectorAll('#mobile-all-tools [data-group]').length === 5);
  await page.click('#mobile-tools-close');
  await page.waitForFunction(() => !document.body.classList.contains('tools-open'));

  await page.click('#mobile-menu-open');
  await page.waitForFunction(() => document.body.classList.contains('menu-open'));
  await page.click('#menu-settings');
  await page.waitForFunction(() => document.body.classList.contains('settings-open') &&
    document.querySelectorAll('#mobile-palette-form input').length >= 8, { timeout: 5000 });
  assert.ok((await read()).paletteControls >= 8);
  await page.click('[data-mobile-theme="light"]');
  await page.waitForFunction(() => document.body.classList.contains('mobile-light'));
  const lightBackground = await page.evaluate(() => document.querySelector('#chart').style.background || getComputedStyle(document.querySelector('#chart')).backgroundColor);
  assert.match(lightBackground, /247|f7f9fc/i, 'light theme must repaint the canvas');
  await page.click('#mobile-settings-done');
  await page.waitForFunction(() => !document.body.classList.contains('settings-open'));

  await page.click('#mobile-menu-open');
  await page.waitForFunction(() => document.body.classList.contains('menu-open'));
  await page.click('#menu-indicators');
  await page.waitForFunction(() => !!document.querySelector('dialog.chart-dialog[open]'), { timeout: 5000 });
  const dialogTop = await page.evaluate(() => document.querySelector('dialog.chart-dialog').getBoundingClientRect().top);
  assert.ok(dialogTop > before.viewport.h * 0.15, 'indicator dialog must anchor to the bottom on phones');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('dialog.chart-dialog[open]'));

  // Hidden range controls remain reachable from the menu.
  await page.click('#mobile-menu-open');
  await page.waitForFunction(() => document.body.classList.contains('menu-open'));
  await page.click('#menu-range-1d');
  await page.waitForFunction(() => document.querySelector('[data-range="86400"]')?.getAttribute('aria-pressed') === 'true', { timeout: 5000 });
  assert.equal((await read()).range1dPressed, true);
  assert.equal((await read()).chartNavDisplay, 'none');

  // The star next to the timeframe only toggles the drawing tools.
  await page.click('#mobile-tools-star');
  await page.waitForFunction(() => document.body.classList.contains('tools-hidden'), { timeout: 5000 });
  const hidden = await read();
  assert.equal(hidden.starPressed, true);
  assert.equal(hidden.drawingSpaceDisplay, 'none');
  assert.equal(hidden.chartNavDisplay, 'none', 'tools star must not hide chart chrome');
  await page.click('#mobile-tools-star');
  await page.waitForFunction(() => !document.body.classList.contains('tools-hidden'));

  await page.click('#mobile-market-pick');
  await page.waitForFunction(() => document.querySelector('.workspace')?.classList.contains('no-list') === false, { timeout: 5000 });
  assert.equal((await read()).watchPressed, true);
  assert.equal((await read()).watchFilterHidden, true);
  await page.click('#watch-mobile-close');
  await page.waitForFunction(() => document.querySelector('.workspace')?.classList.contains('no-list') === true, { timeout: 5000 });

  // Swiping the middle of the chart is not a pair switcher.
  const beforeMiddle = await read();
  const chartBox = beforeMiddle.chart;
  await page.mouse.move(chartBox.x + chartBox.w * 0.55, chartBox.y + chartBox.h * 0.5);
  await page.mouse.down();
  await page.mouse.move(chartBox.x + chartBox.w * 0.55, chartBox.y + chartBox.h * 0.5 + 60, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  const middle = await read();
  assert.equal(middle.activeSymbol, beforeMiddle.activeSymbol, 'middle-screen swipe must not change pairs');
  assert.equal(middle.overlayActive, false, 'middle-screen swipe must not show the pair carousel');

  // Pair navigation lives in the bottom strip with a smooth prev/current/next carousel.
  const strip = await page.$('#mobile-market-pick');
  const stripBox = await strip.boundingBox();
  const sx = stripBox.x + stripBox.width / 2;
  const sy = stripBox.y + stripBox.height / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx, sy + 56, { steps: 6 });
  await page.waitForFunction(() => document.body.classList.contains('strip-preview'), { timeout: 5000 });
  const swipePreview = await read();
  assert.equal(swipePreview.activeSymbol, beforeMiddle.activeSymbol, 'strip swipe must not change the active pair immediately');
  assert.ok(swipePreview.swipeCurrent.length > 0, 'carousel must show the upcoming pair');
  assert.ok(swipePreview.swipePrev.length > 0 && swipePreview.swipeNext.length > 0, 'carousel must show previous and next pairs');
  assert.match(swipePreview.swipeCount, /\d+\s*\/\s*\d+/, 'carousel must show list position');
  await page.mouse.up();
  assert.equal((await read()).activeSymbol, beforeMiddle.activeSymbol, 'pointer release must not commit immediately');
  await page.waitForFunction(symbol => document.querySelector('#symbol')?.value !== symbol,
    beforeMiddle.activeSymbol, { timeout: 6000 });
  const afterSwipe = await read();
  assert.equal(afterSwipe.overlayActive, false, 'dwell commit must clear the carousel');

  const tfBefore = (await read()).mobileTimeframe;
  const tfChip = await page.$('#mobile-timeframe');
  const tfBox = await tfChip.boundingBox();
  const tx = tfBox.x + tfBox.width / 2;
  const ty = tfBox.y + tfBox.height / 2;
  await page.mouse.move(tx, ty);
  await page.mouse.down();
  await page.mouse.move(tx, ty + 48, { steps: 6 });
  await page.mouse.up();
  await page.waitForFunction(label => document.querySelector('#mobile-timeframe-label')?.textContent !== label,
    tfBefore, { timeout: 5000 });
  assert.equal((await read()).timeframesOpen, false, 'timeframe swipe must not open the picker');
  await page.click('#mobile-timeframe');
  await page.waitForFunction(() => document.body.classList.contains('timeframes-open') &&
    document.querySelectorAll('#mobile-tf-list [data-tf]').length === 13, { timeout: 5000 });
  const tfSheet = await read();
  assert.equal(tfSheet.tfStars, 13, 'every timeframe must have a favorite star');
  await page.click('#mobile-tf-list [data-tf-fav="3m"]');
  await page.waitForFunction(() => document.querySelector('#mobile-tf-list [data-tf-fav="3m"]')?.getAttribute('aria-pressed') === 'true', { timeout: 5000 });
  await page.click('#mobile-tf-list [data-tf="3d"]');
  await page.waitForFunction(() => !document.body.classList.contains('timeframes-open') &&
    document.querySelector('#mobile-timeframe-label')?.textContent === '3D', { timeout: 5000 });

  await page.click('#mobile-menu-open');
  await page.waitForFunction(() => document.body.classList.contains('menu-open'));
  await page.click('#menu-drawings');
  await page.waitForFunction(() => {
    const panel = document.querySelector('#drawing-manager');
    return panel && !panel.hidden;
  }, { timeout: 5000 });
  await page.click('#drawing-close');
  await page.waitForFunction(() => document.querySelector('#drawing-manager')?.hidden === true);
  await page.click('#mobile-menu-open');
  await page.waitForFunction(() => document.body.classList.contains('menu-open'));
  await page.click('#menu-share');
  await page.waitForFunction(() => document.body.classList.contains('share-open') &&
    document.querySelectorAll('#mobile-share-sheet button').length >= 5, { timeout: 5000 });
  assert.equal((await read()).shareOpen, true);
  await page.click('#mobile-share-close');
  await page.waitForFunction(() => !document.body.classList.contains('share-open'));

  const grip = await page.$('#price-scale-grip');
  assert.ok(grip, 'price scale grip must exist');
  const box = await grip.boundingBox();
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX, startY + 60, { steps: 6 });
  const scaling = await page.evaluate(() => document.body.classList.contains('price-scaling'));
  await page.mouse.up();
  assert.equal(scaling, true, 'vertical price-scale drag must engage');

  const shot = 'C:/Users/Pc/AppData/Local/ALFA/PrivateBackups/alfa-mobile-shell.png';
  await page.screenshot({ path: shot, fullPage: false });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, origin, viewport: before.viewport, document: before.doc,
    toolbarHidden: before.toolbarDisplay === 'none', chartNavHidden: before.chartNavDisplay === 'none',
    chartHeight: before.chart.h, inChartTitle: before.legendPosition === 'absolute', chartTitle: before.chartTitle,
    timeframeCount: before.timeframeCount, studyChipCount: before.studyChipCount,
    toolButtonCount: before.toolButtonCount, allToolGroups: before.allToolGroups, allToolButtons: before.allToolButtons,
    dataState: before.dataState, loadingOverlayCleared: before.chartLoadingHidden,
    menuInStrip: before.menuInStrip, menuButtons: menu.menuButtons, stripArrows: before.stripArrows,
    marketPriceHidden: before.marketPrice === 'missing', dataStateHidden: before.dataStateDisplay === 'none',
    watchFilterHidden: before.watchFilterHidden, toolsStarChecked: true, rangeMenuChecked: true,
    pairBefore: beforeMiddle.activeSymbol, carouselCurrent: swipePreview.swipeCurrent,
    carouselPrev: swipePreview.swipePrev, carouselNext: swipePreview.swipeNext, carouselCount: swipePreview.swipeCount,
    pairAfter: afterSwipe.activeSymbol, middleSwipeIgnored: middle.activeSymbol === beforeMiddle.activeSymbol,
    timeframeBefore: tfBefore, timeframeRows: tfSheet.tfRows, timeframeStars: tfSheet.tfStars,
    toolsChecked: true, settingsChecked: true, indicatorsChecked: true, pairListChecked: true,
    carouselChecked: true, dwellCommitChecked: true, timeframeFavoriteChecked: true,
    drawingsChecked: true, shareChecked: true, priceScaleDragChecked: true,
    screenshot: shot, pageErrors: errors }, null, 2));
} finally {
  await browser.close();
}
