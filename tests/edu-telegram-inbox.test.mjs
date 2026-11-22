import test from 'node:test';
import assert from 'node:assert/strict';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { eduTelegramRowId, isEduTelegramUpdate, ingestEduTelegramUpdate, default as inbox } from '../lib/edu-telegram-inbox.mjs';
import { openChannels, sealChannels } from '../lib/edu-channel-storage.mjs';
import telegramWebhook from '../lib/telegram-webhook.mjs';

const message = (extra = {}) => ({ update_id: 1, message: {
  message_id: 50, date: 1795180000, message_thread_id: 4,
  chat: { id: -10042, type: 'supergroup', username: 'alfakasim' },
  from: { id: 123, is_bot: false }, text: 'Günlük not\nBoyun çizgisi teyidini bekle.', ...extra,
} });
const stored = (f, id) => openChannels(f.rows.get(id).data, 'telegram-inbox:' + id.slice(6));
function fixture(t, { admin = true, authorStatus = 'administrator', fail = false, failIndexOnce = false, hookUrl = 'https://alfa-trader.com/api/ai?telegram-webhook=1' } = {}) {
  for (const [key, value] of Object.entries({ TG_BOT_TOKEN: 'unit-bot', TELEGRAM_WEBHOOK_SECRET: 'unit-webhook', SUPABASE_SERVICE_ROLE: 'unit-service', EDU_CHANNEL_SECRET: 'unit-key', SITE_ADMIN_EMAILS: 'admin@test.dev', TG_EDU_SOURCE_CHAT: '@alfakasim', TG_EDU_SOURCE_THREAD: '4', TG_EDU_AUTHOR_IDS: '' })) {
    const old = process.env[key]; process.env[key] = value;
    t.after(() => { if (old === undefined) delete process.env[key]; else process.env[key] = old; });
  }
  const rows = new Map(), calls = []; let beforeIndexPatch = null;
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    const u = String(url); calls.push({ url: u, method: options.method || 'GET', body: options.body });
    if (u.includes('/auth/v1/user')) return Response.json({ id: 'user-1', email: admin ? 'admin@test.dev' : 'student@test.dev' });
    if (u.endsWith('/getMe')) return Response.json({ ok: true, result: { id: 987, username: 'unit_bot' } });
    if (u.endsWith('/getWebhookInfo')) return Response.json({ ok: true, result: { url: hookUrl, allowed_updates: ['message', 'edited_message'] } });
    if (u.endsWith('/getChat')) return Response.json({ ok: true, result: { id: -10042 } });
    if (u.endsWith('/getChatMember')) return Response.json({ ok: true, result: { status: authorStatus } });
    if (u.endsWith('/getFile')) {
      const fileId = String(JSON.parse(options.body || '{}').file_id || 'unit').replace(/[^a-zA-Z0-9_-]/g, '');
      return Response.json({ ok: true, result: { file_path: 'photos/' + fileId + '.jpg' } });
    }
    if (u.includes('/file/bot')) {
      const label = String(u.split('/').pop() || 'unit').replace(/\.jpg$/, '');
      return new Response(Buffer.concat([Buffer.from([255, 216, 255]), Buffer.from(label)]), { headers: { 'Content-Type': 'image/jpeg' } });
    }
    if (u.includes('/rest/v1/edu_shared')) {
      const query = new URL(u).searchParams;
      if (fail && ['POST', 'PATCH'].includes(options.method)) return Response.json({}, { status: 503 });
      const target = options.method === 'POST' ? JSON.parse(options.body).id : query.get('id')?.slice(3);
      if (failIndexOnce && target === 'edudaily_index' && ['POST', 'PATCH'].includes(options.method)) { failIndexOnce = false; return Response.json({}, { status: 503 }); }
      if (options.method === 'POST') {
        const row = JSON.parse(options.body);
        if (rows.has(row.id) && options.headers.Prefer.includes('ignore-duplicates')) return Response.json([]);
        rows.set(row.id, row); return Response.json([row]);
      }
      if (options.method === 'PATCH') {
        if (target === 'edudaily_index' && beforeIndexPatch) { const hook = beforeIndexPatch; beforeIndexPatch = null; await hook(); }
        const id = query.get('id').slice(3), current = rows.get(id);
        if (!current || (query.has('updated_at') && current.updated_at !== query.get('updated_at').slice(3))) return Response.json([]);
        const row = { ...current, ...JSON.parse(options.body) }; rows.set(id, row); return Response.json([row]);
      }
      if (options.method === 'DELETE') { rows.delete(new URL(u).searchParams.get('id').slice(3)); return new Response(null, { status: 204 }); }
      let result = [...rows.values()];
      if (query.get('id')?.startsWith('eq.')) result = result.filter(row => row.id === query.get('id').slice(3));
      if (query.get('id')?.startsWith('like.edutg_')) result = result.filter(row => /^edutg_/.test(row.id));
      if (query.get('order')) result.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      return Response.json(result.slice(0, Number(query.get('limit') || 1000)));
    }
    throw new Error('Unexpected network request');
  });
  return {
    rows, calls, notes: () => [...rows.values()].filter(row => /^edutg_/.test(row.id)), beforeIndexPatch: hook => { beforeIndexPatch = hook; },
    async request({ method = 'GET', body, authenticated = true, query = {} } = {}) {
      const res = { code: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, end(bytes) { this.bytes = bytes; return this; } };
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
test('source administrator posts auto-publish encrypted daily notes without touching channels; retries/edits keep one stable note', async t => {
  const f = fixture(t);
  assert.deepEqual(await ingestEduTelegramUpdate(message()), { handled: true, count: 1 });
  await ingestEduTelegramUpdate(message());
  await ingestEduTelegramUpdate({ edited_message: message({ text: 'Düzeltilen günlük not', edit_date: 1795180001 }).message });
  assert.equal(f.notes().length, 1);
  const row = f.notes()[0], scope = 'telegram-inbox:' + row.id.slice(6);
  assert.match(row.id, /^edutg_[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(row).includes('Düzeltilen günlük not'));
  assert.equal(openChannels(row.data, scope).body, 'Düzeltilen günlük not');
  assert.equal(openChannels(row.data, scope).from, undefined);
  assert.equal(openChannels(row.data, scope).publication, 'daily');
  assert.throws(() => openChannels(row.data, 'telegram-inbox:' + '0'.repeat(64)));
  assert.ok(!f.calls.some(c => c.url.includes('id=eq.channels') || (c.method === 'POST' && c.body && JSON.parse(c.body).id === 'channels')));
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
  let row = f.notes()[0], record = openChannels(row.data, 'telegram-inbox:' + row.id.slice(6));
  assert.match(record.photos[0].url, /^data:image\/jpeg;base64,/);
  assert.ok(!JSON.stringify(record).includes('unit-bot'));
  await ingestEduTelegramUpdate(message({ text: undefined, caption: 'Büyük grafik', edit_date: 1795180001, photo: [{ file_id: 'p2', file_size: 900000 }] }));
  row = f.notes()[0]; record = openChannels(row.data, 'telegram-inbox:' + row.id.slice(6));
  assert.equal(record.photos.length, 0); assert.equal(record.photoMissing, true);
});
test('Telegram falls back to a smaller usable photo variant and accepts missing file_size', async t => {
  const f = fixture(t);
  await ingestEduTelegramUpdate(message({ text: undefined, caption: 'Grafik', photo: [
    { file_id: 'too-big', file_size: 900000 }, { file_id: 'usable', file_size: 220000 }, { file_id: 'unknown-size' },
  ] }));
  const record = openChannels(f.notes()[0].data, 'telegram-inbox:' + f.notes()[0].id.slice(6));
  assert.equal(record.photoMissing, false);
  assert.match(record.photos[0].url, /^data:image\/jpeg;base64,/);
  assert.ok(f.calls.some(c => c.url.endsWith('/getFile') && String(c.body || '').includes('usable')));
  assert.ok(!f.calls.some(c => String(c.body || '').includes('too-big')));
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
  assert.equal(read.body.items[0].excerpt, message().message.text);
  assert.equal(read.body.items[0].photos, undefined, 'management list loads full media only when opening an editor');
  const opened = await f.request({ query: { manage: read.body.items[0].id } });
  assert.equal(opened.body.item.body, message().message.text);
  assert.ok(!JSON.stringify(read.body).includes('ciphertext'));
  assert.equal((await f.request({ method: 'POST', body: { dismiss: 'channels' } })).code, 400);
  assert.equal((await f.request({ method: 'POST', body: { dismiss: read.body.items[0].id } })).code, 200);
  assert.equal(f.notes().length, 1);
  const hidden = openChannels(f.notes()[0].data, 'telegram-inbox:' + f.notes()[0].id.slice(6));
  assert.equal(hidden.publication, 'hidden');
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
  assert.equal(f.notes().length, 1);
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
test('Telegram notes appear on the anonymous home feed immediately, with a whitelisted full note and gated image URL', async t => {
  const f = fixture(t);
  await ingestEduTelegramUpdate(message({ photo: [{ file_id: 'p1', file_size: 1000 }] }));
  const feed = await f.request({ authenticated: false, query: { view: 'daily-notes' } });
  assert.equal(feed.code, 200); assert.equal(feed.body.items.length, 1);
  assert.match(feed.headers['Cache-Control'], /s-maxage=15/);
  const id = feed.body.items[0].id;
  assert.ok(!JSON.stringify(feed.body).includes('ciphertext'));
  assert.equal(feed.body.items[0].body, undefined, 'homepage uses a compact summary rather than downloading the entire archive');
  const full = await f.request({ authenticated: false, query: { view: 'daily-notes', note: id } });
  assert.equal(full.body.item.body, message().message.text);
  for (const key of ['manualOverride', 'sourceRevision', '_revision', 'publication', 'from']) assert.equal(full.body.item[key], undefined, key);
  assert.match(full.body.item.photos[0].url, /view=daily-notes&photo=/);
  const photo = await f.request({ authenticated: false, query: { view: 'daily-notes', photo: id } });
  assert.equal(photo.code, 200); assert.equal(photo.headers['Content-Type'], 'image/jpeg'); assert.ok(Buffer.isBuffer(photo.bytes));
});
test('manual daily notes use a stable per-draft ID, remain separate from lessons and require real admin writes', async t => {
  const f = fixture(t);
  const body = { action: 'save', draftId: 'same-draft', fields: { title: 'Manuel not', body: 'İlk metin', photos: [] } };
  const a = await f.request({ method: 'POST', query: { view: 'daily-notes' }, body });
  body.fields.body = 'Güncel metin';
  const b = await f.request({ method: 'POST', query: { view: 'daily-notes' }, body });
  assert.equal(a.code, 200); assert.equal(a.body.item.id, b.body.item.id); assert.equal(f.notes().length, 1);
  assert.equal(b.body.item.body, 'Güncel metin'); assert.equal(b.body.item.publication, 'daily');
  assert.equal((await f.request({ method: 'POST', authenticated: false, query: { view: 'daily-notes' }, body })).code, 401);
  assert.ok(!f.rows.has('channels'));
});
test('moderator edits and removals survive late Telegram retries/edits; restoring is explicit', async t => {
  const f = fixture(t); await ingestEduTelegramUpdate(message());
  const id = f.notes()[0].id, query = { view: 'daily-notes' };
  await f.request({ method: 'POST', query, body: { action: 'save', id, fields: { title: 'Düzenlendi', body: 'Yazarın düzelttiği metin', photos: [] } } });
  await ingestEduTelegramUpdate(message({ text: 'Telegramdaki yeni metin', edit_date: 1795180010 }));
  assert.equal((await f.request({ authenticated: false, query: { ...query, note: id } })).body.item.body, 'Yazarın düzelttiği metin');
  await f.request({ method: 'POST', query, body: { action: 'remove', id } });
  await ingestEduTelegramUpdate(message({ text: 'Yeniden geldi', edit_date: 1795180020 }));
  assert.equal((await f.request({ authenticated: false, query })).body.items.length, 0);
  assert.equal((await f.request({ authenticated: false, query: { ...query, note: id } })).code, 404);
  assert.equal((await f.request({ authenticated: false, query: { ...query, photo: id } })).code, 404);
  await f.request({ method: 'POST', query, body: { action: 'restore', id } });
  assert.equal((await f.request({ authenticated: false, query })).body.items.length, 1);
});
test('ordinary members cannot edit, hide or restore public notes', async t => {
  const f = fixture(t, { admin: false }), id = eduTelegramRowId(-10042, 50);
  for (const action of ['save', 'remove', 'restore']) {
    const r = await f.request({ method: 'POST', query: { view: 'daily-notes' }, body: { action, id, fields: { body: 'forged', photos: [] } } });
    assert.equal(r.code, 403);
  }
  assert.equal(f.rows.size, 0);
});
test('a newer Telegram edit cannot be reverted by an out-of-order old update', async t => {
  const f = fixture(t);
  await ingestEduTelegramUpdate(message({ text: 'Yeni sürüm', edit_date: 1795180030 }));
  await ingestEduTelegramUpdate(message({ text: 'Eski sürüm', edit_date: 1795180010 }));
  const full = await f.request({ authenticated: false, query: { view: 'daily-notes', note: f.notes()[0].id } });
  assert.equal(full.body.item.body, 'Yeni sürüm');
});
test('index failure causes retry; a duplicate source update repairs the home index without duplicating the note', async t => {
  const f = fixture(t, { failIndexOnce: true });
  await assert.rejects(ingestEduTelegramUpdate(message()), /edu_inbox_unavailable/);
  assert.equal(f.notes().length, 1);
  await ingestEduTelegramUpdate(message());
  const feed = await f.request({ authenticated: false, query: { view: 'daily-notes' } });
  assert.equal(feed.body.items.length, 1); assert.equal(f.notes().length, 1);
});
test('CAS on the home index prevents a late Telegram writer from resurrecting a moderator-hidden note', async t => {
  const f = fixture(t); await ingestEduTelegramUpdate(message());
  const id = f.notes()[0].id;
  f.beforeIndexPatch(async () => {
    const hidden = await f.request({ method: 'POST', query: { view: 'daily-notes' }, body: { action: 'remove', id } });
    assert.equal(hidden.code, 200);
  });
  await ingestEduTelegramUpdate(message({ text: 'Racing source edit', edit_date: 1795180040 }));
  const feed = await f.request({ authenticated: false, query: { view: 'daily-notes' } });
  assert.equal(feed.body.items.length, 0);
  assert.equal((await f.request({ authenticated: false, query: { view: 'daily-notes', note: id } })).code, 404);
});
test('legacy private inbox records are not exposed by public list, detail or image endpoints', async t => {
  const f = fixture(t), id = eduTelegramRowId(-10042, 99);
  f.rows.set(id, { id, updated_at: new Date().toISOString(), data: sealChannels({ title: 'Private legacy draft', body: 'Not public', photos: [{ url: 'data:image/jpeg;base64,/9j/AAEC' }] }, 'telegram-inbox:' + id.slice(6)) });
  assert.equal((await f.request({ authenticated: false, query: { view: 'daily-notes' } })).body.items.length, 0);
  for (const key of ['note', 'photo']) assert.equal((await f.request({ authenticated: false, query: { view: 'daily-notes', [key]: id } })).code, 404);
  assert.equal((await f.request({ authenticated: false, query: { view: 'daily-notes', note: 'channels' } })).code, 400);
});
test('public summaries whitelist fields even if private metadata is accidentally added to the index', async t => {
  const f = fixture(t); await ingestEduTelegramUpdate(message());
  const row = f.rows.get('edudaily_index'), scope = 'telegram-inbox:' + createHash('sha256').update('edudaily_index').digest('hex');
  const data = openChannels(row.data, scope);
  Object.assign(data.items[0], { owner: 'private@example.com', body: 'Full private payload', manualOverride: true });
  f.rows.set(row.id, { ...row, data: sealChannels(data, scope) });
  const feed = await f.request({ authenticated: false, query: { view: 'daily-notes' } });
  for (const key of ['owner', 'body', 'manualOverride']) assert.equal(feed.body.items[0][key], undefined);
});
test('manual daily validation rejects malformed media and overflow before writing, and cannot address lesson rows', async t => {
  const f = fixture(t), base = { action: 'save', draftId: 'draft-1', fields: { body: 'Not', photos: [] } };
  for (const fields of [{ body: 'x'.repeat(200001), photos: [] }, { body: 'Not', photos: [null] }, { body: 'Not', photos: [{ url: 'javascript:alert(1)' }] }, { body: '', photos: [] }]) {
    assert.equal((await f.request({ method: 'POST', query: { view: 'daily-notes' }, body: { ...base, fields } })).code, 400);
  }
  assert.equal((await f.request({ method: 'POST', query: { view: 'daily-notes' }, body: { ...base, id: 'channels' } })).code, 400);
  assert.equal(f.rows.size, 0);
});
test('trusted legacy source records synchronize automatically without approval, while unverifiable private drafts stay private', async t => {
  const f = fixture(t), id = eduTelegramRowId(-10042, 90), privateId = eduTelegramRowId(-10042, 91);
  for (const [key, url] of [[id, 'https://t.me/alfakasim/90?thread=4'], [privateId, 'https://t.me/other_group/91?thread=4']]) {
    f.rows.set(key, { id: key, updated_at: new Date().toISOString(), data: sealChannels({ title: 'Önceki kayıt', body: 'Eski içerik', url, photos: [], publishedAt: 1000 }, 'telegram-inbox:' + key.slice(6)) });
  }
  const result = await f.request({ method: 'POST', query: { view: 'daily-notes' }, body: { action: 'sync-source', ids: [id, privateId] } });
  assert.equal(result.code, 200); assert.equal(result.body.count, 1);
  const feed = await f.request({ authenticated: false, query: { view: 'daily-notes' } });
  assert.equal(feed.body.items.length, 1); assert.equal(feed.body.items[0].id, id);
  assert.equal((await f.request({ authenticated: false, query: { view: 'daily-notes', note: privateId } })).code, 404);
});
test('invalid source configuration fails closed rather than importing arbitrary unnamed groups', t => {
  fixture(t); process.env.TG_EDU_SOURCE_CHAT = '@';
  assert.equal(isEduTelegramUpdate(message({ chat: { id: -10042, type: 'supergroup' } })), false);
});
test('two consecutive long Telegram messages merge into one daily note', async t => {
  const f = fixture(t);
  const first = 'A'.repeat(3100), second = 'devamı burada başlıyor ve aynı notun ikinci parçası.';
  await ingestEduTelegramUpdate(message({ message_id: 70, date: 1795180100, text: first }));
  await ingestEduTelegramUpdate(message({ message_id: 71, date: 1795180101, text: second }));
  const feed = await f.request({ authenticated: false, query: { view: 'daily-notes' } });
  assert.equal(feed.body.items.length, 1);
  const id = eduTelegramRowId(-10042, 70);
  assert.equal(feed.body.items[0].id, id);
  const full = await f.request({ authenticated: false, query: { view: 'daily-notes', note: id } });
  assert.ok(full.body.item.body.includes(first + '\n' + second));
  assert.equal(stored(f, id).sourceParts.length, 2);
  assert.equal(stored(f, eduTelegramRowId(-10042, 71)).publication, 'hidden');
  assert.equal(stored(f, eduTelegramRowId(-10042, 71)).absorbedBy, id);
});
test('editing an absorbed part updates the merged note and a stale edit cannot revert it', async t => {
  const f = fixture(t);
  const first = 'B'.repeat(3100), second = 'ikinci parça';
  await ingestEduTelegramUpdate(message({ message_id: 72, date: 1795180200, text: first }));
  await ingestEduTelegramUpdate(message({ message_id: 73, date: 1795180201, text: second }));
  const id = eduTelegramRowId(-10042, 72);
  await ingestEduTelegramUpdate({ edited_message: message({ message_id: 73, date: 1795180201, text: 'DÜZELTİLMİŞ İKİNCİ PARÇA', edit_date: 1795180300 }).message });
  let full = await f.request({ authenticated: false, query: { view: 'daily-notes', note: id } });
  assert.ok(full.body.item.body.includes('DÜZELTİLMİŞ İKİNCİ PARÇA'));
  await ingestEduTelegramUpdate({ edited_message: message({ message_id: 73, date: 1795180201, text: 'ESKİ İKİNCİ PARÇA', edit_date: 1795180290 }).message });
  full = await f.request({ authenticated: false, query: { view: 'daily-notes', note: id } });
  assert.ok(!full.body.item.body.includes('ESKİ İKİNCİ PARÇA'));
  assert.equal((await f.request({ authenticated: false, query: { view: 'daily-notes' } })).body.items.length, 1);
});
test('manually edited or hidden notes are never absorbed into a following part', async t => {
  const f = fixture(t);
  const first = 'C'.repeat(3100), second = 'devam parçası';
  await ingestEduTelegramUpdate(message({ message_id: 74, date: 1795180400, text: first }));
  const manualId = eduTelegramRowId(-10042, 74);
  const saved = await f.request({ method: 'POST', query: { view: 'daily-notes' }, body: { action: 'save', id: manualId, fields: { title: 'Manuel', body: 'Manuel metin', photos: [] } } });
  assert.equal(saved.code, 200);
  await ingestEduTelegramUpdate(message({ message_id: 75, date: 1795180401, text: second }));
  const hiddenId = eduTelegramRowId(-10042, 75);
  assert.equal((await f.request({ method: 'POST', query: { view: 'daily-notes' }, body: { action: 'remove', id: hiddenId } })).code, 200);
  await ingestEduTelegramUpdate(message({ message_id: 76, date: 1795180402, text: 'üçüncü parça' }));
  const feed = await f.request({ authenticated: false, query: { view: 'daily-notes' } });
  assert.equal(feed.body.items.length, 2);
  assert.deepEqual(new Set(feed.body.items.map(item => item.id)), new Set([manualId, eduTelegramRowId(-10042, 76)]));
  assert.equal(stored(f, manualId).body, 'Manuel metin');
  assert.equal(stored(f, hiddenId).absorbedBy, undefined);
});
test('Telegram album parts merge into one note with all distinct photos', async t => {
  const f = fixture(t);
  await ingestEduTelegramUpdate(message({ message_id: 80, date: 1795180500, text: undefined, caption: 'Albüm açıklaması', photo: [{ file_id: 'album-a', file_size: 1000 }], media_group_id: 'grp-1' }));
  await ingestEduTelegramUpdate(message({ message_id: 81, date: 1795180501, text: undefined, caption: 'İkinci görsel', photo: [{ file_id: 'album-b', file_size: 1000 }], media_group_id: 'grp-1' }));
  const feed = await f.request({ authenticated: false, query: { view: 'daily-notes' } });
  assert.equal(feed.body.items.length, 1);
  const id = eduTelegramRowId(-10042, 80);
  assert.equal(feed.body.items[0].id, id);
  const full = await f.request({ authenticated: false, query: { view: 'daily-notes', note: id } });
  assert.equal(full.body.item.body, 'Albüm açıklaması\nİkinci görsel');
  assert.equal(full.body.item.photos.length, 2);
  assert.notEqual(full.body.item.photos[0].url, full.body.item.photos[1].url);
  assert.equal(stored(f, id).sourceParts.length, 2);
  assert.equal(stored(f, id).mediaGroupId, 'grp-1');
});
test('short unrelated Telegram messages stay as separate daily notes', async t => {
  const f = fixture(t);
  await ingestEduTelegramUpdate(message({ message_id: 90, date: 1795180600, text: 'Kısa bir not' }));
  await ingestEduTelegramUpdate(message({ message_id: 91, date: 1795180601, text: 'devam gibi görünen kısa mesaj' }));
  const feed = await f.request({ authenticated: false, query: { view: 'daily-notes' } });
  assert.equal(feed.body.items.length, 2);
  assert.deepEqual(new Set(feed.body.items.map(item => item.id)), new Set([eduTelegramRowId(-10042, 90), eduTelegramRowId(-10042, 91)]));
});
test('pre-existing split notes are merged on the next public feed read', async t => {
  const f = fixture(t);
  const first = 'E'.repeat(3100), second = 'eski ikinci parça', publishedAt = 1795180700000;
  const ids = [eduTelegramRowId(-10042, 100), eduTelegramRowId(-10042, 101)];
  const texts = [first, second];
  ids.forEach((id, n) => {
    f.rows.set(id, { id, updated_at: new Date().toISOString(), data: sealChannels({
      title: texts[n].split('\n')[0].slice(0, 140), body: texts[n], photos: [], photoMissing: false,
      url: 'https://t.me/alfakasim/' + (100 + n) + '?thread=4', publishedAt, modifiedAt: publishedAt,
      source: 'telegram', sourceRevision: 1795180700 + n, publication: 'daily', journalDate: '2026-11-22',
    }, 'telegram-inbox:' + id.slice(6)) });
  });
  const indexId = 'edudaily_index', indexScope = 'telegram-inbox:' + createHash('sha256').update(indexId).digest('hex');
  f.rows.set(indexId, { id: indexId, updated_at: new Date().toISOString(), data: sealChannels({ items: ids.map((id, n) => ({
    id, title: texts[n].slice(0, 140), excerpt: texts[n].slice(0, 260), publishedAt, modifiedAt: publishedAt,
    photoCount: 0, source: 'telegram', photoUrl: '', pdf: null,
  })), stamps: {} }, indexScope) });
  const feed = await f.request({ authenticated: false, query: { view: 'daily-notes' } });
  assert.equal(feed.body.items.length, 1);
  assert.equal(feed.body.items[0].id, ids[0]);
  const full = await f.request({ authenticated: false, query: { view: 'daily-notes', note: ids[0] } });
  assert.ok(full.body.item.body.includes(first + '\n' + second));
  assert.equal(stored(f, ids[1]).publication, 'hidden');
  assert.equal(stored(f, ids[1]).absorbedBy, ids[0]);
});
