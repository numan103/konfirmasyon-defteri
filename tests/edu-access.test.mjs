import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { memberPurchaseId, sealRecord } from '../lib/education-crm.mjs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('../api/edu-shared.mjs', import.meta.url), 'utf8');
const accessLib = fs.readFileSync(new URL('../lib/edu-access.mjs', import.meta.url), 'utf8');

function channels() {
  return {
    traders: {
      t1: {
        id: 't1', name: 'Trader Ahmet', sections: {
          s1: [{
            id: 'topic', title: 'Konu', videos: [
              { id: 'old', title: 'Eski ders', url: 'https://youtu.be/old', type: 'video' },
              { id: 'live', title: 'Canlı ders', url: 'https://youtu.be/live-secret', type: 'video', access: 'paid', plans: ['live'] },
              { id: 'video', title: 'Video paketi dersi', url: 'https://youtu.be/video-secret', type: 'video', access: 'paid', plans: ['video'] },
            ],
          }],
        },
      },
    },
    order: ['t1'],
  };
}

function response() {
  return {
    code: 200, body: null, headers: {},
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; },
    status(c) { this.code = c; return this; },
    json(v) { this.body = v; return this; },
    end() { return this; },
  };
}

async function channelGet(options = {}) {
  const { user = null, tierRows = [], crmRows = [], data = channels() } = options;
  const original = globalThis.fetch;
  process.env.EDU_CRM_SECRET = 'unit-edu-secret';
  process.env.SUPABASE_SERVICE_ROLE = 'unit-service-role';
  process.env.SITE_ADMIN_EMAILS = 'admin@test.dev';
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) {
      return user ? Response.json(user) : new Response('{}', { status: 401 });
    }
    if (u.includes('/rest/v1/site_access')) return Response.json(tierRows);
    if (u.includes('id=like.educrm_')) return Response.json(crmRows);
    if (u.includes('/rest/v1/edu_shared')) return Response.json([{ id: 'channels', data }]);
    throw new Error('Beklenmeyen istek: ' + u);
  };
  try {
    const mod = await import('../api/edu-shared.mjs?edu-access=' + Math.random());
    const res = response();
    await mod.default({
      method: 'GET', query: { kind: 'channel' },
      headers: user ? { authorization: 'Bearer unit-token' } : {},
    }, res);
    return res;
  } finally {
    globalThis.fetch = original;
  }
}

function videos(res) {
  return res.body.data.traders.t1.sections.s1[0].videos;
}

function lockedHelper() {
  const match = html.match(/function chItemLocked\(v\)[^\n]*/);
  assert.ok(match, 'chItemLocked bulunamadı');
  const ctx = {};
  vm.runInNewContext(match[0] + '\nthis.chItemLocked = chItemLocked;', ctx);
  return ctx.chItemLocked;
}

function verifiedRecord(userId, plan) {
  const id = memberPurchaseId(userId, plan, 'cash');
  return { id, data: sealRecord(id, { memberId: userId, plan, stage: 'verified' }) };
}

test('Edu sayfası herkese açık; ücretli içerik kilidi istemcide değil sunucuda kurulur', () => {
  assert.match(html, /egitim: 'free'/);
  assert.match(html, /id="ch-in-access"/);
  assert.match(html, /id="ch-plan-opts"/);
  assert.match(html, /function chItemLocked\(v\)/);
  assert.match(html, /className = 'ch-lock'/);
  assert.ok(api.includes('projectChannels(base, { privileged, plans, user })'));
  assert.ok(accessLib.includes("v.url = ''; v.body = ''; v.photos = []; v.vids = [];"));
  assert.ok(api.includes("res.setHeader('Cache-Control', 'private, no-store')"));
  assert.ok(api.includes('if (!await requireEduWriter(req, res, true)) return;'), 'legacy/feature yazımları admin JWT ile korunmalı');
  assert.ok(api.includes('if (!await requireEduWriter(req, res)) return;'), 'shortlink yazımı oturum gerektirmeli');
  const progressDispatch = api.indexOf("req.query?.kind === 'progress'");
  const adminGate = api.indexOf('if (!await requireEduWriter(req, res, true)) return;', progressDispatch + 1);
  assert.ok(progressDispatch > -1 && adminGate > progressDispatch, 'progress dispatch admin gate önünde olmalı');
  assert.ok(accessLib.includes('v.locked = false; return;'), 'sunucu erişilebilir ücretli öğeyi açıkça unlocked bildirmeli');
});

test('kilit kararı sunucu locked alanından okunur, içerik boşluğundan tahmin edilmez', () => {
  const locked = lockedHelper();
  assert.equal(locked({ locked: true, access: 'paid', url: 'https://youtu.be/secret' }), true);
  assert.equal(locked({ locked: false, access: 'paid', url: '', body: '', photos: [], vids: [] }), false);
  assert.equal(locked({ access: 'paid', url: '' }), false, 'locked alanı yoksa içerik boşluğu kilit sayılmaz');
  assert.equal(locked(null), false);
});

test('eski dersler ücretsiz kalır; ücretli video adresi anonim okuyucuda çıkarılır', async () => {
  const res = await channelGet();
  assert.equal(res.code, 200);
  const v = videos(res);
  assert.equal(v[0].url, 'https://youtu.be/old', 'eski içerik ücretsiz');
  assert.notEqual(v[0].locked, true);
  assert.equal(v[1].url, '');
  assert.equal(v[1].locked, true);
  assert.deepEqual(v[1].plans, ['live']);
  assert.equal(v[2].locked, true);
  assert.equal(res.headers['cache-control'], 'private, no-store');
});

test('admin ve referanslı üye tüm derslere erişir', async () => {
  const admin = await channelGet({ user: { id: 'admin1', email: 'admin@test.dev', admin: true } });
  assert.equal(videos(admin)[1].url, 'https://youtu.be/live-secret');
  assert.equal(videos(admin)[1].locked, false, 'erişilebilir ücretli öğe unlocked bildirilmeli');

  const ref = await channelGet({
    user: { id: 'u2', email: 'ref@test.dev', admin: false },
    tierRows: [{ status: 'verified' }],
  });
  assert.equal(videos(ref)[2].url, 'https://youtu.be/video-secret');
  assert.equal(videos(ref)[2].locked, false);
});

test('onaylanmış CRM paketi yalnızca kendi derslerini açar', async () => {
  const res = await channelGet({
    user: { id: 'u1', email: 'free@test.dev', admin: false },
    tierRows: [{ status: 'pending' }],
    crmRows: [verifiedRecord('u1', 'live')],
  });
  const v = videos(res);
  assert.equal(v[1].url, 'https://youtu.be/live-secret', 'onaylanan canlı paket açılır');
  assert.ok(!v[1].locked);
  assert.equal(v[2].url, '', 'alınmayan video paketi kilitli kalır');
  assert.equal(v[2].locked, true);
});

test('reddedilen veya başkasına ait CRM kaydı erişim açmaz', async () => {
  const id = memberPurchaseId('u1', 'live', 'cash');
  const pending = { id, data: sealRecord(id, { memberId: 'u1', plan: 'live', stage: 'applied' }) };
  const other = verifiedRecord('someone-else', 'live');
  const res = await channelGet({
    user: { id: 'u1', email: 'free@test.dev', admin: false },
    tierRows: [],
    crmRows: [pending, other],
  });
  assert.equal(videos(res)[1].locked, true);
});
