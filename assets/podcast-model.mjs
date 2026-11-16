export const MAX_AUDIO_BYTES = 30 * 1024 * 1024;
export const AUDIO_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac', 'audio/x-aac', 'audio/ogg', 'audio/opus', 'audio/wav', 'audio/x-wav'];
export function audioURL(value) {
  try {
    if (typeof value !== 'string' || value.length > 2048) return null;
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password || !/\.(mp3|m4a|aac|ogg|opus|wav)$/i.test(u.pathname)) return null;
    if (/(^|\.)(localhost|supabase\.co|supabase\.in|supabase\.net)$/.test(u.hostname) ||
        /^\[|^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(u.hostname)) return null;
    return u.href;
  } catch { return null; }
}
export function cleanEpisode(input, now = Date.now()) {
  if (!input || typeof input !== 'object') return null;
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  const url = audioURL(input.audioUrl);
  const published = Date.parse(input.publishedAt);
  const duration = Number(input.durationSeconds || 0);
  if (!title || title.length > 120 || description.length > 500 || !url ||
      !['daily', 'weekly'].includes(input.cadence) || !Number.isFinite(published) || published > now + 300000 ||
      !Number.isFinite(duration) || duration < 0 || duration > 14400) return null;
  return { title, description, audioUrl: url, cadence: input.cadence,
    publishedAt: new Date(published).toISOString(), durationSeconds: Math.round(duration) };
}
function dateKey(value) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year:'numeric', month:'2-digit', day:'2-digit' }).format(value);
}
export function episodeBadge(episode, now = Date.now()) {
  if (!episode) return 'ALFA Podcast';
  const published = Date.parse(episode.publishedAt);
  if (!Number.isFinite(published)) return 'Son Bölüm';
  const today = dateKey(now), day = dateKey(published);
  if (episode.cadence === 'daily' && day === today) return 'Günün Podcast’i';
  const start = new Date(today + 'T00:00:00Z');
  start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
  if (episode.cadence === 'weekly' && day >= start.toISOString().slice(0,10) && day <= today) return 'Haftanın Podcast’i';
  return 'Son Bölüm';
}
export function timeLabel(seconds) {
  const n = Math.max(0, Math.floor(Number(seconds) || 0));
  return n >= 3600 ? Math.floor(n / 3600) + ':' + String(Math.floor(n % 3600 / 60)).padStart(2,'0') + ':' + String(n % 60).padStart(2,'0') :
    Math.floor(n / 60) + ':' + String(n % 60).padStart(2,'0');
}
export function resumePosition(value, duration) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  if (Number.isFinite(duration) && duration > 0) return n >= duration - 3 ? 0 : Math.min(n, duration);
  return n;
}
