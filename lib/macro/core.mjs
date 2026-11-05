import { createHash } from 'node:crypto';

export const ZONE = 'Europe/Istanbul';
export const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
export function verifiedDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) return null;
  const day = value.slice(0, 10);
  const parsed = new Date(day + 'T00:00:00Z');
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day || !Number.isFinite(Date.parse(value))) return null;
  return value;
}
export const dayKey = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
export const istanbul = value => new Intl.DateTimeFormat('tr-TR', { timeZone: ZONE, dateStyle: 'short', timeStyle: 'short', hourCycle: 'h23' }).format(new Date(value));
export function isDue(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, hour: '2-digit', hourCycle: 'h23' }).format(now));
  return hour === 9; // Bounded recovery window; never publish yesterday's catch-up.
}
export function publicUrl(value) {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password || u.port || u.hash) return null;
    const host = u.hostname.toLowerCase();
    const domains = ['federalreserve.gov', 'bls.gov', 'bea.gov', 'treasury.gov', 'sec.gov', 'eac.gov', 'reuters.com', 'apnews.com', 'ishares.com', 'blackrock.com', 'fidelity.com', 'vaneck.com', 'bitwiseinvestments.com', 'grayscale.com'];
    return domains.some(d => host === d || host.endsWith('.' + d)) || /^[a-z0-9.-]+\.gov$/.test(host) ? u.href : null;
  } catch { return null; }
}
export function parseJSON(text) {
  const cleaned = String(text || '').trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  try { return JSON.parse(cleaned); } catch { throw new Error('model_invalid_json'); }
}
// Plain text: no parse_mode, therefore model/website HTML and Markdown cannot execute.
// Split at whitespace only; a URL is never split between Telegram messages.
export function splitTelegram(text, limit = 3500) {
  const chunks = [];
  let current = '';
  for (const token of String(text).match(/\S+\s*/gu) || []) {
    if (token.trim().length > limit) throw new Error('telegram_token_too_long');
    if (current.length + token.length > limit) { if (current.trim()) chunks.push(current.trimEnd()); current = ''; }
    current += token;
  }
  if (current.trim()) chunks.push(current.trimEnd());
  if (!chunks.length || chunks.length > 4) throw new Error('telegram_report_too_long');
  return chunks.map((chunk, i) => chunks.length > 1 ? `Alfa Makro Analist (${i + 1}/${chunks.length})\n${chunk}` : chunk);
}

// Convert an official calendar's wall clock using IANA rules (US DST != Istanbul).
export function zonedUTC(value, zone) {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  const wall = Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5]);
  if (value.endsWith('Z')) return new Date(wall).toISOString();
  if (zone === 'US-Eastern') zone = 'America/New_York';
  if (!['America/New_York', 'Europe/Istanbul', 'UTC'].includes(zone)) return null;
  let utc = wall;
  for (let i = 0; i < 3; i++) {
    const formatted = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(utc)).map(p => [p.type, p.value]));
    const actual = Date.UTC(+formatted.year, +formatted.month - 1, +formatted.day, +formatted.hour, +formatted.minute, +formatted.second);
    utc += wall - actual;
  }
  return new Date(utc).toISOString();
}
export function calendarEvents(ics, sourceId, now) {
  const text = String(ics).replace(/\r?\n[ \t]/g, '');
  const events = [];
  for (const match of text.matchAll(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/g)) {
    const block = match[1];
    if (/STATUS:CANCELLED/.test(block)) continue;
    const start = block.match(/(?:^|\n)DTSTART(?:;TZID=([^:\r\n]+))?:(\d{8}T\d{6}Z?)/);
    const title = block.match(/(?:^|\n)SUMMARY:([^\r\n]+)/)?.[1]?.replace(/\\[,;]/g, s => s.slice(1));
    if (!start || !title || (!start[2].endsWith('Z') && !start[1])) continue;
    const at = zonedUTC(start[2], start[1]);
    if (at && Date.parse(at) >= now && Date.parse(at) <= now + 48 * 3600000) events.push({ id: hash([sourceId, at, title]).slice(0, 12), title, at, sourceId });
  }
  return events.sort((a, b) => a.at.localeCompare(b.at));
}
