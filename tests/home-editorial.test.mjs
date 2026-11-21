import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('../api/edu-shared.mjs', import.meta.url), 'utf8');

test('removed home promotions and old channel previews are absent from markup', () => {
  const home = html.slice(html.indexOf('id="page-home"'), html.indexOf('id="page-trading"'));
  for (const text of ['Borsanı bağla, tüm avantajları aç', 'Kart yok · Aidat yok', 'Öne çıkan ders: Risk Yönetimi', 'İşlem Kanalı — Son Güncellemeler', 'id="hc2-list"']) assert.ok(!home.includes(text), text);
  const basic = home.slice(home.indexOf('id="home-sec-basic"'), home.indexOf('id="home-sec-admin"'));
  assert.equal((basic.match(/class="home-card"/g) || []).length, 6);
  assert.ok(basic.includes('home-tools-path'));
});

test('new cover and journal illustration are local assets; reader filters never overwrite raw editor history', () => {
  for (const asset of ['alfa-dergi-cover.svg', 'daily-notes-cover.svg']) {
    const svg = fs.readFileSync(new URL('../assets/' + asset, import.meta.url), 'utf8');
    assert.match(svg, /^<svg/);
    assert.ok(html.includes('/assets/' + asset + '?v=1'));
  }
  assert.ok(html.includes('if (!rawAdmin) magApplyWeek(magData)'));
  assert.ok(html.includes('magMainList().forEach(en =>'));
  assert.ok(api.includes('Number(e.sourceThread) === 977'));
  assert.ok(api.includes("e.type !== 'update'"));
});
