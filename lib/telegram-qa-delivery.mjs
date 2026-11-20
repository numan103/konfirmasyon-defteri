import { sendTelegram } from './telegram.mjs';

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
  for (const chunk of splitQaReply(result.reply)) {
    await sendTelegram(chunk, String(result.chatId), result.threadId || null, null,
      { preview: false, timeout: 30000 });
  }
}
