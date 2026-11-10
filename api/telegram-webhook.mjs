// Telegram webhook endpoint.
// Telegram, mesaj geldiğinde bu endpoint'i çağırır.
import { handleTelegramUpdate } from '../lib/telegram-qa.mjs';
import { sendTelegram } from '../lib/telegram.mjs';

export default async function telegramWebhook(req, res) {
  // Secret token doğrulama (Telegram webhook secret_token)
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret) {
    const header = req.headers?.['x-telegram-bot-api-secret-token'];
    if (header !== secret) return res.status(403).json({ error: 'forbidden' });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const update = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  if (!update) return res.status(400).json({ error: 'invalid_update' });

  // Yanıtı hemen döndür (Telegram 5s timeout)
  res.status(200).json({ ok: true });

  // Async işle (fire-and-forget)
  try {
    const result = await handleTelegramUpdate(update);
    if (result && result.chatId && result.reply) {
      await sendTelegram(result.reply, String(result.chatId), result.threadId || null, null, { preview: false });
    }
  } catch (e) {
    console.error('telegram-qa error:', e?.message || e);
  }
}
