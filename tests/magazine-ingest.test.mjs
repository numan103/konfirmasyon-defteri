import test from 'node:test';
import assert from 'node:assert/strict';

const ENV = {
  TG_MAG_NEWS_CHAT: 'haberler',
  TG_MAG_TECH_CHAT: 'alfakasim',
  TG_MAG_TECH_THREAD: '6',
  TG_MAG_TECH_AUTHOR: 'traderahmetd',
  SUPABASE_SERVICE_ROLE: 'unit-test-service-key',
};
const before = {};
for (const [k, v] of Object.entries(ENV)) { before[k] = process.env[k]; process.env[k] = v; }
const {
  MAG_CATEGORIES, magazineConfig, magazineSource, isMagazineUpdate,
  entryFromMessage, ingestMagazineUpdate,
} = await import('../lib/magazine-ingest.mjs');

function fixture(t) {
  const calls = [];
  let row = null, outage = false, forcedConflict = false;
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    const u = new URL(url), method = options.method || 'GET';
    calls.push({ url, method, options });
    if (u.pathname !== '/rest/v1/alfanews') throw new Error('Unexpected network: ' + u.pathname);
    if (outage) return Response.json({}, { status: 503 });
    if (method === 'GET') return Response.json(row ? [{ data: row.data, updated_at: row.updated_at }] : []);
    const body = JSON.parse(options.body);
    if (forcedConflict) return Response.json([]);
    if (method === 'PATCH') {
      const rev = u.searchParams.get('updated_at')?.replace(/^eq\./, '');
      if (!row || row.updated_at !== rev) return Response.json([]);
      row = { data: body.data, updated_at: body.updated_at };
      return Response.json([row]);
    }
    if (method === 'POST') {
      assert.equal(body.id, 1);
      row = { data: body.data, updated_at: body.updated_at };
      return Response.json([row]);
    }
    throw new Error('Unexpected method ' + method);
  });
  return {
    calls,
    get row() { return row; },
    setRow: next => { row = next; },
    outage: v => { outage = v; },
    conflict: v => { forcedConflict = v; },
  };
}

const newsMsg = over => ({
  message_id: 501, date: 1795019005,
  chat: { id: -100111222333, username: 'haberler', type: 'channel' },
  sender_chat: { id: -100111222333, username: 'haberler', type: 'channel' },
  text: 'Haftalık piyasa bülteni yayında\nDetaylar dergide.',
  photo: [{ file_id: 'news_photo_file_id_123', file_size: 900000 }],
  ...over,
});
const techMsg = over => ({
  message_id: 946, date: 1795019100, message_thread_id: 6,
  chat: { id: -1004496172434, username: 'alfakasim', type: 'supergroup' },
  from: { id: 777, username: 'traderahmetd' },
  text: 'BTC haftalık HTF bias bullish\n60.000 üzerinde kalıcılık izleniyor.',
  photo: [{ file_id: 'tech_chart_file_id_456', file_size: 700000 }],
  ...over,
});

test('real channel_post and edited_channel_post are ingested with largest photo only', async t => {
  const f = fixture(t);
  const message = newsMsg({ photo: [{ file_id: 'small' }, { file_id: 'large' }] });
  assert.equal(isMagazineUpdate({ channel_post: message }), true);
  await ingestMagazineUpdate({ channel_post: message });
  assert.equal(f.row.data.entries.length, 1);
  assert.equal(f.row.data.entries[0].sourceKind, 'news-channel');
  assert.deepEqual(f.row.data.entries[0].photoIds, ['large']);
  await ingestMagazineUpdate({ edited_channel_post: { ...message, text: 'Düzenlenmiş haftalık bülten' } });
  assert.equal(f.row.data.entries[0].body, 'Düzenlenmiş haftalık bülten');
});

test('Telegram album stays one article with all distinct photos, including captionless parts', async t => {
  const f = fixture(t);
  const first = newsMsg({ media_group_id: 'album1', message_id: 601 });
  const next = newsMsg({ media_group_id: 'album1', message_id: 602, text: '', photo: [{ file_id: 'second-photo' }] });
  await ingestMagazineUpdate({ channel_post: first });
  await ingestMagazineUpdate({ channel_post: next });
  await ingestMagazineUpdate({ channel_post: next });
  assert.equal(f.row.data.entries.length, 1);
  assert.deepEqual(f.row.data.entries[0].photoIds, ['news_photo_file_id_123', 'second-photo']);
  assert.equal(f.row.data.entries[0].body, first.text);
});

test('magazine config exposes the two configured sources and fails closed without a news chat', () => {
  assert.deepEqual(MAG_CATEGORIES, ['Haber', 'BTC Bias', 'Makro', 'Teknik Analiz']);
  const cfg = magazineConfig();
  assert.equal(cfg.newsChat, 'haberler');
  assert.equal(cfg.newsThread, 0);
  assert.equal(cfg.techChat, 'alfakasim');
  assert.equal(cfg.techThread, 6);
  assert.equal(cfg.techAuthor, 'traderahmetd');
  assert.equal(cfg.ok, true);
});

test('Alfa News channel is recognized by its title when no chat env is configured', () => {
  const old = process.env.TG_MAG_NEWS_CHAT;
  delete process.env.TG_MAG_NEWS_CHAT;
  try {
    const base = { message_id: 977, date: 1795000000, from: { id: 42 }, text: 'GOLD & BTC haftalık görünüm' };
    assert.equal(magazineSource({ ...base, chat: { id: -100999, title: 'Alfa News', type: 'channel' } }), 'Haber');
    assert.equal(magazineSource({ ...base, chat: { id: -100999, title: 'Alfa News', username: 'alfanews', type: 'channel' } }), 'Haber');
    assert.equal(magazineSource({ ...base, chat: { id: -1004496172434, title: 'Alfa Traders', username: 'alfakasim', type: 'supergroup' }, message_thread_id: 6 }), null);
  } finally {
    if (old === undefined) delete process.env.TG_MAG_NEWS_CHAT; else process.env.TG_MAG_NEWS_CHAT = old;
  }
});

test('only the exact news channel and Trader Ahmet topic generate magazine entries', () => {
  assert.equal(magazineSource(newsMsg()), 'Haber');
  assert.equal(magazineSource(newsMsg({ chat: { id: -100999888777, username: 'baskanaları', type: 'channel' }, sender_chat: { id: -100999888777 } })), null);
  assert.equal(magazineSource(newsMsg({ chat: { id: -100111222333, username: 'haberler', type: 'channel' }, sender_chat: undefined })), 'Haber');
  assert.equal(magazineSource(techMsg()), 'Teknik Analiz');
  for (const changes of [
    { message_thread_id: 7 },
    { from: { id: 9, username: 'biri' } },
    { from: { id: 777, username: 'traderahmetd', is_bot: true } },
    { sender_chat: { id: 5 } },
  ]) assert.equal(magazineSource(techMsg(changes)), null, 'tech source requires exact topic and author');
  for (const changes of [
    { forward_origin: { type: 'user' } },
    { forward_from_chat: { id: 1 } },
    { forward_date: 123 },
    { text: '/help' },
    { message_id: 0 },
    { new_chat_members: [{}] },
  ]) {
    assert.equal(magazineSource(newsMsg(changes)), null);
    assert.equal(magazineSource(techMsg(changes)), null);
  }
  assert.equal(magazineSource(techMsg({ chat: { id: 1, username: 'alfatraderspublic', type: 'channel' }, from: undefined, sender_chat: { id: 1 } })), null);
});

test('numeric news chat ids and anonymous channel posts are supported without accepting other senders', () => {
  const prev = process.env.TG_MAG_NEWS_CHAT;
  process.env.TG_MAG_NEWS_CHAT = '-100111222333';
  try {
    assert.equal(magazineSource(newsMsg()), 'Haber');
    assert.equal(magazineSource(newsMsg({ chat: { id: -100111222333, username: 'biri', type: 'channel' }, sender_chat: { id: -100111222333 } })), 'Haber');
    assert.equal(magazineSource(newsMsg({ chat: { id: -100999888777, username: 'baskanaları', type: 'channel' }, sender_chat: { id: -100999888777 } })), null);
  } finally {
    process.env.TG_MAG_NEWS_CHAT = prev;
  }
  assert.equal(magazineSource(newsMsg({ sender_chat: { id: 999 } })), null, 'anonymous admin from another chat is rejected');
});

test('the production setup separates news and technical topics inside alfakasim', () => {
  const prevChat = process.env.TG_MAG_NEWS_CHAT, prevThread = process.env.TG_MAG_NEWS_THREAD;
  process.env.TG_MAG_NEWS_CHAT = 'alfakasim';
  process.env.TG_MAG_NEWS_THREAD = '862';
  try {
    assert.equal(magazineConfig().newsThread, 862);
    const inGroup = over => ({
      message_id: 700, date: 1795019000, chat: { id: -1004496172434, username: 'alfakasim', type: 'supergroup' },
      from: { id: 9, username: 'admin' }, text: 'Piyasa haberleri bugün', ...over,
    });
    assert.equal(magazineSource(inGroup({ message_thread_id: 862 })), 'Haber');
    assert.equal(magazineSource(inGroup({ message_thread_id: 6, from: { id: 777, username: 'traderahmetd' } })), 'Teknik Analiz');
    assert.equal(magazineSource(inGroup({ message_thread_id: 6 })), null, 'other members in the tech topic stay out');
    assert.equal(magazineSource(inGroup({ message_thread_id: 7 })), null);
    assert.equal(magazineSource(inGroup()), null, 'general topic is not a magazine source');
  } finally {
    process.env.TG_MAG_NEWS_CHAT = prevChat;
    if (prevThread === undefined) delete process.env.TG_MAG_NEWS_THREAD; else process.env.TG_MAG_NEWS_THREAD = prevThread;
  }
});

test('entry extraction keeps category, source link, photos and deterministic provenance id', () => {
  const hab = entryFromMessage(newsMsg(), 'Haber');
  assert.equal(hab.category, 'Haber');
  assert.equal(hab.title, 'Haftalık piyasa bülteni yayında');
  assert.match(hab.body, /Detaylar dergide/);
  assert.deepEqual(hab.photoIds, ['news_photo_file_id_123']);
  assert.equal(hab.sourceLink, 'https://t.me/haberler/501');
  assert.match(hab.id, /^mag_[a-f0-9]{64}$/);
  assert.equal(hab.id, entryFromMessage(newsMsg(), 'Haber').id);
  const tech = entryFromMessage(techMsg(), 'Teknik Analiz');
  assert.equal(tech.category, 'Teknik Analiz');
  assert.equal(tech.authorId, 'traderahmetd');
  assert.equal(tech.sourceLink, 'https://t.me/alfakasim/6/946');
  assert.deepEqual(tech.photoIds, ['tech_chart_file_id_456']);
});

test('realized results and intraday trade posts stay out of the magazine', () => {
  assert.equal(entryFromMessage(techMsg({ text: 'BTC +2.3R' }), 'Teknik Analiz'), null);
  assert.equal(entryFromMessage(newsMsg({ text: 'BTC +2.3R\nPiyasa haberleri' }), 'Haber'), null);
  for (const text of ['BTC long 64000 stop 63000', 'ETH #işlem girdim', 'XAUUSD +1.2R']) {
    assert.equal(entryFromMessage(newsMsg({ text }), 'Haber'), null);
  }
  assert.equal(entryFromMessage(newsMsg({ text: '', photo: [] }), 'Haber'), null);
});
test('Alfa News topics are routed to BTC Bias and Makro sections', () => {
  const bias = entryFromMessage(newsMsg({ text: 'BTC -HTF\nHaftalık yapı ve likidite notları' }), 'Haber');
  assert.equal(bias.category, 'BTC Bias');
  assert.equal(bias.title, 'BTC -HTF');
  assert.deepEqual(bias.photoIds, ['news_photo_file_id_123']);
  const macro = entryFromMessage(newsMsg({ text: 'Makro: Fed faiz kararı ve enflasyon verisi' }), 'Haber');
  assert.equal(macro.category, 'Makro');
  assert.equal(macro.title, 'Makro: Fed faiz kararı ve enflasyon verisi');
  assert.equal(entryFromMessage(newsMsg({ text: 'Makro: dolar likiditesi ve faiz patikası' }), 'Haber').category, 'Makro');
  assert.equal(entryFromMessage(newsMsg({ text: 'Genel bülten', photo: [] }), 'Haber').category, 'Haber');
});

test('ingest writes new entries once, dedupes redelivery and applies genuine edits', async t => {
  const f = fixture(t);
  const first = await ingestMagazineUpdate({ message: newsMsg() });
  assert.deepEqual(first, { handled: true, count: 1 });
  assert.equal(f.row.data.entries.length, 1);
  assert.equal(f.row.data.entries[0].category, 'Haber');
  const again = await ingestMagazineUpdate({ message: newsMsg() });
  assert.deepEqual(again, { handled: true, count: 0, skipped: 'duplicate' });
  assert.equal(f.row.data.entries.length, 1);
  await ingestMagazineUpdate({ edited_message: newsMsg({ text: 'Fed faiz kararı sonrası piyasalarda hareket\nDXY sert geriledi.', edit_date: 1795019200 }) });
  assert.match(f.row.data.entries[0].body, /sert geriledi/);
  assert.equal(f.row.data.entries[0].title, 'Fed faiz kararı sonrası piyasalarda hareket');
});

test('both categories share one alfanews stream and author roster stays valid', async t => {
  const f = fixture(t);
  await ingestMagazineUpdate({ message: newsMsg() });
  await ingestMagazineUpdate({ message: techMsg() });
  assert.equal(f.row.data.entries.length, 2);
  assert.deepEqual(f.row.data.entries.map(e => e.category), ['Haber', 'Teknik Analiz']);
  assert.ok(f.row.data.authors.some(a => a.id === 'traderahmetd'));
});

test('unrelated updates never touch storage; storage failures are retryable', async t => {
  const f = fixture(t);
  assert.deepEqual(await ingestMagazineUpdate({ message: newsMsg({ chat: { id: 5, username: 'other', type: 'channel' }, sender_chat: undefined }) }), { handled: false, count: 0 });
  assert.equal(f.calls.length, 0);
  assert.equal(isMagazineUpdate({ message: newsMsg() }), true);
  assert.equal(isMagazineUpdate({ edited_message: techMsg() }), true);
  f.outage(true);
  await assert.rejects(ingestMagazineUpdate({ message: newsMsg() }), /storage_unavailable/);
  f.outage(false);
  await ingestMagazineUpdate({ message: newsMsg() });
  f.conflict(true);
  await assert.rejects(ingestMagazineUpdate({ edited_message: newsMsg({ text: 'Fed kararı sonrası yeni başlık\nDXY geriledi.', edit_date: 1 }) }), /storage_conflict/);
  assert.equal(f.row.data.entries.length, 1, 'failed CAS must never acknowledge a fake save');
});

test('a concurrent writer is not lost: CAS mismatch retries with fresh data', async t => {
  const f = fixture(t);
  await ingestMagazineUpdate({ message: newsMsg() });
  const original = globalThis.fetch;
  let steal = 1;
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    const u = new URL(url);
    if (steal > 0 && u.pathname === '/rest/v1/alfanews' && (options.method || 'GET') === 'PATCH') {
      steal--;
      const current = f.row;
      f.setRow({
        data: { ...current.data, entries: [...current.data.entries, { id: 'mag_other', title: 'Diğer', body: 'Diğer haber', category: 'Haber' }] },
        updated_at: current.updated_at + '-concurrent',
      });
    }
    return original(url, options);
  });
  await ingestMagazineUpdate({ edited_message: newsMsg({ text: 'Fed kararı sonrası piyasalarda hareket\nDXY sert geriledi.', edit_date: 2 }) });
  assert.equal(f.row.data.entries.length, 2);
  assert.ok(f.row.data.entries.some(e => e.id === 'mag_other'));
  assert.match(f.row.data.entries.find(e => e.id !== 'mag_other').body, /sert geriledi/);
});
