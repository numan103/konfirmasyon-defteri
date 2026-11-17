import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const middleware = fs.readFileSync(new URL('../middleware.js', import.meta.url), 'utf8');

test('influencer sayfası herkese açık bir sayfa olarak kayıtlı', () => {
  const tiers = html.slice(html.indexOf('const PAGE_TIER = {'), html.indexOf('// Referans linkleri'));
  assert.match(tiers, /influencer:\s*'free'/);
  assert.match(html, /const pages = \[[^\]]*'influencer'/);
  assert.ok(html.includes('<div id="page-influencer" class="hidden">'));
});

test('influencer masaüstü ve mobil menüde, ayrıca ana sayfa kartında', () => {
  assert.match(html, /href="\?page=influencer" class="nav-link" id="tab-influencer" data-nav/);
  assert.match(html, /data-mnav="influencer" id="mnav-influencer"/);
  assert.match(html, /href="\?page=influencer" class="home-card" data-nav/);
});

test('sayfa açılırken kontrol listesi çizilir', () => {
  assert.match(html, /if \(name === 'influencer'\) renderInfluencer\(\);/);
  assert.match(html, /function renderInfluencer\(\)/);
  assert.match(html, /localStorage\.setItem\(INF_CHECK_KEY, JSON\.stringify\(done\)\)/);
  assert.match(html, /id="inf-bar"/);
  assert.match(html, /id="inf-count"/);
  assert.match(html, /id="inf-reset"/);
});

test('sayfa metinleri Türkçe ve İngilizce sözlükte tanımlı', () => {
  for (const key of [
    'app.influencer', 'pg.influencer.t', 'pg.influencer.s', 'pg.influencer.check',
    'pg.influencer.c1', 'pg.influencer.c8', 'pg.influencer.road',
    'pg.influencer.w4d', 'pg.influencer.metrics', 'pg.influencer.warnp',
  ]) {
    assert.match(html, new RegExp("'" + key.replace(/\./g, '\\.') + "':\\s*\\{\\s*tr:"));
  }
  for (const id of ['inf-checks', 'inf-bar', 'inf-count', 'inf-reset']) {
    assert.ok(html.includes('id="' + id + '"'), 'missing element: ' + id);
  }
});

test('tanıtım videosu ve 3 paket herkese açık, tam içerik kilitli', () => {
  assert.ok(html.includes('id="inf-teaser"'));
  assert.ok(html.includes('id="inf-full" class="hidden"'));
  assert.match(html, /<iframe[^>]+youtube\.com\/embed\//);
  for (const price of ['1.990₺', '3.490₺', '6.990₺']) assert.ok(html.includes(price), 'missing price: ' + price);
  assert.match(html, /pg\.influencer\.p3\.note/);
  assert.match(html, /1000 takipçi/);
  assert.match(html, /90 gün/);
  assert.match(html, /id="inf-code-input"/);
  assert.match(html, /id="inf-code-btn"/);
});

test('kilit admin veya erişim koduyla açılır', () => {
  assert.match(html, /function infUnlocked\(\)/);
  assert.match(html, /siteIsAdmin\(\)/);
  assert.match(html, /localStorage\.getItem\(INF_UNLOCK_KEY\)/);
  assert.match(html, /localStorage\.setItem\(INF_UNLOCK_KEY, '1'\)/);
  assert.match(html, /teaser\.classList\.toggle\('hidden', unlocked\)/);
  assert.match(html, /full\.classList\.toggle\('hidden', !unlocked\)/);
});

test('sosyal önizleme için middleware sayfa başlığı var', () => {
  assert.match(middleware, /influencer:\s*\{\s*title: 'Alfa Traders — Kripto Influencer'/);
});
