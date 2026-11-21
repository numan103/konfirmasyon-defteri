import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../assets/my-portfolio.css', import.meta.url), 'utf8');
const mod = fs.readFileSync(new URL('../assets/my-portfolio.mjs', import.meta.url), 'utf8');

test('portföy yönetimi Alfa Portföy / Portföyüm sekmeleriyle açılır', () => {
  assert.ok(html.includes('/assets/my-portfolio.css?v=1'));
  assert.ok(html.includes('/assets/my-portfolio.mjs?v=1'));
  assert.ok(html.includes('id="ap2-tab-alpha"') && html.includes('>Alfa Portföy</button>'));
  assert.ok(html.includes('id="ap2-tab-mine"') && html.includes('>Portföyüm</button>'));
  assert.ok(html.includes('aria-controls="ap2-panel-alpha"'));
  assert.ok(html.includes('aria-controls="ap2-panel-mine"'));
  assert.ok(html.includes('id="ap2-panel-alpha" role="tabpanel"'));
  assert.ok(html.includes('id="ap2-panel-mine" class="hidden" role="tabpanel"'));
  assert.match(css, /\.ap2-tabs button\.on/);
  assert.match(mod, /function activate\(which\)/);
  assert.ok(html.includes('id="tab-portfoy-alpha"') && html.includes('>↳ Alfa Portföy</a>'));
  assert.ok(html.includes('id="tab-portfoy-mine"') && html.includes('>↳ Portföyüm</a>'));
  assert.ok(html.includes('id="mnav-portfoy-alpha"') && html.includes('id="mnav-portfoy-mine"'));
  assert.match(html, /portfoyTab=mine/);
});

test('portföyüm yalnızca oturum sahibinin cihazında, sunucuya yazmadan saklanır', () => {
  assert.match(mod, /return AUTH\.user\?\.id \|\| ''/);
  assert.match(mod, /'alfa_my_portfolio_' \+ uid/);
  assert.match(mod, /localStorage\.setItem\(storageKey\(\), JSON\.stringify\(data\)\)/);
  assert.equal(mod.includes('/api/edu-shared'), false, 'kişisel portföy sunucu API çağrısı yapmaz');
  assert.equal(mod.includes('siteFetch'), false);
  assert.equal(mod.includes('alfa_portfoy_public'), false, 'paylaşılan kayda yazmaz');
  assert.match(html, /başka üyeler göremez/);
  assert.equal(html.includes('data-mp-edit') && html.includes('data-mp-del'), false, 'mp listesi ap2 editörünü kullanmaz');
  assert.match(mod, /dataset\.mpEdit|dataset\.mpDel/);
});

test('giriş yapmayan üye kişisel portföy formunu kullanamaz', () => {
  assert.ok(html.includes('id="mp-login"'));
  assert.match(mod, /if \(!uid\) return;[\s\S]*openForm/);
  assert.match(mod, /login\.classList\.toggle\('hidden', !!uid\)/);
  assert.match(mod, /if \(!uid\) \{ err\.textContent|if \(!uid\) return;/);
});
