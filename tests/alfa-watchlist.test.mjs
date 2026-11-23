import test from 'node:test';
import assert from 'node:assert/strict';
import { spotMarkets, cleanWatchlist, parseWatchlistText, importPreview, tradingViewSymbolURL, foreignMarkets, WATCHLIST_LIMIT } from '../assets/alfa-watchlist-model.mjs';
import { formatMarketPrice } from '../assets/alfa-watchlist.mjs';
import { isMarketSymbol, isSpotSymbol, isFreeMarketRef, parseMarketRef, validateMarket } from '../assets/alfa-charts-data.mjs';
import { publicWatchlistURL, publicWatchlistData, fetchPublicWatchlist, allowWatchlistImport } from '../lib/chart-watchlist-import.mjs';
import handler from '../api/access.mjs';
const market = (symbol, base, quote, patch = {}) => ({ symbol, baseAsset: base, quoteAsset: quote, status: 'TRADING', isSpotTradingAllowed: true, permissions: ['SPOT'],
  filters: [{ filterType: 'PRICE_FILTER', tickSize: '.00001000' }], ...patch });
const markets = spotMarkets({ symbols: [market('BTCUSDT', 'BTC', 'USDT'), market('XRPUSDT', 'XRP', 'USDT'), market('ETHBTC', 'ETH', 'BTC')] });
const SKIPPED_REFS = [
  'CME:BTC1!', 'OKX:USDTTRY', 'CBOE:VIX', 'FX_IDC:XAUTRYG', 'OKX:XAUTUSDT', 'BIST:XU100',
  'CRYPTOCAP:TOTAL', 'CRYPTOCAP:TOTAL2', 'CRYPTOCAP:TOTAL3', 'CRYPTOCAP:BTC.D', 'CRYPTOCAP:USDT.D',
  'BINANCE:BTCUSDT.P', 'BINANCE:ETHUSDT', 'BINANCE:BTCUSDT', 'OKX:ETHUSDT.P', 'TVC:GOLD',
  'BYBIT:BTCUSDT.P', 'BYBIT:ETHUSDT.P', 'FX:XAUUSD', 'FPMARKETS:US100', 'OKX:SOLUSDT',
  'OKX:PEPEUSDT.P', 'OKX:BNBUSDT.P', 'OKX:DOGEUSDT', 'OKX:AVAXUSDT.P', 'OKX:LTCUSDT.P',
  'OKX:XRPUSDT.P', 'OKX:SUIUSDT.P', 'OKX:LINKUSDT.P', 'OKX:NEARUSDT.P', 'OKX:INJUSDT',
  'OKX:AAVEUSDT.P', 'OKX:PYTHUSDT', 'OKX:HYPEUSDT.P', 'OKX:ZECUSDT.P', 'TVC:DXY',
  'OANDA:EURUSD', 'OANDA:NZDUSD', 'OANDA:USDJPY', 'FX_IDC:GBPAUD', 'OANDA:AUDUSD',
  'FOREXCOM:XAUUSD', 'FX:GBPUSD', 'OANDA:XAGUSD', 'FX:USDCHF', 'OANDA:USDCAD',
  'FX:NZDCAD', 'FX:AUDCHF', 'FX:AUDCAD'
];
test('Spot catalogue contains only trading spot pairs and retains exact quote/precision', () => {
  const data = spotMarkets({ symbols: [market('ETHBTC', 'ETH', 'BTC'), market('XRPUSDT', 'XRP', 'USDT'),
    market('PAUSEDUSDT', 'PAUSED', 'USDT', { status: 'BREAK' }), market('FUTUREUSDT', 'FUTURE', 'USDT', { isSpotTradingAllowed: false }),
    market('BTCUSDT.P', 'BTC', 'USDT'), market('BADUSDT', 'OTHER', 'USDT'), market('<script>', 'BAD', 'USDT')] });
  assert.deepEqual(data.map(m => m.symbol), ['ETHBTC', 'XRPUSDT']);
  assert.equal(data[0].quote, 'BTC'); assert.equal(data[0].precision, 5);
  assert.throws(() => spotMarkets({ symbols: [] }));
  assert.equal(validateMarket('XRPUSDT', '1h'), undefined);
  assert.equal(isMarketSymbol('1INCHUSDT'), true);
  assert.equal(isMarketSymbol('BINANCE:BTCUSDT.P'), true);
  for (const bad of ['BTCUSDT.P', 'btc', 'BTC-USDT', 'XRPUSDT&x=1', 'AAA\nBB']) assert.equal(isMarketSymbol(bad), false);
});
test('TradingView TXT/CSV preview keeps every venue and market type, deduplicates and explains real skips', () => {
  const parsed = parseWatchlistText('\uFEFF###Crypto,' + SKIPPED_REFS.join(',') + ',<img onerror=x>');
  const preview = importPreview(parsed, markets, ['BTCUSDT']);
  assert.equal(preview.added.length, SKIPPED_REFS.length - 2);
  for (const ref of ['BINANCE:BTCUSDT.P', 'OKX:ETHUSDT.P', 'BYBIT:ETHUSDT.P', 'CRYPTOCAP:TOTAL', 'FX:XAUUSD', 'CBOE:VIX', 'FX_IDC:XAUTRYG']) {
    assert.ok(preview.added.includes(ref), ref);
  }
  assert.equal(preview.skipped.length, 3);
  assert.ok(preview.skipped.some(x => x.reason === 'Listede zaten var'));
  assert.ok(preview.skipped.some(x => x.reason.includes('Spot kataloğunda yok')));
  assert.ok(preview.skipped.some(x => x.reason === 'Geçersiz sembol'));
  assert.ok(!preview.skipped.some(x => x.reason.includes('Farklı borsa')));
  assert.ok(!preview.skipped.some(x => x.reason.includes('Vadeli')));
  assert.deepEqual(importPreview(parseWatchlistText('BTC/USDT;XRPUSDT'), markets).added, ['BTCUSDT', 'XRPUSDT']);
  assert.deepEqual(cleanWatchlist(['BINANCE:BTCUSDT.P', 'OKX:USDTTRY', '<script>']), ['BINANCE:BTCUSDT.P', 'OKX:USDTTRY']);
  assert.ok(foreignMarkets().some(m => m.key === 'CRYPTOCAP:TOTAL' && m.chartable === false));
  assert.ok(foreignMarkets().some(m => m.key === 'OKX:BTCUSDT.P' && m.marketType === 'perp'));
  assert.ok(!foreignMarkets().some(m => m.key === 'XRPUSDT'), 'Binance Spot refs must not be duplicated in the foreign picker');
});
test('every skipped reference is reachable from the venue picker or the Spot catalogue', () => {
  const foreign = new Set(foreignMarkets().map(m => m.key));
  for (const ref of SKIPPED_REFS) {
    const market = parseMarketRef(ref);
    if (market.feed === 'binance' && market.marketType === 'spot') {
      assert.ok(isSpotSymbol(market.key), ref);
      assert.equal(isFreeMarketRef(ref), false, ref);
    } else {
      assert.ok(foreign.has(market.key), ref);
      assert.equal(isFreeMarketRef(ref), true, ref);
    }
  }
  for (const m of foreignMarkets()) {
    if (parseMarketRef(m.key).feed === 'binance') continue;
    assert.equal(isFreeMarketRef(m.key), true, m.key);
  }
  assert.equal(isFreeMarketRef('OKX:UNLISTED'), false);
  assert.equal(isFreeMarketRef('BTCUSDT'), false);
});
test('list/import limits are bounded, empty lists persist, and original lists are not changed by previews', () => {
  const saved = ['BTCUSDT']; importPreview(parseWatchlistText('XRPUSDT'), markets, saved);
  assert.deepEqual(saved, ['BTCUSDT']);
  assert.deepEqual(cleanWatchlist([], saved), []);
  assert.deepEqual(cleanWatchlist(['BTCUSDT', 'BTCUSDT', '<script>']), ['BTCUSDT']);
  assert.throws(() => parseWatchlistText('A'.repeat(512 * 1024 + 1)), /512 KB/);
  assert.throws(() => parseWatchlistText(Array(2001).fill('BTCUSDT').join(',')), /2000/);
  const full = Array.from({ length: WATCHLIST_LIMIT }, (_, i) => 'TOKEN' + i + 'USDT');
  assert.equal(importPreview(parseWatchlistText('XRPUSDT'), markets, full).added.length, 0);
});
test('TradingView chart URLs resolve explicit symbols only, and micro prices never become fake zeroes', () => {
  assert.equal(tradingViewSymbolURL('https://www.tradingview.com/chart/?symbol=BINANCE%3AXRPUSDT'), 'BINANCE:XRPUSDT');
  assert.equal(tradingViewSymbolURL('https://tr.tradingview.com/chart/abcDEF/?symbol=BINANCE:ETHBTC'), 'BINANCE:ETHBTC');
  for (const bad of ['https://tradingview.com.evil/chart/?symbol=BTCUSDT', 'javascript:alert(1)', 'https://u:p@tradingview.com/chart/?symbol=BTCUSDT']) assert.equal(tradingViewSymbolURL(bad), null);
  assert.equal(formatMarketPrice(.00001234, 8), '0,00001234');
  assert.equal(formatMarketPrice(65000.12, 2), '65.000,12');
});
const listHTML = (id = '12345') => '<script type="application/prs.init-data+json">' + JSON.stringify({ sharedWatchlist: { list: { id: Number(id), name: 'Public sample', symbols: ['###Crypto', 'BINANCE:BTCUSDT', 'BINANCE:XRPUSDT'] } } }) + '</script>';
test('public watchlist URLs are canonicalized to one constant host/path and refuse SSRF vectors', () => {
  assert.deepEqual(publicWatchlistURL('https://tr.tradingview.com/watchlists/00012345?x=1'), { id: '12345', url: 'https://www.tradingview.com/watchlists/12345/' });
  for (const bad of ['http://tradingview.com/watchlists/123/', 'https://tradingview.com.evil/watchlists/123/', 'https://127.0.0.1/watchlists/123/',
    'https://www.tradingview.com:8443/watchlists/123/', 'https://u:p@www.tradingview.com/watchlists/123/', 'https://www.tradingview.com/api/v1/symbols_list/all/',
    'https://www.tradingview.com/watchlists/0/', 'https://www.tradingview.com/watchlists/%31/', 'file:///etc/passwd', null]) assert.throws(() => publicWatchlistURL(bad));
});
test('parser uses the exact shared-list JSON, never unrelated page symbols or executable scripts', () => {
  assert.deepEqual(publicWatchlistData(listHTML(), '12345').symbols, ['BINANCE:BTCUSDT', 'BINANCE:XRPUSDT']);
  assert.throws(() => publicWatchlistData(listHTML(), '12346'));
  assert.throws(() => publicWatchlistData('<script>window.symbols=["BINANCE:BTCUSDT"]</script>', '12345'));
});
test('public import fetch has no cookies/auth/redirects, bounds the response, and fails closed for private lists', async () => {
  const result = await fetchPublicWatchlist('https://www.tradingview.com/watchlists/12345/', async (url, opts) => {
    assert.equal(url, 'https://www.tradingview.com/watchlists/12345/');
    assert.equal(opts.redirect, 'manual'); assert.equal(opts.credentials, 'omit');
    assert.equal(opts.headers.Authorization, undefined); assert.equal(opts.headers.Cookie, undefined);
    return new Response(listHTML(), { headers: { 'Content-Type': 'text/html' } });
  });
  assert.equal(result.symbols.length, 2);
  for (const status of [301, 302, 401, 403, 404, 429]) await assert.rejects(fetchPublicWatchlist('https://tradingview.com/watchlists/12345/', async () => new Response('', { status })));
  await assert.rejects(fetchPublicWatchlist('https://tradingview.com/watchlists/12345/', async () => new Response('x', { headers: { 'Content-Type': 'text/html', 'Content-Length': 3 * 1024 * 1024 } })), /too_large/);
  await assert.rejects(fetchPublicWatchlist('https://tradingview.com/watchlists/12345/', async () => new Response('x'.repeat(2 * 1024 * 1024 + 1), { headers: { 'Content-Type': 'text/html' } })), /too_large/);
});
test('public-link imports have a bounded per-account rate limit', () => {
  for (let i = 0; i < 6; i++) assert.equal(allowWatchlistImport('rate-test-only', 100000), true);
  assert.equal(allowWatchlistImport('rate-test-only', 100000), false);
  assert.equal(allowWatchlistImport('another-rate-test', 100000), true);
  assert.equal(allowWatchlistImport('rate-test-only', 160001), true);
});
test('existing access API requires Charts permission for link imports and does not write any storage', async () => {
  const saved = globalThis.fetch; let granted = false; const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url, method: opts.method || 'GET' });
    if (url.includes('/auth/v1/user')) return new Response(JSON.stringify({ id: 'watchlist-import-test', email: 'tester@example.test', email_confirmed_at: '2026-01-01', app_metadata: { alfa_charts: granted } }));
    assert.equal(url, 'https://www.tradingview.com/watchlists/12345/');
    return new Response(listHTML(), { headers: { 'Content-Type': 'text/html' } });
  };
  const invoke = async auth => {
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(text) { this.body = JSON.parse(text); } };
    await handler({ method: 'POST', headers: auth ? { authorization: 'Bearer fixture' } : {}, body: { op: 'chart-watchlist-import', url: 'https://www.tradingview.com/watchlists/12345/' } }, res);
    return res;
  };
  try {
    assert.equal((await invoke(false)).statusCode, 401);
    assert.equal((await invoke(true)).statusCode, 403);
    granted = true; const response = await invoke(true);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.symbols.length, 2);
    assert.equal(response.headers['Cache-Control'], 'private, no-store');
    assert.equal(response.headers.Vary, 'Authorization');
    assert.ok(calls.every(c => c.method === 'GET' && !c.url.includes('/rest/v1/')), 'no DB or third-party writes');
  } finally { globalThis.fetch = saved; }
});
