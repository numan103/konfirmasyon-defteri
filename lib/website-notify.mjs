// Website bildirimlerinin ortak hedefi.
// Kullanıcı yönergesi (21 Kasım 2026): yeni özellik, orderbook, coinalyze ve
// Alfa Makro bildirimleri https://t.me/alfatraderspublic/434 konusuna gider.
// Public charts (/4) trade bildirimlerinin konusudur; TG_THREAD'e dokunulmaz.
export const WEBSITE_NOTIFY_THREAD = 434;

export function websiteNotifyTarget() {
  const chat = String(process.env.WEBSITE_NOTIFY_CHAT_ID || process.env.TG_CHAT_ID || '').trim();
  const raw = process.env.WEBSITE_NOTIFY_THREAD ?? String(WEBSITE_NOTIFY_THREAD);
  const value = String(raw).trim();
  const n = value === '' || value === '0' ? null : Number(value);
  const thread = Number.isSafeInteger(n) && n > 0 ? n : null;
  return {
    chat,
    thread,
    ready: !!String(process.env.TG_BOT_TOKEN || '').trim() && !!chat,
  };
}
