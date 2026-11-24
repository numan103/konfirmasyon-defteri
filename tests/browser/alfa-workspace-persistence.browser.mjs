// Two separate browser contexts represent two devices; only the HTTP DB fixture is shared.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const arg = key => process.argv.find(s => s.startsWith(`--${key}=`))?.slice(key.length + 3);
const { chromium } = await import(pathToFileURL(arg('playwright')));
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const base = arg('url') || 'http://127.0.0.1:4183', rows = new Map(), errors = [];
let unavailable = false;
const html = `<nav id="chart-tabs"></nav><div id="chart-panel-single"></div>
  <div class="layout-buttons"><button data-layout="4">4 grafik</button></div>
  <section id="multi-chart"><nav id="multi-tabs"></nav><button id="multi-add">Grafik ekle</button>
  <button id="workspace-conflict" hidden>Düzen çakışmasını çöz</button><div id="multi-grid"></div></section>
  <input type="checkbox" data-multi-sync="symbol"><input type="checkbox" data-multi-sync="crosshair">
  <input type="checkbox" data-multi-sync="range"><input type="checkbox" data-multi-sync="interval">
  <output id="status"></output><button id="bob">Bob hesabı</button>
  <script type="module">
    import { initMultiChart } from '/assets/alfa-multichart.mjs';
    window.owner='alice';
    const store = { get user(){return {id:owner};},
      loadWorkspace:async owner=>(await fetch('/workspace-db?owner='+owner)).json(),
      saveWorkspace:async(owner,workspace,revision)=>(await fetch('/workspace-db', {method:'POST',body:JSON.stringify({owner,workspace,revision})})).json() };
    window.m=initMultiChart({getOwner:()=>owner,cloudStore:store,getSymbol:()=> 'BTCUSDT',getInterval:()=> '1h',
      onStatus:message=>document.getElementById('status').textContent=message});
    document.getElementById('bob').onclick=()=>{owner='bob';m.account();};
  </script>`;
async function device() {
  const context = await browser.newContext();
  await context.route('**/workspace-device.html', route => route.fulfill({ contentType: 'text/html', body: html }));
  await context.route('**/alfa-charts.html?embed=1**', route => route.fulfill({ contentType: 'text/html', body: '<button>Chart</button>' }));
  await context.route('**/workspace-db**', async route => {
    if (unavailable) return route.fulfill({ json: { ok: false } });
    const request = route.request();
    if (request.method() === 'GET') {
      const row = rows.get(new URL(request.url()).searchParams.get('owner'));
      return route.fulfill({ json: { ok: true, workspace: row?.workspace || null, revision: row?.revision || 0 } });
    }
    const { owner, workspace, revision } = JSON.parse(request.postData());
    const current = rows.get(owner)?.revision || 0;
    if (current !== revision) return route.fulfill({ json: { ok: false, conflict: true } });
    rows.set(owner, { workspace, revision: revision + 1 });
    return route.fulfill({ json: { ok: true, revision: revision + 1 } });
  });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '/workspace-device.html');
  await page.waitForFunction(() => window.m);
  return page;
}
try {
  const a = await device();
  await a.waitForFunction(() => document.getElementById('status').textContent.includes('kaydedildi'));
  await a.click('[data-layout="4"]');
  await a.selectOption('[data-pane-interval]', '4h');
  for (const [symbol, tf] of [['BTCUSDT', '1h'], ['ETHUSDT', '15m'], ['OKX:BTCUSDT.P', '5m']]) {
    await a.click('#multi-add');
    await a.fill('#multi-add-symbol', symbol);
    await a.selectOption('#multi-add-form select[name="interval"]', tf);
    await a.click('#multi-add-form button[type=submit]');
  }
  await a.evaluate(() => { document.getElementById('status').textContent = ''; });
  await a.check('[data-multi-sync="symbol"]');
  await a.uncheck('[data-multi-sync="crosshair"]');
  const expected = await a.evaluate(() => structuredClone(m.state));
  await a.waitForFunction(() => document.getElementById('status').textContent.includes('kaydedildi'));
  assert.deepEqual(rows.get('alice').workspace, expected);
  const b = await device();
  await b.waitForFunction(() => document.getElementById('status').textContent.includes('yüklendi'));
  assert.deepEqual(await b.evaluate(() => m.state), expected);
  await b.reload();
  await b.waitForFunction(() => window.m && document.getElementById('status').textContent.includes('yüklendi'));
  assert.deepEqual(await b.evaluate(() => m.state), expected);
  // An offline local edit must not disappear when a newer remote version arrives.
  unavailable = true;
  await b.uncheck('[data-multi-sync="symbol"]');
  await b.waitForFunction(() => document.getElementById('status').textContent.includes('kaydedilemedi'));
  unavailable = false;
  await a.evaluate(() => { document.getElementById('status').textContent = ''; });
  await a.check('[data-multi-sync="interval"]');
  await a.waitForFunction(() => document.getElementById('status').textContent.includes('kaydedildi'));
  assert.equal(rows.get('alice').workspace.sync.interval, true);
  await b.reload();
  await b.waitForFunction(() => !document.getElementById('workspace-conflict').hidden);
  assert.equal(await b.evaluate(() => m.state.sync.symbol), false);
  await b.click('#workspace-conflict');
  await b.click('#conflict-cloud');
  await b.waitForFunction(() => document.getElementById('workspace-conflict').hidden);
  await b.waitForFunction(() => document.getElementById('conflict-result').textContent.includes('doğrulandı'));
  assert.equal(await b.evaluate(() => m.state.sync.interval), true, JSON.stringify({ remote: rows.get('alice'), local: await b.evaluate(() => m.state) }));
  await b.click('#conflict-close');
  await b.click('#bob');
  await b.waitForFunction(() => m.state.panes.length === 1 && m.state.panes[0].interval === '1h');
  assert.equal(await b.evaluate(() => JSON.parse(localStorage.getItem('alfa-chart-tabs:v1:alice')).panes.length), 4);
  assert.deepEqual(errors, []);
  console.log('PASS: account workspace saves, second-device restore/reload, four independent intervals, sync preferences, offline conflict choice, account isolation');
} finally { await browser.close(); }
