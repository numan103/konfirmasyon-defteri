import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import handler, { featureAccess } from '../api/access.mjs';

const member = { id: 'test-member-id', email: 'tester@example.test', email_confirmed_at: '2026-01-01T00:00:00Z', app_metadata: { provider: 'email' } };
test('a service-managed Charts grant never trusts user-editable metadata', () => {
  assert.equal(featureAccess(member).features.alfacharts, false);
  assert.equal(featureAccess(null).features.alfacharts, false);
  assert.equal(featureAccess({ ...member, user_metadata: { alfa_charts: true, role: 'admin' } }).features.alfacharts, false);
  assert.equal(featureAccess({ ...member, app_metadata: { alfa_charts: 'true' } }).features.alfacharts, false);
  assert.equal(featureAccess({ ...member, app_metadata: { alfa_charts: true }, email_confirmed_at: null }).features.alfacharts, false);
  const granted = featureAccess({ ...member, app_metadata: { ...member.app_metadata, alfa_charts: true } });
  assert.deepEqual(granted, { user_id: member.id, features: { alfacharts: true } });
  assert.equal(Object.hasOwn(granted, 'admin'), false);
  assert.equal(Object.hasOwn(granted, 'tier'), false);
  assert.equal(Object.hasOwn(granted, 'app_metadata'), false);
});
test('API returns only the authenticated member grant, privately, without a membership upgrade or write', async () => {
  const originalFetch = globalThis.fetch;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE;
  process.env.SUPABASE_SERVICE_ROLE = 'test-service-key';
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input); calls.push({ path: url.pathname, method: init.method || 'GET' });
    if (url.pathname === '/auth/v1/user') return new Response(JSON.stringify({ ...member, app_metadata: { alfa_charts: true } }));
    if (url.pathname === '/rest/v1/site_access') return new Response('[]');
    throw new Error('Unexpected upstream call: ' + url.pathname);
  };
  const request = async (method, query = {}, body) => {
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(text) { this.body = text ? JSON.parse(text) : null; } };
    await handler({ method, headers: { authorization: 'Bearer test-member-token' }, query, body }, res);
    return res;
  };
  try {
    const status = await request('GET');
    assert.equal(status.statusCode, 200);
    assert.deepEqual(status.body.features, { alfacharts: true });
    assert.equal(status.body.user_id, member.id);
    assert.equal(status.body.admin, false);
    assert.equal(status.body.tier, 'free');
    assert.equal(status.body.status, 'none');
    assert.equal(status.headers['Cache-Control'], 'private, no-store');
    assert.equal(status.headers.Vary, 'Authorization');
    assert.equal((await request('GET', { op: 'list' })).statusCode, 403, 'tester cannot list other accounts');
    assert.equal((await request('POST', {}, { op: 'approve', user_id: 'another-member' })).statusCode, 403, 'tester cannot approve memberships');
    assert.ok(calls.every(c => c.method === 'GET'), 'the grant does not modify account/membership rows');
    assert.ok(calls.every(c => !c.path.startsWith('/auth/v1/admin')), 'member never reads the auth admin API');
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE; else process.env.SUPABASE_SERVICE_ROLE = previousKey;
  }
});

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function functionSource(name) {
  const start = html.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name);
  return html.slice(start, html.indexOf('\n}', start) + 2);
}
function client() {
  const context = vm.createContext({
    AUTH: { user: { id: member.id, email: member.email } }, ADMIN_EMAIL: 'admin@example.test',
    SITE: { admin: false, tier: 'free', features: { alfacharts: false }, feature_user_id: null },
    PAGE_TIER: { alfacharts: 'admin', trading: 'admin', edustudio: 'admin', ek: 'admin', pano: 'ref' },
    SITE_REF_LINKS: {}, window: { dispatchEvent() {} }, CustomEvent: class {},
    siteAccessToken: async () => '', fetch: async () => { throw new Error('offline'); },
  });
  for (const name of ['siteIsAdminEmail', 'siteIsAdmin', 'refUnlocked', 'sitePageTier', 'siteCanOpen', 'siteApplyAccess']) vm.runInContext(functionSource(name), context);
  vm.runInContext('async ' + functionSource('loadSiteAccess'), context);
  return context;
}
test('Charts tester sees only the granted product; permissions cannot cross accounts', () => {
  const ctx = client();
  assert.equal(ctx.siteCanOpen('alfacharts'), false);
  ctx.siteApplyAccess({ user_id: member.id, tier: 'free', features: { alfacharts: true } });
  assert.equal(ctx.siteCanOpen('alfacharts'), true);
  for (const page of ['trading', 'edustudio', 'ek', 'pano']) assert.equal(ctx.siteCanOpen(page), false, page);
  ctx.AUTH.user = { id: 'someone-else', email: 'someone@example.test' };
  assert.equal(ctx.siteCanOpen('alfacharts'), false, 'old session grant is identity-bound');
  ctx.siteApplyAccess({ user_id: member.id, features: { alfacharts: true } });
  assert.equal(ctx.siteCanOpen('alfacharts'), false, 'another identity response cannot grant access');
  ctx.AUTH.user = null;
  assert.equal(ctx.siteCanOpen('alfacharts'), false);
});
test('site admin list covers the requested and live Fjor accounts', () => {
  const ctx = client();
  for (const email of ['admin@example.test', 'fjortrades@gmail.com', 'fjortrading@gmail.com']) {
    ctx.AUTH.user = { id: 'admin-id', email };
    assert.equal(ctx.siteIsAdminEmail(), true, email);
    ctx.SITE.admin = false;
    ctx.siteApplyAccess({ user_id: ctx.AUTH.user.id, tier: 'free', features: {} });
    assert.equal(ctx.SITE.admin, true, email);
    assert.equal(ctx.siteCanOpen('alfacharts'), true, email);
  }
  ctx.AUTH.user = { id: 'other-id', email: 'other@example.test' };
  assert.equal(ctx.siteIsAdminEmail(), false);
});
test('no session or failed access lookup clears the cached scoped grant', async () => {
  const ctx = client();
  const grant = { user_id: member.id, features: { alfacharts: true } };
  ctx.siteApplyAccess(grant);
  await ctx.loadSiteAccess();
  assert.equal(ctx.siteCanOpen('alfacharts'), false);
  ctx.siteApplyAccess(grant);
  ctx.siteAccessToken = async () => 'token';
  await ctx.loadSiteAccess();
  assert.equal(ctx.siteCanOpen('alfacharts'), false);
  ctx.fetch = async () => ({ ok: false, json: async () => ({ ok: false }) });
  ctx.siteApplyAccess(grant);
  await ctx.loadSiteAccess();
  assert.equal(ctx.siteCanOpen('alfacharts'), false);
});
test('desktop and mobile navigation use the scoped decision, including Trader parent visibility', () => {
  const ui = functionSource('applyTierUi');
  assert.match(ui, /p === 'alfacharts'\) ok = siteCanOpen\('alfacharts'\)/);
  assert.match(ui, /privateMenu && !siteCanOpen\('alfacharts'\)/);
  assert.match(ui, /data-mnav=/);
  assert.doesNotMatch(html, /zgrc25@gmail\.com/, 'member emails never belong in the public bundle');
});
