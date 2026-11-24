import { createHash } from 'node:crypto';
import { sendTelegram } from './telegram.mjs';
import { DUYURU_THREAD, DUYURULAR_LINKI, isAnnouncementGroupChat } from './telegram-topics.mjs';
import { openChannels, sealChannels } from './edu-channel-storage.mjs';

// Yeni üye karşılaması yalnızca Duyurular/General konusunda çalışır. Bu modül
// Q&A/ingestion akışlarına girmez; webhook'ta dar bir servis-mesajı istisnası
// olarak çağrılır. Durum edu_shared içinde şifreli tutulur; açık isim/user id
// yazılmaz.
const STATE_ID = 'telegram_join_welcome';
const COALESCE_MS = 60_000;
const CLAIM_TTL_MS = 30_000;
const MAX_JOINERS = 12;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fssrtlpjqbavzomynwmg.supabase.co';
const OTHER_SYSTEM_KEYS = [
  'left_chat_member', 'new_chat_title', 'new_chat_photo', 'delete_chat_photo',
  'group_chat_created', 'supergroup_chat_created', 'channel_chat_created',
  'migrate_to_chat_id', 'migrate_from_chat_id', 'pinned_message',
  'message_auto_delete_timer_changed',
];

const memoryState = new Map();
const chatLocks = new Map();

function userId(value) {
  const id = String(value ?? '').trim();
  return /^\d{1,16}$/.test(id) ? id : null;
}

function displayName(user) {
  const first = String(user?.first_name || '').trim();
  const last = String(user?.last_name || '').trim();
  const name = (first + ' ' + last).trim();
  if (name) return name;
  const username = String(user?.username || '').trim().replace(/^@/, '');
  return username ? '@' + username : 'üye';
}

function normalizeUser(user) {
  if (!user || user.is_bot) return null;
  const id = userId(user.id);
  if (!id) return null;
  return { id, name: displayName(user) };
}

function uniqueJoiners(users) {
  const seen = new Set();
  const out = [];
  for (const user of Array.isArray(users) ? users : []) {
    const joined = normalizeUser(user);
    if (!joined || seen.has(joined.id)) continue;
    seen.add(joined.id);
    out.push(joined);
  }
  return out;
}

function targetChatId(chat) {
  if (chat?.id !== undefined && chat.id !== null && String(chat.id).trim()) return String(chat.id);
  const username = String(chat?.username || '').trim().replace(/^@/, '');
  return username ? '@' + username : null;
}

function isForwarded(msg) {
  return !!(msg?.forward_origin || msg?.forward_date || msg?.forward_from || msg?.forward_from_chat);
}

export function isJoinServiceMessage(msg) {
  if (!msg || !isAnnouncementGroupChat(msg.chat)) return false;
  if (Number(msg.message_thread_id) !== DUYURU_THREAD) return false;
  if (msg.from?.is_bot === true || msg.sender_chat || isForwarded(msg)) return false;
  if (OTHER_SYSTEM_KEYS.some(key => Object.hasOwn(msg, key))) return false;
  return uniqueJoiners(msg.new_chat_members).length > 0;
}

export function isChatMemberJoin(cm) {
  if (!cm || !isAnnouncementGroupChat(cm.chat)) return false;
  if (cm.from?.is_bot === true) return false;
  if (!['left', 'kicked'].includes(String(cm.old_chat_member?.status || ''))) return false;
  if (String(cm.new_chat_member?.status || '') !== 'member') return false;
  return uniqueJoiners([cm.new_chat_member?.user]).length > 0;
}

export function isJoinWelcomeUpdate(update) {
  return isJoinServiceMessage(update?.message) || isChatMemberJoin(update?.chat_member);
}

export function welcomeText(names) {
  const name = Array.isArray(names) ? names.join(', ') : String(names || '');
  return [
    `👋 Hoş geldin ${name}!`,
    '',
    'Burası sinyal grubu değil, burada NEDEN işlem aldığımızı öğreniyoruz.',
    '',
    '🚀 İlk 3 adım:',
    "1️⃣ Duyurular'daki sabit mesajı oku",
    '2️⃣ Chat\'te kendini kısaca tanıt:',
    '   • Ne kadar süredir trade yapıyorsun? (Yeni mi başladın?)',
    '   • En çok hangi pariteleri trade ediyorsun?',
    '3️⃣ Public Charts\'ta ilk grafiğini paylaş',
  ].join('\n');
}

export function welcomeKeyboard() {
  return { inline_keyboard: [[{ text: '🚀 Buradan Başla', url: DUYURULAR_LINKI }]] };
}

async function tgApi(method, payload, timeout = 8000) {
  const token = String(process.env.TG_BOT_TOKEN || '').trim();
  if (!token) return null;
  try {
    const res = await fetch('https://api.telegram.org/bot' + token + '/' + method, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
      signal: AbortSignal.timeout(timeout),
    });
    return await res.json().catch(() => null);
  } catch {
    return null;
  }
}

export async function canDeleteMessages(chatId) {
  if (!chatId) return false;
  const me = await tgApi('getMe', {});
  const botId = me?.result?.id;
  if (!botId) return false;
  const member = await tgApi('getChatMember', { chat_id: chatId, user_id: botId });
  const status = String(member?.result?.status || '');
  return (status === 'administrator' || status === 'creator') && member.result.can_delete_messages === true;
}

export async function deleteTelegramMessage(chatId, messageId) {
  const id = Number(messageId);
  if (!chatId || !Number.isSafeInteger(id) || id <= 0) return false;
  const out = await tgApi('deleteMessage', { chat_id: chatId, message_id: id });
  return out?.ok === true;
}

async function db(query, method = 'GET', body, prefer = 'resolution=merge-duplicates') {
  const key = String(process.env.SUPABASE_SERVICE_ROLE || '');
  const res = await fetch(SUPABASE_URL + '/rest/v1/edu_shared' + query, {
    method,
    headers: {
      apikey: key,
      ...(key.startsWith('sb_secret_') ? {} : { Authorization: 'Bearer ' + key }),
      'Content-Type': 'application/json',
      Prefer: prefer,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error('join_welcome_storage_unavailable');
  return res.status === 204 ? [] : res.json();
}

function emptyChatState() {
  return { entries: [], lastWelcomeId: null, claim: null };
}

async function loadState() {
  if (!process.env.SUPABASE_SERVICE_ROLE) {
    return { state: memoryState.get(STATE_ID) || null, row: null, durable: false };
  }
  try {
    const rows = await db('?id=eq.' + STATE_ID + '&select=id,data,updated_at&limit=1');
    const row = rows[0] || null;
    if (row && row.data?.channelEnvelope !== 1) throw new Error('join_welcome_invalid_state');
    return { state: row ? openChannels(row.data, 'channels') : null, row, durable: true };
  } catch {
    // Geçici Supabase hatası karşılamayı engellemesin; bu süreç içi durum
    // yalnızca tek örnekte tekrarları önler.
    return { state: memoryState.get(STATE_ID) || null, row: null, durable: false };
  }
}

async function saveState(durable, row, state) {
  const next = { ...state, _revision: (state?._revision || 0) + 1 };
  if (!durable) {
    memoryState.set(STATE_ID, next);
    return next;
  }
  const updated_at = new Date(Math.max(Date.now(), (Date.parse(row?.updated_at) || 0) + 1)).toISOString();
  const data = sealChannels(next, 'channels');
  const result = row
    ? await db('?id=eq.' + STATE_ID + '&updated_at=eq.' + encodeURIComponent(row.updated_at), 'PATCH', { data, updated_at }, 'return=representation')
    : await db('', 'POST', { id: STATE_ID, data, updated_at }, 'resolution=ignore-duplicates,return=representation');
  return Array.isArray(result) && result.length ? next : null;
}

async function mutateChat(chatId, change) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { state, row, durable } = await loadState();
    const current = state?.chats?.[chatId] || emptyChatState();
    const planned = await change(current);
    if (!planned) return { changed: false, chat: current };
    const next = { ...(state || {}), chats: { ...(state?.chats || {}), [chatId]: planned } };
    const saved = await saveState(durable, row, next);
    if (saved) return { changed: true, chat: planned };
  }
  throw new Error('join_welcome_conflict');
}

async function withChatLock(chatId, fn) {
  const previous = chatLocks.get(chatId) || Promise.resolve();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  chatLocks.set(chatId, gate);
  await previous;
  try {
    return await fn();
  } finally {
    release();
    if (chatLocks.get(chatId) === gate) chatLocks.delete(chatId);
  }
}

function joinEvent(update) {
  const msg = update?.message;
  if (isJoinServiceMessage(msg)) {
    const chatId = targetChatId(msg.chat);
    if (!chatId) return null;
    return {
      chatId,
      joiners: uniqueJoiners(msg.new_chat_members),
      serviceMessageId: msg.message_id || null,
    };
  }
  const cm = update?.chat_member;
  if (isChatMemberJoin(cm)) {
    const chatId = targetChatId(cm.chat);
    if (!chatId) return null;
    return { chatId, joiners: uniqueJoiners([cm.new_chat_member?.user]), serviceMessageId: null };
  }
  return null;
}

function recentEntries(entries, now) {
  if (!Array.isArray(entries)) return [];
  return entries.filter(entry => entry && /^\d{1,16}$/.test(String(entry.id)) &&
    Number.isFinite(Number(entry.at)) && now - Number(entry.at) <= COALESCE_MS);
}

function mergedEntries(entries, fresh, now) {
  const byId = new Map(entries.map(entry => [String(entry.id), { id: String(entry.id), name: String(entry.name || 'üye'), at: now }]));
  for (const joined of fresh) byId.set(joined.id, { id: joined.id, name: joined.name, at: now });
  return [...byId.values()].slice(-MAX_JOINERS);
}

export function resetJoinWelcomeState() {
  memoryState.clear();
  chatLocks.clear();
}

export async function handleJoinWelcome(update) {
  const event = joinEvent(update);
  if (!event) return { handled: false, reason: 'not_join' };

  return withChatLock(event.chatId, async () => {
    const claim = await mutateChat(event.chatId, chat => {
      const now = Date.now();
      const entries = recentEntries(chat.entries, now);
      const fresh = event.joiners.filter(joined => !entries.some(entry => String(entry.id) === joined.id));
      if (!fresh.length) return null;
      if (chat.claim && Number.isFinite(Number(chat.claim.at)) && now - Number(chat.claim.at) < CLAIM_TTL_MS) return null;
      const names = mergedEntries(entries, fresh, now).map(entry => entry.name);
      return {
        ...chat,
        entries: mergedEntries(entries, fresh, now),
        claim: {
          key: createHash('sha256').update(event.chatId + '|' + fresh.map(j => j.id).sort().join(',')).digest('hex'),
          at: now,
          ids: fresh.map(j => j.id),
          names,
          previousWelcomeId: chat.lastWelcomeId || null,
        },
      };
    });
    if (!claim.changed) return { handled: false, reason: 'duplicate' };

    const active = claim.chat.claim;
    const sent = await sendTelegram(
      welcomeText(active.names),
      event.chatId,
      DUYURU_THREAD,
      welcomeKeyboard(),
      { preview: false, timeout: 10000 },
    );
    const ok = sent?.ok === true;
    const messageId = ok ? Number(sent.result?.message_id) : null;
    const deleted = [];

    if (ok && (await canDeleteMessages(event.chatId))) {
      if (active.previousWelcomeId && await deleteTelegramMessage(event.chatId, active.previousWelcomeId)) {
        deleted.push(active.previousWelcomeId);
      }
      if (event.serviceMessageId && await deleteTelegramMessage(event.chatId, event.serviceMessageId)) {
        deleted.push(event.serviceMessageId);
      }
    }

    try {
      await mutateChat(event.chatId, chat => {
        if (!chat.claim || chat.claim.key !== active.key) return null;
        const entries = ok ? chat.entries : chat.entries.filter(entry => !active.ids.includes(String(entry.id)));
        return {
          ...chat,
          entries,
          claim: null,
          lastWelcomeId: ok && Number.isSafeInteger(messageId) && messageId > 0 ? messageId : null,
        };
      });
    } catch (e) {
      console.error('telegram-join-welcome finalize:', e?.message || e);
    }

    return { handled: true, sent: ok, messageId: ok ? messageId : null, deleted };
  });
}
