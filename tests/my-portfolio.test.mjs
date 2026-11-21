import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../assets/my-portfolio.css', import.meta.url), 'utf8');
const mod = fs.readFileSync(new URL('../assets/my-portfolio.mjs', import.meta.url), 'utf8');

test('portföy menüsü Trader gibi dropdown, içerik Alfa Portföy / Portföyüm sekmeleri', () => {
  assert.ok(html.includes('/assets/my-portfolio.css?v=5'));
  assert.ok(html.includes('/assets/my-portfolio.mjs?v=4'));
  assert.ok(html.includes('id="navdrop-portfoy"') && html.includes('class="nav-link drop-btn" id="tab-portfoy"'));
  assert.ok(html.includes('class="drop-menu"'));
  assert.ok(html.includes('id="tab-portfoy-alpha"') && html.includes('📊 Alfa Portföy</a>'));
  assert.ok(html.includes('id="tab-portfoy-mine"') && html.includes('💼 Portföyüm</a>'));
  assert.ok(html.includes('id="mnav-portfoy"') && html.includes('class="mnav-link sub"'));
  assert.ok(html.includes('id="mnav-portfoy-alpha"') && html.includes('id="mnav-portfoy-mine"'));
  assert.ok(html.includes('id="ap2-tab-alpha"') && html.includes('id="ap2-tab-mine"'));
  assert.ok(html.includes('aria-controls="ap2-panel-alpha"'));
  assert.ok(html.includes('aria-controls="ap2-panel-mine"'));
  assert.ok(html.includes('id="ap2-panel-alpha" role="tabpanel"'));
  assert.ok(html.includes('id="ap2-panel-mine" class="hidden" role="tabpanel"'));
  assert.match(css, /\.ap2-tabs button\.on/);
  assert.match(mod, /function activate\(which\)/);
  assert.match(html, /portfoyTab=mine/);
});

test('Portföyüm Alfa Portföy kopyası: özet, büyüme, dağılım, hedge, işlem ve fikir panelleri', () => {
  for (const id of ['mp-select', 'mp-new', 'mp-rename', 'mp-delete', 'mp-search', 'mp-settings',
    'mp-summary-area', 'mp-growth', 'mp-hedge-strip', 'mp-grid', 'mp-donut-svg', 'mp-chart-svg',
    'mp-idea-list', 'mp-trades', 'mp-monthly', 'mp-settings-panel', 'mp-sell-form', 'mp-idea-form']) {
    assert.ok(html.includes('id="' + id + '"'), id + ' eksik');
  }
  assert.match(html, /adını sen koy/);
  assert.match(css, /\.mp-portfolio-bar/);
  assert.match(mod, /function newPortfolio\(/);
  assert.match(mod, /function renderDonut\(/);
  assert.match(mod, /function renderHedge\(/);
  assert.match(mod, /function renderTrades\(/);
});

test('çoklu portföy hesaba özel, yalnızca bu cihazda ve sunucuya yazmadan saklanır', () => {
  assert.match(mod, /const indexKey = \(\) => 'alfa_my_portfolios_' \+ uid\(\)/);
  assert.match(mod, /const legacyKey = \(\) => 'alfa_my_portfolio_' \+ uid\(\)/);
  assert.match(mod, /localStorage\.setItem\(indexKey\(\), JSON\.stringify\(state\)\)/);
  assert.match(mod, /alfa_my_portfolio_' \+ uid\(\)/, 'eski kayıt otomatik taşınır');
  assert.equal(mod.includes('/api/edu-shared'), false, 'kişisel portföy sunucu API çağrısı yapmaz');
  assert.equal(mod.includes('siteFetch'), false);
  assert.equal(/['"]alfa_portfoy_public['"]/.test(mod), false, 'paylaşılan kayda yazmaz');
  assert.match(html, /veriler sadece bu cihazda/);
});

test('giriş yapmayan üye kişisel portföy formunu kullanamaz', () => {
  assert.ok(html.includes('id="mp-login"'));
  assert.match(mod, /if \(!uid\(\)\) return \{ active: '', items: \{\} \};/);
  assert.match(mod, /if \(!uid\(\)\) return;/);
  assert.match(mod, /classList\.toggle\('hidden', signed\)/);
});

test('premium kilidi yalnızca Alfa Portföy panelini etkiler, hesaba özel Portföyümü değil', () => {
  // ap2ShowGate artık ilk .ap2-layout / .ap2-hd-actions yerine alpha panelini hedefliyor.
  const gate = html.slice(html.indexOf('function ap2ShowGate()'), html.indexOf('function ap2RenderPublicTeaser()'));
  assert.match(gate, /getElementById\('ap2-panel-alpha'\)/, 'gate alpha paneline scoped olmalı');
  assert.doesNotMatch(gate, /querySelector\('#page-portfoy \.ap2-layout'\)/);
  assert.doesNotMatch(gate, /querySelector\('#page-portfoy \.ap2-hd-actions'\)/);

  // Girişli üye Portföyüm sekmesindeyse renderAlfaPortfoy2 premium gate'i atlar.
  const render = html.slice(html.indexOf('function renderAlfaPortfoy2()'), html.indexOf('function renderAlfaPortfoy2()') + 900);
  assert.match(render, /ap2-tab-mine.*classList\.contains\('on'\)/);
  assert.match(render, /AUTH\.user && AUTH\.user\.id/);
  assert.match(render, /classList\.remove\('ap2-viewer'\)/);

  // Sekme değişince kişisel panelin gizlenmiş stilleri temizlenir.
  assert.match(mod, /const layout = \$\('mp-layout'\); if \(layout\) layout\.style\.display = ''/);
  assert.match(mod, /window\.renderAlfaPortfoy2\(\)/);
});

test('Portföyüm kripto pozisyonları canlı fiyatlıyor (yeni API yok, yerel kayda yazmaz)', () => {
  assert.ok(html.includes('id="mp-price-refresh"'));
  assert.ok(html.includes('id="mp-price-status"'));
  assert.ok(html.includes('data-state="idle"'));
  assert.match(mod, /kripto fiyatları canlı/);
  assert.match(css, /\.mp-price-status\[data-state="live"\]/);

  const body = mod.slice(mod.indexOf('async function refreshPrices(force)'), mod.indexOf('\nfunction panelVisible()'));
  assert.match(body, /function refreshPrices\(force\)/);
  assert.match(body, /api\.binance\.com\/api\/v3\/ticker\/24hr/);
  assert.match(body, /www\.okx\.com\/api\/v5\/market\/tickers/);
  assert.match(body, /api\.coingecko\.com\/api\/v3\/simple\/price/);
  assert.equal(/['"]\/api\//.test(body), false, 'sunucu endpoint\'i yok');
  assert.doesNotMatch(body, /\bsave\(\)|\bmutate\(|localStorage\.setItem/, 'canlı fiyat kalıcı veriye yazılmaz');
  assert.match(body, /if \(active\(\) !== p\) return;/, 'portföy değişirse eski fiyat uygulanmaz');
  assert.match(body, /priceTick = Date\.now\(\);/);
  assert.match(body, /● CANLI/);

  assert.match(mod, /setInterval\(maybeRefresh, PRICE_TTL\)/);
  assert.match(mod, /refreshPrices\(true\);\n  \} else if/);
  assert.match(mod, /window\.AlfaMyPortfolio = \{ activate, refresh: render, markActive, refreshPrices, normSym \}/);
  assert.match(mod, /function normSym\(s\)/);
  assert.match(mod, /v\.endsWith\('USDT'\)/, 'BTC/USDT ve BTCUSDT aynı sembol');
});

test('yeni enstrüman paneli adım adım, site buton/renk diliyle düzenli', () => {
  for (const id of ['ap2-form', 'mp-form']) {
    const start = html.indexOf('id="' + id + '"');
    assert.ok(start >= 0, id + ' eksik');
    const form = html.slice(start, start + 6500);
    assert.match(form, /pf-entry-form/, id + ' yeni form stili');
    assert.match(form, /pf-form-title[\s\S]*pf-form-icon/, id + ' başlık ikonu');
    assert.match(form, /class="pf-form-close"/, id + ' küçük kapatma butonu');
    for (const step of ['Enstrüman', 'Pozisyon', 'Fiyat & Not']) {
      assert.ok(form.includes('>' + step + '<'), id + ' adım: ' + step);
    }
    assert.match(form, /pf-step-no">1/, id + ' 1. adım');
    assert.match(form, /pf-step-no">2/, id + ' 2. adım');
    assert.match(form, /pf-step-no">3/, id + ' 3. adım');
    assert.match(form, /pf-form-actions/, id + ' buton grubu');
    assert.match(form, /pf-preview/, id + ' özet kutusu');
  }
  assert.match(css, /#page-portfoy \.strat-form-head \{ display:flex/);
  assert.match(css, /\.pf-field input:focus \{ outline:none; border-color:var\(--pc\)/);
  assert.match(css, /\.pf-form-actions \.btn \{ flex:0 0 132px/);
  assert.match(css, /\.pf-form-actions \.btn\.solid \{ flex:1 1 auto/);
  assert.match(css, /@media \(max-width:560px\)[\s\S]*\.pf-grid \{ grid-template-columns:1fr/);
  assert.match(css, /html\[data-theme="light"\] #page-portfoy \.pf-entry-form \{ --pc: var\(--acc\)/);
  assert.match(css, /\.pf-step-no \{[\s\S]*color:var\(--pc-text,var\(--pc\)\)/);

  const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  assert.match(sw, /const CACHE = 'alfa-v\d+-/);
  assert.match(sw, /const BUILD_ID = 'b\d+-/);
});
