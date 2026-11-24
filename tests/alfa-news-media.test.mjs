import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/edu-shared.mjs';

const stale = 'https://cdn4.telesco.pe/file/expired-photo.jpg';
const row = {
  issueNo: 1,
  entries: [
    { id: 'mag_old_1195', title: 'GOLD HTF bias', body: 'Kısa analiz', publishedAt: '2026-11-22T18:51:16.000Z', sourceMessageId: 1195, sourceThread: 977, images: [stale] },
    { id: 'mag_old_1205', title: 'NEAR', body: 'Kısa analiz', publishedAt: '2026-11-22T19:18:12.000Z', sourceMessageId: 1205, sourceThread: 977, images: [stale] },
    { id: 'mag_ext', title: 'Dış bağlantı', body: 'Kısa analiz', publishedAt: '2026-11-21T10:00:00.000Z', sourceMessageId: 987, sourceThread: 977, images: ['https://example.com/chart.jpg'] },
    { id: 'mag_unlisted', title: 'Liste dışı', body: 'Kısa analiz', publishedAt: '2026-11-20T10:00:00.000Z', sourceMessageId: 1300, sourceThread: 977, images: [stale] },
    { id: 'mag_photo_ids', title: 'Dosya kimliği', body: 'Kısa analiz', publishedAt: '2026-11-19T10:00:00.000Z', sourceMessageId: 986, sourceThread: 977, images: [], photoIds: ['AgACAgQAA_valid'] },
  ],
};

function json(data) {
  return { ok: true, status: 200, json: async () => data, async *[Symbol.asyncIterator]() {} };
}

test('public AlfaNews projection restores archived Telegram photos without hotlinking expired CDN URLs', async () => {
  const original = global.fetch;
  try {
    global.fetch = async (url) => String(url).includes('/rest/v1/alfanews') ? json([{ data: row, updated_at: '2026-11-23T00:00:00+00:00' }]) : json([]);
    let payload = null;
    const res = {
      setHeader() {}, getHeader() { return null; }, writeHead() {}, write() {}, end() {},
      status(code) { this.statusCode = code; return this; },
      json(data) { payload = data; return this; },
    };
    await handler({ method: 'GET', query: { kind: 'news' }, headers: {}, url: '/api/edu-shared?kind=news' }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(payload.ok, true);
    const entries = new Map((payload.data.entries || []).map(e => [e.id, e]));
    assert.deepEqual(entries.get('mag_old_1195').images, ['/api/tg?magPhoto=publicmag_1195_0']);
    assert.deepEqual(entries.get('mag_old_1205').images, ['/api/tg?magPhoto=publicmag_1205_0']);
    assert.deepEqual(entries.get('mag_ext').images, ['https://example.com/chart.jpg']);
    assert.deepEqual(entries.get('mag_unlisted').images, []);
    assert.deepEqual(entries.get('mag_photo_ids').images, ['/api/tg?magPhoto=AgACAgQAA_valid']);
    const serialized = JSON.stringify(payload);
    assert.ok(!serialized.includes('telesco.pe'), 'expired CDN links must never reach the browser');
  } finally { global.fetch = original; }
});
