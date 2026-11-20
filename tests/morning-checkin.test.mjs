import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../assets/morning-checkin.css', import.meta.url), 'utf8');
const js = fs.readFileSync(new URL('../assets/morning-checkin.mjs', import.meta.url), 'utf8');
const KEY = 'alfa-morning-checkin-v1';

function makeEl() {
  const classes = new Set(['hidden']);
  const handlers = {};
  return {
    classes,
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
    },
    handlers,
    addEventListener(type, fn) { (handlers[type] ||= []).push(fn); },
    fire(type, event = {}) { for (const fn of handlers[type] || []) fn(event); },
    focus() { this.focused = true; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    textContent: '',
  };
}

function load(store, page = 'home') {
  const els = Object.fromEntries(
    ['morning-checkin', 'mc-card', 'mc-chip', 'mc-chip-label', 'mc-form', 'mc-close', 'mc-later', 'mc-reset']
      .map((id) => [id, makeEl()])
  );
  const events = [];
  let observerCb = null;
  const checkboxes = [];
  els['mc-form'].querySelectorAll = () => checkboxes.filter((box) => box.checked);
  els['mc-card'].querySelector = (sel) => sel === '.mc-save' ? makeEl() : null;

  const sandbox = {
    localStorage: {
      getItem: (k) => store[k] ?? null,
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    document: {
      body: { dataset: { page } },
      getElementById: (id) => els[id] || null,
      addEventListener(type, fn) { (this.handlers[type] ||= []).push(fn); },
      handlers: {},
      fire(type, event) { for (const fn of this.handlers[type] || []) fn(event); },
    },
    window: {
      dispatchEvent(ev) { events.push(ev); },
    },
    CustomEvent: class { constructor(type, opts) { this.type = type; this.detail = opts?.detail; } },
    MutationObserver: class { constructor(cb) { observerCb = cb; } observe() {} },
    console,
  };
  vm.runInNewContext(js, sandbox);
  return { els, events, checkboxes, observerCb, api: sandbox.window.AlfaMorningCheckin, document: sandbox.document };
}

test('morning check-in markup is local-only and trader-specific', () => {
  const start = html.indexOf('<div id="morning-checkin"');
  const section = html.slice(start, html.indexOf('<script>', start));
  assert.ok(section.includes('id="mc-form"'));
  assert.ok(section.includes('Günaydın kanka'));
  for (const label of [
    'İyi uyudum', 'Yorgun kalktım', 'Kızgınım', 'Kayıp acısı yaşıyorum',
    'Motivasyonum yerinde', 'Kazanç sonrası berrak görüyorum', 'Fırsatı net görüyorum',
  ]) assert.ok(section.includes(label), label);
  assert.equal((section.match(/name="mood"/g) || []).length, 7);
  assert.ok(section.includes('class="mc-save"') && section.includes('Kaydet'));
  for (const id of ['mc-later', 'mc-reset', 'mc-chip', 'mc-close']) {
    assert.ok(section.includes(`id="${id}"`), id);
  }
  assert.ok(html.includes('/assets/morning-checkin.css?v=1'));
  assert.ok(html.includes('/assets/morning-checkin.mjs?v=1'));
  assert.ok(css.includes('#morning-checkin .mc-card'));
  assert.ok(css.includes('max-width: calc(100vw - 32px)'));
  assert.ok(/@media \(max-width: 640px\)/.test(css));
  assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon|action\s*=/.test(js), 'check-in must not send data anywhere');
});

test('card opens once on home and saves mood locally with an event', () => {
  const store = {};
  const app = load(store);
  assert.equal(app.els['morning-checkin'].classes.has('hidden'), false);
  assert.equal(app.els['mc-card'].classes.has('hidden'), false);
  assert.equal(app.els['mc-chip'].classes.has('hidden'), true);

  app.checkboxes.push({ value: 'slept-well', checked: true }, { value: 'angry', checked: false }, { value: 'clear-after-win', checked: true });
  app.els['mc-form'].fire('submit', { preventDefault() {} });

  const record = JSON.parse(store[KEY]);
  assert.equal(record.done, true);
  assert.deepEqual(record.values, ['slept-well', 'clear-after-win']);
  assert.ok(record.date && record.at);
  assert.equal(app.events.length, 1);
  assert.equal(app.events[0].type, 'moodCheckin');
  assert.deepEqual([...app.events[0].detail.values], record.values);
  assert.equal(app.els['mc-card'].classes.has('hidden'), true);
  assert.equal(app.els['mc-chip'].classes.has('hidden'), false);
  assert.match(app.els['mc-chip-label'].textContent, /Ruh hali: 2 tik/);

  const again = load(store);
  assert.equal(again.els['mc-card'].classes.has('hidden'), true, 'saved card must not reappear the same day');
  assert.equal(again.els['mc-chip'].classes.has('hidden'), false);
});

test('later, reset, chip reopen, Escape and stale records behave correctly', () => {
  const store = {};
  const app = load(store);
  app.els['mc-later'].fire('click');
  assert.equal(JSON.parse(store[KEY]).dismissed, true);
  assert.equal(app.els['mc-card'].classes.has('hidden'), true);
  assert.equal(app.els['mc-chip'].classes.has('hidden'), false);

  app.els['mc-chip'].fire('click');
  assert.equal(app.els['mc-card'].classes.has('hidden'), false);
  app.checkboxes.push({ value: 'tired', checked: true });
  app.els['mc-form'].fire('submit', { preventDefault() {} });
  assert.deepEqual(JSON.parse(store[KEY]).values, ['tired']);

  app.els['mc-reset'].fire('click');
  assert.equal(store[KEY], undefined);
  assert.equal(app.els['mc-card'].classes.has('hidden'), false);
  app.els['mc-card'].classList.add('hidden');
  app.els['mc-chip'].classList.add('hidden');
  app.els['mc-form'].fire('submit', { preventDefault() {} });
  app.els['mc-chip'].fire('click');
  assert.equal(app.els['mc-card'].classes.has('hidden'), false);
  app.document.fire('keydown', { key: 'Escape' });
  assert.equal(app.els['mc-card'].classes.has('hidden'), true);
  assert.equal(app.els['mc-chip'].classes.has('hidden'), true);

  store[KEY] = JSON.stringify({ date: '1999-01-01', done: true, values: ['angry'] });
  const stale = load(store);
  assert.equal(stale.els['mc-card'].classes.has('hidden'), false, 'old record should show a fresh card');
});

test('card stays closed outside home and follows data-page changes', () => {
  const store = {};
  const app = load(store, 'defter');
  assert.equal(app.els['morning-checkin'].classes.has('hidden'), true);
  assert.equal(app.els['mc-card'].classes.has('hidden'), true);

  app.document.body.dataset.page = 'home';
  app.observerCb();
  assert.equal(app.els['morning-checkin'].classes.has('hidden'), false);
  assert.equal(app.els['mc-card'].classes.has('hidden'), false);

  app.document.body.dataset.page = 'ayna';
  app.observerCb();
  assert.equal(app.els['morning-checkin'].classes.has('hidden'), true);
});
