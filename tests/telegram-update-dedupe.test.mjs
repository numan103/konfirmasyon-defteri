import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.SUPABASE_URL = 'https://new.supabase.co';
process.env.SUPABASE_SERVICE_ROLE = 'unit-service';
const dedupe = await import('../lib/telegram-update-dedupe.mjs');
const fresh = suffix => import('../lib/telegram-update-dedupe.mjs?' + suffix);

function store(t, { conflictFirstPatch = false } = {}) {
  const rows = new Map(), calls = [];
  let patches = 0;
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null });
    const u = new URL(String(url));
    assert.equal(u.pathname, '/rest/v1/edu_shared');
    const id = u.searchParams.get('id')?.replace(/^eq\./, '');
    const row = rows.get(id);
    if (!options.method || options.method === 'GET') return Response.json(row ? [row] : []);
    if (options.method === 'POST') {
      const body = JSON.parse(options.body);
      rows.set(body.id, body);
      return Response.json([body]);
    }
    if (options.method === 'PATCH') {
      patches++;
      if (conflictFirstPatch && patches === 1) return Response.json([]);
      const rev = u.searchParams.get('updated_at')?.replace(/^eq\./, '');
      if (!row || row.updated_at !== rev) return Response.json([]);
      const next = { ...row, ...JSON.parse(options.body) };
      rows.set(id, next);
      return Response.json([next]);
    }
    throw new Error('unexpected method ' + options.method);
  });
  return { rows, calls, row: () => rows.get(dedupe.DEDUPE_ROW) };
}

test('dedupe survives a cold worker restart through the CAS-backed edu_shared row', async t => {
  const s = store(t);
  const first = await fresh('cold-first=1');
  assert.equal(await first.wasProcessed(7001), false);
  assert.equal(await first.markProcessed(7001), true);
  assert.equal(await first.wasProcessed(7001), true);
  const written = s.row();
  assert.equal(written.id, dedupe.DEDUPE_ROW);
  assert.deepEqual(Object.keys(written.data.seen), ['7001']);

  // Fresh module instance = fresh process-local Set; only the DB can still know.
  const cold = await fresh('cold=1');
  assert.equal(await cold.wasProcessed(7001), true);
  assert.equal(await cold.wasProcessed(7002), false);
  assert.equal(await cold.markProcessed(7002), true);
  assert.deepEqual(Object.keys(s.row().data.seen).sort(), ['7001', '7002']);
});

test('a CAS conflict is retried and never records the same update twice', async t => {
  const s = store(t, { conflictFirstPatch: true });
  s.rows.set(dedupe.DEDUPE_ROW, { id: dedupe.DEDUPE_ROW, data: { seen: {} }, updated_at: 'stale' });
  const cold = await fresh('conflict=1');
  assert.equal(await cold.markProcessed(8100), true);
  assert.deepEqual(Object.keys(s.row().data.seen), ['8100']);
  assert.ok(s.calls.filter(c => c.method === 'PATCH').length >= 2);
});

test('bounded history keeps only the newest updates', async t => {
  const s = store(t);
  const cold = await import('../lib/telegram-update-dedupe.mjs?bounded=1');
  for (let i = 1; i <= dedupe.MAX_SEEN + 10; i++) await cold.markProcessed(9000 + i);
  const ids = dedupe.storedUpdateIds(s.row().data);
  assert.equal(ids.length, dedupe.MAX_SEEN);
  assert.ok(ids.includes(String(9000 + dedupe.MAX_SEEN + 10)));
  assert.ok(!ids.includes('9001'));
});

test('legacy restricted project is rejected before any network call', async t => {
  const s = store(t);
  process.env.SUPABASE_URL = 'https://zvnjslmptwmnuhftgqsr.supabase.co';
  t.after(() => { process.env.SUPABASE_URL = 'https://new.supabase.co'; });
  const legacy = await import('../lib/telegram-update-dedupe.mjs?legacy=1');
  assert.equal(await legacy.wasProcessed(1), false);
  assert.equal(await legacy.markProcessed(1), false);
  assert.equal(s.calls.length, 0);
});

test('without a service key dedupe stays local and never calls the database', async t => {
  const s = store(t);
  const old = process.env.SUPABASE_SERVICE_ROLE;
  delete process.env.SUPABASE_SERVICE_ROLE;
  t.after(() => { if (old === undefined) delete process.env.SUPABASE_SERVICE_ROLE; else process.env.SUPABASE_SERVICE_ROLE = old; });
  const local = await import('../lib/telegram-update-dedupe.mjs?local=1');
  assert.equal(await local.markProcessed(42), true);
  assert.equal(await local.wasProcessed(42), true);
  assert.equal(s.calls.length, 0);
});

test('the webhook marks only successful updates and no longer uses a process-local Set', () => {
  const source = fs.readFileSync(new URL('../lib/telegram-webhook.mjs', import.meta.url), 'utf8');
  assert.match(source, /wasProcessed\(updateId\)/);
  assert.match(source, /markProcessed\(updateId\)/);
  assert.doesNotMatch(source, /processedUpdates/);
  const mod = fs.readFileSync(new URL('../lib/telegram-update-dedupe.mjs', import.meta.url), 'utf8');
  assert.match(mod, /edu_shared/);
  assert.match(mod, /updated_at=eq\./);
  assert.match(mod, /AbortSignal\.timeout/);
});
