import { sendTelegram } from './telegram.mjs';
import { requestUser } from './auth.mjs';

const OPENMARKET_API = 'https://api.openmarket.xyz/v1/points';

async function fetchOpenMarket() {
  const key = process.env.OPENMARKET_API_KEY;
  if (!key) throw new Error('openmarket_key_missing');
  const url = OPENMARKET_API + '?type=BLOCK_BOOK_SNAPSHOT_AGG&exchange=BINANCE_FUTURES&rawSymbol=BTCUSDT&interval=MINUTE&maxDepth=1000&blockSize=25&sortDirection=SORT_DIRECTION_DESC';
  const res = await fetch(url, { headers: { 'X-OpenMarket-Key': key }, signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error('openmarket_depth_' + res.status);
  const d = await res.json();
  const point = d.series?.[0]?.points?.[0]?.Point;
  if (!point) throw new Error('openmarket_no_data');
  // bids/asks are flat arrays: [price, vol, price, vol, ...]
  const bids = [];
  const asks = [];
  const bArr = point.bids || [];
  const aArr = point.asks || [];
  for (let i = 0; i < bArr.length - 1; i += 2) bids.push([Number(bArr[i]), Number(bArr[i + 1])]);
  for (let i = 0; i < aArr.length - 1; i += 2) asks.push([Number(aArr[i]), Number(aArr[i + 1])]);
  const price = (bids.length && asks.length) ? (bids[0][0] + asks[0][0]) / 2 : null;
  return { bids, asks, price, source: 'OpenMarket (Binance Futures)' };
}

async function fetchOkxSpot() {
  const [depthRes, tickerRes] = await Promise.all([
    fetch('https://www.okx.com/api/v5/market/books?instId=BTC-USDT&sz=400', { signal: AbortSignal.timeout(9000) }),
    fetch('https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT', { signal: AbortSignal.timeout(9000) }),
  ]);
  if (!depthRes.ok) throw new Error('okx_depth_' + depthRes.status);
  const depth = await depthRes.json();
  if (depth.code !== '0') throw new Error('okx_api_' + (depth.msg || depth.code));
  const ticker = tickerRes.ok ? await tickerRes.json() : null;
  const bids = (depth.data?.[0]?.bids || []).map(([p, q]) => [Number(p), Number(q)]);
  const asks = (depth.data?.[0]?.asks || []).map(([p, q]) => [Number(p), Number(q)]);
  const price = ticker?.data?.[0]?.last ? Number(ticker.data[0].last) : (bids[0]?.[0] + asks[0]?.[0]) / 2;
  return { bids, asks, price, source: 'OKX Spot' };
}

export async function collectOrderbookLevels() {
  let result;
  try { result = await fetchOpenMarket(); }
  catch { result = await fetchOkxSpot(); }
  const { bids, asks, price: rawPrice, source } = result;
  const price = rawPrice || (Number(bids[0]?.[0]) + Number(asks[0]?.[0])) / 2;

  // En buyuk seviyeleri bul (bireysel fiyat seviyeleri).
  const topBidLevels = bids
    .filter(([, q]) => q >= 100)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .sort((a, b) => b[0] - a[0]);
  const topAskLevels = asks
    .filter(([, q]) => q >= 100)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .sort((a, b) => a[0] - b[0]);

  return { price, bidWalls: topBidLevels, askWalls: topAskLevels, fetchedAt: new Date().toISOString(), source };
}

function trPrice(n) { return Number(n).toLocaleString('tr-TR', { maximumFractionDigits: 0 }); }
function trVol(n) { return Number(n).toLocaleString('tr-TR', { maximumFractionDigits: 1 }); }

export function formatOrderbookMessage(data) {
  const lines = ['📊 BTC Order Book Derinliği (' + data.source + ')', ''];
  lines.push('Fiyat: $' + trPrice(data.price));
  lines.push('');
  lines.push('🟢 ALIŞ DUVARLARI (bid):');
  for (const [p, q] of data.bidWalls) {
    lines.push('  $' + trPrice(p) + ' · ' + trVol(q) + ' BTC  ↓');
  }
  lines.push('');
  lines.push('🔴 SATIŞ DUVARLARI (ask):');
  for (const [p, q] of data.askWalls) {
    lines.push('  $' + trPrice(p) + ' · ' + trVol(q) + ' BTC  ↑');
  }
  lines.push('');
  if (data.bidWalls.length) lines.push('En büyük alış duvarı: $' + trPrice(data.bidWalls.reduce((a, b) => a[1] > b[1] ? a : b)[0]) + ' (' + trVol(data.bidWalls.reduce((a, b) => a[1] > b[1] ? a : b)[1]) + ' BTC)');
  if (data.askWalls.length) lines.push('En büyük satış duvarı: $' + trPrice(data.askWalls.reduce((a, b) => a[1] > b[1] ? a : b)[0]) + ' (' + trVol(data.askWalls.reduce((a, b) => a[1] > b[1] ? a : b)[1]) + ' BTC)');
  lines.push('');
  lines.push('Kaynak: ' + data.source);
  return lines.join('\n');
}

export default async function orderbookHandler(req, res) {
  const url = new URL(req.url || '/api/ai', 'http://localhost');
  const secret = String(process.env.CRON_SECRET || process.env.MACRO_CRON_SECRET || '').trim();
  const auth = String(req.headers?.authorization || '');
  const secretOk = !!secret && auth === 'Bearer ' + secret;
  const cronHeader = String(req.headers?.['x-vercel-cron'] || '') === '1'
    || /^vercel-cron\//i.test(String(req.headers?.['user-agent'] || ''));
  let isAdminUser = false;
  if (!secretOk && !cronHeader) {
    try {
      const user = await requestUser(req);
      isAdminUser = !!(user && user.admin);
    } catch { isAdminUser = false; }
  }
  if (!secretOk && !cronHeader && !isAdminUser) return res.status(401).json({ error: 'unauthorized' });

  const dryRun = url.searchParams.get('dryRun') === '1';
  let data;
  try {
    data = await collectOrderbookLevels();
  } catch (e) {
    return res.status(502).json({ error: 'orderbook_unavailable', description: String(e.message || e).slice(0, 160) });
  }
  const text = formatOrderbookMessage(data);
  if (dryRun) return res.status(200).json({ ok: true, dryRun: true, text, data });

  const chat = String(process.env.COINALYZE_CHAT_ID || process.env.TG_TRADE_CHAT_ID || process.env.TG_CHAT_ID || '').trim();
  const raw = process.env.COINALYZE_THREAD != null ? process.env.COINALYZE_THREAD
    : process.env.TG_TRADE_THREAD != null ? process.env.TG_TRADE_THREAD : process.env.TG_THREAD;
  const n = raw == null || String(raw).trim() === '' || String(raw).trim() === '0' ? null : Number(String(raw).trim());
  const thread = Number.isSafeInteger(n) && n > 0 ? n : null;

  if (!process.env.TG_BOT_TOKEN || !chat) return res.status(503).json({ error: 'telegram_not_configured' });
  let out;
  try {
    out = await sendTelegram(text, chat, thread, null, { preview: false });
  } catch {
    return res.status(502).json({ error: 'telegram_network' });
  }
  if (out && out.ok && out.result && out.result.message_id) {
    return res.status(200).json({ ok: true, messageId: out.result.message_id, text, data });
  }
  return res.status(502).json({ error: 'telegram_rejected', http: out?.http, description: out?.description });
}
