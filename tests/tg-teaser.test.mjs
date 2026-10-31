import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// --- Sunucu: herkese acik kanal ayrintisiz, premium kanal ayrintili ---

const ENV_KEYS = ['TG_BOT_TOKEN', 'TG_CHAT_ID', 'TG_THREAD', 'TG_PREMIUM_CHAT_ID', 'TG_PREMIUM_THREAD', 'SITE_ACCESS_OPEN', 'SITE_ADMIN_EMAILS'];

function resetEnv(env) {
  for (const key of ENV_KEYS) delete process.env[key];
  Object.assign(process.env, env);
}

async function loadHandler(env) {
  resetEnv(env);
  const mod = await import('../api/tg.mjs?case=' + Math.random());
  return mod.default;
}

function telegramCalls(user = {}) {
  const calls = [];
  const fetchStub = async (url, init = {}) => {
    if (String(url).includes('/auth/v1/user')) {
      return { ok: true, status: 200, json: async () => ({ id: user.id || 'user-' + Math.random(), email: user.email || 'admin@test.dev' }) };
    }
    const body = JSON.parse(init.body || '{}');
    calls.push({ url: String(url), body });
    return { ok: true, status: 200, json: async () => ({ ok: true, result: { message_id: calls.length } }) };
  };
  return { calls, fetchStub };
}

function makeRes() {
  return {
    statusCode: 0,
    body: null,
    setHeader() {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

function run(handler, body, user) {
  const res = makeRes();
  const req = { method: 'POST', headers: { authorization: 'Bearer test-jwt' }, body };
  return handler(req, res).then(() => res);
}

test('public channel gets only the teaser while premium channel gets full detail', async () => {
  const { calls, fetchStub } = telegramCalls({ email: 'admin@test.dev' });
  globalThis.fetch = fetchStub;
  const handler = await loadHandler({
    TG_BOT_TOKEN: 'token', TG_CHAT_ID: '@public', TG_PREMIUM_CHAT_ID: '-100999',
    SITE_ADMIN_EMAILS: 'admin@test.dev'
  });
  const flow = '📈 UZUN — Yeni pozisyon: XAUUSD\n\n🔹 25 adet · 4.250 $ harcandı\n📈 Kâr/Zarar: +312 $';
  const teaser = '🔔 Altın tarafında yeni bir hamle yapıldı.';
  const res = await run(handler, { message: flow, publicMessage: teaser });

  assert.equal(res.statusCode, 200);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].body.chat_id, '@public');
  assert.equal(calls[0].body.text, teaser);
  assert.ok(!calls[0].body.text.includes('4.250'));
  assert.match(calls[0].body.reply_markup.inline_keyboard[0][0].url, /page=erisim/);
  assert.equal(calls[1].body.chat_id, '-100999');
  assert.equal(calls[1].body.text, flow);
  assert.equal(res.body.premium.ok, true);
});

test('without a publicMessage the public channel still never receives the full detail', async () => {
  const { calls, fetchStub } = telegramCalls({ email: 'admin@test.dev' });
  globalThis.fetch = fetchStub;
  const handler = await loadHandler({
    TG_BOT_TOKEN: 'token', TG_CHAT_ID: '@public', TG_PREMIUM_CHAT_ID: '-100999',
    SITE_ADMIN_EMAILS: 'admin@test.dev'
  });
  const res = await run(handler, { message: 'Gizli miktar: 42 adet, kâr 1.300 $' });

  assert.equal(res.statusCode, 200);
  assert.equal(calls.length, 2);
  assert.ok(!calls[0].body.text.includes('Gizli miktar'));
  assert.ok(calls[0].body.text.includes('premium'));
  assert.equal(calls[1].body.text, 'Gizli miktar: 42 adet, kâr 1.300 $');
});

test('ref members cannot post to the premium channel', async () => {
  const { calls, fetchStub } = telegramCalls({ email: 'member@test.dev' });
  globalThis.fetch = fetchStub;
  const handler = await loadHandler({
    TG_BOT_TOKEN: 'token', TG_CHAT_ID: '@public', TG_PREMIUM_CHAT_ID: '-100999',
    SITE_ACCESS_OPEN: '1', SITE_ADMIN_EMAILS: 'admin@test.dev'
  });
  const res = await run(handler, { message: 'full detail', publicMessage: 'teaser' });

  assert.equal(res.statusCode, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.chat_id, '@public');
  assert.equal(res.body.premium, undefined);
});

// --- Istemci: genel metin ayrinti sizdirmaz ---

function extractFunction(html, name) {
  const start = html.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name + ' bulunamadi');
  let depth = 0;
  for (let i = html.indexOf('{', start); i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') {
      depth--;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  throw new Error('unterminated function ' + name);
}

function teaserContext() {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const assetsStart = html.indexOf('const AP2_TG_ASSETS = {');
  const assetsEnd = html.indexOf('};', assetsStart) + 2;
  const code = html.slice(assetsStart, assetsEnd) + '\n' +
    extractFunction(html, 'ap2TgAsset') + '\n' +
    extractFunction(html, 'ap2TgTeaser');
  const context = vm.createContext({});
  vm.runInContext(code, context);
  return context;
}

test('teaser names the market in plain language instead of the exact numbers', () => {
  const c = teaserContext();
  assert.equal(c.ap2TgAsset('XAUUSD'), 'Altın');
  assert.equal(c.ap2TgAsset('BTCUSDT'), 'Bitcoin');
  assert.equal(c.ap2TgAsset('EURUSD'), 'Euro / Dolar');
  assert.equal(c.ap2TgAsset('US100'), 'Nasdaq 100');

  const text = c.ap2TgTeaser('yeni bir hamle yapıldı', 'XAUUSD');
  assert.match(text, /Altın tarafında yeni bir hamle yapıldı/);
  assert.match(text, /premium/i);
  assert.match(text, /page=erisim/);
  assert.ok(!text.includes('🔒'));
  assert.ok(!text.includes('harcandı'));
});

test('client posts the teaser as publicMessage alongside the full detail', async () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  let sent = null;
  const context = vm.createContext({
    siteAuthHeaders: () => Promise.resolve({ 'Content-Type': 'application/json' }),
    fetch: (url, init) => { sent = JSON.parse(init.body); return Promise.resolve({ json: async () => ({ ok: true, link: '' }) }); },
    stratToast: () => {}
  });
  vm.runInContext(extractFunction(html, 'ap2TgNotify'), context);
  context.ap2TgNotify('tam ayrıntı: 4.250 $', 'genel özet');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(sent.message, 'tam ayrıntı: 4.250 $');
  assert.equal(sent.publicMessage, 'genel özet');
});
