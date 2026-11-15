import test from 'node:test';
import assert from 'node:assert/strict';
function response() {
  return { headers: {}, statusCode: 0, setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; }, json(body) { this.body = body; return this; }, end(body) { this.body = body; return this; } };
}
test('shared feed GET caches source; metadata probes are small; writes read fresh state and invalidate cached data', async () => {
  const originalFetch = global.fetch, originalNow = Date.now, oldAdmin = process.env.SITE_ADMIN_EMAILS;
  let now = 1000, revision = 'revision-1', fullReads = 0, probes = 0, authReads = 0, authorized = true;
  let source = { posts: [{ id: 'post-one', title: 'original', status: 'aktif', likes: [], comments: [] }] };
  const writes = [];
  Date.now = () => now; process.env.SITE_ADMIN_EMAILS = 'admin@test.dev';
  global.fetch = async (url, options = {}) => {
    if (url.includes('/auth/v1/user')) {
      authReads++; return { ok: authorized, status: authorized ? 200 : 401, json: async () => ({ id: 'admin-test', email: 'admin@test.dev' }) };
    }
    if (url.includes('/rest/v1/edu_shared')) {
      if (options.method === 'POST') {
        const row = JSON.parse(options.body); writes.push(row); source = row.data; revision = row.updated_at;
        return { ok: true, status: 201 };
      }
      if (url.includes('select=updated_at')) { probes++; return { ok: true, json: async () => [{ updated_at: revision }] }; }
      fullReads++; return { ok: true, status: 200, json: async () => [{ data: structuredClone(source), updated_at: revision }] };
    }
    return { ok: false, status: 404, text: async () => '' };
  };
  try {
    const { default: handler } = await import('../api/contrib.mjs?egress-caching');
    const get = async () => { const r = response(); await handler({ method: 'GET', query: { store: 'alfatrading' }, headers: {} }, r); return r; };
    assert.equal((await get()).body.posts.length, 1);
    await get(); assert.equal(fullReads, 1); assert.equal(authReads, 0, 'already public GET does not validate irrelevant JWTs');
    now += 11000; await get(); assert.equal(probes, 1); assert.equal(fullReads, 1);
    source.posts[0].title = 'newer external edit'; revision = 'revision-2';
    const write = response();
    await handler({ method: 'POST', query: { store: 'alfatrading' }, headers: { authorization: 'Bearer verified-test' },
      body: { action: 'status', postId: 'post-one', status: 'tp' } }, write);
    assert.equal(write.statusCode, 200); assert.equal(fullReads, 2, 'write bypasses stale read cache');
    assert.equal(writes[0].data.posts[0].title, 'newer external edit');
    assert.ok(writes[0].updated_at);
    const after = await get(); assert.equal(after.body.posts[0].status, 'tp'); assert.equal(fullReads, 3);
    authorized = false;
    const denied = response();
    await handler({ method: 'POST', query: { store: 'alfatrading' }, headers: { authorization: 'Bearer invalid' },
      body: { action: 'edit', postId: 'post-one', post: {} } }, denied);
    assert.equal(denied.statusCode, 403); assert.equal(fullReads, 3, 'denied writes never download the source');
  } finally {
    global.fetch = originalFetch; Date.now = originalNow;
    if (oldAdmin === undefined) delete process.env.SITE_ADMIN_EMAILS; else process.env.SITE_ADMIN_EMAILS = oldAdmin;
  }
});
test('projection failures do not retry the multi-megabyte legacy source except when view is missing', async () => {
  const original = global.fetch, oldKey = process.env.SUPABASE_SERVICE_ROLE;
  process.env.SUPABASE_SERVICE_ROLE = 'sb_secret_test';
  const calls = [];
  global.fetch = async url => {
    calls.push(url);
    if (url.includes('alfa_landing_preview')) return { ok: false, status: 402 };
    if (url.includes('alfa_portfoy_public')) return { ok: true, json: async () => [] };
    throw new Error('Legacy download must not happen');
  };
  try {
    const { default: handler } = await import('../lib/landing.mjs?egress-error');
    const r = response(); await handler({ method: 'GET', query: {} }, r);
    assert.equal(r.body.status.channel, 'unavailable');
    assert.ok(!calls.some(url => url.includes('/edu_shared?id=eq.alfa_trading')));
    const bad = response(); await handler({ method: 'GET', query: { image: 'valid-post' } }, bad);
    assert.equal(bad.statusCode, 503);
  } finally {
    global.fetch = original;
    if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE; else process.env.SUPABASE_SERVICE_ROLE = oldKey;
  }
});
test('analytics reports keep fresh admin authorization while incrementally reading visits and caching display-only user mapping', async () => {
  const oldFetch = global.fetch, oldAdmin = process.env.SITE_ADMIN_EMAILS, oldKey = process.env.SUPABASE_SERVICE_ROLE;
  process.env.SITE_ADMIN_EMAILS = 'admin@test.dev'; process.env.SUPABASE_SERVICE_ROLE = 'sb_secret_test';
  const now = Date.now(), iso = ms => new Date(ms).toISOString();
  const row = (id, time) => ({ id: 'visit_' + id, updated_at: iso(time),
    data: { sid: id, vid: id + '_visitor', first: iso(time), last: iso(time), activeMs: 1000, pages: { home: { v: 1, ms: 1000 } } } });
  let db = [row('session_old123', now - 86400000), row('session_new123', now - 60000)];
  const filters = []; let authReads = 0, mapReads = 0, allowed = true;
  global.fetch = async url => {
    if (url.includes('/auth/v1/admin/users')) { mapReads++; return { ok: true, json: async () => ({ users: [] }) }; }
    if (url.includes('/auth/v1/user')) { authReads++; return { ok: allowed, json: async () => ({ id: 'admin-test', email: 'admin@test.dev' }) }; }
    if (url.includes('/rest/v1/edu_shared')) {
      const filter = new URL(url).searchParams.get('updated_at').slice(4); filters.push(filter);
      return { ok: true, json: async () => structuredClone(db.filter(r => r.updated_at >= filter)) };
    }
    throw new Error('unexpected query');
  };
  try {
    const { default: handler } = await import('../api/analytics.mjs?egress-incremental');
    const get = async () => { const r = response(); await handler({ method: 'GET', headers: { authorization: 'Bearer test-verified' }, query: { days: '7', includeAdmin: '1' } }, r); return { res: r, data: JSON.parse(r.body) }; };
    const first = await get(); assert.equal(first.data.totals.sessions, 2);
    db.push(row('session_extra123', now));
    const second = await get(); assert.equal(second.data.totals.sessions, 3);
    assert.ok(Date.parse(filters[1]) > Date.parse(filters[0]) + 86400000, 'second fetch is a delta, not the full 7-day scan');
    assert.equal(authReads, 2); assert.equal(mapReads, 1);
    assert.equal(second.res.headers['Cache-Control'], 'no-store');
    allowed = false; const denied = await get();
    assert.equal(denied.res.statusCode, 401); assert.equal(filters.length, 2); assert.equal(mapReads, 1);
  } finally {
    global.fetch = oldFetch;
    if (oldAdmin === undefined) delete process.env.SITE_ADMIN_EMAILS; else process.env.SITE_ADMIN_EMAILS = oldAdmin;
    if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE; else process.env.SUPABASE_SERVICE_ROLE = oldKey;
  }
});
