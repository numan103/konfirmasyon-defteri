import test from 'node:test';
import assert from 'node:assert/strict';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { eduTelegramRowId, isEduTelegramUpdate, ingestEduTelegramUpdate, default as inbox } from '../lib/edu-telegram-inbox.mjs';
import { openChannels } from '../lib/edu-channel-storage.mjs';
import telegramWebhook from '../lib/telegram-webhook.mjs';

const message = (extra = {}) => ({ update_id: 1, message: {
  message_id: 50, date: 1795180000, message_thread_id: 4,
  chat: { id: -10042, type: 'supergroup', username: 'alfakasim' },
  from: { id: 123, is_bot: false }, text: 'Günlük not\nBoyun çizgisi teyidini bekle.', ...extra,
} });
function fixture(t, { admin = true, authorStatus = 'administrator', fail = false, hookUrl = 'https://alfa-trader.com/api/ai?telegram-webhook=1' } = {}) {
  for (const [key, value] of Object.entries({ TG_BOT_TOKEN: 'unit-bot', TELEGRAM_WEBHOOK_SECRET: 'unit-webhook', SUPABASE_SERVICE_ROLE: 'unit-service', EDU_CHANNEL_SECRET: 'unit-key', SITE_ADMIN_EMAILS: 'admin@test.dev', TG_EDU_SOURCE_CHAT: '@alfakasim', TG_EDU_SOURCE_THREAD: '4', TG_EDU_AUTHOR_IDS: '' })) {
    const old = process.env[key]; process.env[key] = value;
    t.after(() => { if (old === undefined) delete process.env[key]; else process.env[key] = old; });
  }
  const rows = new Map(), calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    const u = String(url); calls.push({ url: u, method: options.method || 'GET', body: options.body });
    if (u.includes('/auth/v1/user')) return Response.json({ id: 'user-1', email: admin ? 'admin@test.dev' : 'student@test.dev' });
    if (u.endsWith('/getMe')) return Response.json({ ok: true, result: { id: 987, username: 'unit_bot' } });
    if (u.endsWith('/getWebhookInfo')) return Response.json({ ok: true, result: { url: hookUrl, allowed_updates: ['message', 'edited_message'] } });
    if (u.endsWith('/getChat')) return Response.json({ ok: true, result: { id: -10042 } });
    if (u.endsWith('/getChatMember')) return Response.json({ ok: true, result: { status: authorStatus } });
    if (u.endsWith('/getFile')) return Response.json({ ok: true, result: { file_path: 'photos/unit.jpg' } });
    if (u.includes('/file/bot')) return new Response(Buffer.from([255, 216, 255, 0, 1, 2]), { headers: { 'Content-Type': 'image/jpeg' } });
    if (u.includes('/rest/v1/edu_shared')) {
      if (fail && options.method === 'POST') return Response.json({}, { status: 503 });
      if (options.method === 'POST') { const row = JSON.parse(options.body); rows.set(row.id, row); return Response.json({}); }
      if (options.method === 'DELETE') { rows.delete(new URL(u).searchParams.get('id').slice(3)); return new Response(null, { status: 204 }); }
      return Response.json([...rows.values()]);
    }
    throw new Error('Unexpected network request');
  });
  return {
    rows, calls,
    async request({ method = 'GET', body, authenticated = true, query = {} } = {}) {
      const res = { code: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
      await inbox({ method, body, query, headers: authenticated ? { authorization: 'Bearer unit' } : {} }, res);
      return res;
    },
  };
}
test('only the explicit Alfa Edu source topic is accepted; slash commands and other chats stay untouched', t => {
  fixture(t);
  assert.equal(isEduTelegramUpdate(message()), true);
  assert.equal(isEduTelegramUpdate(message({ message_thread_id: 7 })), false);
  assert.equal(isEduTelegramUpdate(message({ chat: { id: -10043, type: 'supergroup', username: 'other' } })), false);
  assert.equal(isEduTelegramUpdate(message({ text: '/ask BTC' })), false);
});
test('source administrator posts enter encrypted review inbox, not channels; retries/edits upsert one stable row', async t => {
  const f = fixture(t);
  assert.deepEqual(await ingestEduTelegramUpdate(message()), { handled: true, count: 1 });
  await ingestEduTelegramUpdate(message());
  await ingestEduTelegramUpdate({ edited_message: message({ text: 'Düzeltilen günlük not' }).message });
  assert.equal(f.rows.size, 1);
  const row = [...f.rows.values()][0], scope = 'telegram-inbox:' + row.id.slice(6);
  assert.match(row.id, /^edutg_[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(row).includes('Düzeltilen günlük not'));
  assert.equal(openChannels(row.data, scope).body, 'Düzeltilen günlük not');
  assert.equal(openChannels(row.data, scope).from, undefined);
  assert.throws(() => openChannels(row.data, 'telegram-inbox:' + '0'.repeat(64)));
  assert.ok(f.calls.filter(c => c.method === 'POST' && c.url.includes('/edu_shared')).every(c => JSON.parse(c.body).id.startsWith('edutg_')));
});
test('ordinary members/bots are not imported, and an absent webhook secret disables ingestion', async t => {
  const f = fixture(t, { authorStatus: 'member' });
  assert.equal((await ingestEduTelegramUpdate(message())).count, 0);
  assert.equal((await ingestEduTelegramUpdate(message({ from: { id: 123, is_bot: true } }))).count, 0);
  delete process.env.TELEGRAM_WEBHOOK_SECRET;
  assert.equal((await ingestEduTelegramUpdate(message())).handled, false);
  assert.equal(f.rows.size, 0);
});
test('small Telegram photos are copied without a bot-token URL; oversized images are explicitly marked missing', async t => {
  const f = fixture(t);
  await ingestEduTelegramUpdate(message({ text: undefined, caption: 'Grafik açıklaması', photo: [{ file_id: 'p1', file_size: 1000 }] }));
  let row = [...f.rows.values()][0], record = openChannels(row.data, 'telegram-inbox:' + row.id.slice(6));
  assert.match(record.photos[0].url, /^data:image\/jpeg;base64,/);
  assert.ok(!JSON.stringify(record).includes('unit-bot'));
  await ingestEduTelegramUpdate(message({ text: undefined, caption: 'Büyük grafik', photo: [{ file_id: 'p2', file_size: 900000 }] }));
  row = [...f.rows.values()][0]; record = openChannels(row.data, 'telegram-inbox:' + row.id.slice(6));
  assert.equal(record.photos.length, 0); assert.equal(record.photoMissing, true);
});
test('inbox reads/deletions require real admin authentication and never return plain storage rows', async t => {
  const f = fixture(t, { admin: false });
  assert.equal((await f.request({ authenticated: false })).code, 401);
  assert.equal((await f.request()).code, 403);
  assert.equal((await f.request({ method: 'POST', body: { dismiss: eduTelegramRowId(-10042, 50) } })).code, 403);
  assert.equal(f.calls.filter(c => c.url.includes('/edu_shared')).length, 0);
});
test('admin can review encrypted records and dismiss only a validated inbox key', async t => {
  const f = fixture(t); await ingestEduTelegramUpdate(message());
  const read = await f.request();
  assert.equal(read.code, 200); assert.equal(read.headers['Cache-Control'], 'private, no-store');
  assert.equal(read.body.items[0].body, message().message.text);
  assert.ok(!JSON.stringify(read.body).includes('ciphertext'));
  assert.equal((await f.request({ method: 'POST', body: { dismiss: 'channels' } })).code, 400);
  assert.equal((await f.request({ method: 'POST', body: { dismiss: read.body.items[0].id } })).code, 200);
  assert.equal(f.rows.size, 0);
});
test('write failure is retriable rather than acknowledged as a successful import', async t => {
  fixture(t, { fail: true });
  await assert.rejects(ingestEduTelegramUpdate(message()), /edu_inbox_unavailable/);
});
test('new scoped encryption still decrypts the pre-existing production channel format', t => {
  fixture(t);
  const iv = randomBytes(12), key = createHash('sha256').update('alfa-edu-channels-v1:unit-key').digest();
  const cipher = createCipheriv('aes-256-gcm', key, iv); cipher.setAAD(Buffer.from('alfa-edu-channels:v1'));
  const data = { traders: { legacy: { name: 'Eski ücretsiz dersler' } }, order: ['legacy'] };
  const bytes = Buffer.concat([cipher.update(JSON.stringify(data)), cipher.final()]);
  const envelope = { channelEnvelope: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: bytes.toString('base64') };
  assert.deepEqual(openChannels(envelope), data);
});
test('existing webhook verifies its secret before inbox ingestion and never sends an automatic reply or publishes a lesson', async t => {
  const f = fixture(t);
  const response = () => ({ code: 0, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
  const denied = response();
  await telegramWebhook({ method: 'POST', headers: {}, body: message() }, denied);
  assert.equal(denied.code, 403); assert.equal(f.calls.length, 0);
  const accepted = response();
  await telegramWebhook({ method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 'unit-webhook' }, body: message() }, accepted);
  assert.equal(accepted.code, 200); assert.equal(accepted.body.eduInbox, 1);
  assert.equal(f.rows.size, 1);
  assert.ok(!f.calls.some(c => /sendMessage|sendPhoto|api\.groq/.test(c.url)));
});
test('existing webhook returns a retriable response if the durable inbox write fails', async t => {
  fixture(t, { fail: true });
  const res = { code: 0, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await telegramWebhook({ method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 'unit-webhook' }, body: message() }, res);
  assert.equal(res.code, 503); assert.equal(res.body.error, 'edu_inbox_retry');
});
test('connection probe verifies the actual bot membership and webhook without changing Telegram or database state', async t => {
  const f = fixture(t);
  const status = await f.request({ query: { check: '1' } });
  assert.equal(status.code, 200); assert.equal(status.body.connection.ready, true);
  assert.equal(status.body.connection.botUsername, 'unit_bot');
  assert.equal(f.rows.size, 0);
  assert.ok(!f.calls.some(c => /setWebhook|sendMessage|sendPhoto|\/edu_shared/.test(c.url)));
});
test('connection probe never claims ready when the source membership or target webhook is wrong', async t => {
  const f = fixture(t, { authorStatus: 'member', hookUrl: 'https://other.example/hook' });
  const status = await f.request({ query: { check: '1' } });
  assert.equal(status.body.connection.ready, false);
  assert.equal(status.body.connection.sourceReady, false); assert.equal(status.body.connection.webhookReady, false);
});
