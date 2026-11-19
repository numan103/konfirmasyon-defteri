// Alfa Dergi: doğrudan Edu, kaldırılmış takvim menüsü, video altı kart ve herkese açık haftalık bölüm.
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const arg = key => process.argv.find(s => s.startsWith(`--${key}=`))?.slice(key.length + 3);
const { chromium } = await import(pathToFileURL(path.resolve(arg('playwright'))));
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const base = arg('url') || 'http://127.0.0.1:4188';
const live = process.argv.includes('--live'); // canlı veride başlık/özet metinleri fixture'dan farklı olabilir
const result = { passed: false, roles: [], errors: [] };

async function session(label, access) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/api/access**', route => route.fulfill({ json: access }));
  try {
    await page.goto(base + '/?page=home');
    await page.waitForFunction(() => typeof applyTierUi === 'function' && document.getElementById('home-magazine-link'));
    await page.evaluate(() => { hideLanding(); showPage('home'); });
    if (access.admin) await page.evaluate(() => { siteIsAdmin = () => true; SITE.admin = true; applyTierUi(); });
    await page.locator('#home-magazine-link').waitFor({ state: 'visible' });
    const menu = await page.evaluate(() => ({
      calendarDesktop: !!document.getElementById('tab-calendar'),
      calendarMobile: !!document.querySelector('[data-mnav="calendar"]'),
      eduDesktop: document.getElementById('tab-eduplans')?.getAttribute('href'),
      eduMobile: document.querySelector('[data-mnav="eduplans"]')?.getAttribute('href'),
      eduDropdown: !!document.querySelector('.nav-drop .drop-btn[data-i18n="app.edu"]'),
      extraEdu: !!document.getElementById('tab-egitim') || !!document.getElementById('tab-strategies'),
    }));
    assert.deepEqual(menu, {
      calendarDesktop: false, calendarMobile: false,
      eduDesktop: '?page=eduplans', eduMobile: '?page=eduplans',
      eduDropdown: false, extraEdu: false,
    }, label + ' menu');
    await page.locator('#tab-eduplans').click();
    await page.waitForFunction(() => document.body.dataset.page === 'eduplans');
    await page.evaluate(() => showPage('home'));

    const card = page.locator('#home-magazine-link');
    assert.equal(await card.isVisible(), true, label + ' home magazine card');
    const videoTop = await page.locator('#home-member-video').evaluate(n => n.getBoundingClientRect().top).catch(() => -1);
    const cardTop = await card.evaluate(n => n.getBoundingClientRect().top);
    assert.ok(cardTop >= videoTop, label + ' card is below the video');

    const reader = page.locator('#home-mag-reader');
    assert.equal(await reader.isVisible(), true, label + ' embedded reader visible');
    const rail = page.locator('#hmr-rail');
    await rail.locator('.hmr-card').first().waitFor();
    const embedded = await page.evaluate(() => {
      const r = document.getElementById('hmr-rail');
      return {
        cards: r.querySelectorAll('.hmr-card').length,
        titles: [...r.querySelectorAll('.hmr-title')].map(n => n.textContent),
        copy: r.querySelector('.hmr-copy')?.textContent || '',
        week: document.getElementById('hmr-week')?.textContent || '',
        dots: document.querySelectorAll('#hmr-dots .hmr-dot').length,
        scrollable: r.scrollWidth > r.clientWidth,
        tools: !!document.querySelector('#home-mag-reader #mag-tools'),
        readerLabel: document.getElementById('home-mag-reader')?.getAttribute('aria-label') || '',
      };
    });
    assert.ok(embedded.cards >= 1, label + ' embedded cards');
    assert.ok(embedded.titles.every(t => t && t.trim()), label + ' embedded titles');
    assert.ok(embedded.copy.trim(), label + ' embedded copy');
    assert.match(embedded.week, /^Haftalık · /, label + ' embedded week label');
    assert.equal(embedded.dots, embedded.cards, label + ' reader dots');
    assert.ok(embedded.scrollable, label + ' rail scrolls horizontally');
    assert.equal(embedded.tools, false, label + ' embedded reader is read-only');
    assert.match(embedded.readerLabel, /okuyucu/i, label + ' reader mode label');
    const beforeScroll = await rail.evaluate(n => n.scrollLeft);
    await page.locator('#hmr-next').click();
    await page.waitForFunction(prev => document.getElementById('hmr-rail').scrollLeft > prev, beforeScroll);
    assert.equal(await page.locator('#hmr-dots .hmr-dot.on').count(), 1, label + ' one active dot');

    await card.click();
    await page.waitForFunction(() => document.body.dataset.page === 'news');

    await page.locator('#news-weekly-list .nw-card').first().waitFor();
    const weekly = await page.evaluate(() => ({
      count: document.querySelectorAll('#news-weekly-list .nw-card').length,
      titles: [...document.querySelectorAll('#news-weekly-list .nw-title')].map(n => n.textContent),
      excerpt: document.querySelector('#news-weekly-list .nw-excerpt')?.textContent || '',
      meta: document.querySelector('#news-weekly-list .nw-meta')?.textContent || '',
      toolsVisible: getComputedStyle(document.getElementById('mag-tools')).display !== 'none',
      stagePages: document.querySelectorAll('#mag-stage .mag-page').length,
    }));
    assert.ok(weekly.count >= 1, label + ' weekly cards');
    assert.ok(weekly.titles.length === weekly.count && weekly.titles.every(t => t && t.trim()), label + ' weekly titles');
    assert.ok(weekly.excerpt.trim(), label + ' weekly excerpt');
    assert.match(weekly.meta, /^Haftalık · /, label + ' weekly label');
    if (!live) {
      // Local fixture: exact editorial copy is asserted; live Supabase data changes weekly.
      assert.equal(weekly.count, 2, label + ' fixture weekly card count');
      assert.ok(weekly.titles.includes('Haftalık HTF Bias'), label + ' fixture weekly bias title');
      assert.match(weekly.excerpt, /HTF bias bullish/, label + ' fixture weekly excerpt');
      assert.match(weekly.meta, /Haftalık · 1 Kasım/, label + ' fixture weekly label');
    }
    assert.equal(weekly.toolsVisible, access.admin === true, label + ' editor tools');
    assert.ok(weekly.stagePages >= 3, label + ' flipbook pages');

    await page.locator('#news-weekly-list .nw-open').first().click();
    assert.match(await page.locator('#mag-counter').textContent(), /^\d+ \/ \d+/, label + ' weekly card opens a flipbook page');
    assert.deepEqual(errors, [], label + ' page errors');
    result.roles.push({ label, menu, weekly: { count: weekly.count, toolsVisible: weekly.toolsVisible } });
  } finally { await page.close(); }
}

try {
  await session('new member', { ok: true, admin: false, tier: 'free', status: 'none' });
  await session('premium', { ok: true, admin: false, tier: 'ref', status: 'verified' });
  await session('admin', { ok: true, admin: true, tier: 'free', status: 'none' });
  result.passed = true;
  console.log(JSON.stringify(result));
} catch (error) {
  result.error = error.message;
  console.log(JSON.stringify(result));
  process.exitCode = 1;
} finally { await browser.close(); }
