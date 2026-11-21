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
const mpMatch = html.match(/<div id="mp-app">[\s\S]*?<div id="mp-toast" class="at-toast"><\/div>\s*<\/div>/);
assert.ok(mpMatch, 'my portfolio clone markup not found');
const mpMarkup = mpMatch[0];

const pageHtml = user => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<link rel="stylesheet" href="/assets/my-portfolio.css">
<style>:root{--bg:#0c0d1b;--bg-2:#121426;--card:#161832;--border:#262a4e;--text:#edefff;--text-2:#b8bcd9;--text-3:#7d82a6;--pc:#7b78f5;--pc-soft:#262952;--green:#34d399;--red:#f87171;--amber:#fbbf24;--acc-soft:#262952;--acc-2:#a78bfa}
body{background:var(--bg);color:var(--text);font:14px sans-serif;margin:12px}*{box-sizing:border-box}.hidden{display:none!important}.btn{padding:6px 10px;cursor:pointer}
.ch-note-view{background:var(--card);color:var(--text);border:1px solid var(--border);padding:16px;border-radius:12px}
.ap2-sum-sm,.ap2-card,.ap2-donut-panel,.ap2-chart-panel,.ap2-ideas{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:10px;margin-bottom:8px}
.ap2-grid{display:grid;gap:8px}.ap2-sum-row{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.ap2-layout{display:grid;grid-template-columns:1fr 260px;gap:10px}
@media(max-width:860px){.ap2-layout,.ap2-sum-row{grid-template-columns:1fr}}
input,select,button{max-width:100%}.ap2-hd-actions,.mp-portfolio-bar{display:flex;flex-wrap:wrap;gap:6px}
.at-toast{position:fixed;bottom:12px;left:12px;background:var(--card);border:1px solid var(--pc);padding:8px 12px;border-radius:8px;opacity:0;pointer-events:none}.at-toast.open{opacity:1}
${themeCss}</style>
<script>var AUTH={user:{id:${JSON.stringify(user)}}};function showGate(){window.gateOpened=true}</script>
<script>${themeSrc}</script>
<script>window.setupTheme=function(){var host=document.getElementById('themeHost');host.replaceChildren(chDailyThemePicker());var note=document.createElement('div');note.className='ch-note-view';note.textContent='Not metni burada.';chDailyThemeApply(note);host.appendChild(note);};</script>
</head><body>
<div class="wrap">
<div id="themeHost"></div>
<div class="ap2-tabs" role="tablist"><button type="button" id="ap2-tab-alpha" class="on" aria-controls="ap2-panel-alpha" aria-selected="true">Alfa Portföy</button><button type="button" id="ap2-tab-mine" aria-controls="ap2-panel-mine" aria-selected="false">Portföyüm</button></div>
<div id="ap2-panel-alpha" role="tabpanel"><p>Alfa portföyü burada.</p></div>
<div id="ap2-panel-mine" class="hidden" role="tabpanel">${mpMarkup}</div>
</div>
<script>
window.__priceFetchCount = 0;
window.fetch = function (url) {
  window.__priceFetchCount++;
  if (String(url).indexOf('api.binance.com') >= 0) {
    return Promise.resolve({ ok: true, json: function () { return Promise.resolve([{ symbol: 'BTCUSDT', lastPrice: '63000' }]); } });
  }
  return Promise.reject(new Error('beklenmeyen fiyat kaynagi: ' + url));
};
</script>
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
  await page.locator('#mp-f-sym').fill('BTC');
  await page.locator('#mp-f-amount').fill('20000');
  await page.locator('#mp-f-cost').fill('40000');
  await page.locator('#mp-f-price').fill('42000');
  await page.locator('#mp-f-save').click();
  assert.deepEqual(errors, [], errors.join(' | '));
  assert.equal(await page.locator('#mp-f-err').innerText(), '', 'form error: ' + await page.locator('#mp-f-err').innerText());
  await page.waitForFunction(() => document.querySelectorAll('#mp-grid .ap2-card').length === 1);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('alfa_my_portfolios_student-a')));
  const pf = stored.items[stored.active];
  assert.equal(pf.positions[0].symbol, 'BTC');
  assert.equal(pf.positions[0].side, 'LONG');
  assert.ok(Math.abs(pf.positions[0].qty - 0.5) < 1e-9, 'tutar / giriş fiyatı = adet');
  assert.match(await page.locator('#mp-summary-area').innerText(), /\+1\.000,00 \$/);
  assert.match(await page.locator('#mp-title').innerText(), /Portföyüm/);

  // Canlı fiyat: stub'lanan Binance yanıtı kartı, özeti ve durumu günceller; yerel kayda yazmaz.
  await page.evaluate(() => window.AlfaMyPortfolio.refreshPrices(true));
  await page.waitForFunction(() => document.querySelector('#mp-grid .ap2-card-prices')?.innerText.includes('63.000,00'));
  assert.match(await page.locator('#mp-summary-area').innerText(), /\+11\.500,00 \$/, '0.5 BTC * (63000-40000)');
  assert.match(await page.locator('#mp-price-status').innerText(), /CANLI/);
  assert.equal(await page.locator('#mp-price-status').getAttribute('data-state'), 'live');
  assert.ok(await page.evaluate(() => window.__priceFetchCount >= 1), 'canlı fiyat fetch çağrısı yapıldı');
  assert.equal(await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('alfa_my_portfolios_student-a'));
    return d.items[d.active].positions[0].price;
  }), 42000, 'canlı fiyat kalıcı veriye yazılmaz');

  await page.locator('#mp-grid [data-mp-edit]').first().click();
  await page.locator('#mp-f-price').fill('50000');
  await page.locator('#mp-f-save').click();
  await page.waitForFunction(() => document.querySelector('#mp-grid .ap2-card-prices')?.innerText.includes('50.000,00'));

  page.once('dialog', d => d.accept('Uzun Vadeli'));
  await page.locator('#mp-new').click();
  await page.waitForFunction(() => document.querySelectorAll('#mp-select option').length === 2);
  assert.match(await page.locator('#mp-title').innerText(), /Uzun Vadeli/);
  assert.equal(await page.locator('#mp-grid .ap2-card').count(), 0, 'yeni portföy boş başlar');
  await page.locator('#mp-select').selectOption({ index: 0 });
  assert.equal(await page.locator('#mp-grid .ap2-card').count(), 1, 'portföyler birbirinden ayrı');

  await page.reload();
  await page.waitForFunction(() => !!window.AlfaMyPortfolio);
  await page.evaluate(() => window.setupTheme());
  assert.match(await page.locator('.ch-note-view').getAttribute('class'), /daily-theme-oled/);
  await page.locator('#ap2-tab-mine').click();
  assert.equal(await page.locator('#mp-grid .ap2-card').count(), 1, 'kendi cihazında kalıcı');

  await page.goto(origin + '/?user=student-b');
  await page.waitForFunction(() => !!window.AlfaMyPortfolio);
  await page.locator('#ap2-tab-mine').click();
  assert.equal(await page.locator('#mp-grid .ap2-card').count(), 0, 'başka üyenin pozisyonu görünmez');
  assert.equal(await page.evaluate(() => localStorage.getItem('alfa_my_portfolios_student-b') === null), true);

  await page.setViewportSize({ width: 360, height: 780 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, syntheticOnly: true, accountIsolation: true, themeScoped: true, noServerWrites: true, mobileOverflow: 0 }));
} finally { await browser.close(); server.close(); }
