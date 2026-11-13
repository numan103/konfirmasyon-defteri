import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const cfg = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const bySource = new Map((cfg.redirects || []).map((r) => [r.source, r]));

test('kısa katılım linkleri bot derin linkine gider', () => {
  for (const source of ['/katil', '/mentorluk', '/premium']) {
    const r = bySource.get(source);
    assert.ok(r, source + ' redirect eksik');
    assert.equal(r.destination, 'https://t.me/alfaportfoy_bot?start=dogrula');
    assert.equal(r.permanent, false);
  }
});

test('durum kısa linki durum komutuna gider', () => {
  const r = bySource.get('/durum');
  assert.ok(r);
  assert.equal(r.destination, 'https://t.me/alfaportfoy_bot?start=durum');
});
