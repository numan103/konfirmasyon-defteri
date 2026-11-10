import { sendTelegram } from './telegram.mjs';
import { requestUser } from './auth.mjs';

async function fetchBinanceSpot() {
  const [depthRes, tickerRes] = await Promise.all([
    fetch('https://api1.binance.com/api/v3/depth?symbol=BTCUSDT&limit=1000', { signal: AbortSignal.timeout(9000) }),
    fetch('https://api1.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT', { signal: AbortSignal.timeout(9000) }),
  ]);
  if (!depthRes.ok) throw new Error('binance_depth_' + depthRes.status);
  const depth = await depthRes.json();
  if (depth.code) throw new Error('binance_api_' + (depth.msg || depth.code));
  const ticker = tickerRes.ok ? await tickerRes.json() : null;
  return { bids: depth.bids || [], asks: depth.asks || [], price: ticker ? Number(ticker.lastPrice) : null, source: 'Binance Spot' };
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
  const bids = (depth.data?.[0]?.bids || []).map(([p, q]) => [p, q]);
  const asks = (depth.data?.[0]?.asks || []).map(([p, q]) => [p, q]);
  const price = ticker?.data?.[0]?.last ? Number(ticker.data[0].last) : (Number(bids[0]?.[0]) + Number(asks[0]?.[0])) / 2;
  return { bids, asks, price, source: 'OKX Spot' };
}

export async function collectOrderbookLevels() {
  let result;
  try { result = await fetchBinanceSpot(); }
  catch { result = await fetchOkxSpot(); }
  const { bids, asks, price: rawPrice, source } = result;
  const price = rawPrice || (Number(bids[0]?.[0]) + Number(asks[0]?.[0])) / 2;

  // 100 USD'lik kovalara topla.
  function bucket(levels) {
    const m = new Map();
    for (const [p, q] of levels) {
      const b = Math.floor(Number(p) / 100) * 100;
      const entry = m.get(b) || { vol: 0, topPrice: Number(p), topVol: 0 };
      entry.vol += Number(q);
      if (Number(q) > entry.topVol) { entry.topVol = Number(q); entry.topPrice = Number(p); }
      m.set(b, entry);
    }
    return [...m.entries()]
      .map(([b, e]) => [e.topPrice, e.vol])
      .sort((a, b) => b[1] - a[1]);
  }
  const bidWalls = bucket(bids).filter(([, q]) => q >= 5).slice(0, 6).sort((a, b) => b[0] - a[0]);
  const askWalls = bucket(asks).filter(([, q]) => q >= 5).slice(0, 6).sort((a, b) => a[0] - b[0]);

  return { price, bidWalls, askWalls, fetchedAt: new Date().toISOString(), source };
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
  if (data.bidWalls.length) lines.push('En büyük alış duvarı: $' + trPrice(data.bidWalls[0][0]) + ' (' + trVol(data.bidWalls[0][1]) + ' BTC)');
  if (data.askWalls.length) lines.push('En büyük satış duvarı: $' + trPrice(data.askWalls[0][0]) + ' (' + trVol(data.askWalls[0][1]) + ' BTC)');
  lines.push('');
  lines.push('Kaynak: ' + data.source + ' (order book)');
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
