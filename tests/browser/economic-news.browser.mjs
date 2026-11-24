import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const arg = key => process.argv.find(s => s.startsWith(`--${key}=`))?.slice(key.length + 3);
const { chromium } = await import(pathToFileURL(path.resolve(arg('playwright'))));
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const base = arg('url') || 'http://127.0.0.1:4174';
const errors = [];
try {
  for (const blocked of [false, true]) {
    const context = await browser.newContext({ viewport: { width: blocked ? 360 : 1440, height: 1000 }, hasTouch: blocked, isMobile: blocked, timezoneId: 'America/Los_Angeles' });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    let calls = 0, unavailable = false;
    await page.addInitScript(() => {
      localStorage.setItem('alfa-economic-news-open', '1'); // Old open preferences must be ignored.
      const interval = window.setInterval;
      window.setInterval = (fn, ms, ...args) => {
        if (ms === 120000 && String(fn).includes('popup.hidden')) (window.__newsIntervals ||= []).push(fn);
        return interval(fn, ms, ...args);
      };
    });
    await page.route('**/api/**', route => {
      if (!route.request().url().includes('/api/eco-cal')) return route.fulfill({ json: { ok: false } });
      calls++;
      if (unavailable) return route.fulfill({ status: 503, json: { ok: false, error: 'unavailable' } });
      return route.fulfill({ json: { ok: true, items: [
        { title: 'Core CPI m/m', titleTr: 'Çekirdek TÜFE (aylık)', country: 'USD', impact: 'High', date: new Date().toISOString(), forecast: '0.2%', previous: '0.3%' },
        { title: '<img src=x onerror=alert(1)>', country: 'EUR', impact: 'Low', date: new Date().toISOString() },
      ] } });
    });
    await page.route('https://widgets.tradingview-widget.com/**', route => blocked ? route.abort() : route.fulfill({
      contentType: 'text/javascript', body: "customElements.define('tv-economic-calendar', class extends HTMLElement { connectedCallback() { this.textContent = 'Sağlayıcı test bileşeni'; } });",
    }));
    await page.goto(base + '/?page=home');
    await page.waitForFunction(() => typeof hideLanding === 'function' && document.getElementById('economic-news'));
    await page.evaluate(() => { showLanding = () => {}; hideLanding(); });
    const trigger = page.locator('#economic-news-trigger');
    const popup = page.locator('#economic-news-popover');
    assert.equal(await popup.isVisible(), false);
    assert.equal(calls, 0, 'no calendar requests before user interaction');
    if (blocked) {
      const a = await trigger.boundingBox(), b = await page.locator('#nav-login-app').boundingBox();
      assert.ok(a && b && (a.x >= b.x + b.width || a.x + a.width <= b.x), 'calendar must not cover Login');
    }
    if (!blocked) {
      await trigger.hover();
      await popup.waitFor({ state: 'visible' });
      await page.mouse.move(5, 500);
      await popup.waitFor({ state: 'hidden' });
      await trigger.focus();
      await page.keyboard.press('Enter');
    } else await trigger.tap();
    await page.waitForFunction(() => document.querySelectorAll('.econ-news-row').length === 1);
    assert.match(await page.locator('[data-econ-list]').innerText(), /Çekirdek TÜFE.*\nCore CPI m\/m/);
    if (blocked) {
      await page.waitForFunction(() => document.querySelector('[data-econ-widget-status]').textContent.includes('yüklenemedi'));
    } else {
      await page.locator('tv-economic-calendar').waitFor();
      assert.equal(await page.locator('tv-economic-calendar').getAttribute('high-importance-only'), '');
    }
    await page.locator('[data-econ-high]').uncheck();
    assert.equal(await page.locator('.econ-news-row').count(), 2);
    assert.equal(await page.locator('[data-econ-list] img').count(), 0);
    assert.match(await page.locator('[data-econ-list]').innerText(), /Türkçe çeviri henüz yok/);
    if (!blocked) assert.equal(await page.locator('tv-economic-calendar').getAttribute('high-importance-only'), null);
    await page.locator('[data-econ-close]').click();
    assert.equal(await popup.isVisible(), false);
    assert.equal(await page.locator('tv-economic-calendar').count(), 0, 'closing unloads the provider iframe');
    const before = calls;
    await page.evaluate(() => (window.__newsIntervals || []).forEach(fn => fn()));
    assert.equal(calls, before, 'collapsed panel must not poll');
    await trigger.focus();
    await page.keyboard.press('Enter');
    unavailable = true;
    await page.locator('[data-econ-refresh]').click();
    await page.waitForFunction(() => document.querySelector('[data-econ-status]').classList.contains('econ-news-error'));
    assert.equal(await page.locator('.econ-news-row').count(), 2, 'failure must retain the last fetched agenda with a warning');
    assert.match(await page.locator('[data-econ-status]').innerText(), /Önceki alım/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'mobile must not overflow');
    await page.keyboard.press('Escape');
    assert.equal(await popup.isVisible(), false);
    assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
    await trigger.focus();
    await page.keyboard.press('Enter');
    await page.mouse.click(3, 400);
    assert.equal(await popup.isVisible(), false, 'outside click closes the popover');
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, startsClosed: true, hover: true, mobile: true, escapeAndOutsideClose: true, bilingual: true, blockedWidgetFallback: true, noXss: true, collapsedNoPolling: true, pageErrors: errors }));
} finally { await browser.close(); }
