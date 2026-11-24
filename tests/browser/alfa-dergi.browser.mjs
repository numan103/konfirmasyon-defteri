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
  await page.route('**/api/edu-shared**', route => {
    if (new URL(route.request().url()).searchParams.get('kind') !== 'news') return route.fulfill({ json: { ok: true, data: null } });
    // The weekly reader only accepts current-week mentorship-magazine posts.
    const now = new Date().toISOString(), earlier = new Date(Date.now() - 60000).toISOString();
    return route.fulfill({ json: { ok: true, data: {
      issueNo: 1, rosterVer: 2, authorsSeeded: true,
      authors: [{ id: 'a1', name: 'Trader Ahmet', specialty: 'BTC & Gold', photo: '' }],
      entries: [
        { id: 'n1', title: 'Haftalık HTF Bias', body: 'BTC için haftalık HTF bias bullish.', type: '', relId: '', result: '', authorId: 'a1', category: 'Teknik Analiz', sourceKind: 'mentorship-magazine', sourceThread: 977, sourceMessageId: 946, publishedAt: now, images: ['/api/tg?magPhoto=tech_chart_file_id_456'], photoIds: ['tech_chart_file_id_456'] },
        { id: 'n2', title: 'Makro Analiz', body: 'DXY ve altın tarafında risk iştahı zayıf.', type: '', relId: '', result: '', authorId: 'a1', category: 'Haber', sourceKind: 'mentorship-magazine', sourceThread: 977, sourceMessageId: 945, publishedAt: earlier, images: ['/api/tg?magPhoto=news_photo_file_id_123'], photoIds: ['news_photo_file_id_123'] },
      ],
    } } });
  });
  await page.route('**/api/tg?magPhoto=**', route => route.fulfill({
    contentType: 'image/png',
    body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF1sAAAAASUVORK5CYII=', 'base64'),
  }));
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
    // Admin chrome hides the public Edu nav item; its handler still has to
    // navigate, so exercise it directly instead of fighting the CSS.
    if (access.admin) await page.evaluate(() => document.getElementById('tab-eduplans').click());
    else await page.locator('#tab-eduplans').click();
    await page.waitForFunction(() => document.body.dataset.page === 'eduplans');
    await page.evaluate(() => showPage('home'));

    const card = page.locator('#home-magazine-link');
    assert.equal(await card.isVisible(), true, label + ' home magazine card');
    const videoTop = await page.locator('#home-member-video').evaluate(n => n.getBoundingClientRect().top).catch(() => -1);
    const cardTop = await card.evaluate(n => n.getBoundingClientRect().top);
    assert.ok(cardTop >= videoTop, label + ' card is below the video');

    const reader = page.locator('#home-mag-reader');
    assert.equal(await reader.isVisible(), true, label + ' embedded flipbook visible');
    await page.locator('#hmr-stage .mag-page').first().waitFor();
    const embedded = await page.evaluate(() => {
      const s = document.getElementById('hmr-stage');
      return {
        pages: s.querySelectorAll('.mag-page').length,
        cover: s.querySelectorAll('.mag-cover3').length,
        toc: s.querySelectorAll('.mag-toc3').length,
        entries: s.querySelectorAll('.mag-entry').length,
        titles: [...s.querySelectorAll('.e-title')].map(n => n.textContent.trim()),
        body: s.querySelector('.e-body')?.textContent || '',
        week: document.getElementById('hmr-week')?.textContent || '',
        dots: document.querySelectorAll('#hmr-dots .mag-dot2').length,
        counter: document.getElementById('hmr-counter')?.textContent || '',
        tools: !!document.querySelector('#home-mag-reader #mag-tools'),
        editors: document.querySelectorAll('#hmr-stage input, #hmr-stage textarea').length,
        cards: document.querySelectorAll('#hmr-stage .hmr-card').length,
        readerLabel: document.getElementById('home-mag-reader')?.getAttribute('aria-label') || '',
        tocItems: [...s.querySelectorAll('.toc-item .tt')].map(n => n.childNodes[0]?.textContent?.trim() || n.textContent.trim()),
        editToggleVisible: (() => { const b = document.getElementById('hmr-edit-toggle'); return !!b && !b.hidden && getComputedStyle(b).display !== 'none'; })(),
      };
    });
    assert.equal(embedded.pages, 9, label + ' home magazine has cover + toc + 6 sections + outro');
    assert.equal(embedded.cover, 1, label + ' embedded cover page');
    assert.equal(embedded.toc, 1, label + ' embedded table of contents');
    assert.equal(embedded.entries, 6, label + ' 6 section pages');
    assert.ok(embedded.titles.length >= 6, label + ' section titles present');
    assert.match(embedded.week, /^Haftalık · /, label + ' embedded week label');
    assert.equal(embedded.dots, embedded.pages, label + ' one dot per flipbook page');
    assert.match(embedded.counter, new RegExp('^1 / ' + embedded.pages + '$'), label + ' embedded page counter');
    assert.equal(embedded.tools, false, label + ' embedded flipbook has no editor toolbar');
    assert.equal(embedded.editors, 0, label + ' no editor fields by default');
    assert.equal(embedded.cards, 0, label + ' no preview-like card strip');
    assert.match(embedded.readerLabel, /dergi/i, label + ' magazine label');
    const expectedToc = ['Makro analiz', 'Bitcoin, High Time Frame bias', 'Altcoinler, High Time Frame bias', 'Gold, High Time Frame bias', 'Forex piyasaları', 'Alfa Edu eğitim içerikleri'];
    expectedToc.forEach(name => assert.ok(embedded.tocItems.some(t => t.includes(name)), label + ' toc has ' + name));
    assert.equal(embedded.editToggleVisible, access.admin === true, label + ' admin edit toggle visibility');
    await page.locator('#hmr-next').click();
    await page.waitForFunction(() => document.getElementById('hmr-counter').textContent.startsWith('2 /'), null, { timeout: 4000 });
    assert.equal(await page.locator('#hmr-stage .mag-page.turned').count(), 1, label + ' page turn applied');
    assert.equal(await page.locator('#hmr-dots .mag-dot2.on').count(), 1, label + ' one active dot');

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
      cats: [...document.querySelectorAll('#mag-stage .e-cat')].map(n => n.textContent),
      adminCatSelects: document.querySelectorAll('#mag-stage select.e-cat-in').length,
      previewSelects: document.querySelectorAll('#home-mag-reader select.e-cat-in').length,
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
      assert.match(weekly.meta, /^Haftalık · \d{1,2} \w+/, label + ' fixture weekly label follows the current week');
      assert.doesNotMatch(weekly.meta, /1 Kasım/, label + ' stale seed week never leaks');
    }
    assert.equal(weekly.toolsVisible, access.admin === true, label + ' editor tools');
    assert.equal(weekly.previewSelects, 0, label + ' embedded reader never exposes category picker');
    assert.equal(weekly.stagePages, 9, label + ' section-based flipbook pages');

    // The weekly card sits under the sticky navbar at this scroll position;
    // trigger its own handler rather than testing navbar hit-testing here.
    await page.evaluate(() => document.querySelector('#news-weekly-list .nw-open').click());
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
