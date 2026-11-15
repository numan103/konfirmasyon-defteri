import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TIMEFRAMES, SYMBOLS, REST_ORIGINS, STREAM_ORIGINS, validateMarket, restURL, streamURL,
  candle, parseHistory, parseKline, mergeCandles, fetchHistory
} from '../assets/alfa-charts-data.mjs';

const root = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('alfa charts supports exactly the requested timeframes', () => {
  assert.deepEqual(Object.keys(TIMEFRAMES), ['1M', '5M', '15M', '30M', '1H', '4H', '1D', '1W']);
  assert.deepEqual(Object.values(TIMEFRAMES), ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w']);
});

test('market validation blocks free-form symbols and intervals', () => {
  assert.equal(validateMarket('BTCUSDT', '1h'), undefined);
  assert.equal(validateMarket('ETHUSDT', '1w'), undefined);
  for (const bad of [['BTCUSDT;DROP', '1h'], ['BTCUSDT', '2h'], ['', '1h'], ['BTCUSDT', '1H'], [null, null]]) {
    assert.throws(() => validateMarket(...bad));
  }
  for (const bad of ['btcusdt', 'BTCUSDT.P', 'BTC-USDT']) assert.throws(() => validateMarket(bad, '1m'));
  assert.ok(!SYMBOLS.includes('BTCUSDT.P'));
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
  const payload = { e: 'kline', s: 'BTCUSDT', k: { s: 'BTCUSDT', i: '1h', t: 1794751200000, o: '65509.24', h: '65700.00', l: '65400.00', c: '65650.10' } };
  assert.deepEqual(parseKline(JSON.stringify(payload), 'BTCUSDT', '1h'), {
    time: 1794751200, open: 65509.24, high: 65700, low: 65400, close: 65650.1
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

test('chart page uses the vendored open-source library and no TradingView iframe', () => {
  const html = read('alfa-charts.html');
  const script = read('assets/alfa-charts.mjs');
  assert.match(html, /ALFA CHARTS/);
  assert.match(html, /\/assets\/alfa-charts\.mjs\?v=\d+/);
  assert.doesNotMatch(html, /<iframe/i);
  assert.doesNotMatch(html, /tradingview\.com\/.*widget|embed-widget/i);
  assert.doesNotMatch(script, /embed-widget|tradingview\.com/i);
  assert.match(script, /vendor\/lightweight-charts-5\.0\.9\/lightweight-charts\.standalone\.production\.mjs/);
  assert.ok(fs.existsSync(path.join(root, 'assets/vendor/lightweight-charts-5.0.9/lightweight-charts.standalone.production.mjs')));
  assert.ok(fs.existsSync(path.join(root, 'assets/vendor/lightweight-charts-5.0.9/LICENSE.txt')));
  assert.match(read('assets/vendor/lightweight-charts-5.0.9/LICENSE.txt'), /Apache License/);
});

test('alfa charts is reachable from the existing site navigation', () => {
  const html = read('index.html');
  assert.match(html, /href="\/alfa-charts\.html"[^>]*data-i18n="tv\.alfaCharts"/);
  assert.match(html, /'tv\.alfaCharts': \{ tr: '📈 ALFA CHARTS', en: '📈 ALFA CHARTS' \}/);
});
