import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMagazineWidget, readMagazineMessage, magazinePublicPhoto, LEGACY_MAGAZINE_MESSAGES } from '../lib/telegram-magazine-source.mjs';
import { legacyMagazinePhoto, LEGACY_MAGAZINE_PHOTOS } from '../lib/legacy-magazine-photos.mjs';
import { previewRequest } from '../assets/admin-preview-policy.mjs';
const html = (thread = 977, photo = 'https://cdn4.telesco.pe/file/photo.jpg', message = 987) => `<div data-post="alfakasim/${message}">
<a class="tgme_widget_message_reply user-color-default" href="https://t.me/alfakasim/${thread}"></a>
<a class="tgme_widget_message_photo_wrap" style="background-image:url('${photo}')"></a>
<div class="tgme_widget_message_text js-message_text" dir="auto">BTC - HTF<br/>Gerçek bilgi &amp; görsel</div>
<time datetime="2026-11-20T19:09:35+00:00"></time></div>`;
test('owner link is parsed as mentorship 977, credited to Trader Ahmet, photos proxied same-origin', () => {
  const entry = parseMagazineWidget(html(), 987);
  assert.equal(entry.sourceThread, 977); assert.equal(entry.sourceMessageId, 987);
  assert.equal(entry.sourceLink, undefined); assert.equal(entry.authorId, 'traderahmetd');
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
test('archived magazine messages keep a same-origin photo proxy without an author name', async () => {
  assert.deepEqual([...LEGACY_MAGAZINE_MESSAGES], [1195, 1205]);
  for (const message of LEGACY_MAGAZINE_MESSAGES) {
    const entry = parseMagazineWidget(html(977, 'https://cdn4.telesco.pe/file/photo.jpg', message), message);
    assert.ok(entry, 'legacy message ' + message + ' must parse');
    assert.equal(entry.sourceMessageId, message);
    assert.equal(entry.sourceLink, undefined);
    assert.deepEqual(entry.images, ['/api/tg?magPhoto=publicmag_' + message + '_0']);
  }
  assert.equal(parseMagazineWidget(html(977, 'https://cdn4.telesco.pe/file/photo.jpg', 1205), 1206), null);
  assert.equal(await readMagazineMessage(1206), null, 'unlisted messages must never reach Telegram');
});
test('historic photo proxy remains readable through the immutable read-only preview policy', () => {
  const url = '/api/tg?magPhoto=publicmag_987_0';
  assert.deepEqual(previewRequest(url, 'GET', 'free', 'https://alfa-trader.com'), { url, authenticated: false });
  assert.equal(previewRequest(url, 'POST', 'free', 'https://alfa-trader.com').status, 403);
});
test('verified archive JPEG bytes are served same-origin without any Telegram network call', async () => {
  assert.deepEqual(Object.keys(LEGACY_MAGAZINE_PHOTOS).map(Number).sort((a, b) => a - b), [987, 1195, 1205]);
  const originalFetch = global.fetch;
  global.fetch = () => { throw new Error('archived photo must not use the network'); };
  const photoRes = () => {
    const state = { status: null, headers: {}, bytes: null };
    return {
      state,
      setHeader(k, v) { state.headers[String(k).toLowerCase()] = v; },
      getHeader(k) { return state.headers[String(k).toLowerCase()]; },
      status(code) { state.status = code; return this; },
      end() { return this; },
      send(bytes) { state.bytes = bytes; return this; },
    };
  };
  try {
    for (const message of [987, 1195, 1205]) {
      const bytes = legacyMagazinePhoto(message, 0);
      assert.ok(bytes instanceof Uint8Array, 'archive photo ' + message + ' must decode to bytes');
      assert.ok(bytes.length > 10000, 'archive photo ' + message + ' must not be a truncated stub');
      assert.deepEqual([...bytes.subarray(0, 3)], [0xff, 0xd8, 0xff]);
      const res = photoRes();
      await magazinePublicPhoto({ query: { magazinePost: String(message), image: '0' } }, res);
      assert.equal(res.state.status, 200);
      assert.equal(res.state.headers['content-type'], 'image/jpeg');
      assert.equal(res.state.headers['x-content-type-options'], 'nosniff');
      assert.equal(res.state.headers['cache-control'], 'public, max-age=86400, immutable');
      assert.ok(res.state.bytes instanceof Uint8Array, 'res.send() must receive binary bytes');
      assert.equal(Buffer.compare(Buffer.from(res.state.bytes), Buffer.from(bytes)), 0,
        'binary bytes must reach res.send() unchanged');
    }
    assert.equal(legacyMagazinePhoto(1195, 1), null, 'only verified first photos are stored');
    assert.equal(legacyMagazinePhoto(1206, 0), null, 'unlisted messages have no archive bytes');
    const missing = photoRes();
    await magazinePublicPhoto({ query: { magazinePost: '1206', image: '0' } }, missing);
    assert.equal(missing.state.status, 404);
    const invalid = photoRes();
    await magazinePublicPhoto({ query: { magazinePost: '1195', image: '12' } }, invalid);
    assert.equal(invalid.state.status, 400);
  } finally { global.fetch = originalFetch; }
});
