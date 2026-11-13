// ALFA TRADERS - Telegram icinden premium uyelik akisi
//
// Uye botla DM'de konusur:
//   /start  -> borsa secimi (Bybit / OKX) -> UID girisi -> onay -> dogrulama
//   dogrulama basariliysa mentorship grubunun TEK KULLANIMLIK davet linki
//   gonderilir. Kimlik Telegram user id'sidir; site hesabi gerekmez.
//
// Durumlar public.telegram_access tablosunda tutulur (006_telegram_access.sql).
// Tablo henuz olusturulmamis olsa bile bot cokmez: kullaniciya bilgi verir,
// yoneticiye haber verir.
//
// Borsa API'si yoksa / hata verirse basvuru 'pending' kalir ve yoneticiye
// Onayla/Reddet butonlari gonderilir. Yalnizca kesin 'not_found' reddedilir.
//
// Gerekli ortam degiskenleri:
//   TG_BOT_TOKEN            - bot
//   TG_ADMIN_CHAT_ID        - yonetici bildirimleri (ozel chat; grup degil)
//   TG_MENTORSHIP_CHAT_ID   - mentorship grubu (davet linki icin)
//   TG_ADMIN_IDS            - (opsiyonel) yonetici telegram id'leri, virgulle
//   BYBIT_API_KEY / BYBIT_API_SECRET
//   OKX_API_KEY / OKX_API_SECRET / OKX_API_PASSPHRASE
//   SUPABASE_SERVICE_ROLE

import { verifyExchange, submitStatusFor } from './exchanges.mjs';
import {
  mentorshipConfigured,
  createMentorshipInvite,
  revokeMentorshipInvite,
  inviteIsLive
} from './mentorship.mjs';
import { sendTelegram } from './telegram.mjs';
import { adminTelegramIds, isAdminTelegram, adminNotifyChatId } from './admin-notify.mjs';

export { adminTelegramIds, isAdminTelegram, adminNotifyChatId };

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zvnjslmptwmnuhftgqsr.supabase.co';
const TABLE = 'telegram_access';
const MAX_ATTEMPTS = 12;
const VERIFY_COOLDOWN_MS = 10000;

const REF_LINKS = {
  okx: process.env.SITE_OKX_REF_LINK || 'https://www.okx.com/join/CRYPTOAHMET',
  bybit: process.env.SITE_BYBIT_REF_LINK || 'https://partner.bybit.com/b/cryptoahmet'
};

const BYBIT_TRANSFER_VIDEO = 'https://youtu.be/p0EcYJ40Kt0';

const EXCHANGE_LABEL = { okx: 'OKX', bybit: 'Bybit' };

const lastVerifyAt = new Map();
let tableCache = null; // { at, ready }
let lastSchemaWarnAt = 0;
const SCHEMA_WARN_MS = 10 * 60 * 1000;

// ---- Yardimcilar ----

function svcHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE || '';
  const h = { apikey: key, 'Content-Type': 'application/json' };
  if (!key.startsWith('sb_secret_')) h.Authorization = 'Bearer ' + key;
  return h;
}

function serviceReady() {
  return !!process.env.SUPABASE_SERVICE_ROLE;
}

// UID: yalnizca rakam, 4-20 hane. Bosluk/nokta varsa temizlenir.
export function parseUid(text) {
  const raw = String(text || '').trim().replace(/[\s.\-_]/g, '');
  if (!/^\d{4,20}$/.test(raw)) return null;
  return raw;
}

export function maskUid(uid) {
  const s = String(uid || '');
  if (s.length <= 4) return s;
  return s.slice(0, 2) + '…' + s.slice(-3);
}

export function displayName(from) {
  const first = String((from && from.first_name) || '').trim();
  const last = String((from && from.last_name) || '').trim();
  const name = (first + ' ' + last).trim();
  return name || (from && from.username ? '@' + from.username : 'uye');
}

export function statusLabel(rec) {
  if (!rec) return 'none';
  if (rec.mentor_joined_at) return 'joined';
  if (rec.status === 'verified') return rec.mentor_invite ? 'invited' : 'verified';
  if (rec.status === 'pending') return 'pending';
  if (rec.status === 'rejected') return 'rejected';
  return 'none';
}

export function verificationPendingText(reason) {
  if (reason === 'not_configured') {
    return 'Başvurun alındı. Borsa doğrulaması şu an otomatik yapılamıyor; yönetici kontrol edip sana buradan yazacak.';
  }
  if (reason === 'rate_limited') {
    return 'Borsa şu an çok yoğun. Başvurun kaydedildi; birkaç dakika sonra "Tekrar dene" ile kontrol edebilirsin.';
  }
  return 'Borsaya şu an ulaşamadım. Başvurun kaydedildi; birkaç dakika sonra "Tekrar dene" ile kontrol edebilirsin.';
}

function nowIso() {
  return new Date().toISOString();
}

function exchangeJoinUrl(exchange) {
  return REF_LINKS[exchange] || REF_LINKS.bybit;
}

// ---- Klavyeler (saf fonksiyonlar; test edilebilir) ----

export function welcomeKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '🟠 Bybit ile doğrula', callback_data: 'ex:bybit' },
        { text: '⚫ OKX ile doğrula', callback_data: 'ex:okx' }
      ],
      [{ text: 'ℹ️ Nasıl çalışır?', callback_data: 'nav:how' }],
      [{ text: '🆘 Destek', callback_data: 'nav:support' }]
    ]
  };
}

export function exchangeKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '🟠 Bybit', callback_data: 'ex:bybit' },
        { text: '⚫ OKX', callback_data: 'ex:okx' }
      ],
      [{ text: '◀️ Vazgeç', callback_data: 'nav:cancel' }]
    ]
  };
}

export function uidKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '🎬 Baştan başla', callback_data: 'nav:start' }],
      [{ text: '◀️ İptal', callback_data: 'nav:cancel' }]
    ]
  };
}

// Borsa secildikten sonra: once kayit / hesap tasima, sonra UID.
export function prepKeyboard(exchange) {
  const rows = [];
  if (exchange === 'okx') {
    rows.push([{ text: '⚫ OKX\'e katıl', url: REF_LINKS.okx }]);
  } else {
    rows.push([{ text: '🟠 Bybit\'e katıl', url: REF_LINKS.bybit }]);
    rows.push([{ text: '🎬 Bybit hesap taşıma videosu', url: BYBIT_TRANSFER_VIDEO }]);
  }
  rows.push([{ text: '✅ Kaydım hazır, UID\'ye geç', callback_data: 'nav:uid' }]);
  rows.push([{ text: '◀️ Borsa değiştir', callback_data: 'nav:start' }]);
  return { inline_keyboard: rows };
}

export function confirmKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '✅ Doğru, kontrol et', callback_data: 'ok:verify' }],
      [{ text: '✏️ UID\'yi değiştir', callback_data: 'nav:back' }],
      [{ text: '◀️ İptal', callback_data: 'nav:cancel' }]
    ]
  };
}

export function retryKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '🔄 Tekrar dene', callback_data: 'nav:retry' }],
      [{ text: '✏️ UID\'yi değiştir', callback_data: 'nav:start' }],
      [{ text: '🆘 Destek', callback_data: 'nav:support' }]
    ]
  };
}

export function statusKeyboard(rec) {
  const rows = [];
  const invite = rec && rec.mentor_invite;
  if (invite && inviteIsLive(invite, rec.mentor_invite_expires_at)) {
    rows.push([{ text: '🎯 Mentorluk grubuna katıl', url: invite }]);
  }
  if (rec && rec.status === 'verified') {
    rows.push([{ text: '🔗 Yeni davet linki', callback_data: 'nav:newlink' }]);
  } else if (rec && rec.status === 'pending') {
    rows.push([{ text: '🔄 Tekrar dene', callback_data: 'nav:retry' }]);
  } else if (rec && rec.status === 'rejected') {
    rows.push([{ text: '✏️ Tekrar dene', callback_data: 'nav:start' }]);
  } else {
    rows.push([{ text: '🚀 Doğrulamayı başlat', callback_data: 'nav:start' }]);
  }
  rows.push([{ text: '🆘 Destek', callback_data: 'nav:support' }]);
  return { inline_keyboard: rows };
}

export function adminDecisionKeyboard(telegramId) {
  return {
    inline_keyboard: [
      [
        { text: '✅ Onayla', callback_data: 'adm:ok:' + String(telegramId) },
        { text: '❌ Reddet', callback_data: 'adm:no:' + String(telegramId) }
      ]
    ]
  };
}

export function deleteKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '🗑 Evet, sil', callback_data: 'del:yes' },
        { text: '◀️ Vazgeç', callback_data: 'del:no' }
      ]
    ]
  };
}

// ---- Supabase (service role) ----

async function tableReady() {
  if (!serviceReady()) return false;
  if (tableCache && Date.now() - tableCache.at < 60000) return tableCache.ready;
  let ready = false;
  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/' + TABLE + '?select=telegram_id&limit=1', {
      headers: svcHeaders()
    });
    ready = r.ok;
  } catch (e) {
    ready = false;
  }
  tableCache = { at: Date.now(), ready };
  return ready;
}

async function dbGet(telegramId) {
  if (!serviceReady()) return null;
  try {
    const r = await fetch(
      SUPABASE_URL + '/rest/v1/' + TABLE + '?telegram_id=eq.' + encodeURIComponent(String(telegramId)) + '&select=*',
      { headers: svcHeaders() }
    );
    if (!r.ok) return null;
    const rows = await r.json().catch(() => []);
    return rows && rows[0] ? rows[0] : null;
  } catch (e) {
    return null;
  }
}

async function dbUpsert(row) {
  if (!serviceReady()) throw new Error('service_role_missing');
  const r = await fetch(SUPABASE_URL + '/rest/v1/' + TABLE + '?on_conflict=telegram_id', {
    method: 'POST',
    headers: { ...svcHeaders(), Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify([row])
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    const err = new Error('upsert ' + r.status + ' ' + body.slice(0, 200));
    err.status = r.status;
    err.conflict = r.status === 409;
    throw err;
  }
  const rows = await r.json().catch(() => []);
  return rows && rows[0] ? rows[0] : row;
}

async function dbPatch(telegramId, patch) {
  if (!serviceReady()) throw new Error('service_role_missing');
  const r = await fetch(
    SUPABASE_URL + '/rest/v1/' + TABLE + '?telegram_id=eq.' + encodeURIComponent(String(telegramId)),
    {
      method: 'PATCH',
      headers: { ...svcHeaders(), Prefer: 'return=representation' },
      body: JSON.stringify(patch)
    }
  );
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    const err = new Error('patch ' + r.status + ' ' + body.slice(0, 200));
    err.status = r.status;
    err.conflict = r.status === 409;
    throw err;
  }
  const rows = await r.json().catch(() => []);
  return rows && rows[0] ? rows[0] : null;
}

async function dbDelete(telegramId) {
  if (!serviceReady()) throw new Error('service_role_missing');
  const r = await fetch(
    SUPABASE_URL + '/rest/v1/' + TABLE + '?telegram_id=eq.' + encodeURIComponent(String(telegramId)),
    { method: 'DELETE', headers: { ...svcHeaders(), Prefer: 'return=minimal' } }
  );
  if (!r.ok) throw new Error('delete ' + r.status);
  return true;
}

async function dbFindByUid(exchange, uid) {
  if (!serviceReady()) return null;
  try {
    const q = '/rest/v1/' + TABLE + '?exchange=eq.' + encodeURIComponent(exchange) +
      '&exchange_uid=eq.' + encodeURIComponent(String(uid)) +
      '&status=in.(pending,verified)&select=telegram_id,status,exchange_uid';
    const r = await fetch(SUPABASE_URL + q, { headers: svcHeaders() });
    if (!r.ok) return null;
    const rows = await r.json().catch(() => []);
    return rows && rows[0] ? rows[0] : null;
  } catch (e) {
    return null;
  }
}

async function dbPending(limit = 10) {
  if (!serviceReady()) return [];
  try {
    const r = await fetch(
      SUPABASE_URL + '/rest/v1/' + TABLE + '?status=eq.pending&order=created_at.asc&limit=' + Number(limit),
      { headers: svcHeaders() }
    );
    if (!r.ok) return [];
    return await r.json().catch(() => []);
  } catch (e) {
    return [];
  }
}

// ---- Mesajlasma ----

async function send(chatId, text, keyboard) {
  if (!chatId) return null;
  try {
    return await sendTelegram(text, String(chatId), null, keyboard || null, { preview: false, timeout: 20000 });
  } catch (e) {
    console.error('[TG-ONBOARD] send', e?.message || e);
    return null;
  }
}

async function answerCallback(id, text) {
  if (!id) return;
  const token = (process.env.TG_BOT_TOKEN || '').trim();
  if (!token) return;
  try {
    await fetch('https://api.telegram.org/bot' + token + '/answerCallbackQuery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: id, text: String(text || '').slice(0, 190), show_alert: false })
    });
  } catch (e) { /* sessiz */ }
}

async function notifyAdmin(text, keyboard) {
  const chat = adminNotifyChatId();
  if (!chat) return null;
  return send(chat, text, keyboard);
}

// Ham Telegram API cagrisi (ban/unban gibi islemler icin).
async function tgApi(method, payload) {
  const token = (process.env.TG_BOT_TOKEN || '').trim();
  if (!token) return null;
  try {
    const r = await fetch('https://api.telegram.org/bot' + token + '/' + method, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {})
    });
    return await r.json().catch(() => null);
  } catch (e) {
    return null;
  }
}

// Onaysiz uyeyi mentorluk grubundan cikar; onaylanınca issueInvite icinde unban edilir.
async function banMentorshipMember(userId) {
  const chatId = (process.env.TG_MENTORSHIP_CHAT_ID || '').trim();
  if (!chatId || !userId) return { ok: false, reason: 'not_configured' };
  const r = await tgApi('banChatMember', { chat_id: chatId, user_id: Number(userId), revoke_messages: false });
  return { ok: !!(r && r.ok), detail: r && r.description ? r.description : null };
}

async function unbanMentorshipMember(userId) {
  const chatId = (process.env.TG_MENTORSHIP_CHAT_ID || '').trim();
  if (!chatId || !userId) return { ok: false, reason: 'not_configured' };
  const r = await tgApi('unbanChatMember', { chat_id: chatId, user_id: Number(userId), only_if_banned: true });
  return { ok: !!(r && r.ok), detail: r && r.description ? r.description : null };
}

async function ensureRow(from) {
  const telegramId = from.id;
  let rec = await dbGet(telegramId);
  if (rec) return rec;
  try {
    rec = await dbUpsert({
      telegram_id: telegramId,
      username: from.username || null,
      first_name: from.first_name || null
    });
    return rec;
  } catch (e) {
    console.error('[TG-ONBOARD] kayit', e?.message || e);
    return null;
  }
}

// ---- Akis ----

const WELCOME = [
  '👋 Merhaba, Alfa Traders premium doğrulama botu.',
  '',
  'Bybit veya OKX hesabını birkaç adımda doğrula; doğrulanınca mentorluk grubunun sana özel davet linkini buradan alırsın.',
  '',
  'Nasıl çalışır?',
  '1️⃣ Borsanı seç, referans linkiyle kayıt ol (Bybit\'te hesabını taşıyabilirsin)',
  '2️⃣ UID\'ni yaz',
  '3️⃣ Bot hesabını kontrol etsin',
  '4️⃣ Tek kullanımlık grup davetini al',
  '',
  'UID gizli bilgi değildir; şifre veya API anahtarı ASLA istemiyorum.'
].join('\n');

const HELP = [
  '🤖 Komutlar',
  '',
  '/dogrula - Premium doğrulamayı başlat',
  '/durum - Başvuru ve mentorluk durumun',
  '/link - Yeni davet linki al',
  '/destek - Yöneticiye yaz',
  '/iptal - İşlemi iptal et',
  '/sil - Kaydını sil',
  '',
  'Piyasa soruları için:',
  '/ask <soru> - BTC, ETH, altın analizi',
  '/data - Güncel piyasa verileri',
  '/ogren <not> - Bot\'a not öğret',
  '',
  'Doğrulama sırasında yalnızca borsa UID\'n istenir. Şifre, SMS kodu veya API anahtarı istemem.'
].join('\n');

function howText() {
  return [
    '🔐 Nasıl çalışır?',
    '',
    '1. Bybit veya OKX hesabını bizim referans linkimizle açmış olman gerekir.',
    '2. Bybit\'te mevcut hesabını taşıyabilirsin: yeni e-posta ile kaydol, videodaki adımlarla hesap kimliğini taşı.',
    '3. OKX\'te mevcut hesap sonradan referansa taşınamıyorsa linkten yeni bir hesap açman gerekir.',
    '4. Sonra bot UID\'ni kontrol eder; hesap bize bağlıysa mentorluk grubuna tek kullanımlık davet linki alırsın.',
    '5. Link yalnızca 1 kişilik ve 7 gün geçerlidir; başkasıyla paylaşılamaz.',
    '',
    'Hesabın görünmüyorsa: UID\'yi kontrol et veya /destek ile bana yaz.',
    '',
    'Bybit: ' + REF_LINKS.bybit,
    'OKX: ' + REF_LINKS.okx,
    'Bybit hesap taşıma videosu: ' + BYBIT_TRANSFER_VIDEO
  ].join('\n');
}

function beginText() {
  return [
    '🚀 Premium doğrulama',
    '',
    'Hangi borsada hesabın var?'
  ].join('\n');
}

// Borsa secildikten sonra UID'den ONCE gelen kayit / hesap tasima adimi.
function exchangePrepText(exchange) {
  if (exchange === 'bybit') {
    return [
      '🟠 Bybit — önce kayıt',
      '',
      'UID yazmadan önce hesabının bizim referansımıza bağlı olması gerekir.',
      '',
      '1. Aşağıdaki Bybit linkinden, YENİ bir e-posta ile kaydol.',
      REF_LINKS.bybit,
      '2. Mevcut Bybit hesabın varsa hesabını taşı: videodaki adımları izle.',
      BYBIT_TRANSFER_VIDEO,
      '3. Hesabına para yatır ve işlemlerini bu hesapta yap.',
      '4. Hazır olunca "Kaydım hazır, UID\'ye geç" butonuna bas.',
      '',
      'Not: Hesap açılışı ve kullanımı borsanın KYC/kullanım koşullarına tabidir. Şifre veya API anahtarı istemiyorum, sadece UID.'
    ].join('\n');
  }
  return [
    '⚫ OKX — önce kayıt',
    '',
    'UID yazmadan önce hesabının bizim referansımıza bağlı olması gerekir.',
    '',
    '1. Aşağıdaki OKX linkinden kaydol.',
    REF_LINKS.okx,
    '2. Mevcut OKX hesabın referansa taşınamıyorsa bu linkten YENİ bir hesap açman gerekir.',
    '3. Hesabına para yatır ve işlemlerini bu hesapta yap.',
    '4. Hazır olunca "Kaydım hazır, UID\'ye geç" butonuna bas.',
    '',
    'Not: OKX yaklaşık 6 ayda bir tekrar giriş isteyebilir; hesabın erişimini kaybetme. Hesap açılışı ve kullanımı borsanın KYC/kullanım koşullarına tabidir.',
    'Şifre veya API anahtarı istemiyorum, sadece UID.'
  ].join('\n');
}

function uidPrompt(exchange) {
  const label = EXCHANGE_LABEL[exchange] || exchange;
  const where = exchange === 'bybit'
    ? 'Bybit uygulaması → Profil → UID'
    : 'OKX uygulaması → Profil → UID';
  return [
    '🔢 ' + label + ' UID\'ni aşağıya yaz 👇',
    '',
    'Nerede? ' + where,
    'Sadece rakamlardan oluşan UID\'yi gönder.',
    '',
    'İptal için /iptal yazabilirsin.'
  ].join('\n');
}

function confirmText(exchange, uid) {
  return [
    '🔎 Bilgileri kontrol et',
    '',
    'Borsa: ' + (EXCHANGE_LABEL[exchange] || exchange),
    'UID: ' + uid,
    '',
    'Doğruysa "Doğru, kontrol et" butonuna bas.'
  ].join('\n');
}

function verifiedText(rec, inv) {
  const label = EXCHANGE_LABEL[rec.exchange] || rec.exchange || 'Borsa';
  const lines = [
    '✅ Doğrulama başarılı!',
    '',
    label + ' hesabın premium erişime bağlandı.',
    'UID: ' + rec.exchange_uid
  ];
  if (rec.volume30d !== null && rec.volume30d !== undefined) {
    const v = Number(rec.volume30d);
    if (Number.isFinite(v)) lines.push('30 günlük işlem hacmi: $' + v.toLocaleString('tr-TR', { maximumFractionDigits: 0 }));
  }
  if (inv && inv.link) {
    lines.push('', '🎯 Mentorluk grubuna katıl:', inv.link);
    if (inv.expires_at) {
      const d = new Date(inv.expires_at);
      if (!Number.isNaN(d.getTime())) lines.push('Link ' + d.toLocaleDateString('tr-TR') + ' tarihine kadar geçerli ve tek kullanımlık.');
    }
  } else {
    lines.push('', 'Grup davetin hazırlanıyor. Yönetici bilgilendirildi; birkaç dakika içinde /link ile tekrar dene.');
  }
  lines.push('', 'Gruba katıldıktan sonra /durum yazarak kontrol edebilirsin.');
  return lines.join('\n');
}

function pendingText(reason) {
  return [
    '⏳ Başvurun alındı.',
    '',
    verificationPendingText(reason),
    '',
    'Bu sırada soru sorabilirsin: /ask BTC yönü ne?'
  ].join('\n');
}

function rejectedText(exchange) {
  const label = EXCHANGE_LABEL[exchange] || exchange || 'borsa';
  const lines = [
    '❌ Bu UID affiliate hesabımızda bulunamadı.',
    '',
    'Olası nedenler:',
    '• UID yanlış yazılmış olabilir',
    '• Hesap bizim davet linkimizle açılmamış olabilir',
    '• Farklı bir affiliate üzerinden açılmış olabilir',
    '',
    label + ' hesabını bizim linkimizle açtıysan tekrar dene:',
    exchangeJoinUrl(exchange)
  ];
  if (exchange === 'bybit') {
    lines.push('', 'Mevcut hesabını taşımak için video:', BYBIT_TRANSFER_VIDEO);
    lines.push('Önce yeni bir e-posta ile kaydol, sonra hesap kimliğini taşı.');
  } else if (exchange === 'okx') {
    lines.push('', 'Mevcut OKX hesabın referansa taşınamıyorsa linkten yeni bir hesap açman gerekir.');
    lines.push('Not: OKX yaklaşık 6 ayda bir tekrar giriş isteyebilir; hesabın erişimini kaybetme.');
  }
  lines.push('', 'Sorun devam ederse /destek yaz; birlikte bakalım.');
  return lines.join('\n');
}

function statusText(rec) {
  if (!rec || rec.status === 'none' || !rec.status) {
    return [
      'ℹ️ Henüz doğrulanmış bir hesabın yok.',
      '',
      '/dogrula ile başlayabilirsin.'
    ].join('\n');
  }
  if (rec.mentor_joined_at) {
    return [
      '✅ Premium üyeliğin aktif.',
      '',
      'Borsa: ' + (EXCHANGE_LABEL[rec.exchange] || rec.exchange || '-'),
      'UID: ' + (rec.exchange_uid || '-'),
      'Mentorluk: katıldın 🎉',
      '',
      'Soruların için /ask kullanabilirsin.'
    ].join('\n');
  }
  if (rec.status === 'verified') {
    const lines = [
      '✅ Doğrulandın.',
      '',
      'Borsa: ' + (EXCHANGE_LABEL[rec.exchange] || rec.exchange || '-'),
      'UID: ' + (rec.exchange_uid || '-')
    ];
    if (inviteIsLive(rec.mentor_invite, rec.mentor_invite_expires_at)) {
      lines.push('', '🎯 Davet linkin hazır:', rec.mentor_invite);
      lines.push('Gruba katıldıktan sonra /durum yaz.');
    } else {
      lines.push('', 'Davet linki için /link yaz veya aşağıdaki butonu kullan.');
    }
    return lines.join('\n');
  }
  if (rec.status === 'pending') {
    return [
      '⏳ Başvurun inceleniyor.',
      '',
      'Borsa: ' + (EXCHANGE_LABEL[rec.exchange || rec.draft_exchange] || '-'),
      'UID: ' + (rec.exchange_uid || rec.draft_uid || '-'),
      '',
      'Kontrol tamamlanınca buradan yazacağım. Acele edersen /destek ile yöneticiye ulaşabilirsin.'
    ].join('\n');
  }
  return [
    '❌ Doğrulama tamamlanmadı.',
    '',
    'Borsa: ' + (EXCHANGE_LABEL[rec.exchange || rec.draft_exchange] || '-'),
    'UID: ' + (rec.exchange_uid || rec.draft_uid || '-'),
    '',
    'UID\'ni kontrol edip /dogrula ile tekrar dene.'
  ].join('\n');
}

// Davet linki: gecerliyse yeniden uretmez; force ise eskisini iptal eder.
async function issueInvite(rec, opts = {}) {
  if (!mentorshipConfigured()) return { ok: false, reason: 'not_configured' };
  const force = !!opts.force;
  if (!force && inviteIsLive(rec.mentor_invite, rec.mentor_invite_expires_at)) {
    return { ok: true, link: rec.mentor_invite, expires_at: rec.mentor_invite_expires_at, reused: true };
  }
  if (rec.mentor_invite) {
    try { await revokeMentorshipInvite(rec.mentor_invite); } catch (e) { /* best-effort */ }
  }
  // Onaysizken gruptan banlanmis olabilir; davet vermeden once ban'i kaldir.
  await unbanMentorshipMember(rec.telegram_id);
  const name = ((rec.exchange || 'alfa') + '-' + (rec.exchange_uid || rec.telegram_id || '')).toLowerCase();
  const inv = await createMentorshipInvite({ name });
  if (!inv.ok) {
    console.error('[TG-ONBOARD] davet', inv.reason, inv.detail || '');
    return { ok: false, reason: inv.reason || 'telegram_error', detail: inv.detail };
  }
  try {
    await dbPatch(rec.telegram_id, {
      mentor_status: 'invited',
      mentor_invite: inv.link,
      mentor_invite_expires_at: inv.expires_at,
      mentor_invited_at: nowIso()
    });
  } catch (e) {
    console.error('[TG-ONBOARD] davet kayit', e?.message || e);
  }
  return { ok: true, link: inv.link, expires_at: inv.expires_at };
}

async function verifyAndRespond(chatId, rec, from) {
  const exchange = rec.draft_exchange || rec.exchange;
  const uid = rec.draft_uid || rec.exchange_uid;
  if (!exchange || !uid) {
    await beginFlow(chatId, from, 'Baştan başlayalım.');
    return;
  }
  const key = String(rec.telegram_id) + ':' + exchange + ':' + uid;
  const last = lastVerifyAt.get(key) || 0;
  if (Date.now() - last < VERIFY_COOLDOWN_MS) {
    await send(chatId, '⏳ Zaten kontrol ediyorum, birkaç saniye bekle.');
    return;
  }
  lastVerifyAt.set(key, Date.now());

  const attempts = Number(rec.attempts || 0) + 1;
  if (attempts > MAX_ATTEMPTS) {
    await dbPatch(rec.telegram_id, { attempts, step: 'idle', check_reason: 'too_many_attempts' }).catch(() => {});
    await send(chatId, 'Çok fazla deneme yapıldı. Güvenlik için biraz bekleyip /destek ile yöneticiye yaz.');
    await notifyAdmin('⚠️ Çok fazla doğrulama denemesi\nKullanıcı: ' + displayName(from) + ' (' + from.id + ')');
    return;
  }

  await send(chatId, '🔄 Hesabını borsada kontrol ediyorum…');
  let result;
  try {
    result = await verifyExchange(exchange, uid);
  } catch (e) {
    result = { verified: false, reason: 'error' };
  }
  const status = submitStatusFor(result);

  if (status === 'verified') {
    let saved = null;
    try {
      saved = await dbPatch(rec.telegram_id, {
        exchange,
        exchange_uid: uid,
        status: 'verified',
        verified_at: nowIso(),
        checked_at: nowIso(),
        check_reason: 'ok',
        attempts,
        step: 'idle',
        draft_exchange: null,
        draft_uid: null,
        volume: result.volume === undefined ? null : result.volume,
        volume30d: result.volume30d === undefined ? null : result.volume30d,
        exchange_joined_at: result.joinedAt || null
      });
    } catch (e) {
      if (e && e.conflict) {
        await send(chatId, '⚠️ Bu UID başka bir Telegram hesabına bağlı görünüyor.\n\nKendi hesabınla doğrulamak için /destek yaz.');
        await notifyAdmin('⚠️ UID çakışması\nKullanıcı: ' + displayName(from) + ' (' + from.id + ')\nBorsa: ' + exchange + '\nUID: ' + uid);
        return;
      }
      await send(chatId, 'Doğrulandın ama kayıt sırasında sorun oldu. /destek yaz, hemen bakayım.');
      await notifyAdmin('⚠️ Doğrulama kaydı başarısız\nKullanıcı: ' + from.id + '\nHata: ' + (e?.message || e));
      return;
    }

    const next = saved || { ...rec, exchange, exchange_uid: uid, status: 'verified' };
    const inv = await issueInvite(next);
    await send(chatId, verifiedText(next, inv.ok ? inv : null), inv.ok
      ? { inline_keyboard: [[{ text: '🎯 Mentorluk grubuna katıl', url: inv.link }], [{ text: 'Durum', callback_data: 'nav:status' }]] }
      : { inline_keyboard: [[{ text: '🔗 Tekrar dene', callback_data: 'nav:newlink' }], [{ text: '🆘 Destek', callback_data: 'nav:support' }]] });

    const volume30 = result.volume30d === undefined || result.volume30d === null
      ? '-'
      : '$' + Number(result.volume30d).toLocaleString('tr-TR', { maximumFractionDigits: 0 });
    await notifyAdmin(
      '✅ Yeni premium üye doğrulandı\n\n' +
      'Ad: ' + displayName(from) + (from.username ? ' (@' + from.username + ')' : '') + '\n' +
      'Telegram: ' + from.id + '\n' +
      'Borsa: ' + (EXCHANGE_LABEL[exchange] || exchange) + '\n' +
      'UID: ' + uid + '\n' +
      '30g hacim: ' + volume30 + '\n' +
      'Davet: ' + (inv.ok ? 'gönderildi' : 'gönderilemedi (' + inv.reason + ')')
    );
    return;
  }

  if (status === 'rejected') {
    try {
      await dbPatch(rec.telegram_id, {
        exchange,
        exchange_uid: uid,
        status: 'rejected',
        checked_at: nowIso(),
        check_reason: 'not_found',
        attempts,
        step: 'idle'
      });
    } catch (e) { /* kayit basarisiz olsa da kullanici bilgilendirilir */ }
    await send(chatId, rejectedText(exchange), retryKeyboard());
    await notifyAdmin(
      '❌ Doğrulanamayan başvuru\n\n' +
      'Ad: ' + displayName(from) + (from.username ? ' (@' + from.username + ')' : '') + '\n' +
      'Telegram: ' + from.id + '\n' +
      'Borsa: ' + (EXCHANGE_LABEL[exchange] || exchange) + '\n' +
      'UID: ' + uid + '\n' +
      'Sebep: affiliate hesabında bulunamadı'
    );
    return;
  }

  // pending: API yok / ag hatasi / limit. Kullaniciyi suclama.
  try {
    await dbPatch(rec.telegram_id, {
      exchange,
      exchange_uid: uid,
      status: 'pending',
      checked_at: nowIso(),
      check_reason: result.reason || 'error',
      attempts,
      step: 'idle'
    });
  } catch (e) { /* yonetici bildirimi yine gider */ }
  await send(chatId, pendingText(result.reason), retryKeyboard());
  const manual = result.reason === 'not_configured';
  await notifyAdmin(
    '🔔 Doğrulama bekliyor\n\n' +
    'Ad: ' + displayName(from) + (from.username ? ' (@' + from.username + ')' : '') + '\n' +
    'Telegram: ' + from.id + '\n' +
    'Borsa: ' + (EXCHANGE_LABEL[exchange] || exchange) + '\n' +
    'UID: ' + uid + '\n' +
    'Sebep: ' + (manual ? 'otomatik doğrulama kapalı (elle onay)' : (result.reason || 'error')) +
    (manual ? '\n\n⚠️ UID\'yi borsa affiliate panelinden kontrol etmeden Onayla\'ya basma.' : ''),
    adminDecisionKeyboard(rec.telegram_id)
  );
}

async function beginFlow(chatId, from, intro) {
  const rec = await ensureRow(from);
  if (!rec) {
    await send(chatId, 'Şu an kayıt oluşturamadım. Lütfen biraz sonra tekrar dene veya /destek yaz.');
    return;
  }
  try {
    await dbPatch(rec.telegram_id, {
      step: 'choose_exchange',
      draft_exchange: null,
      draft_uid: null,
      username: from.username || null,
      first_name: from.first_name || null
    });
  } catch (e) {
    console.error('[TG-ONBOARD] baslat', e?.message || e);
  }
  await send(chatId, (intro ? intro + '\n\n' : '') + beginText(), exchangeKeyboard());
}

async function sendStatus(chatId, from, rec) {
  const row = rec || await ensureRow(from);
  await send(chatId, statusText(row), statusKeyboard(row));
}

async function startVerification(chatId, from) {
  const rec = await ensureRow(from);
  if (rec && rec.mentor_joined_at) {
    await send(chatId, '✅ Premium üyeliğin zaten aktif, mentorluk grubundasın.\n\nPiyasa soruları için /ask kullanabilirsin.');
    return;
  }
  if (rec && rec.status === 'verified' && rec.mentor_invite) {
    const inv = await issueInvite(rec);
    await send(chatId, verifiedText(rec, inv.ok ? inv : null), inv.ok
      ? { inline_keyboard: [[{ text: '🎯 Mentorluk grubuna katıl', url: inv.link }], [{ text: 'Durum', callback_data: 'nav:status' }]] }
      : statusKeyboard(rec));
    return;
  }
  await beginFlow(chatId, from);
}

async function sendFreshLink(chatId, from, rec, force) {
  const row = rec || await ensureRow(from);
  if (!row || row.status !== 'verified') {
    await send(chatId, 'Önce hesabını doğrulaman gerekiyor. /dogrula ile başlayabilirsin.');
    return;
  }
  if (row.mentor_joined_at) {
    await send(chatId, '✅ Zaten mentorluk grubundasın. Yeni link gerekmiyor.');
    return;
  }
  const inv = await issueInvite(row, { force: !!force });
  if (!inv.ok) {
    const why = inv.reason === 'not_configured'
      ? 'Grup daveti sistemi henüz hazır değil. Yönetici bilgilendirildi; kısa süre sonra tekrar dene.'
      : 'Davet linki oluşturamadım. Biraz sonra tekrar dene veya /destek yaz.';
    await send(chatId, '⚠️ ' + why);
    await notifyAdmin('⚠️ Mentorluk daveti oluşturulamadı\nKullanıcı: ' + from.id + '\nSebep: ' + (inv.reason || 'error') + '\n' + (inv.detail || ''));
    return;
  }
  await send(chatId, [
    '🔗 Yeni davet linkin hazır.',
    '',
    inv.link,
    '',
    'Tek kullanımlık; sadece senin için. Gruba katıldıktan sonra /durum yaz.'
  ].join('\n'), { inline_keyboard: [[{ text: '🎯 Mentorluk grubuna katıl', url: inv.link }]] });
}

async function startSupport(chatId, from) {
  const rec = await ensureRow(from);
  if (rec) {
    try { await dbPatch(rec.telegram_id, { step: 'support', support_at: nowIso() }); } catch (e) { /* sessiz */ }
  }
  await send(chatId, [
    '🆘 Destek',
    '',
    'Sorununu tek mesajda yaz; yöneticiye ileteceğim. Borsa, UID ve yaşadığın sorunu eklersen daha hızlı çözerim.',
    '',
    'Vazgeçmek için /iptal yaz.'
  ].join('\n'));
}

async function forwardSupport(chatId, from, text) {
  await notifyAdmin(
    '🆘 Destek talebi\n\n' +
    'Ad: ' + displayName(from) + (from.username ? ' (@' + from.username + ')' : '') + '\n' +
    'Telegram: ' + from.id + '\n\n' +
    text.slice(0, 1500),
    { inline_keyboard: [[{ text: 'Kullanıcıya yaz', url: 'tg://user?id=' + from.id }]] }
  );
  const rec = await dbGet(from.id);
  if (rec) {
    try { await dbPatch(rec.telegram_id, { step: 'idle', note: text.slice(0, 500) }); } catch (e) { /* sessiz */ }
  }
  await send(chatId, '✅ Mesajını yöneticiye ilettim. En kısa sürede buradan dönüş yapılacak.\n\nBu sırada /ask ile piyasa sorularını sorabilirsin.');
}

async function deleteRecord(chatId, from) {
  const rec = await dbGet(from.id);
  if (!rec) {
    await send(chatId, 'Silinecek kayıt bulunamadı.');
    return;
  }
  if (rec.mentor_invite) {
    try { await revokeMentorshipInvite(rec.mentor_invite); } catch (e) { /* best-effort */ }
  }
  try {
    await dbDelete(from.id);
  } catch (e) {
    await send(chatId, 'Kaydı silemedim. /destek yaz, birlikte bakalım.');
    return;
  }
  await send(chatId, '🗑 Kaydın silindi. İstediğin zaman /dogrula ile yeniden başlayabilirsin.');
  await notifyAdmin('🗑 Kullanıcı kaydını sildi: ' + displayName(from) + ' (' + from.id + ')');
}

async function adminDecision(cq, approve) {
  const from = cq.from || {};
  if (!isAdminTelegram(from.id)) {
    await answerCallback(cq.id, 'Bu işlem için yetkin yok.');
    return true;
  }
  const parts = String(cq.data || '').split(':');
  const targetId = parts[2];
  if (!targetId) {
    await answerCallback(cq.id, 'Kayıt bulunamadı.');
    return true;
  }
  const rec = await dbGet(targetId);
  if (!rec) {
    await answerCallback(cq.id, 'Kayıt bulunamadı.');
    return true;
  }

  if (!approve) {
    try {
      await dbPatch(targetId, {
        status: 'rejected',
        verified_at: null,
        verified_by: 'telegram_admin:' + from.id,
        checked_at: nowIso(),
        check_reason: 'admin_rejected',
        step: 'idle'
      });
    } catch (e) { /* sessiz */ }
    await send(targetId, [
      '❌ Başvurun şu an onaylanmadı.',
      '',
      'UID\'ni ve hesabının bizim davet linkiyle açıldığını kontrol edip /dogrula ile tekrar deneyebilirsin.',
      'Sorun devam ederse /destek yaz.'
    ].join('\n'));
    await answerCallback(cq.id, 'Reddedildi.');
    return true;
  }

  let saved = null;
  try {
    saved = await dbPatch(targetId, {
      status: 'verified',
      verified_at: nowIso(),
      verified_by: 'telegram_admin:' + from.id,
      checked_at: nowIso(),
      check_reason: 'admin_approved',
      step: 'idle'
    });
  } catch (e) {
    await answerCallback(cq.id, 'Kayıt güncellenemedi.');
    return true;
  }
  const next = saved || { ...rec, status: 'verified' };
  const inv = await issueInvite(next, { force: true });
  if (inv.ok) {
    await send(targetId, verifiedText(next, inv), {
      inline_keyboard: [[{ text: '🎯 Mentorluk grubuna katıl', url: inv.link }]]
    });
    await answerCallback(cq.id, 'Onaylandı ve davet gönderildi.');
  } else {
    await send(targetId, '✅ Başvurun onaylandı. Grup daveti hazırlanıyor; /link ile tekrar deneyebilirsin.');
    await answerCallback(cq.id, 'Onaylandı; davet gönderilemedi: ' + (inv.reason || 'hata'));
    await notifyAdmin('⚠️ Onay verildi ama davet oluşmadı. TG_MENTORSHIP_CHAT_ID ve bot yönetici yetkisini kontrol et.');
  }
  return true;
}

// ---- Giris noktalari ----

// DM mesajlari. true -> islendi (cevap gonderildi), false -> Q&A devralsin.
export async function handlePrivateOnboarding(update) {
  const msg = update?.message || update?.edited_message;
  if (!msg) return false;
  const chat = msg.chat || {};
  const from = msg.from || {};
  if (chat.type !== 'private' || !from.id) return false;
  const text = String(msg.text || '').trim();
  if (!text) return false;

  const chatId = chat.id;

  if (!(await tableReady())) {
    if (!/^\/(start|dogrula|durum|link|destek|sil|iptal|yardim|help|bekleyen)/i.test(text)) return false;
    await send(chatId, '⚙️ Premium doğrulama sistemi şu an hazırlanıyor. Lütfen biraz sonra tekrar dene; yönetici bilgilendirildi.');
    if (Date.now() - lastSchemaWarnAt > SCHEMA_WARN_MS) {
      lastSchemaWarnAt = Date.now();
      await notifyAdmin('⚠️ telegram_access tablosu yok. 006_telegram_access.sql Supabase\'de çalıştırılmalı.');
    }
    return true;
  }

  const cmd = text.replace(/@\w+/g, '').split(/\s+/)[0].toLowerCase();

  // /yanit <telegram_id> <mesaj>: yonetici kullaniciya DM atar
  if (cmd === '/yanit' || cmd === '/reply') {
    if (!isAdminTelegram(from.id)) {
      await send(chatId, 'Bu komut yöneticiye özeldir.');
      return true;
    }
    const m = text.match(/^\/(?:yanit|reply)\s+(\d{5,20})\s+([\s\S]+)$/i);
    if (!m) {
      await send(chatId, 'Format: /yanit <telegram_id> <mesaj>\n\nÖrnek: /yanit 123456789 Merhaba, UID\'ni kontrol ettim.');
      return true;
    }
    await send(m[1], '📩 Yöneticiden mesaj:\n\n' + m[2] + '\n\n— Alfa Traders');
    await send(chatId, '✅ Mesaj gönderildi: ' + m[1]);
    return true;
  }

  // /bekleyen: yalnizca yonetici
  if (cmd === '/bekleyen' || cmd === '/pending') {
    if (!isAdminTelegram(from.id)) {
      await send(chatId, 'Bu komut yöneticiye özeldir.');
      return true;
    }
    const rows = await dbPending(10);
    if (!rows.length) {
      await send(chatId, '✅ Bekleyen başvuru yok.');
      return true;
    }
    for (const r of rows) {
      const label = EXCHANGE_LABEL[r.exchange || r.draft_exchange] || '-';
      await send(chatId,
        '⏳ Bekleyen başvuru\n\n' +
        'Ad: ' + (r.first_name || '-') + (r.username ? ' (@' + r.username + ')' : '') + '\n' +
        'Telegram: ' + r.telegram_id + '\n' +
        'Borsa: ' + label + '\n' +
        'UID: ' + (r.exchange_uid || r.draft_uid || '-') + '\n' +
        'Sebep: ' + (r.check_reason || '-') + '\n' +
        'Deneme: ' + (r.attempts || 0),
        adminDecisionKeyboard(r.telegram_id)
      );
    }
    return true;
  }

  if (cmd === '/start') {
    const payload = String(text.replace(/@\w+/g, '').trim().split(/\s+/)[1] || '').toLowerCase();
    if (payload === 'durum' || payload === 'status') {
      await sendStatus(chatId, from);
      return true;
    }
    if (payload === 'destek' || payload === 'support') {
      await startSupport(chatId, from);
      return true;
    }
    if (payload === 'dogrula' || payload === 'premium' || payload === 'mentorluk') {
      await startVerification(chatId, from);
      return true;
    }
    await send(chatId, WELCOME, welcomeKeyboard());
    return true;
  }

  if (cmd === '/dogrula' || cmd === '/basvuru' || cmd === '/premium' || cmd === '/mentorluk') {
    await startVerification(chatId, from);
    return true;
  }

  if (cmd === '/yardim' || cmd === '/help') {
    await send(chatId, HELP, welcomeKeyboard());
    return true;
  }

  if (cmd === '/durum' || cmd === '/status') {
    await sendStatus(chatId, from);
    return true;
  }

  if (cmd === '/link') {
    const rec = await dbGet(from.id);
    await sendFreshLink(chatId, from, rec, true);
    return true;
  }

  if (cmd === '/iptal' || cmd === '/cancel') {
    const rec = await dbGet(from.id);
    if (rec) {
      try { await dbPatch(rec.telegram_id, { step: 'idle', draft_exchange: null, draft_uid: null }); } catch (e) { /* sessiz */ }
    }
    await send(chatId, 'İptal edildi. Hazır olduğunda /dogrula ile yeniden başlayabilirsin.', welcomeKeyboard());
    return true;
  }

  if (cmd === '/destek' || cmd === '/support') {
    await startSupport(chatId, from);
    return true;
  }

  if (cmd === '/sil' || cmd === '/delete') {
    await send(chatId, '🗑 Kaydını ve davet linkini silmek istediğine emin misin?', deleteKeyboard());
    return true;
  }

  // Durum makinesi: komut degilse
  if (text.startsWith('/')) return false;

  const rec = await ensureRow(from);
  if (!rec) return false;

  if (rec.step === 'support') {
    await forwardSupport(chatId, from, text);
    return true;
  }

  if (rec.step === 'choose_exchange') {
    const lower = text.toLowerCase();
    if (/bybit/.test(lower)) {
      await dbPatch(rec.telegram_id, { step: 'await_uid', draft_exchange: 'bybit', draft_uid: null }).catch(() => {});
      await send(chatId, exchangePrepText('bybit'), prepKeyboard('bybit'));
      return true;
    }
    if (/okx|okex/.test(lower)) {
      await dbPatch(rec.telegram_id, { step: 'await_uid', draft_exchange: 'okx', draft_uid: null }).catch(() => {});
      await send(chatId, exchangePrepText('okx'), prepKeyboard('okx'));
      return true;
    }
    await send(chatId, 'Bybit veya OKX seçebilirsin. Aşağıdaki butonları kullan:', exchangeKeyboard());
    return true;
  }

  if (rec.step === 'await_uid' || rec.step === 'confirm') {
    const exchange = rec.draft_exchange || rec.exchange;
    // Kayıt ekranındaki "hazır" cevabı: UID istemine geç.
    if (rec.step === 'await_uid' && exchange && /^(hazır|hazir|tamam|ok|uid|devam|geç|gec)$/i.test(text.trim())) {
      await dbPatch(rec.telegram_id, { step: 'await_uid', draft_uid: null }).catch(() => {});
      await send(chatId, uidPrompt(exchange), uidKeyboard());
      return true;
    }
    const uid = parseUid(text);
    if (!uid) {
      await send(chatId, 'UID yalnızca rakamlardan oluşur (4-20 hane). Tekrar yazabilirsin.');
      return true;
    }
    if (!exchange) {
      await beginFlow(chatId, from, 'Önce borsanı seçelim.');
      return true;
    }
    const other = await dbFindByUid(exchange, uid);
    if (other && String(other.telegram_id) !== String(from.id)) {
      await send(chatId, '⚠️ Bu UID başka bir Telegram hesabına bağlı görünüyor.\n\nKendi hesabınla doğrulamak için /destek yaz.');
      await notifyAdmin('⚠️ UID başka hesaba bağlı\nYeni: ' + from.id + '\nMevcut: ' + other.telegram_id + '\nBorsa: ' + exchange + '\nUID: ' + uid);
      return true;
    }
    try {
      await dbPatch(rec.telegram_id, { step: 'confirm', draft_exchange: exchange, draft_uid: uid });
    } catch (e) {
      await send(chatId, 'Kaydedemedim, biraz sonra tekrar dene.');
      return true;
    }
    await send(chatId, confirmText(exchange, uid), confirmKeyboard());
    return true;
  }

  // idle: piyasa sorulari Q&A'ya devralsin
  return false;
}

// Inline butonlar.
export async function handleOnboardingCallback(cq) {
  if (!cq || !cq.id || !cq.data) return false;
  const from = cq.from || {};
  const data = String(cq.data);
  const chatId = from.id;

  if (data.indexOf('adm:') === 0) {
    return await adminDecision(cq, data.indexOf('adm:ok:') === 0);
  }

  if (!(await tableReady())) {
    await answerCallback(cq.id, 'Sistem hazırlanıyor.');
    await send(chatId, '⚙️ Premium doğrulama sistemi şu an hazırlanıyor. Lütfen biraz sonra tekrar dene.');
    return true;
  }

  if (data === 'nav:how') {
    await answerCallback(cq.id, '');
    await send(chatId, howText());
    return true;
  }

  if (data === 'nav:support' || data === 'sup:start') {
    await answerCallback(cq.id, '');
    await startSupport(chatId, from);
    return true;
  }

  if (data === 'nav:cancel') {
    await answerCallback(cq.id, 'İptal edildi.');
    const rec = await dbGet(from.id);
    if (rec) await dbPatch(rec.telegram_id, { step: 'idle', draft_exchange: null, draft_uid: null }).catch(() => {});
    await send(chatId, 'İptal edildi. Hazır olduğunda /dogrula ile başlayabilirsin.', welcomeKeyboard());
    return true;
  }

  if (data === 'nav:start') {
    await answerCallback(cq.id, '');
    await beginFlow(chatId, from);
    return true;
  }

  if (data === 'nav:status') {
    await answerCallback(cq.id, '');
    await sendStatus(chatId, from, null);
    return true;
  }

  if (data === 'nav:newlink') {
    await answerCallback(cq.id, '');
    const rec = await dbGet(from.id);
    await sendFreshLink(chatId, from, rec, true);
    return true;
  }

  if (data === 'nav:retry') {
    await answerCallback(cq.id, 'Kontrol ediliyor…');
    const rec = await dbGet(from.id);
    if (!rec) {
      await beginFlow(chatId, from);
      return true;
    }
    await verifyAndRespond(chatId, rec, from);
    return true;
  }

  if (data.indexOf('ex:') === 0) {
    const exchange = data.slice(3);
    if (exchange !== 'bybit' && exchange !== 'okx') {
      await answerCallback(cq.id, 'Geçersiz borsa.');
      return true;
    }
    await answerCallback(cq.id, EXCHANGE_LABEL[exchange] + ' seçildi.');
    const rec = await ensureRow(from);
    if (!rec) {
      await send(chatId, 'Kayıt oluşturamadım. /destek yaz.');
      return true;
    }
    await dbPatch(rec.telegram_id, {
      step: 'await_uid',
      draft_exchange: exchange,
      draft_uid: null,
      username: from.username || null,
      first_name: from.first_name || null
    }).catch(() => {});
    await send(chatId, exchangePrepText(exchange), prepKeyboard(exchange));
    return true;
  }

  if (data === 'nav:uid') {
    await answerCallback(cq.id, '');
    const rec = await dbGet(from.id);
    if (!rec || !rec.draft_exchange) {
      await beginFlow(chatId, from);
      return true;
    }
    await dbPatch(rec.telegram_id, { step: 'await_uid', draft_uid: null }).catch(() => {});
    await send(chatId, uidPrompt(rec.draft_exchange), uidKeyboard());
    return true;
  }

  if (data === 'nav:back') {
    await answerCallback(cq.id, '');
    const rec = await dbGet(from.id);
    if (!rec || !rec.draft_exchange) {
      await beginFlow(chatId, from);
      return true;
    }
    await dbPatch(rec.telegram_id, { step: 'await_uid', draft_uid: null }).catch(() => {});
    await send(chatId, uidPrompt(rec.draft_exchange), uidKeyboard());
    return true;
  }

  if (data === 'ok:verify') {
    await answerCallback(cq.id, 'Kontrol ediliyor…');
    const rec = await dbGet(from.id);
    if (!rec) {
      await beginFlow(chatId, from);
      return true;
    }
    if (!rec.draft_exchange || !rec.draft_uid) {
      await send(chatId, 'Eksik bilgi var. Baştan başlayalım.');
      await beginFlow(chatId, from);
      return true;
    }
    await verifyAndRespond(chatId, rec, from);
    return true;
  }

  if (data === 'del:yes') {
    await answerCallback(cq.id, 'Siliniyor…');
    await deleteRecord(chatId, from);
    return true;
  }

  if (data === 'del:no') {
    await answerCallback(cq.id, 'Vazgeçildi.');
    await send(chatId, 'Kaydın silinmedi. /dogrula ile devam edebilirsin.');
    return true;
  }

  return false;
}

// Bot bir gruba eklendiginde/cikarildiginda yoneticiye chat id bildir.
export async function handleBotChatMember(update) {
  const m = update?.my_chat_member;
  if (!m || !m.chat) return false;
  const chat = m.chat;
  if (chat.type !== 'group' && chat.type !== 'supergroup' && chat.type !== 'channel') return false;
  const newStatus = m.new_chat_member?.status;
  const oldStatus = m.old_chat_member?.status;
  if (newStatus === oldStatus) return true;

  const who = (m.from && (m.from.username ? '@' + m.from.username : String(m.from.id))) || '-';
  const title = chat.title || '(basliksiz)';

  if (newStatus === 'member' || newStatus === 'administrator') {
    await notifyAdmin(
      '🤖 Bot gruba eklendi\n\n' +
      'Grup: ' + title + '\n' +
      'Chat ID: ' + chat.id + '\n' +
      'Ekleyen: ' + who + '\n\n' +
      'Mentorluk grubuysa Vercel\'de TG_MENTORSHIP_CHAT_ID=' + chat.id + ' ayarla.\n' +
      'Bot grupta yönetici olmalı ve davet linki oluşturma yetkisi bulunmalı.'
    );
  } else if (newStatus === 'left' || newStatus === 'kicked') {
    await notifyAdmin('⚠️ Bot gruptan çıkarıldı\n\nGrup: ' + title + '\nChat ID: ' + chat.id + '\nİşlem: ' + who);
  }
  return true;
}

// Mentorluk grubuna katilan/ayrilan uyeyi kaydet.
// Kural: sadece status='verified' uye grupta kalabilir. Onaysiz gelen banlanir.
export async function handleChatMember(update) {
  const cm = update?.chat_member;
  if (!cm || !cm.chat || !cm.new_chat_member) return false;
  const target = (process.env.TG_MENTORSHIP_CHAT_ID || '').trim();
  if (!target || String(cm.chat.id) !== String(target)) return false;

  const user = cm.new_chat_member.user || {};
  if (!user.id) return true;
  const status = cm.new_chat_member.status;
  const rec = await dbGet(user.id);

  if (status === 'member' || status === 'administrator' || status === 'creator') {
    // Yonetici, grup sahibi ve botlar etkilenmesin.
    if (user.is_bot || isAdminTelegram(user.id) || status === 'administrator' || status === 'creator') {
      if (rec) {
        try { await dbPatch(rec.telegram_id, { mentor_status: 'joined', mentor_joined_at: rec.mentor_joined_at || nowIso() }); } catch (e) { /* sessiz */ }
      }
      return true;
    }

    const verified = rec && rec.status === 'verified';
    if (!verified) {
      const ban = await banMentorshipMember(user.id);
      if (rec) {
        try { await dbPatch(rec.telegram_id, { mentor_status: 'revoked' }); } catch (e) { /* sessiz */ }
      }
      await notifyAdmin(
        '🚫 Onaysız üye gruptan çıkarıldı\n\n' +
        displayName(user) + ' (' + user.id + ')\n' +
        'Durum: ' + (rec ? (rec.status || 'yok') : 'kayıt yok') + '\n' +
        'Borsa: ' + (rec ? (EXCHANGE_LABEL[rec.exchange || rec.draft_exchange] || '-') : '-') + '\n' +
        'UID: ' + (rec ? (rec.exchange_uid || rec.draft_uid || '-') : '-') +
        (ban.ok ? '' : '\n\n⚠️ Otomatik çıkarma başarısız: ' + (ban.detail || ban.reason || 'bilinmeyen hata') +
          '\nBotun grupta "Üyeleri banla" yetkisi olmalı.')
      );
      return true;
    }

    try {
      await dbPatch(rec.telegram_id, {
        mentor_status: 'joined',
        mentor_joined_at: rec.mentor_joined_at || nowIso()
      });
    } catch (e) { /* sessiz */ }
    await notifyAdmin('🎉 Mentorluk grubuna katıldı\n\n' + displayName(user) + ' (' + user.id + ')\nBorsa: ' +
      (EXCHANGE_LABEL[rec.exchange] || '-') + '\nUID: ' + (rec.exchange_uid || '-'));
  } else if (status === 'left' || status === 'kicked') {
    if (!rec) return true;
    try {
      await dbPatch(rec.telegram_id, { mentor_status: status === 'kicked' ? 'revoked' : 'left' });
    } catch (e) { /* sessiz */ }
    await notifyAdmin('ℹ️ Mentorluk grubundan ayrıldı\n\n' + displayName(user) + ' (' + user.id + ')');
  }
  return true;
}

// /grupid: yoneticiye chat id'yi soyler (grup veya DM).
export async function handleChatIdCommand(msg) {
  if (!msg || !msg.chat) return false;
  const text = String(msg.text || '').trim().toLowerCase();
  if (text !== '/grupid' && text !== '/chatid') return false;
  if (!isAdminTelegram(msg.from?.id)) return true;
  const chat = msg.chat;
  const lines = [
    '🆔 Chat ID: ' + chat.id,
    'Tür: ' + (chat.type || '-')
  ];
  if (chat.title) lines.push('Başlık: ' + chat.title);
  if (chat.username) lines.push('Kullanıcı adı: @' + chat.username);
  lines.push('', 'Bu ID\'yi mentorluk grubu için Vercel\'de TG_MENTORSHIP_CHAT_ID olarak kullanabilirsin.');
  await send(chat.id, lines.join('\n'));
  return true;
}
