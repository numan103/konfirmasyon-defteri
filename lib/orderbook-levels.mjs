// Binance Futures BTCUSDT order book derinliginden en buyuk emir seviyelerini ceker.
// Ucretsiz, API anahtari gerektirmez.
import { sendTelegram } from './telegram.mjs';
import { requestUser } from './auth.mjs';

const API = 'https://fapi.binance.com';

export async function collectOrderbookLevels() {
  const [depthRes, tickerRes] = await Promise.all([
    fetch(API + '/fapi/v1/depth?symbol=BTCUSDT&limit=1000', { signal: AbortSignal.timeout(9000) }),
    fetch(API + '/fapi/v1/ticker/24hr?symbol=BTCUSDT', { signal: AbortSignal.timeout(9000) }),
  ]);
  if (!depthRes.ok) throw new Error('orderbook_depth_' + depthRes.status);
  const depth = await depthRes.json();
  const ticker = tickerRes.ok ? await tickerRes.json() : null;
  const bids = depth.bids || [];
  const asks = depth.asks || [];
  const price = ticker ? Number(ticker.lastPrice) : (Number(bids[0]?.[0]) + Number(asks[0]?.[0])) / 2;

  // 100 USD'lik kovalara topla, her kovada en buyuk seviyeyi de takip et.
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
  const bidWalls = bucket(bids).filter(([, q]) => q >= 20).slice(0, 5).sort((a, b) => b[0] - a[0]);
  const askWalls = bucket(asks).filter(([, q]) => q >= 20).slice(0, 5).sort((a, b) => a[0] - b[0]);

  return { price, bidWalls, askWalls, fetchedAt: new Date().toISOString() };
}

function trPrice(n) { return Number(n).toLocaleString('tr-TR', { maximumFractionDigits: 0 }); }
function trVol(n) { return Number(n).toLocaleString('tr-TR', { maximumFractionDigits: 1 }); }

export function formatOrderbookMessage(data) {
  const lines = ['📊 BTC Order Book Derinliği (Binance Futures)', ''];
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
  lines.push('En büyük alış duvarı: $' + trPrice(data.bidWalls[0]?.[0]) + ' (' + trVol(data.bidWalls[0]?.[1]) + ' BTC)');
  lines.push('En büyük satış duvarı: $' + trPrice(data.askWalls[0]?.[0]) + ' (' + trVol(data.askWalls[0]?.[1]) + ' BTC)');
  lines.push('');
  lines.push('Kaynak: Binance Futures L2 (1000 seviye)');
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
