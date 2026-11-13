import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mentorshipConfigured,
  createMentorshipInvite,
  revokeMentorshipInvite,
  inviteIsLive
} from '../lib/mentorship.mjs';

const saved = { ...process.env };

function setup(chatId = '-1001234567890') {
  process.env.TG_BOT_TOKEN = 'test-token';
  process.env.TG_MENTORSHIP_CHAT_ID = chatId;
}
function clean() {
  delete process.env.TG_BOT_TOKEN;
  delete process.env.TG_MENTORSHIP_CHAT_ID;
}
function restore() {
  process.env = { ...saved };
}

function stubFetch(result, status = 200) {
  const real = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init: init || {} });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => result
    };
  };
  return {
    calls,
    restore() { globalThis.fetch = real; }
  };
}

test('mentorship: grup tanimli degilse davet uretilmez', async () => {
  clean();
  assert.equal(mentorshipConfigured(), false);
  const out = await createMentorshipInvite();
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'not_configured');
  restore();
});

test('mentorship: tek kullanimlik ve sureli davet uretir', async () => {
  clean();
  setup();
  const stub = stubFetch({
    ok: true,
    result: { invite_link: 'https://t.me/+abc', name: 'bybit-1513500' }
  });
  try {
    const before = Math.floor(Date.now() / 1000);
    const out = await createMentorshipInvite({ name: 'bybit-1513500', ttlDays: 7 });
    assert.equal(out.ok, true);
    assert.equal(out.link, 'https://t.me/+abc');
    const expires = Math.floor(Date.parse(out.expires_at) / 1000);
    assert.ok(expires >= before + 6 * 86400);
    assert.ok(expires <= before + 8 * 86400);

    const call = stub.calls[0];
    assert.match(call.url, /\/bottest-token\/createChatInviteLink$/);
    const body = JSON.parse(call.init.body);
    assert.equal(body.chat_id, '-1001234567890');
    assert.equal(body.member_limit, 1);
    assert.equal(body.name, 'bybit-1513500');
    assert.ok(body.expire_date > before);
  } finally {
    stub.restore();
    restore();
  }
});

test('mentorship: davet adi 32 karaktere kirpilir', async () => {
  clean();
  setup();
  const stub = stubFetch({ ok: true, result: { invite_link: 'https://t.me/+x' } });
  try {
    await createMentorshipInvite({ name: 'x'.repeat(80) });
    const body = JSON.parse(stub.calls[0].init.body);
    assert.equal(body.name.length, 32);
  } finally {
    stub.restore();
    restore();
  }
});

test('mentorship: telegram hatasi gizlenmez', async () => {
  clean();
  setup();
  const stub = stubFetch({ ok: false, description: 'Bad Request: not enough rights' });
  try {
    const out = await createMentorshipInvite();
    assert.equal(out.ok, false);
    assert.equal(out.reason, 'telegram_error');
    assert.match(out.detail, /not enough rights/);
  } finally {
    stub.restore();
    restore();
  }
});

test('mentorship: link iptal edilebilir', async () => {
  clean();
  setup();
  const stub = stubFetch({ ok: true, result: true });
  try {
    const out = await revokeMentorshipInvite('https://t.me/+abc');
    assert.equal(out.ok, true);
    const call = stub.calls[0];
    assert.match(call.url, /revokeChatInviteLink$/);
    assert.equal(JSON.parse(call.init.body).invite_link, 'https://t.me/+abc');
  } finally {
    stub.restore();
    restore();
  }
});

test('mentorship: suresi dolmus link canli sayilmaz', () => {
  const now = Date.parse('2026-01-10T10:00:00Z');
  assert.equal(inviteIsLive('https://t.me/+a', '2026-01-20T10:00:00Z', now), true);
  assert.equal(inviteIsLive('https://t.me/+a', '2026-01-09T10:00:00Z', now), false);
  // 60 saniyelik guvenlik payi
  assert.equal(inviteIsLive('https://t.me/+a', '2026-01-10T10:00:30Z', now), false);
  assert.equal(inviteIsLive('', null, now), false);
  assert.equal(inviteIsLive('https://t.me/+a', null, now), true);
});
