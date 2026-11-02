import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const tierUi = html.slice(html.indexOf('function applyTierUi()'), html.indexOf('function accessErrText('));

test('mobile navigation gates links without ids through data-mnav', () => {
  assert.ok(tierUi.includes('[data-mnav="' + "' + p + '" + '"]'));
  assert.ok(tierUi.includes("['tab-', 'mnav-']"));
});

test('premium pitch is hidden from premium and admin members', () => {
  assert.ok(tierUi.includes("premiumBand.style.display = (ref || isAdmin) ? 'none' : ''"));
  assert.ok(!tierUi.includes('Moduller - tum avantajlar acik'));
});

test('free members see the shared summary without premium-only detail cards', () => {
  assert.ok(html.includes('id="home-teaser"'));
  assert.ok(html.includes('<a href="?page=butce" class="home-card" data-nav data-ref-only>'));
  assert.ok(html.includes('<a href="?page=butce" data-nav data-ref-only>💰 Gelir/Gider</a>'));
  const gate = html.slice(html.indexOf('function ap2ShowGate()'), html.indexOf('function ap2RenderPublicTeaser()'));
  assert.ok(gate.includes("target.classList.add('ap2-summary-only')"));
  assert.ok(gate.includes('premium erişimini aç'));
});

test('free summary is left aligned and shows the active position count', () => {
  assert.ok(html.includes('.data-empty.ap2-summary-only { text-align: left;'));
  const markup = html.slice(html.indexOf('function ap2SummaryMarkup(d)'), html.indexOf('function ap2ShowGate()'));
  assert.ok(markup.includes("d.count + ' açık pozisyon'"));
});

test('duplicate sell history list is removed; one trade list remains', () => {
  assert.equal((html.match(/id="ap2-trades"/g) || []).length, 1);
  assert.ok(!html.includes('id="ap2-sell-hist"'));
  assert.ok(!html.includes('Satis Gecmisi'));
});

test('mobile tap targets are raised for the small controls', () => {
  const mobile = html.slice(html.indexOf('/* Mobil: dokunma hedefleri'), html.indexOf('</style>'));
  for (const selector of ['#tier-banner-btn', '.navbar .user-badge .logout', '.hd-link', '#acc-link-okx',
    '#ap2-chart-range button', '.bd-qplus', '.pano-tools .pt', '#landing .lp-explore']) {
    assert.ok(mobile.includes(selector), selector);
  }
});

test('negative money, percentage and sell cost regressions stay fixed', () => {
  assert.ok(html.includes("return (v < 0 ? '-$' : '$') + Math.abs(v)"));
  assert.ok(html.includes('cumEl.textContent = pfPct(sum.pnlPct)'));
  assert.ok(!html.includes('ap2Fmt(sl.qty * sl.cost)'));
  assert.ok(html.includes('var invested = ap2SellInvested(sl, pf);'));
  const labels = html.slice(html.indexOf('function renderAlfaPortfoy2()'), html.indexOf('async function ap2LoadPrices()'));
  for (const text of ['Toplam Değer', 'Başlangıç', 'Yatırılan', 'Büyüme', 'Dağılım']) {
    assert.ok(html.includes(text), text);
  }
  for (const text of ['Toplam Deger', 'baslangic', 'Yatirilan', 'Buyume', 'Dagilim', 'Satis Gecmisi']) {
    assert.ok(!html.includes(text), text);
  }
  assert.ok(!labels.includes('Dagilim'));
});

test('English product words avoid Turkish dotted capital I', () => {
  assert.ok(html.includes('<span class="wl-head" lang="en">'));
  assert.ok(html.includes('<div class="tv-notes-head" lang="en">'));
  assert.ok(html.includes('<span lang="en">Coinglass Supercharts'));
});
