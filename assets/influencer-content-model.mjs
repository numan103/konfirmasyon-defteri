// Browser-side validation mirrors the server. Server remains the authority.
export function mediaUrl(value, type) {
  const s = typeof value === 'string' ? value.trim() : '';
  if (type === 'image' && s.length <= 500000 && /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(s)) return s;
  if (type === 'image' && /^\/assets\/[\w./-]+\.(?:png|jpg|jpeg|webp)$/i.test(s) && !s.includes('..')) return s;
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' || u.username || u.password || s.length > 2000) return '';
    if (type === 'video' && !['youtube.com', 'www.youtube.com', 'youtu.be', 'www.youtube-nocookie.com'].includes(u.hostname) && !/\.mp4$/i.test(u.pathname)) return '';
    return u.href;
  } catch { return ''; }
}
