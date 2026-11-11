// Telegram webhook endpoint + setup.
// POST: Telegram sends updates here.
// GET ?action=info|delete|set: admin webhook management.
import { handleTelegramUpdate } from './telegram-qa.mjs';
import { sendTelegram } from './telegram.mjs';
import { requestUser } from './auth.mjs';

const WEBHOOK_URL = 'https://alfa-trader.com/api/ai?telegram-webhook=1';

export default async function telegramWebhook(req, res) {
  // Admin setup actions (GET)
  if (req.method === 'GET') {
    const user = await requestUser(req);
    if (!user?.admin) return res.status(user ? 403 : 401).json({ error: user ? 'admin_required' : 'unauthorized' });

    const token = (process.env.TG_BOT_TOKEN || '').trim();
    if (!token) return res.status(503).json({ error: 'telegram_not_configured' });

    const secret = (process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();
    const action = req.query?.action;

    if (action === 'info') {
      const r = await fetch('https://api.telegram.org/bot' + token + '/getWebhookInfo');
      const d = await r.json();
      return res.status(200).json(d);
    }
    if (action === 'botinfo') {
      const r = await fetch('https://api.telegram.org/bot' + token + '/getMe');
      const d = await r.json();
      return res.status(200).json(d);
    }
    if (action === 'testsend') {
      const chatId = req.query?.chatId || req.body?.chatId;
      if (!chatId) return res.status(400).json({ error: 'chatId required' });
      const r = await sendTelegram('Test mesajı from bot', String(chatId), null, null, { preview: false, timeout: 20000 });
      return res.status(200).json(r);
    }
    if (action === 'delete') {
      const r = await fetch('https://api.telegram.org/bot' + token + '/deleteWebhook', { method: 'POST' });
      const d = await r.json();
      return res.status(200).json(d);
    }
    // Default: set webhook
    const r = await fetch('https://api.telegram.org/bot' + token + '/setWebhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: WEBHOOK_URL,
        secret_token: secret || undefined,
        allowed_updates: ['message'],
        drop_pending_updates: true,
      }),
    });
    const d = await r.json();
    return res.status(r.ok ? 200 : 502).json(d);
  }

  // Telegram webhook verification
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret) {
    const header = req.headers?.['x-telegram-bot-api-secret-token'];
    if (header !== secret) return res.status(403).json({ error: 'forbidden' });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const update = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  if (!update) return res.status(400).json({ error: 'invalid_update' });

  const msg = update?.message || update?.edited_message;
  const text = msg?.text?.trim() || '';
  const chatId = msg?.chat?.id;
  const threadId = msg?.message_thread_id || null;
  const allowedChat = process.env.TG_QA_CHAT_ID || process.env.TG_CHAT_ID;
  const allowedThread = process.env.TG_QA_THREAD;

  // Basit komutlar: senkron isle ve cevap gonder, sonra 200 don
  if (text === '/start' || text === '/help') {
    try {
      const result = await handleTelegramUpdate(update);
      console.log('telegram-qa sync result:', JSON.stringify(result)?.slice(0, 200));
      if (result && result.chatId && result.reply) {
        const sendResult = await sendTelegram(result.reply, String(result.chatId), result.threadId || null, null, { preview: false, timeout: 20000 });
        console.log('telegram-qa sync send result:', JSON.stringify(sendResult).slice(0, 200));
      }
    } catch (e) {
      console.error('telegram-qa sync error:', e?.stack || e?.message || e);
    }
    return res.status(200).json({ ok: true });
  }

  // /data komutu: senkron isle (10-15s, Telegram 5s timeout'u asabilir ama deneyelim)
  if (text === '/data') {
    try {
      const result = await handleTelegramUpdate(update);
      if (result && result.chatId && result.reply) {
        await sendTelegram(result.reply, String(result.chatId), result.threadId || null, null, { preview: false, timeout: 15000 });
      }
    } catch (e) {
      console.error('telegram-qa data error:', e?.stack || e?.message || e);
    }
    return res.status(200).json({ ok: true });
  }

  // /ask komutu: senkron işle
  if (text.startsWith('/ask ')) {
    try {
      const result = await handleTelegramUpdate(update);
      if (result && result.chatId && result.reply) {
        await sendTelegram(result.reply, String(result.chatId), result.threadId || null, null, { preview: false, timeout: 30000 });
      }
    } catch (e) {
      console.error('telegram-qa ask error:', e?.stack || e?.message || e);
    }
    return res.status(200).json({ ok: true });
  }

  // Q&A topic veya DM: senkron işle
  const isQaTopic = allowedChat && String(chatId) === String(allowedChat) &&
    (!allowedThread || !threadId || String(threadId) === String(allowedThread));
  const isPrivate = msg.chat?.type === 'private';
  const isMention = text.includes('@alfaportfoy_bot');

  if (isQaTopic || isPrivate || isMention) {
    try {
      const result = await handleTelegramUpdate(update);
      console.log('telegram-qa question result:', JSON.stringify(result)?.slice(0, 200));
      if (result && result.chatId && result.reply) {
        const sendResult = await sendTelegram(result.reply, String(result.chatId), result.threadId || null, null, { preview: false, timeout: 30000 });
        console.log('telegram-qa question send result:', JSON.stringify(sendResult).slice(0, 200));
      }
    } catch (e) {
      console.error('telegram-qa question error:', e?.stack || e?.message || e);
    }
    return res.status(200).json({ ok: true });
  }

  // Diğer mesajlar: sessiz kal
  return res.status(200).json({ ok: true });
}
