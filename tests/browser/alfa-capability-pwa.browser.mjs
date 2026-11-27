// FAZ 5: capability-aware share fallbacks, common sheet close/back, and service worker registration.
// Anonymous local-browser test; no credentials, account calls, user-data mutation, deploy, or SW edit.
// node tests/browser/alfa-capability-pwa.browser.mjs --url=http://127.0.0.1:8787 --playwright=<path/to/playwright/index.mjs> --shots=docs/upgrade-screenshots
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
const chrome = arg('chrome') || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await chromium.launch({ executablePath: chrome, headless: true });

const sheetClasses = ['tools-open', 'settings-open', 'share-open', 'menu-open', 'advanced-open', 'timeframes-open'];
const openSheets = page => page.evaluate(classes => classes.filter(name => document.body.classList.contains(name)), sheetClasses);
const readShare = page => page.evaluate(() => {
  const el = id => document.getElementById(id);
  const option = id => {
    const button = el(id);
    if (!button) return null;
    const rect = button.getBoundingClientRect();
    return {
      hidden: button.hidden,
      disabled: button.disabled,
      label: button.textContent.replace(/\s+/g, ' ').trim(),
      action: button.dataset.shareAction || '',
      w: Math.round(rect.width),
      h: Math.round(rect.height)
    };
  };
  return {
    image: option('mobile-share-image'),
    link: option('mobile-share-link'),
    copy: option('mobile-share-copy'),
    download: option('mobile-share-download'),
    note: el('mobile-share-note')?.textContent.replace(/\s+/g, ' ').trim() || '',
    caps: window.__alfaDebug?.share?.capabilities?.() || null,
    message: { text: el('message')?.textContent.trim() || '', hidden: el('message')?.hidden !== false }
  };
});
const serviceWorkerReady = page => page.waitForFunction(async () => {
  if (!('serviceWorker' in navigator)) return false;
  const registrations = await navigator.serviceWorker.getRegistrations();
  return registrations.some(registration => registration.scope === new URL('/', location.origin).href);
}, null, { timeout: 15000 });
// Share links are backend-backed. Deterministically stub only that route so the
// phone capability tests exercise the real UI without a production write.
const routeChartShare = context => context.route('**/api/edu-shared**', async route => {
  const url = new URL(route.request().url());
  if (url.pathname !== '/api/edu-shared' || url.searchParams.get('kind') !== 'chart') return route.continue();
  if (route.request().method() === 'POST') {
    return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, id: 'pwashare01', url: '/alfa-charts.html?share=pwashare01' }) });
  }
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, found: false, snapshot: null }) });
});

let step = 'boot';
let page = null;
const pageErrors = [];
try {
  // ---------------------------------------------------------------- default browser
  const context = await browser.newContext({
    ...devices['iPhone 13'],
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });
  await routeChartShare(context);
  // Deterministic clipboard spy: headless Chrome has no native share sheet.
  await context.addInitScript(() => {
    window.__copiedTexts = [];
    // Simulate a browser without native share or image clipboard support.
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: undefined });
    Object.defineProperty(window, 'ClipboardItem', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async text => { window.__copiedTexts.push(String(text)); },
        write: async () => { throw new Error('clipboard-image-unavailable'); }
      }
    });
  });
  page = await context.newPage();
  page.on('pageerror', error => pageErrors.push(`default: ${error.message}`));
  await page.goto(origin + '/alfa-charts.html?debug=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__alfaDebug?.ready === true && document.querySelector('#chart-loading')?.hidden === true, null, { timeout: 30000 });

  step = 'service worker registration';
  await serviceWorkerReady(page);
  const swRegistrations = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map(r => r.scope));

  step = 'share capability fallback';
  await page.click('#mobile-menu-open');
  await page.click('#menu-share');
  await page.waitForFunction(() => document.body.classList.contains('share-open'), null, { timeout: 4000 });
  await page.waitForTimeout(250);
  const fallback = await readShare(page);
  assert.equal(fallback.caps.share, false, 'headless Chrome should not expose navigator.share here');
  assert.equal(fallback.image.hidden, true, 'unsupported native image share must be hidden');
  assert.equal(fallback.copy.hidden, true, 'unsupported clipboard-image option must be hidden');
  assert.equal(fallback.download.hidden, false, 'download must always remain available');
  assert.equal(fallback.link.action, 'copy-link');
  assert.match(fallback.link.label, /kopyala/i);
  assert.match(fallback.note, /sistem paylaşımı yok/i);
  assert.ok(fallback.download.h >= 44, `share options need 44px targets: ${JSON.stringify(fallback.download)}`);
  assert.deepEqual(await openSheets(page), ['share-open']);
  await page.screenshot({ path: path.join(shotDir, 'phase5-01-share-fallback.png') });

  step = 'link copy fallback';
  await page.click('#mobile-share-link');
  await page.waitForFunction(() => !document.body.classList.contains('share-open'), null, { timeout: 6000 });
  const copied = await page.evaluate(() => window.__copiedTexts || []);
  assert.ok(copied.some(text => text.includes('/alfa-charts.html?share=pwashare01')), `backend chart link must be copied: ${JSON.stringify(copied)}`);
  const fallbackShare = await page.evaluate(() => window.__alfaDebug.share.lastCreated);
  assert.equal(fallbackShare?.id, 'pwashare01', 'fallback link must come from the share backend');
  assert.equal((await readShare(page)).message.hidden, true, 'successful fallback must not leave an error message');

  step = 'download fallback';
  await page.click('#mobile-menu-open');
  await page.click('#menu-share');
  await page.waitForFunction(() => document.body.classList.contains('share-open'), null, { timeout: 4000 });
  const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
  await page.click('#mobile-share-download');
  const download = await downloadPromise;
  assert.match(download.suggestedFilename(), /^chart-.*\.png$/);
  await page.waitForFunction(() => !document.body.classList.contains('share-open'), null, { timeout: 6000 });

  step = 'common back and Escape behaviour';
  await page.click('#mobile-timeframe');
  await page.waitForFunction(() => document.body.classList.contains('timeframes-open'), null, { timeout: 4000 });
  const tfAriaOpen = await page.getAttribute('#mobile-timeframes-sheet', 'aria-hidden');
  assert.equal(tfAriaOpen, 'false', 'open sheet must be exposed to assistive tech');
  await page.screenshot({ path: path.join(shotDir, 'phase5-06-timeframes-back.png') });
  await page.click('#mobile-tf-back');
  await page.waitForFunction(() => document.body.classList.contains('menu-open') && !document.body.classList.contains('timeframes-open'), null, { timeout: 4000 });
  await page.click('#menu-share');
  await page.waitForFunction(() => document.body.classList.contains('share-open'), null, { timeout: 4000 });
  await page.click('#mobile-share-back');
  await page.waitForFunction(() => document.body.classList.contains('menu-open') && !document.body.classList.contains('share-open'), null, { timeout: 4000 });
  await page.click('#menu-settings');
  await page.waitForFunction(() => document.body.classList.contains('settings-open'), null, { timeout: 4000 });
  const settingsBack = await page.evaluate(() => {
    const el = document.querySelector('#mobile-settings-back'), r = el?.getBoundingClientRect(), s = el && getComputedStyle(el);
    return { display: s?.display || 'missing', w: r ? Math.round(r.width) : 0, h: r ? Math.round(r.height) : 0,
      label: el?.getAttribute('aria-label') || '' };
  });
  assert.notEqual(settingsBack.display, 'missing', 'settings sheet needs a back control');
  assert.notEqual(settingsBack.display, 'none', 'settings back control must be visible');
  assert.ok(settingsBack.w >= 44 && settingsBack.h >= 44, `settings back target ${settingsBack.w}x${settingsBack.h}`);
  assert.equal(settingsBack.label, 'Önceki menü');
  await page.screenshot({ path: path.join(shotDir, 'phase10-10-settings-back.png') });
  await page.click('#mobile-settings-back');
  await page.waitForFunction(() => document.body.classList.contains('menu-open') && !document.body.classList.contains('settings-open'), null, { timeout: 4000 });
  assert.equal(await page.getAttribute('#mobile-menu-sheet', 'aria-hidden'), 'false', 'back must restore the menu sheet');
  assert.equal(await page.getAttribute('#mobile-settings-sheet', 'aria-hidden'), 'true', 'back must hide the settings sheet');
  await page.click('#menu-settings');
  await page.waitForFunction(() => document.body.classList.contains('settings-open'), null, { timeout: 4000 });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.body.classList.contains('settings-open'), null, { timeout: 4000 });
  assert.deepEqual(await openSheets(page), []);
  assert.equal(await page.getAttribute('#mobile-sheet-backdrop', 'hidden'), '', 'backdrop must hide after Escape');
  const hiddenSheets = await page.evaluate(() => [...document.querySelectorAll('.mobile-sheet')].every(sheet => sheet.getAttribute('aria-hidden') === 'true'));
  assert.equal(hiddenSheets, true, 'all sheets must be aria-hidden after close');

  step = 'install hint';
  await page.click('#mobile-menu-open');
  await page.click('#menu-advanced');
  await page.waitForFunction(() => document.body.classList.contains('advanced-open'), null, { timeout: 4000 });
  const installHint = await page.evaluate(() => ({
    present: !!document.getElementById('mobile-install-hint'),
    body: document.body.innerText
  }));
  assert.equal(installHint.present, false, 'the install caveat panel must stay removed');
  assert.equal(installHint.body.includes('iOS Safari kurulumu bu çalışmada doğrulanmadı'), false);
  await page.screenshot({ path: path.join(shotDir, 'phase5-02-install-hint.png') });
  await context.close();

  // ---------------------------------------------------------------- simulated native capabilities
  step = 'simulated native share options';
  const nativeContext = await browser.newContext({
    ...devices['iPhone 13'],
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });
  await routeChartShare(nativeContext);
  await nativeContext.addInitScript(() => {
    window.__shareCalls = [];
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async data => { window.__shareCalls.push(data); }
    });
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: data => !!data?.files?.length
    });
    window.ClipboardItem = class {
      constructor(entries) { this.entries = entries; }
    };
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        write: async () => { throw new Error('forced-clipboard-failure'); },
        writeText: async () => {}
      }
    });
  });
  const nativePage = await nativeContext.newPage();
  nativePage.on('pageerror', error => pageErrors.push(`native: ${error.message}`));
  await nativePage.goto(origin + '/alfa-charts.html?debug=1', { waitUntil: 'domcontentloaded' });
  await nativePage.waitForFunction(() => window.__alfaDebug?.ready === true && document.querySelector('#chart-loading')?.hidden === true, null, { timeout: 30000 });
  await nativePage.click('#mobile-menu-open');
  await nativePage.click('#menu-share');
  await nativePage.waitForFunction(() => document.body.classList.contains('share-open'), null, { timeout: 4000 });
  await nativePage.waitForTimeout(250);
  const native = await readShare(nativePage);
  assert.equal(native.caps.share, true);
  assert.equal(native.caps.imageShare, true);
  assert.equal(native.caps.clipboardImage, true);
  assert.equal(native.image.hidden, false);
  assert.equal(native.copy.hidden, false);
  assert.equal(native.link.action, 'share-link');
  assert.match(native.note, /sistem paylaşımı kullanılabilir/i);
  await nativePage.screenshot({ path: path.join(shotDir, 'phase5-03-share-native.png') });

  step = 'native image share';
  await nativePage.click('#mobile-share-image');
  await nativePage.waitForFunction(() => (window.__shareCalls || []).length >= 1, null, { timeout: 8000 });
  const imageCall = await nativePage.evaluate(() => window.__shareCalls[0]);
  assert.ok(Array.isArray(imageCall.files) && imageCall.files.length === 1, 'native image share must receive a file');
  assert.equal(imageCall.title, 'ALFA CHARTS');
  await nativePage.waitForFunction(() => !document.body.classList.contains('share-open'), null, { timeout: 6000 });

  step = 'native link share';
  await nativePage.click('#mobile-menu-open');
  await nativePage.click('#menu-share');
  await nativePage.waitForFunction(() => document.body.classList.contains('share-open'), null, { timeout: 4000 });
  await nativePage.click('#mobile-share-link');
  await nativePage.waitForFunction(() => (window.__shareCalls || []).length >= 2, null, { timeout: 8000 });
  const linkCall = await nativePage.evaluate(() => window.__shareCalls[1]);
  assert.match(linkCall.url, /share=pwashare01/, 'native share must receive the backend chart link');
  await nativePage.waitForFunction(() => !document.body.classList.contains('share-open'), null, { timeout: 6000 });

  step = 'visible share error fallback';
  await nativePage.click('#mobile-menu-open');
  await nativePage.click('#menu-share');
  await nativePage.waitForFunction(() => document.body.classList.contains('share-open'), null, { timeout: 4000 });
  await nativePage.click('#mobile-share-copy');
  await nativePage.waitForFunction(() => {
    const message = document.getElementById('message');
    return message && !message.hidden && /Paylaşım tamamlanamadı/.test(message.textContent);
  }, null, { timeout: 8000 });
  assert.equal(await nativePage.evaluate(() => document.body.classList.contains('share-open')), true, 'sheet must stay open so a fallback can be chosen');
  assert.match((await readShare(nativePage)).message.text, /indirmeyi veya bağlantıyı kopyalamayı deneyin/i);
  await nativePage.screenshot({ path: path.join(shotDir, 'phase5-04-share-error.png') });
  await nativeContext.close();

  step = 'desktop smoke';
  const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const desktopPage = await desktopContext.newPage();
  desktopPage.on('pageerror', error => pageErrors.push(`desktop: ${error.message}`));
  await desktopPage.goto(origin + '/alfa-charts.html?debug=1', { waitUntil: 'domcontentloaded' });
  await desktopPage.waitForFunction(() => window.__alfaDebug?.ready === true && document.querySelector('#chart canvas'), null, { timeout: 30000 });
  const desktop = await desktopPage.evaluate(() => {
    const box = selector => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return { w: Math.round(rect.width), h: Math.round(rect.height), display: getComputedStyle(el).display };
    };
    return {
      toolbar: box('.toolbar'),
      chart: box('#chart'),
      watchlist: box('#watchlist'),
      mobileMenu: (() => {
        const el = document.querySelector('#mobile-menu-sheet');
        const style = getComputedStyle(el);
        return { display: style.display, opacity: style.opacity, pointerEvents: style.pointerEvents, ariaHidden: el.getAttribute('aria-hidden') };
      })()
    };
  });
  assert.equal(desktop.toolbar.display, 'flex');
  assert.ok(desktop.chart.w >= 1100 && desktop.watchlist.w >= 240);
  assert.equal(desktop.mobileMenu.ariaHidden, 'true', 'phone sheets must remain aria-hidden on desktop');
  await serviceWorkerReady(desktopPage);
  await desktopPage.screenshot({ path: path.join(shotDir, 'phase5-05-desktop.png') });
  await desktopContext.close();

  assert.deepEqual(pageErrors, []);
  console.log(JSON.stringify({
    result: 'PASS',
    swRegistrations,
    fallback,
    copied,
    download: download.suggestedFilename(),
    installHint,
    native,
    imageCall: { title: imageCall.title, files: imageCall.files.length },
    linkCall: { title: linkCall.title, url: linkCall.url },
    desktop,
    pageErrors
  }, null, 2));
} catch (error) {
  let current = null;
  try { current = await page.evaluate(() => document.body.className); } catch {}
  console.error(JSON.stringify({ result: 'FAIL', step, error: String(error?.message || error), current, pageErrors }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
