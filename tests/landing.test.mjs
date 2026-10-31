import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const landing = html.slice(html.indexOf('<div id="landing">'), html.indexOf('<div id="auth-gate">'));

test('landing excludes sample performance, social invitations and admin-only benefits', () => {
  for (const text of ['lp-hero-shot', 'hseq-svg', '+52.4R', 'lp-comm-tg', 'Bir fikrin mi var', 'Kişisel Günlük Asistan', 'AlfaNews', 'Check List']) {
    assert.ok(!landing.includes(text), text);
  }
});

test('landing keeps registration hooks and accurate premium descriptions', () => {
  for (const id of ['nav-login', 'hero-register', 'hero-login', 'cta-register']) {
    assert.ok(landing.includes(`id="${id}"`), id);
  }
  assert.equal((landing.match(/<article class="lp-card">/g) || []).length, 6);
  assert.ok(landing.includes('salt okunur'));
  assert.ok(landing.includes('referans doğrulamasıyla'));
  assert.ok(landing.includes('komisyon kazanabiliriz'));
  assert.ok(landing.includes('Geçmiş sonuçlar gelecekteki getiriyi garanti etmez'));
});

test('product tabs support click and arrow keys without autoplay', () => {
  const panels = new Map();
  const tabs = ['analysis', 'portfolio', 'education'].map((name) => {
    const handlers = {};
    const attrs = { 'aria-controls': `lp-demo-${name}` };
    panels.set(attrs['aria-controls'], { hidden: name !== 'analysis' });
    return {
      handlers, attrs, tabIndex: name === 'analysis' ? 0 : -1,
      addEventListener: (name, handler) => { handlers[name] = handler; },
      getAttribute: (name) => attrs[name],
      setAttribute: (name, value) => { attrs[name] = value; },
      focus() { this.focused = true; },
    };
  });
  const source = [...landing.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    .map((match) => match[1]).find((script) => script.includes('[data-lp-tab]'));
  assert.ok(source);
  vm.runInNewContext(source, {
    document: { getElementById: (id) => id === 'landing' ? { querySelectorAll: () => tabs } : panels.get(id) },
    window: {},
  });
  tabs[1].handlers.click();
  assert.equal(panels.get('lp-demo-portfolio').hidden, false);
  assert.equal(panels.get('lp-demo-analysis').hidden, true);
  tabs[1].handlers.keydown({ key: 'ArrowRight', preventDefault() {} });
  assert.equal(tabs[2].attrs['aria-selected'], 'true');
  assert.equal(tabs[2].focused, true);
  assert.equal(tabs[1].tabIndex, -1);
  assert.ok(html.includes('prefers-reduced-motion: reduce'));
  assert.ok(fs.existsSync(new URL('../assets/landing-workspace.svg', import.meta.url)));
});

test('editorial photos are local, lazy loaded and have alternative text', () => {
  const photos = [...landing.matchAll(/<img src="(\/assets\/landing-[^"]+-photo\.jpg)"[^>]+>/g)];
  assert.equal(photos.length, 3);
  for (const [tag, src] of photos) {
    assert.match(tag, /loading="lazy"/);
    assert.match(tag, /alt="[^"]+"/);
    assert.match(tag, /width="\d+" height="\d+"/);
    const bytes = fs.readFileSync(new URL(`..${src}`, import.meta.url));
    assert.equal(bytes[0], 0xff);
    assert.equal(bytes[1], 0xd8);
    assert.ok(bytes.length < 300000, `${src} should stay lightweight`);
  }
  for (const target of ['lp-showcase', 'lp-features-title', 'lp-access-title']) {
    assert.ok(landing.includes(`href="#${target}"`));
    assert.ok(landing.includes(`id="${target}"`));
  }
});
