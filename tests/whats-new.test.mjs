import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as registry from '../assets/site-features.mjs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../assets/site-new.css', import.meta.url), 'utf8');
const js = fs.readFileSync(new URL('../assets/site-new.mjs', import.meta.url), 'utf8');
const landing = html.slice(html.indexOf('<div id="landing">'), html.indexOf('<div id="auth-gate"'));
const appNav = html.slice(html.indexOf('<nav class="navbar">'), html.indexOf('<div class="nav-mobile-backdrop"'));

function makeEl(id = '') {
  const classes = new Set(['hidden']);
  const handlers = {};
  return {
    id, classes, handlers, attrs: {}, textContent: '', focused: false,
    classList: {
      add: c => classes.add(c),
      remove: c => classes.delete(c),
      contains: c => classes.has(c),
      toggle: (c, force) => force ? classes.add(c) : classes.delete(c),
    },
    addEventListener(type, fn) { (handlers[type] ||= []).push(fn); },
    fire(type, event = {}) { for (const fn of handlers[type] || []) fn(event); },
    setAttribute(key, value) { this.attrs[key] = value; },
    getAttribute(key) { return this.attrs[key] ?? null; },
    get hidden() { return classes.has('__hidden__'); },
    set hidden(v) { v ? classes.add('__hidden__') : classes.delete('__hidden__'); },
    focus() { this.focused = true; },
    closest(sel) { return this._closest === sel ? this : null; },
    querySelector(sel) { return this._query?.[sel] || null; },
    querySelectorAll(sel) { return this._queryAll?.[sel] || []; },
  };
}

function load(options = {}) {
  const {
    seen = null, activeIds = registry.activeIds(), features = registry.FEATURES,
    badges = [], page = 'home', fetchCalls = [],
    syncIds = features.map(f => f.id),
  } = options;
  const store = {};
  if (seen !== null) store['alfa-whats-new-seen-v2'] = JSON.stringify(seen);
  if (syncIds !== null) store['alfa-features-sync-v2'] = JSON.stringify(syncIds);
  const panel = makeEl('whats-new-panel');
  const close = makeEl('wn-close');
  const openCheckin = makeEl('wn-open-checkin');
  const list = makeEl('wn-list');
  const sub = makeEl('wn-sub');
  const counts = [makeEl('count-1'), makeEl('count-2')];
  const buttons = [makeEl('whats-new-btn'), makeEl('whats-new-btn-app')];
  buttons.forEach((b, i) => { b._query = { '.wn-count': counts[i] }; });
  const docHandlers = {};
  const els = {
    'whats-new-panel': panel, 'wn-close': close, 'wn-open-checkin': openCheckin,
    'wn-list': list, 'wn-sub': sub,
  };
  const sf = {
    ...registry,
    FEATURES: features,
    activeIds: () => activeIds,
    activeFeatures: () => features.filter(f => activeIds.includes(f.id)),
  };
  const sandbox = {
    localStorage: {
      getItem: k => store[k] ?? null,
      setItem: (k, v) => { store[k] = String(v); },
    },
    document: {
      getElementById: id => els[id] || null,
      querySelectorAll: sel => sel === '.site-new-chip' ? buttons : (sel === '[data-new-feature]' ? badges : []),
      body: { dataset: { page } },
      addEventListener(type, fn) { (docHandlers[type] ||= []).push(fn); },
    },
    window: {
      location: { href: '' },
      ALFA_SITE_FEATURES: sf,
      AlfaMorningCheckin: { maybeShow() { this.opened = true; } },
    },
    fetch: async (url, opts) => { fetchCalls.push({ url, opts }); return { ok: true }; },
    MutationObserver: class { observe() {} },
    console,
  };
  vm.runInNewContext(js, sandbox);
  return {
    panel, buttons, counts, close, openCheckin, list, sub, badges,
    docHandlers, store, fetchCalls,
    api: sandbox.window.AlfaWhatsNew,
    win: sandbox.window, doc: sandbox.document,
  };
}

test('üst rozet kayıt defterinden beslenir, sabit içerik değildir', () => {
  assert.ok(landing.includes('id="whats-new-btn"'));
  assert.ok(appNav.includes('id="whats-new-btn-app"'));
  assert.ok(!/class="new-badge"/.test(landing));
  assert.ok(html.includes('/assets/site-features.mjs?v=2'));
  assert.ok(html.includes('/assets/site-new.mjs?v=2'));
  assert.ok(html.includes('id="wn-list"') && html.includes('id="wn-sub"'));
  assert.ok(!html.includes('Sabah Kartı</b>'), 'panel sabit satır içermemeli');
  assert.ok(html.includes('<span class="wn-count"></span>'));
  assert.ok(css.includes('.new-badge[hidden]') && css.includes('.site-new-chip[hidden]') && css.includes('#whats-new-btn-app { font-size: 0'));
  assert.ok(css.includes('z-index: 700'));
  assert.ok(css.includes('.new-corner[hidden]') && css.includes('#page-ayna > .new-corner'));
  assert.ok(css.includes('background: linear-gradient(135deg, #7c5cff, #22d3ee)'), 'çip parlak gradient olmalı');
  assert.ok(css.includes('color: #fff; font-size: 11px; font-weight: 800'), 'çip yazısı beyaz ve net olmalı');
  assert.ok(css.includes('background: rgba(0, 0, 0, .26)') && css.includes('color: #fff; font-size: 10px'), '3 sayacı net görünmeli');
  assert.ok(!css.includes('#ffb14e') && !css.includes('255, 177, 78') && !css.includes('#7b78f5'), 'eski turuncu/koyu ton kalmamalı');
});

test('aktif özellikler panelde listelenir, rozet sayısı gösterilir', () => {
  const app = load();
  assert.equal(app.panel.classes.has('hidden'), true);
  assert.equal(app.list.innerHTML.length > 0, true);
  for (const label of ['Sabah Kartı', 'Kendi kriterini ekle', 'Ayna', 'otomatik kayıt']) {
    assert.ok(app.list.innerHTML.includes(label), label);
  }
  assert.doesNotMatch(app.list.innerHTML, /Check List/);
  assert.equal(app.counts[0].textContent, '3');
  assert.equal(app.buttons[0].hidden, false);
  assert.equal(app.buttons[0].classes.has('seen'), false);
  assert.match(app.sub.textContent, /Son eklenenler/);
});

test('süresi dolan rozetler gizlenir, yeni özellik rozeti kalır', () => {
  const expired = makeEl('old');
  expired.attrs['data-new-feature'] = 'defter';
  expired._closest = 'a';
  const fresh = makeEl('new');
  fresh.attrs['data-new-feature'] = 'morning-checkin';
  fresh._closest = 'a';
  const unknown = makeEl('unknown');
  unknown.attrs['data-new-feature'] = 'bilinmeyen';
  unknown._closest = 'a';

  load({ badges: [expired, fresh, unknown] });
  assert.equal(expired.hidden, true);
  assert.equal(fresh.hidden, false);
  assert.equal(unknown.hidden, true);
  assert.equal(expired.classes.has('expired'), true);
  assert.equal(fresh.classes.has('expired'), false);
});

test('aktif özellik yoksa üst rozet tamamen kapanır', () => {
  const app = load({ activeIds: [], features: registry.FEATURES });
  assert.ok(app.buttons.every(b => b.hidden), 'chip gizlenmeli');
  assert.equal(app.list.innerHTML, '');
  assert.match(app.sub.textContent, /yeni özellik yok/);
  app.api.open();
  assert.equal(app.panel.classes.has('hidden'), true);
});

test('panel açılınca okundu işaretlenir, yeni özellik eklenince tekrar yanar', () => {
  const app = load();
  app.buttons[0].fire('click', { stopPropagation() {} });
  assert.equal(app.panel.classes.has('hidden'), false);
  assert.equal(app.buttons[0].attrs['aria-expanded'], 'true');
  assert.ok(app.buttons.every(b => b.classes.has('seen')));
  assert.deepEqual(JSON.parse(app.store['alfa-whats-new-seen-v2']), registry.activeIds());

  const reopened = load({ seen: registry.activeIds() });
  assert.ok(reopened.buttons.every(b => b.classes.has('seen')));
  const newer = load({ seen: ['defter'] });
  assert.ok(newer.buttons.every(b => !b.classes.has('seen')));
});

test('Escape / dış tıklama kapatır, Sabah Kartı aksiyonu doğru yere götürür', () => {
  const app = load();
  app.buttons[0].fire('click', { stopPropagation() {} });
  app.close.fire('click');
  assert.equal(app.panel.classes.has('hidden'), true);
  app.api.open();
  for (const fn of app.docHandlers.keydown || []) fn({ key: 'Escape' });
  assert.equal(app.panel.classes.has('hidden'), true);
  assert.equal(app.buttons[0].focused, true);

  app.api.open();
  app.openCheckin.fire('click');
  assert.equal(app.win.AlfaMorningCheckin.opened, true);

  const away = load({ page: 'defter' });
  away.api.open();
  away.openCheckin.fire('click');
  assert.equal(away.win.location.href, '?page=home');
});

test('yeni özellik listesi değişince sunucuya tek bildirim gider', async () => {
  const calls = [];
  load({ fetchCalls: calls, syncIds: null });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/edu-shared?kind=site-features');
  assert.equal(calls[0].opts.method, 'POST');

  const cached = load({ fetchCalls: [] });
  assert.deepEqual(cached.fetchCalls, [], 'aynı liste tekrar gönderilmez');
});

test('tüm rozet ve köşe etiketleri kayıt defterindeki bir kimliğe bağlı', () => {
  const tags = [...html.matchAll(/data-new-feature="([^"]+)"/g)].map(m => m[1]);
  assert.equal(tags.length, 16);
  for (const id of tags) {
    const clean = id.includes('c.page') ? 'review' : id;
    assert.ok(registry.findFeature(clean), 'kimlik kayıtlı olmalı: ' + id);
  }
  const corners = [...html.matchAll(/<span class="new-corner[^"]*" data-new-feature="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(corners, ['morning-checkin', 'checkin-config', 'ayna-sync']);
  const dynamic = /data-new-feature="' \+ c\.page \+ '"/.test(html);
  assert.ok(dynamic, 'ek kartları dinamik kimlik taşımalı');
});
