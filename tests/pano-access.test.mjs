import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const USER_A = 'aaaaaaaa-1111-4111-8111-111111111111';
const USER_B = 'bbbbbbbb-2222-4222-8222-222222222222';

async function loadHandler() {
  const mod = await import('../api/contrib.mjs?pano=' + Math.random());
  return mod.default;
}

function makeRes() {
  return {
    statusCode: 0,
    body: null,
    headers: {},
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end(body) { this.body = body; return this; },
  };
}

function fetchStub(state) {
  return async (url, init = {}) => {
    const u = String(url);
    const method = init.method || 'GET';
    if (u.includes('/auth/v1/user')) {
      const auth = String((init.headers && init.headers.Authorization) || '');
      const key = auth.replace(/^Bearer\s+/, '');
      const user = state.users[key];
      if (!user) return { ok: false, status: 401, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => user };
    }
    if (u.includes('/rest/v1/site_access')) {
      return { ok: true, status: 200, json: async () => [{ status: state.tier }] };
    }
    if (u.includes('/rest/v1/edu_shared')) {
      if (method === 'GET') {
        const m = /[?&]id=eq\.([^&]+)/.exec(u);
        const id = m ? decodeURIComponent(m[1]) : '';
        const data = state.rows[id];
        return { ok: true, status: 200, json: async () => (data === undefined ? [] : [{ id, data }]) };
      }
      if (method === 'POST') {
        const row = JSON.parse(init.body || '{}');
        state.writes.push(row);
        state.rows[row.id] = row.data;
        return { ok: true, status: 201, json: async () => ({}) };
      }
    }
    return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
  };
}

function makeState() {
  return {
    rows: {},
    writes: [],
    tier: 'verified',
    users: {
      'jwt-a': { id: USER_A, email: 'a@example.com', user_metadata: {} },
      'jwt-b': { id: USER_B, email: 'b@example.com', user_metadata: {} },
    },
  };
}

async function call(handler, jwt, body, query = {}) {
  const res = makeRes();
  const req = {
    method: body === undefined ? 'GET' : 'POST',
    headers: jwt ? { authorization: 'Bearer ' + jwt } : {},
    query: { store: 'pano', ...query },
    body,
  };
  await handler(req, res);
  return res;
}

test('çalışma panosu her üye için ayrı satırda tutulur ve oda adı yok sayılır', async () => {
  const state = makeState();
  globalThis.fetch = fetchStub(state);
  const handler = await loadHandler();

  const a1 = await call(handler, 'jwt-a', { data: [{ id: 'shape-a' }] }, { room: 'common' });
  assert.equal(a1.statusCode, 200);
  assert.equal(a1.body.ok, true);
  assert.equal(a1.body.scope, 'member');
  const storedA = state.rows['pano_member_' + USER_A];
  assert.ok(storedA);
  assert.equal(storedA.enc, 'p1', 'kişisel pano şifreli saklanır');
  assert.equal(JSON.stringify(storedA).includes('shape-a'), false);
  assert.equal(state.rows.panos, undefined, 'eski paylaşılan pano satırı yazılmaz');
  assert.equal(state.writes[0].id, 'pano_member_' + USER_A);

  const b1 = await call(handler, 'jwt-b', { data: [{ id: 'shape-b' }] }, { room: 'common' });
  assert.equal(b1.statusCode, 200);
  assert.ok(state.rows['pano_member_' + USER_B]);

  // A'nın panosu B'nin yazmasından sonra değişmedi.
  const a2 = await call(handler, 'jwt-a');
  assert.equal(a2.statusCode, 200);
  assert.deepEqual(a2.body.data, [{ id: 'shape-a' }]);

  const b2 = await call(handler, 'jwt-b');
  assert.deepEqual(b2.body.data, [{ id: 'shape-b' }]);

  // B, A'nın odasını hedeflese bile kendi satırına yazar.
  const b3 = await call(handler, 'jwt-b', { data: [{ id: 'shape-b2' }] }, { room: USER_A });
  assert.equal(b3.statusCode, 200);
  assert.deepEqual(state.rows['pano_member_' + USER_A], storedA, 'B yazınca A satırı değişmez');
  const b4 = await call(handler, 'jwt-b');
  assert.deepEqual(b4.body.data, [{ id: 'shape-b2' }]);
});

test('pano oturum ve premium üyelik ister', async () => {
  const state = makeState();
  globalThis.fetch = fetchStub(state);
  const handler = await loadHandler();

  const anon = await call(handler, '', { data: [] });
  assert.equal(anon.statusCode, 401);

  state.tier = 'free';
  const free = await call(handler, 'jwt-a', { data: [] });
  assert.equal(free.statusCode, 403);
  assert.equal(free.body.error, 'referral_required');
});

test('defter, haftalık değerlendirme ve çalışma panosu premium üyelere açık', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const tier = html.slice(html.indexOf('const PAGE_TIER'), html.indexOf('const SITE_REF_LINKS'));
  assert.match(tier, /defter:\s*'ref'/);
  assert.match(tier, /review:\s*'ref'/);
  assert.match(tier, /pano:\s*'ref'/);

  for (const id of ['tab-defter', 'tab-review', 'tab-pano', 'mnav-defter', 'mnav-review', 'mnav-pano']) {
    assert.ok(html.includes('id="' + id + '"'), id + ' menüde olmalı');
  }
  assert.ok(!html.includes('id="pano-room"'), 'oda değiştirici kaldırılmalı');
  assert.ok(!html.includes('store=pano&room='), 'pano isteği oda göndermemeli');
  assert.ok(html.includes("return 'm-' + String(AUTH.user.id).toLowerCase()"), 'istemci üye anahtarını kullanmalı');

  // Üyelik seviyesi yüklenmeden açılan derin bağlantı erişim sayfasında
  // kalıyordu; seviye gelince hedef sayfaya dönülmeli.
  assert.ok(html.includes('function restorePendingPage()'), 'derin bağlantı geri yükleme olmalı');
  assert.match(html, /if \(currentPage !== 'erisim' \|\| !accessNextPage\) return;/);
  assert.match(html, /applyTierUi\(\);\s*restorePendingPage\(\);/);
});
