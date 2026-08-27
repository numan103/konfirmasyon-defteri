// Alfa Portföy Telegram bildirimleri.
// İstemciden gelen mesajı Telegram Bot API üzerinden TG_CHAT_ID sohbetine gönderir,
// ayrıca ?auto=1 ile Supabase'teki alfa_portfoy_public anlık görüntüsünden değerlendirme kurar.
// Gerekli Vercel env değerleri: TG_BOT_TOKEN (BotFather), TG_CHAT_ID.
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zvnjslmptwmnuhftgqsr.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE || 'sb_publishable_3esU1e0mIeUaSrmqPxsEfQ_Lcv11GLa';
const TG_TOKEN = process.env.TG_BOT_TOKEN;
const TG_CHAT = process.env.TG_CHAT_ID;

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
    body: JSON.stringify({ chat_id: TG_CHAT, text, disable_web_page_preview: true }),
  });
  let out = {};
  try { out = await res.json(); } catch (e) {}
  return { http: res.status, ...out };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!TG_TOKEN || !TG_CHAT) {
    const why = 'Telegram için Vercel Environment Variables gerekli: TG_BOT_TOKEN (BotFather\'dan) ve TG_CHAT_ID.';
    if (req.method === 'GET' && req.query && String(req.query.ping) === '1') return res.status(503).json({ ok: false, error: why });
    return res.status(503).json({ ok: false, error: why });
  }

  if (req.method === 'GET') {
    if (req.query && String(req.query.ping) === '1') return res.status(200).json({ ok: true, configured: true });
    if (req.query && String(req.query.auto) === '1') {
      const r = await readSnapshot();
      if (!r.data) return res.status(404).json({ ok: false, error: r.error || 'alfa_portfoy_public bulunamadı (istemci henüz senkronize olmadı).' });
      const out = await sendTelegram(buildEvalText(r.data));
      if (out.ok) return res.status(200).json({ ok: true });
      return res.status(502).json({ ok: false, error: out.description || 'Telegram gönderimi başarısız', http: out.http });
    }
    return res.status(200).json({ ok: true, endpoint: 'Alfa Portföy Telegram bildirim ucu. POST {message} veya GET ?auto=1' });
  }

  if (req.method === 'POST') {
    let body;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); } catch (e) { return res.status(400).json({ error: 'Invalid JSON body' }); }
    const message = String((body && (body.message || body.text)) || '').trim().slice(0, 4000);
    if (!message) return res.status(400).json({ error: 'message gerekli' });
    const out = await sendTelegram(message);
    if (out.ok) return res.status(200).json({ ok: true });
    return res.status(502).json({ ok: false, error: out.description || 'Telegram gönderimi başarısız', http: out.http });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}