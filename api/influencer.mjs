import { sendTelegram } from '../lib/telegram.mjs';
import { adminNotifyChatId } from '../lib/admin-notify.mjs';

const URL = process.env.SUPABASE_URL || 'https://zvnjslmptwmnuhftgqsr.supabase.co';
const PUB = process.env.SUPABASE_PUBLISHABLE || 'sb_publishable_bReG5UKaWcQkU0Z9GnGiJQ_0T4_Qm9X';
export const PACKAGES = { video: 'Video eğitim — 1.990₺', guided: 'Eğitim + bireysel soru-cevap — 3.490₺', growth: '1-1 büyüme desteği — 6.990₺' };
// Kept inside the server function, never embedded in the public page.
const OUTLINE = [
  ['1. Başlangıç ve konumlandırma', 'Hedef kitle; kriptoda uzmanlık alanı seçimi; kişisel hikâye; 30 günlük hedefler.'],
  ['2. X profilini kurma', 'Kullanıcı adı, fotoğraf, kapak, biyografi; tanışma gönderisi ve sabitlenen içerik. X tek sabit gönderiye izin verir.'],
  ['3. Kripto içerik okuryazarlığı', 'Kaynak doğrulama; veri/haber ayrımı; grafik anlatımı; telif ve kaynak gösterme; sponsorlu içerik açıklamaları.'],
  ['4. İçerik üretimi', 'Kısa gönderi, seri ve thread; güçlü giriş; görsel şablon; taslak geliştirme; AI çıktısını doğrulama.'],
  ['5. İçerik planı ve fikir sistemi', 'Üç içerik sütunu; haftalık takvim; haberden içerik çıkarma; fikir havuzu; tekrar kullanılabilir formatlar.'],
  ['6. İlk topluluğunu oluşturma', 'Nitelikli yanıtlar; sohbet başlatma; iş birlikleri; Spaces; spam ve botlardan kaçınma.'],
  ['7. Ölçüm ve gelişim', 'Gösterim, profil ziyareti, takip dönüşümü; haftalık değerlendirme; A/B format denemeleri.'],
  ['8. Güven ve sürdürülebilirlik', 'Hataları düzeltme; reklam şeffaflığı; güvenlik/2FA; dolandırıcılık önleme; tükenmeden üretim.'],
  ['Bireysel 4 soru-cevap görüşmesi', '1: Profil/hedefler. 2: İlk içerik geri bildirimi. 3: Etkileşim sorunları. 4: Sonuçlar ve sonraki plan.'],
  ['1-1 büyüme desteği', 'Başlangıç profil denetimi; haftalık görüşme; içerik geri bildirimi; kişisel fikirler. İlk 1000 takipçi veya 90 gün, hangisi önceyse. Takipçi/gelir garantisi yok.']
];

function reply(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(JSON.stringify(body));
}
async function db(path, method = 'GET', body) {
  const key = process.env.SUPABASE_SERVICE_ROLE;
  if (!key) throw new Error('storage_unavailable');
  const headers = { apikey: key, 'Content-Type': 'application/json', Prefer: 'return=representation' };
  if (!key.startsWith('sb_secret_')) headers.Authorization = 'Bearer ' + key;
  const r = await fetch(URL + '/rest/v1/influencer_orders' + path, {
    method, headers, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000)
  });
  if (!r.ok) {
    if (r.status === 409) throw new Error('duplicate_txid');
    throw new Error('storage_unavailable');
  }
  return r.json();
}
export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return reply(res, 405, { ok: false, error: 'method' });
  try {
    const token = /^Bearer (.+)$/i.exec(req.headers.authorization || '')?.[1];
    if (!token) return reply(res, 401, { ok: false, error: 'login_required' });
    const auth = await fetch(URL + '/auth/v1/user', {
      headers: { apikey: PUB, Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(8000)
    });
    if (!auth.ok) return reply(res, 401, { ok: false, error: 'login_required' });
    const user = await auth.json();
    if (!user.id) return reply(res, 401, { ok: false, error: 'login_required' });
    const admins = (process.env.SITE_ADMIN_EMAILS || process.env.SITE_ADMIN_EMAIL || 'ahmetnuman20@gmail.com').split(',').map(s => s.trim().toLowerCase());
    const admin = admins.includes(String(user.email || '').toLowerCase());
    if (req.method === 'GET') {
      // No storage prerequisite for the admin's private outline.
      if (admin && req.query?.op === 'outline') return reply(res, 200, { ok: true, outline: OUTLINE });
      if (req.query?.op === 'outline' || req.query?.op === 'list') {
        if (!admin) return reply(res, 403, { ok: false, error: 'admin_required' });
        return reply(res, 200, { ok: true, orders: await db('?select=*&order=created_at.desc&limit=100') });
      }
      const orders = await db('?select=id,package,status,created_at&user_id=eq.' + encodeURIComponent(user.id) + '&order=created_at.desc&limit=100');
      return reply(res, 200, { ok: true, unlocked: admin || orders.some(o => o.status === 'approved'), orders });
    }
    let body = req.body;
    if (typeof body === 'string') {
      if (body.length > 4096) return reply(res, 413, { ok: false, error: 'body_too_large' });
      try { body = JSON.parse(body); } catch { return reply(res, 400, { ok: false, error: 'invalid_body' }); }
    }
    body = body || {};
    if (['approve', 'reject'].includes(body.op)) {
      if (!admin) return reply(res, 403, { ok: false, error: 'admin_required' });
      if (!/^[a-f0-9-]{36}$/i.test(body.id || '')) return reply(res, 400, { ok: false, error: 'invalid_id' });
      const rows = await db('?id=eq.' + body.id + '&status=eq.pending', 'PATCH', {
        status: body.op === 'approve' ? 'approved' : 'rejected', reviewed_at: new Date().toISOString(), reviewed_by: user.id
      });
      return reply(res, rows.length ? 200 : 409, { ok: !!rows.length });
    }
    if (body.op !== 'submit' || !Object.hasOwn(PACKAGES, body.package) || !/^[a-f0-9]{64}$/i.test(body.txid || '')) {
      return reply(res, 400, { ok: false, error: 'invalid_payment' });
    }
    const recent = await db('?select=id&user_id=eq.' + encodeURIComponent(user.id) + '&created_at=gte.' + encodeURIComponent(new Date(Date.now() - 3600000).toISOString()) + '&limit=3');
    if (recent.length >= 3) return reply(res, 429, { ok: false, error: 'too_many_requests' });
    const [order] = await db('', 'POST', { user_id: user.id, email: user.email, package: body.package, txid: body.txid.toLowerCase() });
    let notified = false;
    try {
      const chat = adminNotifyChatId();
      // Never fall back to a group or mentorship topic.
      if (process.env.TG_BOT_TOKEN && /^\d+$/.test(chat)) {
        const sent = await sendTelegram([
          'Influencer eğitim ödeme bildirimi', PACKAGES[order.package], 'Üye: ' + user.email,
          'TXID: ' + order.txid, 'Ödeme kullanıcı beyanıdır; henüz doğrulanmadı.',
          'USDT/TRC20, alıcı adresi ve tutarı zincirden kontrol et.',
          'Onay/red: https://alfa-trader.com/?page=influencer'
        ].join('\n'), chat, null);
        notified = !!sent.ok;
        if (notified) await db('?id=eq.' + order.id, 'PATCH', { notified_at: new Date().toISOString() });
      }
    } catch { /* Persisted request remains in the admin inbox. */ }
    return reply(res, 200, { ok: true, status: 'pending', notified });
  } catch (e) {
    if (e.message === 'duplicate_txid') return reply(res, 409, { ok: false, error: 'duplicate_txid' });
    return reply(res, 503, { ok: false, error: 'storage_unavailable' });
  }
}
