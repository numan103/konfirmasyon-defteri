// Render a supplied recovery snapshot in an isolated browser; never publish test data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const arg = key => process.argv.find(s => s.startsWith(`--${key}=`))?.slice(key.length + 3);
if (!arg('snapshot') || !arg('playwright')) throw new Error('Pass --snapshot=<local JSON> and --playwright=<index.mjs>');
const saved = JSON.parse(fs.readFileSync(arg('snapshot'), 'utf8')), data = saved.data || saved;
const { chromium } = await import(pathToFileURL(path.resolve(arg('playwright'))));
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const page = await browser.newPage(), errors = [], writes = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', req => { if (req.method() === 'POST' && req.url().includes('kind=portfolio')) writes.push(req.url()); });
try {
  await page.goto((arg('url') || 'https://alfa-trader.com') + '/?page=home');
  await page.waitForFunction(() => typeof renderAlfaPortfoy2 === 'function' && typeof AUTH !== 'undefined' && AUTH.client);
  await page.evaluate(snapshot => {
    // Client-only fixture rendering. No JWT, account or server permission is changed.
    siteIsAdmin = () => true;
    ap2IsMember = () => true;
    ap2LoadPrices = () => {};
    ap2Data = snapshot; ap2Ideas = snapshot.ideas || [];
    ap2CloudReady = true; ap2LocalPreview = false; ap2ReadOnly = false; ap2ReadOnlyLoaded = true;
    localStorage.setItem('alfa-fund-hist-v1', JSON.stringify(snapshot.history || []));
    document.getElementById('page-home').classList.add('hidden');
    document.getElementById('page-portfoy').classList.remove('hidden');
    renderAlfaPortfoy2();
  }, data);
  const observed = await page.evaluate(() => ({
    goldCards: document.querySelectorAll('#page-portfoy .ap2-card[data-ap2id^="gold_xau_"]').length,
    saleRows: document.querySelectorAll('#ap2-trades-body .ap2-trade-row').length,
    realized: document.getElementById('ap2-realized-pnl')?.textContent,
    saleTotal: document.getElementById('ap2-trades-total')?.textContent,
    summary: ap2Summary(), summaryShown: getComputedStyle(document.querySelector('#page-portfoy .ap2-layout')).display !== 'none'
  }));
  assert.equal(observed.goldCards, data.positions.filter(p => p.type === 'altin').length);
  assert.equal(observed.saleRows, data.sells.length);
  assert.ok(observed.realized, 'realized profit must be visible in the top summary');
  assert.match(observed.realized, /268[,.]58/);
  assert.match(observed.saleTotal, /268[,.]58/);
  assert.equal(observed.summaryShown, true);
  assert.ok(Math.abs(observed.summary.realizedPnl - 268.576777025) < 1e-8);
  assert.deepEqual(writes, []);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, mode: 'isolated UI rendering of supplied recovery snapshot',
    goldCards: observed.goldCards, sales: observed.saleRows, realized: observed.realized, noPortfolioWrites: true }));
} finally { await browser.close(); }
