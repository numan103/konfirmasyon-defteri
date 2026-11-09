import test from 'node:test';
import assert from 'node:assert/strict';

const ENV_KEYS = [
  'COINALYZE_API_KEY', 'COINALYZE_CHAT_ID', 'COINALYZE_THREAD',
  'TG_BOT_TOKEN', 'TG_CHAT_ID', 'TG_THREAD', 'TG_TRADE_CHAT_ID', 'TG_TRADE_THREAD',
  'CRON_SECRET', 'MACRO_CRON_SECRET', 'SUPABASE_SERVICE_ROLE', 'SUPABASE_PUBLISHABLE', 'SUPABASE_URL',
  'SITE_ADMIN_EMAILS',
];

function resetEnv(env = {}) {
  for (const key of ENV_KEYS) delete process.env[key];
  Object.assign(process.env, env);
}

async function loadHandler(env) {
  resetEnv(env);
  const mod = await import('../lib/coinalyze.mjs?case=' + Math.random());
  return mod;
}

function makeRes() {
  return {
    statusCode: 0,
    body: null,
    setHeader() {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end(body) { this.ended = body; return this; },
  };
}

async function withNow(now, fn) {
  const real = Date.now;
  Date.now = () => now;
  try { return await fn(); } finally { Date.now = real; }
}

function atFor(now) {
  const sec = Math.floor(now / 1000);
  return Math.floor(sec / 3600) * 3600;
}

function fetchStub(state, now) {
  const at = atFor(now);
  return async (url, init = {}) => {
    const u = String(url);
    if (u.includes('api.coinalyze.net')) state.requests.push(u);
    if (u.includes('/auth/v1/user')) {
      return { ok: true, status: 200, json: async () => ({ id: 'u1', email: 'admin@test.dev' }) };
    }
    if (u.includes('/rest/v1/edu_shared')) {
      const method = init.method || 'GET';
      if (method === 'GET') return { ok: true, status: 200, json: async () => (state.daily ? [{ id: 'coinalyze_daily', data: state.daily }] : []) };
      if (method === 'POST') {
        state.daily = JSON.parse(init.body || '{}').data;
        return { ok: true, status: 201, json: async () => ({}) };
      }
    }
    if (u.includes('/spot-markets')) {
      return { ok: true, status: 200, json: async () => state.spotMarkets };
    }    if (u.includes('/future-markets')) {
      return { ok: true, status: 200, json: async () => state.futureMarkets };
    }
    if (u.includes('/ohlcv-history')) {
      return { ok: true, status: 200, json: async () => state.ohlcv };
    }
    if (u.includes('/open-interest-history')) {
      return { ok: true, status: 200, json: async () => state.oi };
    }
    if (u.includes('/long-short-ratio-history')) {
      return { ok: true, status: 200, json: async () => state.lsr };
    }
    if (u.includes('api.telegram.org') && u.includes('/sendMessage')) {
      state.calls.push({ url: u, body: JSON.parse(init.body || '{}') });
      return { ok: true, status: 200, json: async () => ({ ok: true, result: { message_id: 900 } }) };
    }
    return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
  };
}

function makeState(now) {
  const at = atFor(now);
  return {
    calls: [],
    requests: [],
    daily: null,
    spotMarkets: [{ symbol: 'BTCUSDT.A', base_asset: 'BTC', has_buy_sell_data: true }],
    futureMarkets: [
      { symbol: 'BTCUSDT_PERP.A', base_asset: 'BTC', is_perpetual: true, oi_lq_vol_denominated_in: 'BASE_ASSET', has_long_short_ratio_data: true, exchange: 'Binance', quote_asset: 'USDT' },
      { symbol: 'BTCUSD_PERP.0', base_asset: 'BTC', is_perpetual: true, oi_lq_vol_denominated_in: 'USD', has_long_short_ratio_data: true, exchange: 'Binance', quote_asset: 'USD' },
    ],
    ohlcv: [{
      symbol: 'BTCUSDT.A',
      history: [
        { t: at - 3600, o: 70000, h: 70100, l: 69900, c: 70000, v: 10, bv: 7 },
        { t: at, o: 70000, h: 70200, l: 69900, c: 70100, v: 10, bv: 6 },
      ],
    }],
    oi: [
      { symbol: 'BTCUSDT_PERP.A', history: [{ t: at - 86400, c: 50e9 }, { t: at, c: 55e9 }] },
      { symbol: 'BTCUSD_PERP.0', history: [{ t: at - 86400, c: 50e9 }, { t: at, c: 55e9 }] },
    ],
    lsr: [
      { symbol: 'BTCUSDT_PERP.A', history: [{ t: at, r: 1.5, l: 60, s: 40 }] },
      { symbol: 'BTCUSD_PERP.0', history: [{ t: at, r: 2, l: 66.6667, s: 33.3333 }] },
    ],
  };
}

const NOW = Date.UTC(2026, 10, 9, 8, 0, 0); // 11:00 TSİ

test('Coinalyze metni CVD, long/short ve OI degerlerini Turkce bicimde yazar', async () => {
  const state = makeState(NOW);
  globalThis.fetch = fetchStub(state, NOW);
  const mod = await loadHandler({ COINALYZE_API_KEY: 'k', TG_BOT_TOKEN: 't', TG_CHAT_ID: '@charts', TG_THREAD: '434', SITE_ADMIN_EMAILS: 'admin@test.dev', SUPABASE_SERVICE_ROLE: 'sb_secret_x' });
  const data = await mod.collectCoinalyzeData(NOW, 'k');
  const text = mod.formatCoinalyzeMessage(data, NOW);
  assert.match(text, /9\.11\.2026 11:00 TSİ/);
  assert.match(text, /Spot CVD \(24s\): 6 BTC · 420,2 bin\$/);
  assert.match(text, /Long\/Short: 1,73 · Long %63,3 \/ Short %36,7/);
  assert.match(text, /Açık pozisyon: 110,00 mlr\$ · 24s \+10,0%/);
});

test('yetici dryRun ile veriyi gorur, Telegram mesaji atmaz', async () => {
  const state = makeState(NOW);
  globalThis.fetch = fetchStub(state, NOW);
  const mod = await loadHandler({ COINALYZE_API_KEY: 'k', TG_BOT_TOKEN: 't', TG_CHAT_ID: '@charts', TG_THREAD: '434', SITE_ADMIN_EMAILS: 'admin@test.dev', SUPABASE_SERVICE_ROLE: 'sb_secret_x' });
  const res = makeRes();
  await mod.default({
    method: 'GET',
    url: 'https://x/api/ai?coinalyze=1&dryRun=1',
    headers: { authorization: 'Bearer jwt' },
    query: { coinalyze: '1', dryRun: '1' },
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.dryRun, true);
  assert.match(res.body.text, /BTC türev görünümü/);
  assert.equal(state.calls.length, 0);
});

test('zamanlanmis gonderim gun icinde tek mesaj atar', async () => {
  const state = makeState(NOW);
  globalThis.fetch = fetchStub(state, NOW);
  const mod = await loadHandler({ COINALYZE_API_KEY: 'k', TG_BOT_TOKEN: 't', TG_CHAT_ID: '@charts', TG_THREAD: '434', SUPABASE_SERVICE_ROLE: 'sb_secret_x' });
  const req = { method: 'GET', url: 'https://x/api/ai?coinalyze=1', headers: { 'x-vercel-cron': '1', 'user-agent': 'vercel-cron/1.0' } };
  const first = makeRes();
  await withNow(NOW, () => mod.default(req, first));
  assert.equal(first.statusCode, 200);
  assert.equal(first.body.messageId, 900);
  assert.equal(state.calls.length, 1);
  assert.equal(state.calls[0].body.chat_id, '@charts');
  assert.equal(state.calls[0].body.message_thread_id, 434);

  const second = makeRes();
  await withNow(NOW, () => mod.default(req, second));
  assert.equal(second.statusCode, 200);
  assert.equal(second.body.skipped, 'already_sent');
  assert.equal(state.calls.length, 1);
});

test('zamanlanmis gonderim Istanbul 11 disinda mesaj atmaz', async () => {
  const offNow = Date.UTC(2026, 10, 9, 6, 0, 0); // 09:00 TSİ
  const state = makeState(offNow);
  globalThis.fetch = fetchStub(state, offNow);
  const mod = await loadHandler({ COINALYZE_API_KEY: 'k', TG_BOT_TOKEN: 't', TG_CHAT_ID: '@charts', TG_THREAD: '434', SUPABASE_SERVICE_ROLE: 'sb_secret_x' });
  const res = makeRes();
  await withNow(offNow, () => mod.default({ method: 'GET', url: 'https://x/api/ai?coinalyze=1', headers: { 'x-vercel-cron': '1' } }, res));
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.skipped, 'outside_window');
  assert.equal(state.calls.length, 0);
});

test('yetkisiz istek 401 doner ve mesaj atmaz', async () => {
  const state = makeState(NOW);
  globalThis.fetch = fetchStub(state, NOW);
  const mod = await loadHandler({ COINALYZE_API_KEY: 'k', TG_BOT_TOKEN: 't', TG_CHAT_ID: '@charts', SITE_ADMIN_EMAILS: 'admin@test.dev' });
  const res = makeRes();
  await mod.default({ method: 'GET', url: 'https://x/api/ai?coinalyze=1', headers: {} }, res);
  assert.equal(res.statusCode, 401);
  assert.equal(state.calls.length, 0);
});

test('veri eksikse mesaj gonderilmez', async () => {
  const state = makeState(NOW);
  state.lsr = [];
  globalThis.fetch = fetchStub(state, NOW);
  const mod = await loadHandler({ COINALYZE_API_KEY: 'k', TG_BOT_TOKEN: 't', TG_CHAT_ID: '@charts', SITE_ADMIN_EMAILS: 'admin@test.dev', SUPABASE_SERVICE_ROLE: 'sb_secret_x' });
  const res = makeRes();
  await mod.default({ method: 'GET', url: 'https://x/api/ai?coinalyze=1&dryRun=1', headers: { authorization: 'Bearer jwt' } }, res);
  assert.equal(res.statusCode, 502);
  assert.equal(res.body.error, 'coinalyze_incomplete');
  assert.equal(state.calls.length, 0);
});

test('sembol secimi dakikalik API limitinin altinda kalir', async () => {
  const state = makeState(NOW);
  const exchanges = ['Binance', 'Bybit', 'OKX', 'Bitfinex', 'Coinbase', 'Kraken'];
  state.spotMarkets = Array.from({ length: 30 }, (_, i) => ({
    symbol: 'S' + i, base_asset: 'BTC', has_buy_sell_data: true,
    exchange: exchanges[i % exchanges.length], quote_asset: ['USDT', 'USD', 'USDC'][i % 3],
  }));
  state.futureMarkets = Array.from({ length: 30 }, (_, i) => ({
    symbol: 'BTC_PERP_' + i, base_asset: 'BTC', is_perpetual: true,
    oi_lq_vol_denominated_in: 'BASE_ASSET', has_long_short_ratio_data: true,
    exchange: exchanges[i % exchanges.length], quote_asset: ['USDT', 'USD', 'USDC'][i % 3],
  }));
  globalThis.fetch = fetchStub(state, NOW);
  const mod = await loadHandler({ COINALYZE_API_KEY: 'k', TG_BOT_TOKEN: 't', TG_CHAT_ID: '@charts', SITE_ADMIN_EMAILS: 'admin@test.dev', SUPABASE_SERVICE_ROLE: 'sb_secret_x' });
  await mod.collectCoinalyzeData(NOW, 'k');
  const count = part => state.requests
    .filter(u => u.includes(part))
    .reduce((sum, u) => sum + (new URL(u).searchParams.get('symbols') || '').split(',').filter(Boolean).length, 0);
  assert.equal(count('/ohlcv-history'), 19);
  assert.equal(count('/open-interest-history'), 15);
  assert.equal(count('/long-short-ratio-history'), 5);
  assert.ok(1 + count('/ohlcv-history') + count('/open-interest-history') + count('/long-short-ratio-history') <= 40);
});
