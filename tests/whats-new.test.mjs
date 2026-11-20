import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../assets/site-new.css', import.meta.url), 'utf8');
const js = fs.readFileSync(new URL('../assets/site-new.mjs', import.meta.url), 'utf8');
const landing = html.slice(html.indexOf('<div id="landing">'), html.indexOf('<div id="auth-gate"'));
const appNav = html.slice(html.indexOf('<nav class="navbar">'), html.indexOf('<div class="nav-mobile-backdrop"'));

function makeEl(id = '') {
  const classes = new Set(['hidden']);
  const handlers = {};
  return {
    id, classes, handlers,
    classList: {
      add: c => classes.add(c),
      remove: c => classes.delete(c),
      contains: c => classes.has(c),
      toggle: (c, force) => force ? classes.add(c) : classes.delete(c),
    },
    addEventListener(type, fn) { (handlers[type] ||= []).push(fn); },
    fire(type, event = {}) { for (const fn of handlers[type] || []) fn(event); },
    setAttribute(key, value) { this.attrs ||= {}; this.attrs[key] = value; },
    focus() { this.focused = true; },
    closest(sel) { return this._closest === sel ? this : null; },
  };
}

function load(seen = false) {
  const store = seen ? { 'alfa-whats-new-seen-v1': '1' } : {};
  const panel = makeEl('whats-new-panel');
  const close = makeEl('wn-close');
  const openCheckin = makeEl('wn-open-checkin');
  const buttons = [makeEl('whats-new-btn'), makeEl('whats-new-btn-app')];
  const docHandlers = {};
  const els = { 'whats-new-panel': panel, 'wn-close': close, 'wn-open-checkin': openCheckin };
  const sandbox = {
    localStorage: {
      getItem: k => store[k] ?? null,
      setItem: (k, v) => { store[k] = String(v); },
    },
    document: {
      getElementById: id => els[id] || null,
      querySelectorAll: sel => sel === '.site-new-chip' ? buttons : [],
      body: { dataset: { page: 'home' } },
      addEventListener(type, fn) { (docHandlers[type] ||= []).push(fn); },
    },
    window: { location: { href: '' }, AlfaMorningCheckin: { maybeShow() { this.opened = true; } } },
    console,
  };
  vm.runInNewContext(js, sandbox);
  return { panel, buttons, close, openCheckin, docHandlers, store, api: sandbox.window.AlfaWhatsNew, win: sandbox.window, doc: sandbox.document };
}

test('Yeni badge sits in both top-right nav clusters without touching brand badges', () => {
  assert.ok(landing.includes('id="whats-new-btn"'), 'landing badge');
  assert.ok(appNav.includes('id="whats-new-btn-app"'), 'app badge');
  assert.ok(!/class="new-badge"/.test(landing), 'must not reuse feature badge class on landing');
  assert.ok(html.includes('id="whats-new-panel"'));
  assert.ok(html.includes('Sabah Kartı') && html.includes('Ayna'));
  assert.ok(html.includes('/assets/site-new.css?v=1') && html.includes('/assets/site-new.mjs?v=1'));
  assert.ok(css.includes('.site-new-chip') && css.includes('.whats-new-panel'));
  assert.ok(/z-index: 700/.test(css), 'panel sits above landing nav but below modals');
});

test('badge opens and closes the update panel and remembers it was seen', () => {
  const app = load();
  assert.equal(app.panel.classes.has('hidden'), true);
  app.buttons[0].fire('click', { stopPropagation() {} });
  assert.equal(app.panel.classes.has('hidden'), false);
  assert.equal(app.buttons[0].attrs['aria-expanded'], 'true');
  assert.equal(app.store['alfa-whats-new-seen-v1'], '1');
  assert.ok(app.buttons.every(b => b.classes.has('seen')));

  app.close.fire('click');
  assert.equal(app.panel.classes.has('hidden'), true);
  app.api.open();
  assert.equal(app.panel.classes.has('hidden'), false);
  for (const fn of app.docHandlers.keydown || []) fn({ key: 'Escape' });
  assert.equal(app.panel.classes.has('hidden'), true);
  assert.equal(app.buttons[0].focused, true);
});

test('seen badge stays subtle and check-in action opens the card on home', () => {
  const seen = load(true);
  assert.ok(seen.buttons.every(b => b.classes.has('seen')));
  seen.api.open();
  seen.openCheckin.fire('click');
  assert.equal(seen.win.AlfaMorningCheckin.opened, true);

  const away = load();
  away.doc.body.dataset.page = 'defter';
  away.api.open();
  away.openCheckin.fire('click');
  assert.equal(away.win.location.href, '?page=home');
});
