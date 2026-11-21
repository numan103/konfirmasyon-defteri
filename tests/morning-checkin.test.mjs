import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../assets/morning-checkin.css', import.meta.url), 'utf8');
const js = fs.readFileSync(new URL('../assets/morning-checkin.mjs', import.meta.url), 'utf8');
const KEY = 'alfa-morning-checkin-v1';
const CFG_KEY = 'alfa-morning-checkin-config-v1';

function makeEl(id = '') {
  const classes = new Set(['hidden']);
  const handlers = {};
  let inner = '';
  return {
    id, classes, handlers, dataset: {}, children: [], value: '', textContent: '', focused: false,
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
      toggle: (c, force) => force ? classes.add(c) : classes.delete(c),
    },
    addEventListener(type, fn) { (handlers[type] ||= []).push(fn); },
    fire(type, event = {}) { for (const fn of handlers[type] || []) fn(event); },
    focus() { this.focused = true; },
    querySelector(sel) { return this._query?.[sel] || null; },
    querySelectorAll(sel) { return this._queryAll?.[sel] || []; },
    appendChild(child) { this.children.push(child); },
    closest(sel) { return this._closest === sel ? this : null; },
    setAttribute(key, value) { this.attrs ||= {}; this.attrs[key] = value; },
    get innerHTML() { return inner; },
    set innerHTML(value) { inner = value; this.children = []; },
  };
}

function load(store, page = 'home') {
  const ids = [
    'morning-checkin', 'mc-card', 'mc-chip', 'mc-chip-label', 'mc-form', 'mc-groups',
    'mc-close', 'mc-later', 'mc-reset', 'mc-edit', 'mc-editor', 'mc-editor-list',
    'mc-editor-hint', 'mc-add-item', 'mc-editor-done', 'mc-config-reset',
  ];
  const els = Object.fromEntries(ids.map(id => [id, makeEl(id)]));
  const events = [];
  let observerCb = null;
  const checkboxes = [];
  els['mc-form'].querySelectorAll = () => checkboxes.filter(box => box.checked);
  els['mc-card'].querySelector = sel => sel === '.mc-save' ? makeEl('save') : null;
  const sandbox = {
    localStorage: {
      getItem: k => store[k] ?? null,
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; },
    },
    document: {
      body: { dataset: { page } },
      getElementById: id => els[id] || null,
      createElement: () => makeEl('row'),
      addEventListener(type, fn) { (this.handlers[type] ||= []).push(fn); },
      handlers: {},
      fire(type, event) { for (const fn of this.handlers[type] || []) fn(event); },
    },
    window: { dispatchEvent(ev) { events.push(ev); } },
    CustomEvent: class { constructor(type, opts) { this.type = type; this.detail = opts?.detail; } },
    MutationObserver: class { constructor(cb) { observerCb = cb; } observe() {} },
    console,
  };
  vm.runInNewContext(js, sandbox);
  return { els, events, checkboxes, observerCb, api: sandbox.window.AlfaMorningCheckin, document: sandbox.document };
}

test('morning check-in markup is local-only and editable by the trader', () => {
  const start = html.indexOf('<div id="morning-checkin"');
  const section = html.slice(start, html.indexOf('<script>', start));
  for (const id of ['mc-groups', 'mc-edit', 'mc-editor', 'mc-editor-list', 'mc-add-item', 'mc-editor-done', 'mc-config-reset', 'mc-chip']) {
    assert.ok(section.includes(`id="${id}"`), id);
  }
  assert.ok(section.includes('class="mc-edit"') && section.includes('Düzenle'));
  assert.ok(html.includes('/assets/morning-checkin.css?v=2'));
  assert.ok(html.includes('/assets/morning-checkin.mjs?v=3'));
  assert.ok(css.includes('.mc-edit-row'));
  assert.ok(css.includes('max-width: calc(100vw - 32px)'));
  assert.ok(/@media \(max-width: 640px\)/.test(css));
  for (const label of ['İyi uyudum', 'Yorgun kalktım', 'Kızgınım', 'Kayıp acısı yaşıyorum', 'Motivasyonum yerinde', 'Kazanç sonrası berrak görüyorum', 'Fırsatı net görüyorum']) {
    assert.ok(js.includes(label), label);
  }
  assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon|action\s*=/.test(js), 'check-in must not send data anywhere');
});

test('default criteria render as grouped chips and can be replaced by the trader', () => {
  const store = {};
  const app = load(store);
  const rendered = app.els['mc-groups'].innerHTML;
  for (const label of ['İyi uyudum', 'Kızgınım', 'Fırsatı net görüyorum']) assert.ok(rendered.includes(label), label);
  for (const group of ['Uyku', 'Duygu', 'Odak']) assert.ok(rendered.includes(`<legend>${group}</legend>`), group);
  assert.equal((rendered.match(/name="mood"/g) || []).length, 7);

  assert.deepEqual([...app.api.getConfig()].map(i => i.label).slice(0, 2), ['İyi uyudum', 'Yorgun kalktım']);
  app.api.setConfig([{ id: 'focus', group: 'Odak', label: 'Bugün odaklıyım' }]);
  assert.deepEqual([...app.api.getConfig()].map(i => i.label), ['Bugün odaklıyım']);
  assert.ok(app.els['mc-groups'].innerHTML.includes('Bugün odaklıyım'));
  assert.ok(!app.els['mc-groups'].innerHTML.includes('Kızgınım'));
  const saved = JSON.parse(store[CFG_KEY]);
  assert.equal(saved.items.length, 1);
  assert.equal(saved.version, 1);

  const reloaded = load(store);
  assert.ok(reloaded.els['mc-groups'].innerHTML.includes('Bugün odaklıyım'));
  assert.ok(!reloaded.els['mc-groups'].innerHTML.includes('İyi uyudum'));
});

test('editor save applies added and removed questions, reset restores defaults', () => {
  const app = load({});
  app.els['mc-edit'].fire('click');
  assert.equal(app.els['mc-editor'].classes.has('hidden'), false);
  assert.equal(app.els['mc-form'].classes.has('hidden'), true);
  assert.ok(app.els['mc-editor-list'].innerHTML.includes('mc-edit-row'));

  const row = (label, group, id = 'custom-1') => ({
    dataset: { index: '0', id },
    querySelector(sel) {
      if (sel === '.mc-edit-label') return { value: label };
      if (sel === '.mc-edit-group') return { value: group };
      return null;
    },
  });
  app.els['mc-editor-list'].querySelectorAll = () => [row('Risk iştahım nasıl?', 'Genel', 'custom-a'), row('Uykum yeterli mi?', 'Uyku', 'custom-b')];
  app.els['mc-editor-done'].fire('click');
  assert.deepEqual([...app.api.getConfig()].map(i => i.label), ['Risk iştahım nasıl?', 'Uykum yeterli mi?']);
  const ids = app.api.getConfig().map(i => i.id);
  assert.equal(new Set(ids).size, ids.length, 'custom questions must get unique ids');
  assert.equal(app.els['mc-editor'].classes.has('hidden'), true);
  assert.equal(app.els['mc-form'].classes.has('hidden'), false);

  app.els['mc-config-reset'].fire('click');
  assert.equal(app.api.getConfig().length, 7);
  assert.ok(app.els['mc-groups'].innerHTML.includes('Fırsatı net görüyorum'));
});

test('saving stores mood values together with their labels for Ayna', () => {
  const store = {};
  const app = load(store);
  app.checkboxes.push(
    { value: 'slept-well', checked: true },
    { value: 'angry', checked: false },
    { value: 'clear-after-win', checked: true },
  );
  app.els['mc-form'].fire('submit', { preventDefault() {} });
  const record = JSON.parse(store[KEY]);
  assert.equal(record.done, true);
  assert.deepEqual(record.values, ['slept-well', 'clear-after-win']);
  assert.deepEqual(record.labels, ['İyi uyudum', 'Kazanç sonrası berrak görüyorum']);
  assert.equal(app.events.length, 1);
  assert.equal(app.events[0].type, 'moodCheckin');
  assert.deepEqual([...app.events[0].detail.labels], record.labels);
  assert.equal(app.els['mc-card'].classes.has('hidden'), true);
  assert.equal(app.els['mc-chip'].classes.has('hidden'), false);
  assert.match(app.els['mc-chip-label'].textContent, /Ruh hali: 2 tik/);

  const again = load(store);
  assert.equal(again.els['mc-card'].classes.has('hidden'), true);
  assert.equal(again.els['mc-chip'].classes.has('hidden'), false);
});

test('later, reset, chip reopen, Escape and stale records behave correctly', () => {
  const store = {};
  const app = load(store);
  app.els['mc-later'].fire('click');
  assert.equal(JSON.parse(store[KEY]).dismissed, true);
  assert.equal(app.els['mc-chip'].classes.has('hidden'), false);
  app.els['mc-chip'].fire('click');
  assert.equal(app.els['mc-card'].classes.has('hidden'), false);

  app.checkboxes.push({ value: 'tired', checked: true });
  app.els['mc-form'].fire('submit', { preventDefault() {} });
  assert.deepEqual(JSON.parse(store[KEY]).values, ['tired']);
  app.els['mc-reset'].fire('click');
  assert.equal(store[KEY], undefined);
  assert.equal(app.els['mc-card'].classes.has('hidden'), false);

  app.els['mc-edit'].fire('click');
  assert.equal(app.els['mc-editor'].classes.has('hidden'), false);
  app.document.fire('keydown', { key: 'Escape' });
  assert.equal(app.els['mc-editor'].classes.has('hidden'), true);
  assert.equal(app.els['mc-card'].classes.has('hidden'), false);
  app.document.fire('keydown', { key: 'Escape' });
  assert.equal(app.els['mc-card'].classes.has('hidden'), true);
  assert.equal(app.els['mc-chip'].classes.has('hidden'), false);

  store[KEY] = JSON.stringify({ date: '1999-01-01', done: true, values: ['angry'] });
  delete store['alfa-morning-checkin-seen-v1'];
  assert.equal(load(store).els['mc-card'].classes.has('hidden'), false);
});

test('shown once per day even without answering; close, reload and navigation leave the manual chip', () => {
  const store = {};
  const first = load(store);
  assert.equal(first.els['mc-card'].classes.has('hidden'), false);
  assert.ok(store['alfa-morning-checkin-seen-v1']);
  first.els['mc-close'].fire('click');
  assert.equal(first.els['mc-chip'].classes.has('hidden'), false);
  const second = load(store);
  assert.equal(second.els['mc-card'].classes.has('hidden'), true);
  second.els['mc-chip'].fire('click');
  assert.equal(second.els['mc-card'].classes.has('hidden'), false);
  second.document.body.dataset.page = 'defter'; second.observerCb();
  second.document.body.dataset.page = 'home'; second.observerCb();
  assert.equal(second.els['mc-card'].classes.has('hidden'), true);
});

test('card stays closed outside home and follows data-page changes', () => {
  const app = load({}, 'defter');
  assert.equal(app.els['morning-checkin'].classes.has('hidden'), true);
  app.document.body.dataset.page = 'home';
  app.observerCb();
  assert.equal(app.els['morning-checkin'].classes.has('hidden'), false);
  assert.equal(app.els['mc-card'].classes.has('hidden'), false);
  app.document.body.dataset.page = 'ayna';
  app.observerCb();
  assert.equal(app.els['morning-checkin'].classes.has('hidden'), true);
});
