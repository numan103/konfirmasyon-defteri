import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FEATURES, NEW_DAYS, findFeature, dayDiff,
  isNew, isNewId, activeFeatures, activeIds,
} from '../assets/site-features.mjs';

const DAY = 86400000;
const launch = new Date('2026-11-20T12:34:00Z');

function response() {
  return {
    code: 200, body: null, headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.code = c; return this; },
    json(v) { this.body = v; return this; },
    end() { return this; },
  };
}

async function loadHandler() {
  process.env.TG_BOT_TOKEN = 'test-token';
  process.env.TG_CHAT_ID = '123456';
  process.env.TG_THREAD = '4'; // public charts — website bildirimleri buraya gitmemeli
  delete process.env.WEBSITE_NOTIFY_THREAD;
  delete process.env.WEBSITE_NOTIFY_CHAT_ID;
  const mod = await import('../api/edu-shared.mjs?site-features-test=' + Math.random());
  return mod.default;
}

async function withFetch(impl, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  try { return await fn(); } finally { globalThis.fetch = original; }
}

test('özellik kayıt defteri 1 haftalık (7 günlük) pencereyi uygular', () => {
  assert.equal(NEW_DAYS, 7);
  assert.ok(FEATURES.length >= 8);
  assert.equal(dayDiff('2026-11-20', launch), 0);
  assert.equal(dayDiff('2026-11-18', launch), 2);
  assert.equal(dayDiff('2026-11-01', launch), 19);
  assert.equal(dayDiff('bozuk', launch), null);

  // Eskiyen özellikler artık yeni değil.
  for (const id of ['defter', 'review', 'pano']) {
    assert.equal(isNewId(id, launch), false, id);
  }
  // 20 Kasım'da eklenenler 1 hafta boyunca yeni.
  for (const id of ['morning-checkin', 'checkin-config', 'ayna-sync']) {
    assert.equal(isNewId(id, launch), true, id);
    assert.equal(isNewId(id, new Date(launch.getTime() + 6 * DAY)), true, id + ' 7. gün');
    assert.equal(isNewId(id, new Date(launch.getTime() + 7 * DAY)), false, id + ' 8. gün');
  }
  assert.deepEqual(activeIds(launch), ['morning-checkin', 'checkin-config', 'ayna-sync']);
  assert.equal(activeFeatures(launch).length, 3);

  // 21 Kasım'da yayına giren portföy kopyası ve günlük görevler de yeni.
  const today = new Date('2026-11-21T12:34:00Z');
  for (const id of ['portfoy-clone', 'daily-tasks']) {
    assert.equal(isNewId(id, today), true, id);
    assert.equal(isNewId(id, new Date(today.getTime() + 6 * DAY)), true, id + ' 7. gün');
    assert.equal(isNewId(id, new Date(today.getTime() + 7 * DAY)), false, id + ' 8. gün');
  }
  assert.deepEqual(activeIds(today), [
    'morning-checkin', 'checkin-config', 'ayna-sync', 'portfoy-clone', 'daily-tasks',
  ]);
  assert.equal(activeFeatures(today).length, 5);
  assert.equal(isNew(null, launch), false);
  assert.equal(isNew({ since: '' }, launch), false);
  assert.equal(findFeature('yok'), null);
});

test('siteye yeni özellik eklenince Telegrama tek mesaj gider', async () => {
  const handler = await loadHandler();
  const calls = { tg: [], writes: [], reads: 0 };
  let announced = [];
  const res = await withFetch(async (url, opts) => {
    const u = String(url);
    if (u.includes('api.telegram.org')) {
      calls.tg.push({ url: u, body: JSON.parse(opts.body) });
      return { ok: true, status: 200, json: async () => ({ ok: true, result: { message_id: 7 } }) };
    }
    if (u.includes('/rest/v1/edu_shared') && opts?.method === 'POST') {
      calls.writes.push(JSON.parse(opts.body));
      announced = JSON.parse(opts.body).data.announced;
      return { ok: true, status: 201, json: async () => ({}) };
    }
    calls.reads++;
    return { ok: true, status: 200, json: async () => [{ data: { announced } }] };
  }, async () => {
    const out = response();
    await handler({ method: 'POST', query: { kind: 'site-features' }, body: { features: FEATURES.map(f => f.id) } }, out);
    return out;
  });

  assert.equal(res.code, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.sent, 5);
  assert.equal(calls.tg.length, 1);
  assert.equal(calls.tg[0].body.chat_id, '123456');
  assert.equal(calls.tg[0].body.message_thread_id, 434);
  assert.match(calls.tg[0].body.text, /Sabah Kartı/);
  assert.match(calls.tg[0].body.text, /Ayna'ya otomatik kayıt/);
  assert.match(calls.tg[0].body.text, /Portföyüm/);
  assert.match(calls.tg[0].body.text, /Günlük Görevler/);
  assert.doesNotMatch(calls.tg[0].body.text, /Check List/);
  assert.equal(calls.writes.length, 1);
  assert.deepEqual(calls.writes[0].id, 'site-features');
});

test('aynı özellik ikinci kez bildirilmez', async () => {
  const handler = await loadHandler();
  let calls = 0;
  await withFetch(async (url, opts) => {
    const u = String(url);
    if (u.includes('api.telegram.org')) { calls++; return { ok: true, status: 200, json: async () => ({ ok: true }) }; }
    if (opts?.method === 'POST') return { ok: true, status: 201, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => [{ data: { announced: activeIds() } }] };
  }, async () => {
    const r = response();
    await handler({ method: 'POST', query: { kind: 'site-features' }, body: {} }, r);
    assert.equal(r.body.sent, 0);
  });
  assert.equal(calls, 0);
});

test('Telegram ayarı yoksa sessizce atlanır, gönderim hatasında kayıt yazılmaz', async () => {
  const handler = await loadHandler();
  const token = process.env.TG_BOT_TOKEN;
  delete process.env.TG_BOT_TOKEN;
  await withFetch(async () => { throw new Error('fetch çağrılmamalı'); }, async () => {
    const r = response();
    await handler({ method: 'POST', query: { kind: 'site-features' }, body: {} }, r);
    assert.equal(r.body.skipped, true);
  });
  process.env.TG_BOT_TOKEN = token;

  await withFetch(async (url, opts) => {
    const u = String(url);
    if (u.includes('api.telegram.org')) return { ok: false, status: 429, json: async () => ({ ok: false }) };
    if (opts?.method === 'POST') throw new Error('yazılmamalı');
    return { ok: true, status: 200, json: async () => [{ data: { announced: [] } }] };
  }, async () => {
    const r = response();
    await handler({ method: 'POST', query: { kind: 'site-features' }, body: {} }, r);
    assert.equal(r.body.ok, false);
    assert.equal(r.body.error, 'telegram_send_failed');
  });
});

test('GET aktif özellikleri döndürür', async () => {
  const handler = await loadHandler();
  await withFetch(async () => { throw new Error('fetch çağrılmamalı'); }, async () => {
    const r = response();
    await handler({ method: 'GET', query: { kind: 'site-features' } }, r);
    assert.equal(r.code, 200);
    assert.deepEqual(r.body.features.map(f => f.id), activeIds());
  });
});
