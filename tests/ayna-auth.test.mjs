import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { getUser } from '../ayna-server/supabase.mjs';
import handler from '../api/ai.mjs';

function clientSetup(responses, expiresAt) {
  let session = { access_token: 'old', expires_at: expiresAt || Math.floor(Date.now() / 1000) + 3600 };
  let refreshes = 0;
  const calls = [];
  const context = vm.createContext({
    window: {}, console, Date, Intl, AbortController, setTimeout, clearTimeout,
    AUTH: { client: { auth: {
      getSession: async () => ({ data: { session } }),
      refreshSession: async () => { refreshes++; session = { access_token: 'new', expires_at: Math.floor(Date.now() / 1000) + 3600 }; return { data: { session } }; }
    } } },
    fetch: async (url, options) => { calls.push(options.headers.Authorization); return responses.shift(); }
  });
  vm.runInContext(fs.readFileSync(new URL('../ayna/ayna-core.js', import.meta.url), 'utf8'), context);
  return { api: context.window.Ayna.api, calls, refreshes: () => refreshes };
}

test('coach request refreshes once after a real 401 and uses the new access token', async () => {
  const c = clientSetup([new Response('{"error":"unauthorized"}', { status: 401 }), new Response('{"ok":true}')]);
  await c.api('reflect', { entry_id: 'example' });
  assert.deepEqual(c.calls, ['Bearer old', 'Bearer new']);
  assert.equal(c.refreshes(), 1);
});

test('expired cached token is renewed before the first request', async () => {
  const c = clientSetup([new Response('{"ok":true}')], Math.floor(Date.now() / 1000) - 5);
  await c.api('ping', {});
  assert.deepEqual(c.calls, ['Bearer new']);
  assert.equal(c.refreshes(), 1);
});

test('auth outage does not refresh or pretend the user is logged out', async () => {
  const c = clientSetup([new Response('{"error":"auth_unavailable"}', { status: 503 })]);
  await assert.rejects(c.api('reflect', {}), e => e.code === 'auth_unavailable');
  assert.equal(c.refreshes(), 0);
});

test('repeated unauthorized response stops after one refresh', async () => {
  const c = clientSetup([new Response('{"error":"unauthorized"}', { status: 401 }), new Response('{"error":"unauthorized"}', { status: 401 })]);
  await assert.rejects(c.api('reflect', {}), e => e.code === 'unauthorized');
  assert.equal(c.calls.length, 2);
  assert.equal(c.refreshes(), 1);
});

test('backend distinguishes invalid user token from missing or invalid auth infrastructure', async () => {
  const original = global.fetch;
  try {
    global.fetch = async (url, options) => {
      assert.ok(String(url).startsWith('https://'));
      assert.ok(options.headers.apikey);
      return new Response('{"message":"JWT expired"}', { status: 401 });
    };
    assert.equal(await getUser('expired'), null);
    global.fetch = async () => new Response('{"message":"Invalid API key"}', { status: 401 });
    await assert.rejects(getUser('valid-token'), /auth_unavailable/);
    let status, result;
    await handler({ method: 'POST', headers: { authorization: 'Bearer mock' }, body: { action: 'ping' } }, {
      set statusCode(value) { status = value; }, setHeader() {}, end(value) { result = JSON.parse(value); }
    });
    assert.equal(status, 503);
    assert.equal(result.error, 'auth_unavailable');
    global.fetch = async () => new Response('unavailable', { status: 503 });
    await assert.rejects(getUser('valid-token'), /auth_unavailable/);
  } finally { global.fetch = original; }
});
