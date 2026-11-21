import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const start = html.indexOf('function magPostDate(');
const end = html.indexOf('function magKbIsolate(');
assert.ok(start > 0 && end > start, 'haftalık dergi yardımcıları bulunamadı');
const ctx = { magWeek: () => '16 – 22 Kasım' };
vm.runInNewContext(html.slice(start, end) + '\nthis.magApplyWeek = magApplyWeek; this.magWeekLabelFromDates = magWeekLabelFromDates; this.magIsoWeek = magIsoWeek;', ctx);

const NOW = new Date(2026, 10, 21, 12, 0, 0);
const entry = (id, publishedAt, extra = {}) => ({ id, title: id, publishedAt, type: '', ...extra });

test('haftalık dergi Telegram tarihi olmayan eski seed gönderilerini dışarı atar', () => {
  const data = {
    issueNo: 1,
    weekLabel: '1 Kasım',
    entries: [
      entry('seed-1', ''),
      entry('seed-2', 'bozuk'),
      entry('old', '2026-11-09T10:00:00.000Z'),
      entry('fresh-a', '2026-11-19T15:45:09.000Z'),
      entry('fresh-b', '2026-11-20T15:36:40.000Z'),
    ],
  };
  ctx.magApplyWeek(data, NOW);
  assert.deepEqual(data.entries.map((e) => e.id), ['fresh-a', 'fresh-b']);
  assert.equal(data.weekLabel, '19 – 20 Kasım');
  assert.equal(data.issueNo, ctx.magIsoWeek(new Date(2026, 10, 19)));
});

test('güncellemeler yalnızca korunan analize bağlıysa haftada kalır', () => {
  const data = {
    entries: [
      entry('old', '2026-11-02T10:00:00.000Z'),
      entry('fresh', '2026-11-20T10:00:00.000Z'),
      entry('upd-keep', '', { type: 'update', relId: 'fresh' }),
      entry('upd-drop', '', { type: 'update', relId: 'old' }),
    ],
  };
  ctx.magApplyWeek(data, NOW);
  assert.deepEqual(data.entries.map((e) => e.id), ['fresh', 'upd-keep']);
});

test('bu hafta gönderi yoksa dergi boş kalır ve eski etiket uydurulmaz', () => {
  const data = { issueNo: 7, weekLabel: '1 Kasım', entries: [entry('old', '2026-11-09T10:00:00.000Z')] };
  ctx.magApplyWeek(data, NOW);
  assert.deepEqual(data.entries, []);
  assert.equal(data.weekLabel, '1 Kasım');
  assert.equal(data.issueNo, 7);
});

test('hafta etiketi Telegram gönderi tarihlerinden üretilir', () => {
  const d = (y, m, day) => new Date(y, m, day);
  assert.equal(ctx.magWeekLabelFromDates([d(2026, 10, 19)]), '19 Kasım');
  assert.equal(ctx.magWeekLabelFromDates([d(2026, 10, 19), d(2026, 10, 20)]), '19 – 20 Kasım');
  assert.equal(ctx.magWeekLabelFromDates([d(2026, 9, 30), d(2026, 10, 2)]), '30 Ekim – 2 Kasım');
});

test('hem tam dergi hem ana sayfa gömülü dergi haftalık filtreyi uygular', () => {
  const full = html.slice(html.indexOf('async function loadNews()'), html.indexOf('function magAuthor('));
  const home = html.slice(html.indexOf('async function loadHomeMagazine()'), html.indexOf('function invalidateHomeMagazine()'));
  assert.match(full, /magApplyWeek\(magData\)/);
  assert.match(home, /homeMagData = magApplyWeek\(j\.data\)/);
  assert.match(html, /className = 'e-img-none'/);
  assert.match(html, /className = 'dn-photo-empty'/);
});
