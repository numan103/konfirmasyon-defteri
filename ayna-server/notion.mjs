import { db } from './supabase.mjs';
import { isIsoDate, localDate } from './time.mjs';

const NOTION_VERSION = '2022-06-28';
const MAX_TRADES_PER_DB = 300;
const MAX_AGE_DAYS = 200;
const MAX_NOTE = 2000;

export const DEFAULT_NOTION_DBS = [
  { id: '3d5f561953ab80cfa99cf95749ad82a2', market: 'Kripto' },
  { id: '3d2f561953ab805e8703d571dbb858e9', market: 'Kripto' },
  { id: '3b4f561953ab80c49b58d4c4cd60b6c9', market: 'Kripto' },
  { id: '3e2f561953ab80508627f53a094a2d01', market: 'Kripto' },
];

const DB_ID_RE = /^[0-9a-f]{32}$/i;
const TOKEN_RE = /^[A-Za-z0-9_.-]{20,300}$/;

export function cleanNotionToken(value) {
  if (typeof value !== 'string') return null;
  const token = value.trim();
  return TOKEN_RE.test(token) ? token : null;
}

// Only database IDs are accepted; the client never supplies arbitrary URLs.
export function notionDatabases(input) {
  if (input == null) return null;
  const raw = typeof input === 'string' ? (() => { try { return JSON.parse(input); } catch (e) { return null; } })() : input;
  if (!raw || typeof raw !== 'object') return null;
  const out = [];
  for (const [key, market] of [['kripto', 'Kripto'], ['fx', 'Fx']]) {
    const value = raw[key];
    if (value == null || value === '') continue;
    const id = String(value).replace(/-/g, '').toLowerCase();
    if (!DB_ID_RE.test(id)) return undefined;
    out.push({ id, market });
  }
  if (!out.length) return null;
  return out.slice(0, 2);
}

async function notionFetch(path, token, options = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch('https://api.notion.com/v1/' + path, {
      ...options,
      signal: ctrl.signal,
      headers: {
        Authorization: 'Bearer ' + token,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json'
      }
    });
    if (!r.ok) {
      const error = new Error('notion_' + r.status);
      error.status = r.status;
      throw error;
    }
    return await r.json();
  } finally { clearTimeout(timer); }
}

function prop(page, name) { return page && page.properties ? page.properties[name] : null; }
function parseDate(p) { return p && p.date && p.date.start ? p.date.start : null; }
function parseSelect(p) { return p && p.select ? p.select.name : null; }
function parseMultiSelect(p) { return p && Array.isArray(p.multi_select) ? p.multi_select.map((o) => o.name).filter(Boolean) : []; }
function parseTitle(p) { return p && Array.isArray(p.title) ? p.title.map((t) => t.plain_text || '').join('') : ''; }
function parseRichText(p) { return p && Array.isArray(p.rich_text) ? p.rich_text.map((t) => t.plain_text || '').join('') : ''; }
function parseNumber(p) {
  if (!p) return null;
  if (typeof p.number === 'number' && Number.isFinite(p.number)) return p.number;
  const text = parseRichText(p).replace(',', '.');
  const n = Number(text);
  return text && Number.isFinite(n) ? n : null;
}

function pickSelect(page, names) {
  for (const name of names) {
    const value = parseSelect(prop(page, name));
    if (value) return value;
  }
  return '';
}

function pickMulti(page, names) {
  for (const name of names) {
    const values = parseMultiSelect(prop(page, name));
    if (values.length) return values;
  }
  return [];
}

function isoDate(value) {
  if (typeof value !== 'string') return null;
  const day = value.slice(0, 10);
  return isIsoDate(day) ? day : null;
}

// Notion is the source of the user's written trade notes. Keep the raw page
// reference so a synced note can always be traced back to its source.
export function mapNotionTrade(page, market, userId) {
  if (!page || !page.id) return null;
  const date = parseDate(prop(page, 'Tarih'));
  const ts = date ? Date.parse(date) : page.created_time ? Date.parse(page.created_time) : NaN;
  if (!Number.isFinite(ts)) return null;
  const day = isoDate(date) || localDate(new Date(ts));
  const directionRaw = String(pickSelect(page, ['Position', 'Yön', 'Yon', 'Direction'])).toLowerCase();
  const quality = pickSelect(page, ['Karar Kalitesi', 'Kalite', 'Quality', 'Plan Uyumu']);
  const qualityKey = String(quality || '').toLocaleLowerCase('tr-TR');
  const planned = qualityKey.indexOf('kural') >= 0 ? true : qualityKey.indexOf('zorla') >= 0 ? false : null;
  const note = parseRichText(prop(page, 'Not')).trim()
    || parseRichText(prop(page, 'İşlem Notu')).trim()
    || parseRichText(prop(page, 'Kısa Not')).trim()
    || parseRichText(prop(page, 'Notlar')).trim();
  const symbol = String(pickSelect(page, ['Pair', 'Parite', 'Symbol', 'Sembol']) || '').toUpperCase().slice(0, 30) || null;
  const pnl = parseNumber(prop(page, 'Profit')) ?? parseNumber(prop(page, 'R')) ?? parseNumber(prop(page, 'Net R')) ?? parseNumber(prop(page, 'Sonuç'));
  if (!symbol && pnl == null) return null;
  return {
    user_id: userId,
    source: 'notion',
    source_id: page.id,
    symbol,
    direction: directionRaw.includes('short') ? 'short' : directionRaw.includes('long') ? 'long' : null,
    opened_at: new Date(ts).toISOString(),
    closed_at: null,
    local_date: day,
    pnl,
    planned,
    emotions: pickMulti(page, ['Duygu', 'Duygular', 'Emotion', 'Emotions', 'Duygusal durum']).slice(0, 8),
    note: note ? note.slice(0, MAX_NOTE) : null,
    raw: {
      notion_id: page.id,
      market,
      trade_no: parseTitle(prop(page, 'Trade #')).slice(0, 80),
      strategy: pickSelect(page, ['Trade Stratejisi', 'Strateji', 'Setup']) || null,
      entry_model: pickSelect(page, ['Entry Model', 'Model', 'Entry Modeli', 'Giriş Tetikleyicisi', 'Çıkış']) || null,
      quality: quality || null,
      url: page.url || null
    }
  };
}

async function databaseSorts(token, dbId) {
  try {
    const schema = await notionFetch('databases/' + dbId, token);
    const properties = (schema && schema.properties) || {};
    const key = Object.keys(properties).find((name) => /^tarih$/i.test(name) && properties[name].type === 'date');
    return key ? [{ property: key, direction: 'descending' }] : [];
  } catch (e) {
    return [];
  }
}

async function queryDatabase(token, dbId) {
  const sorts = await databaseSorts(token, dbId);
  const rows = [];
  let cursor = null;
  let pages = 0;
  const oldest = new Date(Date.now() - MAX_AGE_DAYS * 86400000).toISOString().slice(0, 10);
  do {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    if (sorts.length) body.sorts = sorts;
    const data = await notionFetch('databases/' + dbId + '/query', token, { method: 'POST', body: JSON.stringify(body) });
    const batch = Array.isArray(data.results) ? data.results : [];
    rows.push(...batch);
    cursor = data.has_more ? data.next_cursor : null;
    pages++;
    if (sorts.length && batch.length) {
      const lastDate = batch
        .map((page) => isoDate(parseDate(prop(page, 'Tarih'))) || '')
        .filter(Boolean)
        .sort()
        .shift();
      if (lastDate && lastDate < oldest) break;
    }
  } while (cursor && pages < 4 && rows.length < MAX_TRADES_PER_DB);
  return rows.slice(0, MAX_TRADES_PER_DB);
}

export async function notionSync(auth, userId, { token, dbs }) {
  if (!cleanNotionToken(token)) throw new Error('notion_token_invalid');
  const databases = dbs && dbs.length ? dbs : DEFAULT_NOTION_DBS;
  const pages = [];
  for (const database of databases) {
    const rows = await queryDatabase(token, database.id);
    for (const page of rows) pages.push({ page, market: database.market });
  }
  const trades = pages.map(({ page, market }) => mapNotionTrade(page, market, userId)).filter(Boolean);
  if (trades.length) {
    // The composite key matches the schema's unique(user_id, source, source_id).
    await db(auth, 'POST', 'ayna_trades?on_conflict=user_id,source,source_id', trades, 'resolution=merge-duplicates,return=minimal');
  }
  const dates = trades.map((t) => t.local_date).sort();
  return {
    upserted: trades.length,
    withNotes: trades.filter((t) => t.note).length,
    firstDate: dates[0] || null,
    lastDate: dates[dates.length - 1] || null
  };
}
