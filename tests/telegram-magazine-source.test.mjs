import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMagazineWidget } from '../lib/telegram-magazine-source.mjs';
import { previewRequest } from '../assets/admin-preview-policy.mjs';
const html = (thread = 977, photo = 'https://cdn4.telesco.pe/file/photo.jpg') => `<div data-post="alfakasim/987">
<a class="tgme_widget_message_reply user-color-default" href="https://t.me/alfakasim/${thread}"></a>
<a class="tgme_widget_message_photo_wrap" style="background-image:url('${photo}')"></a>
<div class="tgme_widget_message_text js-message_text" dir="auto">BTC - HTF<br/>Gerçek bilgi &amp; görsel</div>
<time datetime="2026-11-20T19:09:35+00:00"></time></div>`;
test('owner link is parsed as mentorship 977, credited to Trader Ahmet, photos proxied same-origin', () => {
  const entry = parseMagazineWidget(html(), 987);
  assert.equal(entry.sourceThread, 977); assert.equal(entry.authorId, 'traderahmetd');
  assert.equal(entry.body, 'BTC - HTF\nGerçek bilgi & görsel');
  assert.deepEqual(entry.images, ['/api/tg?magPhoto=publicmag_987_0']);
  assert.equal(entry.publishedAt, '2026-11-20T19:09:35.000Z');
});
test('other topics, forged message ids and arbitrary photo hosts fail closed', () => {
  assert.equal(parseMagazineWidget(html(6), 987), null);
  assert.equal(parseMagazineWidget(html(), 986), null);
  assert.deepEqual(parseMagazineWidget(html(977, 'https://example.com/file.jpg'), 987).images, []);
  assert.equal(parseMagazineWidget(html(), 999), null);
});
test('historic photo proxy remains readable through the immutable read-only preview policy', () => {
  const url = '/api/tg?magPhoto=publicmag_987_0';
  assert.deepEqual(previewRequest(url, 'GET', 'free', 'https://alfa-trader.com'), { url, authenticated: false });
  assert.equal(previewRequest(url, 'POST', 'free', 'https://alfa-trader.com').status, 403);
});
