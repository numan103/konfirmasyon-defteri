import { SYMBOLS, isMarketRef, isSpotSymbol, parseMarketRef } from './alfa-charts-data.mjs?v=11';
export const WATCHLIST_LIMIT = 200;
export const IMPORT_LIMIT = 2000;
export const IMPORT_BYTES = 512 * 1024;
const EXCHANGE = /^[A-Z][A-Z0-9_]{1,15}$/;
const TICKER = /^[A-Z0-9][A-Z0-9._!\-/]{0,39}$/;

// The original 44-reference list from assets/watchlist-84359879.txt. It is the
// one-time seed and the manual restore source; existing user lists are never
// replaced with it.
export const LEGACY_TV_LIST = Object.freeze('CME:BTC1!,OKX:USDTTRY,CBOE:VIX,FX_IDC:XAUTRYG,OKX:XAUTUSDT,BIST:XU100,CRYPTOCAP:TOTAL,CRYPTOCAP:TOTAL2,CRYPTOCAP:TOTAL3,CRYPTOCAP:BTC.D,BINANCE:ETHBTC,CRYPTOCAP:USDT.D,BINANCE:BTCUSDT.P,BINANCE:ETHUSDT,BINANCE:BTCUSDT,OKX:ETHUSDT.P,TVC:GOLD,BYBIT:BTCUSDT.P,BYBIT:ETHUSDT.P,FX:XAUUSD,FPMARKETS:US100,OKX:SOLUSDT,OKX:PEPEUSDT.P,OKX:BNBUSDT.P,OKX:DOGEUSDT,OKX:HBARUSDT.P,OKX:AVAXUSDT.P,OKX:LTCUSDT.P,OKX:XRPUSDT.P,OKX:XLMUSDT.P,OKX:SUIUSDT.P,OKX:ADAUSDT.P,OKX:UNIUSDT.P,OKX:BCHUSDT.P,OKX:DOTUSDT.P,OKX:LINKUSDT.P,OKX:TRXUSDT.P,OKX:NEARUSDT.P,OKX:WIFUSDT,OKX:INJUSDT,OKX:BONKUSDT,OKX:POPCATUSDT.P,OKX:AAVEUSDT.P,OKX:RENDERUSDT'.split(','));
export const LEGACY_WATCHLIST_KEY = 'alfa-watchlist';
export const LEGACY_FAV_KEY = 'alfa-watchlist-favs';
export const WATCHLIST_MIGRATION_PREFIX = 'alfa-watchlist:tv-migrated:v1:';
export const FLAG_COLORS = Object.freeze(['', '#ef6677', '#e8a33d', '#68bba1', '#5d94e6', '#a98ce0']);
export const SORT_MODES = Object.freeze(['custom', 'name', 'venue', 'type', 'change', 'price']);
export const GROUP_MODES = Object.freeze(['none', 'type', 'venue', 'quote']);
const DEFAULT_SETTINGS = Object.freeze({ sort: 'custom', direction: 'asc', groupBy: 'none', compact: false, showFlags: true, showQuotes: true, collapsedGroups: {} });
const DEFAULT_LIST_COLOR = '#7da4ff';
const LIST_ID = /^[a-z0-9_-]{1,40}$/i;
const COLOR = /^#[0-9a-f]{6}$/i;

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

// --- TradingView-style list organisation ---------------------------------
// The persisted document is additive: `symbols` stays the active list for old
// readers, while `lists`, `settings` and `flags` carry the new organisation.
const ownerOf = owner => (typeof owner === 'string' && owner && owner !== 'guest' ? owner : 'guest');
export function watchlistKey(owner) { return 'alfa-watchlist:v1:' + ownerOf(owner); }
export function watchlistMigrationKey(owner) { return WATCHLIST_MIGRATION_PREFIX + ownerOf(owner); }
export function legacyWatchlistKeys(owner) {
  if (ownerOf(owner) === 'guest') return { lists: [LEGACY_WATCHLIST_KEY], favorites: [LEGACY_FAV_KEY] };
  return {
    lists: [`u:${owner}:${LEGACY_WATCHLIST_KEY}`, LEGACY_WATCHLIST_KEY],
    favorites: [`u:${owner}:${LEGACY_FAV_KEY}`, LEGACY_FAV_KEY]
  };
}
function decodeStored(value) {
  if (value == null) return null;
  if (Array.isArray(value) || typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  try { return JSON.parse(value); } catch { return null; }
}
function firstArray(sources) {
  for (const source of sources) {
    const parsed = decodeStored(source);
    const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.symbols) ? parsed.symbols : null;
    if (rows?.length) return rows;
  }
  return null;
}
const text = (value, fallback, max) => {
  const clean = String(value ?? '').trim();
  return clean ? clean.slice(0, max) : fallback;
};
function normalizeSettings(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const collapsedGroups = {};
  if (source.collapsedGroups && typeof source.collapsedGroups === 'object') {
    for (const [key, value] of Object.entries(source.collapsedGroups).slice(0, 40)) {
      if (/^[a-z0-9_-]{1,40}$/i.test(key)) collapsedGroups[key] = !!value;
    }
  }
  return {
    sort: SORT_MODES.includes(source.sort) ? source.sort : DEFAULT_SETTINGS.sort,
    direction: source.direction === 'desc' ? 'desc' : 'asc',
    groupBy: GROUP_MODES.includes(source.groupBy) ? source.groupBy : DEFAULT_SETTINGS.groupBy,
    compact: !!source.compact,
    showFlags: source.showFlags !== false,
    showQuotes: source.showQuotes !== false,
    collapsedGroups
  };
}
function normalizeFlags(raw, refs) {
  const out = {};
  const source = raw && typeof raw === 'object' ? raw : {};
  for (const ref of refs) {
    const entry = source[ref];
    if (!entry || typeof entry !== 'object') continue;
    const flag = {};
    if (entry.starred) flag.starred = true;
    if (COLOR.test(entry.color)) flag.color = entry.color;
    if (typeof entry.note === 'string' && entry.note.trim()) flag.note = entry.note.trim().slice(0, 120);
    if (flag.starred || flag.color || flag.note) out[ref] = flag;
  }
  return out;
}
export function normalizeWatchlistDocument(raw, fallback = []) {
  const source = Array.isArray(raw) ? { symbols: raw } : raw && typeof raw === 'object' ? raw : null;
  const fallbackRefs = cleanWatchlist(fallback);
  const lists = [], ids = new Set();
  const rawLists = Array.isArray(source?.lists) ? source.lists.slice(0, 20) : [];
  for (const item of rawLists) {
    if (!item || typeof item !== 'object') continue;
    let id = String(item.id || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40) || `list-${lists.length + 1}`;
    if (ids.has(id)) continue;
    ids.add(id);
    lists.push({
      id,
      name: text(item.name, `Liste ${lists.length + 1}`, 60),
      symbols: cleanWatchlist(item.symbols),
      color: COLOR.test(item.color) ? item.color : DEFAULT_LIST_COLOR,
      collapsed: !!item.collapsed
    });
  }
  const activeRefs = cleanWatchlist(source?.symbols, fallbackRefs);
  if (!lists.length) lists.push({ id: 'main', name: text(source?.name, 'İzleme listesi', 60), symbols: activeRefs, color: DEFAULT_LIST_COLOR, collapsed: false });
  const activeListId = lists.some(l => l.id === source?.activeListId) ? source.activeListId : lists[0].id;
  const active = lists.find(l => l.id === activeListId);
  // A v1 reader only knows the top-level `symbols`; fold it into the active
  // list instead of letting a stale object shape drop saved references.
  active.symbols = cleanWatchlist([...activeRefs, ...active.symbols]);
  const allRefs = allWatchlistRefs({ lists });
  return {
    version: 2,
    name: text(source?.name, lists[0].name, 60),
    symbols: [...lists.find(l => l.id === activeListId).symbols],
    lists,
    activeListId,
    settings: normalizeSettings(source?.settings),
    flags: normalizeFlags(source?.flags, allRefs)
  };
}
export function allWatchlistRefs(doc) {
  return [...new Set((doc?.lists || []).flatMap(l => cleanWatchlist(l.symbols)))].slice(0, WATCHLIST_LIMIT);
}
export function watchlistRefsFromDocument(raw, fallback = []) {
  return allWatchlistRefs(normalizeWatchlistDocument(raw, fallback));
}
export function activeList(doc) {
  return doc?.lists?.find(l => l.id === doc.activeListId) || doc?.lists?.[0] || null;
}
export function isPristineWatchlist(raw, defaults) {
  const refs = watchlistRefsFromDocument(raw);
  const base = cleanWatchlist(defaults);
  return refs.length === base.length && refs.every((ref, i) => ref === base[i]);
}
export function filteredWatchlistRefs(refs, query = '') {
  const q = String(query || '').trim().toUpperCase().replace(/[ /]/g, '');
  if (!q) return [...refs];
  return [...refs].filter(ref => {
    let info;
    try { info = parseMarketRef(ref); } catch { return ref.toUpperCase().includes(q); }
    return ref.toUpperCase().replace(/[ /]/g, '').includes(q) || String(info.base).toUpperCase().includes(q)
      || String(info.quote).toUpperCase().includes(q) || String(info.venue).toUpperCase().includes(q)
      || String(info.label).toUpperCase().includes(q);
  });
}
export function sortWatchlistRefs(refs, settings = {}, quotes = new Map()) {
  const { sort, direction } = normalizeSettings(settings);
  const out = [...refs];
  const value = ref => {
    let info;
    try { info = parseMarketRef(ref); } catch { return ref; }
    const quote = quotes instanceof Map ? quotes.get(ref) : quotes?.[ref];
    if (sort === 'name') return info.base || ref;
    if (sort === 'venue') return info.venue;
    if (sort === 'type') return info.marketType || 'spot';
    if (sort === 'change') return Number.isFinite(quote?.change) ? quote.change : -Infinity;
    if (sort === 'price') return Number.isFinite(quote?.price) ? quote.price : -Infinity;
    return null;
  };
  if (sort !== 'custom') {
    const numeric = sort === 'change' || sort === 'price';
    out.sort((a, b) => numeric ? (value(a) - value(b) || a.localeCompare(b, 'tr'))
      : String(value(a)).localeCompare(String(value(b)), 'tr', { numeric: true }) || a.localeCompare(b, 'tr'));
  }
  if (direction === 'desc' && sort !== 'custom') out.reverse();
  return out;
}
export function watchlistGroupKey(id) {
  return String(id || 'diger').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'diger';
}
export function classifyWatchlistRef(ref) {
  let info;
  try { info = parseMarketRef(ref); } catch { return { id: 'diger', name: 'Diğer', order: 90 }; }
  if (info.venue === 'CRYPTOCAP') return { id: 'crypto-index', name: 'Kripto endeksleri', order: 50 };
  if (info.marketType === 'perp' || info.feed === 'binance-perp') return { id: 'crypto-perp', name: 'Kripto · Vadeli', order: 20 };
  if (['FX', 'FX_IDC', 'OANDA', 'FOREXCOM', 'FPMARKETS'].includes(info.venue)) {
    return { id: 'forex', name: 'Döviz / Emtia', order: 40 };
  }
  if (info.marketType === 'spot' && ['BINANCE', 'OKX', 'BYBIT'].includes(info.venue)) {
    return { id: 'crypto-spot', name: 'Kripto · Spot', order: 10 };
  }
  if (info.marketType === 'index' || ['CME', 'CBOE', 'BIST', 'TVC'].includes(info.venue)) {
    return { id: 'index', name: 'Endeks / Vadeli', order: 60 };
  }
  return { id: 'diger', name: 'Diğer', order: 90 };
}
export function groupWatchlistRefs(refs, mode = 'type') {
  const groups = new Map();
  for (const ref of refs) {
    let info;
    try { info = parseMarketRef(ref); } catch { info = null; }
    let group;
    if (mode === 'venue') {
      const name = info?.venue || 'Diğer';
      group = { id: watchlistGroupKey('venue-' + name), name, order: 100 };
    } else if (mode === 'quote') {
      const name = info?.quote || 'Diğer';
      group = { id: watchlistGroupKey('quote-' + name), name, order: 100 };
    } else {
      group = classifyWatchlistRef(ref);
    }
    const key = watchlistGroupKey(group.id);
    if (!groups.has(key)) groups.set(key, { ...group, id: key, refs: [] });
    groups.get(key).refs.push(ref);
  }
  return [...groups.values()].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'tr'));
}
function withStars(doc, favorites) {
  for (const ref of cleanWatchlist(firstArray([favorites]) || [])) {
    if (!allWatchlistRefs(doc).includes(ref)) continue;
    doc.flags[ref] = { ...(doc.flags[ref] || {}), starred: true };
  }
  return doc;
}
// Adds missing refs into a dedicated list without ever removing or rewriting
// the user's existing lists. Used by both boot migration and manual restore.
export function mergeLegacyWatchlist(doc, refs = LEGACY_TV_LIST) {
  const next = normalizeWatchlistDocument(doc);
  const existingRefs = allWatchlistRefs(next);
  const added = cleanWatchlist(refs).filter(ref => !existingRefs.includes(ref));
  if (!added.length) return { doc: next, added: [], changed: false };
  let classic = next.lists.find(l => l.id === 'tv-classic');
  if (classic) classic.symbols = cleanWatchlist([...classic.symbols, ...added]);
  else next.lists.push({ id: 'tv-classic', name: 'TradingView · FX & Kripto', symbols: added, color: '#d5b16a', collapsed: false });
  next.symbols = [...activeList(next).symbols];
  return { doc: next, added, changed: true };
}
// Returns a new document plus the exact refs that were added. Legacy sources
// are only merged; an existing custom document is never replaced or trimmed.
export function migrateWatchlistDocument({ owner, current, sources = [], favorites = [], legacyList = LEGACY_TV_LIST, defaults = SYMBOLS }) {
  const doc = normalizeWatchlistDocument(current);
  const legacy = firstArray(sources);
  const currentRefs = allWatchlistRefs(doc);
  const pristine = isPristineWatchlist(current, defaults);
  const seed = legacy?.length ? cleanWatchlist(legacy) : (!currentRefs.length || pristine ? cleanWatchlist(legacyList) : []);
  if (!seed.length) return { doc, changed: false, added: [], reason: 'existing', shouldMark: true };
  const merged = mergeLegacyWatchlist(doc, seed);
  if (!merged.changed) return { doc: withStars(merged.doc, favorites), changed: false, added: [], reason: 'complete', shouldMark: true };
  if (!currentRefs.length || pristine) {
    // Nothing was saved yet (or only the untouched default seed exists): the
    // restored TV list must be the exact result, with no synthetic 4-symbol
    // default list left behind. Genuine custom lists are never pruned here.
    const base = cleanWatchlist(defaults);
    merged.doc.lists = merged.doc.lists.filter(l => {
      if (l.id === 'tv-classic') return true;
      const refs = cleanWatchlist(l.symbols);
      return pristine ? refs.some(ref => !base.includes(ref)) : refs.length > 0;
    });
    if (!merged.doc.lists.length) merged.doc.lists.push({ id: 'main', name: 'İzleme listesi', symbols: [], color: '#7da4ff', collapsed: false });
    merged.doc.activeListId = 'tv-classic';
  }
  merged.doc.symbols = [...activeList(merged.doc).symbols];
  return {
    doc: withStars(merged.doc, favorites), changed: true, added: merged.added,
    reason: currentRefs.length && !pristine ? 'merged' : 'seeded', shouldMark: true
  };
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
  'OKX:HBARUSDT.P', 'OKX:UNIUSDT.P', 'OKX:TRXUSDT.P', 'OKX:WIFUSDT', 'OKX:BONKUSDT',
  'OKX:POPCATUSDT.P', 'OKX:RENDERUSDT',
  'BYBIT:BTCUSDT', 'BYBIT:ETHUSDT', 'BYBIT:SOLUSDT', 'BYBIT:BTCUSDT.P', 'BYBIT:ETHUSDT.P', 'BYBIT:SOLUSDT.P',
  'CME:BTC1!', 'CBOE:VIX', 'BIST:XU100', 'TVC:GOLD', 'TVC:DXY', 'FPMARKETS:US100',
  'FX_IDC:XAUTRYG', 'FX:XAUUSD', 'OANDA:XAGUSD',
  'OANDA:EURUSD', 'OANDA:USDJPY', 'OANDA:AUDUSD', 'OANDA:NZDUSD', 'OANDA:USDCAD',
  'FX:EURUSD', 'FX:USDJPY', 'FX:AUDUSD', 'FX:USDCAD', 'FX:GBPUSD', 'FX:USDCHF', 'FX:NZDCAD', 'FX:AUDCHF', 'FX:AUDCAD',
  'FX_IDC:GBPAUD', 'FOREXCOM:XAUUSD',
  'CRYPTOCAP:TOTAL', 'CRYPTOCAP:TOTAL2', 'CRYPTOCAP:TOTAL3', 'CRYPTOCAP:BTC.D', 'CRYPTOCAP:USDT.D',
];
export function foreignMarkets() {
  // Bare Binance Spot refs are already offered from the live catalogue; keeping
  // them here would render the same ref twice in the picker.
  return CURATED.map(ref => { try { return parseMarketRef(ref); } catch { return null; } })
    .filter(m => m && m.feed !== 'binance')
    .sort((a, b) => a.venue.localeCompare(b.venue) || a.label.localeCompare(b.label));
}
