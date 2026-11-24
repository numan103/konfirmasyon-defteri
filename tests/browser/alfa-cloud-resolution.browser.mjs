import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const arg = key => process.argv.find(s => s.startsWith(`--${key}=`))?.slice(key.length + 3);
const { chromium } = await import(pathToFileURL(arg('playwright')));
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage();
const base = arg('url') || 'http://127.0.0.1:4183';
await page.route('**/conflict-test.html', route => route.fulfill({ contentType: 'text/html', body: `
  <button id="resolve">Bulut çakışmasını çöz</button><output id="current">line</output>
  <script type="module">
  import { openCloudConflict } from '/assets/alfa-cloud-conflict.mjs';
  window.state = { local: {chartType:'line'}, remote: {settings:{chartType:'candles'},revision:3}, blocked:true, fail:false, writes:0, backups:[] };
  document.getElementById('resolve').onclick = () => openCloudConflict({
    scope:{owner:'alice',symbol:'BTCUSDT',timeframe:'1h'}, readLocal:()=>state.local,
    load:async()=>structuredClone(state.remote), archive:async local=>{state.backups.push(local);return true;},
    save:async(local,revision)=>{state.writes++; if(!state.fail) state.remote={settings:local,revision:revision+1}; return {ok:true,revision:revision+1};},
    apply:local=>{state.local=local; document.getElementById('current').textContent=local.chartType;},
    finish:()=>{state.blocked=false;}
  });
  </script>` }));
try {
  await page.goto(base + '/conflict-test.html');
  await page.click('#resolve');
  const download = page.waitForEvent('download');
  await page.click('#conflict-export');
  assert.equal((await download).suggestedFilename(), 'alfa-chart-conflict.json');
  assert.equal(await page.evaluate(() => state.blocked), true);
  await page.evaluate(() => { state.fail = true; });
  await page.click('#conflict-local');
  await page.waitForFunction(() => document.getElementById('conflict-result').textContent.includes('doğrulanamadı'));
  assert.equal(await page.evaluate(() => state.blocked), true);
  await page.evaluate(() => { state.fail = false; });
  await page.click('#conflict-local');
  await page.waitForFunction(() => !state.blocked);
  assert.equal(await page.evaluate(() => state.remote.settings.chartType), 'line');
  await page.click('#conflict-close');
  await page.evaluate(() => { state.blocked=true; state.remote={settings:{chartType:'candles'},revision:5}; });
  await page.click('#resolve');
  const writes = await page.evaluate(() => state.writes);
  await page.click('#conflict-cloud');
  await page.waitForFunction(() => !state.blocked);
  assert.equal(await page.locator('#current').textContent(), 'candles');
  assert.equal(await page.evaluate(() => state.writes), writes);
  assert.equal(await page.evaluate(() => state.backups.at(-1).chartType), 'line');
  console.log('PASS: export leaves sync blocked, unverified save cannot resolve, keep-local retries with verification, use-cloud archives local');
} finally { await browser.close(); }
