import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseUid,
  maskUid,
  displayName,
  statusLabel,
  verificationPendingText,
  adminTelegramIds,
  isAdminTelegram,
  welcomeKeyboard,
  exchangeKeyboard,
  uidKeyboard,
  confirmKeyboard,
  statusKeyboard,
  adminDecisionKeyboard,
  handlePrivateOnboarding,
  handleOnboardingCallback
} from '../lib/telegram-onboarding.mjs';

const saved = { ...process.env };

function cleanEnv() {
  delete process.env.BYBIT_API_KEY;
  delete process.env.BYBIT_API_SECRET;
  delete process.env.OKX_API_KEY;
  delete process.env.OKX_API_SECRET;
  delete process.env.OKX_API_PASSPHRASE;
  delete process.env.TG_MENTORSHIP_CHAT_ID;
  delete process.env.TG_ADMIN_IDS;
  delete process.env.TG_ADMIN_CHAT_ID;
  delete process.env.TG_ADMIN_ID;
}

function restoreEnv() {
  process.env = { ...saved };
}

function jsonRes(obj, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => obj,
    text: async () => JSON.stringify(obj)
  };
}

function mockFetch(handler) {
  const real = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const entry = { url: String(url), init: init || {} };
    calls.push(entry);
    return handler(entry);
  };
  return {
    calls,
    restore() { globalThis.fetch = real; },
    sentMessages() {
      return calls
        .filter((c) => /\/sendMessage$/.test(c.url))
        .map((c) => JSON.parse(c.init.body));
    },
    patches() {
      return calls
        .filter((c) => (c.init.method || '').toUpperCase() === 'PATCH')
        .map((c) => JSON.parse(c.init.body));
    }
  };
}

function baseRec(over = {}) {
  return {
    telegram_id: 42,
    username: 'test',
    first_name: 'Test',
    exchange: null,
    exchange_uid: null,
    status: 'none',
    step: 'idle',
    draft_exchange: null,
    draft_uid: null,
    attempts: 0,
    mentor_status: 'none',
    ...over
  };
}

// Tablo hazir + Telegram gonderimi basarili + DB yazimi basarili varsayimi.
function defaultHandler(over = {}) {
  return (entry) => {
    const u = entry.url;
    const method = (entry.init.method || 'GET').toUpperCase();
    if (u.includes('api.telegram.org') && u.endsWith('/sendMessage')) {
      return jsonRes({ ok: true, result: { message_id: 1 } });
    }
    if (u.includes('api.telegram.org') && u.endsWith('/answerCallbackQuery')) {
      return jsonRes({ ok: true, result: true });
    }
    if (u.includes('/rest/v1/telegram_access?select=telegram_id&limit=1')) {
      return jsonRes([]);
    }
    if (u.includes('/rest/v1/telegram_access') && method === 'GET') {
      return jsonRes(over.rows || []);
    }
    if (u.includes('/rest/v1/telegram_access') && method === 'POST') {
      const body = JSON.parse(entry.init.body)[0];
      return jsonRes([{ ...baseRec(body), ...(over.upserted || {}) }]);
    }
    if (u.includes('/rest/v1/telegram_access') && method === 'PATCH') {
      const body = JSON.parse(entry.init.body);
      return jsonRes([{ ...baseRec(over.patchedBase || {}), ...body }]);
    }
    return jsonRes({}, 404);
  };
}

test('UID ayrıştırma: yalnızca 4-20 rakam', () => {
  assert.equal(parseUid(' 1513500 '), '1513500');
  assert.equal(parseUid('151 3500'), '1513500');
  assert.equal(parseUid('151-3500'), '1513500');
  assert.equal(parseUid('123'), null);
  assert.equal(parseUid('abc1234'), null);
  assert.equal(parseUid('123456789012345678901'), null);
  assert.equal(parseUid(''), null);
});

test('UID maskeleme uzun kimlikte ortayi gizler', () => {
  assert.equal(maskUid('1234567890'), '12…890');
  assert.equal(maskUid('1234'), '1234');
  assert.equal(maskUid(''), '');
});

test('görünen ad ve durum etiketleri', () => {
  assert.equal(displayName({ first_name: 'Ali', last_name: 'Veli' }), 'Ali Veli');
  assert.equal(displayName({ username: 'ali' }), '@ali');
  assert.equal(displayName({}), 'uye');

  assert.equal(statusLabel(null), 'none');
  assert.equal(statusLabel(baseRec({ status: 'pending' })), 'pending');
  assert.equal(statusLabel(baseRec({ status: 'rejected' })), 'rejected');
  assert.equal(statusLabel(baseRec({ status: 'verified' })), 'verified');
  assert.equal(statusLabel(baseRec({ status: 'verified', mentor_invite: 'https://t.me/+x' })), 'invited');
  assert.equal(statusLabel(baseRec({ status: 'verified', mentor_joined_at: '2026-01-01T00:00:00Z' })), 'joined');
});

test('bekleme mesajları kullanıcıyı suçlamaz', () => {
  assert.match(verificationPendingText('not_configured'), /yönetici/i);
  assert.match(verificationPendingText('rate_limited'), /Tekrar dene/i);
  assert.match(verificationPendingText('error'), /Tekrar dene/i);
  assert.doesNotMatch(verificationPendingText('error'), /bulunamadı/i);
});

test('yönetici id listesi env ile ezilebilir', () => {
  cleanEnv();
  process.env.TG_ADMIN_IDS = '111, 222';
  assert.deepEqual(adminTelegramIds(), ['111', '222']);
  assert.equal(isAdminTelegram(222), true);
  assert.equal(isAdminTelegram('333'), false);

  delete process.env.TG_ADMIN_IDS;
  assert.deepEqual(adminTelegramIds(), ['5122809433']);
  restoreEnv();
});

test('klavyeler doğru callback ve linkleri taşır', () => {
  const welcome = welcomeKeyboard();
  const data = welcome.inline_keyboard.flat().map((b) => b.callback_data);
  assert.ok(data.includes('ex:bybit'));
  assert.ok(data.includes('ex:okx'));
  assert.ok(data.includes('nav:support'));

  assert.equal(exchangeKeyboard().inline_keyboard.flat()[0].callback_data, 'ex:bybit');
  assert.equal(uidKeyboard().inline_keyboard[0][0].callback_data, 'nav:start');
  assert.equal(confirmKeyboard().inline_keyboard[0][0].callback_data, 'ok:verify');

  const live = statusKeyboard(baseRec({
    status: 'verified',
    mentor_invite: 'https://t.me/+abc',
    mentor_invite_expires_at: new Date(Date.now() + 86400000).toISOString()
  }));
  const join = live.inline_keyboard.flat().find((b) => b.url);
  assert.equal(join.url, 'https://t.me/+abc');

  const expired = statusKeyboard(baseRec({
    status: 'verified',
    mentor_invite: 'https://t.me/+abc',
    mentor_invite_expires_at: new Date(Date.now() - 86400000).toISOString()
  }));
  assert.equal(expired.inline_keyboard.flat().some((b) => b.url), false);

  const pending = statusKeyboard(baseRec({ status: 'pending' }));
  assert.ok(pending.inline_keyboard.flat().some((b) => b.callback_data === 'nav:retry'));

  const adm = adminDecisionKeyboard(42);
  assert.deepEqual(adm.inline_keyboard[0].map((b) => b.callback_data), ['adm:ok:42', 'adm:no:42']);
});

test('DM /start: karşılama ve borsa butonları gönderilir', async () => {
  cleanEnv();
  process.env.TG_BOT_TOKEN = 'test-token';
  process.env.SUPABASE_SERVICE_ROLE = 'test-service-role';
  process.env.TG_CHAT_ID = '-100999';
  const stub = mockFetch(defaultHandler());
  try {
    const handled = await handlePrivateOnboarding({
      message: {
        chat: { id: 42, type: 'private' },
        from: { id: 42, first_name: 'Test', username: 'test' },
        text: '/start'
      }
    });
    assert.equal(handled, true);
    const msgs = stub.sentMessages();
    assert.equal(msgs.length, 1);
    assert.equal(String(msgs[0].chat_id), '42');
    assert.match(msgs[0].text, /premium doğrulama/i);
    const callbacks = msgs[0].reply_markup.inline_keyboard.flat().map((b) => b.callback_data);
    assert.ok(callbacks.includes('ex:bybit'));
    assert.ok(callbacks.includes('ex:okx'));
  } finally {
    stub.restore();
    restoreEnv();
  }
});

test('DM serbest soru doğrulama akışını başlatmaz (Q&A\'ya devreder)', async () => {
  cleanEnv();
  process.env.TG_BOT_TOKEN = 'test-token';
  process.env.SUPABASE_SERVICE_ROLE = 'test-service-role';
  const stub = mockFetch(defaultHandler());
  try {
    const handled = await handlePrivateOnboarding({
      message: {
        chat: { id: 42, type: 'private' },
        from: { id: 42, first_name: 'Test' },
        text: 'BTC şu an hangi yöne baskın?'
      }
    });
    assert.equal(handled, false);
    assert.equal(stub.sentMessages().length, 0);
  } finally {
    stub.restore();
    restoreEnv();
  }
});

test('await_uid adımı: geçerli UID onay ekranına geçer', async () => {
  cleanEnv();
  process.env.TG_BOT_TOKEN = 'test-token';
  process.env.SUPABASE_SERVICE_ROLE = 'test-service-role';
  const rec = baseRec({ step: 'await_uid', draft_exchange: 'bybit' });
  const stub = mockFetch(defaultHandler({ rows: [rec] }));
  try {
    const handled = await handlePrivateOnboarding({
      message: {
        chat: { id: 42, type: 'private' },
        from: { id: 42, first_name: 'Test' },
        text: '151 3500'
      }
    });
    assert.equal(handled, true);
    const patches = stub.patches();
    assert.equal(patches.length, 1);
    assert.equal(patches[0].step, 'confirm');
    assert.equal(patches[0].draft_uid, '1513500');
    const msg = stub.sentMessages()[0];
    assert.match(msg.text, /1513500/);
    assert.equal(msg.reply_markup.inline_keyboard[0][0].callback_data, 'ok:verify');
  } finally {
    stub.restore();
    restoreEnv();
  }
});

test('onay: anahtar yoksa pending kaydedilir ve yöneticiye buton gider', async () => {
  cleanEnv();
  process.env.TG_BOT_TOKEN = 'test-token';
  process.env.SUPABASE_SERVICE_ROLE = 'test-service-role';
  process.env.TG_CHAT_ID = '-100999';
  const rec = baseRec({ step: 'confirm', draft_exchange: 'bybit', draft_uid: '1513500' });
  const stub = mockFetch(defaultHandler({ rows: [rec] }));
  try {
    const handled = await handleOnboardingCallback({
      id: 'cb1',
      from: { id: 42, first_name: 'Test', username: 'test' },
      data: 'ok:verify'
    });
    assert.equal(handled, true);

    const patches = stub.patches();
    assert.equal(patches.length, 1);
    assert.equal(patches[0].status, 'pending');
    assert.equal(patches[0].check_reason, 'not_configured');
    assert.equal(patches[0].exchange_uid, '1513500');

    const msgs = stub.sentMessages();
    const adminMsg = msgs.find((m) => String(m.chat_id) === '-100999');
    assert.ok(adminMsg);
    const admCb = adminMsg.reply_markup.inline_keyboard.flat().map((b) => b.callback_data);
    assert.ok(admCb.includes('adm:ok:42'));
    assert.ok(admCb.includes('adm:no:42'));

    const userMsgs = msgs.filter((m) => String(m.chat_id) === '42');
    const pendingMsg = userMsgs.find((m) => /Başvurun alındı/.test(m.text));
    assert.ok(pendingMsg);
    assert.doesNotMatch(pendingMsg.text, /bulunamadı/i);
  } finally {
    stub.restore();
    restoreEnv();
  }
});
