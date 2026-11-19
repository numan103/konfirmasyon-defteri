import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import middleware from '../middleware.js';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const head = html.slice(0, html.indexOf('</head>'));
test('share metadata presents Alfa Traders, not the old journal brand', () => {
  assert.doesNotMatch(head, /Konfirmasyon Defteri|Konfluens analizi|işlem karnesi|https:\/\/alfa-trader\.com\/og\.png/i);
  for (const tag of ['og:title', 'og:description', 'twitter:title', 'twitter:description']) {
    assert.match(head, new RegExp('(?:property|name)="' + tag + '" content="[^"]*Alfa Traders'));
  }
  assert.equal((head.match(/https:\/\/alfa-trader\.com\/alfa-traders-share-v2\.png/g) || []).length, 2);
});
test('social crawlers receive the new brand on root, home and fallback links', async () => {
  for (const bot of ['TelegramBot (like TwitterBot)', 'WhatsApp', 'facebookexternalhit', 'Twitterbot', 'Discordbot']) {
    for (const path of ['/', '/?page=home', '/?page=unknown', '/index.html']) {
      const response = await middleware(new Request('https://alfa-trader.com' + path, { headers: { 'user-agent': bot } }));
      const body = await response.text();
      assert.match(body, /Alfa Traders — Eğitim, Analiz ve Topluluk/);
      assert.match(body, /https:\/\/alfa-trader.com\/alfa-traders-share-v2.png/);
      assert.doesNotMatch(body, /Konfirmasyon Defteri|Konfluens analizi|işlem karnesi/);
    }
  }
  assert.equal(await middleware(new Request('https://alfa-trader.com', { headers: { 'user-agent': 'Mozilla/5.0' } })), undefined);
});
test('share PNG is a real 1200×630 image and legacy image is updated too', () => {
  const png = fs.readFileSync(new URL('../alfa-traders-share-v2.png', import.meta.url));
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
  assert.deepEqual(png, fs.readFileSync(new URL('../og.png', import.meta.url)));
});
