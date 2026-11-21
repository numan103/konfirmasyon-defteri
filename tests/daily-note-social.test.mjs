import test from 'node:test';
import assert from 'node:assert/strict';
import dailySocial from '../lib/daily-note-social.mjs';
import { openChannels } from '../lib/edu-channel-storage.mjs';
import { createHash } from 'node:crypto';
process.env.SUPABASE_SERVICE_ROLE = 'daily-social-unit-test-key';
const NOTE = 'edutg_' + 'a'.repeat(64);
let fixtureSerial = 0;
function fixture(t) {
  const prefix = 'fixture' + (++fixtureSerial) + ':';
  let row = null, clock = Date.now(), conflict = false, outage = false, hidden = false;
  const writes = [];
  t.mock.method(Date, 'now', () => clock);
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    const u = new URL(url);
    if (u.pathname === '/auth/v1/user') {
      const token = options.headers.Authorization?.replace('Bearer ', '');
      return Response.json(token ? { id: token, email: token.endsWith(':admin') ? 'ahmetnuman20@gmail.com' : token + '@example.test', user_metadata: { name: 'Private Account Name' } } : {}, { status: token ? 200 : 401 });
    }
    assert.equal(u.pathname, '/rest/v1/edu_shared');
    if (outage) return Response.json({}, { status: 503 });
    const method = options.method || 'GET';
    if (method === 'GET') return Response.json(row ? [row] : []);
    const body = JSON.parse(options.body); writes.push(body);
    if (conflict) return Response.json([]);
    if (method === 'POST') {
      if (row) return Response.json([]);
      row = body;
    } else {
      if (u.searchParams.get('updated_at') !== 'eq.' + row.updated_at) return Response.json([]);
      row = { ...row, ...body };
    }
    return Response.json([row]);
  });
  return {
    writes, get row() { return row; },
    conflict(value) { conflict = value; }, outage(value) { outage = value; }, hide() { hidden = true; },
    async call(user, body, query = {}) {
      clock += 1100;
      let output;
      const res = { setHeader() {}, status(n) { this.code = n; return this; }, json(data) { output = { status: this.code, ...data }; return this; } };
      await dailySocial({ method: body ? 'POST' : 'GET', headers: user ? { authorization: 'Bearer ' + prefix + user } : {}, query: { social: NOTE, ...query }, body }, res, async () => ({ publication: hidden ? 'hidden' : 'daily' }));
      return output;
    }
  };
}
const comment = (text = 'Harika bir yazı.') => ({ op: 'comment', text, requestId: '11111111-1111-4111-8111-111111111111', name: 'Okur' });
test('public reading works without login; all registered tiers may react and likes are idempotent', async t => {
  const f = fixture(t);
  assert.equal((await f.call(null)).likes, 0);
  assert.equal((await f.call(null, { op: 'like', liked: true })).status, 401);
  assert.equal((await f.call('student', { op: 'like', liked: true })).likes, 1);
  assert.equal((await f.call('student', { op: 'like', liked: true })).likes, 1);
  assert.equal((await f.call('other', { op: 'like', liked: true })).likes, 2);
  assert.equal((await f.call('student', { op: 'like', liked: false })).likes, 1);
  assert.equal((await f.call('student')).liked, false);
  assert.equal((await f.call('other')).liked, true);
});
test('comments persist encrypted; public output never exposes email, account id or private metadata', async t => {
  const f = fixture(t);
  const first = await f.call('student', comment());
  assert.equal(first.commentCount, 1); assert.equal(first.comments[0].mine, true);
  assert.equal((await f.call('student', comment())).commentCount, 1, 'retries must not duplicate the comment');
  const pub = await f.call(null);
  assert.equal(pub.comments[0].name, 'Okur');
  assert.equal(pub.comments[0].mine, false);
  const json = JSON.stringify(pub);
  for (const secret of ['owner', 'student', 'Private Account Name', '@example.test', 'requestId']) assert.ok(!json.includes(secret));
  assert.equal(f.row.data.channelEnvelope, 1);
  assert.ok(!JSON.stringify(f.row.data).includes('Harika'));
  const scope = 'telegram-inbox:' + createHash('sha256').update('daily-note-social:' + NOTE).digest('hex');
  assert.equal(openChannels(f.row.data, scope).comments.length, 1);
});
test('only owner or administrator can delete; forged instructor flags are ignored', async t => {
  const f = fixture(t);
  const saved = await f.call('student', { ...comment(), instructor: true });
  const id = saved.comments[0].id;
  assert.equal(saved.comments[0].instructor, false);
  assert.equal((await f.call('other', { op: 'remove', id })).status, 403);
  assert.equal((await f.call('admin', { op: 'remove', id })).commentCount, 0);
  const admin = await f.call('admin', { ...comment(), name: 'Fake' });
  assert.equal(admin.comments[0].name, 'Trader Ahmet'); assert.equal(admin.comments[0].instructor, true);
});
test('removed notes, invalid payloads and storage failures never report fake success', async t => {
  const f = fixture(t);
  assert.equal((await f.call('student', { op: 'like', liked: 'yes' })).status, 400);
  assert.equal((await f.call('student', { ...comment(), text: 'x' })).status, 400);
  assert.equal((await f.call('student', { ...comment(), name: 'email@example.com' })).status, 400);
  f.conflict(true);
  assert.equal((await f.call('student', comment())).status, 409);
  f.conflict(false); f.outage(true);
  assert.equal((await f.call(null)).status, 503);
  f.outage(false); f.hide();
  assert.equal((await f.call(null)).status, 404);
  assert.equal((await f.call('student', comment())).status, 404);
});
