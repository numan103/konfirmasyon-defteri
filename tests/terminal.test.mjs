import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseWatchlist, marketSource, candleRequest, normalizeCandles, ema, sma, rsi, backtestEMA } from '../assets/terminal-model.mjs';
test('terminal can be reached from desktop Trader and mobile menus', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const trader = html.slice(html.indexOf('data-i18n="app.trader">⚡ Trader ▾'), html.indexOf('id="tab-alfatrading"'));
  assert.match(trader, /href="\?page=trading"[^>]*id="tab-trading"[^>]*data-nav/);
  assert.match(html, /href="\?page=trading"[^>]*id="mnav-trading"[^>]*data-mnav="trading"/);
});
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
test('SMA and Wilder RSI use past data and handle flat markets', () => {
  const data = Array.from({length: 50}, (_,i)=>({time:i+1,close:10}));
  assert.equal(sma(data, 20).length, 31);
  assert.equal(sma(data,20)[0].value,10);
  assert.equal(rsi(data)[0].value,50);
  assert.equal(rsi(data)[0].time,15);
  const rising = data.map((c,i)=>({...c,close:10+i}));
  assert.equal(rsi(rising).at(-1).value,100);
});
test('backtest validates configuration and executes signals at next open, charging both sides', () => {
  const data = Array.from({length:100},(_,i)=>{
    const close = 100 + 12*Math.sin(i/5);
    return {time:1700000000+i*60,open:close+2,close,high:close+4,low:close-2};
  });
  const free = backtestEMA(data,{fast:3,slow:8,feePct:0,slippagePct:0});
  const paid = backtestEMA(data,{fast:3,slow:8,feePct:0.2,slippagePct:0.1});
  assert.ok(free.trades.length>1);
  assert.ok(paid.netReturnPct < free.netReturnPct);
  const f=ema(data,3), s=ema(data,8);
  for (const t of free.trades) {
    const i=data.findIndex(c=>c.time===t.entryTime);
    assert.equal(t.entry,data[i].open);
    assert.ok(f[i-2].value<=s[i-2].value && f[i-1].value>s[i-1].value);
    assert.equal(t.exit,data.find(c=>c.time===t.exitTime).open);
  }
  assert.throws(()=>backtestEMA(data,{fast:21,slow:9}));
  assert.throws(()=>backtestEMA(data,{feePct:-1}));
  assert.throws(()=>backtestEMA(data.slice(0,5)));
});
test('backtest does not retroactively change past trades when future data changes', () => {
  const data=Array.from({length:100},(_,i)=>({time:i+1,open:100+15*Math.sin(i/5),close:100+15*Math.sin(i/5)}));
  const a=backtestEMA(data.slice(0,70),{fast:3,slow:8});
  const b=backtestEMA(data.map((c,i)=>i<70?c:{...c,open:1000,close:1000}),{fast:3,slow:8});
  assert.deepEqual(b.trades.filter(t=>t.exitTime<=70),a.trades);
});
