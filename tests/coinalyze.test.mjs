import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ENV_KEYS = [
  'COINALYZE_API_KEY', 'COINALYZE_CHAT_ID', 'COINALYZE_THREAD',
  'TG_BOT_TOKEN', 'TG_CHAT_ID', 'TG_THREAD', 'TG_TRADE_CHAT_ID', 'TG_TRADE_THREAD',
  'WEBSITE_NOTIFY_THREAD', 'WEBSITE_NOTIFY_CHAT_ID',
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
    if (u.includes('api.telegram.org') && (u.includes('/sendMessage') || u.includes('/sendPhoto'))) {
      let body = {};
      let photoBytes = 0;
      if (init.body && typeof init.body.get === 'function') {
        for (const [k, v] of init.body.entries()) {
          body[k] = v;
          if (k === 'photo' && v && typeof v.size === 'number') photoBytes = v.size;
        }
      } else if (init.body && Buffer.isBuffer(init.body)) {
        const text = init.body.toString('utf8');
        const m1 = text.match(/name="chat_id"\r?\n\r?\n([^\r\n]+)/);
        const m2 = text.match(/name="message_thread_id"\r?\n\r?\n([^\r\n]+)/);
        if (m1) body.chat_id = m1[1];
        if (m2) body.message_thread_id = m2[1];
      } else {
        try { body = JSON.parse(init.body || '{}'); } catch { body = {}; }
      }
      const isPhoto = u.includes('/sendPhoto');
      state.calls.push({ url: u, body, photoBytes });
      return { ok: true, status: 200, json: async () => ({
        ok: true,
        result: { message_id: 900, ...(isPhoto ? { photo: [{ width: 900, height: 1125 }] } : {}) },
      }) };
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

const NOW = Date.UTC(2026, 10, 9, 6, 0, 0); // 09:00 TSİ

test('Coinalyze cronu Istanbul 09:00 (06:00 UTC) icin ayarli', () => {
  const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const cron = (vercel.crons || []).find(item => String(item.path).includes('coinalyze=1'));
  assert.ok(cron, 'coinalyze cron must exist');
  assert.equal(cron.schedule, '0 6 * * *');

  const workerConfig = fs.readFileSync(new URL('../cron/coinalyze/wrangler.toml', import.meta.url), 'utf8');
  const workerScript = fs.readFileSync(new URL('../cron/coinalyze/index.mjs', import.meta.url), 'utf8');
  assert.match(workerConfig, /crons\s*=\s*\["0 6 \* \* \*"\]/);
  assert.match(workerScript, /https:\/\/alfa-trader\.com\/api\/ai\?coinalyze=1/);
  assert.match(workerScript, /x-vercel-cron/);
});

test('Cloudflare cron worker Istanbul 09 cagrisini dogru baslikla yapar', async () => {
  const mod = await import('../cron/coinalyze/index.mjs?case=' + Math.random());
  const realFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    let pending;
    await mod.default.scheduled({}, {}, { waitUntil(promise) { pending = promise; } });
    await pending;
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(request.url, 'https://alfa-trader.com/api/ai?coinalyze=1');
  assert.equal(request.options.method, 'GET');
  assert.equal(request.options.headers['x-vercel-cron'], '1');
});

test('Coinalyze metni CVD, long/short ve OI degerlerini Turkce bicimde yazar', async () => {
  const state = makeState(NOW);
  globalThis.fetch = fetchStub(state, NOW);
  const mod = await loadHandler({ COINALYZE_API_KEY: 'k', TG_BOT_TOKEN: 't', TG_CHAT_ID: '@charts', TG_THREAD: '434', SITE_ADMIN_EMAILS: 'admin@test.dev', SUPABASE_SERVICE_ROLE: 'sb_secret_x' });
  const data = await mod.collectCoinalyzeData(NOW, 'k');
  const text = mod.formatCoinalyzeMessage(data, NOW);
  assert.match(text, /9\.11\.2026 09:00 TSİ/);
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
  const mod = await loadHandler({ COINALYZE_API_KEY: 'k', TG_BOT_TOKEN: 't', TG_CHAT_ID: '@public', TG_THREAD: '4', WEBSITE_NOTIFY_CHAT_ID: '@charts', WEBSITE_NOTIFY_THREAD: '434', SUPABASE_SERVICE_ROLE: 'sb_secret_x' });
  const req = { method: 'GET', url: 'https://x/api/ai?coinalyze=1', headers: { 'x-vercel-cron': '1', 'user-agent': 'vercel-cron/1.0' } };
  const first = makeRes();
  await withNow(NOW, () => mod.default(req, first));
  assert.equal(first.statusCode, 200);
  assert.equal(first.body.messageId, 900);
  assert.equal(state.calls.length, 1);
  assert.match(state.calls[0].url, /\/sendPhoto$/);
  assert.equal(state.calls[0].body.chat_id, '@charts');
  assert.equal(Number(state.calls[0].body.message_thread_id), 434);
  assert.ok(state.calls[0].photoBytes > 1000, 'daily post must include a real PNG attachment');
  assert.equal(first.body.hasPhoto, true);
  assert.ok(first.body.imageBytes > 1000);

  const second = makeRes();
  await withNow(NOW, () => mod.default(req, second));
  assert.equal(second.statusCode, 200);
  assert.equal(second.body.skipped, 'already_sent');
  assert.equal(state.calls.length, 1);
});

test('Coinalyze günlük özeti website bildirim konusuna gider', async () => {
  const state = makeState(NOW);
  globalThis.fetch = fetchStub(state, NOW);
  const mod = await loadHandler({ COINALYZE_API_KEY: 'k', TG_BOT_TOKEN: 't', TG_CHAT_ID: '@public', TG_THREAD: '4', SUPABASE_SERVICE_ROLE: 'sb_secret_x' });
  const res = makeRes();
  await withNow(NOW, () => mod.default({ method: 'GET', url: 'https://x/api/ai?coinalyze=1', headers: { 'x-vercel-cron': '1' } }, res));
  assert.equal(res.statusCode, 200);
  assert.equal(state.calls.length, 1);
  assert.equal(state.calls[0].body.chat_id, '@public');
  assert.equal(Number(state.calls[0].body.message_thread_id), 434);
});

test('Coinalyze kullanıcıya özel env override kullanmaz', async () => {
  const state = makeState(NOW);
  globalThis.fetch = fetchStub(state, NOW);
  const mod = await loadHandler({
    COINALYZE_API_KEY: 'k', TG_BOT_TOKEN: 't', TG_CHAT_ID: '@public', TG_THREAD: '4',
    COINALYZE_CHAT_ID: '@traderahmetd', COINALYZE_THREAD: '0', SUPABASE_SERVICE_ROLE: 'sb_secret_x',
  });
  const res = makeRes();
  await withNow(NOW, () => mod.default({ method: 'GET', url: 'https://x/api/ai?coinalyze=1', headers: { 'x-vercel-cron': '1' } }, res));
  assert.equal(res.statusCode, 200);
  assert.equal(state.calls.length, 1);
  assert.equal(state.calls[0].body.chat_id, '@public');
  assert.equal(Number(state.calls[0].body.message_thread_id), 434);
  assert.equal(state.calls.some(call => call.body.chat_id === '@traderahmetd'), false);
});

test('zamanlanmis gonderim Istanbul 09 disinda mesaj atmaz', async () => {
  const offNow = Date.UTC(2026, 10, 9, 8, 0, 0); // 11:00 TSİ
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
  state.futureMarkets.push(
    { symbol: 'BTCU_PERP.A', base_asset: 'BTC', is_perpetual: true, oi_lq_vol_denominated_in: 'BASE_ASSET', has_long_short_ratio_data: false, exchange: 'Binance', quote_asset: 'U' },
    { symbol: 'BTCUSD1_PERP.A', base_asset: 'BTC', is_perpetual: true, oi_lq_vol_denominated_in: 'BASE_ASSET', has_long_short_ratio_data: false, exchange: 'Binance', quote_asset: 'USD1' },
  );
  globalThis.fetch = fetchStub(state, NOW);
  const mod = await loadHandler({ COINALYZE_API_KEY: 'k', TG_BOT_TOKEN: 't', TG_CHAT_ID: '@charts', SITE_ADMIN_EMAILS: 'admin@test.dev', SUPABASE_SERVICE_ROLE: 'sb_secret_x' });
  await mod.collectCoinalyzeData(NOW, 'k');
  const count = part => state.requests
    .filter(u => u.includes(part))
    .reduce((sum, u) => sum + (new URL(u).searchParams.get('symbols') || '').split(',').filter(Boolean).length, 0);
  assert.equal(count('/ohlcv-history'), 19);
  assert.equal(count('/open-interest-history'), 15);
  assert.equal(count('/long-short-ratio-history'), 5);
  assert.ok(!state.requests.some(u => u.includes('BTCU_PERP') || u.includes('BTCUSD1_PERP')));
  assert.ok(1 + count('/ohlcv-history') + count('/open-interest-history') + count('/long-short-ratio-history') <= 40);
});
