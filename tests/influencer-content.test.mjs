import test from 'node:test';
import assert from 'node:assert/strict';
import handler, { cleanLibrary, mediaUrl, sealLibrary, openLibrary } from '../lib/influencer-content.mjs';
import { mediaUrl as clientUrl } from '../assets/influencer-content-model.mjs';
const content = () => ({ topics: [
  { id: 'viral', title: 'Viral Gönderi', description: 'Kendi yorumunu kat', published: true, sections: [
    { id: 'intro', title: 'Neden tuttu?', blocks: [
      { id: 'text', type: 'text', body: 'PRIVATE_CONTENT', caption: '' },
      { id: 'image', type: 'image', url: 'data:image/png;base64,YWJj', caption: 'Örnek' },
      { id: 'video', type: 'video', url: 'https://youtu.be/abcdefghijk', caption: 'Anlatım' },
    ] },
  ] },
  { id: 'draft', title: 'Taslak konu', description: 'SECRET_DRAFT', published: false, sections: [] },
] });
function fixture(t) {
  const old = process.env.SUPABASE_SERVICE_ROLE;
  process.env.SUPABASE_SERVICE_ROLE = 'test-storage-key';
  t.after(() => { if (old === undefined) delete process.env.SUPABASE_SERVICE_ROLE; else process.env.SUPABASE_SERVICE_ROLE = old; });
  let row = null, outage = false; const writes = [];
  t.mock.method(globalThis, 'fetch', async (url, opts = {}) => {
    const u = new URL(url);
    if (u.pathname === '/auth/v1/user') {
      const token = opts.headers.Authorization;
      if (token === 'Bearer admin') return Response.json({ id: 'admin', email: 'ahmetnuman20@gmail.com' });
      if (token === 'Bearer paid') return Response.json({ id: 'paid', email: 'paid@example.test' });
      if (token === 'Bearer free') return Response.json({ id: 'free', email: 'free@example.test' });
      return Response.json({}, { status: 401 });
    }
    if (outage) return Response.json({}, { status: 503 });
    if (u.pathname.endsWith('/influencer_orders')) return Response.json(u.searchParams.get('user_id') === 'eq.paid' ? [{ id: 'approved' }] : []);
    assert.ok(u.pathname.endsWith('/edu_shared'));
    if (!opts.method || opts.method === 'GET') return Response.json(row ? [row] : []);
    writes.push(opts);
    if (opts.method === 'POST' && row) return Response.json({}, { status: 409 });
    if (opts.method === 'PATCH' && u.searchParams.get('updated_at') !== 'eq.' + row?.updated_at) return Response.json([]);
    row = JSON.parse(opts.body); return Response.json([row]);
  });
  async function request(token, body, method = body ? 'POST' : 'GET') {
    let result, status;
    const headers = {};
    const res = { setHeader(k, v) { headers[k] = v; }, status(n) { status = n; return this; }, json(d) { result = d; } };
    await handler({ method, headers: token ? { authorization: 'Bearer ' + token } : {}, body }, res);
    return { status, body: result, headers };
  }
  return { request, writes, row: () => row, outage: () => { outage = true; } };
}
test('nested topics, subtitles, descriptions and mixed media are normalized', () => {
  const clean = cleanLibrary(content());
  assert.equal(clean.topics[0].sections[0].blocks.length, 3);
  assert.equal(clean.topics[1].published, false);
  assert.throws(() => cleanLibrary({ topics: [{ ...content().topics[0], sections: null }] }), /invalid/);
  const duplicate = content(); duplicate.topics[1].id = 'viral';
  assert.throws(() => cleanLibrary(duplicate), /invalid/);
});
test('media rejects scripts, unsafe embeds, credentials and SVG data', () => {
  for (const fn of [mediaUrl, clientUrl]) {
    for (const url of ['javascript:alert(1)', 'http://example.com/a.mp4', 'https://u:p@example.com/a.mp4', 'https://evil.test/embed', '/assets/../private.png', 'data:image/svg+xml;base64,YWJj']) {
      assert.equal(fn(url, 'video'), '');
    }
    assert.equal(fn('data:image/svg+xml;base64,YWJj', 'image'), '');
    assert.equal(fn('https://cdn.example.com/video.mp4', 'video'), 'https://cdn.example.com/video.mp4');
    assert.equal(fn('https://youtu.be/abcdefghijk', 'video'), 'https://youtu.be/abcdefghijk');
  }
});
test('post examples preserve text and optional safe source links', () => {
  const library = content();
  library.topics[0].sections[0].blocks.push({ id: 'post', type: 'post', body: 'Kendi gönderim', url: 'https://x.com/example/status/123' });
  const post = cleanLibrary(library).topics[0].sections[0].blocks.at(-1);
  assert.equal(post.body, 'Kendi gönderim');
  assert.equal(post.url, 'https://x.com/example/status/123');
  library.topics[0].sections[0].blocks.at(-1).url = 'javascript:alert(1)';
  assert.throws(() => cleanLibrary(library), /invalid_media/);
});
test('content is encrypted at rest with integrity protection', t => {
  fixture(t); const sealed = sealLibrary(content());
  assert.equal(JSON.stringify(sealed).includes('PRIVATE_CONTENT'), false);
  assert.deepEqual(openLibrary(sealed), content());
  assert.throws(() => openLibrary({ ...sealed, tag: Buffer.alloc(16).toString('base64') }));
  assert.throws(() => openLibrary(content()));
});
test('only actual admins write; premium/free/anonymous cannot self-authorize', async t => {
  const f = fixture(t), body = { data: content(), revision: null, admin: true };
  assert.equal((await f.request('', body)).status, 401);
  assert.equal((await f.request('free', body)).status, 403);
  assert.equal((await f.request('paid', body)).status, 403);
  assert.equal(f.writes.length, 0);
  assert.equal((await f.request('admin', body)).status, 200);
  assert.equal(JSON.stringify(f.row()).includes('SECRET_DRAFT'), false);
});
test('only approved Influencer users read; drafts are admin-only and no-store', async t => {
  const f = fixture(t);
  await f.request('admin', { data: content(), revision: null });
  assert.equal((await f.request('')).status, 401);
  assert.equal((await f.request('free')).status, 403);
  const paid = await f.request('paid');
  assert.equal(paid.status, 200);
  assert.equal(paid.body.data.topics.length, 1);
  assert.equal(JSON.stringify(paid.body).includes('SECRET_DRAFT'), false);
  assert.equal(paid.headers['Cache-Control'], 'private, no-store');
  assert.equal((await f.request('admin')).body.data.topics.length, 2);
});
test('conflicting saves never overwrite changes and storage outages fail closed', async t => {
  const f = fixture(t);
  const saved = await f.request('admin', { data: content(), revision: null });
  assert.equal((await f.request('admin', { data: content(), revision: null })).status, 409);
  assert.equal((await f.request('admin', { data: content(), revision: '2020-01-01T00:00:00Z' })).status, 409);
  const updated = content(); updated.topics[0].title = 'Yeni konu';
  assert.equal((await f.request('admin', { data: updated, revision: saved.body.revision })).status, 200);
  f.outage();
  assert.equal((await f.request('paid')).status, 503);
});
