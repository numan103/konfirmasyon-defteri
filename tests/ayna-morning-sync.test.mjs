import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync(new URL('../ayna/ayna-morning-sync.js', import.meta.url), 'utf8');

function load({ existing = null, admin = true } = {}) {
  const calls = { selects: [], inserts: [], updates: [], events: [] };
  const store = {};
  let listener = null;

  function builder() {
    const chain = {
      eq() { return chain; },
      maybeSingle() { calls.selects.push('morning'); return Promise.resolve({ data: existing ? { id: 'entry-1' } : null, error: null }); },
      single() { return Promise.resolve({ data: { id: 'entry-' + (calls.inserts.length + calls.updates.length + 1) }, error: null }); },
      select() { return chain; },
      insert(payload) { calls.inserts.push(payload); return chain; },
      update(payload) { calls.updates.push(payload); return chain; },
    };
    return chain;
  }

  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1', email: 'ahmetnuman20@gmail.com' } } } }) },
    from(table) { assert.equal(table, 'ayna_entries'); return builder(); },
  };
  const sandbox = {
    window: {
      siteIsAdmin: () => admin,
      SITE: { admin },
      addEventListener(type, fn) { if (type === 'moodCheckin') listener = fn; },
      dispatchEvent(ev) { calls.events.push(ev); },
      Ayna: { sb: () => client, today: () => '2026-11-20' },
    },
    localStorage: {
      getItem: k => store[k] ?? null,
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; },
    },
    CustomEvent: class { constructor(type, opts) { this.type = type; this.detail = opts?.detail; } },
    Date,
    console,
  };
  vm.runInNewContext(src, sandbox);
  return { listener, calls, store, client };
}

const detail = {
  date: '2026-11-20', at: '2026-11-20T09:00:00.000Z', done: true,
  values: ['slept-well', 'motivated'],
  labels: ['İyi uyudum', 'Motivasyonum yerinde'],
};

test('moodCheckin writes one morning entry in Ayna journal', async () => {
  const app = load();
  assert.equal(typeof app.listener, 'function');
  await app.listener({ detail });
  assert.equal(app.calls.selects.length, 1);
  assert.equal(app.calls.inserts.length, 1);
  assert.equal(app.calls.updates.length, 0);
  const row = app.calls.inserts[0];
  assert.equal(row.user_id, 'user-1');
  assert.equal(row.kind, 'morning');
  assert.equal(row.local_date, '2026-11-20');
  assert.deepEqual([...row.mood_words], ['İyi uyudum', 'Motivasyonum yerinde']);
  assert.ok(row.pleasantness > 0 && row.energy > 0);
  assert.ok(row.processed_at);
  assert.equal(app.calls.events.length, 1);
  assert.equal(app.calls.events[0].type, 'ayna:morning-synced');
  assert.deepEqual(Object.keys(app.store), [], 'journal data must not be cached in localStorage');
});

test('same-day check-in updates the existing row instead of duplicating it', async () => {
  const app = load({ existing: true });
  await app.listener({ detail: { ...detail, values: ['tired', 'angry'], labels: ['Yorgun kalktım', 'Kızgınım'] } });
  assert.equal(app.calls.inserts.length, 0);
  assert.equal(app.calls.updates.length, 1);
  const row = app.calls.updates[0];
  assert.deepEqual([...row.mood_words], ['Yorgun kalktım', 'Kızgınım']);
  assert.ok(row.pleasantness < 0 && row.energy < 0);
});

test('ineligible visitors and repeated events skip journal writes', async () => {
  const guest = load({ admin: false });
  await guest.listener({ detail });
  assert.equal(guest.calls.inserts.length, 0);
  const app = load();
  await app.listener({ detail });
  await app.listener({ detail });
  assert.equal(app.calls.inserts.length, 1, 'seen dates are de-duplicated in memory');
});
