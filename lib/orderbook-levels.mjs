import { sendTelegram } from './telegram.mjs';
import { requestUser } from './auth.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zvnjslmptwmnuhftgqsr.supabase.co';
const FALLBACK_PUB = 'sb_publishable_bReG5UKaWcQkU0Z9GnGiJQ_0T4_Qm9X';
const ORDERBOOK_ROW = 'orderbook_daily';

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
async function readOrderbookDaily() {
  const key = supabaseKey(false);
  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/edu_shared?id=eq.' + ORDERBOOK_ROW + '&select=data', {
      headers: sbHeaders(key), signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return null;
    const rows = await r.json();
    return (rows && rows[0] && rows[0].data) || null;
  } catch { return null; }
}
async function saveOrderbookDaily(data) {
  const key = String(process.env.SUPABASE_SERVICE_ROLE || '').trim();
  if (!key) return false;
  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/edu_shared', {
      method: 'POST',
      headers: { ...sbHeaders(key), Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ id: ORDERBOOK_ROW, data }),
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
  const bids = [];
  const asks = [];
  const bArr = point.bids || [];
  const aArr = point.asks || [];
  for (let i = 0; i < bArr.length - 1; i += 2) bids.push([Number(bArr[i]), Number(bArr[i + 1])]);
  for (let i = 0; i < aArr.length - 1; i += 2) asks.push([Number(aArr[i]), Number(aArr[i + 1])]);
  const price = (bids.length && asks.length) ? (bids[0][0] + asks[0][0]) / 2 : null;
  return { bids, asks, price, source: 'OpenMarket (Binance Futures)' };
}

export async function collectOrderbookLevels() {
  const result = await fetchOpenMarket();
  const { bids, asks, price: rawPrice, source } = result;
  const price = rawPrice || (Number(bids[0]?.[0]) + Number(asks[0]?.[0])) / 2;

  function bucket(levels) {
    const m = new Map();
    for (const [p, q] of levels) {
      const b = Math.floor(Number(p) / 100) * 100;
      const entry = m.get(b) || { vol: 0, topPrice: Number(p), topVol: 0 };
      entry.vol += Number(q);
      if (Number(q) > entry.topVol) { entry.topVol = Number(q); entry.topPrice = Number(p); }
      m.set(b, entry);
    }
    return [...m.entries()].map(([b, e]) => [e.topPrice, e.vol]);
  }
  const near = (p) => Math.abs(p - price) / price <= 0.10;
  const topBidLevels = bucket(bids)
    .filter(([p, q]) => q >= 300 && near(p))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .sort((a, b) => b[0] - a[0]);
  const topAskLevels = bucket(asks)
    .filter(([p, q]) => q >= 300 && near(p))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .sort((a, b) => a[0] - b[0]);

  return { price, bidWalls: topBidLevels, askWalls: topAskLevels, fetchedAt: new Date().toISOString(), source };
}

function trPrice(n) { return Number(n).toLocaleString('tr-TR', { maximumFractionDigits: 0 }); }
function trVol(n) { return Number(n).toLocaleString('tr-TR', { maximumFractionDigits: 1 }); }

export function formatOrderbookMessage(data) {
  const lines = ['BTC Order Book - 500+ BTC Seviyeler', ''];
  lines.push('Fiyat: $' + trPrice(data.price));
  lines.push('');
  if (data.bidWalls.length) {
    lines.push('ALIS DUVARLARI (bid):');
    for (const [p, q] of data.bidWalls) {
      const mark = q >= 500 ? ' *' : '';
      lines.push('  $' + trPrice(p) + ' - ' + trVol(q) + ' BTC' + mark + '  down');
    }
  } else {
    lines.push('Alis tarafinda 300+ BTC duvar yok.');
  }
  lines.push('');
  if (data.askWalls.length) {
    lines.push('SATIS DUVARLARI (ask):');
    for (const [p, q] of data.askWalls) {
      const mark = q >= 500 ? ' *' : '';
      lines.push('  $' + trPrice(p) + ' · ' + trVol(q) + ' BTC' + mark + '  up');
    }
  } else {
    lines.push('Satis tarafinda 300+ BTC duvar yok.');
  }
  lines.push('');
  if (data.bidWalls.length) lines.push('En buyuk alis duvari: $' + trPrice(data.bidWalls.reduce((a, b) => a[1] > b[1] ? a : b)[0]) + ' (' + trVol(data.bidWalls.reduce((a, b) => a[1] > b[1] ? a : b)[1]) + ' BTC)');
  if (data.askWalls.length) lines.push('En buyuk satis duvari: $' + trPrice(data.askWalls.reduce((a, b) => a[1] > b[1] ? a : b)[0]) + ' (' + trVol(data.askWalls.reduce((a, b) => a[1] > b[1] ? a : b)[1]) + ' BTC)');
  const bigBids = data.bidWalls.filter(([, q]) => q >= 500).length;
  const bigAsks = data.askWalls.filter(([, q]) => q >= 500).length;
  if (bigBids + bigAsks > 0) {
    lines.push('');
    lines.push('500+ BTC duvarlar: ' + bigBids + ' alis, ' + bigAsks + ' satis (* ile isaretli)');
  }
  lines.push('');
  lines.push('Kaynak: ' + data.source + ' (order book, fiyata +-10%)');
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
  if (!secretOk && !cronHeader && !queryOk && !isAdminUser) return res.status(401).json({ error: 'unauthorized', debug: { hasSecret: !!secret, secretLen: secret?.length, queryKeyLen: queryKey?.length, match: queryKey === secret } });

  const dryRun = url.searchParams.get('dryRun') === '1';
  const force = url.searchParams.get('force') === '1';

  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);

  if (!dryRun && !force) {
    const prev = await readOrderbookDaily().catch(() => null);
    if (prev && prev.day === today && prev.phase !== 'failed') {
      return res.status(200).json({ ok: true, skipped: 'already_sent', state: prev });
    }
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

  const marked = await saveOrderbookDaily({ day: today, phase: 'sending', at: now }).catch(() => false);
  if (!marked) return res.status(503).json({ error: 'state_unavailable' });

  let out;
  try {
    out = await sendTelegram(text, chat, thread, null, { preview: false });
  } catch {
    await saveOrderbookDaily({ day: today, phase: 'unknown', at: Date.now() }).catch(() => {});
    return res.status(502).json({ error: 'telegram_network' });
  }
  if (out && out.ok && out.result && out.result.message_id) {
    await saveOrderbookDaily({ day: today, phase: 'sent', messageId: out.result.message_id, at: Date.now() }).catch(() => {});
    return res.status(200).json({ ok: true, messageId: out.result.message_id, text, data });
  }
  await saveOrderbookDaily({ day: today, phase: 'failed', at: Date.now(), error: String((out && (out.description || out.error)) || 'telegram_rejected').slice(0, 160) }).catch(() => {});
  return res.status(502).json({ error: 'telegram_rejected', http: out?.http, description: out?.description });
}
