// Isolated real-browser test of the existing coordinator and postMessage bridge.
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const arg = key => process.argv.find(s => s.startsWith(`--${key}=`))?.slice(key.length + 3);
const { chromium } = await import(pathToFileURL(arg('playwright')));

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const base = arg('url') || 'http://127.0.0.1:4181';
await page.route('**/multichart-test.html', route => route.fulfill({ contentType: 'text/html', body: `
  <nav id="chart-tabs"></nav><div id="chart-panel-single"></div>
  <section id="multi-chart"><nav id="multi-tabs"></nav><div id="multi-grid"></div></section>
  <input type="checkbox" data-multi-sync="symbol"><input type="checkbox" data-multi-sync="crosshair">
  <input type="checkbox" data-multi-sync="range"><input type="checkbox" data-multi-sync="interval">
  <script type="module">
    import { initMultiChart } from '/assets/alfa-multichart.mjs';
    window.m = initMultiChart({ getSymbol: () => 'BTCUSDT', getInterval: () => '1h' });
  </script>` }));
await page.route('**/alfa-charts.html?embed=1**', route => route.fulfill({ contentType: 'text/html', body: `
  <button id="focus">Chart</button><script type="module">
    import { createMessageGate } from '/assets/alfa-multichart-sync.mjs';
    const q = new URLSearchParams(location.search);
    window.context = { symbol: q.get('symbol'), interval: q.get('interval') };
    window.log = [];
    window.gate = createMessageGate({ session: q.get('mcid'), instance: crypto.randomUUID(),
      paneId: Number(q.get('pane')), post: message => parent.postMessage(message, location.origin) });
    addEventListener('message', event => {
      if (event.source !== parent || event.origin !== location.origin) return;
      log.push(event.data);
      const {type, payload} = event.data;
      if (['state', 'symbol', 'interval'].includes(type)) {
        if (payload.symbol) context.symbol = payload.symbol;
        if (payload.interval) context.interval = payload.interval;
      }
    });
    gate.send('hello', context);
  </script>` }));
try {
  await page.goto(base + '/multichart-test.html');
  await page.waitForFunction(() => window.m);
  await page.evaluate(() => {
    m.setPaneInterval(m.state.panes[0].id, '4h');
    for (const tf of ['1h', '15m', '5m']) m.addPane('BTCUSDT', tf);
    m.setOpen(true);
  });
  await page.waitForFunction(() => [...document.querySelectorAll('iframe')].every(f => f.contentWindow.log?.some(m => m.type === 'state')));
  await page.evaluate(() => document.querySelectorAll('iframe').forEach(f => { f.probe = true; }));
  await page.check('[data-multi-sync="symbol"]');
  await page.evaluate(() => m.notifySymbol('ETHUSDT', '1h'));
  await page.waitForFunction(() => [...document.querySelectorAll('iframe')].every(f => f.contentWindow.context?.symbol === 'ETHUSDT'));
  assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('iframe')].map(f => f.contentWindow.context.interval)), ['4h', '1h', '15m', '5m']);
  assert.ok(await page.evaluate(() => [...document.querySelectorAll('iframe')].every(f => f.probe)));
  await page.uncheck('[data-multi-sync="symbol"]');
  const frames = page.frames().filter(f => f.parentFrame());
  await frames[1].click('#focus');
  await page.waitForFunction(() => m.state.active === m.state.panes[1].id);
  await page.evaluate(() => m.notifySymbol('OKX:BTCUSDT.P', '1h'));
  await page.waitForFunction(() => document.querySelectorAll('iframe')[1].contentWindow.context.symbol === 'OKX:BTCUSDT.P');
  assert.deepEqual(await page.evaluate(() => m.state.panes.map(p => p.symbol)), ['ETHUSDT', 'OKX:BTCUSDT.P', 'ETHUSDT', 'ETHUSDT']);
  await page.selectOption('[data-pane-interval]', '15m');
  await page.waitForFunction(() => document.querySelector('iframe').contentWindow.context.interval === '15m');
  await page.check('[data-multi-sync="interval"]');
  await frames[1].evaluate(() => gate.send('interval', { interval: '5m' }));
  await page.waitForFunction(() => [...document.querySelectorAll('iframe')].every(f => f.contentWindow.context.interval === '5m'));
  await page.uncheck('[data-multi-sync="crosshair"]');
  await page.uncheck('[data-multi-sync="range"]');
  await page.evaluate(() => m.syncFromMain('crosshair', { visible: false }));
  await frames[0].evaluate(() => gate.send('range', { logical: { from: 1, to: 20 } }));
  await page.waitForTimeout(200);
  assert.equal(await frames[1].evaluate(() => log.filter(m => m.type === 'range' || m.type === 'crosshair').length), 0);
  assert.ok(await page.evaluate(() => [...document.querySelectorAll('iframe')].every(f => f.probe)));
  const before = await page.evaluate(() => structuredClone(m.state));
  await page.reload();
  await page.waitForFunction(() => window.m);
  assert.deepEqual(await page.evaluate(() => m.state), before);
  assert.deepEqual(errors, []);
  console.log('PASS: four timeframes preserved, active-pane routing, iframe focus, interval sync, sync-off isolation, no iframe rebuild, local persistence');
} finally { await browser.close(); }
