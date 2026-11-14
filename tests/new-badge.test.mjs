import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const landing = html.slice(html.indexOf('<div id="landing">'), html.indexOf('<div id="auth-gate">'));
const appNav = html.slice(html.indexOf('<nav class="navbar">'), html.indexOf('<div class="nav-mobile-backdrop"'));
const mobileHead = html.slice(html.indexOf('<div class="nav-mobile-head">'), html.indexOf('<div class="nav-mobile-body">'));
const pano = html.slice(html.indexOf('<div id="page-pano"'), html.indexOf('<div id="page-', html.indexOf('<div id="page-pano"') + 20));

test('YENİ rozeti marka adında değil, yeni özellik girişlerinde gösterilir', () => {
  assert.ok(!landing.includes('new-badge'), 'giriş sayfasında marka yanında rozet olmamalı');
  const navBrand = /<a href="\?page=home" class="nav-brand" id="nav-home"[\s\S]*?<\/a>/.exec(appNav);
  assert.ok(navBrand, 'uygulama markası bulunmalı');
  assert.ok(!navBrand[0].includes('new-badge'), 'uygulama menüsünde marka yanında rozet olmamalı');
  assert.ok(!mobileHead.includes('new-badge'), 'mobil menü başlığında marka yanında rozet olmamalı');
});

test('üç yeni özellik bağlantısı masaüstü, mobil ve hızlı erişimde rozet taşır', () => {
  for (const id of ['tab-defter', 'tab-review', 'tab-pano']) {
    const link = new RegExp('<a [^>]*id="' + id + '"[^>]*>[\\s\\S]*?</a>').exec(html);
    assert.ok(link, id + ' bağlantısı bulunmalı');
    assert.match(link[0], /<span data-i18n="[^"]+">/, id + ' etiketi çevrilebilir span içinde olmalı');
    assert.match(link[0], /class="new-badge"[^>]*>YENİ<\/i>/, id + ' rozet taşımalı');
  }
  for (const id of ['mnav-defter', 'mnav-review', 'mnav-pano']) {
    const link = new RegExp('<a [^>]*id="' + id + '"[^>]*>[\\s\\S]*?</a>').exec(html);
    assert.ok(link, id + ' bağlantısı bulunmalı');
    assert.match(link[0], /<span data-i18n="[^"]+">/, id + ' etiketi çevrilebilir span içinde olmalı');
    assert.match(link[0], /class="new-badge"[^>]*>YENİ<\/i>/, id + ' rozet taşımalı');
  }
  const quick = html.slice(html.indexOf('<div class="home-quick"'), html.indexOf('</div>', html.indexOf('<div class="home-quick"')));
  assert.equal((quick.match(/class="new-badge"/g) || []).length, 3, 'hızlı erişimde üç rozet olmalı');
});

test('yeni özellik sayfa başlıkları ve ek kartları rozet taşır', () => {
  const defter = html.slice(html.indexOf('<div id="page-defter"'), html.indexOf('<div id="page-defter"') + 700);
  assert.match(defter, /eg-brand-name[^>]*>[^<]*<\/span><i class="new-badge"[^>]*>YENİ<\/i>/, 'Check List başlığında rozet olmalı');
  const review = html.slice(html.indexOf('<div id="page-review"'), html.indexOf('<div id="page-review"') + 700);
  assert.match(review, /eg-brand-name[^>]*>[^<]*<\/span><i class="new-badge"[^>]*>YENİ<\/i>/, 'Haftalık Değerlendirme başlığında rozet olmalı');
  assert.match(pano, /<span class="pano-t">[^<]*<\/span>\s*<i class="new-badge"/, 'pano araç çubuğunda rozet olmalı');
  assert.match(html, /c\.page === 'review' \|\| c\.page === 'pano'/, 'ek kartlarında rozet koşulu olmalı');
});

test('rozet stili ve çeviri anahtarları tanımlı', () => {
  assert.match(html, /\.new-badge\s*\{/, 'rozet stili tanımlı olmalı');
  assert.match(html, /'ui\.new':\s*\{\s*tr:\s*'YENİ',\s*en:\s*'NEW'\s*\}/);
  assert.match(html, /'ui\.newTitle':/);
  assert.ok(html.includes('prefers-reduced-motion: reduce') && html.includes('animation: none'), 'hareket azaltma desteği olmalı');
});
