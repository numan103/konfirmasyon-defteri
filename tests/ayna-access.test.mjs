import test from 'node:test';
import assert from 'node:assert/strict';
import { canUseAyna } from '../ayna-server/access.mjs';
import handler from '../api/ai.mjs';

test('confirmed site admin can use Ayna without an invitation; other members remain gated', async () => {
  const previous = { ids: process.env.AYNA_ALLOWED_USER_IDS, admins: process.env.SITE_ADMIN_EMAILS };
  const oldFetch = global.fetch;
  try {
    process.env.AYNA_ALLOWED_USER_IDS = ' invited-user ';
    process.env.SITE_ADMIN_EMAILS = 'owner@example.com';
    assert.equal(canUseAyna(null), false);
    assert.equal(canUseAyna({ id: 'invited-user' }), true);
    assert.equal(canUseAyna({ id: 'owner', email: 'OWNER@example.com', email_confirmed_at: '2026-01-01' }), true);
    assert.equal(canUseAyna({ id: 'other', email: 'member@example.com', email_confirmed_at: '2026-01-01' }), false);
    assert.equal(canUseAyna({ id: 'unconfirmed', email: 'owner@example.com' }), false);
    assert.equal(canUseAyna({ id: 'fake', user_metadata: { admin: true, email: 'owner@example.com' } }), false);
    process.env.AYNA_ALLOWED_USER_IDS = '';
    assert.equal(canUseAyna({ id: 'other' }), false);

    let user = { id: 'owner', email: 'owner@example.com', email_confirmed_at: '2026-01-01' };
    global.fetch = async () => new Response(JSON.stringify(user));
    async function ping(extra = {}) {
      let status, data;
      await handler({ method: 'POST', headers: { authorization: 'Bearer verified-by-server' }, body: { action: 'ping', ...extra } }, {
        set statusCode(value) { status = value; }, setHeader() {}, end(value) { data = JSON.parse(value); }
      });
      return { status, data };
    }
    assert.equal((await ping()).status, 200);
    user = { id: 'other', email: 'member@example.com', email_confirmed_at: '2026-01-01' };
    const denied = await ping({ email: 'owner@example.com', admin: true });
    assert.equal(denied.status, 403);
    assert.equal(denied.data.error, 'not_allowed');
  } finally {
    global.fetch = oldFetch;
    if (previous.ids === undefined) delete process.env.AYNA_ALLOWED_USER_IDS;
    else process.env.AYNA_ALLOWED_USER_IDS = previous.ids;
    if (previous.admins === undefined) delete process.env.SITE_ADMIN_EMAILS;
    else process.env.SITE_ADMIN_EMAILS = previous.admins;
  }
});
