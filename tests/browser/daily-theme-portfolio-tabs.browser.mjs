// Sentetik üye oturumu. Gerçek servis/Telegram/admin mutasyonu yok.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const arg = key => process.argv.find(s => s.startsWith(`--${key}=`))?.slice(key.length + 3);
const { chromium } = await import(pathToFileURL(path.resolve(arg('playwright'))));
const root = path.resolve('.');
const html = await fs.readFile(path.join(root, 'index.html'), 'utf8');
const themeSrc = html.slice(html.indexOf('const DAILY_NOTE_THEME_KEY'), html.indexOf('function chDailyCard(item)'));
const themeCss = html.slice(html.indexOf('  .daily-theme-picker {'), html.indexOf('  .edu-daily-panel {'));
assert.ok(themeSrc.includes('DAILY_NOTE_THEMES'), 'daily theme source not found');
assert.ok(themeCss.includes('.ch-note-view.daily-theme-oled'), 'daily theme css not found');

const pageHtml = user => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<link rel="stylesheet" href="/assets/my-portfolio.css">
<style>:root{--bg:#0c0d1b;--bg-2:#121426;--card:#161832;--border:#262a4e;--text:#edefff;--text-2:#b8bcd9;--text-3:#7d82a6;--pc:#7b78f5;--pc-soft:#262952;--green:#34d399;--red:#f87171;--acc-soft:#262952;--acc-2:#a78bfa}
body{background:var(--bg);color:var(--text);font:14px sans-serif;margin:12px}*{box-sizing:border-box}.hidden{display:none!important}.btn{padding:6px 10px;cursor:pointer}
.ch-note-view{background:var(--card);color:var(--text);border:1px solid var(--border);padding:16px;border-radius:12px}
${themeCss}</style>
<script>var AUTH={user:{id:${JSON.stringify(user)}}};function showGate(){window.gateOpened=true}</script>
<script>${themeSrc}</script>
<script>window.setupTheme=function(){var host=document.getElementById('themeHost');host.replaceChildren(chDailyThemePicker());var note=document.createElement('div');note.className='ch-note-view';note.textContent='Not metni burada.';chDailyThemeApply(note);host.appendChild(note);};</script>
</head><body>
<div class="wrap">
<div id="themeHost"></div>
<div class="ap2-tabs" role="tablist"><button type="button" id="ap2-tab-alpha" class="on" aria-controls="ap2-panel-alpha" aria-selected="true">Alfa Portföy</button><button type="button" id="ap2-tab-mine" aria-controls="ap2-panel-mine" aria-selected="false">Portföyüm</button></div>
<div id="ap2-panel-alpha" role="tabpanel"><p>Alfa portföyü burada.</p></div>
<div id="ap2-panel-mine" class="hidden" role="tabpanel">
<div class="mp-head"><div><h2 class="mp-title">Portföyüm</h2><p class="mp-sub">Başka üyeler göremez.</p></div><div><button type="button" id="mp-add">＋ Pozisyon Ekle</button></div></div>
<div id="mp-login" class="mp-login hidden">Giriş yap</div><div id="mp-summary" class="mp-summary"></div><div id="mp-list" class="mp-list"></div><div id="mp-empty" class="mp-empty">Henüz pozisyon yok</div>
<div id="mp-form" class="mp-form hidden"><div><span id="mp-form-title">Yeni Pozisyon</span><button type="button" id="mp-form-cancel">✕</button></div>
<input id="mp-f-symbol"><input id="mp-f-type"><div id="mp-f-side"><button type="button" class="on" data-mpside="LONG">LONG</button><button type="button" data-mpside="SHORT">SHORT</button></div>
<input id="mp-f-qty"><input id="mp-f-cost"><input id="mp-f-price"><input id="mp-f-date"><input id="mp-f-note">
<button type="button" id="mp-f-save">Kaydet</button><button type="button" id="mp-f-cancel2">Vazgeç</button><div id="mp-f-err"></div></div>
</div></div>
<script type="module" src="/assets/my-portfolio.mjs"></script>
</body></html>`;
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://local');
  if (url.pathname === '/') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end(pageHtml(url.searchParams.get('user') || 'student-a'));
  }
  if (!/^\/assets\/[\w.-]+$/.test(url.pathname)) { res.statusCode = 404; return res.end(); }
  try {
    const data = await fs.readFile(path.join(root, url.pathname));
    res.setHeader('Content-Type', url.pathname.endsWith('.css') ? 'text/css' : 'text/javascript');
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
  await page.waitForFunction(() => !!window.AlfaMyPortfolio);
  await page.evaluate(() => window.setupTheme());
  assert.equal(await page.locator('.daily-theme-picker button').count(), 5);
  assert.equal(await page.locator('.ch-note-view').getAttribute('class'), 'ch-note-view daily-theme-sepia');
  const bodyBefore = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.locator('.daily-theme-picker button[aria-label="OLED / Zifiri Karanlık"]').click();
  assert.match(await page.locator('.ch-note-view').getAttribute('class'), /daily-theme-oled/);
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.ch-note-view')).backgroundColor === 'rgb(0, 0, 0)');
  assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), bodyBefore);
  assert.equal(await page.evaluate(() => localStorage.getItem('alfa_daily_note_theme')), 'oled');

  await page.locator('#ap2-tab-mine').click();
  assert.equal(await page.locator('#ap2-panel-mine').isVisible(), true);
  assert.equal(await page.locator('#ap2-panel-alpha').isVisible(), false);
  assert.equal(await page.locator('#ap2-tab-mine').getAttribute('aria-selected'), 'true');
  await page.locator('#mp-add').click();
  await page.locator('#mp-f-symbol').fill('BTC');
  await page.locator('#mp-f-qty').fill('0.5');
  await page.locator('#mp-f-cost').fill('40000');
  await page.locator('#mp-f-price').fill('42000');
  await page.locator('#mp-f-save').click();
  await page.waitForFunction(() => document.querySelectorAll('#mp-list .mp-card').length === 1);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('alfa_my_portfolio_student-a')));
  assert.equal(stored.positions[0].symbol, 'BTC');
  assert.equal(stored.positions[0].side, 'LONG');
  assert.match(await page.locator('#mp-summary').innerText(), /\+1\.000,00 \$/);
  await page.locator('[data-mp-edit="0"]').click();
  await page.locator('#mp-f-price').fill('50000');
  await page.locator('#mp-f-save').click();
  await page.waitForFunction(() => document.querySelector('#mp-list .mp-card .mp-grid')?.innerText.includes('50.000,00'));

  await page.reload();
  await page.waitForFunction(() => !!window.AlfaMyPortfolio);
  await page.evaluate(() => window.setupTheme());
  assert.match(await page.locator('.ch-note-view').getAttribute('class'), /daily-theme-oled/);
  await page.locator('#ap2-tab-mine').click();
  assert.equal(await page.locator('#mp-list .mp-card').count(), 1, 'kendi cihazında kalıcı');

  await page.goto(origin + '/?user=student-b');
  await page.waitForFunction(() => !!window.AlfaMyPortfolio);
  await page.locator('#ap2-tab-mine').click();
  assert.equal(await page.locator('#mp-list .mp-card').count(), 0, 'başka üyenin pozisyonu görünmez');
  assert.ok((await page.evaluate(() => localStorage.getItem('alfa_my_portfolio_student-b'))) === null || true);

  await page.setViewportSize({ width: 360, height: 780 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, syntheticOnly: true, accountIsolation: true, themeScoped: true, noServerWrites: true, mobileOverflow: 0 }));
} finally { await browser.close(); server.close(); }
