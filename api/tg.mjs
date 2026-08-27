// Telegram kanalındaki son gönderileri t.me/s/ sayfasından parse edip JSON döndürür.
// Kanal embed iframe'leri X-Frame-Options ile engellendiği için sunucu tarafı çözüm kullanıldı.
// Ayrıca ?notify=1 (veya POST {message}) ile Alfa Portföy bildirimleri Bot API'den gönderilir
// (Vercel Hobby 12 fonksiyon limiti nedeniyle ayrı endpoint açılmadı).
const CHANNEL = process.env.TG_CHANNEL || 'alfatraderspublic';
const MAX_POSTS = Number(process.env.TG_MAX_POSTS || 12);
const TG_TOKEN = process.env.TG_BOT_TOKEN;
const TG_CHAT = process.env.TG_CHAT_ID;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zvnjslmptwmnuhftgqsr.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE || 'sb_publishable_3esU1e0mIeUaSrmqPxsEfQ_Lcv11GLa';

const sbHeaders = (key) => ({ apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' });

function fmt(n) {
  if (n === null || n === undefined || isNaN(n)) return '0';
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function pct(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return ((n >= 0 ? '+' : '') + n.toFixed(2) + '%');
}
function buildEvalText(d) {
  const sum = d || {};
  const lines = ['📦 *Alfa Portföy*', ''];
  lines.push('Toplam: ' + fmt(sum.portfolioValue));
  lines.push(pct(sum.pnl) + ' (' + pct(sum.pnlPct) + ')');
  if (sum.cash !== undefined) lines.push('Bakiye (USDT): ' + fmt(sum.cash) + ' · ' + (sum.count || 0) + ' enstrüman');
  if (Array.isArray(sum.positions) && sum.positions.length) {
    lines.push('');
    sum.positions.forEach(p => {
      lines.push('• ' + String(p.symbol || '?') + ': ' + fmt(p.value) + (p.pnlPct !== undefined && p.pnlPct !== null ? ' (' + pct(p.pnlPct) + ')' : ''));
    });
  }
  if (sum.lastUpdate) lines.push('', 'Son güncelleme: ' + String(sum.lastUpdate).slice(0, 10));
  lines.push('alfa-trader.com');
  return lines.join('\n');
}
async function readSnapshot() {
  const url = `${SUPABASE_URL}/rest/v1/edu_shared?id=eq.alfa_portfoy_public&select=data`;
  const res = await fetch(url, { headers: sbHeaders(SUPABASE_KEY) });
  if (res.status === 404) return { missing: true };
  if (!res.ok) return { error: `Supabase read ${res.status}: ${(await res.text()).slice(0, 160)}` };
  const rows = await res.json();
  return { data: (rows && rows[0] && rows[0].data) || null };
}
async function sendTelegram(text) {
  const url = `https://api.telegram.org/bot${TG_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TG_CHAT, text, parse_mode: 'Markdown', disable_web_page_preview: true }),
  });
  let out = {};
  try { out = await res.json(); } catch (e) {}
  return { http: res.status, ...out };
}
async function handleNotify(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!TG_TOKEN || !TG_CHAT) return res.status(503).json({ ok: false, error: 'Telegram için Vercel env gerekli: TG_BOT_TOKEN ve TG_CHAT_ID.' });
  let message = null;
  if (req.method === 'POST') {
    let body;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); } catch (e) { return res.status(400).json({ error: 'Invalid JSON body' }); }
    message = String((body && (body.message || body.text)) || '').trim().slice(0, 4000);
  } else if (req.query && String(req.query.auto) === '1') {
    const r = await readSnapshot();
    if (!r.data) return res.status(404).json({ ok: false, error: r.error || 'alfa_portfoy_public bulunamadı.' });
    message = buildEvalText(r.data);
  }
  if (!message) return res.status(400).json({ error: 'message gerekli' });
  const out = await sendTelegram(message);
  if (out.ok) return res.status(200).json({ ok: true });
  return res.status(502).json({ ok: false, error: out.description || 'Telegram gönderimi başarısız', http: out.http });
}

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
  const notify = (req.method === 'POST') || (req.query && (String(req.query.notify) === '1' || String(req.query.auto) === '1'));
  if (notify) return handleNotify(req, res);
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
