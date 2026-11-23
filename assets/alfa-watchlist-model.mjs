import { isMarketSymbol } from './alfa-charts-data.mjs?v=5';
export const WATCHLIST_LIMIT = 200;
export const IMPORT_LIMIT = 2000;
export const IMPORT_BYTES = 512 * 1024;
export function spotMarkets(payload) {
  if (!Array.isArray(payload?.symbols)) throw new Error('Binance sembol kataloğu alınamadı.');
  const markets = new Map();
  for (const m of payload.symbols) {
    if (!m || m.status !== 'TRADING' || m.isSpotTradingAllowed === false ||
      !isMarketSymbol(m.symbol) || !/^[A-Z0-9]{1,24}$/.test(m.baseAsset) || !/^[A-Z0-9]{1,16}$/.test(m.quoteAsset) ||
      m.symbol !== m.baseAsset + m.quoteAsset || Array.isArray(m.permissions) && m.permissions.length && !m.permissions.includes('SPOT')) continue;
    const tick = Number(m.filters?.find(f => f.filterType === 'PRICE_FILTER')?.tickSize);
    const precision = Number.isFinite(tick) && tick > 0 ? Math.max(0, Math.min(10, Math.ceil(-Math.log10(tick)))) : undefined;
    markets.set(m.symbol, { symbol: m.symbol, base: m.baseAsset, quote: m.quoteAsset, precision });
  }
  if (!markets.size) throw new Error('İşleme açık Binance Spot paritesi bulunamadı.');
  return [...markets.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
}
export function cleanWatchlist(value, fallback = []) {
  if (!Array.isArray(value)) return [...fallback];
  return [...new Set(value.filter(isMarketSymbol))].slice(0, WATCHLIST_LIMIT);
}
// TradingView's TXT export uses exchange-prefixed, comma-separated symbols.
// Also accept a one-symbol-per-line list and ordinary symbol CSV/TSV columns.
export function parseWatchlistText(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > IMPORT_BYTES) throw new Error('Dosya en fazla 512 KB olabilir.');
  const entries = [];
  for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const tokens = line.split(/[,;\t]/).map(s => s.trim().replace(/^"|"$/g, ''));
    for (const raw of tokens) {
      if (!raw || raw.startsWith('###') || /^(symbol|ticker|sembol|description|exchange)$/i.test(raw)) continue;
      const upper = raw.toUpperCase();
      const parts = upper.split(':');
      const exchange = parts.length === 2 ? parts[0] : null;
      const symbol = (parts.length === 2 ? parts[1] : upper).replace('/', '');
      let reason = '';
      if (parts.length > 2 || !/^[A-Z0-9.:/_-]{1,80}$/.test(upper)) reason = 'Geçersiz sembol';
      else if (exchange && exchange !== 'BINANCE') reason = 'Farklı borsa; Binance Spot ile değiştirilmedi';
      else if (symbol.endsWith('.P')) reason = 'Vadeli parite; Spot ile değiştirilmedi';
      else if (!isMarketSymbol(symbol)) reason = 'Desteklenmeyen sembol biçimi';
      entries.push({ raw: raw.slice(0, 100), symbol, reason });
      if (entries.length > IMPORT_LIMIT) throw new Error('Bir seferde en fazla 2000 sembol içe aktarılabilir.');
    }
  }
  return entries;
}
export function importPreview(entries, markets, existing = []) {
  const supported = new Set(markets.map(m => m.symbol)), seen = new Set(existing), added = [], skipped = [];
  for (const item of entries) {
    const reason = item.reason || (!supported.has(item.symbol) ? 'İşleme açık Binance Spot kataloğunda yok' :
      seen.has(item.symbol) ? 'Listede zaten var' : seen.size >= WATCHLIST_LIMIT ? '200 parite sınırı' : '');
    if (reason) skipped.push({ raw: item.raw, reason });
    else { added.push(item.symbol); seen.add(item.symbol); }
  }
  return { added, skipped };
}
export function tradingViewSymbolURL(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !/^(www\.|[a-z]{2}\.)?tradingview\.com$/.test(url.hostname) || url.port || url.username || url.password ||
      !/^\/chart\/(?:[A-Za-z0-9]+\/)?$/.test(url.pathname)) return null;
    const symbol = url.searchParams.get('symbol');
    return symbol && symbol.length <= 80 ? symbol : null;
  } catch { return null; }
}
