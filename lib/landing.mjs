import { portfolioSummary } from './portfolio-summary.mjs';

const finite = value => typeof value === 'number' && Number.isFinite(value);
const day = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value) && Number.isFinite(Date.parse(value)) ? value.slice(0, 10) : null;
const round = value => Math.round(value * 100) / 100;

// Construct an explicit allowlist. Never send the shared row or monetary history.
export function publicPortfolio(data, summary, revision) {
  if (!data || (data.positions || []).some(p => p.id === 'eth-sep5')) return null;
  if (!finite(data.startBalance) || data.startBalance <= 0 || !finite(summary?.pnlPct)) return null;
  const byDay = new Map();
  for (const point of Array.isArray(data.history) ? data.history : []) {
    const date = day(point?.d);
    if (date && finite(point.v) && point.v >= 0) byDay.set(date, { date, pct: round((point.v / data.startBalance - 1) * 100) });
  }
  const series = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-90);
  return {
    returnPct: round(summary.pnlPct),
    asOf: summary.asOf || null,
    recordedAt: revision || null,
    live: summary.live === true,
    series,
    from: series[0]?.date || null,
    to: series.at(-1)?.date || null,
  };
}

const clip = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
export function previewImage(value) {
  if (typeof value !== 'string' || value.length > 800000) return '';
  if (/^data:image\/(?:png|jpeg|webp|gif);base64,[a-zA-Z0-9+/=\r\n]+$/.test(value)) return value;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.username && !u.password ? u.href : '';
  } catch { return ''; }
}

// Only the admin's actual published posts feed these previews, not Notion.
// Never expose entry/TP/SL fields, author emails, comments, avatars or reposts.
function weeklyPosts(data, now) {
  const unique = new Map();
  for (const p of Array.isArray(data?.posts) ? data.posts : []) {
    if (!p || p.isAdmin !== true || !['islem', 'analiz', 'onchain'].includes(p.type)) continue;
    const id = clip(p.id, 60);
    if (!/^[a-zA-Z0-9_-]+$/.test(id) || !finite(p.ts) || p.ts > now || p.ts < now - 7 * 86400000 || !Number.isFinite(new Date(p.ts).getTime())) continue;
    unique.set(id, p);
  }
  return [...unique.values()].sort((a, b) => b.ts - a.ts);
}
export function publicChannel(data, now = Date.now()) {
  const posts = weeklyPosts(data, now);
  const trades = posts.filter(p => p.type === 'islem');
  const biases = posts.filter(p => p.type !== 'islem');
  const preview = p => ({
    id: clip(p.id, 60), title: clip(p.title, 160), excerpt: clip(p.text, 180),
    image: previewImage(p.img) ? '/api/edu-shared?kind=landing&image=' + encodeURIComponent(p.id) : '', date: new Date(p.ts).toISOString(), coin: clip(p.coin, 20),
    direction: ['long', 'short', 'notr'].includes(p.bias) ? p.bias : ['long', 'short'].includes(p.dir) ? p.dir : '',
    status: p.type === 'islem' && ['aktif', 'tp', 'sl', 'iptal'].includes(p.status) ? p.status : '',
  });
  return {
    from: new Date(now - 7 * 86400000).toISOString(), to: new Date(now).toISOString(),
    trades: { count: trades.length, tp: trades.filter(p => p.status === 'tp').length, sl: trades.filter(p => p.status === 'sl').length, latest: trades.map(preview) },
    biases: { count: biases.length, latest: biases.map(preview) },
  };
}

async function loadPortfolio() {
  const key = process.env.SUPABASE_SERVICE_ROLE;
  if (!key) throw new Error('unavailable');
  const base = process.env.SUPABASE_URL || 'https://zvnjslmptwmnuhftgqsr.supabase.co';
  const headers = { apikey: key };
  if (!key.startsWith('sb_secret_')) headers.Authorization = 'Bearer ' + key;
  const r = await fetch(base + '/rest/v1/edu_shared?id=eq.alfa_portfoy_public&select=data,updated_at', { headers, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('unavailable');
  const rows = await r.json();
  if (!rows[0]?.data) return null;
  const { data, updated_at: revision } = rows[0];
  return publicPortfolio(data, await portfolioSummary(data, revision), revision);
}

let channelRow = null;
let channelPending = null;
async function loadChannelData() {
  if (channelRow && channelRow.expires > Date.now()) return channelRow.data;
  if (channelPending) return channelPending;
  channelPending = readChannelData().then(data => {
    channelRow = { data, expires: Date.now() + 60000 };
    return data;
  }).finally(() => { channelPending = null; });
  return channelPending;
}
async function readChannelData() {
  const key = process.env.SUPABASE_SERVICE_ROLE;
  if (!key) throw new Error('unavailable');
  const base = process.env.SUPABASE_URL || 'https://zvnjslmptwmnuhftgqsr.supabase.co';
  const headers = { apikey: key };
  if (!key.startsWith('sb_secret_')) headers.Authorization = 'Bearer ' + key;
  const r = await fetch(base + '/rest/v1/edu_shared?id=eq.alfa_trading&select=data', { headers, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('unavailable');
  const rows = await r.json();
  return rows[0]?.data || { posts: [] };
}
async function landingImage(req, res) {
  const id = req.query.image;
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,60}$/.test(id)) return res.status(400).json({ error: 'invalid_image' });
  try {
    const data = await loadChannelData();
    const post = weeklyPosts(data, Date.now()).find(p => p.id === id);
    const image = previewImage(post?.img);
    if (!image) return res.status(404).json({ error: 'image_not_available' });
    res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=30');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (image.startsWith('https:')) return res.redirect(302, image);
    const match = image.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([a-zA-Z0-9+/=\r\n]+)$/);
    if (!match) return res.status(404).json({ error: 'image_not_available' });
    res.setHeader('Content-Type', match[1]);
    return res.status(200).send(Buffer.from(match[2], 'base64'));
  } catch { return res.status(503).json({ error: 'image_unavailable' }); }
}

let cache = null;
let pending = null;
export default async function landing(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  if (req.query?.image !== undefined) return landingImage(req, res);
  // One bounded request per warm instance; failures are short-cached, not disguised as zero.
  if (!cache || Date.now() > cache.expires) {
    if (!pending) pending = Promise.allSettled([loadPortfolio(), loadChannelData().then(data => publicChannel(data))]).then(([p, t]) => {
      const body = {
        portfolio: p.status === 'fulfilled' ? p.value : null,
        channel: t.status === 'fulfilled' ? t.value : null,
        status: { portfolio: p.status === 'rejected' ? 'unavailable' : p.value ? 'ok' : 'empty', channel: t.status === 'rejected' ? 'unavailable' : (t.value.trades.count || t.value.biases.count) ? 'ok' : 'empty' },
        fetchedAt: new Date().toISOString(),
      };
      cache = { body, expires: Date.now() + (p.status === 'rejected' || t.status === 'rejected' ? 30000 : 60000) };
    }).finally(() => { pending = null; });
    await pending;
  }
  res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=30');
  return res.status(200).json(cache.body);
}
