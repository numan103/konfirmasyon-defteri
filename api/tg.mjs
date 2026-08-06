// Telegram kanalındaki son gönderileri t.me/s/ sayfasından parse edip JSON döndürür.
// Kanal embed iframe'leri X-Frame-Options ile engellendiği için sunucu tarafı çözüm kullanıldı.
const CHANNEL = process.env.TG_CHANNEL || 'alfatraderspublic';
const MAX_POSTS = Number(process.env.TG_MAX_POSTS || 12);

async function fetchChannelHtml(before) {
  const q = before ? `?before=${encodeURIComponent(before)}` : '';
  const res = await fetch(`https://t.me/s/${CHANNEL}${q}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) return { error: `t.me ${res.status}` };
  return { html: await res.text() };
}

// t.me/s/ sayfasını kendi origin'imizde iframe olarak servis etmek için hazırlar:
// göreli linkleri kendi proxy endpoint'imize, dış http linklerini ise yeni sekmede açılacak şekilde çevirir.
// Sadece gönderiler kalacak şekilde üst kanal başlığını ve sağdaki kanal tanıtım kolonunu gizler,
// fotoğraflara ekrana sığan lightbox büyütme ekler (URL'ler sunucu tarafında data-alp-src'ye gömülür;
// t.me'nin kendi JS'i style'ı değiştirdiği için click anında regex çalıştırılmaz).
const EMBED_EXTRA = `<style>
  .tgme_header, .tgme_header_right_column, .tgme_right_column, .tgme_channel_info,
  .tgme_channel_download_telegram, .tgme_channel_join_telegram, .tgme_footer, .tgme_header_search { display: none !important; }
  .tgme_main { padding-top: 10px; }
  .tgme_widget_message_photo_wrap { cursor: zoom-in; }
  #alp-lg { position: fixed; inset: 0; z-index: 2147483647; background: rgba(0,0,0,.94); display: none; padding: 24px; box-sizing: border-box; }
  #alp-lg-photo { width: 100%; height: 100%; background-size: contain; background-repeat: no-repeat; background-position: center; }
  #alp-lg .x { position: absolute; top: 14px; right: 18px; color: #fff; font-size: 30px; line-height: 1; cursor: pointer; opacity: .8; z-index: 2; }
  #alp-lg .x:hover { opacity: 1; }
</style>
<div id="alp-lg"><span class="x">✕</span><div id="alp-lg-photo"></div></div>
<script>
(function () {
  var lg = document.getElementById('alp-lg');
  if (!lg) return;
  var photo = document.getElementById('alp-lg-photo');
  lg.querySelector('.x').addEventListener('click', close);
  lg.addEventListener('click', function (e) { if (e.target === lg || e.target === photo) close(); });
  function close() { lg.style.display = 'none'; photo.style.backgroundImage = 'none'; }
  function openSrc(src) { photo.style.backgroundImage = 'url(\\'' + src.replace(/'/g, '\\'') + '\\')'; lg.style.display = 'block'; }
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[data-alp-src]') : null;
    if (a) { e.preventDefault(); e.stopPropagation(); openSrc(a.getAttribute('data-alp-src')); }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
})();
</script>`;

function rewriteHtml(html) {
  const base = `/api/tg?embed=1`;
  let out = html;
  // Fotoğraf/önizleme kaplarını: href kaldırılır, gerçek görsel URL data-alp-src'ye gömülür.
  // Bu, t.me'nin kendi JS'inin style'ı değiştirmesinden etkilenmeden lightbox'ın doğru URL'yi kullanmasını sağlar.
  out = out.replace(/<a\b([^>]*?)class="([^"]*tgme_widget_message_photo_wrap[^"]*)"([^>]*)>/g, (m, pre, cls, post) => {
    const um = m.match(/background-image:\s*url\((['"]?)([^'")]+)\1\)/);
    if (!um) return m;
    const src = um[2].replace(/&amp;/g, '&');
    const clean = (pre + post)
      .replace(/\s+href="[^"]*"/g, '')
      .replace(/\s+target="[^"]*"/g, '')
      .replace(/\s+rel="[^"]*"/g, '');
    return '<a class="' + cls + '"' + clean + ' data-alp-src="' + src + '">';
  });
  out = out.replace(new RegExp('href="/s/' + CHANNEL + '\\?before=', 'g'), 'href="' + base + '&before=');
  out = out.replace(new RegExp('href="/s/' + CHANNEL + '"', 'g'), 'href="' + base + '"');
  out = out.replace(new RegExp('action="/s/' + CHANNEL + '"', 'g'), 'action="' + base + '"');
  out = out.replace(new RegExp('href="/s/' + CHANNEL, 'g'), 'href="' + base + '"');
  out = out.replace(/<a\s+href="(https?:)/g, '<a target="_blank" rel="noopener noreferrer" href="$1');
  out = out.replace(/<a\s+href="(\/\/)/g, '<a target="_blank" rel="noopener noreferrer" href="$1');
  out = out.replace(/<\/head>/, EMBED_EXTRA + '</head>');
  return out;
}

function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function extractText(block) {
  const m = block.match(/tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/);
  if (!m) return '';
  const t = m[1]
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/[\s\u00a0]+/g, ' ')
    .trim();
  return decodeEntities(t);
}

function extractTime(block) {
  const m = block.match(/datetime="([^"]+)"/);
  return m ? m[1] : null;
}

function extractMedia(block) {
  // Fotoğraf: arka plan URL'si olan a etiketi
  const photo = block.match(/background-image:\s*url\('([^']+)'\)/);
  // Video görseli: tgme_widget_message_video içindeki img
  const vimg = block.match(/tgme_widget_message_video[^>]*>[\s\S]{0,1200}?src="([^"]+)"/);
  // Video direkt dosya
  const vfile = block.match(/<video[^>]*src="([^"]+)"/);
  if (photo) return { kind: 'photo', url: photo[1] };
  if (vfile) return { kind: 'video', url: vfile[1] };
  if (vimg) return { kind: 'video', url: vimg[1] };
  return null;
}

function extractPosts(html) {
  const posts = [];
  const blocks = html.split('tgme_widget_message_wrap');
  for (const block of blocks) {
    const idm = block.match(/data-post="([^"]+)"/);
    if (!idm) continue;
    const pid = Number(String(idm[1]).split('/').pop());
    const text = extractText(block);
    const time = extractTime(block);
    const media = extractMedia(block);
    const isMention = block.includes('tgme_widget_message_mention');
    posts.push({
      id: pid,
      channel: CHANNEL,
      text,
      time,
      date: time ? new Date(time).toISOString() : null,
      media,
      mention: isMention,
      link: `https://t.me/${CHANNEL}/${pid}`,
    });
  }
  posts.sort((a, b) => b.id - a.id);
  return posts;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
  const embed = req.query && (req.query.embed || req.query.page);
  const before = req.query && req.query.before;
  const r = await fetchChannelHtml(before);
  if (r.error) {
    if (embed) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(502).send('<html><body style="margin:0;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;background:#fff;color:#555;font-size:14px;">Telegram şu anda yüklenemedi.<br><br><a href="https://t.me/' + CHANNEL + '" style="color:#229ed9;font-weight:700;text-decoration:none;">Telegram&#8217;da a&#231; &#8599;</a></body></html>');
    }
    return res.status(502).json({ error: r.error });
  }
  if (embed) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(rewriteHtml(r.html));
  }
  const posts = extractPosts(r.html);
  return res.status(200).json(posts.slice(0, MAX_POSTS));
}
