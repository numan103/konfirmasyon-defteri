// Telegram webhook adresi tek yerden üretilir. Cloudflare Pages dağıtımında
// PUBLIC_SITE_URL ayarlanırsa o alan adı kullanılır; ayarlı değilse üretim
// alan adıdır. http, port, kullanıcı bilgisi ve geçersiz URL fail-closed olur.
const FALLBACK = 'https://alfa-trader.com/api/ai?telegram-webhook=1';

export function telegramWebhookUrl() {
  const raw = String(process.env.PUBLIC_SITE_URL || process.env.SITE_URL || '').trim();
  if (!raw) return FALLBACK;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' || u.username || u.password || u.port) return FALLBACK;
    return u.origin.replace(/\/+$/, '') + '/api/ai?telegram-webhook=1';
  } catch { return FALLBACK; }
}

export function isTelegramWebhookUrl(value) {
  return String(value || '') === telegramWebhookUrl();
}
