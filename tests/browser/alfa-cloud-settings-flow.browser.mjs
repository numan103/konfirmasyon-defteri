// Full chart + real settings store; only auth, DB and market HTTP responses are fixtures.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const arg = key => process.argv.find(s => s.startsWith(`--${key}=`))?.slice(key.length + 3);
const { chromium } = await import(pathToFileURL(arg('playwright')));
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage();
const base = arg('url') || 'http://127.0.0.1:4183', errors = [];
let remote = { settings: { chartType: 'candles', indicators: [], studies: {} }, revision: 4 }, failVerify = false;
page.on('pageerror', e => errors.push(e.message));
await page.addInitScript(() => {
  const user = { id: 'fixture-alice' }, settings = { chartType: 'line', indicators: [], studies: {} };
  if (!localStorage.getItem('__seeded')) {
    localStorage.setItem('sb-fssrtlpjqbavzomynwmg-auth-token', JSON.stringify({ user }));
    localStorage.setItem('alfa-chart-layout:v1:fixture-alice:BTCUSDT:1h', JSON.stringify(settings));
    localStorage.setItem('alfa-chart-settings-conflict:v1:fixture-alice:BTCUSDT:1h', JSON.stringify({ settings }));
    localStorage.setItem('__seeded', '1');
  }
  window.supabase = { createClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: { user, access_token: 'fixture' } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } })
    },
    from(table) {
      let op = 'read', row;
      return {
        select() { return this; }, eq() { return this; },
        insert(value) { op = 'write'; row = value; return this; },
        update(value) { op = 'write'; row = value; return this; },
        async maybeSingle() { return (await fetch('/settings-fixture', { method: 'POST', body: JSON.stringify({ table, op, row }) })).json(); }
      };
    }
  }) };
});
await page.route('**/settings-fixture', async route => {
  const { table, op, row } = JSON.parse(route.request().postData());
  if (table !== 'chart_settings') return route.fulfill({ json: { data: null, error: null } });
  if (op === 'read') return route.fulfill({ json: { data: remote, error: null } });
  if (!failVerify) remote = { settings: row.settings, revision: row.revision };
  return route.fulfill({ json: { data: { revision: row.revision }, error: null } });
});
await page.routeWebSocket(/wss:\/\//, () => {});
await page.route(/https:\/\/(?:data-api\.binance\.vision|api\.binance\.com)\//, route => {
  const u = new URL(route.request().url());
  if (!u.pathname.endsWith('/klines')) return route.fulfill({ json: u.pathname.endsWith('/exchangeInfo') ? { symbols: [] } : [] });
  const end = Math.floor(Date.now() / 3600000) * 3600000;
  return route.fulfill({ json: Array.from({ length: 150 }, (_, i) => [end - (149 - i) * 3600000, '60000', '60300', '59800', '60100', '25']) });
});
await page.route(url => url.origin === new URL(base).origin && url.pathname.startsWith('/api/'), route => route.fulfill({ json: { ok: true, quotes: {} } }));
try {
  await page.goto(base + '/alfa-charts.html?debug=1&symbol=BTCUSDT&interval=1h');
  await page.waitForFunction(() => window.__alfaDebug?.ready && !document.getElementById('cloud-conflict').hidden);
  assert.equal(await page.inputValue('#chart-type'), 'line');
  await page.click('#cloud-conflict');
  const download = page.waitForEvent('download');
  await page.click('#conflict-export');
  assert.equal((await download).suggestedFilename(), 'alfa-chart-conflict.json');
  failVerify = true;
  await page.click('#conflict-local');
  await page.waitForFunction(() => document.getElementById('conflict-result').textContent.includes('doğrulanamadı'));
  assert.equal(await page.locator('#cloud-conflict').isVisible(), true);
  await page.click('#conflict-close');
  await page.reload();
  await page.waitForFunction(() => window.__alfaDebug?.ready && !document.getElementById('cloud-conflict').hidden);
  assert.equal(await page.inputValue('#chart-type'), 'line');
  failVerify = false;
  await page.click('#cloud-conflict');
  await page.click('#conflict-cloud');
  await page.waitForFunction(() => document.getElementById('cloud-conflict').hidden);
  assert.equal(await page.inputValue('#chart-type'), 'candles');
  assert.equal(await page.evaluate(() => localStorage.getItem('alfa-chart-settings-conflict:v1:fixture-alice:BTCUSDT:1h')), null);
  assert.ok(await page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith('alfa-chart-settings-backup:v1:fixture-alice:BTCUSDT:1h:'))));
  await page.click('#conflict-close');
  // A second conflict exercises Keep Local through the full chart/store wiring.
  remote = { settings: { chartType: 'line', indicators: [], studies: {} }, revision: remote.revision + 1 };
  await page.evaluate(() => {
    const settings = JSON.parse(localStorage.getItem('alfa-chart-layout:v1:fixture-alice:BTCUSDT:1h'));
    localStorage.setItem('alfa-chart-settings-conflict:v1:fixture-alice:BTCUSDT:1h', JSON.stringify({ settings }));
  });
  await page.reload();
  await page.waitForFunction(() => window.__alfaDebug?.ready && !document.getElementById('cloud-conflict').hidden);
  assert.equal(await page.inputValue('#chart-type'), 'candles');
  await page.click('#cloud-conflict');
  await page.click('#conflict-local');
  await page.waitForFunction(() => document.getElementById('cloud-conflict').hidden);
  assert.equal(remote.settings.chartType, 'candles');
  await page.click('#conflict-close');
  const saved = page.waitForResponse(response => {
    if (!response.url().endsWith('/settings-fixture')) return false;
    const body = JSON.parse(response.request().postData());
    return body.table === 'chart_settings' && body.op === 'write' && body.row.settings.chartType === 'line';
  });
  await page.selectOption('#chart-type', 'line');
  await saved;
  assert.equal(remote.settings.chartType, 'line');
  assert.deepEqual(errors, []);
  console.log('PASS: full chart conflict button, download, failed verification/reload preserves local, both explicit choices, backup, autosync resumes only after verified resolution');
} finally { await browser.close(); }
