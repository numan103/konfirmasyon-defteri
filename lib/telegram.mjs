// Shared by the existing portfolio notifications and Alfa Makro Analist.
// No webhook/polling changes, new bot, automatic retries or paid broadcasts.
export async function sendTelegram(text, chatId = (process.env.TG_CHAT_ID || '').trim(), threadId = process.env.TG_THREAD ? Number(process.env.TG_THREAD) : null, replyMarkup = null, options = {}) {
  const payload = { chat_id: chatId, text, disable_web_page_preview: options.preview !== true };
  if (threadId) payload.message_thread_id = threadId;
  if (replyMarkup) payload.reply_markup = replyMarkup;
  if (Array.isArray(options.entities) && options.entities.length) payload.entities = options.entities;
  const res = await fetch('https://api.telegram.org/bot' + (process.env.TG_BOT_TOKEN || '').trim() + '/sendMessage', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000),
  });
  let out = {};
  try { out = await res.json(); } catch { /* A missing acknowledgement is NOT success. */ }
  return { http: res.status, ...out };
}

export async function sendTelegramPhoto(buffer, caption = '', chatId = (process.env.TG_CHAT_ID || '').trim(), threadId = process.env.TG_THREAD ? Number(process.env.TG_THREAD) : null, options = {}) {
  const token = (process.env.TG_BOT_TOKEN || '').trim();
  const form = new FormData();
  form.append('chat_id', String(chatId));
  if (threadId) form.append('message_thread_id', String(threadId));
  form.append('photo', new Blob([buffer], { type: 'image/png' }), 'coinalyze.png');
  if (caption) form.append('caption', String(caption));
  form.append('disable_web_page_preview', 'true');
  const res = await fetch('https://api.telegram.org/bot' + token + '/sendPhoto', {
    method: 'POST', body: form,
    signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
  });
  let out = {};
  try { out = await res.json(); } catch { /* missing ack is not success */ }
  return { http: res.status, ...out };
}
export async function telegramChat(chatId, signal) {
  const res = await fetch('https://api.telegram.org/bot' + (process.env.TG_BOT_TOKEN || '').trim() + '/getChat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId }),
    signal: signal || AbortSignal.timeout(6000),
  });
  const out = await res.json().catch(() => null);
  if (!res.ok || !out?.ok || !out.result?.id) throw new Error('telegram_target_unavailable');
  return out.result;
}
