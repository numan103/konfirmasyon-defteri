// ALFA TRADERS - mentorship yonlendirmesi
//
// Dogrulanan premium uye, Telegram mentorship grubuna bot tarafindan
// uretilen TEK KULLANIMLIK davet linki ile katilir. Boylece:
//   - link herkesle paylasilamaz (member_limit = 1)
//   - sure siniri vardir (varsayilan 7 gun)
//   - uye bazinda izlenebilir (davet adi exchange + UID)
//
// Gerekli ortam degiskenleri:
//   TG_BOT_TOKEN            - mevcut bot
//   TG_MENTORSHIP_CHAT_ID   - mentorship grubunun chat id'si (-100...)
//
// Bot, grupta YONETICI olmali ve "davet linki olusturma" yetkisi bulunmali.
// Anahtarlar yoksa sistem cokmez: davet uretilmez, site "hazir degil" der.

const API_BASE = 'https://api.telegram.org/bot';
const DEFAULT_TTL_DAYS = 7;
const TIMEOUT_MS = 8000;

export function mentorshipConfig() {
  const token = (process.env.TG_BOT_TOKEN || '').trim();
  const chatId = (process.env.TG_MENTORSHIP_CHAT_ID || '').trim();
  return { token, chatId, ok: !!(token && chatId) };
}

export function mentorshipConfigured() {
  return mentorshipConfig().ok;
}

async function callTelegram(method, payload) {
  const cfg = mentorshipConfig();
  if (!cfg.ok) return { ok: false, error: 'not_configured' };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(API_BASE + cfg.token + '/' + method, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json || !json.ok) {
      return { ok: false, error: (json && json.description) || ('HTTP ' + res.status) };
    }
    return { ok: true, result: json.result || {} };
  } catch (e) {
    return { ok: false, error: e && e.name === 'AbortError' ? 'timeout' : 'network' };
  } finally {
    clearTimeout(t);
  }
}

// Tek kullanimlik davet linki uretir. Donus:
//   { ok:true, link, expires_at, name }
//   { ok:false, reason, detail }
export async function createMentorshipInvite(opts = {}) {
  const cfg = mentorshipConfig();
  if (!cfg.ok) return { ok: false, reason: 'not_configured' };

  const ttlDays = Number(opts.ttlDays) > 0 ? Number(opts.ttlDays) : DEFAULT_TTL_DAYS;
  const expireDate = Math.floor(Date.now() / 1000) + Math.round(ttlDays * 86400);
  // Telegram davet adi en fazla 32 karakter.
  const name = String(opts.name || 'alfa-premium').slice(0, 32);

  const out = await callTelegram('createChatInviteLink', {
    chat_id: cfg.chatId,
    name,
    member_limit: 1,
    expire_date: expireDate
  });
  if (!out.ok) return { ok: false, reason: 'telegram_error', detail: out.error };

  const link = out.result.invite_link;
  if (!link) return { ok: false, reason: 'telegram_error', detail: 'no_invite_link' };

  return {
    ok: true,
    link,
    name: out.result.name || name,
    expires_at: new Date(expireDate * 1000).toISOString()
  };
}

// Eski/bitmis linki iptal eder. Best-effort: hata olsa da akis durmaz.
export async function revokeMentorshipInvite(link) {
  if (!link) return { ok: false, reason: 'no_link' };
  if (!mentorshipConfigured()) return { ok: false, reason: 'not_configured' };
  const out = await callTelegram('revokeChatInviteLink', {
    chat_id: mentorshipConfig().chatId,
    invite_link: String(link)
  });
  return out.ok ? { ok: true } : { ok: false, reason: 'telegram_error', detail: out.error };
}

// Link hala kullanilabilir mi? Telefonda 60 sn pay birakiyoruz.
export function inviteIsLive(link, expiresAt, now = Date.now()) {
  if (!link) return false;
  if (!expiresAt) return true;
  const t = Date.parse(expiresAt);
  if (!Number.isFinite(t)) return true;
  return t - now > 60000;
}
