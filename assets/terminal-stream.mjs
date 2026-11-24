import { marketSource, normalizeCandles } from './terminal-model.mjs?v=3';
export function streamConfig(symbol, interval) {
  const m = marketSource(symbol), n = Number(interval);
  const bin = {1:'1m',5:'5m',15:'15m',60:'1h',240:'4h',1440:'1d'};
  const okx = {1:'1m',5:'5m',15:'15m',60:'1H',240:'4H',1440:'1Dutc'};
  if (!m.native || !bin[n]) return null;
  if (m.exchange === 'BINANCE') return {url:`${m.perpetual ? 'wss://fstream.binance.com/ws/' : 'wss://stream.binance.com:9443/ws/'}${m.pair.toLowerCase()}@kline_${bin[n]}`,exchange:m.exchange};
  if (m.exchange === 'OKX') return {url:'wss://ws.okx.com:8443/ws/v5/business',exchange:m.exchange,subscribe:{op:'subscribe',args:[{channel:'candle'+okx[n],instId:m.pair.slice(0,-4)+'-USDT'+(m.perpetual?'-SWAP':'')}]},ping:'ping'};
  return {url:`wss://stream.bybit.com/v5/public/${m.perpetual?'linear':'spot'}`,exchange:m.exchange,subscribe:{op:'subscribe',args:[`kline.${n===1440?'D':n}.${m.pair}`]},ping:JSON.stringify({op:'ping'})};
}
export function streamCandle(raw, exchange) {
  try {
    const d = typeof raw === 'string' ? JSON.parse(raw) : raw;
    let rows;
    if (exchange === 'BINANCE') { const k=d.k; if (!k) return null; rows=[[k.t,k.o,k.h,k.l,k.c,k.v]]; }
    else if (exchange === 'OKX') rows=d.data;
    else rows=d.data?.map(k=>[k.start,k.open,k.high,k.low,k.close,k.volume]);
    if (!Array.isArray(rows)) return null;
    return normalizeCandles({code:'0',data:rows},'OKX').at(-1)||null;
  } catch { return null; }
}
export function mergeLive(data, candle) {
  if (!candle || !data.length || candle.time < data.at(-1).time) return data;
  return (candle.time === data.at(-1).time ? [...data.slice(0,-1),candle] : [...data,candle]).slice(-500);
}
export function connectFeed(symbol, interval, onCandle, onState) {
  const config=streamConfig(symbol,interval);
  if (!config) return ()=>{};
  let socket, closed=false, retry, heartbeat, attempt=0;
  const start=()=>{
    if (closed) return;
    onState('connecting');
    try { socket=new WebSocket(config.url); } catch { schedule(); return; }
    socket.onopen=()=>{
      attempt=0;
      if (config.subscribe) socket.send(JSON.stringify(config.subscribe));
      if (config.ping) heartbeat=setInterval(()=>{if(socket.readyState===1)socket.send(config.ping);},30000);
    };
    socket.onmessage=e=>{const candle=streamCandle(e.data,config.exchange);if(candle){onState('live');onCandle(candle);}};
    socket.onerror=()=>socket.close();
    socket.onclose=()=>{clearInterval(heartbeat);schedule();};
  };
  const schedule=()=>{
    if(closed)return;
    onState('reconnecting');
    retry=setTimeout(start,Math.min(30000,1000*2**Math.min(attempt++,5)));
  };
  start();
  return ()=>{closed=true;clearTimeout(retry);clearInterval(heartbeat);if(socket){socket.onclose=null;socket.close();}};
}
