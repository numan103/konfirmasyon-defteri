import test from 'node:test';
import assert from 'node:assert/strict';
import { WEBSITE_NOTIFY_THREAD, websiteNotifyTarget } from '../lib/website-notify.mjs';

const KEYS = ['TG_BOT_TOKEN', 'TG_CHAT_ID', 'TG_THREAD', 'WEBSITE_NOTIFY_THREAD', 'WEBSITE_NOTIFY_CHAT_ID', 'OPENMARKET_API_KEY', 'CRON_SECRET', 'SUPABASE_SERVICE_ROLE'];

function env(env = {}) {
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, env);
}

function res() {
  return {
    code: 0, body: null,
    setHeader() {},
    status(c) { this.code = c; return this; },
    json(v) { this.body = v; return this; },
    end() { return this; },
  };
}

test('website bildirim hedefi varsayilan olarak alfatraderspublic /434', () => {
  env({ TG_BOT_TOKEN: 't', TG_CHAT_ID: '@public', TG_THREAD: '4' });
  const t = websiteNotifyTarget();
  assert.equal(WEBSITE_NOTIFY_THREAD, 434);
  assert.equal(t.chat, '@public');
  assert.equal(t.thread, 434);
  assert.equal(t.ready, true);
  assert.equal(process.env.TG_THREAD, '4');
});

test('website bildirim hedefi env ile degistirilebilir, bot/chat yoksa hazir degil', () => {
  env({ TG_BOT_TOKEN: 't', TG_CHAT_ID: '@public', WEBSITE_NOTIFY_THREAD: '777', WEBSITE_NOTIFY_CHAT_ID: '@site' });
  let t = websiteNotifyTarget();
  assert.equal(t.chat, '@site');
  assert.equal(t.thread, 777);

  env({ TG_CHAT_ID: '@public' });
  t = websiteNotifyTarget();
  assert.equal(t.ready, false);
});

test('orderbook seviyeleri website konusuna gonderilir', async t => {
  env({
    TG_BOT_TOKEN: 't', TG_CHAT_ID: '@public', TG_THREAD: '4',
    OPENMARKET_API_KEY: 'k', CRON_SECRET: 's', SUPABASE_SERVICE_ROLE: 'sb_secret_x',
  });
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const sent = [];
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes('api.openmarket.xyz')) {
      return { ok: true, json: async () => ({ series: [{ points: [{ Point: { bids: [60000, 400, 59900, 500], asks: [60100, 350, 60200, 600] } }] }] }) };
    }
    if (u.includes('api.telegram.org')) {
      sent.push(JSON.parse(init.body));
      return { ok: true, status: 200, json: async () => ({ ok: true, result: { message_id: 12 } }) };
    }
    if (u.includes('/rest/v1/edu_shared') && init?.method === 'POST') {
      return { ok: true, status: 201, json: async () => ({}) };
    }
    return { ok: true, status: 200, json: async () => [] };
  };
  const mod = await import('../lib/orderbook-levels.mjs?website-notify=' + Math.random());
  const out = res();
  await mod.default({ method: 'GET', url: '/api/ai?orderbook=1', headers: { 'x-vercel-cron': '1' } }, out);
  assert.equal(out.body.ok, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].chat_id, '@public');
  assert.equal(sent[0].message_thread_id, 434);
});
