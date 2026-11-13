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
  adminNotifyChatId,
  welcomeKeyboard,
  exchangeKeyboard,
  uidKeyboard,
  prepKeyboard,
  confirmKeyboard,
  statusKeyboard,
  adminDecisionKeyboard,
  handlePrivateOnboarding,
  handleOnboardingCallback,
  handleChatMember
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

test('yönetici bildirimi gruba değil özel sohbete gider', () => {
  cleanEnv();
  process.env.TG_CHAT_ID = '-1004496172434';
  // TG_CHAT_ID grup olsa bile varsayılan hedef yönetici DM'i.
  assert.equal(adminNotifyChatId(), '5122809433');

  process.env.TG_ADMIN_IDS = '111,222';
  assert.equal(adminNotifyChatId(), '111');

  process.env.TG_ADMIN_CHAT_ID = '777';
  assert.equal(adminNotifyChatId(), '777');
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

test('kayıt öncesi klavye: referans linkleri, hesap taşıma videosu ve UID geçişi', () => {
  const bybit = prepKeyboard('bybit').inline_keyboard.flat();
  const bybitUrls = bybit.map((b) => b.url).filter(Boolean);
  assert.ok(bybitUrls.includes('https://partner.bybit.com/b/cryptoahmet'));
  assert.ok(bybitUrls.includes('https://youtu.be/p0EcYJ40Kt0'));
  const bybitNav = bybit.find((b) => b.callback_data === 'nav:uid');
  assert.ok(bybitNav);
  assert.match(bybitNav.text, /UID/i);

  const okx = prepKeyboard('okx').inline_keyboard.flat();
  const okxUrls = okx.map((b) => b.url).filter(Boolean);
  assert.deepEqual(okxUrls, ['https://www.okx.com/join/CRYPTOAHMET']);
  assert.ok(okx.some((b) => b.callback_data === 'nav:uid'));
});

test('ex: callback önce kayıt/talimat gönderir, UID istemez', async () => {
  cleanEnv();
  process.env.TG_BOT_TOKEN = 'test-token';
  process.env.SUPABASE_SERVICE_ROLE = 'test-service-role';
  const stub = mockFetch(defaultHandler());
  try {
    const handled = await handleOnboardingCallback({
      id: 'cb-ex',
      from: { id: 42, first_name: 'Test', username: 'test' },
      data: 'ex:bybit'
    });
    assert.equal(handled, true);

    const patches = stub.patches();
    assert.equal(patches.length, 1);
    assert.equal(patches[0].step, 'await_uid');
    assert.equal(patches[0].draft_exchange, 'bybit');

    const msg = stub.sentMessages().find((m) => String(m.chat_id) === '42');
    assert.ok(msg);
    assert.match(msg.text, /önce kayıt/i);
    assert.match(msg.text, /partner\.bybit\.com\/b\/cryptoahmet/);
    assert.match(msg.text, /youtu\.be\/p0EcYJ40Kt0/);
    assert.doesNotMatch(msg.text, /UID'ni yaz/i);
    const buttons = msg.reply_markup.inline_keyboard.flat();
    assert.ok(buttons.some((b) => b.callback_data === 'nav:uid'));
  } finally {
    stub.restore();
    restoreEnv();
  }
});

test('nav:uid kayıt adımından sonra UID istemine geçer', async () => {
  cleanEnv();
  process.env.TG_BOT_TOKEN = 'test-token';
  process.env.SUPABASE_SERVICE_ROLE = 'test-service-role';
  const rec = baseRec({ step: 'await_uid', draft_exchange: 'okx' });
  const stub = mockFetch(defaultHandler({ rows: [rec] }));
  try {
    const handled = await handleOnboardingCallback({
      id: 'cb-uid',
      from: { id: 42, first_name: 'Test' },
      data: 'nav:uid'
    });
    assert.equal(handled, true);

    const patches = stub.patches();
    assert.equal(patches.length, 1);
    assert.equal(patches[0].step, 'await_uid');

    const msg = stub.sentMessages().find((m) => String(m.chat_id) === '42');
    assert.ok(msg);
    assert.match(msg.text, /OKX UID'ni aşağıya yaz/);
    assert.match(msg.text, /👇/);
  } finally {
    stub.restore();
    restoreEnv();
  }
});

test('prep adımında "hazır" yazınca UID istemine geçilir', async () => {
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
        text: 'hazır'
      }
    });
    assert.equal(handled, true);
    const patches = stub.patches();
    assert.equal(patches[0].step, 'await_uid');
    const msg = stub.sentMessages()[0];
    assert.match(msg.text, /Bybit UID'ni aşağıya yaz/);
  } finally {
    stub.restore();
    restoreEnv();
  }
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
  process.env.TG_ADMIN_CHAT_ID = '999';
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
    const adminMsg = msgs.find((m) => String(m.chat_id) === '999');
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


test('onaysız üye gruba girerse banlanır ve yöneticiye bildirilir', async () => {
  cleanEnv();
  process.env.TG_BOT_TOKEN = 'test-token';
  process.env.SUPABASE_SERVICE_ROLE = 'test-service-role';
  process.env.TG_MENTORSHIP_CHAT_ID = '-1004496172434';
  process.env.TG_ADMIN_CHAT_ID = '999';
  const rec = baseRec({ status: 'pending', step: 'idle', draft_exchange: 'okx', draft_uid: '559690094576450196' });
  const base = defaultHandler({ rows: [rec] });
  const stub = mockFetch((entry) => {
    if (/\/banChatMember$/.test(entry.url)) return jsonRes({ ok: true, result: true });
    if (/\/unbanChatMember$/.test(entry.url)) return jsonRes({ ok: true, result: true });
    return base(entry);
  });
  try {
    const handled = await handleChatMember({
      chat_member: {
        chat: { id: -1004496172434, type: 'supergroup', title: 'Alfa Traders Mentorship' },
        new_chat_member: { status: 'member', user: { id: 42, first_name: 'Özgür Can', username: 'justbread04' } }
      }
    });
    assert.equal(handled, true);
    assert.ok(stub.calls.some((c) => /\/banChatMember$/.test(c.url)));
    const patches = stub.patches();
    assert.ok(patches.some((p) => p.mentor_status === 'revoked'));
    const adminMsg = stub.sentMessages().find((m) => String(m.chat_id) === '999');
    assert.ok(adminMsg);
    assert.match(adminMsg.text, /Onaysız üye gruptan çıkarıldı/);
  } finally {
    stub.restore();
    restoreEnv();
  }
});

test('doğrulanmış üye gruba girerse banlanmaz ve joined işaretlenir', async () => {
  cleanEnv();
  process.env.TG_BOT_TOKEN = 'test-token';
  process.env.SUPABASE_SERVICE_ROLE = 'test-service-role';
  process.env.TG_MENTORSHIP_CHAT_ID = '-1004496172434';
  process.env.TG_ADMIN_CHAT_ID = '999';
  const rec = baseRec({ status: 'verified', exchange: 'okx', exchange_uid: '559690094576450196' });
  const base = defaultHandler({ rows: [rec] });
  const stub = mockFetch((entry) => {
    if (/\/banChatMember$/.test(entry.url)) return jsonRes({ ok: true, result: true });
    return base(entry);
  });
  try {
    const handled = await handleChatMember({
      chat_member: {
        chat: { id: -1004496172434, type: 'supergroup', title: 'Alfa Traders Mentorship' },
        new_chat_member: { status: 'member', user: { id: 42, first_name: 'Test', username: 'test' } }
      }
    });
    assert.equal(handled, true);
    assert.equal(stub.calls.some((c) => /\/banChatMember$/.test(c.url)), false);
    const patches = stub.patches();
    assert.ok(patches.some((p) => p.mentor_status === 'joined'));
    const adminMsg = stub.sentMessages().find((m) => String(m.chat_id) === '999');
    assert.match(adminMsg.text, /Mentorluk grubuna katıldı/);
  } finally {
    stub.restore();
    restoreEnv();
  }
});

test('yeni üye /start yazmadan "merhaba" yazınca borsa seçimi açılır', async () => {
  cleanEnv();
  process.env.TG_BOT_TOKEN = 'test-token';
  process.env.SUPABASE_SERVICE_ROLE = 'test-service-role';
  const stub = mockFetch(defaultHandler());
  try {
    const handled = await handlePrivateOnboarding({
      message: {
        chat: { id: 42, type: 'private' },
        from: { id: 42, first_name: 'Test', username: 'test' },
        text: 'merhaba'
      }
    });
    assert.equal(handled, true);
    const msg = stub.sentMessages().find((m) => String(m.chat_id) === '42');
    assert.ok(msg);
    assert.match(msg.text, /borsanı seç/i);
    const callbacks = msg.reply_markup.inline_keyboard.flat().map((b) => b.callback_data);
    assert.ok(callbacks.includes('ex:bybit'));
    assert.ok(callbacks.includes('ex:okx'));
    assert.ok(stub.patches().some((p) => p.step === 'choose_exchange'));
  } finally {
    stub.restore();
    restoreEnv();
  }
});

test('yeni üye doğrudan "OKX" yazınca kayıt ekranına geçilir', async () => {
  cleanEnv();
  process.env.TG_BOT_TOKEN = 'test-token';
  process.env.SUPABASE_SERVICE_ROLE = 'test-service-role';
  const stub = mockFetch(defaultHandler());
  try {
    const handled = await handlePrivateOnboarding({
      message: {
        chat: { id: 42, type: 'private' },
        from: { id: 42, first_name: 'Test' },
        text: 'OKX'
      }
    });
    assert.equal(handled, true);
    const msg = stub.sentMessages().find((m) => String(m.chat_id) === '42');
    assert.ok(msg);
    assert.equal(msg.text, [
      '⚫ OKX — önce kayıt',
      '',
      'UID yazmadan önce hesabının bizim referansımıza bağlı olması gerekir.',
      '',
      '1. Aşağıdaki OKX linkinden kaydol.',
      'https://www.okx.com/join/CRYPTOAHMET',
      '2. Mevcut OKX hesabın referansa taşınamıyorsa bu linkten YENİ bir hesap açman gerekir.',
      '3. Hesabına para yatır ve işlemlerini bu hesapta yap.',
      '4. Hazır olunca "Kaydım hazır, UID\'ye geç" butonuna bas.',
      '',
      'Not: Eğer OKX hesabınız varsa aile bireylerinden birinin üzerine yeni hesap açabilirsiniz; sürekli tekrar login istememektedir. 6 ayda bir giriş yeterlidir.',
      'Şifre veya API anahtarı istemiyorum, sadece UID.'
    ].join('\n'));
    const patch = stub.patches().find((p) => p.step === 'await_uid');
    assert.ok(patch);
    assert.equal(patch.draft_exchange, 'okx');
  } finally {
    stub.restore();
    restoreEnv();
  }
});

test('bekleyen üye serbest metin yazınca durum özeti görür', async () => {
  cleanEnv();
  process.env.TG_BOT_TOKEN = 'test-token';
  process.env.SUPABASE_SERVICE_ROLE = 'test-service-role';
  const rec = baseRec({ status: 'pending', exchange: 'okx', exchange_uid: '559690094576450196' });
  const stub = mockFetch(defaultHandler({ rows: [rec] }));
  try {
    const handled = await handlePrivateOnboarding({
      message: {
        chat: { id: 42, type: 'private' },
        from: { id: 42, first_name: 'Test' },
        text: 'naber'
      }
    });
    assert.equal(handled, true);
    const msg = stub.sentMessages().find((m) => String(m.chat_id) === '42');
    assert.ok(msg);
    assert.match(msg.text, /Başvurun inceleniyor/i);
    const callbacks = msg.reply_markup.inline_keyboard.flat().map((b) => b.callback_data);
    assert.ok(callbacks.includes('nav:retry'));
  } finally {
    stub.restore();
    restoreEnv();
  }
});

test('doğrulanmış üye serbest metin yazınca Q&A devralır', async () => {
  cleanEnv();
  process.env.TG_BOT_TOKEN = 'test-token';
  process.env.SUPABASE_SERVICE_ROLE = 'test-service-role';
  const rec = baseRec({ status: 'verified', exchange: 'okx', exchange_uid: '559690094576450196' });
  const stub = mockFetch(defaultHandler({ rows: [rec] }));
  try {
    const handled = await handlePrivateOnboarding({
      message: {
        chat: { id: 42, type: 'private' },
        from: { id: 42, first_name: 'Test' },
        text: 'merhaba'
      }
    });
    assert.equal(handled, false);
    assert.equal(stub.sentMessages().length, 0);
  } finally {
    stub.restore();
    restoreEnv();
  }
});

test('yönetici Onayla: kayıt verified olur, olmayan verified_by kolonu yazılmaz', async () => {
  cleanEnv();
  process.env.TG_BOT_TOKEN = 'test-token';
  process.env.SUPABASE_SERVICE_ROLE = 'test-service-role';
  const rec = baseRec({
    telegram_id: 7493339595,
    first_name: 'Trader Burcu',
    exchange: 'bybit',
    exchange_uid: '844565566562',
    status: 'pending',
    draft_exchange: 'bybit',
    draft_uid: '844565566562'
  });
  const stub = mockFetch(defaultHandler({ rows: [rec] }));
  try {
    const handled = await handleOnboardingCallback({
      id: 'cb-1',
      data: 'adm:ok:7493339595',
      from: { id: 5122809433, first_name: 'Admin' }
    });
    assert.equal(handled, true);
    const patch = stub.patches().find((p) => p.status === 'verified');
    assert.ok(patch);
    assert.equal('verified_by' in patch, false);
    assert.match(patch.check_reason, /admin_approved:5122809433/);
    assert.equal(patch.step, 'idle');
    const targetMsg = stub.sentMessages().find((m) => String(m.chat_id) === '7493339595');
    assert.ok(targetMsg);
    assert.match(targetMsg.text, /onayland[ıi]/i);
  } finally {
    stub.restore();
    restoreEnv();
  }
});
