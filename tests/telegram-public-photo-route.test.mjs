import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/tg.mjs';
import { legacyMagazinePhoto } from '../lib/legacy-magazine-photos.mjs';

test('publicmag route serves verified archive JPEG without a Telegram token or network call', async () => {
  const originalFetch = global.fetch;
  global.fetch = () => { throw new Error('publicmag archive route must not call Telegram'); };
  const state = { status: null, headers: {}, bytes: null };
  const res = {
    setHeader(k, v) { state.headers[String(k).toLowerCase()] = v; },
    getHeader(k) { return state.headers[String(k).toLowerCase()]; },
    status(code) { state.status = code; return this; },
    end() { return this; },
    send(bytes) { state.bytes = bytes; return this; },
    json(data) { state.json = data; return this; },
  };
  try {
    await handler({ method: 'GET', query: { magPhoto: 'publicmag_1195_0' }, headers: {}, url: '/api/tg?magPhoto=publicmag_1195_0' }, res);
    assert.equal(state.status, 200);
    assert.equal(state.headers['content-type'], 'image/jpeg');
    assert.equal(state.headers['x-content-type-options'], 'nosniff');
    assert.equal(state.headers['cache-control'], 'public, max-age=86400, immutable');
    assert.ok(state.bytes instanceof Uint8Array);
    assert.equal(Buffer.compare(Buffer.from(state.bytes), Buffer.from(legacyMagazinePhoto(1195, 0))), 0);
  } finally { global.fetch = originalFetch; }
});
