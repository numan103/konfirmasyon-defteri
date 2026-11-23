import { isMarketRef, isSpotSymbol, parseMarketRef } from './alfa-charts-data.mjs?v=9';
export const WATCHLIST_LIMIT = 200;
export const IMPORT_LIMIT = 2000;
export const IMPORT_BYTES = 512 * 1024;
const EXCHANGE = /^[A-Z][A-Z0-9_]{1,15}$/;
const TICKER = /^[A-Z0-9][A-Z0-9._!\-/]{0,39}$/;

export function spotMarkets(payload) {
  if (!Array.isArray(payload?.symbols)) throw new Error('Binance sembol kataloğu alınamadı.');
  const markets = new Map();
  for (const m of payload.symbols) {
    if (!m || m.status !== 'TRADING' || m.isSpotTradingAllowed === false ||
      !isSpotSymbol(m.symbol) || !/^[A-Z0-9]{1,24}$/.test(m.baseAsset) || !/^[A-Z0-9]{1,16}$/.test(m.quoteAsset) ||
      m.symbol !== m.baseAsset + m.quoteAsset || Array.isArray(m.permissions) && m.permissions.length && !m.permissions.includes('SPOT')) continue;
    const tick = Number(m.filters?.find(f => f.filterType === 'PRICE_FILTER')?.tickSize);
    const precision = Number.isFinite(tick) && tick > 0 ? Math.max(0, Math.min(10, Math.ceil(-Math.log10(tick)))) : undefined;
    markets.set(m.symbol, { symbol: m.symbol, base: m.baseAsset, quote: m.quoteAsset, precision });
  }
  if (!markets.size) throw new Error('İşleme açık Binance Spot paritesi bulunamadı.');
  return [...markets.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
}

// A reference is either a bare Binance Spot symbol or VENUE:SYMBOL. Every
// imported TradingView venue keeps its original identity on the watchlist.
export function cleanWatchlist(value, fallback = []) {
  if (!Array.isArray(value)) return [...fallback];
  return [...new Set(value.filter(isMarketRef))].slice(0, WATCHLIST_LIMIT);
}
export function parseWatchlistText(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > IMPORT_BYTES) throw new Error('Dosya en fazla 512 KB olabilir.');
  const entries = [];
  for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const tokens = line.split(/[,;\t]/).map(s => s.trim().replace(/^"|"$/g, ''));
    for (const raw of tokens) {
      if (!raw || raw.startsWith('###') || /^(symbol|ticker|sembol|description|exchange)$/i.test(raw)) continue;
      let upper = raw.toUpperCase();
      if (/^[A-Z0-9]{1,24}\/[A-Z0-9]{1,16}$/.test(upper) || /^[A-Z][A-Z0-9_]{1,15}:[A-Z0-9]{1,24}\/[A-Z0-9]{1,16}$/.test(upper)) upper = upper.replace('/', '');
      const parts = upper.split(':');
      let reason = '';
      if (parts.length > 2 || parts.some(p => !p)) reason = 'Geçersiz sembol';
      else if (parts.length === 2 && (!EXCHANGE.test(parts[0]) || !TICKER.test(parts[1]))) reason = 'Geçersiz sembol';
      else if (parts.length === 1 && !isSpotSymbol(upper)) reason = 'Geçersiz sembol';
      let ref = '';
      if (!reason) try { ref = parseMarketRef(upper).key; } catch (e) { reason = e.message || 'Desteklenmeyen sembol'; }
      entries.push({ raw: raw.slice(0, 100), ref, reason });
      if (entries.length > IMPORT_LIMIT) throw new Error('Bir seferde en fazla 2000 sembol içe aktarılabilir.');
    }
  }
  return entries;
}
export function importPreview(entries, markets, existing = []) {
  const supported = new Set(markets.map(m => m.symbol)), seen = new Set(existing), added = [], skipped = [];
  for (const item of entries) {
    const reason = item.reason || (isSpotSymbol(item.ref) && !supported.has(item.ref) ? 'İşleme açık Binance Spot kataloğunda yok' :
      seen.has(item.ref) ? 'Listede zaten var' : seen.size >= WATCHLIST_LIMIT ? '200 sembol sınırı' : '');
    if (reason) skipped.push({ raw: item.raw, reason });
    else { added.push(item.ref); seen.add(item.ref); }
  }
  return { added, skipped };
}
export function tradingViewSymbolURL(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !/^(www\.|[a-z]{2}\.)?tradingview\.com$/.test(url.hostname) || url.port || url.username || url.password ||
      !/^\/chart\/(?:[A-Za-z0-9]+\/)?$/.test(url.pathname)) return null;
    const symbol = url.searchParams.get('symbol');
    return symbol && symbol.length <= 100 ? symbol : null;
  } catch { return null; }
}

// A compact catalogue for the picker; imports are never limited to this list.
const CURATED = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT', 'BNBUSDT', 'ADAUSDT', 'AVAXUSDT',
  'BINANCE:BTCUSDT.P', 'BINANCE:ETHUSDT.P',
  'OKX:BTCUSDT', 'OKX:ETHUSDT', 'OKX:SOLUSDT', 'OKX:XRPUSDT', 'OKX:DOGEUSDT', 'OKX:AVAXUSDT', 'OKX:INJUSDT', 'OKX:PYTHUSDT', 'OKX:USDTTRY', 'OKX:XAUTUSDT',
  'OKX:BTCUSDT.P', 'OKX:ETHUSDT.P', 'OKX:BNBUSDT.P', 'OKX:AVAXUSDT.P', 'OKX:LTCUSDT.P', 'OKX:XRPUSDT.P', 'OKX:PEPEUSDT.P', 'OKX:SUIUSDT.P',
  'OKX:LINKUSDT.P', 'OKX:NEARUSDT.P', 'OKX:AAVEUSDT.P', 'OKX:HYPEUSDT.P', 'OKX:ZECUSDT.P',
  'BYBIT:BTCUSDT', 'BYBIT:BTCUSDT.P', 'BYBIT:ETHUSDT.P', 'BYBIT:SOLUSDT.P',
  'CME:BTC1!', 'CBOE:VIX', 'BIST:XU100', 'TVC:GOLD', 'TVC:DXY', 'FPMARKETS:US100',
  'FX_IDC:XAUTRYG', 'FX:XAUUSD', 'OANDA:XAGUSD',
  'OANDA:EURUSD', 'OANDA:USDJPY', 'OANDA:AUDUSD', 'OANDA:NZDUSD', 'OANDA:USDCAD',
  'FX:GBPUSD', 'FX:USDCHF', 'FX:NZDCAD', 'FX:AUDCHF', 'FX:AUDCAD', 'FX_IDC:GBPAUD', 'FOREXCOM:XAUUSD',
  'CRYPTOCAP:TOTAL', 'CRYPTOCAP:TOTAL2', 'CRYPTOCAP:TOTAL3', 'CRYPTOCAP:BTC.D', 'CRYPTOCAP:USDT.D',
];
export function foreignMarkets() {
  // Bare Binance Spot refs are already offered from the live catalogue; keeping
  // them here would render the same ref twice in the picker.
  return CURATED.map(ref => { try { return parseMarketRef(ref); } catch { return null; } })
    .filter(m => m && m.feed !== 'binance')
    .sort((a, b) => a.venue.localeCompare(b.venue) || a.label.localeCompare(b.label));
}
