// Telegram -> AlfaNews dergi girişi.
// Tam otomatik: mevcut /api/ai?telegram-webhook=1 akışından beslenir, yeni API açmaz.
// Kaynak: sahibinin belirlediği mentorship / alfakasim / 977 dergi başlığı.
// Kişisel veri, ileri yönlendirme, bot mesajı ve komutlar asla dergiye girmez.
import { createHash } from 'node:crypto';
import { classifyMentorPost, hasPairPrefix, parseMentorResults } from '../assets/mentor-feed-model.mjs';
import { telegramPDFToBlob, cleanPDF } from './edu-pdf.mjs';

const BASE = process.env.SUPABASE_URL || 'https://fssrtlpjqbavzomynwmg.supabase.co';
const TABLE = 'alfanews';
const ROW = 1;
export const MAG_CATEGORIES = Object.freeze(['Haber', 'BTC Bias', 'Makro', 'Teknik Analiz']);
const clip = (v, max = 4000) => String(v == null ? '' : v).slice(0, max);
const username = msg => String(msg?.chat?.username || '').toLowerCase().replace(/^@/, '');

function magConfig() {
  return { newsChat: 'alfakasim', newsThread: 977, ok: true };
}
export function magazineConfig() { return magConfig(); }

function matchesNews(msg) {
  // Explicit source supplied by the owner: t.me/alfakasim/977/987.
  // Legacy TG_MAG_NEWS_* settings referred to a different topic; never inherit them.
  return username(msg) === 'alfakasim' && Number(msg?.message_thread_id) === 977 &&
    ['supergroup', 'group'].includes(msg?.chat?.type);
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
  const author = String(msg.from?.username || '').toLowerCase().replace(/^@/, '');
  const authorId = String(process.env.TG_MAG_TECH_AUTHOR_ID || '');
  if (matchesNews(msg) && (ownChannel || author === 'traderahmetd' || (authorId && String(msg.from?.id) === authorId))) return 'Haber';
  return null;
}
export function isMagazineUpdate(update) {
  const msg = update?.channel_post || update?.edited_channel_post || update?.message || update?.edited_message;
  return !!magazineSource(msg);
}
function photoIds(msg) {
  const list = Array.isArray(msg?.photo) ? msg.photo : [];
  return list.filter(p => p?.file_id && (!p.file_size || p.file_size <= 2_000_000))
    .slice(-1).map(p => clip(p.file_id, 250));
}
function titleOf(text, category) {
  const line = String(text || '').split(/\r?\n/).map(s => s.trim())
    .find(s => s.length >= 5 && !/^https?:\/\//i.test(s));
  if (!line) return { 'Haber': 'Makro Haber', 'BTC Bias': 'BTC Bias', 'Makro': 'Makro' }[category] || 'Teknik Analiz';
  return line.replace(/^[#*_\s]+|[#*_\s]+$/g, '').slice(0, 120);
}
const STRONG_BIAS_RE = /\bhtf\b|\bbias\b|yön görüş|yon gorus|piyasa görüş|market outlook/i;
const BIAS_RE = /\bhtf\b|\bbias\b|yön görüş|yon gorus|piyasa görüş|market outlook|fiber|likidite/i;
const MACRO_RE = /\bmakro\b|\bmacro\b|\bfed\b|faiz|enflasyon|\bcpi\b|\bnfp\b|\busr\b|dolar|\busd\b/i;
const TRADE_RE = /\b(?:long|short|entry|stop|pozisyon|aldım|açtım|girdim|girdik|\btp\b|\bsl\b|kaldıraç|işleme gir|isleme gir)\b/i;
export function magazineCategory(text, source) {
  if (source === 'Teknik Analiz') return 'Teknik Analiz';
  const value = String(text || '');
  const btc = /\b(?:btc|bitcoin)\b/i.test(value);
  // Açık "Makro" başlığı, genel likidite/fiber kelimelerinden önce gelir.
  if (MACRO_RE.test(value) && !STRONG_BIAS_RE.test(value)) return 'Makro';
  if (BIAS_RE.test(value)) return btc ? 'BTC Bias' : 'Teknik Analiz';
  return 'Haber';
}
export function entryFromMessage(msg, source) {
  const text = clip(msg?.text || msg?.caption || '', 200000).trim();
  const images = photoIds(msg);
  const pdfTelegram = msg.document?.mime_type === 'application/pdf' ? {
    file_id: msg.document.file_id, file_unique_id: msg.document.file_unique_id,
    file_name: msg.document.file_name, file_size: msg.document.file_size, mime_type: 'application/pdf'
  } : null;
  if (!text && !images.length && !pdfTelegram) return null;
  // Gün içi işlem/sonuç paylaşımları işlem grubuna ait; dergide tekrar etmesin.
  const bias = BIAS_RE.test(text), macro = MACRO_RE.test(text);
  const trade = parseMentorResults(text).length > 0 ||
    (!bias && !macro && (classifyMentorPost(text) === 'trade' || hasPairPrefix(text) || TRADE_RE.test(text)));
  if (trade) return null;
  const category = magazineCategory(text, source);
  const body = clip(String(text).split(/\r?\n/).filter(line => line.trim() && !/^#?(?:bias|işlem|islem|trade|sonuç|sonuc)$/i.test(line.trim())).join('\n'), 200000);
  if (!body && !images.length && !pdfTelegram) return null;
  const key = [source, String(msg.chat.id), msg.media_group_id ? 'album-' + msg.media_group_id : msg.message_id].join(':');
  const id = 'mag_' + createHash('sha256').update(key).digest('hex');
  const linkUser = username(msg) || (msg.chat?.username || '');
  const link = linkUser
    ? 'https://t.me/' + linkUser + '/' + (msg.message_thread_id ? msg.message_thread_id + '/' : '') + msg.message_id
    : '';
  return {
    id, title: titleOf(body || text, category), body, type: '', relId: '', result: '',
    authorId: 'traderahmetd',
    images: [], photoIds: images, category, sourceKind: 'mentorship-magazine', sourceThread: 977,
    ...(pdfTelegram ? { pdfTelegram } : {}),
    ...(msg.media_group_id ? { mediaGroupId: clip(msg.media_group_id, 100), telegramParts: [{ messageId: msg.message_id, body, photoIds: images }] } : {}),
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
    const old = data.entries[idx];
    if (entry.mediaGroupId && old.mediaGroupId === entry.mediaGroupId) {
      const parts = Array.isArray(old.telegramParts) ? old.telegramParts.slice() : [];
      const incoming = entry.telegramParts[0];
      const partIndex = parts.findIndex(p => p.messageId === incoming.messageId);
      if (partIndex >= 0 && (!isEdit || JSON.stringify(parts[partIndex]) === JSON.stringify(incoming))) return { data, changed: false };
      if (partIndex >= 0) parts[partIndex] = incoming; else if (parts.length < 12) parts.push(incoming);
      const body = parts.map(p => p.body).filter(Boolean).join('\n\n').slice(0, 200000);
      data.entries[idx] = { ...old, telegramParts: parts, body, title: titleOf(body, old.category),
        photoIds: [...new Set(parts.flatMap(p => p.photoIds || []))].slice(0, 12) };
      return { data, changed: true };
    }
    if (!isEdit && !(entry.pdf && !old.pdf)) return { data, changed: false };
    if (old.body === entry.body && old.title === entry.title && JSON.stringify(old.photoIds || []) === JSON.stringify(entry.photoIds) && JSON.stringify(old.pdf || null) === JSON.stringify(entry.pdf || null)) return { data, changed: false };
    data.entries[idx] = { ...old, title: entry.title, body: entry.body, photoIds: entry.photoIds, category: entry.category, sourceLink: entry.sourceLink, sourceKind: entry.sourceKind, sourceThread: 977, pdf: entry.pdf || null, pdfTelegram: entry.pdfTelegram || null };
    return { data, changed: true };
  }
  data.entries.push(entry);
  return { data, changed: true };
}

export async function ingestMagazineUpdate(update) {
  const isEdit = !!(update?.edited_message || update?.edited_channel_post);
  const msg = update?.channel_post || update?.edited_channel_post || update?.message || update?.edited_message;
  const source = magazineSource(msg);
  if (!source) return { handled: false, count: 0 };
  const entry = entryFromMessage(msg, source);
  if (!entry) return { handled: true, count: 0, skipped: 'empty' };
  let pdfPromise;
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await readRow();
    if (entry.pdfTelegram) {
      const previous = current?.data?.entries?.find(e => e.id === entry.id);
      entry.pdf = previous?.pdfTelegram?.file_id === entry.pdfTelegram.file_id && cleanPDF(previous.pdf)
        ? previous.pdf : await (pdfPromise ||= telegramPDFToBlob(entry.pdfTelegram));
    }
    const { data, changed } = merge(current?.data, entry, isEdit);
    if (!changed) return { handled: true, count: 0, skipped: 'duplicate' };
    const out = await writeRow(data, current?.revision);
    if (out.ok) return { handled: true, count: 1 };
    if (!out.conflict) throw new Error('storage_write_failed');
  }
  throw new Error('storage_conflict');
}
