import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('site shows a YENİ badge at the top-left on landing and app header', () => {
  const landing = html.slice(html.indexOf('<div id="landing">'), html.indexOf('<div id="auth-gate">'));
  const badges = landing.match(/class="new-badge"/g) || [];
  assert.equal(badges.length, 1, 'landing markasında bir YENİ rozeti olmalı');
  assert.ok(/<h1>Alfa Traders <i class="new-badge"[^>]*>YENİ<\/i><\/h1>/.test(landing), 'rozet başlığın yanında olmalı');

  const appNav = html.slice(html.indexOf('<nav class="navbar">'), html.indexOf('<div class="nav-mobile-backdrop"'));
  assert.match(appNav, /<span>Alfa Traders<\/span>\s*<i class="new-badge"[^>]*>YENİ<\/i>/, 'uygulama menüsünde rozet olmalı');

  const mobile = html.slice(html.indexOf('<div class="nav-mobile"'), html.indexOf('<div class="nav-mobile-body">'));
  assert.match(mobile, /<span>Alfa Traders<\/span><i class="new-badge"[^>]*>YENİ<\/i>/, 'mobil menüde rozet olmalı');

  assert.match(html, /\.new-badge\s*\{/, 'rozet stili tanımlı olmalı');
  assert.match(html, /'ui\.new':\s*\{\s*tr:\s*'YENİ',\s*en:\s*'NEW'\s*\}/);
  assert.match(html, /'ui\.newTitle':/);
  assert.ok(html.includes('prefers-reduced-motion: reduce') && html.includes('animation: none'), 'hareket azaltma desteği olmalı');
});
