import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchOpenInterest, fetchLongShortRatio, fetchAggTrades, cvdSeries,
  marketDeltaSeries, footprintSeries, fetchDepthHeatmap, intervalToPeriod,
  fetchKlineFlow, cvdFromFlow, deltaFromFlow, footprintFromFlow
} from '../assets/alfa-market-data-public.mjs';

const jsonResponse = data => ({ ok: true, status: 200, json: async () => data });

test('public open interest and long/short adapters normalize upstream rows', async () => {
  const calls = [];
  const fetcher = async url => {
    calls.push(url);
    if (url.includes('openInterestHist')) return jsonResponse([
      { symbol: 'BTCUSDT', sumOpenInterest: '20', sumOpenInterestValue: '400', timestamp: 200000 },
      { symbol: 'BTCUSDT', sumOpenInterest: '10', sumOpenInterestValue: '200', timestamp: 100000 }
    ]);
    return jsonResponse([
      { longShortRatio: '1.5', longAccount: '0.6', shortAccount: '0.4', timestamp: 200000 },
      { longShortRatio: '1.2', longAccount: '0.55', shortAccount: '0.45', timestamp: 100000 }
    ]);
  };
  assert.deepEqual(await fetchOpenInterest('BTCUSDT', '5m', 500, undefined, fetcher), [
    { time: 100, value: 10, valueUsd: 200 }, { time: 200, value: 20, valueUsd: 400 }
  ]);
  assert.deepEqual(await fetchLongShortRatio('BTCUSDT', '5m', 500, undefined, fetcher), [
    { time: 100, ratio: 1.2, long: 0.55, short: 0.45 },
    { time: 200, ratio: 1.5, long: 0.6, short: 0.4 }
  ]);
  assert.match(calls[0], /fapi\.binance\.com\/futures\/data\/openInterestHist\?symbol=BTCUSDT&period=5m&limit=500/);
  assert.match(calls[1], /globalLongShortAccountRatio/);
});

test('compressed trade pagination is bounded and preserves taker side', async () => {
  const urls = [];
  const fetcher = async url => {
    urls.push(url);
    const fromId = Number(new URL(url).searchParams.get('fromId') || 0);
    if (fromId === 0) return jsonResponse(Array.from({ length: 1000 }, (_, i) => ({ a: i + 1, T: 1000 + i, p: '10', q: '1', m: false })));
    return jsonResponse([{ a: 1001, T: 2000, p: '11', q: '2', m: true }]);
  };
  const trades = await fetchAggTrades({ symbol: 'BTCUSDT', pages: 9, fetcher });
  assert.equal(urls.length, 2);
  assert.equal(trades.length, 1001);
  assert.equal(trades.at(-1).buy, false);
  assert.equal(trades[0].buy, true);
});

test('CVD, market delta and footprint are derived from real taker quantities', () => {
  const trades = [
    { time: 10, price: 100, qty: 2, buy: true },
    { time: 20, price: 101, qty: 1, buy: false },
    { time: 70, price: 101, qty: 3, buy: false },
    { time: 80, price: 100, qty: 4, buy: true }
  ];
  assert.deepEqual(cvdSeries(trades, 60), [{ time: 0, value: 1 }, { time: 60, value: 2 }]);
  assert.deepEqual(marketDeltaSeries(trades, 60).map(p => p.value), [1, 1]);
  const footprint = footprintSeries(trades, 60, 0.5);
  assert.deepEqual(footprint.find(l => l.time === 0 && l.price === 100).buy, 2);
  assert.deepEqual(footprint.find(l => l.time === 60 && l.price === 101).sell, 3);
  assert.ok(footprint.every(l => Number.isFinite(l.delta) && l.total > 0));
});

test('kline taker flow derives full-history CVD, delta and footprint from public rows', async () => {
  const urls = [];
  const fetcher = async url => {
    urls.push(url);
    return jsonResponse([
      [200000, '0', '0', '0', '0', '10', '259999', '0', 12, '7', '0', '0'],
      [100000, '0', '0', '0', '0', '6', '159999', '0', 8, '2', '0', '0']
    ]);
  };
  const flow = await fetchKlineFlow({ symbol: 'BTCUSDT', market: 'perp', interval: '15m', limit: 500, startTime: 100, fetcher });
  assert.deepEqual(flow, [
    { time: 100, volume: 6, buy: 2, sell: 4, trades: 8 },
    { time: 200, volume: 10, buy: 7, sell: 3, trades: 12 }
  ]);
  assert.match(urls[0], /fapi\.binance\.com\/fapi\/v1\/klines\?symbol=BTCUSDT&interval=15m&limit=500&startTime=100/);
  assert.deepEqual(cvdFromFlow(flow), [{ time: 100, value: -2 }, { time: 200, value: 2 }]);
  assert.deepEqual(deltaFromFlow(flow).map(p => p.value), [-2, 4]);
  assert.deepEqual(footprintFromFlow(flow).map(p => p.total), [6, 10]);
});

test('depth heatmap normalizes both sides without inventing liquidity', async () => {
  const fetcher = async () => jsonResponse({
    bids: [['100', '2'], ['99', '1']], asks: [['101', '1'], ['102', '4']]
  });
  const heat = await fetchDepthHeatmap({ symbol: 'BTCUSDT', levels: 2, fetcher });
  assert.equal(heat.mid, 100.5);
  assert.equal(heat.bids.length, 2);
  assert.equal(heat.asks.length, 2);
  assert.equal(heat.max, 408);
  assert.equal(heat.asks.at(-1).weight, 1);
  assert.equal(heat.bids.at(-1).weight, 99 / 408);
  assert.equal(intervalToPeriod('15m'), '15m');
  assert.equal(intervalToPeriod('4h'), '1h');
});
