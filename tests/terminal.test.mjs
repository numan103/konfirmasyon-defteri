import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWatchlist, marketSource, candleRequest, normalizeCandles, ema } from '../assets/terminal-model.mjs';
test('watchlist preserves exchange and spot/perpetual and rejects markup/URLs', () => {
  const parsed = parseWatchlist('BINANCE:BTCUSDT,BYBIT:BTCUSDT.P\nFX:EURUSD TVC:GOLD BINANCE:BTCUSDT <img> https://tr.tradingview.com/watchlists/84359879/');
  assert.deepEqual(parsed.symbols, ['BINANCE:BTCUSDT','BYBIT:BTCUSDT.P','FX:EURUSD','TVC:GOLD']);
  assert.equal(parsed.rejected.length, 2);
  assert.equal(marketSource('TVC:GOLD').native, false);
});
test('requests preserve actual exchange and derivatives market', () => {
  assert.match(candleRequest('OKX:ETHUSDT.P', '60'), /instId=ETH-USDT-SWAP&bar=1H/);
  assert.match(candleRequest('BINANCE:BTCUSDT.P', '1440'), /fapi.binance.com.*interval=1d/);
  assert.match(candleRequest('BYBIT:BTCUSDT', '15'), /category=spot/);
  assert.equal(candleRequest('FX:EURUSD', '60'), null);
  assert.equal(candleRequest('BINANCE:BTCUSDT', 'bad'), null);
});
test('candles sorted, deduplicated, invalid data excluded and EMA computed', () => {
  const result = normalizeCandles({ code:'0',data:[['2000','2','4','1','3'],['1000','1','3','1','2'],['2000','2','4','1','3'],['3000','bad','4','1','3']] }, 'OKX');
  assert.deepEqual(result.map(c=>c.time), [1,2]);
  assert.equal(ema(result)[0].value, 2);
  assert.ok(ema(result)[1].value > 2);
  assert.throws(()=>normalizeCandles({code:'51000'},'OKX'));
});
