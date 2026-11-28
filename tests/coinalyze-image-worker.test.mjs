import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';

const NOW = Date.UTC(2026, 10, 28, 8, 0, 0);

function fixture() {
  const base = Math.floor(NOW / 1000 / 3600) * 3600;
  return {
    cvd: { coin: -969, usd: -57402536 },
    oi: { total: 19864175198, count: 15 },
    oiPrev: { total: 20427374195, count: 15 },
    lsr: { longPct: 63.1, shortPct: 36.8, ratio: 1.71 },
    priceChangePct: -3.5,
    verdict: { bias: 'BEARISH', score: -1.5, reasons: ['Spot CVD negatif'], priceChangePct: -3.5 },
    cvdSeries: Array.from({ length: 24 }, (_, i) => ({ t: base - (23 - i) * 3600, coin: -i * 40, usd: -i * 2e6 })),
    oiSeries: Array.from({ length: 24 }, (_, i) => ({ t: base - (23 - i) * 3600, total: 20427374195 - i * 26e6 })),
  };
}

function pngChunks(bytes) {
  const out = [];
  let p = 8;
  while (p + 8 <= bytes.length) {
    const len = bytes.readUInt32BE(p);
    const type = bytes.toString('ascii', p + 4, p + 8);
    out.push({ type, data: bytes.subarray(p + 8, p + 8 + len) });
    p += 12 + len;
  }
  return out;
}

test('Worker uyumlu Coinalyze PNG gecerli bir gorsel uretir', async () => {
  const { renderCoinalyzePng } = await import('../lib/coinalyze-worker-image.mjs');
  const png = renderCoinalyzePng(fixture(), NOW);
  assert.ok(png instanceof Uint8Array);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);

  const chunks = pngChunks(Buffer.from(png));
  let cp = 8;
  while (cp + 8 <= png.length) {
    const len = Buffer.from(png).readUInt32BE(cp);
    const type = Buffer.from(png).toString('ascii', cp + 4, cp + 8);
    const stored = Buffer.from(png).readUInt32BE(cp + 8 + len);
    const calculated = zlib.crc32(Buffer.from(png).subarray(cp + 4, cp + 8 + len));
    assert.equal(stored, calculated, type + ' CRC must be valid');
    cp += 12 + len;
  }
  const ihdr = chunks.find(c => c.type === 'IHDR');
  assert.ok(ihdr);
  assert.equal(ihdr.data.readUInt32BE(0), 900);
  assert.equal(ihdr.data.readUInt32BE(4), 1125);
  assert.equal(ihdr.data[8], 8);
  assert.equal(ihdr.data[9], 2);

  const idat = chunks.filter(c => c.type === 'IDAT').map(c => c.data);
  const compressed = Buffer.concat(idat);
  assert.ok(compressed.length < 200000, 'Telegram rejects an uncompressed/stored PNG IDAT');
  // PNG IDAT uses raw DEFLATE, not a zlib-wrapped stream.
  const raw = zlib.inflateRawSync(compressed);
  assert.equal(raw.length, 1125 * (1 + 900 * 3));

  const colors = new Set();
  for (let i = 0; i < raw.length; i += 997) {
    colors.add(raw[i] + ':' + raw[i + 1] + ':' + raw[i + 2]);
  }
  assert.ok(colors.size > 10, 'PNG must contain a rendered chart, not a flat fill');
});

test('Worker PNG ayni veri icin deterministik ve bos serilerde de uretilir', async () => {
  const { renderCoinalyzePng } = await import('../lib/coinalyze-worker-image.mjs');
  const data = fixture();
  const a = renderCoinalyzePng(data, NOW);
  const b = renderCoinalyzePng(data, NOW);
  assert.deepEqual(a, b);

  const empty = renderCoinalyzePng({ ...data, cvdSeries: [], oiSeries: [] }, NOW);
  assert.deepEqual([...empty.subarray(1, 4)], [80, 78, 71]);
  assert.ok(empty.length > 1000);
});
