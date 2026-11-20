import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/signup-funnel.mjs', import.meta.url), 'utf8');

function harness({ href = 'https://alfa-trader.com/', auth = true, register = true, store = new Map() } = {}) {
  const handlers = [];
  const observers = [];
  const clicks = [];
  const gateClasses = new Set();
  const gate = {
    classList: {
      contains: (name) => gateClasses.has(name),
    },
  };
  let authHandler = null;
  const context = {
    sessionStorage: {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, String(value)),
    },
    document: {
      addEventListener: (name, handler) => { if (name === 'click') handlers.push(handler); },
      getElementById: (id) => (id === 'auth-gate' ? gate : null),
      querySelector: (selector) => (register && selector.includes('#tab-register') ? {} : null),
    },
    window: {
      anaTrack: { clicks, curPage: 'landing' },
      anaFlushSoon: () => {},
    },
    MutationObserver: class {
      constructor(callback) { this.callback = callback; observers.push(this); }
      observe() {}
    },
    location: { href },
    URL,
    URLSearchParams,
    Date,
    JSON,
    Set,
    AUTH: auth ? { client: { auth: { onAuthStateChange: (fn) => { authHandler = fn; } } } } : undefined,
  };
  vm.runInNewContext(source, context);
  const click = (selector) => handlers.forEach((fn) => fn({ target: { closest: (s) => s.includes(selector) ? {} : null } }));
  return {
    clicks,
    click,
    openGate() { gateClasses.add('open'); observers.forEach((o) => o.callback()); },
    signedIn() { authHandler?.('SIGNED_IN'); },
    store,
  };
}

test('kayıt hunisi adımları oturumlar arası sırayla ve bir kez yazar', () => {
  const store = new Map();
  const first = harness({ store });
  first.click('hero-register');
  first.openGate();
  first.click('au-submit');
  assert.deepEqual(first.clicks.map((c) => c.url), [
    'funnel:landing_cta',
    'funnel:auth_open',
    'funnel:signup_submit',
  ]);

  const second = harness({ store, href: 'https://alfa-trader.com/auth/v1/verify?token_hash=abc&type=signup' });
  second.signedIn();
  const all = [...first.clicks, ...second.clicks];
  assert.deepEqual(all.map((c) => c.url), [
    'funnel:landing_cta',
    'funnel:auth_open',
    'funnel:signup_submit',
    'funnel:confirm_click',
    'funnel:first_login',
  ]);
  second.click('hero-register');
  second.signedIn();
  assert.equal(all.length, 5);
  assert.ok(all.every((c) => c.kind === 'cta' && c.page === 'landing'));
  assert.ok(!JSON.stringify(all).includes('token_hash'));
});

test('şifre sıfırlama dönüşü onay sayılmaz ve kayıt yoksa ilk giriş yazılmaz', () => {
  const reset = harness({ href: 'https://alfa-trader.com/auth/v1/verify?token=abc&type=recovery' });
  reset.signedIn();
  assert.equal(reset.clicks.length, 0);

  const plain = harness();
  plain.openGate();
  plain.signedIn();
  assert.deepEqual(plain.clicks.map((c) => c.url), ['funnel:auth_open']);
});

test('oturum adımları kalıcıdır, tekrar yüklenmede çift yazılmaz', () => {
  const store = new Map();
  const first = harness({ store });
  first.click('hero-register');
  assert.equal(first.clicks.length, 1);
  const second = harness({ store });
  second.click('hero-register');
  assert.equal(second.clicks.length, 0);
});

test('funnel module is loaded by the live page', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('/assets/signup-funnel.mjs?v=1'));
});
