import { sendTelegram } from './telegram.mjs';
import { requestUser } from './auth.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zvnjslmptwmnuhftgqsr.supabase.co';
const FALLBACK_PUB = 'sb_publishable_bReG5UKaWcQkU0Z9GnGiJQ_0T4_Qm9X';
const ALERT_ROW = 'orderbook_alert';
const ALERT_DEDUPE_MS = 4 * 60 * 60 * 1000;

function supabaseKey(write) {
  const secret = String(process.env.SUPABASE_SERVICE_ROLE || '').trim();
  if (write && secret) return secret;
  return String(process.env.SUPABASE_PUBLISHABLE || FALLBACK_PUB).trim();
}
function sbHeaders(key) {
  const h = { apikey: key, 'Content-Type': 'application/json' };
  if (!key.startsWith('sb_secret_')) h.Authorization = 'Bearer ' + key;
  return h;
}
async function readAlertState() {
  const key = supabaseKey(false);
  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/edu_shared?id=eq.' + ALERT_ROW + '&select=data', {
      headers: sbHeaders(key), signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return null;
    const rows = await r.json();
    return (rows && rows[0] && rows[0].data) || null;
  } catch { return null; }
}
async function saveAlertState(data) {
  const key = String(process.env.SUPABASE_SERVICE_ROLE || '').trim();
  if (!key) return false;
  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/edu_shared', {
      method: 'POST',
      headers: { ...sbHeaders(key), Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ id: ALERT_ROW, data }),
      signal: AbortSignal.timeout(5000),
    });
    return r.ok;
  } catch { return false; }
}

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

  // 100 BTC ve uzeri, fiyata yakin (±%10) seviyeleri bul.
  const near = (p) => Math.abs(p - price) / price <= 0.10;
  const topBidLevels = bids
    .filter(([p, q]) => q >= 100 && near(p))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .sort((a, b) => b[0] - a[0]);
  const topAskLevels = asks
    .filter(([p, q]) => q >= 100 && near(p))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .sort((a, b) => a[0] - b[0]);

  return { price, bidWalls: topBidLevels, askWalls: topAskLevels, fetchedAt: new Date().toISOString(), source };
}

function trPrice(n) { return Number(n).toLocaleString('tr-TR', { maximumFractionDigits: 0 }); }
function trVol(n) { return Number(n).toLocaleString('tr-TR', { maximumFractionDigits: 1 }); }

export async function checkOrderbookAlert(threshold = 500) {
  const data = await collectOrderbookLevels();
  const price = data.price;
  const walls = [];
  for (const [p, q] of data.bidWalls) if (q >= threshold) walls.push({ side: 'bid', price: p, vol: q });
  for (const [p, q] of data.askWalls) if (q >= threshold) walls.push({ side: 'ask', price: p, vol: q });

  const now = Date.now();
  const state = await readAlertState();
  const seen = Array.isArray(state?.walls) ? state.walls : [];
  const seenKeys = new Set(seen.filter(w => now - (w.seenAt || 0) < ALERT_DEDUPE_MS).map(w => w.side + ':' + Math.round(w.price / 100) * 100));
  const newWalls = walls.filter(w => !seenKeys.has(w.side + ':' + Math.round(w.price / 100) * 100));

  const result = { checkedAt: new Date(now).toISOString(), price, totalWalls: walls.length, newWalls: newWalls.length, sent: false };

  if (newWalls.length > 0) {
    const chat = String(process.env.COINALYZE_CHAT_ID || process.env.TG_TRADE_CHAT_ID || process.env.TG_CHAT_ID || '').trim();
    const raw = process.env.COINALYZE_THREAD != null ? process.env.COINALYZE_THREAD
      : process.env.TG_TRADE_THREAD != null ? process.env.TG_TRADE_THREAD : process.env.TG_THREAD;
    const n = raw == null || String(raw).trim() === '' || String(raw).trim() === '0' ? null : Number(String(raw).trim());
    const thread = Number.isSafeInteger(n) && n > 0 ? n : null;

    const lines = ['⚠️ Yeni büyük emir tespit edildi (' + threshold + '+ BTC)', ''];
    lines.push('BTC Fiyat: $' + Number(price).toLocaleString('tr-TR', { maximumFractionDigits: 0 }));
    lines.push('');
    for (const w of newWalls) {
      const side = w.side === 'bid' ? '🟢 ALIŞ' : '🔴 SATIŞ';
      const pct = price > 0 ? (Math.abs(w.price - price) / price * 100).toFixed(1) : '0';
      const dir = w.side === 'bid' ? (w.price < price ? 'altında' : 'üstünde') : (w.price > price ? 'üstünde' : 'altında');
      lines.push(side + ' duvarı: $' + Number(w.price).toLocaleString('tr-TR', { maximumFractionDigits: 0 }) + ' · ' + Number(w.vol).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + ' BTC  (' + pct + '% ' + dir + ')');
    }
    lines.push('');
    lines.push('Kaynak: OpenMarket (Binance Futures)');
    const text = lines.join('\n');

    try {
      const out = await sendTelegram(text, chat, thread, null, { preview: false });
      if (out && out.ok) {
        result.sent = true;
        result.messageId = out.result?.message_id;
      }
    } catch { /* ignore send errors */ }
  }

  // Update state: merge new walls into seen list, prune old (> 4h).
  const updatedWalls = [...seen.filter(w => now - (w.seenAt || 0) < ALERT_DEDUPE_MS), ...newWalls.map(w => ({ ...w, seenAt: now }))];
  // Dedupe by side+price bucket.
  const deduped = [];
  const keys = new Set();
  for (const w of updatedWalls) {
    const key = w.side + ':' + Math.round(w.price / 100) * 100;
    if (keys.has(key)) continue;
    keys.add(key);
    deduped.push(w);
  }
  await saveAlertState({ walls: deduped, lastCheck: now });

  return result;
}

export function formatOrderbookMessage(data) {
  const lines = ['📊 BTC Order Book Derinliği (' + data.source + ')', ''];
  lines.push('Fiyat: $' + trPrice(data.price));
  lines.push('');
  lines.push('🟢 ALIŞ DUVARLARI (bid):');
  for (const [p, q] of data.bidWalls) {
    const mark = q >= 500 ? ' 🔥' : '';
    lines.push('  $' + trPrice(p) + ' · ' + trVol(q) + ' BTC' + mark + '  ↓');
  }
  lines.push('');
  lines.push('🔴 SATIŞ DUVARLARI (ask):');
  for (const [p, q] of data.askWalls) {
    const mark = q >= 500 ? ' 🔥' : '';
    lines.push('  $' + trPrice(p) + ' · ' + trVol(q) + ' BTC' + mark + '  ↑');
  }
  lines.push('');
  if (data.bidWalls.length) lines.push('En büyük alış duvarı: $' + trPrice(data.bidWalls.reduce((a, b) => a[1] > b[1] ? a : b)[0]) + ' (' + trVol(data.bidWalls.reduce((a, b) => a[1] > b[1] ? a : b)[1]) + ' BTC)');
  if (data.askWalls.length) lines.push('En büyük satış duvarı: $' + trPrice(data.askWalls.reduce((a, b) => a[1] > b[1] ? a : b)[0]) + ' (' + trVol(data.askWalls.reduce((a, b) => a[1] > b[1] ? a : b)[1]) + ' BTC)');
  lines.push('');
  const bigBids = data.bidWalls.filter(([, q]) => q >= 500).length;
  const bigAsks = data.askWalls.filter(([, q]) => q >= 500).length;
  if (bigBids + bigAsks > 0) {
    lines.push('🔥 500+ BTC duvarlar: ' + bigBids + ' alış, ' + bigAsks + ' satış');
  } else {
    lines.push('500+ BTC duvar: şu an yok (en büyük: ' + trVol(Math.max(...data.bidWalls.map(w=>w[1]), ...data.askWalls.map(w=>w[1]))) + ' BTC)');
  }
  lines.push('');
  lines.push('Kaynak: ' + data.source + ' (order book, fiyata ±%10)');
  return lines.join('\n');
}

export default async function orderbookHandler(req, res) {
  const url = new URL(req.url || '/api/ai', 'http://localhost');
  const secret = String(process.env.ORDERBOOK_ALERT_SECRET || process.env.CRON_SECRET || process.env.MACRO_CRON_SECRET || '').trim();
  const auth = String(req.headers?.authorization || '');
  const secretOk = !!secret && auth === 'Bearer ' + secret;
  const queryKey = url.searchParams.get('key');
  const queryOk = !!secret && queryKey === secret;
  const cronHeader = String(req.headers?.['x-vercel-cron'] || '') === '1'
    || /^vercel-cron\//i.test(String(req.headers?.['user-agent'] || ''));
  let isAdminUser = false;
  if (!secretOk && !cronHeader && !queryOk) {
    try {
      const user = await requestUser(req);
      isAdminUser = !!(user && user.admin);
    } catch { isAdminUser = false; }
  }
  if (!secretOk && !cronHeader && !queryOk && !isAdminUser) return res.status(401).json({ error: 'unauthorized' });

  const dryRun = url.searchParams.get('dryRun') === '1';
  const alert = url.searchParams.get('alert') === '1';
  const threshold = Number(url.searchParams.get('threshold')) || 500;

  if (alert) {
    const result = await checkOrderbookAlert(threshold);
    return res.status(200).json({ ok: true, ...result });
  }

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
