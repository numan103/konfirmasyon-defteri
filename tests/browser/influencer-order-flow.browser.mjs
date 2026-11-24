// Fiyat seçimi → ödeme bildirimi → admin onayı → üye geçmişi zincirini
// gerçek sayfa üzerinde doğrular. Supabase yerine durumlu API stub'ı kullanılır.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const arg = key => process.argv.find(v => v.startsWith('--' + key + '='))?.split('=').slice(1).join('=');
const { chromium } = await import(pathToFileURL(path.resolve(arg('playwright'))));
const root = fileURLToPath(new URL('../../', import.meta.url));
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://local').pathname;
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', file.endsWith('.html') ? 'text/html; charset=utf-8'
    : /\.(?:mjs|js)$/.test(file) ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'application/octet-stream');
  res.end(fs.readFileSync(file));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const result = { passed: false, errors: [] };
const txid = 'b'.repeat(64);
const state = { orders: [] };
const prices = { ok: true, prices: { video: 50, guided: 90, growth: 175 }, currency: 'USDT', network: 'TRC20',
  fx: { usdTry: 50, date: '2026-11-23', source: 'Frankfurter / ECB' } };

const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(e.message));
try {
  await page.route('**/api/ai?influencer=1**', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.searchParams.get('op') === 'prices') return route.fulfill({ contentType: 'application/json', body: JSON.stringify(prices) });
    if (request.method() === 'POST') {
      const body = request.postDataJSON();
      if (body.op === 'submit') {
        state.orders.push({ id: 'order-1', package: body.package, status: 'pending', txid: body.txid, created_at: new Date().toISOString() });
        return route.fulfill({ json: { ok: true, status: 'pending', notified: true } });
      }
      if (body.op === 'approve') {
        const order = state.orders.find(o => o.id === body.id);
        if (order) order.status = 'approved';
        return route.fulfill({ json: { ok: !!order } });
      }
    }
    return route.fulfill({ json: {
      ok: true,
      unlocked: state.orders.some(o => o.status === 'approved'),
      orders: state.orders.map(o => ({ id: o.id, package: o.package, status: o.status,
        priceUsdt: prices.prices[o.package], created_at: o.created_at })),
    } });
  });
  await page.route('**/api/edu-shared?kind=influencer-*', route => route.fulfill({ json: { ok: true, data: { topics: [] } } }));

  await page.goto(base + '/?page=influencer', { waitUntil: 'load' });
  // Anonim açılışta landing görünür ve .wrap gizlidir. Gerçek giriş akışındaki
  // onAuthed() adımlarını taklit ederek üye oturumunu ve sayfayı açıyoruz.
  await page.waitForFunction(() => !!document.getElementById('inf-pay-amount'));
  await page.evaluate(() => {
    AUTH.user = { id: 'member-id', email: 'member@example.com' };
    AUTH.client = { auth: {
      getSession: async () => ({ data: { session: { access_token: 'member' } } }),
      refreshSession: async () => ({ data: { session: { access_token: 'member' } }, error: null }),
    } };
    hideLanding();
    document.querySelector('.wrap')?.classList.remove('hidden');
    showPage('influencer');
  });
  await page.locator('#inf-package').waitFor({ state: 'visible' });

  assert.equal(await page.locator('#inf-pay-amount').textContent(), '50 USDT');
  await page.selectOption('#inf-package', 'guided');
  await page.waitForFunction(() => document.getElementById('inf-pay-amount').textContent === '90 USDT');
  const tryText = await page.locator('[data-inf-try="guided"]').textContent();
  assert.match(tryText, /4\.500|4,500/, 'fixed USDT price must drive the TRY estimate: ' + tryText);

  await page.fill('#inf-txid', txid);
  await page.click('#inf-payment-submit');
  await page.waitForFunction(() => document.getElementById('inf-payment-msg').textContent.trim().length > 0);
  assert.equal(state.orders.length, 1);
  assert.equal(state.orders[0].package, 'guided');
  assert.equal(state.orders[0].txid, txid);

  const pending = await page.evaluate(() => infApi());
  assert.equal(pending.unlocked, false);
  assert.equal(pending.orders[0].status, 'pending');
  assert.equal(pending.orders[0].priceUsdt, 90);

  await page.evaluate(() => infApi('', { op: 'approve', id: 'order-1' }));
  const approved = await page.evaluate(() => infApi());
  assert.equal(approved.unlocked, true);
  assert.equal(approved.orders[0].status, 'approved');
  assert.equal(approved.orders[0].priceUsdt, 90);
  assert.deepEqual(pageErrors, [], 'browser errors');
  result.passed = true;
  console.log(JSON.stringify(result));
} catch (error) {
  result.error = error.message;
  console.log(JSON.stringify(result));
  process.exitCode = 1;
} finally { await page.close(); await browser.close(); server.close(); }
