import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ENV_KEYS = [
  'TG_BOT_TOKEN', 'TG_CHAT_ID', 'TG_THREAD', 'TG_TRADE_CHAT_ID', 'TG_TRADE_THREAD',
  'TG_TRADE_NOTIFY', 'SITE_ADMIN_EMAILS', 'SITE_ACCESS_OPEN', 'SUPABASE_PUBLISHABLE',
];

function resetEnv(env = {}) {
  for (const key of ENV_KEYS) delete process.env[key];
  Object.assign(process.env, env);
}

async function loadHandler(env) {
  resetEnv(env);
  const mod = await import('../api/contrib.mjs?case=' + Math.random());
  return mod.default;
}

function makeRes() {
  return {
    statusCode: 0,
    body: null,
    headers: {},
    ended: null,
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end(body) { this.ended = body; return this; },
  };
}

function makeStore() {
  return {
    data: { posts: [] },
    telegram: 'ok',
    calls: [],
  };
}

function fetchStub(state) {
  return async (url, init = {}) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) {
      return { ok: true, status: 200, json: async () => ({ id: 'user-1', email: 'admin@test.dev' }) };
    }
    if (u.includes('/rest/v1/edu_shared')) {
      const method = init.method || 'GET';
      if (method === 'GET') return { ok: true, status: 200, json: async () => [{ id: 'alfa_trading', data: state.data }] };
      const body = JSON.parse(init.body || '{}');
      if (method === 'POST') { state.data = body.data; return { ok: true, status: 201, json: async () => ({}) }; }
      if (method === 'PATCH') { state.data = body.data; return { ok: true, status: 204, json: async () => ({}) }; }
    }
    if (u.includes('api.telegram.org') && u.includes('/sendMessage')) {
      state.calls.push({ url: u, body: JSON.parse(init.body || '{}') });
      if (state.telegram === 'throw') throw new Error('network down');
      if (state.telegram === 'reject') return { ok: false, status: 400, json: async () => ({ ok: false, description: 'Bad Request: chat not found' }) };
      return { ok: true, status: 200, json: async () => ({ ok: true, result: { message_id: 321 } }) };
    }
    if (u.includes('api.telegram.org') && u.includes('/deleteMessage')) {
      state.calls.push({ url: u, kind: 'delete', body: JSON.parse(init.body || '{}') });
      if (state.telegram === 'reject') return { ok: false, status: 400, json: async () => ({ ok: false, description: 'Bad Request: message to delete not found' }) };
      return { ok: true, status: 200, json: async () => ({ ok: true, result: true }) };
    }
    return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
  };
}

async function addPost(handler, post, extra = {}) {
  const res = makeRes();
  const req = { method: 'POST', headers: { authorization: 'Bearer test-jwt' }, query: { store: 'alfatrading' }, body: { action: 'add', post, ...extra } };
  await handler(req, res);
  return res;
}

async function postAction(handler, body) {
  const res = makeRes();
  const req = { method: 'POST', headers: { authorization: 'Bearer test-jwt' }, query: { store: 'alfatrading' }, body };
  await handler(req, res);
  return res;
}

test('islem paylasimi public charts hedefine tek bildirim gonderir', async () => {
  const state = makeStore();
  globalThis.fetch = fetchStub(state);
  const handler = await loadHandler({
    TG_BOT_TOKEN: 'token', TG_CHAT_ID: '@charts', TG_THREAD: '434',
    SITE_ADMIN_EMAILS: 'admin@test.dev',
  });

  const res = await addPost(handler, {
    type: 'islem', coin: 'BTC', dir: 'long', entry: '100', tp: '110', sl: '95', lev: '5x',
    title: 'Kirilim sonrasi long', text: 'Hacim teyidiyle devam.',
  }, { clientId: 'client-1' });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(state.calls.length, 1);
  const call = state.calls[0];
  assert.equal(call.body.chat_id, '@charts');
  assert.equal(call.body.message_thread_id, 434);
  assert.equal(call.body.disable_web_page_preview, false);
  assert.match(call.body.text, /Yeni işlem/);
  assert.match(call.body.text, /BTC/);
  assert.match(call.body.text, /LONG/);
  assert.doesNotMatch(call.body.text, /Entry 100/);
  assert.doesNotMatch(call.body.text, /TP 110/);
  assert.doesNotMatch(call.body.text, /SL 95/);
  assert.doesNotMatch(call.body.text, /Kaldıraç 5x/);
  assert.doesNotMatch(call.body.text, /Entry|Kaldıraç/);
  assert.ok(call.body.text.includes('https://alfa-trader.com/?page=alfatrading&post=' + res.body.post.id));
  assert.ok(!call.body.text.includes('data:image'));
  assert.equal(res.body.notify.phase, 'sent');
  assert.equal(res.body.notify.messageId, 321);
  assert.equal(state.data.posts.length, 1);
  assert.equal(state.data.posts[0].tradeNotify.phase, 'sent');
});

test('ayni clientId tekrar gonderildiginde ikinci bildirim atmaz', async () => {
  const state = makeStore();
  globalThis.fetch = fetchStub(state);
  const handler = await loadHandler({
    TG_BOT_TOKEN: 'token', TG_CHAT_ID: '@charts', TG_THREAD: '434',
    SITE_ADMIN_EMAILS: 'admin@test.dev',
  });

  const first = await addPost(handler, { type: 'islem', coin: 'ETH', dir: 'short', entry: '3000' }, { clientId: 'same' });
  const second = await addPost(handler, { type: 'islem', coin: 'SOL', dir: 'long', entry: '150' }, { clientId: 'same' });

  assert.equal(first.body.post.id, second.body.post.id);
  assert.equal(second.body.duplicate, true);
  assert.equal(state.calls.length, 1);
  assert.equal(state.data.posts.length, 1);
});

test('analiz paylasimi Telegram bildirimi uretmez', async () => {
  const state = makeStore();
  globalThis.fetch = fetchStub(state);
  const handler = await loadHandler({
    TG_BOT_TOKEN: 'token', TG_CHAT_ID: '@charts', TG_THREAD: '434',
    SITE_ADMIN_EMAILS: 'admin@test.dev',
  });

  const res = await addPost(handler, { type: 'analiz', coin: 'BTC', title: 'Piyasa notu' });
  assert.equal(res.statusCode, 200);
  assert.equal(state.calls.length, 0);
  assert.equal(res.body.notify, null);
  assert.equal(state.data.posts[0].tradeNotify, null);
});

test('ag hatasinda paylasim kaydedilir, durum unknown kalir ve retry edilmez', async () => {
  const state = makeStore();
  state.telegram = 'throw';
  globalThis.fetch = fetchStub(state);
  const handler = await loadHandler({
    TG_BOT_TOKEN: 'token', TG_CHAT_ID: '@charts', TG_THREAD: '434',
    SITE_ADMIN_EMAILS: 'admin@test.dev',
  });

  const res = await addPost(handler, { type: 'islem', coin: 'BTC', dir: 'long' }, { clientId: 'net-1' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.notify.phase, 'unknown');
  assert.equal(state.data.posts.length, 1);
  assert.equal(state.data.posts[0].tradeNotify.phase, 'unknown');

  const again = await addPost(handler, { type: 'islem', coin: 'BTC', dir: 'long' }, { clientId: 'net-1' });
  assert.equal(again.body.duplicate, true);
  assert.equal(state.calls.length, 1);
});

test('Telegram reddinde durum failed olur, paylasim korunur', async () => {
  const state = makeStore();
  state.telegram = 'reject';
  globalThis.fetch = fetchStub(state);
  const handler = await loadHandler({
    TG_BOT_TOKEN: 'token', TG_CHAT_ID: '@charts', TG_THREAD: '434',
    SITE_ADMIN_EMAILS: 'admin@test.dev',
  });

  const res = await addPost(handler, { type: 'islem', coin: 'BTC', dir: 'short' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.notify.phase, 'failed');
  assert.equal(res.body.notify.http, 400);
  assert.match(res.body.notify.error, /chat not found/);
  assert.equal(state.data.posts.length, 1);
});

test('dryRun bildirim metnini dondurur ama gonderim yapmaz', async () => {
  const state = makeStore();
  globalThis.fetch = fetchStub(state);
  const handler = await loadHandler({
    TG_BOT_TOKEN: 'token', TG_CHAT_ID: '@charts', TG_THREAD: '434',
    SITE_ADMIN_EMAILS: 'admin@test.dev',
  });

  const res = await addPost(handler, { type: 'islem', coin: 'XAU', dir: 'long', entry: '4250' }, { dryRun: true });
  assert.equal(res.statusCode, 200);
  assert.equal(state.calls.length, 0);
  assert.equal(res.body.notify.phase, 'dry_run');
  assert.match(res.body.notify.preview, /XAU/);
  assert.doesNotMatch(res.body.notify.preview, /Entry 4250/);
  assert.doesNotMatch(res.body.notify.preview, /Entry|TP|SL|Kaldıraç/);
});

test('Telegram ayarlari yoksa paylasim kaydedilir, bildirim disabled kalir', async () => {
  const state = makeStore();
  globalThis.fetch = fetchStub(state);
  const handler = await loadHandler({ SITE_ADMIN_EMAILS: 'admin@test.dev' });

  const res = await addPost(handler, { type: 'islem', coin: 'BTC', dir: 'long' });
  assert.equal(res.statusCode, 200);
  assert.equal(state.calls.length, 0);
  assert.equal(res.body.notify.phase, 'disabled');
  assert.equal(state.data.posts.length, 1);
});

test('yonetici yanlis giden Telegram bildirimini silebilir', async () => {
  const state = makeStore();
  globalThis.fetch = fetchStub(state);
  const handler = await loadHandler({
    TG_BOT_TOKEN: 'token', TG_CHAT_ID: '@charts', TG_THREAD: '434',
    SITE_ADMIN_EMAILS: 'admin@test.dev',
  });

  const res = await postAction(handler, { action: 'delTg', messageId: 801 });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.deleted, 801);
  assert.equal(state.calls.length, 1);
  assert.equal(state.calls[0].kind, 'delete');
  assert.equal(state.calls[0].body.chat_id, '@charts');
  assert.equal(state.calls[0].body.message_id, 801);
});

test('yonetici olmayan uye Telegram bildirimi silemez', async () => {
  const state = makeStore();
  globalThis.fetch = fetchStub(state);
  // fetchStub admin@test.dev dondurur; admin listesinde olmadigi icin uye sayilir.
  const handler = await loadHandler({
    TG_BOT_TOKEN: 'token', TG_CHAT_ID: '@charts',
    SITE_ADMIN_EMAILS: 'baska@test.dev',
  });

  const res = await postAction(handler, { action: 'delTg', messageId: 801 });
  assert.equal(res.statusCode, 403);
  assert.equal(state.calls.length, 0);
});

test('bulanik gorsel ucu JPEG baytlarini servis eder, yoksa /og.png fallback yapar', async () => {
  const state = makeStore();
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  state.data.posts = [{ id: 'p1', imgBlur: 'data:image/jpeg;base64,' + jpeg.toString('base64'), imgBlurW: 480, imgBlurH: 302 }];
  globalThis.fetch = fetchStub(state);
  const handler = await loadHandler({ SITE_ADMIN_EMAILS: 'admin@test.dev' });

  const res = makeRes();
  await handler({ method: 'GET', headers: {}, query: { store: 'alfatrading', image: 'p1' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['content-type'], 'image/jpeg');
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.ok(Buffer.isBuffer(res.ended));
  assert.deepEqual([...res.ended], [...jpeg]);

  const missing = makeRes();
  await handler({ method: 'GET', headers: {}, query: { store: 'alfatrading', image: 'nope' } }, missing);
  assert.equal(missing.statusCode, 302);
  assert.equal(missing.headers.location, '/og.png');
});

test('middleware paylasim onizlemesinde posta ozel bulanik gorseli kullanir', async () => {
  const state = makeStore();
  state.data.posts = [{
    id: 'p1', type: 'islem', coin: 'BTC', dir: 'long', title: 'Long', author: 'Admin', ts: 1700000000000,
    imgBlur: 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64'), imgBlurW: 480, imgBlurH: 302,
  }];
  globalThis.fetch = fetchStub(state);
  const middleware = (await import('../middleware.js?case=' + Math.random())).default;
  const request = new Request('https://alfa-trader.com/?page=alfatrading&post=p1', {
    headers: { 'user-agent': 'TelegramBot (like TwitterBot)' },
  });
  const response = await middleware(request);
  const html = await response.text();
  assert.match(html, /og:image" content="https:\/\/alfa-trader\.com\/api\/contrib\?store=alfatrading&amp;image=p1&amp;v=1700000000000"/);
  assert.match(html, /og:image:width" content="480"/);
  assert.match(html, /og:image:height" content="302"/);
  assert.match(html, /og:image:type" content="image\/jpeg"/);
});

test('middleware bulanik gorsel yoksa genel /og.png gorseline duser', async () => {
  const state = makeStore();
  state.data.posts = [{ id: 'p2', type: 'islem', coin: 'ETH', title: 'Eski kayit', author: 'Admin', ts: 1700000000000 }];
  globalThis.fetch = fetchStub(state);
  const middleware = (await import('../middleware.js?case=' + Math.random())).default;
  const request = new Request('https://alfa-trader.com/?page=alfatrading&post=p2', {
    headers: { 'user-agent': 'TelegramBot' },
  });
  const response = await middleware(request);
  const html = await response.text();
  assert.match(html, /og:image" content="https:\/\/alfa-trader\.com\/og\.png"/);
  assert.match(html, /og:image:width" content="1200"/);
  assert.match(html, /og:image:height" content="630"/);
});

test('middleware gecersiz env anahtarinda dogrulanmis yayin anahtariyla tekrar okur', async () => {
  const state = makeStore();
  state.data.posts = [{ id: 'p3', type: 'islem', coin: 'BTC', dir: 'long', title: 'Fallback', author: 'Admin', ts: 1700000000000 }];
  const seenKeys = [];
  const inner = fetchStub(state);
  globalThis.fetch = async (url, init = {}) => {
    if (String(url).includes('/rest/v1/edu_shared')) {
      const key = init.headers && init.headers.apikey;
      seenKeys.push(key);
      if (key === 'sb_invalid_env_key') return { ok: false, status: 401, json: async () => ({}) };
    }
    return inner(url, init);
  };
  process.env.SUPABASE_PUBLISHABLE = 'sb_invalid_env_key';
  let middleware;
  try {
    middleware = (await import('../middleware.js?case=' + Math.random())).default;
  } finally {
    delete process.env.SUPABASE_PUBLISHABLE;
  }

  const request = new Request('https://alfa-trader.com/?page=alfatrading&post=p3', {
    headers: { 'user-agent': 'TelegramBot' },
  });
  const response = await middleware(request);
  const html = await response.text();
  assert.match(html, /Fallback/);
  assert.equal(seenKeys[0], 'sb_invalid_env_key');
  assert.equal(seenKeys[1], 'sb_publishable_bReG5UKaWcQkU0Z9GnGiJQ_0T4_Qm9X');
});

test('varsayilan Telegram gonderiminde link onizlemesi kapali kalir', async () => {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), body: JSON.parse(init.body || '{}') });
    return { ok: true, status: 200, json: async () => ({ ok: true, result: { message_id: 9 } }) };
  };
  process.env.TG_BOT_TOKEN = 'token';
  const { sendTelegram } = await import('../lib/telegram.mjs?case=' + Math.random());
  await sendTelegram('merhaba', '@x', 1);
  assert.equal(calls[0].body.disable_web_page_preview, true);
});

test('istemci bulanik kopya uretir ve gonderimde tasir', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /function atBlurDataUrl\(/);
  assert.match(html, /function atRefreshPostBlur\(/);
  assert.match(html, /imgBlur: val\('at-f-imgblur'\)/);
  assert.match(html, /clientId: alfaComposer\.clientId/);
  assert.match(html, /id="at-f-imgblur"/);
  assert.match(html, /id="at-f-imgblurw"/);
  assert.match(html, /id="at-f-imgblurh"/);
});
