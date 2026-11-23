import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TIMEFRAMES, SYMBOLS, REST_ORIGINS, STREAM_ORIGINS, validateMarket, restURL, streamURL,
  candle, parseHistory, parseKline, mergeCandles, fetchHistory,
  parseMarketRef, isMarketRef, isSpotSymbol, isFreeMarketRef, fetchMarketQuotes, setMarketTokenProvider
} from '../assets/alfa-charts-data.mjs';

const root = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const SKIPPED_REFS = [
  'CME:BTC1!', 'OKX:USDTTRY', 'CBOE:VIX', 'FX_IDC:XAUTRYG', 'OKX:XAUTUSDT', 'BIST:XU100',
  'CRYPTOCAP:TOTAL', 'CRYPTOCAP:TOTAL2', 'CRYPTOCAP:TOTAL3', 'CRYPTOCAP:BTC.D', 'CRYPTOCAP:USDT.D',
  'BINANCE:BTCUSDT.P', 'BINANCE:ETHUSDT', 'BINANCE:BTCUSDT', 'OKX:ETHUSDT.P', 'TVC:GOLD',
  'BYBIT:BTCUSDT.P', 'BYBIT:ETHUSDT.P', 'FX:XAUUSD', 'FPMARKETS:US100', 'OKX:SOLUSDT',
  'OKX:PEPEUSDT.P', 'OKX:BNBUSDT.P', 'OKX:ADAUSDT', 'OKX:AVAXUSDT.P', 'OKX:LTCUSDT.P',
  'OKX:XRPUSDT.P', 'OKX:SUIUSDT.P', 'OKX:LINKUSDT.P', 'OKX:NEARUSDT.P', 'OKX:INJUSDT',
  'OKX:AAVEUSDT.P', 'OKX:PYTHUSDT', 'OKX:HYPEUSDT.P', 'OKX:ZECUSDT.P', 'TVC:DXY',
  'OANDA:EURUSD', 'OANDA:NZDUSD', 'OANDA:USDJPY', 'FX_IDC:GBPAUD', 'OANDA:AUDUSD',
  'FOREXCOM:XAUUSD', 'FX:GBPUSD', 'OANDA:XAGUSD', 'FX:USDCHF', 'OANDA:USDCAD',
  'FX:NZDCAD', 'FX:AUDCHF', 'FX:AUDCAD'
];

test('alfa charts supports the requested timeframes and extended presets', () => {
  assert.deepEqual(Object.keys(TIMEFRAMES), ['1M', '3M', '5M', '15M', '30M', '1H', '2H', '4H', '6H', '12H', '1D', '3D', '1W']);
  assert.deepEqual(Object.values(TIMEFRAMES), ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '12h', '1d', '3d', '1w']);
});

test('market validation accepts venue-qualified symbols and blocks free-form symbols', () => {
  assert.equal(validateMarket('BTCUSDT', '1h'), undefined);
  assert.equal(validateMarket('ETHUSDT', '1w'), undefined);
  assert.equal(validateMarket('BTCUSDT', '2h'), undefined);
  assert.equal(validateMarket('OKX:BTCUSDT.P', '1h'), undefined);
  assert.equal(validateMarket('CBOE:VIX', '1d'), undefined);
  assert.throws(() => validateMarket('CRYPTOCAP:TOTAL', '1h'), /mum geçmişi/);
  for (const bad of [['BTCUSDT;DROP', '1h'], ['BTCUSDT', '7h'], ['', '1h'], ['BTCUSDT', '1H'], [null, null]]) {
    assert.throws(() => validateMarket(...bad));
  }
  for (const bad of ['btcusdt', 'BTCUSDT.P', 'BTC-USDT', 'BINANCE:']) assert.equal(isMarketRef(bad), false);
  assert.equal(isSpotSymbol('BTCUSDT'), true);
  assert.equal(isSpotSymbol('BINANCE:BTCUSDT'), false);
  assert.ok(!SYMBOLS.includes('BTCUSDT.P'));
});

test('every skipped TradingView reference keeps its own venue and market type', () => {
  for (const ref of SKIPPED_REFS) {
    const market = parseMarketRef(ref);
    assert.equal(market.key, ref.startsWith('BINANCE:') && market.marketType === 'spot' ? ref.slice(8) : ref, ref);
    assert.ok(market.feed && market.venue && market.label, ref);
  }
  assert.equal(parseMarketRef('BINANCE:BTCUSDT').key, 'BTCUSDT');
  assert.equal(parseMarketRef('BINANCE:BTCUSDT.P').feed, 'binance-perp');
  assert.equal(parseMarketRef('OKX:BTCUSDT.P').feedSymbol, 'BTC-USDT-SWAP');
  assert.equal(parseMarketRef('OKX:USDTTRY').feedSymbol, 'USDT-TRY');
  assert.equal(parseMarketRef('BYBIT:ETHUSDT.P').feedSymbol, 'ETHUSDT');
  assert.equal(parseMarketRef('CBOE:VIX').feedSymbol, '^VIX');
  assert.equal(parseMarketRef('CME:BTC1!').feedSymbol, 'BTC=F');
  assert.equal(parseMarketRef('BIST:XU100').feedSymbol, 'XU100.IS');
  assert.equal(parseMarketRef('OANDA:EURUSD').feedSymbol, 'EURUSD=X');
  assert.equal(parseMarketRef('FX_IDC:XAUTRYG').feed, 'derived');
  assert.equal(parseMarketRef('CRYPTOCAP:TOTAL').chartable, false);
});

test('request URLs stay inside Binance spot endpoints', () => {
  assert.equal(restURL(REST_ORIGINS[0], 'BTCUSDT', '1h'),
    'https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=1000');
  assert.equal(streamURL(STREAM_ORIGINS[0], 'BTCUSDT', '1m'),
    'wss://data-stream.binance.vision/ws/btcusdt@kline_1m');
  assert.equal(streamURL(STREAM_ORIGINS[1], 'ETHUSDT', '1w'),
    'wss://stream.binance.com:9443/ws/ethusdt@kline_1w');
  assert.throws(() => restURL(REST_ORIGINS[0], 'BTCUSDT', '1M'));
});

test('real Binance rows are parsed, sorted, deduplicated and validated', () => {
  const rows = [
    [1794751200000, '65509.24', '65700.00', '65400.00', '65650.10', '100'],
    [1794747600000, '65351.00', '65578.01', '65184.35', '65509.24', '200'],
    [1794751200000, '65509.24', '65800.00', '65400.00', '65710.10', '120']
  ];
  const parsed = parseHistory(rows);
  assert.equal(parsed.length, 2);
  assert.deepEqual(parsed.map(c => c.time), [1794747600, 1794751200]);
  assert.equal(parsed[1].close, 65710.1);
  assert.throws(() => parseHistory([]));
  assert.throws(() => parseHistory([['x', '1', '2', '0.5', '1']]));
  assert.throws(() => parseHistory([[1794751200000, '10', '9', '8', '10']]));
  assert.throws(() => parseHistory([[1794751200000, '10', '12', '11', '10']]));
  assert.throws(() => parseHistory('not rows'));
});

test('websocket messages are validated against the selected market', () => {
  const payload = { e: 'kline', s: 'BTCUSDT', k: { s: 'BTCUSDT', i: '1h', t: 1794751200000, o: '65509.24', h: '65700.00', l: '65400.00', c: '65650.10', v: '123.45' } };
  assert.deepEqual(parseKline(JSON.stringify(payload), 'BTCUSDT', '1h'), {
    time: 1794751200, open: 65509.24, high: 65700, low: 65400, close: 65650.1, volume: 123.45
  });
  assert.equal(parseKline(payload, 'ETHUSDT', '1h'), null);
  assert.equal(parseKline(payload, 'BTCUSDT', '4h'), null);
  assert.equal(parseKline({ ...payload, e: 'trade' }, 'BTCUSDT', '1h'), null);
  assert.throws(() => parseKline('{broken', 'BTCUSDT', '1h'));
});

test('live updates replace the open candle without dropping history', () => {
  const base = [
    { time: 1000, open: 10, high: 12, low: 9, close: 11 },
    { time: 2000, open: 11, high: 13, low: 10, close: 12 }
  ];
  const merged = mergeCandles(base, [{ time: 2000, open: 11, high: 14, low: 10, close: 13 }], 1000);
  assert.equal(merged.length, 2);
  assert.equal(merged[1].high, 14);
  assert.equal(merged[1].close, 13);
  assert.deepEqual(base[1].high, 13);
  assert.equal(mergeCandles(base, [{ time: 3000, open: 13, high: 15, low: 12, close: 14 }], 2).length, 2);
});

test('history fetch falls back to the second origin and never invents candles', async () => {
  const calls = [];
  const rows = [[1794751200000, '10', '11', '9', '10.5']];
  const parsed = await fetchHistory('BTCUSDT', '1h', undefined, async url => {
    calls.push(url);
    if (calls.length === 1) return { ok: false, status: 451 };
    return { ok: true, json: async () => rows };
  });
  assert.equal(parsed.length, 1);
  assert.equal(calls[0].startsWith('https://data-api.binance.vision/'), true);
  assert.equal(calls[1].startsWith('https://api.binance.com/'), true);

  await assert.rejects(() => fetchHistory('BTCUSDT', '1h', undefined, async () => ({ ok: false, status: 500 })));
  await assert.rejects(() => fetchHistory('BTCUSDT', '1h', undefined, async () => { throw new Error('offline'); }));
});

test('imported refs use the free public data path while keeping the original ref', async () => {
  assert.equal(isFreeMarketRef('OKX:BTCUSDT.P'), true);
  assert.equal(isFreeMarketRef('CRYPTOCAP:TOTAL'), true);
  assert.equal(isFreeMarketRef('BINANCE:BTCUSDT'), false);
  assert.equal(isFreeMarketRef('OKX:ADAUSDT'), false);

  const calls = [];
  const bars = await fetchHistory('OKX:BTCUSDT.P', '1h', undefined, async (url, opts) => {
    calls.push({ url, opts });
    return { ok: true, json: async () => ({ ok: true, candles: [{ time: 1794751200000, open: 10, high: 12, low: 9, close: 11, volume: 5 }] }) };
  });
  assert.equal(calls[0].url, '/api/access');
  const body = JSON.parse(calls[0].opts.body);
  assert.equal(body.op, 'chart-market-data-free');
  assert.equal(body.ref, 'OKX:BTCUSDT.P');
  assert.equal(body.interval, '1h');
  assert.equal(bars[0].close, 11);

  const serverSeconds = await fetchHistory('OKX:BTCUSDT.P', '1h', undefined, async () => ({
    ok: true, json: async () => ({ ok: true, candles: [{ time: 1794751200, open: 10, high: 12, low: 9, close: 11, volume: 5 }] })
  }));
  assert.deepEqual(serverSeconds, [{ time: 1794751200, open: 10, high: 12, low: 9, close: 11, volume: 5 }]);

  const directCalls = [];
  const directBars = await fetchHistory('OKX:BTCUSDT.P', '1h', undefined, async (url, opts) => {
    directCalls.push({ url, opts });
    if (url === '/api/access') return { ok: false, status: 502, json: async () => ({ ok: false, error: 'market_unavailable' }) };
    return { ok: true, json: async () => ({ code: '0', data: [['1794751200000', '10', '12', '9', '11', '5']] }) };
  });
  assert.match(directCalls[1].url, /^https:\/\/www\.okx\.com\/api\/v5\/market\/candles\?/);
  assert.deepEqual(directBars, [{ time: 1794751200, open: 10, high: 12, low: 9, close: 11, volume: 5 }]);
  await assert.rejects(() => fetchHistory('FX:XAUUSD', '1h', undefined, async () => ({
    ok: false, status: 502, json: async () => ({ ok: false, error: 'market_unavailable' })
  })), /market_unavailable/);

  const quoteOnly = await fetchHistory('CRYPTOCAP:TOTAL', '1h', undefined, async () => ({
    ok: true, json: async () => ({ ok: true, chartable: false, quote: { price: 2500, change: 1.5 } })
  }));
  assert.equal(quoteOnly.length, 1);
  assert.equal(quoteOnly[0].close, 2500);

  const gatedCalls = [];
  await fetchHistory('OKX:ADAUSDT', '1h', undefined, async (url, opts) => {
    gatedCalls.push({ url, opts });
    return { ok: true, json: async () => ({ ok: true, candles: [] }) };
  });
  assert.equal(JSON.parse(gatedCalls[0].opts.body).op, 'chart-market-data');

  setMarketTokenProvider(async () => 'fixture-token');
  const quoteCalls = [];
  const quotes = await fetchMarketQuotes(['CBOE:VIX', 'OKX:ADAUSDT'], undefined, async (url, opts) => {
    quoteCalls.push({ url, opts });
    const request = JSON.parse(opts.body);
    if (request.op === 'chart-market-quotes-free') return { ok: true, json: async () => ({ ok: true, quotes: { 'CBOE:VIX': { price: 19, change: 2, at: 1 } } }) };
    return { ok: true, json: async () => ({ ok: true, quotes: { 'OKX:ADAUSDT': { price: 7, change: 1, at: 1 } } }) };
  });
  assert.deepEqual(quoteCalls.map(c => JSON.parse(c.opts.body).op), ['chart-market-quotes-free', 'chart-market-quotes']);
  assert.equal(quotes['CBOE:VIX'].price, 19);
  assert.equal(quotes['OKX:ADAUSDT'].price, 7);

  const partial = await fetchMarketQuotes(['CRYPTOCAP:TOTAL', 'OKX:ADAUSDT'], undefined, async (url, opts) => {
    const request = JSON.parse(opts.body);
    if (request.op === 'chart-market-quotes-free') return { ok: true, json: async () => ({ ok: true, quotes: { 'CRYPTOCAP:TOTAL': { price: 100, change: 1, at: 1 } } }) };
    return { ok: false, status: 401, json: async () => ({ ok: false, error: 'unauthorized' }) };
  });
  assert.equal(partial['CRYPTOCAP:TOTAL'].price, 100);
  assert.equal(partial['OKX:ADAUSDT'], undefined);
  setMarketTokenProvider(async () => '');
});

test('chart page uses the vendored open-source library and no TradingView iframe', () => {
  const html = read('alfa-charts.html');
  const script = read('assets/alfa-charts.mjs');
  assert.match(html, /ALFA CHARTS/);
  assert.match(html, /\/assets\/alfa-charts\.mjs\?v=\d+/);
  assert.doesNotMatch(html, /<iframe/i);
  assert.doesNotMatch(html, /tradingview\.com\/.*widget|embed-widget/i);
  assert.doesNotMatch(script, /embed-widget|tradingview\.com/i);
  assert.match(script, /vendor\/lightweight-charts-5\.0\.9\/lightweight-charts\.standalone\.production\.mjs/);
  assert.match(script, /connectPolling/);
  assert.match(script, /mum geçmişi yok/);
  assert.ok(fs.existsSync(path.join(root, 'assets/vendor/lightweight-charts-5.0.9/lightweight-charts.standalone.production.mjs')));
  assert.ok(fs.existsSync(path.join(root, 'assets/vendor/lightweight-charts-5.0.9/LICENSE.txt')));
  assert.match(read('assets/vendor/lightweight-charts-5.0.9/LICENSE.txt'), /Apache License/);
});

test('alfa charts is reachable from the existing site navigation', () => {
  const html = read('index.html');
  assert.match(html, /href="\/alfa-charts\.html"[^>]*data-i18n="tv\.alfaCharts"/);
  assert.match(html, /'tv\.alfaCharts': \{ tr: '📈 ALFA CHARTS', en: '📈 ALFA CHARTS' \}/);
});

test('chart workspace has TradingView-style context actions without vendor branding or screenshot stamp', () => {
  const html = read('alfa-charts.html');
  const script = read('assets/alfa-charts.mjs');
  const drawings = read('assets/alfa-drawings.mjs');
  const css = read('assets/alfa-charts.css');
  assert.doesNotMatch(html, /Lightweight Charts|tradingview\.com/i);
  assert.doesNotMatch(html, /Binance mum verileri yükleniyor|Piyasa verileri yükleniyor/);
  assert.match(script, /attributionLogo:\s*false/);
  assert.doesNotMatch(script, /ALFA CHARTS ·|alfa-charts-\$\{String\(symbol\)/);
  for (const action of [
    'Grafik görünümü sıfırla', 'Grafik ayarları…', 'Görünümü sığdır', 'Son muma dön',
    'Tam ekran', 'Sade mod', 'Logaritmik fiyat ölçeği', 'Ekran görüntüsü indir', 'Bağlantıyı kopyala'
  ]) assert.ok(drawings.includes(action), action);
  assert.match(drawings, /onChartAction/);
  assert.match(script, /function resetChartView/);
  assert.match(script, /function openChartSettingsModal/);
  assert.match(script, /marketHistoryCache/);
  assert.match(script, /prefetchMarket/);
  assert.match(css, /#message\{position:absolute;right:12px;bottom:44px/);
});
