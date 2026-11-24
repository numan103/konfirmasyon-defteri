import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { WorkspacePersistence } from '../assets/alfa-workspace-persistence.mjs';
import { normalizeWorkspace } from '../assets/alfa-multichart.mjs';
import { ChartSettingsStore } from '../assets/alfa-chart-settings-store.mjs';
const workspace = () => ({ panes: [{ id: 1, symbol: 'BTCUSDT', interval: '4h' }, { id: 2, symbol: 'OKX:BTCUSDT.P', interval: '5m' }],
  active: 2, layout: 2, open: true, sync: { symbol: true, interval: false, crosshair: false, range: true } });
function fixture(remote = null) {
  const data = new Map(), applied = [], writes = [];
  const storage = { getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value) };
  const store = { user: { id: 'alice' },
    loadWorkspace: async () => ({ ok: true, workspace: remote, revision: remote ? 2 : 0 }),
    saveWorkspace: async (owner, value, revision) => { writes.push({ owner, value, revision }); return { ok: true, revision: revision + 1 }; }
  };
  const p = new WorkspacePersistence({ store, storage, normalize: normalizeWorkspace, apply: value => applied.push(value) });
  return { p, data, applied, writes, store };
}
test('fresh second device adopts the complete account workspace without writing it back', async () => {
  const remote = workspace(), h = fixture(remote);
  await h.p.start('alice', { ...workspace(), layout: 1 }, false);
  assert.deepEqual(h.applied, [remote]); assert.equal(h.writes.length, 0);
  assert.equal(h.p.dirty, false); h.p.dispose();
});
test('legacy local workspace uploads only after a confirmed empty cloud read', async () => {
  const h = fixture();
  await h.p.start('alice', workspace(), true);
  assert.deepEqual(h.writes[0], { owner: 'alice', value: workspace(), revision: 0 });
  h.p.dispose();
});
test('different local and cloud copies never overwrite each other automatically', async () => {
  const h = fixture({ ...workspace(), layout: 4 });
  await h.p.start('alice', workspace(), true);
  assert.equal(h.p.blocked, true); assert.equal(h.writes.length, 0); assert.equal(h.applied.length, 0);
  assert.equal(JSON.parse(h.data.get(h.p.key())).blocked, true); h.p.dispose();
});
test('a clean baseline follows another device, while dirty offline edits remain protected', async () => {
  for (const dirty of [false, true]) {
    const h = fixture({ ...workspace(), layout: 4 });
    h.data.set('alfa-chart-workspace-sync:v1:alice', JSON.stringify({ base: workspace(), dirty }));
    await h.p.start('alice', workspace(), true);
    assert.equal(h.applied.length, dirty ? 0 : 1);
    assert.equal(h.p.blocked, dirty); h.p.dispose();
  }
});
test('failed reads and invalid remote documents never authorize an initial write', async () => {
  for (const response of [{ ok: false }, { ok: true, workspace: { panes: [] }, revision: 2 }]) {
    const h = fixture();
    h.store.loadWorkspace = async () => response;
    await h.p.start('alice', workspace(), true);
    h.p.changed(workspace()); await h.p.flush();
    assert.equal(h.writes.length, 0); h.p.dispose();
  }
});
test('account switch rejects late remote data; CAS conflict persists a blocked state', async () => {
  const h = fixture();
  let resolve;
  h.store.loadWorkspace = () => new Promise(done => { resolve = done; });
  const pending = h.p.start('alice', workspace(), false);
  h.store.user = { id: 'bob' }; h.p.dispose();
  resolve({ ok: true, workspace: workspace(), revision: 2 }); await pending;
  assert.equal(h.applied.length, 0); assert.equal(h.writes.length, 0);
  h.store.user = { id: 'alice' }; h.store.loadWorkspace = async () => ({ ok: true, workspace: null });
  h.store.saveWorkspace = async () => ({ ok: false, conflict: true });
  await h.p.start('alice', workspace(), true);
  assert.equal(h.p.blocked, true); h.p.dispose();
});
test('normalization rejects duplicate ids, unsafe market identities and unbounded panes', () => {
  const raw = workspace();
  assert.deepEqual(normalizeWorkspace(raw), raw);
  assert.equal(normalizeWorkspace({ ...raw, panes: [raw.panes[0], raw.panes[0]] }), null);
  assert.equal(normalizeWorkspace({ ...raw, panes: [{ id: 1, symbol: 'javascript:alert(1)', interval: '1h' }] }), null);
  assert.equal(normalizeWorkspace({ ...raw, panes: Array(7).fill(raw.panes[0]) }), null);
});
test('workspace migration is additive, owner-only RLS and grants no delete or anonymous access', () => {
  const sql = fs.readFileSync(new URL('../supabase/site/040_chart_workspaces.sql', import.meta.url), 'utf8');
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /auth\.uid\(\) = user_id/);
  assert.doesNotMatch(sql, /drop table|truncate|delete from|grant .*delete/i);
});
test('workspace transport scopes reads and CAS updates to the authenticated owner', async () => {
  const calls = [];
  const store = new ChartSettingsStore(() => {});
  store.user = { id: 'alice' };
  const query = {
    select(value) { calls.push(['select', value]); return this; },
    eq(key, value) { calls.push(['eq', key, value]); return this; },
    update(row) { calls.push(['update', row]); return this; },
    insert(row) { calls.push(['insert', row]); return this; },
    maybeSingle: async () => ({ data: { revision: 8, workspace: workspace() }, error: null })
  };
  store.client = { from: table => { calls.push(['from', table]); return query; } };
  assert.equal((await store.loadWorkspace('alice')).ok, true);
  assert.equal((await store.saveWorkspace('alice', workspace(), 7)).revision, 8);
  assert.ok(calls.some(row => row[0] === 'eq' && row[1] === 'revision' && row[2] === 7));
  assert.ok(calls.filter(row => row[0] === 'eq' && row[1] === 'user_id').every(row => row[2] === 'alice'));
  const before = calls.length;
  assert.equal((await store.saveWorkspace('bob', workspace(), 0)).ok, false);
  assert.equal((await store.loadWorkspace('bob')).ok, false);
  assert.equal(calls.length, before);
  query.maybeSingle = async () => ({ data: null, error: null });
  assert.equal((await store.saveWorkspace('alice', workspace(), 7)).conflict, true);
  query.maybeSingle = async () => ({ data: null, error: { code: '42P01' } });
  assert.equal((await store.loadWorkspace('alice')).ok, false);
});
