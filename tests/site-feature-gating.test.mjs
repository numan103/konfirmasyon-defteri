import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const tierUi = html.slice(html.indexOf('function applyTierUi()'), html.indexOf('function accessErrText('));
const hidden = el => /style="display:\s*none"/.test(el);

test('trading terminal and Alfa Charts are admin-only page tiers', () => {
  const tiers = html.slice(html.indexOf('const PAGE_TIER = {'), html.indexOf('// Referans linkleri'));
  assert.match(tiers, /trading:\s*'admin'/);
  assert.match(tiers, /alfacharts:\s*'admin'/);
});

test('nav links carry ids that applyTierUi can gate', () => {
  assert.match(html, /href="\?page=trading"[^>]*id="tab-trading"[^>]*data-nav/);
  assert.match(html, /href="\?page=trading"[^>]*id="mnav-trading"[^>]*data-mnav="trading"/);
  assert.match(html, /href="\/alfa-charts\.html"[^>]*id="tab-alfacharts"[^>]*data-i18n="tv\.alfaCharts"/);
  assert.match(html, /href="\/alfa-charts\.html"[^>]*class="mnav-link"[^>]*data-mnav="alfacharts"[^>]*id="mnav-alfacharts"/);
});

test('all admin-only links are hidden in markup until JS reveals them', () => {
  const ids = ['tab-trading', 'mnav-trading', 'tab-alfacharts', 'mnav-alfacharts'];
  for (const id of ids) {
    const tag = html.match(new RegExp('<a[^>]*id="' + id + '"[^>]*>'));
    assert.ok(tag, 'missing link: ' + id);
    assert.ok(hidden(tag[0]), 'link must start hidden: ' + id);
  }
  for (const selector of [
    /<a[^>]*class="tv-term"[^>]*>/,
    /<a href="\?page=trading" data-nav data-admin-only[^>]*>/,
    /<a href="\?page=trading" class="home-card" data-nav data-admin-only[^>]*>/
  ]) {
    const tag = html.match(selector);
    assert.ok(tag, 'missing shortcut: ' + selector);
    assert.ok(hidden(tag[0]), 'shortcut must start hidden: ' + tag[0]);
  }
});

test('home and ticker-bar terminal shortcuts are explicitly admin-only', () => {
  assert.match(html, /class="tv-term"[^>]*data-admin-only/);
  assert.match(html, /<a href="\?page=trading" data-nav data-admin-only[^>]*>📉 Terminal<\/a>/);
  assert.match(html, /<a href="\?page=trading" class="home-card" data-nav data-admin-only[^>]*>/);
  assert.doesNotMatch(html, /href="\?page=trading"[^>]*data-ref-only/);
});

test('applyTierUi hides admin-only shortcuts for non-admin users', () => {
  assert.ok(tierUi.includes("document.querySelectorAll('[data-admin-only]')"));
  assert.ok(tierUi.includes('el.style.display = isAdmin ? \'\' : \'none\''));
});

test('Trader dropdown label uses the same color as other nav links', () => {
  assert.match(html, /\.nav-drop \.drop-btn \{[^}]*color: var\(--text-2\)/);
});

test('direct page access still goes through siteCanOpen', () => {
  const show = html.slice(html.indexOf('function showPage(name, skipAnim)'), html.indexOf('currentPage = name;'));
  assert.ok(show.includes('if (!siteCanOpen(name))'));
  assert.ok(show.includes("name = 'erisim'"));
});

test('Alfa Charts is not added to the Ek add-on grid', () => {
  const ek = html.slice(html.indexOf('function renderEk()'), html.indexOf('function init()'));
  assert.doesNotMatch(ek, /alfa-charts/i);
});
