// Public TradingView watchlists only. No cookies, login tokens, arbitrary URLs,
// script execution, redirects or raw remote HTML are forwarded to the client.
const MAX_BYTES = 2 * 1024 * 1024;
export function publicWatchlistURL(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('bad_watchlist_url'); }
  const match = /^\/watchlists\/([0-9]{1,20})\/?$/.exec(url.pathname);
  if (typeof value !== 'string' || value.length > 1024 || url.protocol !== 'https:' || url.port || url.username || url.password ||
    !/^(www\.|[a-z]{2}\.)?tradingview\.com$/.test(url.hostname) || !match || BigInt(match[1]) === 0n) throw new Error('bad_watchlist_url');
  const id = String(BigInt(match[1]));
  return { id, url: `https://www.tradingview.com/watchlists/${id}/` };
}
export function publicWatchlistData(html, id) {
  for (const match of html.matchAll(/<script\b[^>]*type\s*=\s*(["'])application\/prs\.init-data\+json\1[^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    let data; try { data = JSON.parse(match[2]); } catch { continue; }
    const list = data?.sharedWatchlist?.list;
    if (!list || String(list.id) !== id || !Array.isArray(list.symbols)) continue;
    if (list.symbols.length > 2000 || list.symbols.some(s => typeof s !== 'string' || s.length > 100)) throw new Error('watchlist_too_large');
    return { name: typeof list.name === 'string' ? list.name.slice(0, 120) : 'TradingView',
      symbols: list.symbols.filter(s => !s.startsWith('###')) };
  }
  throw new Error('public_watchlist_unavailable');
}
export async function fetchPublicWatchlist(value, fetcher = fetch) {
  const target = publicWatchlistURL(value);
  const response = await fetcher(target.url, { redirect: 'manual', credentials: 'omit', cache: 'no-store',
    signal: AbortSignal.timeout(12000), headers: { Accept: 'text/html' } });
  if (!response.ok || response.redirected) throw new Error('public_watchlist_unavailable');
  const length = Number(response.headers.get('content-length'));
  if (length > MAX_BYTES) throw new Error('watchlist_too_large');
  if (!/text\/html/i.test(response.headers.get('content-type') || '')) throw new Error('public_watchlist_unavailable');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('public_watchlist_unavailable');
  const chunks = []; let bytes = 0;
  try {
    while (true) {
      const { done, value: chunk } = await reader.read(); if (done) break;
      bytes += chunk.byteLength;
      if (bytes > MAX_BYTES) { await reader.cancel(); throw new Error('watchlist_too_large'); }
      chunks.push(chunk);
    }
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(bytes); let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return { ...publicWatchlistData(new TextDecoder().decode(body), target.id), source: target.url };
}
const requests = new Map();
export function allowWatchlistImport(userId, now = Date.now()) {
  for (const [key, entry] of requests) if (now - entry.start >= 60000) requests.delete(key);
  const entry = requests.get(userId) || { start: now, count: 0 };
  if (entry.count >= 6 || !requests.has(userId) && requests.size >= 1000) return false;
  entry.count++; requests.set(userId, entry); return true;
}
