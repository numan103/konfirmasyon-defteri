// Isolated synthetic new-member fixture. No production calls, no Telegram access.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const arg = key => process.argv.find(s => s.startsWith(`--${key}=`))?.slice(key.length + 3);
const { chromium } = await import(pathToFileURL(path.resolve(arg('playwright'))));
const root = path.resolve('.');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aU1sAAAAASUVORK5CYII=', 'base64');
const pageHtml = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<link rel="stylesheet" href="/assets/mentor-before-after.css">
<script>
var AUTH = { user: { id: 'new-member' } };
window.imageCalls = [];
window.siteFetch = async url => {
  window.imageCalls.push(url);
  return new Response(new Uint8Array(${JSON.stringify([...png])}), { status: 200, headers: { 'Content-Type': 'image/png' } });
};
</script></head><body style="background:#0d0f18;color:#eee;margin:12px">
<div id="host"></div>
<script type="module">import { renderMentorBeforeAfter } from '/assets/mentor-before-after.mjs'; window.renderBeforeAfter = renderMentorBeforeAfter;</script>
</body></html>`;
const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://local').pathname;
  if (pathname === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end(pageHtml); }
  if (!/^\/assets\/[\w.-]+$/.test(pathname)) { res.statusCode = 404; return res.end(); }
  try {
    const data = await fs.readFile(path.join(root, pathname));
    res.setHeader('Content-Type', pathname.endsWith('.css') ? 'text/css' : 'text/javascript');
    res.end(data);
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1120, height: 900 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin);
  await page.waitForFunction(() => typeof window.renderBeforeAfter === 'function');
  const id = 'mentortrade_' + 'a'.repeat(64);
  await page.evaluate(recordId => window.renderBeforeAfter(document.getElementById('host'), [
    { id: recordId, coin: 'BTC', r: 2.3, date: 1795019005, imageCount: 2 },
    { id: 'mentortrade_' + 'b'.repeat(64), coin: 'ETH', r: -1, date: 1795105405, imageCount: 1 },
  ]), id);
  await page.waitForFunction(() => document.querySelectorAll('#host .mentor-ba-card').length === 1 &&
    document.querySelectorAll('#host .mentor-ba img').length === 2);
  const text = await page.locator('#host').innerText();
  assert.match(text, /ALFA TOOL · ÖNCE \/ SONRA/);
  assert.match(text, /ÖNCE · İlk grafik/);
  assert.match(text, /SONRA · Sonuç/);
  assert.match(text, /\+2,3R/);
  assert.ok(!text.includes('Telegram'));
  assert.equal(await page.locator('#host a').count(), 0);
  const calls = await page.evaluate(() => window.imageCalls);
  assert.equal(calls.length, 2);
  assert.match(calls[0], /\/api\/ai\?mentorTrades=1&image=mentortrade_[a-f0-9]{64}&index=1/);
  assert.match(calls[1], /\/api\/ai\?mentorTrades=1&image=mentortrade_[a-f0-9]{64}&index=0/);
  assert.ok(calls.every(url => !url.includes('t.me')));
  await page.setViewportSize({ width: 360, height: 780 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, syntheticOnly: true, beforeAfter: true, noTelegramLink: true, mobileOverflow: 0 }));
} finally { await browser.close(); server.close(); }
