import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = rel => fs.readFileSync(new URL('../' + rel, import.meta.url), 'utf8');
const html = read('index.html');
const moduleSrc = read('assets/site-partners.mjs');
const css = read('assets/site-partners.css');
const eduPlans = read('assets/edu-plans.mjs');
const eduCss = read('assets/edu-plans.css');

class FakeNode {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.attributes = {};
    this.className = '';
    this._text = '';
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
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text || this.children.map(c => c.textContent).join(''); }
  set href(v) { this.attributes.href = String(v); }
  get href() { return this.attributes.href; }
  set src(v) { this.attributes.src = String(v); }
  set alt(v) { this.attributes.alt = String(v); }
  set width(v) { this.attributes.width = String(v); }
  set height(v) { this.attributes.height = String(v); }
  set loading(v) { this.attributes.loading = String(v); }
  set target(v) { this.attributes.target = String(v); }
  get target() { return this.attributes.target; }
  set rel(v) { this.attributes.rel = String(v); }
  get rel() { return this.attributes.rel; }
  set type(v) { this.attributes.type = String(v); }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k]; }
  appendChild(node) { node.parentNode = this; this.children.push(node); return node; }
  append(...nodes) { nodes.forEach(node => this.appendChild(node)); }
  querySelector(sel) { return this._find(sel)[0] || null; }
  querySelectorAll(sel) { return this._find(sel); }
  _find(sel) {
    let current = [this];
    for (const part of sel.trim().split(/\s+/)) {
      const match = part.match(/^([a-z]+)?(?:\.([\w-]+))?$/i) || [];
      const out = [];
      for (const root of current) {
        const visit = node => node.children.forEach(child => {
          const tagOk = !match[1] || child.tagName === match[1].toUpperCase();
          const classOk = !match[2] || child.className.split(/\s+/).includes(match[2]);
          if (tagOk && classOk) out.push(child);
          visit(child);
        });
        visit(root);
      }
      current = out;
    }
    return current;
  }
}

function fakeDom() {
  const body = new FakeNode('body');
  const documentElement = new FakeNode('html');
  let langCallback = null;
  const listeners = {};
  class FakeObserver {
    constructor(cb) { langCallback = cb; }
    observe() {}
  }
  global.MutationObserver = FakeObserver;
  global.document = {
    body,
    documentElement,
    createElement: tag => new FakeNode(tag)
  };
  global.window = {
    LANG: 'tr',
    SITE: { links: {} },
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    MutationObserver: FakeObserver
  };
  return {
    body,
    emitAccess: () => (listeners['alfa:site-access'] || []).forEach(fn => fn()),
    emitLang: () => { if (langCallback) langCallback(); }
  };
}

function walk(node, fn) {
  fn(node);
  node.children.forEach(child => walk(child, fn));
}

test('partner şeridi eğitim sayfasından alınıp ortak alt alana bağlandı', () => {
  assert.ok(html.includes('/assets/site-partners.css?v=3'));
  assert.ok(html.includes('/assets/site-partners.mjs?v=2'));
  assert.ok(html.includes('/assets/edu-plans.mjs?v=9'));
  assert.ok(html.includes("new CustomEvent('alfa:site-access')"), 'referans linkleri sunucu ayarından yenilenmeli');
  assert.ok(html.includes('window.SITE = SITE;'), 'modüller sunucu linklerini window.SITE üzerinden okuyabilmeli');
  assert.ok(moduleSrc.includes("okx: 'https://www.okx.com/join/CRYPTOAHMET'"));
  assert.ok(moduleSrc.includes("bybit: 'https://partner.bybit.com/b/cryptoahmet'"));
  assert.ok(css.includes('.site-partners-footer'));
  assert.ok(css.includes('body.landed .site-partners-footer'), 'landing açılırken şerit önce görünmemeli');
  assert.ok(!eduCss.includes('.edu-partners {'), 'partner CSS ortak dosyaya taşınmalı');
  assert.ok(!eduPlans.includes("const partners = el('section', undefined, 'edu-partners')"), 'eğitim sayfası şeridi tekrar üretmemeli');
});

test('ortak şeritteki tüm logolar tıklanabilir, ilk 3 erişilebilir', async () => {
  const dom = fakeDom();
  await import('../assets/site-partners.mjs?partners=' + Date.now());
  const api = global.window.AlfaSitePartners;
  assert.ok(api, 'window.AlfaSitePartners tanımlanmalı');
  const footer = api.node();
  assert.ok(footer && footer.parentNode === dom.body, 'şerit sayfanın en altına eklenmeli');

  const anchors = [];
  walk(footer, node => { if (node.tagName === 'A') anchors.push(node); });
  const expected = [
    ['okx', 'https://www.okx.com/join/CRYPTOAHMET'],
    ['bybit', 'https://partner.bybit.com/b/cryptoahmet'],
    ['breakout', 'https://www.breakoutprop.com/']
  ];
  assert.equal(anchors.length, 12, 'akış kopyaları da gerçek bağlantı olmalı');
  assert.deepEqual(anchors.slice(0, 3).map(a => [a.dataset.partner, a.href]), expected);
  for (const a of anchors) {
    assert.equal(a.target, '_blank');
    assert.equal(a.rel, 'noopener noreferrer');
  }

  const accessible = anchors.filter(a => !a.dataset.clone);
  const clones = anchors.filter(a => a.dataset.clone);
  assert.equal(accessible.length, 3);
  assert.equal(clones.length, 9);
  assert.ok(clones.every(n => n.getAttribute('aria-hidden') === 'true' && n.getAttribute('tabindex') === '-1'));
  for (const [brand, href] of expected) {
    assert.ok(clones.filter(a => a.dataset.partner === brand).every(a => a.href === href));
  }
});

test('sunucudan gelen referans linkleri şeride uygulanır', async () => {
  const dom = fakeDom();
  await import('../assets/site-partners.mjs?links=' + Date.now());
  const api = global.window.AlfaSitePartners;
  const anchors = [];
  walk(api.node(), node => { if (node.tagName === 'A') anchors.push(node); });
  const before = anchors.find(a => a.dataset.partner === 'okx').href;
  assert.equal(before, 'https://www.okx.com/join/CRYPTOAHMET');

  global.window.SITE.links = {
    okx: 'https://www.okx.com/join/MYLINK',
    bybit: 'https://partner.bybit.com/b/mylink'
  };
  dom.emitAccess();

  assert.ok(anchors.filter(a => a.dataset.partner === 'okx').every(a => a.href === 'https://www.okx.com/join/MYLINK'));
  assert.ok(anchors.filter(a => a.dataset.partner === 'bybit').every(a => a.href === 'https://partner.bybit.com/b/mylink'));
  assert.ok(anchors.filter(a => a.dataset.partner === 'breakout').every(a => a.href === 'https://www.breakoutprop.com/'));
  assert.equal(api.links().okx, 'https://www.okx.com/join/MYLINK');
});

test('akış duraklatma düğmesi çalışır, dil değişimi düğümleri korur', async () => {
  const dom = fakeDom();
  await import('../assets/site-partners.mjs?lang=' + Date.now());
  const footer = global.window.AlfaSitePartners.node();
  const section = footer.children[0];
  const pause = section.querySelector('.edu-partners-head button');
  const title = section.querySelector('.edu-partners-head h2');

  pause.onclick();
  assert.equal(section.classList.contains('is-paused'), true);
  assert.equal(pause.getAttribute('aria-pressed'), 'true');
  assert.equal(pause.textContent, 'Akışı sürdür');

  global.window.LANG = 'en';
  dom.emitLang();
  assert.equal(title.textContent, 'Partners');
  assert.equal(pause.textContent, 'Resume animation');
  assert.equal(section.querySelector('.edu-partners-head h2'), title, 'dil değişimi düğümü yeniden yaratmamalı');
  assert.equal(section.querySelector('.edu-partners-head button'), pause);
});
