// Alfa Traders Public → Duyurular konusu (https://t.me/alfatraderspublic/1).
// Bu konuya yazılan mesajlara bot hiçbir koşulda cevap vermez.
export const DUYURU_THREAD = 1;
const DUYURU_CHAT_USERNAME = 'alfatraderspublic';

function isAnnouncementChat(msg) {
  const chat = msg?.chat;
  if (!chat || chat.type === 'private') return false;
  const configured = String(process.env.DUYURU_CHAT_ID || '').trim();
  return String(chat.username || '').toLowerCase() === DUYURU_CHAT_USERNAME ||
    (!!configured && String(chat.id) === configured);
}

export function isAnnouncementMessage(msg) {
  if (!msg || msg.chat?.type === 'private') return false;
  if (Number(msg.message_thread_id) === DUYURU_THREAD) return true;
  // Kanal gönderilerinde thread id olmayabilir; kanalı da sessize al.
  return isAnnouncementChat(msg) && !msg.message_thread_id;
}

export function isAnnouncementUpdate(update) {
  if (!update) return false;
  return [update.message, update.edited_message, update.channel_post, update.edited_channel_post, update.callback_query?.message]
    .some(isAnnouncementMessage);
}
