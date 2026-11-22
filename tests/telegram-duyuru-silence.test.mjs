import test from 'node:test';
import assert from 'node:assert/strict';
import telegramWebhook from '../lib/telegram-webhook.mjs';
import { handleTelegramUpdate } from '../lib/telegram-qa.mjs';
import { DUYURU_THREAD } from '../lib/telegram-topics.mjs';

const ENVS = {
  TG_BOT_TOKEN: 'unit-bot',
  TG_CHAT_ID: '-100123',
  TG_QA_CHAT_ID: '-100123',
  TELEGRAM_WEBHOOK_SECRET: 'unit-secret',
};

function setup(t) {
  for (const [key, value] of Object.entries(ENVS)) {
    const old = process.env[key];
    process.env[key] = value;
    t.after(() => { if (old === undefined) delete process.env[key]; else process.env[key] = old; });
  }
  const oldThread = process.env.TG_QA_THREAD;
  delete process.env.TG_QA_THREAD;
  t.after(() => { if (oldThread !== undefined) process.env.TG_QA_THREAD = oldThread; });

  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    const u = String(url);
    let body = null;
    try { body = typeof init.body === 'string' ? JSON.parse(init.body) : null; } catch { /* form data */ }
    calls.push({ url: u, body });
    if (u.includes('api.telegram.org')) return Response.json({ ok: true, result: { message_id: 1 } });
    return Response.json({ ok: true, result: {} });
  });
  return calls;
}

const res = () => ({ code: 0, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } });
const sends = calls => calls.filter(c => /sendMessage|sendPhoto/.test(c.url));

function message(id, thread, text, extra = {}) {
  return {
    update_id: id,
    message: {
      message_id: id, date: 1795190000, message_thread_id: thread,
      chat: { id: -100123, type: 'supergroup', username: 'alfatraderspublic' },
      from: { id: 77, is_bot: false }, text, ...extra,
    },
  };
}
function channelPost(id, text = 'Duyuru') {
  return { message_id: id, date: 1795190000, chat: { id: -100123, type: 'channel', username: 'alfatraderspublic' }, text };
}
async function post(update) {
  const r = res();
  await telegramWebhook({ method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 'unit-secret' }, body: update }, r);
  return r;
}

test('duyurular konusu sabit: /1', () => {
  assert.equal(DUYURU_THREAD, 1);
});

test('duyurular konusundaki mesaja bot cevap vermez', async t => {
  const calls = setup(t);
  const r = await post(message(9001, DUYURU_THREAD, 'Önemli duyuru: yeni özellik yayında.'));
  assert.equal(r.code, 200);
  assert.equal(r.body.skipped, 'announcements');
  assert.equal(sends(calls).length, 0);
});

test('duyurular guard yalnızca gerçek yeni üye servis mesajına açılır', async t => {
  const calls = setup(t);
  const join = {
    update_id: 9020,
    message: {
      message_id: 9020, date: 1795190000, message_thread_id: DUYURU_THREAD,
      chat: { id: -100123, type: 'supergroup', username: 'alfatraderspublic' },
      from: { id: 88, is_bot: false },
      new_chat_members: [{ id: 88, first_name: 'Yeni', last_name: 'Üye' }],
    },
  };
  const r = await post(join);
  assert.equal(r.code, 200);
  assert.equal(r.body.ok, true);
  assert.notEqual(r.body.skipped, 'announcements');
  assert.equal(sends(calls).length, 1);
  assert.equal(sends(calls)[0].body.message_thread_id, DUYURU_THREAD);

  const ordinary = await post(message(9021, DUYURU_THREAD, 'Duyuru metni'));
  assert.equal(ordinary.body.skipped, 'announcements');
  assert.equal(sends(calls).length, 1);
});

test('duyurular konusunda komut, mention ve fotoğraf da sessize alınır', async t => {
  const calls = setup(t);
  for (const [id, update] of [
    [9002, message(9002, DUYURU_THREAD, '/start')],
    [9003, message(9003, DUYURU_THREAD, 'Merhaba @alfaportfoy_bot')],
    [9004, message(9004, DUYURU_THREAD, '', { photo: [{ file_id: 'p1' }] })],
    [9005, { update_id: 9005, edited_message: message(9005, DUYURU_THREAD, 'Düzenlenen duyuru').message }],
  ]) {
    const r = await post(update);
    assert.equal(r.code, 200, 'update ' + id);
  }
  assert.equal(sends(calls).length, 0);
});

test('diğer konularda bot cevap vermeye devam eder', async t => {
  const calls = setup(t);
  const r = await post(message(9006, 4, '/start'));
  assert.equal(r.code, 200);
  const sent = sends(calls);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].body.message_thread_id, 4);
  assert.match(sent[0].body.text, /Alfa Traders piyasa asistanı/);
});

test('QA katmanı da duyurular konusunda cevap üretmez (ikinci savunma)', async t => {
  setup(t);
  const announce = message(9007, DUYURU_THREAD, 'Duyuru', { photo: [{ file_id: 'p1' }] }).message;
  assert.equal(await handleTelegramUpdate({ message: announce }), null);
  const normal = await handleTelegramUpdate({ message: message(9008, 4, '/start').message });
  assert.ok(normal && /Alfa Traders piyasa asistanı/.test(normal.reply));
});
test('duyuru kanalının kanal gönderileri, callback ve komutları da sessize alınır', async t => {
  const calls = setup(t);
  const updates = [
    { update_id: 9010, channel_post: channelPost(9010) },
    { update_id: 9011, edited_channel_post: channelPost(9011, 'Düzenlenen duyuru') },
    { update_id: 9012, callback_query: { id: 'cb-1', message: message(9012, DUYURU_THREAD, '/data').message, data: 'noop' } },
    message(9013, '1', '/ask BTC'),
    message(9014, DUYURU_THREAD, '/grafik BTC'),
    message(9015, DUYURU_THREAD, '/data'),
  ];
  for (const update of updates) {
    const r = await post(update);
    assert.equal(r.code, 200);
    assert.equal(r.body.skipped, 'announcements');
  }
  assert.equal(sends(calls).length, 0);
});
test('QA katmanı kanal duyurularında da cevap üretmez', async t => {
  setup(t);
  const announce = channelPost(9016);
  assert.equal(await handleTelegramUpdate({ channel_post: announce }), null);
  assert.equal(await handleTelegramUpdate({ edited_channel_post: announce }), null);
  const normal = await handleTelegramUpdate({ message: message(9017, 4, 'BTC ne durumda?').message });
  assert.ok(normal && normal.reply);
});
