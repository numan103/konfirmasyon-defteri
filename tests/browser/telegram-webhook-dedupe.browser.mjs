// Telegram webhook'un aynı update_id'yi worker yeniden başlasa da tekrar
// işlememesi tarayıcı üzerinden uçtan uca doğrulanır. Supabase yerineCAS'li
// küçük bir yerel edu_shared taklidi kullanılır; gerçek webhook kodu çalışır.
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const arg = key => process.argv.find(v => v.startsWith('--' + key + '='))?.split('=').slice(1).join('=');
const { chromium } = await import(pathToFileURL(path.resolve(arg('playwright'))));

const rows = new Map();
let writes = 0;
let webhook = null;
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://local');
  if (u.pathname === '/') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end(`<!doctype html><meta charset="utf-8"><title>webhook dedupe</title>
<script>
window.postUpdate = async id => {
  const r = await fetch('/api/ai?telegram-webhook=1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-telegram-bot-api-secret-token': 'browser-secret' },
    body: JSON.stringify({ update_id: id, message: {
      message_id: id, date: 1795000000,
      chat: { id: 424242, type: 'supergroup', username: 'other_chat' },
      from: { id: 77, is_bot: false }, text: 'sessiz test mesajı'
    } })
  });
  return { status: r.status, body: await r.json() };
};
</script>`);
  }
  if (u.pathname === '/rest/v1/edu_shared') {
    const id = u.searchParams.get('id')?.replace(/^eq\./, '');
    const row = rows.get(id);
    if (!req.method || req.method === 'GET') {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify(row ? [row] : []));
    }
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw || '{}');
    if (req.method === 'POST') {
      writes++; rows.set(body.id, body);
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify([body]));
    }
    if (req.method === 'PATCH') {
      writes++;
      const rev = u.searchParams.get('updated_at')?.replace(/^eq\./, '');
      if (!row || row.updated_at !== rev) {
        res.setHeader('Content-Type', 'application/json');
        return res.end('[]');
      }
      const next = { ...row, ...body }; rows.set(id, next);
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify([next]));
    }
  }
  if (u.pathname === '/api/ai' && u.searchParams.get('telegram-webhook') === '1') {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const captured = {
      statusCode: 200, payload: null,
      status(code) { this.statusCode = code; return this; },
      setHeader() {},
      json(body) { this.payload = body; return this; },
      end(body) { if (typeof body === 'string') { try { this.payload = JSON.parse(body); } catch { /* text */ } } return this; },
    };
    await webhook({ method: 'POST', headers: req.headers, query: Object.fromEntries(u.searchParams), body: raw }, captured);
    res.writeHead(captured.statusCode, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(captured.payload || {}));
  }
  res.writeHead(404); res.end();
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;

process.env.SUPABASE_URL = base;
process.env.SUPABASE_SERVICE_ROLE = 'browser-service';
process.env.TELEGRAM_WEBHOOK_SECRET = 'browser-secret';
delete process.env.TG_QA_CHAT_ID;
delete process.env.TG_CHAT_ID;
delete process.env.TG_EDU_SOURCE_CHAT;
({ default: webhook } = await import('../../lib/telegram-webhook.mjs'));

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(e.message));
const result = { passed: false, errors: [] };
try {
  await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
  const first = await page.evaluate(() => postUpdate(70001));
  assert.equal(first.status, 200);
  assert.equal(first.body.ok, true);
  assert.ok(!first.body.skipped, 'first delivery must be processed');
  const stored = rows.get('tg_update_dedupe');
  assert.ok(stored, 'durable edu_shared row must be written');
  assert.deepEqual(Object.keys(stored.data.seen), ['70001']);

  const duplicate = await page.evaluate(() => postUpdate(70001));
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.body.skipped, 'duplicate');
  assert.deepEqual(Object.keys(rows.get('tg_update_dedupe').data.seen), ['70001']);
  assert.equal(writes, 1, 'duplicate delivery must not write the dedupe row again');

  const next = await page.evaluate(() => postUpdate(70002));
  assert.equal(next.body.ok, true);
  assert.ok(!next.body.skipped);
  assert.deepEqual(Object.keys(rows.get('tg_update_dedupe').data.seen).sort(), ['70001', '70002']);
  assert.deepEqual(pageErrors, [], 'browser errors');
  result.passed = true;
  console.log(JSON.stringify({ ...result, writes, seen: Object.keys(rows.get('tg_update_dedupe').data.seen) }));
} catch (error) {
  result.error = error.message;
  console.log(JSON.stringify(result));
  process.exitCode = 1;
} finally { await page.close(); await browser.close(); server.close(); }
