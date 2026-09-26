import { send, fail } from '../ayna-server/http.mjs';
import { getUser, db, q } from '../ayna-server/supabase.mjs';
import { underLimit } from '../ayna-server/limits.mjs';
import runDaily from '../ayna-server/jobs/daily.mjs';
import ping from '../ayna-server/actions/ping.mjs';
import scribe from '../ayna-server/actions/scribe.mjs';
import reflect from '../ayna-server/actions/reflect.mjs';
import coach from '../ayna-server/actions/coach.mjs';
import onboardingSummary from '../ayna-server/actions/onboarding-summary.mjs';
import sync from '../ayna-server/actions/sync.mjs';

const AYNA_ACTIONS = { ping, scribe, reflect, coach, 'onboarding-summary': onboardingSummary, sync };

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
  try { user = await getUser(jwt); } catch (e) { console.error('[AYNA] 401', e.message); user = null; }
  if (!user) { console.error('[AYNA] 401', jwt.slice(0, 8)); return fail(res, 401, 'unauthorized'); }
  const allowed = (process.env.AYNA_ALLOWED_USER_IDS || '').split(',').map((sx) => sx.trim()).filter(Boolean);
  if (!allowed.includes(user.id)) { console.error('[AYNA] 403'); return fail(res, 403, 'not_allowed'); }
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const action = AYNA_ACTIONS[body.action];
  if (!action) return fail(res, 400, 'bad_request');
  const auth = { jwt };
  try {
    if (body.action === 'ping') return await action({ req, res, auth, user, profile: null, body });
    const profiles = await db(auth, 'GET', `ayna_profiles?user_id=eq.${q(user.id)}&select=*`);
    if (!profiles.length) return fail(res, 409, 'no_profile');
    if (!(await underLimit(auth, user.id, body.action))) return fail(res, 429, 'daily_limit');
    return await action({ req, res, auth, user, profile: profiles[0], body });
  } catch (e) {
    console.error('[AYNA] HANDLER_DEBUG', body.action, e && e.message);
    return fail(res, 500, 'server_error', (body.action || '?') + ' | ' + (e && e.message));
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
