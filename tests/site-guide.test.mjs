import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = new URL('../', import.meta.url);
const read = rel => fs.readFileSync(new URL(rel, root), 'utf8');

const html = read('index.html');
const moduleSrc = read('assets/site-guide.mjs');
const guideCss = read('assets/site-guide.css');
const sw = read('sw.js');
const pkg = JSON.parse(read('package.json'));

const pageMatches = [...html.matchAll(/const pages = \[([^\]]+)\]/g)];
const pageMatch = pageMatches.find(m => ([...m[1].matchAll(/'([^']+)'/g)].length === 35));
assert.ok(pageMatch, 'showPage 35 sayfa listesi bulunamadı');
const canonicalPages = [...pageMatch[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
assert.equal(canonicalPages.length, 35);

function collectSources(dir) {
  let out = '';
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out += collectSources(full);
    else if (/\.(mjs|js)$/.test(entry.name)) out += fs.readFileSync(full, 'utf8');
  }
  return out;
}
const sourceText = html + collectSources('assets') + collectSources('ayna');

test('eski üst menü turu kaldırıldı, yeni rehber varlıkları bağlandı', () => {
  assert.ok(html.includes('/assets/site-guide.css?v=6'));
  assert.ok(html.includes('/assets/site-guide.mjs?v=7'));
  assert.ok(!html.includes('platform-tour'));
  assert.ok(!html.includes('pt-restart'));
  assert.ok(!html.includes('platform-tour-welcome'));
  assert.ok(!fs.existsSync(new URL('assets/platform-tour.mjs', root)));
  assert.ok(!fs.existsSync(new URL('assets/platform-tour.css', root)));
  assert.ok(!fs.existsSync(new URL('assets/vendor/driver', root)));
  assert.equal(pkg.dependencies['driver.js'], undefined);
  assert.ok(moduleSrc.includes("const STORAGE_KEY = 'alfa.siteGuide.v1'"));
});

test('rehber aç/kapat düğmeleri masaüstü ve mobil menüde', () => {
  for (const id of ['guide-toggle', 'guide-toggle-mobile']) {
    assert.ok(html.includes('id="' + id + '"'), id);
    assert.ok(html.includes('aria-pressed="false"'), id + ' aria-pressed');
  }
  assert.ok(html.includes('class="sg-toggle"'));
  assert.ok(guideCss.includes('#nav-mobile .sg-toggle'));
  assert.ok(guideCss.includes('body.sg-active .navbar'));
  assert.ok(guideCss.includes('@media (max-width: 680px)'));
});

test('35 sayfanın tamamı ayrıntılı tanıtımla tanımlı', () => {
  const pageIds = [...moduleSrc.matchAll(/^  '?([a-z-]+)'?: p\(/gm)].map(m => m[1]);
  assert.deepEqual(pageIds, canonicalPages, 'sayfa kimlikleri showPage sırasıyla aynı olmalı');
  const block = moduleSrc.slice(moduleSrc.indexOf('const PAGES = {'), moduleSrc.indexOf('function readPref()'));
  for (const page of canonicalPages) {
    const token = /^[a-z]+$/.test(page) ? page : "'" + page + "'";
    const at = block.indexOf('  ' + token + ': p(');
    assert.ok(at >= 0, page + ' tanımı eksik');
    const next = block.indexOf('\n  },', at);
    const entry = block.slice(at, next > 0 ? next : undefined);
    assert.ok(entry.includes("'"), page + ' içerik boş');
    const controlCount = (entry.match(/\bc\(/g) || []).length;
    assert.ok(controlCount >= 1, page + ' için buton ipucu yok');
  }
});

test('her sayfa paneli intro, maddeler ve alt not içeriyor', () => {
  // chat-admin anahtarı JavaScript'te tireli olduğu için tırnak içinde yazılır.
  assert.ok(moduleSrc.includes("  'chat-admin': p('Canlı Destek'"));
  assert.ok(!moduleSrc.includes('chat_admin'));
  assert.equal(canonicalPages.length, 35);
  assert.ok(moduleSrc.includes('sg-intro-kicker'));
  assert.ok(moduleSrc.includes('sg-intro-foot'));
  assert.ok(moduleSrc.includes('def.points'));
  assert.ok(moduleSrc.includes('def.foot'));
  assert.ok(moduleSrc.includes('def.controls'));
});

test('tüm buton seçicileri gerçek kaynakta geçiyor', () => {
  const selections = [...moduleSrc.matchAll(/\bc\('([^']+)',\s*'([^']+)'(?:,\s*'(left|right|block)')?\)/g)];
  assert.ok(selections.length > 120, 'beklenenden az ipucu tanımı: ' + selections.length);
  for (const [, selector, tip, side] of selections) {
    assert.ok(tip.length >= 12, selector + ' ipucu çok kısa');
    assert.ok(!side || ['left', 'right', 'block'].includes(side), selector + ' geçersiz yön');
    const tokens = selector.match(/[A-Za-z_][A-Za-z0-9_-]{3,}/g) || [];
    assert.ok(tokens.length, selector + ' ayrıştırılamadı');
    assert.ok(tokens.some(t => sourceText.includes(t)), selector + ' kaynakta yok');
  }
});

test('cache/build kimliği aktif sürüm için güncellendi', () => {
  assert.ok(sw.includes("const CACHE = 'alfa-v152-fib-extension'"));
  assert.ok(sw.includes("const BUILD_ID = 'b213-fib-extension'"));
  assert.ok(!sw.includes('platform-tour'));
});

test('detay kartı verisi 35 sayfayı ve kritik akışları kapsıyor', () => {
  const details = [...moduleSrc.matchAll(/\bd\('([^']+)',\s*'([^']+)'/g)];
  assert.ok(details.length >= 60, 'beklenenden az detay tanımı: ' + details.length);
  for (const selector of [
    '#mc-card', '#hg-steps .hg-step', '#bd-quick-save', '[data-bedit]', '[data-bdel]',
    '#bd-import-commit', '#eduplans-root', '.eduplan[data-plan]',
    '[data-edu-apply][data-edu-route]', '.eduplans-term summary',
    '.edu-card[data-course]', '#d-save', '#btn-logtrade', '#acc-submit',
    '#accountBalance', '#resPipValue', '#mp-delete'
  ]) {
    assert.ok(moduleSrc.includes("d('" + selector + "'"), selector + ' için detay yok');
  }
  assert.ok(guideCss.includes('.sg-detail.is-open'), 'kart açılma durumu stillenmeli');
  assert.ok(guideCss.includes('.sg-detail.is-expanded'), 'uzun bakış detayı stillenmeli');
  assert.ok(guideCss.includes('.sg-detail-pin'), 'sabitleme düğmesi stillenmeli');
  assert.ok(guideCss.includes('bottom: 76px'), 'mobil kart sohbet balonunu kapatmamalı');
  assert.ok(moduleSrc.includes("'role', 'tooltip'"), 'satır ipuçları tooltip rolü almalı');
  assert.ok(moduleSrc.includes("'aria-describedby'"), 'ipuçları hedefe bağlanmalı');
});

/* --- Gerçek modülü minimal DOM stub ile çalıştır --- */
class FakeNode {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.attributes = {};
    this.className = '';
    this._text = '';
    this.listeners = {};
    const classes = new Set();
    this.classList = {
      add: name => classes.add(name),
      remove: name => classes.delete(name),
      contains: name => classes.has(name),
      toggle: (name, force) => {
        const on = force === undefined ? !classes.has(name) : !!force;
        if (on) classes.add(name); else classes.delete(name);
        return on;
      }
    };
  }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k]; }
  removeAttribute(k) { delete this.attributes[k]; }
  appendChild(node) { node.parentNode = this; this.children.push(node); return node; }
  insertBefore(node, ref) {
    node.parentNode = this;
    const i = ref ? this.children.indexOf(ref) : -1;
    if (i >= 0) this.children.splice(i, 0, node); else this.children.push(node);
    return node;
  }
  removeChild(node) {
    const i = this.children.indexOf(node);
    if (i >= 0) this.children.splice(i, 1);
    node.parentNode = null;
    return node;
  }
  get firstChild() { return this.children[0] || null; }
  querySelector(sel) { return this._find(sel)[0] || null; }
  querySelectorAll(sel) { return this._find(sel); }
  _find(sel) {
    const needle = sel.replace(/^\./, '');
    const out = [];
    const walk = parent => {
      for (const child of parent.children) {
        if (String(child.className).split(/\s+/).includes(needle)) out.push(child);
        walk(child);
      }
    };
    walk(this);
    return out;
  }
  closest() { return null; }
  getBoundingClientRect() { return { width: 100, height: 24 }; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text || this.children.map(c => c.textContent).join(''); }
}

function fakeDom() {
  const registry = new Map();
  const body = new FakeNode('body');
  body.dataset.page = 'home';
  const navHomeParent = new FakeNode('nav');
  const navHome = new FakeNode('a');
  navHomeParent.appendChild(navHome);
  const pageHome = new FakeNode('section');
  const pageDefter = new FakeNode('section');
  const toggle = new FakeNode('button');
  const label = new FakeNode('span');
  label.className = 'sg-toggle-label';
  toggle.appendChild(label);
  toggle._find = sel => sel === '.sg-toggle-label' ? [label] : [];
  const mnav = new FakeNode('div');
  const backdrop = new FakeNode('div');
  const menuBtn = new FakeNode('button');
  menuBtn.setAttribute('aria-expanded', 'false');

  registry.set('#nav-home', [navHome]);
  registry.set('.sg-toggle', [toggle]);

  const byId = {
    'page-home': pageHome,
    'page-defter': pageDefter,
    'nav-mobile': mnav,
    'nav-mobile-backdrop': backdrop,
    'nav-mobile-btn': menuBtn
  };
  const document = {
    body,
    createElement: tag => new FakeNode(tag),
    getElementById: id => byId[id] || null,
    querySelectorAll: sel => registry.get(sel) || [],
    addEventListener() {}, removeEventListener() {}
  };
  const store = new Map();
  global.window = {
    location: { search: '' },
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }),
    addEventListener() {}, removeEventListener() {}
  };
  global.document = document;
  global.localStorage = {
    getItem: k => store.has(k) ? store.get(k) : null,
    setItem: (k, v) => store.set(k, String(v))
  };
  return { document, body, navHome, navHomeParent, pageHome, pageDefter, toggle, label, mnav, backdrop, menuBtn, store };
}

test('rehber açılınca panel ve ipuçları eklenir, kapanınca temizlenir', async () => {
  const dom = fakeDom();
  const mod = await import('../assets/site-guide.mjs');
  const api = global.window.AlfaSiteGuide;
  assert.ok(api, 'window.AlfaSiteGuide tanımlanmalı');
  assert.equal(api.isEnabled(), false, 'varsayılan kapalı');
  assert.deepEqual(api.pageIds, canonicalPages);

  api.setEnabled(true);
  assert.equal(api.isEnabled(), true);
  assert.equal(dom.body.classList.contains('sg-active'), true);
  assert.equal(dom.pageHome.children.some(n => n.className === 'sg-intro'), true);
  assert.equal(dom.navHomeParent.children.some(n => n.className === 'sg-tip'), true);
  assert.equal(dom.navHome.dataset.sgTipped, '1');
  assert.equal(dom.store.get('alfa.siteGuide.v1').includes('"enabled":true'), true);

  api.setEnabled(false);
  assert.equal(api.isEnabled(), false);
  assert.equal(dom.body.classList.contains('sg-active'), false);
  assert.equal(dom.pageHome.children.some(n => n.className === 'sg-intro'), false);
  assert.equal(dom.navHomeParent.children.some(n => n.className === 'sg-tip'), false);
  assert.equal(dom.navHome.dataset.sgTipped, undefined);
});

test('düğme tıklaması modu açar ve sayfa değişimi paneli yeniler', async () => {
  const dom = fakeDom();
  // Modül önceki testte önbelleğe alındı; yeni stub'larla yeniden yüklemek
  // için sorgu parametresiyle ayrı bir modül kimliği kullanıyoruz.
  const mod = await import('../assets/site-guide.mjs?fresh=' + Date.now());
  assert.ok(mod, 'modül yüklenmeli');
  const api = global.window.AlfaSiteGuide;
  const click = dom.toggle.listeners.click[0];
  assert.equal(typeof click, 'function');
  click();
  assert.equal(api.isEnabled(), true);
  assert.equal(dom.toggle.getAttribute('aria-pressed'), 'true');
  assert.equal(dom.label.textContent, 'Rehberi kapat');

  dom.body.dataset.page = 'defter';
  api.render();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(api.renderedPage(), 'defter');
  assert.equal(dom.pageDefter.children.some(n => n.className === 'sg-intro'), true);
  const intro = dom.pageDefter.children.find(n => n.className === 'sg-intro');
  assert.equal(intro.textContent.includes('Alfa Check List'), true);
  assert.equal(dom.pageHome.children.some(n => n.className === 'sg-intro'), false);
});

test('mobil menüde rehber açılınca çekmece kapanır', async () => {
  const dom = fakeDom();
  await import('../assets/site-guide.mjs?mnav=' + Date.now());
  const api = global.window.AlfaSiteGuide;
  dom.mnav.classList.add('open');
  dom.backdrop.classList.add('open');
  dom.menuBtn.setAttribute('aria-expanded', 'true');

  api.setEnabled(true);

  assert.equal(dom.mnav.classList.contains('open'), false, 'mobil çekmece açık kalmamalı');
  assert.equal(dom.backdrop.classList.contains('open'), false, 'karartma perdesi açık kalmamalı');
  assert.equal(dom.menuBtn.getAttribute('aria-expanded'), 'false');
});

test('aynı sayfada tekrar render düğümleri yerinden oynatmaz (wheel takılmasın)', async () => {
  const dom = fakeDom();
  await import('../assets/site-guide.mjs?stable=' + Date.now());
  const api = global.window.AlfaSiteGuide;
  api.setEnabled(true);

  const introBefore = dom.pageHome.children.find(n => n.className === 'sg-intro');
  const tipBefore = dom.navHomeParent.children.find(n => n.className === 'sg-tip');
  assert.ok(introBefore, 'tanıtım paneli eklenmeli');
  assert.ok(tipBefore, 'ipucu eklenmeli');

  // Scroll sırasında nav sınıfı değişir ve render tetiklenir; aynı sayfada
  // düğümler korunmalı, yoksa scroll anchoring tekerleği geri çeker.
  dom.body.classList.add('nav-scrolled');
  api.render();
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.equal(dom.pageHome.children.find(n => n.className === 'sg-intro'), introBefore, 'panel aynı düğüm olmalı');
  assert.equal(dom.navHomeParent.children.find(n => n.className === 'sg-tip'), tipBefore, 'ipucu aynı düğüm olmalı');
  assert.equal(dom.navHomeParent.children.filter(n => n.className === 'sg-tip').length, 1, 'ipucu çoğalmamalı');
  assert.equal(api.renderedPage(), 'home');
});

test('görünmeyen butonlar ipucu almaz', async () => {
  const dom = fakeDom();
  await import('../assets/site-guide.mjs?visible=' + Date.now());
  const api = global.window.AlfaSiteGuide;
  const hidden = new FakeNode('button');
  hidden.getBoundingClientRect = () => ({ width: 0, height: 0 });
  assert.equal(api.visibleForTest(hidden), false);
  assert.equal(api.visibleForTest(dom.navHome), true);
});

test('rehber açılınca sağdaki detay kartı sayfayı anlatır', async () => {
  const dom = fakeDom();
  await import('../assets/site-guide.mjs?card=' + Date.now());
  const api = global.window.AlfaSiteGuide;
  api.setEnabled(true);

  const card = api.detailCardForTest();
  assert.ok(card, 'detay kartı oluşturulmalı');
  assert.equal(card.classList.contains('is-open'), true);
  assert.equal(card.getAttribute('role'), 'note');
  assert.equal(card.querySelector('.sg-detail-title').textContent, 'Bu sayfayı nasıl kullanırım?');
  assert.ok(card.querySelector('.sg-detail-steps').children.length >= 1, 'sayfa maddeleri kartta olmalı');
});

test('buton detayı, adımlar, sabitleme ve kapatma çalışıyor', async () => {
  const dom = fakeDom();
  await import('../assets/site-guide.mjs?detail=' + Date.now());
  const api = global.window.AlfaSiteGuide;
  api.setEnabled(true);

  assert.equal(dom.navHome.getAttribute('aria-describedby'), 'sg-tip-1');
  assert.equal(dom.navHome.dataset.sgKey, '#nav-home');

  api.showDetailForTest(dom.navHome, true);
  const card = api.detailCardForTest();
  assert.equal(card.querySelector('.sg-detail-title').textContent, 'Ana menüye dön');
  assert.ok(card.querySelector('.sg-detail-short').textContent.includes('Ana menüye döner'));
  assert.ok(card.querySelector('.sg-detail-steps').children.length >= 2, 'kritik akışta adım olmalı');
  assert.equal(card.classList.contains('is-expanded'), true);

  const pin = card.querySelector('.sg-detail-pin');
  pin.onclick();
  assert.equal(card.classList.contains('is-pinned'), true);
  assert.equal(pin.getAttribute('aria-pressed'), 'true');

  const close = card.querySelector('.sg-detail-close');
  close.onclick();
  assert.equal(card.classList.contains('is-open'), false);

  api.setEnabled(false);
  assert.equal(api.detailCardForTest(), null, 'rehber kapanınca kart DOM’dan kalkmalı');
  assert.equal(dom.navHome.getAttribute('aria-describedby'), undefined);
});
