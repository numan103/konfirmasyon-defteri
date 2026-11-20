import { sendTelegram, sendTelegramPhoto } from './telegram.mjs';

export function splitQaReply(text, limit = 3500) {
  const chunks = [];
  let current = '';
  for (const word of String(text).match(/\S+\s*/gu) || []) {
    if (word.length > limit) throw new Error('qa_token_too_long');
    if (current.length + word.length > limit) {
      chunks.push(current.trimEnd()); current = '';
    }
    current += word;
  }
  if (current.trim()) chunks.push(current.trimEnd());
  return chunks;
}
export async function deliverQaReply(result) {
  if (!result?.chatId || !result.reply) return;
  if (result.photo && Buffer.isBuffer(result.photo)) {
    const caption = result.reply.length <= 1000 ? result.reply : '';
    try {
      const sent = await sendTelegramPhoto(result.photo, caption, String(result.chatId), result.threadId || null,
        { filename: 'alfa-bias.png' });
      if (sent.ok === true) {
        if (caption) return; // Short opinion travels with the chart, not twice.
      } else result = { ...result, reply: result.reply + '\n\nGrafik gönderilemedi; yorum metnini paylaşıyorum.' };
    } catch {
      result = { ...result, reply: result.reply + '\n\nGrafik gönderilemedi; yorum metnini paylaşıyorum.' };
    }
  }
  for (const chunk of splitQaReply(result.reply)) {
    await sendTelegram(chunk, String(result.chatId), result.threadId || null, null,
      { preview: false, timeout: 30000 });
  }
}
