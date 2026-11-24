// Cloudflare _redirects kısa linklerinin gerçek tarayıcıda doğru Telegram
// hedefine gittiğini doğrular. Yerel sunucu Cloudflare _redirects kuralını
// taklit eder; t.me hedefi ağa çıkmadan Playwright ile karşılanır.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const arg = key => process.argv.find(v => v.startsWith('--' + key + '='))?.split('=').slice(1).join('=');
const { chromium } = await import(pathToFileURL(path.resolve(arg('playwright'))));
const root = fileURLToPath(new URL('../..', import.meta.url));
const rules = fs.readFileSync(path.join(root, '_redirects'), 'utf8')
  .split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
    const [from, to, code] = line.split(/\s+/);
    return { from, to, code: Number(code.replace('!', '')), forced: code.endsWith('!') };
  });
assert.ok(rules.length >= 4);

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://local').pathname;
  const rule = rules.find(r => r.from === pathname);
  if (rule) {
    res.writeHead(rule.code, { Location: rule.to });
    return res.end();
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end('<!doctype html><meta charset="utf-8"><title>kisa link</title>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage();
await page.route('https://t.me/**', route => route.fulfill({
  status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><title>telegram</title>',
}));
const result = { passed: false, errors: [], checked: [] };
try {
  for (const rule of rules) {
    await page.goto(base + rule.from, { waitUntil: 'domcontentloaded' });
    assert.equal(page.url(), rule.to, `${rule.from} wrong redirect target`);
    result.checked.push({ from: rule.from, to: rule.to, status: rule.code });
  }
  result.passed = true;
  console.log(JSON.stringify(result));
} catch (error) {
  result.error = error.message;
  console.log(JSON.stringify(result));
  process.exitCode = 1;
} finally { await page.close(); await browser.close(); server.close(); }
