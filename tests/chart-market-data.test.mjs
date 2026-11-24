import test from 'node:test';
import assert from 'node:assert/strict';
import { marketHistory, marketQuotes, allowMarketData, allowPublicMarketData } from '../lib/chart-market-data.mjs';
import handler from '../api/access.mjs';

const bar = (ms, open, high, low, close, volume = 5) => [ms, String(open), String(high), String(low), String(close), String(volume)];
const response = value => ({ ok: true, json: async () => value, text: async () => JSON.stringify(value), headers: { get: () => null } });

test('non-Binance venues read only their allowlisted public upstreams and return validated candles', async () => {
  const calls = [];
  const okx = await marketHistory('OKX:BTCUSDT.P', '1h', null, null, async url => {
    calls.push(url);
    return response({ code: '0', data: [bar(1794751200000, 10, 12, 9, 11)] });
  });
  assert.match(calls[0], /^https:\/\/www\.okx\.com\/api\/v5\/market\/candles\?/);
  assert.match(calls[0], /instId=BTC-USDT-SWAP/);
  assert.equal(okx.chartable, true);
  assert.equal(okx.candles[0].close, 11);

  const bybit = await marketHistory('BYBIT:ETHUSDT.P', '1h', null, null, async url => {
    calls.push(url);
    return response({ retCode: 0, result: { list: [bar(1794751200000, 2, 2.2, 1.9, 2.1, 3)] } });
  });
  assert.match(calls[1], /^https:\/\/api\.bybit\.com\/v5\/market\/kline\?/);
  assert.match(calls[1], /symbol=ETHUSDT/);
  assert.equal(bybit.candles[0].high, 2.2);

  const yahoo = await marketHistory('CBOE:VIX', '1d', null, null, async url => {
    calls.push(url);
    return response({ chart: { result: [{ timestamp: [1794751200], meta: { regularMarketPrice: 20 },
      indicators: { quote: [{ open: [19], high: [21], low: [18], close: [20], volume: [100] }] } }] } });
  });
  assert.match(calls[2], /^https:\/\/query1\.finance\.yahoo\.com\/v8\/finance\/chart\/%5EVIX\?/);
  assert.equal(yahoo.candles[0].close, 20);
});

test('quote-only TradingView symbols and derived gold/TRY refuse fake candle history', async () => {
  const tv = await marketHistory('CRYPTOCAP:TOTAL', '1h', null, null, async url => {
    assert.match(url, /^https:\/\/scanner\.tradingview\.com\/symbol\?symbol=CRYPTOCAP%3ATOTAL/);
    return response({ close: 2500, change: 1.5 });
  });
  assert.equal(tv.chartable, false);
  assert.equal(tv.quote.price, 2500);

  const derived = await marketHistory('FX_IDC:XAUTRYG', '1d', null, null, async url => {
    const gold = url.includes('GC%3DF');
    const price = gold ? 3000 : 40;
    return response({ chart: { result: [{ timestamp: [1794751200],
      meta: { regularMarketPrice: price, chartPreviousClose: price },
      indicators: { quote: [{ open: [price], high: [price], low: [price], close: [price], volume: [0] }] } }] } });
  });
  assert.equal(derived.chartable, true);
  assert.ok(Math.abs(derived.candles[0].close - 3000 * 40 / 31.1034768) < 0.01);
});

test('quotes isolate venue failures and market data is rate limited per account', async () => {
  const quotes = await marketQuotes(['CRYPTOCAP:BTC.D', 'UNKNOWN:X'], async url => {
    assert.match(url, /CRYPTOCAP%3ABTC\.D/);
    return response({ close: 59.2, change: -0.3 });
  });
  assert.equal(quotes['CRYPTOCAP:BTC.D'].price, 59.2);
  assert.equal(quotes['UNKNOWN:X'], undefined);
  for (let i = 0; i < 120; i++) assert.equal(allowMarketData('market-rate-unit', 100000), true);
  assert.equal(allowMarketData('market-rate-unit', 100000), false);
  assert.equal(allowMarketData('another-market-user', 100000), true);
  assert.equal(allowMarketData('market-rate-unit', 160001), true);
});

test('public market upstreams send a browser-compatible User-Agent', async () => {
  const calls = [];
  const history = await marketHistory('FX:EURUSD', '1d', null, null, async (url, opts = {}) => {
    calls.push(opts);
    return response({ chart: { result: [{ timestamp: [1794751200], meta: { regularMarketPrice: 1.1 },
      indicators: { quote: [{ open: [1.1], high: [1.1], low: [1.1], close: [1.1], volume: [0] }] } }] } });
  });
  assert.equal(calls[0].headers['User-Agent'], 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
  assert.equal(history.chartable, true);
  assert.equal(history.candles[0].close, 1.1);

  const quotes = await marketQuotes(['FX:EURUSD'], async (url, opts = {}) => {
    calls.push(opts);
    return response({ chart: { result: [{ timestamp: [1794751200], meta: { regularMarketPrice: 1.1, chartPreviousClose: 1.0 }, indicators: { quote: [{ open: [1.1], high: [1.1], low: [1.1], close: [1.1], volume: [0] }] } }] } });
  });
  assert.equal(calls[1].headers['User-Agent'], 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
  assert.equal(quotes['FX:EURUSD'].price, 1.1);
});

test('existing access API gates market ops by Charts grant and keeps responses private/no-store', async () => {
  const saved = globalThis.fetch;
  let granted = false;
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url, opts });
    if (url.includes('/auth/v1/user')) return response({ id: 'market-api-test', email: 'tester@example.test', email_confirmed_at: '2026-01-01', app_metadata: { alfa_charts: granted } });
    if (url.includes('scanner.tradingview.com')) return response({ close: 100, change: 1 });
    throw new Error('unexpected upstream ' + url);
  };
  const invoke = async (auth, op, body = {}) => {
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(text) { this.body = JSON.parse(text); } };
    await handler({ method: 'POST', headers: auth ? { authorization: 'Bearer fixture' } : {}, body: { op, ...body } }, res);
    return res;
  };
  try {
    assert.equal((await invoke(false, 'chart-market-data', { ref: 'CRYPTOCAP:TOTAL2', interval: '1h' })).statusCode, 401);
    assert.equal((await invoke(true, 'chart-market-data', { ref: 'CRYPTOCAP:TOTAL2', interval: '1h' })).statusCode, 403);
    granted = true;
    const history = await invoke(true, 'chart-market-data', { ref: 'CRYPTOCAP:TOTAL2', interval: '1h' });
    assert.equal(history.statusCode, 200);
    assert.equal(history.body.chartable, false);
    const quotes = await invoke(true, 'chart-market-quotes', { refs: ['CRYPTOCAP:TOTAL2'] });
    assert.equal(quotes.statusCode, 200);
    assert.equal(quotes.body.quotes['CRYPTOCAP:TOTAL2'].price, 100);
    assert.equal(quotes.headers['Cache-Control'], 'private, no-store');
    assert.equal(quotes.headers.Vary, 'Authorization');
    assert.ok(calls.every(c => !c.url.includes('/rest/v1/') && (c.opts.method || 'GET') === 'GET'), 'no database writes');
  } finally { globalThis.fetch = saved; }
});

test('anonymous free market ops are allowlisted, private/no-store and rate limited per IP', async () => {
  const saved = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url, opts });
    if (url.includes('scanner.tradingview.com')) return response({ close: 100, change: 1 });
    if (url.includes('/api/v5/market/candles')) return response({ code: '0', data: [bar(1794751200000, 10, 12, 9, 11)] });
    throw new Error('unexpected upstream ' + url);
  };
  const invoke = async (op, body, ip) => {
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(text) { this.body = JSON.parse(text); } };
    await handler({ method: 'POST', headers: ip ? { 'x-forwarded-for': ip } : {}, body: { op, ...body } }, res);
    return res;
  };
  const tag = `free-op-test-${Date.now()}`;
  try {
    assert.equal((await invoke('chart-market-data', { ref: 'CRYPTOCAP:TOTAL2', interval: '1h' }, `${tag}-gated`)).statusCode, 401);
    assert.equal((await invoke('chart-market-data-free', { ref: 'OKX:ADAUSDT', interval: '1h' }, `${tag}-bad`)).statusCode, 400);
    assert.equal((await invoke('chart-market-data-free', { ref: 'UNKNOWN:X', interval: '1h' }, `${tag}-bad2`)).statusCode, 400);
    assert.equal((await invoke('chart-market-quotes-free', { refs: ['CRYPTOCAP:TOTAL2', 'UNKNOWN:X'] }, `${tag}-bad3`)).statusCode, 400);

    const history = await invoke('chart-market-data-free', { ref: 'OKX:BTCUSDT.P', interval: '1h' }, `${tag}-history`);
    assert.equal(history.statusCode, 200);
    assert.equal(history.body.candles[0].close, 11);
    assert.equal(history.headers['Cache-Control'], 'private, no-store');
    assert.equal(history.headers.Vary, 'Authorization');

    const quotes = await invoke('chart-market-quotes-free', { refs: ['CRYPTOCAP:TOTAL2'] }, `${tag}-quotes`);
    assert.equal(quotes.statusCode, 200);
    assert.equal(quotes.body.quotes['CRYPTOCAP:TOTAL2'].price, 100);
    assert.equal(quotes.headers['Cache-Control'], 'private, no-store');
    assert.equal(quotes.headers.Vary, 'Authorization');

    const rateIp = `${tag}-rate`;
    for (let i = 0; i < 60; i++) assert.equal((await invoke('chart-market-quotes-free', { refs: ['CRYPTOCAP:TOTAL2'] }, rateIp)).statusCode, 200);
    assert.equal((await invoke('chart-market-quotes-free', { refs: ['CRYPTOCAP:TOTAL2'] }, rateIp)).statusCode, 429);

    const resetAt = Date.now() + 60001;
    assert.equal(allowPublicMarketData(`${tag}-direct`, resetAt), true);
    assert.ok(calls.every(c => !c.url.includes('/rest/v1/') && c.opts.method === 'GET'), 'free ops do not access the database');
  } finally { globalThis.fetch = saved; }
});
