// Alfa Traders Public → Duyurular konusu (https://t.me/alfatraderspublic/1).
// Bu konuya yazılan mesajlara bot cevap vermez; yalnızca yeni üye karşılama
// servis mesajı için webhook'ta dar bir istisna yapılır.
export const DUYURU_THREAD = 1;
export const DUYURULAR_LINKI = 'https://t.me/alfatraderspublic/1';
const DUYURU_CHAT_USERNAME = 'alfatraderspublic';

export function isAnnouncementChat(chat) {
  if (!chat || chat.type === 'private') return false;
  const configured = String(process.env.DUYURU_CHAT_ID || '').trim();
  return String(chat.username || '').toLowerCase() === DUYURU_CHAT_USERNAME ||
    (!!configured && String(chat.id) === configured);
}

// Karşılama yalnızca gerçek grup/supergroup hedefinde çalışır; kanal
// gönderileri Duyurular sessizliği kapsamında kalır.
export function isAnnouncementGroupChat(chat) {
  return !!chat && (chat.type === 'group' || chat.type === 'supergroup') && isAnnouncementChat(chat);
}

export function isAnnouncementMessage(msg) {
  if (!msg || msg.chat?.type === 'private') return false;
  if (Number(msg.message_thread_id) === DUYURU_THREAD) return true;
  // Kanal gönderilerinde thread id olmayabilir; kanalı da sessize al.
  return isAnnouncementChat(msg.chat) && !msg.message_thread_id;
}

export function isAnnouncementUpdate(update) {
  if (!update) return false;
  return [update.message, update.edited_message, update.channel_post, update.edited_channel_post, update.callback_query?.message]
    .some(isAnnouncementMessage);
}
