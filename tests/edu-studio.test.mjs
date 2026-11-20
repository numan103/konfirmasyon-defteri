import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import handler from '../api/edu-shared.mjs';
import { sealChannels, openChannels } from '../lib/edu-channel-storage.mjs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function fixture(t, { email = 'admin@test.dev', data, broken = false } = {}) {
  const env = { SUPABASE_SERVICE_ROLE: 'unit-role', EDU_CHANNEL_SECRET: 'unit-channel-secret', SITE_ADMIN_EMAILS: 'admin@test.dev' };
  for (const [k, value] of Object.entries(env)) {
    const old = process.env[k]; process.env[k] = value;
    t.after(() => { if (old === undefined) delete process.env[k]; else process.env[k] = old; });
  }
  const channel = { id: 'teacher', name: 'Teacher', owner: 'owner@test.dev', editors: ['editor@test.dev'], sections: { s: [{ id: 'topic', title: 'OBO – TOBO', videos: [
    { id: 'free', type: 'video', title: 'Eski ders', url: 'https://youtu.be/free' },
    { id: 'paid', type: 'video', title: 'Yeni ders', url: 'https://youtu.be/secret', access: 'paid', plans: ['video'], body: 'Açıklama', tricks: 'Boyun çizgisi teyidi', photos: [{ url: 'https://example.com/obo.png', caption: 'Boyun çizgisi' }], vids: [{ url: 'https://youtu.be/extra' }] },
  ] }] }, secMeta: [{ id: 's', title: 'Ücretli', access: 'paid', plans: ['video'] }], seeded: true };
  let stored = data || { traders: { teacher: channel }, order: ['teacher'] };
  const writes = [];
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return email ? Response.json({ id: 'u1', email }) : Response.json({}, { status: 401 });
    if (u.includes('/site_access') || u.includes('id=like.educrm_')) return Response.json([]);
    if (u.includes('/edu_shared')) {
      if (options.method === 'POST') {
        writes.push({ body: JSON.parse(options.body), headers: options.headers });
        if (broken) return Response.json({}, { status: 500 });
        stored = writes.at(-1).body.data; return Response.json({});
      }
      return Response.json([{ data: stored }]);
    }
    throw new Error('Unexpected request ' + u);
  });
  return {
    channel, writes, stored: () => stored, setStored: value => { stored = value; },
    async request(body, { kind = 'channel', auth = true, method = 'POST' } = {}) {
      const res = { code: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
      await handler({ method, query: { kind }, headers: auth ? { authorization: 'Bearer unit-token' } : {}, body }, res);
      return res;
    },
  };
}
test('anonymous/forged writes, wrong routes, non-admin creation and deletion are rejected', async t => {
  const f = fixture(t, { email: 'student@test.dev' });
  assert.equal((await f.request({ trader: f.channel }, { auth: false })).code, 401);
  assert.equal((await f.request({ trader: f.channel })).code, 403);
  assert.equal((await f.request({ trader: { ...f.channel, id: 'new' } })).code, 403);
  assert.equal((await f.request({ remove: 'teacher' })).code, 403);
  assert.equal((await f.request({ trader: f.channel }, { kind: 'shared' })).code, 400);
  assert.equal(f.writes.length, 0);
});
test('admin save keeps video notes/photos/tricks/extra videos and paid defaults encrypted', async t => {
  const f = fixture(t);
  f.channel.secMeta[0].kind = 'journal';
  f.channel.sections.s[0].videos[1].journalDate = '2026-11-20';
  f.channel.sections.s[0].videos[1].publishedAt = 1795180000000;
  const result = await f.request({ trader: f.channel });
  assert.equal(result.code, 200);
  const raw = JSON.stringify(f.stored());
  for (const secret of ['youtu.be/secret', 'Açıklama', 'Boyun çizgisi', 'owner@test.dev']) assert.ok(!raw.includes(secret), secret);
  assert.equal(f.writes[0].headers.apikey, 'unit-role');
  const restored = openChannels(f.stored()).traders.teacher;
  assert.equal(restored.sections.s[0].videos[1].body, 'Açıklama');
  assert.equal(restored.sections.s[0].videos[1].tricks, 'Boyun çizgisi teyidi');
  assert.equal(restored.sections.s[0].videos[1].photos.length, 1);
  assert.equal(restored.sections.s[0].videos[1].vids.length, 1);
  assert.equal(restored.secMeta[0].access, 'paid');
  assert.equal(restored.secMeta[0].kind, 'journal');
  assert.equal(restored.sections.s[0].videos[1].journalDate, '2026-11-20');
  assert.equal(restored.sections.s[0].videos[1].publishedAt, 1795180000000);
  assert.equal(restored.seeded, true);
  assert.equal(restored.owner, 'owner@test.dev');
  assert.ok(!result.body.data, 'save never returns other channels');
  const read = await f.request(null, { method: 'GET' });
  assert.equal(read.body.data.traders.teacher.sections.s[0].videos[1].url, 'https://youtu.be/secret');
});
test('existing editor can edit full paid lesson but cannot change owner/editors', async t => {
  const f = fixture(t, { email: 'editor@test.dev' });
  const read = await f.request(null, { method: 'GET' });
  assert.equal(read.body.data.traders.teacher.canEdit, true);
  assert.equal(read.body.data.traders.teacher.sections.s[0].videos[1].tricks, 'Boyun çizgisi teyidi');
  const write = await f.request({ trader: { ...f.channel, owner: 'attacker@test.dev', editors: ['attacker@test.dev'] } });
  assert.equal(write.code, 200);
  assert.equal(write.body.trader.owner, 'owner@test.dev');
  assert.deepEqual(write.body.trader.editors, ['editor@test.dev']);
});
test('reader projection strips paid content and private author metadata, including encrypted storage', async t => {
  const f = fixture(t, { email: 'student@test.dev' });
  const sealed = sealChannels({ traders: { teacher: f.channel }, order: ['teacher'] });
  // Storage fixture starts as legacy; explicit encrypted fixture uses same runtime key.
  const out = openChannels(sealed);
  assert.equal(out.traders.teacher.sections.s[0].videos[1].body, 'Açıklama');
  f.setStored(sealed);
  const result = await f.request(null, { method: 'GET' });
  const ch = result.body.data.traders.teacher;
  assert.equal(ch.owner, undefined); assert.equal(ch.editors, undefined);
  assert.equal(ch.canEdit, false);
  assert.equal(ch.sections.s[0].videos[0].url, 'https://youtu.be/free');
  const locked = ch.sections.s[0].videos[1];
  assert.equal(locked.tricks, ''); assert.equal(locked.body, '');
  assert.deepEqual(locked.photos, []); assert.deepEqual(locked.vids, []);
  assert.equal(locked.locked, true);
});
test('corrupt encrypted document never becomes empty successful read or overwrite', async t => {
  const f = fixture(t, { data: { channelEnvelope: 1, iv: 'invalid', tag: 'invalid', ciphertext: 'invalid' } });
  assert.equal((await f.request(null, { method: 'GET' })).code, 503);
  assert.equal((await f.request({ trader: f.channel })).code, 503);
  assert.equal(f.writes.length, 0);
});
test('backend write failure is not reported as success', async t => {
  const f = fixture(t, { broken: true });
  const result = await f.request({ trader: f.channel });
  assert.equal(result.code, 500); assert.ok(!result.body.ok);
});
test('unsafe channel keys and oversized saves cannot overwrite data', async t => {
  const f = fixture(t);
  for (const id of ['__proto__', 'constructor', 'prototype']) {
    assert.equal((await f.request({ trader: { ...f.channel, id } })).code, 400);
  }
  assert.equal((await f.request({ trader: { ...f.channel, bio: 'a'.repeat(2800001) } })).code, 413);
  assert.equal(f.writes.length, 0);
});
test('existing owner may save while an unrelated editor never receives another channel payload', async t => {
  const f = fixture(t, { email: 'owner@test.dev' });
  const result = await f.request({ trader: f.channel });
  assert.equal(result.code, 200);
  assert.deepEqual(Object.keys(result.body).sort(), ['ok', 'trader']);
});
test('envelope authenticates tampering, uses random IVs and preserves legacy read compatibility', t => {
  fixture(t);
  const data = { traders: {}, order: [] }, a = sealChannels(data), b = sealChannels(data);
  assert.notEqual(a.iv, b.iv); assert.deepEqual(openChannels(a), data);
  assert.equal(openChannels(data), data);
  assert.throws(() => openChannels({ ...a, ciphertext: Buffer.from('bad').toString('base64') }));
});
test('inline page scripts compile and authoring does not persist paid data in shared localStorage', () => {
  for (const [, attrs, code] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/\bsrc=|type=["'](?:module|application\/ld\+json)/i.test(attrs)) new vm.Script(code);
  }
  const channelCode = html.slice(html.indexOf('let channelsData ='), html.indexOf('function panoRoomId()'));
  assert.doesNotMatch(channelCode, /localStorage\.setItem\('alfa-channels-v1'/);
  assert.doesNotMatch(channelCode, /await fetch\('\/api\/edu-shared\?kind=channel'/);
  assert.match(channelCode, /form\.addEventListener\('paste'/);
  assert.match(channelCode, /form\.addEventListener\('drop'/);
  const saveForm = channelCode.slice(channelCode.indexOf('async function chSaveForm()'), channelCode.indexOf('function chOpenNew()'));
  assert.ok(saveForm.indexOf('if (!saved) return;') < saveForm.lastIndexOf('chCloseForm()'));
  assert.match(saveForm, /currentPage === 'edustudio' && isVideo/);
});
test('lesson renderer rejects executable links and non-raster data URLs', () => {
  const context = vm.createContext({ esc: value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) });
  const code = html.slice(html.indexOf('function chInline('), html.indexOf('// ---- Not formu:'));
  vm.runInContext(code, context);
  assert.doesNotMatch(vm.runInContext("chInline('[tıkla](javascript:alert)')", context), /href=/);
  assert.match(vm.runInContext("chInline('[kaynak](https://example.com)')", context), /href="https:/);
  assert.equal(vm.runInContext("chImgFigure('', 'data:image/svg+xml;base64,evil')", context), '');
  assert.equal(vm.runInContext("chSafeImage('data:image/png;base64,AAAA')", context), true);
});
test('daily journal preserves more than 200 days and rejects overflow without silently deleting old notes', async t => {
  const f = fixture(t);
  f.channel.secMeta[0].kind = 'journal';
  f.channel.sections.s = Array.from({ length: 201 }, (_, i) => ({ id: 'day-' + i, title: 'Gün ' + i, videos: [] }));
  const saved = await f.request({ trader: f.channel });
  assert.equal(saved.code, 200); assert.equal(saved.body.trader.sections.s.length, 201);
  f.channel.sections.s = Array.from({ length: 1001 }, (_, i) => ({ id: 'day-' + i, title: 'Gün ' + i, videos: [] }));
  const overflow = await f.request({ trader: f.channel });
  assert.equal(overflow.code, 413); assert.equal(overflow.body.error, 'channel_limit_exceeded');
  assert.equal(f.writes.length, 1, 'overflow must not overwrite the saved journal');
  assert.equal(openChannels(f.stored()).traders.teacher.sections.s.length, 201);
});
test('repeated image URLs keep captions and inline photo indexes instead of deduplicating away the second figure', async t => {
  const f = fixture(t), video = f.channel.sections.s[0].videos[1];
  video.body = 'İlk örnek {{foto:1}}\nİkinci açıklama {{foto:2}}';
  video.photos = [{ url: 'https://example.com/chart.png', caption: 'İlk bakış' }, { url: 'https://example.com/chart.png', caption: 'Teyit bölgesi' }];
  const saved = await f.request({ trader: f.channel });
  assert.equal(saved.code, 200);
  const item = saved.body.trader.sections.s[0].videos[1];
  assert.equal(item.photos.length, 2);
  assert.equal(item.photos[1].caption, 'Teyit bölgesi'); assert.match(item.body, /\{\{foto:2\}\}/);
});
