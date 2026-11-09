// Coinalyze gunluk BTC ozeti.
//
// Resmi Coinalyze API'sinden (COINALYZE_API_KEY) su uc veriyi ceker:
//   - Spot CVD (24s): BTC spot marketlerinin alim-satim hacim farki (base coin)
//   - Long/Short orani: BTC perp marketlerinin long/short hesap orani ortalamasi
//   - Acik pozisyon (OI): BTC perp marketlerinin USD cinsinden toplami
//
// Gunde bir kez, Istanbul 11:00'de charts konusuna tek mesaj gonderir.
// Ayni gun icin ikinci mesaj atilmaz; durum edu_shared/coinalyze_daily satirinda
// tutulur. Veri eksikse mesaj gonderilmez (uydurma/partial veri yok).
import { istanbul, dayKey } from './macro/core.mjs';
import { requestUser } from './auth.mjs';
import { sendTelegram, sendTelegramPhoto } from './telegram.mjs';

const API = 'https://api.coinalyze.net/v1';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zvnjslmptwmnuhftgqsr.supabase.co';
const FALLBACK_PUB = 'sb_publishable_bReG5UKaWcQkU0Z9GnGiJQ_0T4_Qm9X';
const ROW_ID = 'coinalyze_daily';
// Each symbol consumes one API call and the key allows 40 calls/minute.
// 19 spot + 15 OI + 5 LSR + 1 market-list call = 40 calls per run.
const OI_LIMIT = 15;
const LSR_LIMIT = 5;
const MAX = 20;
// Coinalyze BTC spot CVD sayfasinin varsayilan 19 marketi.
const SPOT_SYMBOLS = [
  'BTCUD.A', 'BTCUSDC.A', 'BTCUSD.A',
  'BTCUSD.F', 'BTCUSDT.F',
  'BTCUSD.B', 'BTCUSDC.B', 'BTCUSDT.B',
  'sBTCUSD.6', 'sBTCUSDC.6', 'sBTCUSDT.6',
  'BTCUSD.C', 'BTCUSDT.C',
  'BTCUSD.G',
  'BTCUSD.K', 'BTCUSDC.K', 'BTCUSDT.K',
  'BTCUSDC.P', 'BTCUSD.P',
];
const EXCHANGE_PRIORITY = { Binance: 0, Bitfinex: 1, Bybit: 2, Deribit: 3, Huobi: 4, Hyperliquid: 5, Kraken: 6, OKX: 7, 'WOO X': 8, dYdX: 9 };
// API borsayi kodla dondurebilir (A = Binance, .6 = Bybit ...).
const EXCHANGE_CODE = { A: 'Binance', F: 'Bitfinex', 6: 'Bybit', 2: 'Deribit', 4: 'Huobi', H: 'Hyperliquid', K: 'Kraken', 3: 'OKX', W: 'WOO X', 8: 'dYdX' };
// Coinalyze'nin BTC OI sayfasindaki varsayilan kontrat seti bu borsalardan olusur.
const OI_EXCHANGES = new Set(Object.keys(EXCHANGE_PRIORITY));

function exchangeKey(market) {
  const raw = String((market && market.exchange) || '');
  return EXCHANGE_CODE[raw] || raw;
}
function exchangeRank(market) {
  const rank = EXCHANGE_PRIORITY[exchangeKey(market)];
  return rank == null ? 50 : rank;
}
function quoteRank(market) {
  const quote = String((market && market.quote_asset) || '').toUpperCase();
  if (quote === 'USD') return 0;
  if (quote === 'USDT') return 1;
  if (quote === 'USDC') return 2;
  return 3;
}
function byPriority(a, b) {
  return exchangeRank(a) - exchangeRank(b) || quoteRank(a) - quoteRank(b) || String(a.symbol).localeCompare(String(b.symbol));
}
function byOiPriority(a, b) {
  return (b.is_perpetual === true ? 1 : 0) - (a.is_perpetual === true ? 1 : 0)
    || exchangeRank(a) - exchangeRank(b)
    || quoteRank(a) - quoteRank(b)
    || String(a.symbol).localeCompare(String(b.symbol));
}
// Coinalyze LSR sayfasinin varsayilan bes marketi.
const LSR_SYMBOLS = ['BTCUSD_PERP.A', 'BTCUSDC_PERP.A', 'BTCUSDT_PERP.A', 'BTCUSD.6', 'BTCUSDT.6'];

function apiKey() { return String(process.env.COINALYZE_API_KEY || '').trim(); }
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
function target() {
  const chat = String(process.env.COINALYZE_CHAT_ID || process.env.TG_TRADE_CHAT_ID || process.env.TG_CHAT_ID || '').trim();
  const raw = process.env.COINALYZE_THREAD != null ? process.env.COINALYZE_THREAD
    : process.env.TG_TRADE_THREAD != null ? process.env.TG_TRADE_THREAD : process.env.TG_THREAD;
  const n = raw == null || String(raw).trim() === '' || String(raw).trim() === '0' ? null : Number(String(raw).trim());
  const thread = Number.isSafeInteger(n) && n > 0 ? n : null;
  return { chat, thread, ready: !!String(process.env.TG_BOT_TOKEN || '').trim() && !!chat };
}

async function apiGet(path, params, key) {
  const qs = new URLSearchParams(params || {}).toString();
  const url = API + path + (qs ? '?' + qs : '');
  const r = await fetch(url, { headers: { api_key: key }, signal: AbortSignal.timeout(9000) });
  if (!r.ok) {
    let detail = '';
    try { detail = (await r.text()).slice(0, 120); } catch { /* ignore */ }
    throw new Error('coinalyze_' + path.replace(/[^a-z]/gi, '') + '_' + r.status + (detail ? '_' + detail : ''));
  }
  return r.json();
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}
function hourCutoff(now) {
  const sec = Math.floor(Number(now) / 1000);
  return Math.floor(sec / 3600) * 3600;
}
function lastAtOrBefore(history, at) {
  const rows = Array.isArray(history) ? history : [];
  let found = null;
  for (const row of rows) {
    if (Number(row.t) <= at) found = row;
    else break; // API ascending
  }
  return found;
}

export function computeCvd(series, at) {
  const from = at - 24 * 3600;
  let coin = 0, usd = 0, bars = 0;
  for (const item of series || []) {
    for (const row of item.history || []) {
      const t = Number(row.t);
      if (!(t > from && t <= at)) continue;
      const v = Number(row.v), bv = Number(row.bv);
      if (!Number.isFinite(v) || !Number.isFinite(bv)) continue;
      const delta = bv - (v - bv); // alim - satim (base coin)
      coin += delta;
      usd += delta * (Number(row.c) || 0);
      bars++;
    }
  }
  return { coin, usd, bars };
}

export function sumOi(series, at) {
  let total = 0, count = 0;
  for (const item of series || []) {
    const row = lastAtOrBefore(item.history, at);
    if (!row) continue;
    const c = Number(row.c);
    if (!Number.isFinite(c)) continue;
    total += c;
    count++;
  }
  return { total, count };
}

export function averageLsr(series, at) {
  let l = 0, s = 0, n = 0;
  for (const item of series || []) {
    const row = lastAtOrBefore(item.history, at);
    if (!row) continue;
    const lv = Number(row.l), sv = Number(row.s);
    if (!Number.isFinite(lv) || !Number.isFinite(sv)) continue;
    l += lv; s += sv; n++;
  }
  if (!n) return null;
  const longPct = l / n, shortPct = s / n;
  return { longPct, shortPct, ratio: shortPct > 0 ? longPct / shortPct : null, markets: n };
}

// Turkce sayi bicimi: binlik ".", ondalik "," ve negatif icin "−".
export function trNumber(value, digits = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n).toFixed(digits);
  const parts = abs.split('.');
  const grouped = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (n < 0 ? '−' : '') + grouped + (digits > 0 ? ',' + parts[1] : '');
}
function signedUsd(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e9) return trNumber(n / 1e9, 2) + ' mlr$';
  if (abs >= 1e6) return trNumber(n / 1e6, 1) + ' mn$';
  if (abs >= 1e3) return trNumber(n / 1e3, 1) + ' bin$';
  return trNumber(n, 0) + '$';
}

export function formatCoinalyzeMessage(data, now = Date.now()) {
  const lines = ['📊 BTC türev görünümü', istanbul(now) + ' TSİ', ''];
  if (data.cvd) {
    lines.push('Spot CVD (24s): ' + trNumber(data.cvd.coin, 0) + ' BTC · ' + signedUsd(data.cvd.usd));
  }
  if (data.lsr) {
    lines.push('Long/Short: ' + trNumber(data.lsr.ratio, 2)
      + ' · Long %' + trNumber(data.lsr.longPct, 1)
      + ' / Short %' + trNumber(data.lsr.shortPct, 1));
  }
  if (data.oi) {
    let line = 'Açık pozisyon: ' + signedUsd(data.oi.total);
    if (data.oiPrev && data.oiPrev.total > 0) {
      const pct = (data.oi.total / data.oiPrev.total - 1) * 100;
      line += ' · 24s ' + (pct >= 0 ? '+' : '') + trNumber(pct, 1) + '%';
    }
    lines.push(line);
  }
  lines.push('', 'Coinalyze agregasyonu.');
  return lines.join('\n');
}

export async function collectCoinalyzeData(now = Date.now(), key = apiKey()) {
  if (!key) throw new Error('coinalyze_key_missing');
  const at = hourCutoff(now);
  const from = at - 26 * 3600;
  const futures = await apiGet('/future-markets', {}, key);
  const spotSymbols = SPOT_SYMBOLS.slice();
  const perps = (futures || []).filter(m => m && m.base_asset === 'BTC' && m.is_perpetual === true).sort(byPriority);
  const nowSec = Math.floor(Number(now) / 1000);
  const oiMarkets = (futures || [])
    .filter(m => m && m.base_asset === 'BTC' && m.oi_lq_vol_denominated_in && OI_EXCHANGES.has(exchangeKey(m))
      && quoteRank(m) < 3 && (!m.expire_at || Number(m.expire_at) > nowSec))
    .sort(byOiPriority);
  const oiSymbols = oiMarkets.slice(0, OI_LIMIT).map(m => m.symbol);
  const lsrCandidates = perps.filter(m => m.has_long_short_ratio_data);
  const bySymbol = new Map(lsrCandidates.map(m => [m.symbol, m]));
  const lsrChosen = LSR_SYMBOLS.map(symbol => bySymbol.get(symbol)).filter(Boolean);
  for (const market of lsrCandidates) {
    if (lsrChosen.length >= LSR_LIMIT) break;
    if (!lsrChosen.includes(market)) lsrChosen.push(market);
  }
  const lsrSymbols = lsrChosen.slice(0, LSR_LIMIT).map(m => m.symbol);

  const common = { interval: '1hour', from, to: at };
  const [cvdRes, oiRes, lsrRes] = await Promise.all([
    spotSymbols.length
      ? apiGet('/ohlcv-history', { ...common, symbols: spotSymbols.join(',') }, key)
      : Promise.resolve([]),
    (async () => {
      const out = [];
      for (const group of chunk(oiSymbols, MAX)) {
        out.push(...await apiGet('/open-interest-history', { ...common, symbols: group.join(','), convert_to_usd: 'true' }, key));
      }
      return out;
    })(),
    lsrSymbols.length
      ? apiGet('/long-short-ratio-history', { ...common, symbols: lsrSymbols.join(',') }, key)
      : Promise.resolve([]),
  ]);

  const cvd = computeCvd(cvdRes, at);
  const oi = sumOi(oiRes, at);
  const oiPrev = sumOi(oiRes, at - 24 * 3600);
  const lsr = averageLsr(lsrRes, at);
  const denom = new Map(oiMarkets.map(m => [m.symbol, m.oi_lq_vol_denominated_in]));
  const oiDetail = oiRes.map(item => {
    const row = lastAtOrBefore(item.history, at);
    return { symbol: item.symbol, denom: denom.get(item.symbol) || null, value: row ? Number(row.c) : null };
  });
  const oiSelected = oiSymbols.map(symbol => {
    const market = oiMarkets.find(m => m.symbol === symbol) || {};
    return { symbol, exchange: market.exchange || null, perpetual: market.is_perpetual === true };
  });
  return { at, cvd, oi, oiPrev, lsr, oiDetail, oiSelected };
}

async function readDaily() {
  const key = supabaseKey(true);
  const r = await fetch(SUPABASE_URL + '/rest/v1/edu_shared?id=eq.' + ROW_ID + '&select=data', {
    headers: sbHeaders(key), signal: AbortSignal.timeout(5000),
  });
  if (!r.ok) return null;
  const rows = await r.json();
  return (rows && rows[0] && rows[0].data) || null;
}
async function saveDaily(data) {
  const key = String(process.env.SUPABASE_SERVICE_ROLE || '').trim();
  if (!key) return false;
  const r = await fetch(SUPABASE_URL + '/rest/v1/edu_shared', {
    method: 'POST',
    headers: { ...sbHeaders(key), Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ id: ROW_ID, data }),
    signal: AbortSignal.timeout(5000),
  });
  return r.ok;
}
function istanbulHour(now) {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Istanbul', hour: '2-digit', hourCycle: 'h23' }).format(new Date(now)));
}

async function isAdmin(req) {
  try {
    const user = await requestUser(req);
    return !!(user && user.admin);
  } catch {
    return false;
  }
}

async function tryRenderImage(data, now) {
  try {
    const mod = await import('./coinalyze-image.mjs');
    if (typeof mod.renderCoinalyzeImage !== 'function') return null;
    return mod.renderCoinalyzeImage(data, now);
  } catch {
    return null;
  }
}

export default async function coinalyzeHandler(req, res) {
  const url = new URL(req.url || '/api/ai', 'http://localhost');
  const secret = String(process.env.CRON_SECRET || process.env.MACRO_CRON_SECRET || '').trim();
  const auth = String(req.headers?.authorization || '');
  const secretOk = !!secret && auth === 'Bearer ' + secret;
  const cronHeader = String(req.headers?.['x-vercel-cron'] || '') === '1'
    || /^vercel-cron\//i.test(String(req.headers?.['user-agent'] || ''));
  const admin = !secretOk && !cronHeader ? await isAdmin(req) : false;
  if (!secretOk && !cronHeader && !admin) return res.status(401).json({ error: 'unauthorized' });

  const dryRun = url.searchParams.get('dryRun') === '1';
  const force = url.searchParams.get('force') === '1';
  const now = Date.now();
  const today = dayKey(new Date(now));
  const scheduled = secretOk || cronHeader;

  if (scheduled && !force && istanbulHour(now) !== 11) {
    return res.status(200).json({ ok: true, skipped: 'outside_window' });
  }
  if (!dryRun && !force) {
    const prev = await readDaily().catch(() => null);
    if (prev && prev.day === today && prev.phase !== 'failed') {
      return res.status(200).json({ ok: true, skipped: 'already_sent', state: prev });
    }
  }

  const t = target();
  if (!t.ready) return res.status(503).json({ error: 'telegram_not_configured' });

  let data;
  try {
    data = await collectCoinalyzeData(now);
  } catch (e) {
    return res.status(502).json({ error: 'coinalyze_unavailable', description: String(e.message || e).slice(0, 160) });
  }
  if (!data || !data.cvd || !data.oi || !data.oi.total || !data.lsr) {
    return res.status(502).json({ error: 'coinalyze_incomplete', data });
  }

  const text = formatCoinalyzeMessage(data, now);
  if (dryRun) return res.status(200).json({ ok: true, dryRun: true, text, target: t, data });

  const marked = await saveDaily({ day: today, phase: 'sending', at: now }).catch(() => false);
  if (!marked) return res.status(503).json({ error: 'state_unavailable' });
  const image = await tryRenderImage(data, now);
  let out;
  try {
    if (image) out = await sendTelegramPhoto(image, text, t.chat, t.thread, { preview: false });
    else out = await sendTelegram(text, t.chat, t.thread, null, { preview: false });
  } catch {
    await saveDaily({ day: today, phase: 'unknown', at: Date.now() }).catch(() => {});
    return res.status(502).json({ error: 'telegram_network' });
  }
  if (out && out.ok && out.result && out.result.message_id) {
    const state = { day: today, phase: 'sent', messageId: out.result.message_id, at: Date.now() };
    await saveDaily(state).catch(() => {});
    return res.status(200).json({ ok: true, messageId: state.messageId, text, data });
  }
  const state = { day: today, phase: 'failed', at: Date.now(), error: String((out && (out.description || out.error)) || 'telegram_rejected').slice(0, 160) };
  await saveDaily(state).catch(() => {});
  return res.status(502).json({ error: 'telegram_rejected', state });
}
