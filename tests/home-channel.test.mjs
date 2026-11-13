import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const start = html.indexOf('const HOME_CHANNEL_WINDOW_MS');
const end = html.indexOf('function sortedData()');
assert.ok(start > 0 && end > start, 'home channel helper bulunamadı');
const source = html.slice(start, end);
const ctx = {};
vm.runInNewContext(source + '\nthis.homeChannelRecent = homeChannelRecent; this.homeChannelFromLanding = homeChannelFromLanding;', ctx);
const pick = ctx.homeChannelRecent;
const fromLanding = ctx.homeChannelFromLanding;

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 13, 12, 0, 0);

test('ana sayfa kanal önizlemesi eski Ağustos pozlarını göstermez', () => {
  const posts = [
    { id: 'old1', type: 'islem', status: 'tp', title: 'GRAM ALTIN ALIM BEKLENTİSİ', coin: 'XAUTRYG', ts: Date.UTC(2026, 7, 13) },
    { id: 'old2', type: 'islem', status: 'tp', title: 'BTC', coin: 'BTC', ts: Date.UTC(2026, 7, 13) },
    { id: 'old3', type: 'islem', status: 'tp', title: 'Intraday Long', coin: 'BTC', ts: Date.UTC(2026, 7, 12) },
    { id: 'new1', type: 'analiz', title: 'Gram altın alım bölgeleri', coin: 'XAUTRYG', ts: NOW - 2 * DAY },
    { id: 'new2', type: 'analiz', title: 'Kimse gelmeden', coin: 'BTC', ts: NOW - 4 * DAY },
  ];
  const picked = pick(posts, { now: NOW });
  assert.deepEqual(picked.map((p) => p.id), ['new1', 'new2']);
});

test('son haftadaki işlem paylaşımları analizlere tercih edilir ve yeniden eskiye sıralanır', () => {
  const posts = [
    { id: 'a', type: 'analiz', ts: NOW - 1 * DAY },
    { id: 't1', type: 'islem', status: 'aktif', ts: NOW - 3 * DAY },
    { id: 't2', type: 'islem', status: 'tp', ts: NOW - 6 * DAY },
    { id: 'old', type: 'islem', status: 'tp', ts: NOW - 40 * DAY },
  ];
  const picked = pick(posts, { now: NOW });
  assert.deepEqual(picked.map((p) => p.id), ['t1', 't2']);
});

test('son 7 günde paylaşım yoksa boş döner (eski kayıt gösterme)', () => {
  const posts = [
    { id: 'old', type: 'islem', status: 'tp', ts: NOW - 8 * DAY },
    { id: 'nots', type: 'islem', status: 'tp' },
  ];
  assert.deepEqual(pick(posts, { now: NOW }), []);
});

test('premium görünümde son paylaşımlar en fazla 3 kayıt gösterir', () => {
  const posts = [1, 2, 3, 4, 5].map((n) => ({ id: 'p' + n, type: 'analiz', ts: NOW - n * 1000 }));
  const picked = pick(posts, { now: NOW, ref: true });
  assert.deepEqual(picked.map((p) => p.id), ['p1', 'p2', 'p3']);
});

test('landing kanal verisi işlem ve analizleri tek listede birleştirir', () => {
  const posts = fromLanding({
    channel: {
      trades: { latest: [{ id: 't', title: 'BTC long', coin: 'BTC', date: '2026-11-13T09:00:00.000Z', image: '/api/edu-shared?kind=landing&image=t' }] },
      biases: { latest: [{ id: 'b', title: 'Gram altın', coin: 'XAUTRYG', date: '2026-11-13T10:00:00.000Z', image: '' }] },
    },
  });
  assert.deepEqual(posts.map((p) => p.id), ['t', 'b']);
  assert.equal(posts[0].type, 'islem');
  assert.equal(posts[1].type, 'analiz');
  assert.equal(posts[1].img, '');
  assert.equal(posts[0].ts, Date.parse('2026-11-13T09:00:00.000Z'));
});

test('landing verisi yoksa veya tarihi bozuksa kayıt üretmez', () => {
  assert.deepEqual(Array.from(fromLanding(null)), []);
  assert.deepEqual(Array.from(fromLanding({})), []);
  assert.deepEqual(Array.from(fromLanding({ channel: { trades: { latest: [{ id: 'x', date: 'bozuk' }] }, biases: { latest: [] } } })), []);
});
