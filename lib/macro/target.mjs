import { hash } from './core.mjs';
import { telegramChat } from '../telegram.mjs';

export async function macroTarget(signal) {
  const targets = [process.env.TG_CHAT_ID && 'public', process.env.TG_PREMIUM_CHAT_ID && 'premium'].filter(Boolean);
  const selected = process.env.MACRO_TARGET || (targets.length === 1 ? targets[0] : '');
  if (!selected || !targets.includes(selected)) throw new Error(targets.length > 1 ? 'macro_target_ambiguous' : 'macro_target_missing');
  if (!process.env.TG_BOT_TOKEN) throw new Error('missing_TG_BOT_TOKEN');
  const id = String(selected === 'premium' ? process.env.TG_PREMIUM_CHAT_ID : process.env.TG_CHAT_ID).trim();
  const rawThread = process.env.MACRO_TARGET_THREAD ?? (selected === 'premium' ? process.env.TG_PREMIUM_THREAD : process.env.TG_THREAD);
  const thread = rawThread && rawThread !== '0' ? Number(rawThread) : null;
  if (thread !== null && (!Number.isSafeInteger(thread) || thread <= 0)) throw new Error('macro_thread_invalid');
  const chat = await telegramChat(id, signal);
  const targetHash = hash([String(chat.id), thread, chat.type, chat.title || chat.first_name, chat.username || null]);
  const canUseThread = !thread || (chat.type === 'supergroup' && chat.is_forum) || (chat.type === 'private' && chat.is_forum);
  return {
    chatId: String(chat.id), threadId: thread,
    public: { slot: selected, name: chat.title || chat.first_name || 'Telegram', type: chat.type, username: chat.username || null, hasThread: !!thread, targetHash, warning: canUseThread ? null : 'macro_thread_not_supported' },
  };
}
