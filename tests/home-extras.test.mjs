import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('ayna ve uyap üst menüden kaldırılıp Ek kartlarına taşınır', () => {
  assert.ok(!html.includes('id="tab-ayna"'), 'ayna üst menüde kalmamalı');
  assert.ok(!html.includes('id="tab-uyap"'), 'uyap üst menüde kalmamalı');
  assert.ok(!html.includes('id="mnav-ayna"'), 'ayna mobil menüde kalmamalı');
  assert.ok(!html.includes('id="mnav-uyap"'), 'uyap mobil menüde kalmamalı');
  assert.match(html, /\{\s*icon: '📓', page: 'ayna'/);
  assert.match(html, /\{\s*icon: '🏠', page: 'uyap'/);
});

test('Ek masaüstü ve mobil menüde sondadır', () => {
  const nav = html.slice(html.indexOf('<nav class="navbar"'), html.indexOf('</nav>', html.indexOf('<nav class="navbar"')));
  const mnavStart = html.indexOf('data-mnav="home"');
  const mnav = html.slice(mnavStart, html.indexOf('data-mnav="ek"', mnavStart));
  const navLinks = [...nav.matchAll(/class="nav-link[^"]*"[^>]*id="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(navLinks.at(-1), 'tab-ek');
  assert.ok(navLinks.indexOf('tab-ek') > navLinks.indexOf('tab-analitik'));
  assert.ok(!nav.includes('tab-ayna') && !nav.includes('tab-uyap'));
  assert.ok(mnav.includes('data-mnav="analitik"'));
  assert.ok(!mnav.includes('data-mnav="ayna"') && !mnav.includes('data-mnav="uyap"'));
});

test('ana sayfa odak, rehber ve dergi kontrolleri mevcuttur', () => {
  for (const id of ['home-focus', 'hf-date', 'hf-sub', 'hf-news', 'hf-note', 'hf-cta', 'home-guide', 'hg-count', 'hg-fill', 'hg-steps', 'hmr-collapse', 'home-top']) {
    assert.ok(html.includes(`id="${id}"`), `${id} eksik`);
  }
  for (const key of ['home.focus.sub', 'home.guide.title', 'home.mag.less', 'home.mag.more']) {
    assert.ok(html.includes(`'${key}':`), `${key} çevirisi eksik`);
  }
  assert.match(html, /function homeFocusRender\(\)/);
  assert.match(html, /function initHomeExtras\(\)/);
  assert.match(html, /if \(it\.auth\) \{ if \(typeof openAuth === 'function'\) openAuth\('login'\); return; \}/);
});
