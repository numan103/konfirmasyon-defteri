// Telegram -> AlfaNews dergi girişi.
// Tam otomatik: mevcut /api/ai?telegram-webhook=1 akışından beslenir, yeni API açmaz.
// Kaynaklar: haberler kanalı (TG_MAG_NEWS_CHAT) ve Trader Ahmet'in alfakasim/6 başlığı.
// Kişisel veri, ileri yönlendirme, bot mesajı ve komutlar asla dergiye girmez.
import { createHash } from 'node:crypto';
import { parseMentorResults } from '../assets/mentor-feed-model.mjs';

const BASE = process.env.SUPABASE_URL || 'https://zvnjslmptwmnuhftgqsr.supabase.co';
const TABLE = 'alfanews';
const ROW = 1;
export const MAG_CATEGORIES = Object.freeze(['Haber', 'Teknik Analiz']);
const clip = (v, max = 4000) => String(v == null ? '' : v).slice(0, max);
const username = msg => String(msg?.chat?.username || '').toLowerCase().replace(/^@/, '');

function magConfig() {
  const newsChat = (process.env.TG_MAG_NEWS_CHAT || process.env.TG_MAG_NEWS_CHAT_ID || '').trim().replace(/^@/, '');
  const newsThread = Number(process.env.TG_MAG_NEWS_THREAD || 0);
  const techThread = Number(process.env.TG_MAG_TECH_THREAD || 6);
  return {
    newsChat,
    newsThread: Number.isFinite(newsThread) ? newsThread : 0,
    techChat: (process.env.TG_MAG_TECH_CHAT || 'alfakasim').trim().replace(/^@/, ''),
    techThread: Number.isFinite(techThread) ? techThread : 6,
    techAuthor: (process.env.TG_MAG_TECH_AUTHOR || 'traderahmetd').trim().replace(/^@/, '').toLowerCase(),
    ok: !!newsChat,
  };
}
export function magazineConfig() { return magConfig(); }

function matchesNews(msg) {
  const cfg = magConfig();
  if (cfg.newsThread && Number(msg?.message_thread_id) !== cfg.newsThread) return false;
  if (cfg.newsChat) {
    const id = String(msg?.chat?.id ?? '');
    return /^-?\d+$/.test(cfg.newsChat) ? id === cfg.newsChat : username(msg) === cfg.newsChat.toLowerCase();
  }
  // Env ayarlanmamışsa yeni "Alfa News" kanalını başlık/userName ile tanı.
  // Sohbet mesajları (alfakasim/6 vb.) buraya girmez; yalnızca kanal kimliği.
  const title = String(msg?.chat?.title || '').trim().toLowerCase();
  const user = username(msg);
  const wanted = (process.env.TG_MAG_NEWS_TITLE || 'Alfa News').trim().toLowerCase();
  return title === wanted || /alfa[\s_-]*news/.test(title) || /alfa[\s_-]*news/.test(user);
}
function matchesTech(msg) {
  const cfg = magConfig();
  return username(msg) === cfg.techChat.toLowerCase() &&
    ['supergroup', 'group', 'channel'].includes(msg?.chat?.type) &&
    Number(msg?.message_thread_id) === cfg.techThread &&
    (process.env.TG_MAG_TECH_AUTHOR_ID
      ? String(msg?.from?.id) === String(process.env.TG_MAG_TECH_AUTHOR_ID)
      : String(msg?.from?.username || '').toLowerCase().replace(/^@/, '') === cfg.techAuthor);
}
export function magazineSource(msg) {
  if (!msg || !Number.isSafeInteger(msg.message_id) || msg.message_id <= 0) return null;
  if (msg.from?.is_bot || msg.forward_origin || msg.forward_from ||
      msg.forward_from_chat || msg.forward_date || msg.new_chat_members || msg.left_chat_member) return null;
  if (/^\//.test(String(msg.text || msg.caption || '').trim())) return null;
  // Kanalın kendi paylaşımı sender_chat ile gelir; yalnızca aynı kanal kabul edilir.
  // Anonim yönetici / başka sohbetten gelen payload reddedilir.
  const ownChannel = !!msg.sender_chat && String(msg.sender_chat.id) === String(msg.chat?.id);
  if (msg.sender_chat && !ownChannel) return null;
  if (matchesNews(msg)) return 'Haber';
  if (matchesTech(msg) && ownChannel === false) return 'Teknik Analiz';
  return null;
}
export function isMagazineUpdate(update) {
  const msg = update?.message || update?.edited_message;
  return !!magazineSource(msg);
}
function photoIds(msg) {
  const list = Array.isArray(msg?.photo) ? msg.photo : [];
  return list.filter(p => p?.file_id && (!p.file_size || p.file_size <= 2_000_000))
    .slice(-3).map(p => clip(p.file_id, 250));
}
function titleOf(text, category) {
  const line = String(text || '').split(/\r?\n/).map(s => s.trim())
    .find(s => s.length >= 5 && !/^https?:\/\//i.test(s));
  if (!line) return category === 'Haber' ? 'Makro Haber' : 'Teknik Analiz';
  return line.replace(/^[#*_\s]+|[#*_\s]+$/g, '').slice(0, 120);
}
export function entryFromMessage(msg, source) {
  const text = clip(msg?.text || msg?.caption || '', 20000).trim();
  const images = photoIds(msg);
  if (!text && !images.length) return null;
  // Sonuç satırları zaten işlem kanalına giriyor; dergide tekrar etmesin.
  if (source === 'Teknik Analiz' && parseMentorResults(text).length) return null;
  const key = [source, String(msg.chat.id), msg.message_id].join(':');
  const id = 'mag_' + createHash('sha256').update(key).digest('hex');
  const cfg = magConfig();
  const linkUser = username(msg) || (msg.chat?.username || '');
  const link = linkUser
    ? 'https://t.me/' + linkUser + '/' + (source === 'Teknik Analiz' ? cfg.techThread + '/' : '') + msg.message_id
    : '';
  return {
    id, title: titleOf(text, source), body: text, type: '', relId: '', result: '',
    authorId: source === 'Teknik Analiz' ? cfg.techAuthor : '',
    images: [], photoIds: images, category: source,
    sourceLink: clip(link, 300), publishedAt: new Date((Number(msg.date) || 0) * 1000 || Date.now()).toISOString(),
  };
}

function headers(extra = {}) {
  const key = (process.env.SUPABASE_SERVICE_ROLE || '').trim();
  if (!key) throw new Error('storage_not_configured');
  return {
    apikey: key,
    ...(key.startsWith('sb_secret_') ? {} : { Authorization: 'Bearer ' + key }),
    'Content-Type': 'application/json',
    ...extra,
  };
}
async function readRow() {
  const res = await fetch(`${BASE}/rest/v1/${TABLE}?id=eq.${ROW}&select=data,updated_at`, {
    headers: headers(), signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error('storage_unavailable');
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error('storage_unavailable');
  return rows[0] ? { data: rows[0].data || {}, revision: rows[0].updated_at } : null;
}
async function writeRow(data, revision) {
  const stamp = new Date().toISOString();
  const url = revision
    ? `${BASE}/rest/v1/${TABLE}?id=eq.${ROW}&updated_at=eq.${encodeURIComponent(revision)}`
    : `${BASE}/rest/v1/${TABLE}?on_conflict=id`;
  const res = await fetch(url, {
    method: revision ? 'PATCH' : 'POST',
    headers: headers({ Prefer: revision ? 'return=representation' : 'resolution=merge-duplicates,return=representation' }),
    body: JSON.stringify({ ...(revision ? {} : { id: ROW }), data, updated_at: stamp }),
    signal: AbortSignal.timeout(8000),
  });
  if (res.status === 409) return { ok: false, conflict: true };
  if (!res.ok) throw new Error('storage_unavailable');
  // Supabase CAS mismatch returns 200 with an empty representation — never report that as a save.
  const saved = await res.json();
  if (!Array.isArray(saved) || saved.length !== 1) return { ok: false, conflict: true };
  return { ok: true, conflict: false };
}

function merge(current, entry, isEdit) {
  const data = current && typeof current === 'object' ? current : { issueNo: 1, entries: [], authors: [] };
  if (!Array.isArray(data.entries)) data.entries = [];
  if (!Array.isArray(data.authors)) data.authors = [];
  if (entry.authorId && !data.authors.some(a => a && a.id === entry.authorId)) {
    data.authors.push({ id: entry.authorId, name: 'Trader Ahmet', specialty: 'BTC & Gold', photo: '' });
  }
  const idx = data.entries.findIndex(e => e && e.id === entry.id);
  if (idx >= 0) {
    if (!isEdit) return { data, changed: false };
    const old = data.entries[idx];
    if (old.body === entry.body && old.title === entry.title) return { data, changed: false };
    data.entries[idx] = { ...old, title: entry.title, body: entry.body, photoIds: entry.photoIds };
    return { data, changed: true };
  }
  data.entries.push(entry);
  return { data, changed: true };
}

export async function ingestMagazineUpdate(update) {
  const isEdit = !!update?.edited_message;
  const msg = update?.message || update?.edited_message;
  const source = magazineSource(msg);
  if (!source) return { handled: false, count: 0 };
  const entry = entryFromMessage(msg, source);
  if (!entry) return { handled: true, count: 0, skipped: 'empty' };
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await readRow();
    const { data, changed } = merge(current?.data, entry, isEdit);
    if (!changed) return { handled: true, count: 0, skipped: 'duplicate' };
    const out = await writeRow(data, current?.revision);
    if (out.ok) return { handled: true, count: 1 };
    if (!out.conflict) throw new Error('storage_write_failed');
  }
  throw new Error('storage_conflict');
}
