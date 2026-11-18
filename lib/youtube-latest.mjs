// The configured public channel only. No arbitrary upstream URL or API key.
export const CHANNEL_ID = 'UCm37PItmzZ5hH_16D9bPMFw';
const FEED = 'https://www.youtube.com/feeds/videos.xml?channel_id=' + CHANNEL_ID;
function decode(text) {
  return text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (whole, entity) => {
    const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    if (Object.hasOwn(named, entity.toLowerCase())) return named[entity.toLowerCase()];
    const n = entity[1]?.toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return Number.isInteger(n) && n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : '';
  });
}
export function parseYoutubeFeed(xml, now = Date.now()) {
  if (typeof xml !== 'string' || xml.length > 512000) return null;
  const tag = (block, name) => block.match(new RegExp('<' + name + '>([^<]*)</' + name + '>'))?.[1]?.trim() || '';
  const videos = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].flatMap(([, block]) => {
    const id = tag(block, 'yt:videoId'), channel = tag(block, 'yt:channelId');
    const title = decode(tag(block, 'title')).slice(0, 240), publishedAt = tag(block, 'published');
    const at = Date.parse(publishedAt);
    if (channel !== CHANNEL_ID || !/^[\w-]{11}$/.test(id) || !title || !Number.isFinite(at) || at > now) return [];
    return [{ id, title, publishedAt: new Date(at).toISOString() }];
  }).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  return videos[0] || null;
}
let cached = null, pending = null;
export default async function youtubeLatest(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  try {
    if (!cached || cached.expires < Date.now()) {
      if (!pending) pending = (async () => {
        const response = await fetch(FEED, { signal: AbortSignal.timeout(8000), redirect: 'error' });
        if (!response.ok) throw new Error('youtube_unavailable');
        const video = parseYoutubeFeed(await response.text());
        if (!video) throw new Error('youtube_feed_invalid');
        cached = { video, expires: Date.now() + 15 * 60000 };
      })().finally(() => { pending = null; });
      await pending;
    }
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300');
    return res.status(200).json({ video: cached.video, channelId: CHANNEL_ID });
  } catch { return res.status(503).json({ error: 'youtube_unavailable' }); }
}
