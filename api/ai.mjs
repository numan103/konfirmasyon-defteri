import { sendTelegram } from '../lib/telegram.mjs';
import { adminNotifyChatId } from '../lib/admin-notify.mjs';
import { send, fail } from '../ayna-server/http.mjs';
import { getUser, db, q } from '../ayna-server/supabase.mjs';
import { underLimit } from '../ayna-server/limits.mjs';
import { canUseAyna } from '../ayna-server/access.mjs';
import runDaily from '../ayna-server/jobs/daily.mjs';
import ping from '../ayna-server/actions/ping.mjs';
import scribe from '../ayna-server/actions/scribe.mjs';
import reflect from '../ayna-server/actions/reflect.mjs';
import coach from '../ayna-server/actions/coach.mjs';
import dedupeChat from '../ayna-server/actions/dedupe-chat.mjs';
import ringSuggest from '../ayna-server/actions/ring-suggest.mjs';
import chatExtract from '../ayna-server/actions/chat-extract.mjs';
import onboardingSummary from '../ayna-server/actions/onboarding-summary.mjs';
import sync from '../ayna-server/actions/sync.mjs';
import journalFollowup from '../ayna-server/actions/journal-followup.mjs';
import notionSyncAction from '../ayna-server/actions/notion-sync.mjs';
import macroHandler from '../lib/macro/handler.mjs';
import orderbookHandler from '../lib/orderbook-levels.mjs';
import strategiesHandler from '../lib/strategies.mjs';
import telegramWebhookHandler from '../lib/telegram-webhook.mjs';
import coinalyzeHandler from '../lib/coinalyze.mjs';
import marketNewsHandler from '../lib/market-news.mjs';
import economicCalendarHandler, { mentorshipDailyNewsHandler } from '../lib/economic-calendar.mjs';
import mentorTradesHandler from '../lib/mentorship-trades.mjs';

const AYNA_ACTIONS = { ping, scribe, reflect, coach, 'journal-followup': journalFollowup, 'notion-sync': notionSyncAction, 'onboarding-summary': onboardingSummary, sync, 'dedupe-chat': dedupeChat, 'ring-suggest': ringSuggest, 'chat-extract': chatExtract };

const SYSTEM_PROMPT = `Sen Alfa Traders topluluğunun AI asistanısın. Kısa, net ve yardımsever cevaplar ver (max 3-4 cümle). Türkçe konuş.

Topluluk hakkında bilgiler:
- Alfa Traders: disiplinli trading, hayat boyu öğrenme ve güçlü topluluk ortamı
- Referans linkleri ile katılım: Bybit, OKX
- Kayıt olanlar UID'lerini girerek topluluğa katılır
- Eğitim içerikleri: Alfa Edu bölümünde (teknik analiz, temel analiz, psikoloji, işlem, onchain)
- Canlı destek: Sohbet penceresindeki "Canlı Destek" butonu ile bağlanılır. SAKIN Telegram'a yönlendirme yapma.
- Deneyimli trader'lar başvuru formu doldurur
- Topluluk akışında işlem, konu, eğitim ve duyuru paylaşımları var
- Platform: alfa-trader.com (trade günlüğü, checklist, haftalık değerlendirme, dergi, indikatörler)

ÖNEMLİ: Kullanıcı canlı destek isterse ASLA Telegram'a yönlendirme yapma. Ona sohbet penceresindeki "Canlı Destek" butonunu kullanmasını söyle.`;

const GROQ_MODEL = 'llama-3.1-8b-instant';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

export default async function handler(req, res) {
  if (req.query?.influencer === '1') return influencerHandler(req, res);
  if (req.query?.mentorTrades === '1') return mentorTradesHandler(req, res);
  if (req.query?.ping === '1') return res.status(200).json({ ok: true, time: new Date().toISOString() });
  if (req.query?.authdebug === '1') {
    const { requestUser, bearer } = await import('../lib/auth.mjs');
    const jwt = bearer(req);
    const user = await requestUser(req);
    return res.status(200).json({ 
      hasJwt: !!jwt,
      jwtPrefix: jwt?.slice(0, 20),
      user: user ? { email: user.email, admin: user.admin } : null,
    });
  }
  if (req.query?.strategies === '1') return strategiesHandler(req, res);
if (req.query?.['telegram-webhook'] === '1') return telegramWebhookHandler(req, res);
  if (req.query?.coinalyze === '1') return coinalyzeHandler(req, res);
  if (req.query?.orderbook === '1') return orderbookHandler(req, res);
  if (req.query?.news === '1') return marketNewsHandler(req, res);
  if (req.query?.calendar === '1') return economicCalendarHandler(req, res);
  if (req.query?.mentorNews === '1') return mentorshipDailyNewsHandler(req, res);
  if (req.query?.macro === '1' || (req.method === 'POST' && typeof req.body?.action === 'string' && req.body.action.startsWith('macro-'))) return macroHandler(req, res);
  if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type'); return res.status(200).end(); }
  if (req.method === 'GET') return cronHandler(req, res);
  const authHeader = req.headers.authorization || '';
  const body = req.method === 'POST' ? (req.body || {}) : {};
  if (authHeader.startsWith('Bearer ') && typeof body.action === 'string') return aynaHandler(req, res, authHeader.slice(7));
  return aiHandler(req, res);
}

async function aiHandler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { message, history, system, tokens } = req.body || {};
  if (!message) return res.status(400).json({ reply: 'Mesaj girmelisin.' });
  const API_KEY = process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY;
  if (!API_KEY) return res.json({ reply: null });
  const historyMessages = Array.isArray(history) ? history.filter(h => h && h.role && typeof h.content === 'string').slice(-14) : [];
  try {
    const r = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: system || SYSTEM_PROMPT },
          ...historyMessages,
          { role: 'user', content: message }
        ],
        temperature: 0.7,
        max_tokens: Math.min(Math.max(parseInt(tokens, 10) || 300, 100), 1200)
      })
    });
    if (!r.ok) return res.json({ reply: null });
    const data = await r.json();
    const reply = data?.choices?.[0]?.message?.content;
    return res.json({ reply: reply || null });
  } catch (e) {
    return res.json({ reply: null });
  }
}

async function aynaHandler(req, res, jwt) {
  let user = null;
  try { user = await getUser(jwt); } catch (e) {
    console.error('[AYNA] auth service unavailable');
    return fail(res, 503, 'auth_unavailable');
  }
  if (!user) { console.error('[AYNA] 401'); return fail(res, 401, 'unauthorized'); }
  if (!canUseAyna(user)) { console.error('[AYNA] 403'); return fail(res, 403, 'not_allowed'); }
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const action = AYNA_ACTIONS[body.action];
  if (!action) return fail(res, 400, 'bad_request');
  const auth = { jwt };
  try {
    if (body.action === 'ping' || body.action === 'dedupe-chat' || body.action === 'ring-suggest') return await action({ req, res, auth, user, profile: null, body });
    const profiles = await db(auth, 'GET', `ayna_profiles?user_id=eq.${q(user.id)}&select=*`);
    if (!profiles.length) return fail(res, 409, 'no_profile');
    if (!(await underLimit(auth, user.id, body.action))) return fail(res, 429, 'daily_limit');
    return await action({ req, res, auth, user, profile: profiles[0], body });
  } catch (e) {
    return fail(res, 500, 'server_error', e.message);
  }
}

async function cronHandler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const isCron = url.searchParams.get('cron') === '1';
  const secret = process.env.CRON_SECRET || '';
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) return fail(res, 401, 'unauthorized');
  const force = url.searchParams.get('force');
  const onlyUser = url.searchParams.get('user');
  try {
    const result = await runDaily({ force: force === 'weekly' || force === 'monthly' ? force : null, onlyUser });
    return send(res, 200, { ok: true, ...result });
  } catch (e) {
    return fail(res, 500, 'server_error', e.message);
  }
}

// Influencer purchases share this function to stay within the Hobby function limit.
const INF_SUPABASE_URL = process.env.SUPABASE_URL || 'https://zvnjslmptwmnuhftgqsr.supabase.co';
const INF_PUB = process.env.SUPABASE_PUBLISHABLE || 'sb_publishable_bReG5UKaWcQkU0Z9GnGiJQ_0T4_Qm9X';
const INF_PACKAGES = { video: 'Video eğitim — 50 USDT', guided: 'Eğitim + bireysel soru-cevap — 90 USDT', growth: '1-1 büyüme desteği — 175 USDT' };
export const INF_PACKAGE_PRICES = { video: 50, guided: 90, growth: 175 };
let infFxCache = null;
async function influencerPrices() {
  let fx = infFxCache && Date.now() - infFxCache.at < 3600000 ? infFxCache.value : null;
  if (!fx) {
    try {
      const r = await fetch('https://api.frankfurter.dev/v1/latest?base=USD&symbols=TRY', { signal: AbortSignal.timeout(5000) });
      if (!r.ok) throw new Error('fx_unavailable');
      const body = await r.json();
      const age = Date.now() - Date.parse(body.date);
      if (body.base !== 'USD' || body.amount !== 1 || !Number.isFinite(body.rates?.TRY) ||
          body.rates.TRY <= 0 || !Number.isFinite(age) || age > 7 * 86400000 || age < -86400000) throw new Error('invalid_fx');
      fx = { usdTry: body.rates.TRY, date: body.date, source: 'Frankfurter / ECB' };
      infFxCache = { at: Date.now(), value: fx };
    } catch { /* Fixed USDT prices remain payable without an FX estimate. */ }
  }
  return { ok: true, prices: INF_PACKAGE_PRICES, currency: 'USDT', network: 'TRC20', fx };
}
// Kept inside the server function, never embedded in the public page.
const INF_OUTLINE = [
  ['1. Başlangıç ve konumlandırma', 'Hedef kitle; kripto, FX veya başka bir alanda uzmanlık seçimi; kişisel hikâye; 30 günlük hedefler.'],
  ['2. X profilini kurma', 'Kullanıcı adı, fotoğraf, kapak, biyografi; tanışma gönderisi ve sabitlenen içerik. X tek sabit gönderiye izin verir.'],
  ['3. Kaynak ve içerik okuryazarlığı', 'Kaynak doğrulama; veri/haber ayrımı; grafik anlatımı; telif ve kaynak gösterme; sponsorlu içerik açıklamaları.'],
  ['4. İçerik üretimi', 'Kısa gönderi, seri ve thread; güçlü giriş; görsel şablon; taslak geliştirme; AI çıktısını doğrulama.'],
  ['5. İçerik planı ve fikir sistemi', 'Üç içerik sütunu; haftalık takvim; haberden içerik çıkarma; fikir havuzu; tekrar kullanılabilir formatlar.'],
  ['6. İlk topluluğunu oluşturma', 'Nitelikli yanıtlar; sohbet başlatma; iş birlikleri; Spaces; spam ve botlardan kaçınma.'],
  ['7. Ölçüm ve gelişim', 'Gösterim, profil ziyareti, takip dönüşümü; haftalık değerlendirme; A/B format denemeleri.'],
  ['8. Güven ve sürdürülebilirlik', 'Hataları düzeltme; reklam şeffaflığı; güvenlik/2FA; dolandırıcılık önleme; tükenmeden üretim.'],
  ['Bireysel 4 soru-cevap görüşmesi', '1: Profil/hedefler. 2: İlk içerik geri bildirimi. 3: Etkileşim sorunları. 4: Sonuçlar ve sonraki plan.'],
  ['1-1 büyüme desteği', 'Başlangıç profil denetimi; haftalık görüşme; içerik geri bildirimi; kişisel fikirler. İlk 1000 takipçi veya 90 gün, hangisi önceyse. Takipçi/gelir garantisi yok.']
];

function influencerReply(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(JSON.stringify(body));
}
async function influencerDb(path, method = 'GET', body) {
  const key = process.env.SUPABASE_SERVICE_ROLE;
  if (!key) throw new Error('storage_unavailable');
  const headers = { apikey: key, 'Content-Type': 'application/json', Prefer: 'return=representation' };
  if (!key.startsWith('sb_secret_')) headers.Authorization = 'Bearer ' + key;
  const r = await fetch(INF_SUPABASE_URL + '/rest/v1/influencer_orders' + path, {
    method, headers, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000)
  });
  if (!r.ok) {
    if (r.status === 409) throw new Error('duplicate_txid');
    throw new Error('storage_unavailable');
  }
  return r.json();
}
export async function influencerHandler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return influencerReply(res, 405, { ok: false, error: 'method' });
  if (req.method === 'GET' && req.query?.op === 'prices') return influencerReply(res, 200, await influencerPrices());
  try {
    const token = /^Bearer (.+)$/i.exec(req.headers.authorization || '')?.[1];
    if (!token) return influencerReply(res, 401, { ok: false, error: 'login_required' });
    const auth = await fetch(INF_SUPABASE_URL + '/auth/v1/user', {
      headers: { apikey: INF_PUB, Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(8000)
    });
    if (!auth.ok) return influencerReply(res, 401, { ok: false, error: 'login_required' });
    const user = await auth.json();
    if (!user.id) return influencerReply(res, 401, { ok: false, error: 'login_required' });
    const configuredAdmins = [process.env.SITE_ADMIN_EMAILS, process.env.SITE_ADMIN_EMAIL, process.env.SITE_ADMIN_EMAILS_EXTRA].filter(Boolean).join(',');
    const admins = (configuredAdmins.includes('@') ? configuredAdmins : 'ahmetnuman20@gmail.com,fjortrades@gmail.com,fjortrading@gmail.com').split(',').map(s => s.trim().toLowerCase());
    const admin = admins.includes(String(user.email || '').toLowerCase());
    if (req.method === 'GET') {
      // No storage prerequisite for the admin's private outline.
      if (admin && req.query?.op === 'outline') return influencerReply(res, 200, { ok: true, outline: INF_OUTLINE });
      if (req.query?.op === 'outline' || req.query?.op === 'list') {
        if (!admin) return influencerReply(res, 403, { ok: false, error: 'admin_required' });
        return influencerReply(res, 200, { ok: true, orders: await influencerDb('?select=*&order=created_at.desc&limit=100') });
      }
      const orders = await influencerDb('?select=id,package,status,created_at&user_id=eq.' + encodeURIComponent(user.id) + '&order=created_at.desc&limit=100');
      return influencerReply(res, 200, { ok: true, unlocked: admin || orders.some(o => o.status === 'approved'), orders });
    }
    let body = req.body;
    if (typeof body === 'string') {
      if (body.length > 4096) return influencerReply(res, 413, { ok: false, error: 'body_too_large' });
      try { body = JSON.parse(body); } catch { return influencerReply(res, 400, { ok: false, error: 'invalid_body' }); }
    }
    body = body || {};
    if (['approve', 'reject'].includes(body.op)) {
      if (!admin) return influencerReply(res, 403, { ok: false, error: 'admin_required' });
      if (!/^[a-f0-9-]{36}$/i.test(body.id || '')) return influencerReply(res, 400, { ok: false, error: 'invalid_id' });
      const rows = await influencerDb('?id=eq.' + body.id + '&status=eq.pending', 'PATCH', {
        status: body.op === 'approve' ? 'approved' : 'rejected', reviewed_at: new Date().toISOString(), reviewed_by: user.id
      });
      return influencerReply(res, rows.length ? 200 : 409, { ok: !!rows.length });
    }
    if (body.op !== 'submit' || !Object.hasOwn(INF_PACKAGES, body.package) || !/^[a-f0-9]{64}$/i.test(body.txid || '')) {
      return influencerReply(res, 400, { ok: false, error: 'invalid_payment' });
    }
    const recent = await influencerDb('?select=id&user_id=eq.' + encodeURIComponent(user.id) + '&created_at=gte.' + encodeURIComponent(new Date(Date.now() - 3600000).toISOString()) + '&limit=3');
    if (recent.length >= 3) return influencerReply(res, 429, { ok: false, error: 'too_many_requests' });
    const [order] = await influencerDb('', 'POST', { user_id: user.id, email: user.email, package: body.package, txid: body.txid.toLowerCase() });
    let notified = false;
    try {
      const chat = adminNotifyChatId();
      // Never fall back to a group or mentorship topic.
      if (process.env.TG_BOT_TOKEN && /^\d+$/.test(chat)) {
        const sent = await sendTelegram([
          'Alfa Influencer ödeme bildirimi', INF_PACKAGES[order.package], 'Üye: ' + user.email,
          'TXID: ' + order.txid, 'Ödeme kullanıcı beyanıdır; henüz doğrulanmadı.',
          'USDT/TRC20, alıcı adresi ve tutarı zincirden kontrol et.',
          'Onay/red: https://alfa-trader.com/?page=influencer'
        ].join('\n'), chat, null);
        notified = !!sent.ok;
        if (notified) await influencerDb('?id=eq.' + order.id, 'PATCH', { notified_at: new Date().toISOString() });
      }
    } catch { /* Persisted request remains in the admin inbox. */ }
    return influencerReply(res, 200, { ok: true, status: 'pending', notified });
  } catch (e) {
    if (e.message === 'duplicate_txid') return influencerReply(res, 409, { ok: false, error: 'duplicate_txid' });
    return influencerReply(res, 503, { ok: false, error: 'storage_unavailable' });
  }
}
