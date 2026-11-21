import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../assets/my-portfolio.css', import.meta.url), 'utf8');
const mod = fs.readFileSync(new URL('../assets/my-portfolio.mjs', import.meta.url), 'utf8');

test('portföy menüsü Trader gibi dropdown, içerik Alfa Portföy / Portföyüm sekmeleri', () => {
  assert.ok(html.includes('/assets/my-portfolio.css?v=2'));
  assert.ok(html.includes('/assets/my-portfolio.mjs?v=2'));
  assert.ok(html.includes('id="navdrop-portfoy"') && html.includes('class="nav-link drop-btn" id="tab-portfoy"'));
  assert.ok(html.includes('class="drop-menu"'));
  assert.ok(html.includes('id="tab-portfoy-alpha"') && html.includes('↳ Alfa Portföy</a>'));
  assert.ok(html.includes('id="tab-portfoy-mine"') && html.includes('↳ Portföyüm</a>'));
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
