import test from 'node:test';
import assert from 'node:assert/strict';
import handler, { parseMentorResults, resultRecords, isMentorMessage, sealTrade, openTrade, ingestMentorUpdate, parseMentorWidget } from '../lib/mentorship-trades.mjs';
import webhook from '../lib/telegram-webhook.mjs';
const msg = overrides => ({
  message_id: 946, date: 1795019005, message_thread_id: 6,
  chat: { id: -1004496172434, username: 'alfakasim', type: 'supergroup' },
  from: { id: 12345, username: 'traderahmetd' }, text: 'BTC +2.3R',
  reply_to_message: { message_id: 889, date: 1794933244, from: { id: 12345, username: 'traderahmetd' },
    text: 'BTC işlem', photo: [{ file_id: 'original', file_size: 1000 }] }, ...overrides,
});
function fixture(t) {
  const before = {};
  for (const [name, value] of Object.entries({ SUPABASE_SERVICE_ROLE: 'unit-test-service-key', TELEGRAM_WEBHOOK_SECRET: 'test-webhook', TG_BOT_TOKEN: 'unit-token' })) {
    before[name] = process.env[name]; process.env[name] = value;
  }
  t.after(() => { for (const [name, value] of Object.entries(before)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } });
  const rows = new Map(), calls = []; let conflict = false, outage = false, verified = true;
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    const u = new URL(url), method = options.method || 'GET'; calls.push({ url, method, options });
    if (u.pathname === '/auth/v1/user') {
      const token = options.headers.Authorization;
      if (token === 'Bearer admin') return Response.json({ id: 'admin-id', email: 'ahmetnuman20@gmail.com' });
      if (token === 'Bearer member') return Response.json({ id: 'member-id', email: 'member@example.com' });
      return Response.json({}, { status: 401 });
    }
    if (u.pathname === '/rest/v1/site_access') return Response.json(verified ? [{ status: 'verified' }] : [], { status: outage ? 404 : 200 });
    if (u.pathname === '/rest/v1/edu_shared') {
      assert.equal(options.headers.apikey, 'unit-test-service-key');
      if (outage) return Response.json({}, { status: 503 });
      const query = u.searchParams.get('id'), id = query?.replace(/^eq\./, '');
      if (method === 'GET') return Response.json(query?.startsWith('like.') ? [...rows.values()] : rows.has(id) ? [rows.get(id)] : []);
      const body = JSON.parse(options.body);
      if (method === 'POST') {
        if (rows.has(body.id)) return Response.json({}, { status: 409 });
        rows.set(body.id, body); return Response.json([body]);
      }
      const old = rows.get(id), rev = u.searchParams.get('updated_at')?.replace(/^eq\./, '');
      if (conflict || !old || old.updated_at !== rev) return Response.json([]);
      const next = { ...old, ...body }; rows.set(id, next); return Response.json([next]);
    }
    throw new Error('Unexpected network: ' + u.hostname + u.pathname);
  });
  async function request(token = '', query = {}, body) {
    let data;
    const h = {}, res = { statusCode: 200, setHeader(k,v) { h[k] = v; }, status(n) { this.statusCode = n; return this; }, json(d) { data = d; return this; }, end(d) { data = d; } };
    await handler({ method: body ? 'POST' : 'GET', headers: token ? { authorization: 'Bearer ' + token } : {}, query, body }, res);
    return { status: res.statusCode, data, headers: h };
  }
  return { rows, calls, request, conflict: value => { conflict = value; }, outage: value => { outage = value; }, verified: value => { verified = value; } };
}
test('explicit result lines support signed decimals and multiple symbols without manufacturing target outcomes', () => {
  assert.deepEqual(parseMentorResults('BTC +2.3R\nGOLD +2R\nnzdcad +2,8r\nTebrikler.'), [{ coin: 'BTC', r: 2.3 }, { coin: 'GOLD', r: 2 }, { coin: 'NZDCAD', r: 2.8 }]);
  assert.deepEqual(parseMentorResults('BTC -1R'), [{ coin: 'BTC', r: -1 }]);
  for (const value of ['BTC +2R hedef', 'BTC hedef 3R', 'BTC 2R', 'RR 1:3', 'BTC +2R\nBTC -1R']) assert.deepEqual(parseMentorResults(value), []);
});
test('only the exact mentorship author and topic are eligible; Public and forwarded/member messages are ignored', () => {
  assert.equal(isMentorMessage(msg()), true);
  for (const changes of [
    { message_thread_id: 7 }, { chat: { username: 'alfatraderspublic', type: 'supergroup' } },
    { from: { id: 7, username: 'someone', first_name: 'Trader Ahmet' } },
    { sender_chat: { id: 123 } }, { forward_origin: { type: 'user' } }, { forward_date: 123 },
  ]) assert.equal(isMentorMessage(msg(changes)), false);
});
test('reply image and signed R become one deterministic result, without invented direction/price/profit', () => {
  const [row] = resultRecords(msg());
  assert.equal(row.coin, 'BTC'); assert.equal(row.r, 2.3); assert.equal(row.rootId, 889);
  assert.equal(row.originalPhotoId, 'original'); assert.equal(row.needsReview, false);
  assert.equal(row.id, resultRecords(msg())[0].id);
  assert.equal(Object.hasOwn(row, 'entry'), false); assert.equal(Object.hasOwn(row, 'profit'), false);
});
test('a multi-coin summary does not attach one coin chart to every result', () => {
  const records = resultRecords(msg({ text: 'BTC +2.3R\nGOLD +2R\nnzdcad +2.8r' }));
  assert.equal(records.length, 3); assert.equal(records[0].needsReview, false);
  assert.equal(records[1].needsReview, true); assert.equal(records[1].originalPhotoId, '');
  assert.equal(records[2].needsReview, true);
  const [standalone] = resultRecords(msg({ reply_to_message: undefined }));
  assert.equal(standalone.needsReview, true);
});
test('premium records are encrypted with row AAD and cannot be read as plaintext', t => {
  fixture(t); const [row] = resultRecords(msg()), encrypted = sealTrade(row.id, row);
  assert.ok(!JSON.stringify(encrypted).includes('BTC'));
  assert.equal(openTrade(row.id, encrypted).r, 2.3);
  assert.throws(() => openTrade('mentortrade_' + 'a'.repeat(64), encrypted));
  assert.throws(() => openTrade(row.id, row));
});
test('duplicate Telegram deliveries produce one result; corrections replace rather than sum R', async t => {
  const f = fixture(t);
  assert.equal((await ingestMentorUpdate({ message: msg() })).results[0], 'saved');
  assert.equal((await ingestMentorUpdate({ message: msg() })).results[0], 'duplicate');
  await ingestMentorUpdate({ edited_message: msg({ text: 'BTC +2.5R', edit_date: 1795019100 }) });
  assert.equal(f.rows.size, 1);
  const row = [...f.rows.values()][0]; assert.equal(openTrade(row.id, row.data).r, 2.5);
  assert.equal((await ingestMentorUpdate({ message: msg() })).results[0], 'stale');
});
test('removing a result in an edit retracts it rather than showing the old R', async t => {
  const f = fixture(t); await ingestMentorUpdate({ message: msg() });
  await ingestMentorUpdate({ edited_message: msg({ text: 'Sonuç teyit ediliyor', edit_date: 1795019200 }) });
  const out = await f.request('member'); assert.deepEqual(out.data.records, []);
});
test('database failure and CAS conflict are retryable; they never acknowledge a fake success', async t => {
  const f = fixture(t); f.outage(true);
  await assert.rejects(ingestMentorUpdate({ message: msg() }), /storage_unavailable/);
  f.outage(false); await ingestMentorUpdate({ message: msg() }); f.conflict(true);
  await assert.rejects(ingestMentorUpdate({ edited_message: msg({ text: 'BTC -1R', edit_date: 1795019300 }) }), /conflict/);
});
test('anonymous/free requests cannot read lists, originals, or import results', async t => {
  const f = fixture(t);
  assert.equal((await f.request()).status, 401);
  f.verified(false);
  assert.equal((await f.request('member')).status, 403);
  assert.equal((await f.request('member', { image: resultRecords(msg())[0].id })).status, 403);
  assert.equal((await f.request('member', {}, { op: 'import', ids: [946] })).status, 403);
  f.outage(true);
  assert.equal((await f.request('member')).status, 403, 'missing table must fail closed');
  assert.equal(f.calls.filter(call => call.url.includes('/edu_shared')).length, 0);
});
test('authorized feed is private/no-store and never leaks Telegram file identifiers', async t => {
  const f = fixture(t); await ingestMentorUpdate({ message: msg() });
  const out = await f.request('member');
  assert.equal(out.status, 200); assert.equal(out.data.records[0].coin, 'BTC');
  assert.equal(Object.hasOwn(out.data.records[0], 'photoId'), false);
  assert.equal(Object.hasOwn(out.data.records[0], 'originalPhotoId'), false);
  assert.equal(out.headers['Cache-Control'], 'private, no-store');
});
test('widget imports require exact author provenance and parse only chart images, not avatars', () => {
  const html = '<div data-post="alfakasim/946"><a class="tgme_widget_message_author_name" href="https://t.me/traderahmetd">Trader Ahmet</a>' +
    '<a class="tgme_widget_message_reply x" href="https://t.me/alfakasim/889"></a>' +
    '<div class="tgme_widget_message_text js-message_text" dir="auto">BTC +2.3R<br>Tebrikler</div>' +
    '<time datetime="2026-11-18T16:23:25Z"></time></div>';
  assert.equal(parseMentorWidget(html, 946).reply, 889);
  assert.match(parseMentorWidget(html, 946).text, /BTC \+2.3R\nTebrikler/);
  assert.equal(parseMentorWidget(html.replace('traderahmetd', 'other'), 946), null);
  assert.equal(parseMentorWidget(html, 947), null);
});
test('forged webhook requests cannot ingest even a matching source message', async t => {
  const f = fixture(t);
  let status, data;
  const res = { status(n) { status = n; return this; }, json(body) { data = body; } };
  await webhook({ method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 'forged' }, body: { message: msg() } }, res);
  assert.equal(status, 403); assert.equal(data.error, 'forbidden');
  assert.equal(f.rows.size, 0); assert.equal(f.calls.length, 0);
});
