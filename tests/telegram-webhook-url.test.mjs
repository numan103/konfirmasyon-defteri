import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { telegramWebhookUrl, isTelegramWebhookUrl } from '../lib/telegram-webhook-url.mjs';
import telegramWebhook from '../lib/telegram-webhook.mjs';

const expected = 'https://alfa-trader.com/api/ai?telegram-webhook=1';
const setEnv = (t, values) => {
  for (const [key, value] of Object.entries(values)) {
    const old = process.env[key];
    process.env[key] = value;
    t.after(() => { if (old === undefined) delete process.env[key]; else process.env[key] = old; });
  }
};
const response = () => ({ code: 0, headers: {}, setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });

test('webhook URL is derived from the configured HTTPS site and fails closed otherwise', t => {
  setEnv(t, { PUBLIC_SITE_URL: '', SITE_URL: '' });
  assert.equal(telegramWebhookUrl(), expected);
  process.env.PUBLIC_SITE_URL = 'https://site.example/trailing/';
  assert.equal(telegramWebhookUrl(), 'https://site.example/api/ai?telegram-webhook=1');
  assert.equal(isTelegramWebhookUrl('https://site.example/api/ai?telegram-webhook=1'), true);
  for (const bad of ['http://site.example', 'https://user:pass@site.example', 'https://site.example:8443', 'not-a-url']) {
    process.env.PUBLIC_SITE_URL = bad;
    assert.equal(telegramWebhookUrl(), expected, bad + ' must never become the webhook target');
  }
});

test('admin webhook diagnostics and setup use the same configured URL', async t => {
  setEnv(t, {
    PUBLIC_SITE_URL: 'https://site.example/',
    TG_BOT_TOKEN: 'unit-bot',
    TELEGRAM_WEBHOOK_SECRET: 'unit-secret',
    SITE_ADMIN_EMAILS: 'admin@test.dev',
  });
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    const target = String(url);
    calls.push({ url: target, body: typeof options.body === 'string' ? JSON.parse(options.body) : null });
    if (target.includes('/auth/v1/user')) return Response.json({ id: 'user-1', email: 'admin@test.dev' });
    if (target.endsWith('/getWebhookInfo')) return Response.json({ ok: true, result: { url: 'https://old.example/api/ai?telegram-webhook=1' } });
    if (target.endsWith('/setWebhook')) return Response.json({ ok: true, result: true });
    throw new Error('unexpected request: ' + target);
  });
  const headers = { authorization: 'Bearer unit' };
  const info = response();
  await telegramWebhook({ method: 'GET', headers, query: { action: 'info' } }, info);
  assert.equal(info.code, 200);
  assert.equal(info.body.expectedUrl, 'https://site.example/api/ai?telegram-webhook=1');
  assert.equal(info.body.urlMatches, false);
  assert.equal(info.body.secretConfigured, true);
  const setup = response();
  await telegramWebhook({ method: 'GET', headers, query: {} }, setup);
  const call = calls.find(c => c.url.endsWith('/setWebhook'));
  assert.ok(call, 'setup must call Telegram setWebhook');
  assert.equal(call.body.url, 'https://site.example/api/ai?telegram-webhook=1');
  assert.equal(call.body.secret_token, 'unit-secret');
});

test('every Telegram webhook path shares the helper and setup text names Cloudflare Pages', () => {
  const root = new URL('../', import.meta.url);
  const read = name => fs.readFileSync(new URL(name, root), 'utf8');
  for (const name of ['lib/telegram-webhook.mjs', 'lib/mentorship-trades.mjs']) {
    assert.match(read(name), /telegramWebhookUrl\(\)/, name + ' must not pin a hardcoded webhook URL');
  }
  assert.match(read('lib/edu-telegram-inbox.mjs'), /isTelegramWebhookUrl\(hook\.url\)/);
  for (const name of ['api/tg.mjs', 'lib/telegram-onboarding.mjs']) {
    assert.ok(!read(name).includes('Vercel'), name + ' still shows Vercel setup instructions to users');
  }
});
