// Telegram webhook kayit/kaldirma endpoint'i (admin only).
import { requestUser } from '../lib/auth.mjs';

const WEBHOOK_URL = 'https://alfa-trader.com/api/telegram-webhook';

export default async function telegramWebhookSetup(req, res) {
  const user = await requestUser(req);
  if (!user?.admin) return res.status(user ? 403 : 401).json({ error: user ? 'admin_required' : 'unauthorized' });

  const token = (process.env.TG_BOT_TOKEN || '').trim();
  if (!token) return res.status(503).json({ error: 'telegram_not_configured' });

  const secret = (process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();
  const action = req.query?.action || (req.body?.action);

  if (action === 'info') {
    const r = await fetch('https://api.telegram.org/bot' + token + '/getWebhookInfo');
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
