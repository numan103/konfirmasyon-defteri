import test from 'node:test';
import assert from 'node:assert/strict';
import telegramWebhook from '../lib/telegram-webhook.mjs';
import { DUYURU_THREAD, DUYURULAR_LINKI } from '../lib/telegram-topics.mjs';
import {
  isJoinServiceMessage,
  isChatMemberJoin,
  welcomeText,
  welcomeKeyboard,
  resetJoinWelcomeState,
} from '../lib/telegram-join-welcome.mjs';

const CHAT = { id: -100123, type: 'supergroup', username: 'alfatraderspublic', title: 'Alfa Traders Public' };
const ada = { id: 101, first_name: 'Ada', last_name: 'Yılmaz', username: 'ada' };
const veli = { id: 102, first_name: 'Veli', last_name: 'Demir', username: 'veli' };

function fixture(t, { canDelete = true, status = 'administrator', conflictOnce = false } = {}) {
  resetJoinWelcomeState();
  const envs = {
    TG_BOT_TOKEN: 'unit-bot',
    TELEGRAM_WEBHOOK_SECRET: 'unit-secret',
    SUPABASE_SERVICE_ROLE: 'unit-service',
    EDU_CHANNEL_SECRET: 'unit-channel-secret',
    TG_CHAT_ID: '-100123',
    TG_QA_CHAT_ID: '-100123',
  };
  for (const [key, value] of Object.entries(envs)) {
    const old = process.env[key];
    process.env[key] = value;
    t.after(() => { if (old === undefined) delete process.env[key]; else process.env[key] = old; });
  }
  const oldMentorshipChat = process.env.TG_MENTORSHIP_CHAT_ID;
  delete process.env.TG_MENTORSHIP_CHAT_ID;
  t.after(() => { if (oldMentorshipChat !== undefined) process.env.TG_MENTORSHIP_CHAT_ID = oldMentorshipChat; });

  const rows = new Map();
  const calls = [];
  let messageId = 1000;
  let conflicted = false;
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    const u = new URL(String(url));
    const method = String(init.method || 'GET').toUpperCase();
    let body = null;
    try { body = typeof init.body === 'string' ? JSON.parse(init.body) : null; } catch { /* form */ }
    calls.push({ url: String(url), path: u.pathname, method, body });

    if (u.hostname === 'api.telegram.org') {
      if (u.pathname.endsWith('/sendMessage')) return Response.json({ ok: true, result: { message_id: ++messageId } });
      if (u.pathname.endsWith('/deleteMessage')) return Response.json({ ok: true, result: true });
      if (u.pathname.endsWith('/getMe')) return Response.json({ ok: true, result: { id: 987, username: 'alfaportfoy_bot' } });
      if (u.pathname.endsWith('/getChatMember')) return Response.json({ ok: true, result: { status, can_delete_messages: canDelete } });
    }
    if (u.pathname.endsWith('/rest/v1/edu_shared')) {
      if (conflictOnce && !conflicted && method === 'PATCH') {
        conflicted = true;
        return Response.json([]);
      }
      if (method === 'GET') {
        const id = u.searchParams.get('id')?.replace(/^eq\./, '');
        return Response.json(id && rows.has(id) ? [rows.get(id)] : []);
      }
      if (method === 'POST') {
        const row = body;
        if (rows.has(row.id)) return Response.json([]);
        rows.set(row.id, row);
        return Response.json([row]);
      }
      if (method === 'PATCH') {
        const id = u.searchParams.get('id')?.replace(/^eq\./, '');
        const revision = u.searchParams.get('updated_at')?.replace(/^eq\./, '');
        const current = rows.get(id);
        if (!current || (revision && current.updated_at !== revision)) return Response.json([]);
        const next = { ...current, ...body };
        rows.set(id, next);
        return Response.json([next]);
      }
    }
    throw new Error('Unexpected network request: ' + u.pathname);
  });

  const response = () => ({ code: 0, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
  async function post(update, secret = 'unit-secret') {
    const res = response();
    await telegramWebhook({
      method: 'POST',
      headers: { 'x-telegram-bot-api-secret-token': secret },
      body: update,
    }, res);
    return res;
  }
  return {
    rows,
    calls,
    post,
    sends: () => calls.filter(c => c.path.endsWith('/sendMessage')),
    deletes: () => calls.filter(c => c.path.endsWith('/deleteMessage')),
    permissionCalls: () => calls.filter(c => c.path.endsWith('/getMe') || c.path.endsWith('/getChatMember')),
  };
}

function joinMessage(updateId, users, extra = {}) {
  return {
    update_id: updateId,
    message: {
      message_id: 8000 + updateId,
      date: 1795190000,
      message_thread_id: DUYURU_THREAD,
      chat: { ...CHAT },
      from: { id: users[0]?.id || 77, is_bot: false },
      new_chat_members: users,
      ...extra,
    },
  };
}

function chatMemberJoin(updateId, user, extra = {}) {
  return {
    update_id: updateId,
    chat_member: {
      chat: { ...CHAT },
      from: { id: user.id, is_bot: false },
      date: 1795190000,
      old_chat_member: { status: 'left', user },
      new_chat_member: { status: 'member', user },
      ...extra,
    },
  };
}

test('Duyurular birleşik katılım mesajı tam metin, buton ve thread ile gönderilir', async t => {
  const f = fixture(t);
  const res = await f.post(joinMessage(1, [ada]));
  assert.equal(res.code, 200);
  assert.equal(res.body.ok, true);
  assert.notEqual(res.body.skipped, 'announcements');

  const sent = f.sends();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].body.chat_id, '-100123');
  assert.equal(sent[0].body.message_thread_id, DUYURU_THREAD);
  assert.equal(sent[0].body.text, welcomeText('Ada Yılmaz'));
  assert.equal(sent[0].body.text, [
    '👋 Hoş geldin Ada Yılmaz!',
    '',
    'Burası sinyal grubu değil, burada NEDEN işlem aldığımızı öğreniyoruz.',
    '',
    '🚀 İlk 3 adım:',
    "1️⃣ Duyurular'daki sabit mesajı oku",
    '2️⃣ Chat\'te kendini kısaca tanıt:',
    '   • Ne kadar süredir trade yapıyorsun? (Yeni mi başladın?)',
    '   • En çok hangi pariteleri trade ediyorsun?',
    '3️⃣ Public Charts\'ta ilk grafiğini paylaş',
  ].join('\n'));
  assert.deepEqual(sent[0].body.reply_markup, { inline_keyboard: [[{ text: '🚀 Buradan Başla', url: DUYURULAR_LINKI }]] });
  assert.equal(DUYURULAR_LINKI, 'https://t.me/alfatraderspublic/1');

  assert.equal(f.deletes().length, 1);
  assert.equal(f.deletes()[0].body.message_id, 8001);
  assert.equal(f.permissionCalls().length, 2);
});

test('aynı servis mesajında birden fazla üye tek karşılamada birleştirilir', async t => {
  const f = fixture(t);
  await f.post(joinMessage(2, [ada, veli]));
  const sent = f.sends();
  assert.equal(sent.length, 1);
  assert.match(sent[0].body.text, /^👋 Hoş geldin Ada Yılmaz, Veli Demir!/);
  assert.ok(!/^👋 Hoş geldin Ada Yılmaz!\n\n👋/.test(sent[0].body.text));
});

test('yeni karşılama önceki karşılamayı ve katılım servis mesajını siler', async t => {
  const f = fixture(t);
  await f.post(joinMessage(3, [ada]));
  await f.post(joinMessage(4, [veli]));

  assert.equal(f.sends().length, 2);
  const deletedIds = f.deletes().map(c => c.body.message_id);
  assert.ok(deletedIds.includes(8003), 'ilk katılım servis mesajı silinir');
  assert.ok(deletedIds.includes(1001), 'önceki karşılama mesajı silinir');
  assert.ok(deletedIds.includes(8004), 'ikinci katılım servis mesajı silinir');
});

test('aynı katılım chat_member ile tekrar gelirse ikinci karşılama gönderilmez', async t => {
  const f = fixture(t);
  await f.post(joinMessage(5, [ada]));
  await f.post(chatMemberJoin(6, ada));
  assert.equal(f.sends().length, 1);
});

test('chat_member gerçek katılımı Duyurular konusuna karşılama gönderir', async t => {
  const f = fixture(t);
  const res = await f.post(chatMemberJoin(7, veli));
  assert.equal(res.code, 200);
  assert.equal(f.sends().length, 1);
  assert.equal(f.sends()[0].body.text, welcomeText('Veli Demir'));
  assert.equal(f.sends()[0].body.message_thread_id, DUYURU_THREAD);
  assert.equal(f.deletes().length, 0, 'chat_member servis mesajı kimliği taşımaz');
});

test('bot katılımları, bot kaynaklı mesajlar ve diğer sistem mesajları sessizce yok sayılır', async t => {
  const f = fixture(t);
  for (const update of [
    joinMessage(8, [{ id: 900, is_bot: true, first_name: 'Diğer Bot' }]),
    joinMessage(9, [ada], { from: { id: 901, is_bot: true } }),
    joinMessage(10, [ada], { sender_chat: { id: -100, type: 'channel' } }),
    joinMessage(11, [ada], { left_chat_member: ada }),
    chatMemberJoin(12, { id: 902, is_bot: true, first_name: 'Bot' }),
    chatMemberJoin(13, ada, { old_chat_member: { status: 'member', user: ada } }),
  ]) {
    await f.post(update);
  }
  assert.equal(f.sends().length, 0);
  assert.equal(f.deletes().length, 0);
});

test('karşılama yalnızca Duyurular grubunun General konusunda çalışır', () => {
  const join = joinMessage(14, [ada]);
  assert.equal(isJoinServiceMessage(join.message), true);
  assert.equal(isJoinServiceMessage(joinMessage(15, [ada], { message_thread_id: 4 }).message), false);
  assert.equal(isJoinServiceMessage(joinMessage(16, [ada], {
    chat: { id: -100999, type: 'supergroup', username: 'baska_grup' },
  }).message), false);
  assert.equal(isJoinServiceMessage({ message: { ...join.message, new_chat_members: undefined } }), false);
  assert.equal(isChatMemberJoin(chatMemberJoin(17, ada).chat_member), true);
  assert.equal(isChatMemberJoin({
    chat_member: { ...chatMemberJoin(18, ada).chat_member, chat: { id: -100999, type: 'supergroup', username: 'baska_grup' } },
  }), false);
});

test('başka konudaki katılım mesajı karşılama üretmez', async t => {
  const f = fixture(t);
  const res = await f.post(joinMessage(19, [ada], { message_thread_id: 4 }));
  assert.equal(res.code, 200);
  assert.equal(f.sends().length, 0);
  assert.equal(f.deletes().length, 0);
});

test('mesaj silme izni yoksa karşılama yine gönderilir, silme çağrısı yapılmaz', async t => {
  const f = fixture(t, { canDelete: false, status: 'member' });
  await f.post(joinMessage(20, [ada]));
  assert.equal(f.sends().length, 1);
  assert.equal(f.permissionCalls().length, 2);
  assert.equal(f.deletes().length, 0);
});

test('karşılama durumu şifreli tutulur ve CAS çakışmasında tekrar yazılır', async t => {
  const f = fixture(t, { conflictOnce: true });
  await f.post(joinMessage(21, [ada]));
  const row = f.rows.get('telegram_join_welcome');
  assert.ok(row);
  assert.equal(row.data.channelEnvelope, 1);
  assert.ok(!JSON.stringify(row).includes('Ada'));
  assert.equal(f.sends().length, 1);
});

test('sahte webhook secret karşılama dışında hiçbir ağ çağrısı yapmaz', async t => {
  const f = fixture(t);
  const res = await f.post(joinMessage(22, [ada]), 'wrong-secret');
  assert.equal(res.code, 403);
  assert.equal(res.body.error, 'forbidden');
  assert.equal(f.calls.length, 0);
});
