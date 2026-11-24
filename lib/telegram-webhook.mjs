// Telegram webhook endpoint + setup.
// POST: Telegram sends updates here.
// GET ?action=info|delete|set: admin webhook management.
import { handleTelegramUpdate } from './telegram-qa.mjs';
import { deliverQaReply } from './telegram-qa-delivery.mjs';
import { sendTelegram } from './telegram.mjs';
import { isAnnouncementUpdate } from './telegram-topics.mjs';
import { handleJoinWelcome, isJoinServiceMessage } from './telegram-join-welcome.mjs';
import { requestUser } from './auth.mjs';
import { mentorshipConfig } from './mentorship.mjs';
import { ingestMentorUpdate } from './mentorship-trades.mjs';
import { ingestMagazineUpdate, isMagazineUpdate } from './magazine-ingest.mjs';
import { ingestEduTelegramUpdate, isEduTelegramUpdate } from './edu-telegram-inbox.mjs';
import { telegramWebhookUrl } from './telegram-webhook-url.mjs';
import { wasProcessed, markProcessed } from './telegram-update-dedupe.mjs';
import {
  handlePrivateOnboarding,
  handleOnboardingCallback,
  handleBotChatMember,
  handleChatMember,
  handleChatIdCommand
} from './telegram-onboarding.mjs';

async function processTelegramUpdate(req, res) {
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
      const expectedUrl = telegramWebhookUrl();
      return res.status(200).json({ ...d, expectedUrl, urlMatches: d?.result?.url === expectedUrl, secretConfigured: !!secret });
    }
    if (action === 'botinfo') {
      const r = await fetch('https://api.telegram.org/bot' + token + '/getMe');
      const d = await r.json();
      return res.status(200).json(d);
    }
    // Mentorluk grubu kurulumunu dogrula: bot grupta mi, davet linki yetkisi var mi?
    if (action === 'mentorinfo') {
      const cfg = mentorshipConfig();
      if (!cfg.ok) {
        return res.status(200).json({
          ok: false,
          configured: false,
          botToken: !!cfg.token,
          mentorshipChatId: !!cfg.chatId
        });
      }
      const tg = (method, payload) => fetch('https://api.telegram.org/bot' + cfg.token + '/' + method, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || {})
      }).then((r) => r.json()).catch(() => null);

      const [chat, me] = await Promise.all([
        tg('getChat', { chat_id: cfg.chatId }),
        tg('getMe')
      ]);
      if (!chat || !chat.ok) {
        return res.status(200).json({
          ok: false,
          configured: true,
          error: 'chat_unavailable',
          detail: chat && chat.description ? chat.description : 'getChat failed'
        });
      }
      const botId = me && me.ok && me.result ? me.result.id : null;
      const member = botId
        ? await tg('getChatMember', { chat_id: cfg.chatId, user_id: botId })
        : null;
      const m = member && member.ok ? member.result : null;
      return res.status(200).json({
        ok: true,
        configured: true,
        chat: {
          id: chat.result.id,
          title: chat.result.title || '',
          type: chat.result.type,
          username: chat.result.username || null,
          invite_link: chat.result.invite_link || null,
          join_by_request: chat.result.join_by_request === true
        },
        bot: {
          id: botId,
          status: m ? m.status : null,
          can_invite_users: m && m.can_invite_users === true,
          can_restrict_members: m && m.can_restrict_members === true,
          is_admin: m ? (m.status === 'administrator' || m.status === 'creator') : false
        }
      });
    }
    // Onaysiz uyeyi gruptan cikar (ban). Admin onayi sonrasi bot otomatik unban eder.
    if (action === 'kick') {
      const userId = req.query?.userId;
      if (!userId) return res.status(400).json({ error: 'userId required' });
      const cfg = mentorshipConfig();
      if (!cfg.ok) return res.status(503).json({ error: 'mentorship_not_configured' });
      const tg = (method, payload) => fetch('https://api.telegram.org/bot' + cfg.token + '/' + method, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || {})
      }).then((r) => r.json()).catch(() => null);
      const banned = await tg('banChatMember', { chat_id: cfg.chatId, user_id: Number(userId), revoke_messages: false });
      return res.status(200).json({ ok: !!(banned && banned.ok), banned });
    }
    if (action === 'unban') {
      const userId = req.query?.userId;
      if (!userId) return res.status(400).json({ error: 'userId required' });
      const cfg = mentorshipConfig();
      if (!cfg.ok) return res.status(503).json({ error: 'mentorship_not_configured' });
      const tg = (method, payload) => fetch('https://api.telegram.org/bot' + cfg.token + '/' + method, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || {})
      }).then((r) => r.json()).catch(() => null);
      const unbanned = await tg('unbanChatMember', { chat_id: cfg.chatId, user_id: Number(userId), only_if_banned: true });
      return res.status(200).json({ ok: !!(unbanned && unbanned.ok), unbanned });
    }
    if (action === 'chatmember') {
      const userId = req.query?.userId;
      if (!userId) return res.status(400).json({ error: 'userId required' });
      const cfg = mentorshipConfig();
      if (!cfg.ok) return res.status(503).json({ error: 'mentorship_not_configured' });
      const r = await fetch('https://api.telegram.org/bot' + cfg.token + '/getChatMember', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: cfg.chatId, user_id: Number(userId) })
      });
      const d = await r.json().catch(() => null);
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
        url: telegramWebhookUrl(),
        secret_token: secret || undefined,
        allowed_updates: ['message', 'edited_message', 'callback_query', 'my_chat_member', 'chat_member'],
        drop_pending_updates: false,
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
  // Durable dedupe runs before every ingestion branch. A redelivered update
  // must not re-run onboarding, QA or notification side effects after a cold start.
  const updateId = Number.isSafeInteger(update.update_id) ? update.update_id : null;
  if (await wasProcessed(updateId)) return res.status(200).json({ ok: true, skipped: 'duplicate' });
  // Duyurular sessizliğinin tek istisnası: gerçek yeni üye servis mesajı.
  // Diğer tüm update türleri aşağıdaki guard'da durur.
  if (isJoinServiceMessage(update.message)) {
    try {
      await handleJoinWelcome(update);
    } catch (e) {
      console.error('telegram-join-welcome:', e?.stack || e?.message || e);
    }
    return res.status(200).json({ ok: true });
  }
  // Duyurular konusu/kanalı: tüm update türleri burada durur; ingestion, dedupe
  // ve QA katmanlarına hiç girilmez. Komut, mention, fotoğraf, edit fark etmez.
  if (isAnnouncementUpdate(update)) return res.status(200).json({ ok: true, skipped: 'announcements' });
  // The selected source publishes directly to public Daily Notes, never paid lessons.
  // Durable idempotent writes run before process-local QA deduplication.
  if (secret && isEduTelegramUpdate(update)) {
    try {
      const edu = await ingestEduTelegramUpdate(update);
      if (edu.handled) return res.status(200).json({ ok: true, eduInbox: edu.count });
    } catch { return res.status(503).json({ ok: false, error: 'edu_inbox_retry' }); }
  }

  // AlfaNews: haberler + Trader Ahmet teknik analiz paylaşımları (tek akış, kategori rozetli).
  // CAS yazımı başarısız olursa yalnızca dergi kaynağıysa 503 döner, Telegram tekrar dener.
  let magazine = { handled: false, count: 0 };
  try {
    magazine = await ingestMagazineUpdate(update);
  } catch (e) {
    console.error('magazine ingest:', e?.stack || e?.message || e);
    if (isMagazineUpdate(update)) return res.status(503).json({ ok: false, error: 'magazine_retry' });
  }

  // Durable/CAS ingestion runs before the response is marked as processed, so
  // a failed database write is retried by Telegram, not silently acknowledged.
  try {
    const imported = await ingestMentorUpdate(update);
    if (imported.handled) return res.status(200).json({ ok: true, mentorTrades: imported.count, magazine: magazine.count });
  } catch {
    return res.status(503).json({ ok: false, error: 'mentor_trade_retry' });
  }

  // Premium dogrulama: inline butonlar (borsa secimi, onay, iptal, yonetici karari)
  if (update.callback_query) {
    try {
      await handleOnboardingCallback(update.callback_query);
    } catch (e) {
      console.error('telegram-onboarding callback:', e?.stack || e?.message || e);
    }
    return res.status(200).json({ ok: true });
  }

  // Bot bir gruba eklendi/cikarildi: yoneticiye chat id bildir
  if (update.my_chat_member) {
    try {
      await handleBotChatMember(update);
    } catch (e) {
      console.error('telegram-onboarding membership:', e?.stack || e?.message || e);
    }
    return res.status(200).json({ ok: true });
  }

  // chat_member: Duyurular grubunda gerçek katılım ise karşıla; mentorship
  // kaydı/iban koruması ayrı ve bağımsız çalışmaya devam etsin.
  if (update.chat_member) {
    try {
      await handleJoinWelcome(update);
    } catch (e) {
      console.error('telegram-join-welcome chat_member:', e?.stack || e?.message || e);
    }
    try {
      await handleChatMember(update);
    } catch (e) {
      console.error('telegram-onboarding chat_member:', e?.stack || e?.message || e);
    }
    return res.status(200).json({ ok: true });
  }

  const msg = update?.message || update?.edited_message;
  const text = msg?.text?.trim() || '';
  const chatId = msg?.chat?.id;
  const threadId = msg?.message_thread_id || null;

  const allowedChat = process.env.TG_QA_CHAT_ID || process.env.TG_CHAT_ID;
  const allowedThread = process.env.TG_QA_THREAD;

  // /grupid veya /chatid: yonetici chat id'yi ogrensin
  try {
    if (await handleChatIdCommand(msg)) return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('telegram chatid:', e?.message || e);
  }

  // DM: once premium dogrulama akisi, taninmayan mesajlar Q&A'ya devreder
  if (msg?.chat?.type === 'private') {
    try {
      if (await handlePrivateOnboarding(update)) return res.status(200).json({ ok: true });
    } catch (e) {
      console.error('telegram-onboarding dm:', e?.stack || e?.message || e);
      return res.status(200).json({ ok: true });
    }
  }

  // Basit komutlar: senkron isle ve cevap gonder, sonra 200 don
  if (text === '/start' || text === '/help') {
    try {
      const result = await handleTelegramUpdate(update);
      if (result && result.chatId && result.reply) {
        await sendTelegram(result.reply, String(result.chatId), result.threadId || null, null, { preview: false, timeout: 20000 });
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
        await deliverQaReply(result);
      }
    } catch (e) {
      console.error('telegram-qa ask error:', e?.stack || e?.message || e);
    }
    return res.status(200).json({ ok: true });
  }

  // Q&A topic veya DM: senkron işle
  const isQaTopic = allowedChat && String(chatId) === String(allowedChat) &&
    (!allowedThread || !threadId || String(threadId) === String(allowedThread));
  const isPrivate = msg?.chat?.type === 'private';
  const isMention = text.includes('@alfaportfoy_bot');

  if (isQaTopic || isPrivate || isMention) {
    try {
      const result = await handleTelegramUpdate(update);
      if (result && result.chatId && result.reply) {
        await deliverQaReply(result);
      }
    } catch (e) {
      console.error('telegram-qa question error:', e?.stack || e?.message || e);
    }
    return res.status(200).json({ ok: true });
  }

  // Diğer mesajlar: sessiz kal
  return res.status(200).json({ ok: true });
}

// Başarılı yanıtın sonunda update_id'yi kalıcı olarak işaretlemek için
// yanıtı bir tur bekletiriz. 503/403 gibi retry yanıtları işaretlenmez;
// Telegram tekrar denediğinde işlem yeniden çalışır.
function deferredResponse() {
  let status = 200, payload = undefined, finished = false;
  const api = {
    statusCode: 200,
    code: 200,
    status(value) { this.statusCode = value; this.code = value; status = value; return this; },
    setHeader() { return this; },
    getHeader() { return undefined; },
    writeHead(value) { return this.status(value); },
    json(value) { payload = value; finished = true; return this; },
    send(value) { payload = value; finished = true; return this; },
    end(value) {
      if (typeof value === 'string') { try { payload = JSON.parse(value); } catch { payload = value; } }
      finished = true; return this;
    },
  };
  return { api, snapshot: () => ({ status, payload, finished }) };
}

function requestUpdateId(req) {
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { return null; } }
  return Number.isSafeInteger(body?.update_id) ? body.update_id : null;
}

export default async function telegramWebhook(req, res) {
  if (req.method !== 'POST') return processTelegramUpdate(req, res);
  const updateId = requestUpdateId(req);
  if (!updateId) return processTelegramUpdate(req, res);
  const deferred = deferredResponse();
  await processTelegramUpdate(req, deferred.api);
  const out = deferred.snapshot();
  if (out.status >= 200 && out.status < 300) await markProcessed(updateId);
  res.statusCode = out.status;
  if (res.code !== undefined) res.code = out.status;
  return res.status(out.status).json(out.finished ? out.payload : { ok: true });
}
