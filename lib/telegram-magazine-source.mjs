// Read-only bridge for the public messages explicitly identified by the owner.
// No Telegram login, bot history calls, outgoing messages or database writes.
export const MAGAZINE_TOPIC = 977;
export const MAGAZINE_ANCHOR = 987;
const FIRST = 978;
const cache = new Map();
let inFlight = null, snapshot = null, snapshotAt = 0;
const decode = text => String(text || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '')
  .replace(/&(amp|lt|gt|quot|apos|#39|nbsp);/g, (_, s) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", nbsp: ' ' }[s]))
  .replace(/&#(\d+);/g, (_, n) => Number(n) <= 0x10ffff ? String.fromCodePoint(Number(n)) : '').trim();
export function parseMagazineWidget(html, message) {
  if (!Number.isSafeInteger(message) || message < FIRST || message > MAGAZINE_ANCHOR || html.length > 400000) return null;
  if (!html.includes('data-post="alfakasim/' + message + '"')) return null;
  // A reply to this exact topic root is mandatory. Links from other topics fail closed.
  const reply = html.match(/<a\b[^>]*class="[^"]*\btgme_widget_message_reply\b[^"]*"[^>]*href="([^"]+)"/);
  if (reply?.[1] !== 'https://t.me/alfakasim/977') return null;
  const header = html.slice(0, html.indexOf('tgme_widget_message_reply'));
  const author = decode(header.match(/class="tgme_widget_message_author_name"[^>]*>([\s\S]*?)<\/span>/)?.[1]);
  // The owner's explicit link is trusted for attribution; other historic posts
  // must expose the same author in their public widget.
  if (message !== MAGAZINE_ANCHOR && author !== 'Trader Ahmet') return null;
  const raw = html.match(/<div class="tgme_widget_message_text js-message_text"[^>]*>([\s\S]*?)<\/div>/)?.[1] || '';
  const body = decode(raw).slice(0, 20000);
  const stamp = html.match(/<time datetime="([^"]+)"/)?.[1];
  if (!stamp || !Number.isFinite(Date.parse(stamp))) return null;
  const photos = [...html.matchAll(/<a\b[^>]*class="[^"]*\btgme_widget_message_photo_wrap\b[^"]*"[^>]*style="([^"]+)"/g)]
    .map(m => m[1].match(/background-image:url\('([^']+)'\)/)?.[1]).filter(Boolean)
    .filter(url => { try { const u = new URL(url); return u.protocol === 'https:' && /^cdn\d*\.telesco\.pe$/.test(u.hostname) && !u.port && !u.username && !u.password; } catch { return false; } }).slice(0, 12);
  if (!body && !photos.length) return null;
  return { id: 'mag_public_alfakasim_' + message, title: body.split('\n').find(Boolean)?.slice(0, 120) || 'Haftanın piyasa görseli', body,
    authorId: 'traderahmetd', category: /\b(?:btc|bitcoin)\b/i.test(body) ? 'BTC Bias' : 'Makro', type: '',
    // Public readers only need provenance for sorting/dedupe, never a Telegram URL.
    sourceKind: 'mentorship-magazine', sourceThread: 977, sourceMessageId: message,
    publishedAt: new Date(stamp).toISOString(), images: photos.map((_, index) => '/api/tg?magPhoto=publicmag_' + message + '_' + index), _photos: photos };
}
export async function readMagazineMessage(message) {
  if (!Number.isSafeInteger(message) || message < FIRST || message > MAGAZINE_ANCHOR) return null;
  const hit = cache.get(message);
  if (hit && Date.now() - hit.at < 300000) return hit.value;
  const r = await fetch('https://t.me/alfakasim/' + message + '?embed=1', { redirect: 'error', signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error('telegram_public_unavailable');
  const chunks = []; let size = 0;
  for await (const chunk of r.body) { size += chunk.length; if (size > 400000) throw new Error('telegram_public_large'); chunks.push(chunk); }
  const value = parseMagazineWidget(Buffer.concat(chunks).toString('utf8'), message);
  cache.set(message, { at: Date.now(), value });
  return value;
}
export async function readMagazineSnapshot() {
  if (snapshot && Date.now() - snapshotAt < 300000) return snapshot;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const found = []; let failed = false;
    for (let start = FIRST; start <= MAGAZINE_ANCHOR; start += 4) {
      const results = await Promise.allSettled(Array.from({ length: Math.min(4, MAGAZINE_ANCHOR - start + 1) }, (_, i) => readMagazineMessage(start + i)));
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) { const { _photos, ...entry } = result.value; found.push(entry); }
        if (result.status === 'rejected') failed = true;
      }
    }
    if (!failed) { snapshot = found; snapshotAt = Date.now(); }
    return found;
  })().finally(() => { inFlight = null; });
  return inFlight;
}

export async function magazinePublicPhoto(req, res) {
  const message = Number(req.query.magazinePost), index = Number(req.query.image || 0);
  if (!Number.isInteger(index) || index < 0 || index > 11) return res.status(400).end();
  try {
    const entry = await readMagazineMessage(message), url = entry?._photos[index];
    if (!url) return res.status(404).end();
    const r = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(8000) });
    if (!r.ok) return res.status(502).end();
    const chunks = []; let size = 0;
    for await (const chunk of r.body) { size += chunk.length; if (size > 2_000_000) throw new Error('photo_large'); chunks.push(chunk); }
    const bytes = Buffer.concat(chunks);
    const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const png = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    if (!jpeg && !png) return res.status(415).end();
    res.setHeader('Content-Type', jpeg ? 'image/jpeg' : 'image/png');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.status(200).end(bytes);
  } catch { return res.status(502).end(); }
}
