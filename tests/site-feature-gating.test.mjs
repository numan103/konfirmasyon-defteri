import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const tierUi = html.slice(html.indexOf('function applyTierUi()'), html.indexOf('function accessErrText('));

test('trading terminal and Alfa Charts default to admin-only page tiers', () => {
  const tiers = html.slice(html.indexOf('const PAGE_TIER = {'), html.indexOf('// Referans linkleri'));
  assert.match(tiers, /trading:\s*'admin'/);
  assert.match(tiers, /alfacharts:\s*'admin'/);
});

test('Alfa Charts keeps admin-gated nav links hidden in markup', () => {
  for (const id of ['tab-alfacharts', 'mnav-alfacharts']) {
    const tag = html.match(new RegExp('<a[^>]*id="' + id + '"[^>]*>'));
    assert.ok(tag, 'missing link: ' + id);
    assert.match(tag[0], /style="display:\s*none"/);
  }
});

test('Trading Terminal is gone from top navigation and home shortcuts', () => {
  assert.ok(!html.includes('id="tab-trading"'));
  assert.ok(!html.includes('id="mnav-trading"'));
  assert.ok(!html.includes('class="tv-term"'));
  assert.ok(!html.includes('href="?page=trading" data-nav data-admin-only'));
  assert.ok(!html.includes('href="?page=trading" class="home-card"'));
  assert.ok(!tierUi.includes('[data-admin-only]'));
});

test('Trading Terminal lives in the admin-only Ek grid', () => {
  const ek = html.slice(html.indexOf('function renderEk()'), html.indexOf('function init()'));
  assert.match(ek, /page: 'trading', title: 'Trading Terminali'/);
  assert.ok(!/alfa-charts/i.test(ek));
});

test('Trader dropdown label uses the same color as other nav links', () => {
  assert.match(html, /\.nav-drop \.drop-btn \{[^}]*color: var\(--text-2\)/);
});

test('direct page access still goes through siteCanOpen', () => {
  const show = html.slice(html.indexOf('function showPage(name, skipAnim)'), html.indexOf('currentPage = name;'));
  assert.ok(show.includes('if (!siteCanOpen(name))'));
  assert.ok(show.includes("name = 'erisim'"));
});
