// Telegram webhook endpoint + setup.
// POST: Telegram sends updates here.
// GET ?action=info|delete|set: admin webhook management.
import { handleTelegramUpdate } from '../lib/telegram-qa.mjs';
import { sendTelegram } from '../lib/telegram.mjs';
import { requestUser } from '../lib/auth.mjs';

const WEBHOOK_URL = 'https://alfa-trader.com/api/telegram-webhook';

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

  res.status(200).json({ ok: true });

  try {
    const result = await handleTelegramUpdate(update);
    if (result && result.chatId && result.reply) {
      await sendTelegram(result.reply, String(result.chatId), result.threadId || null, null, { preview: false });
    }
  } catch (e) {
    console.error('telegram-qa error:', e?.message || e);
  }
}
