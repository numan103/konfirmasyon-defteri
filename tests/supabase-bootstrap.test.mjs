import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  runBootstrapProbe, EDU_SEED_IDS, ALFANEWS_SEED_ID,
  SUPABASE_URL, SUPABASE_PUBLISHABLE, SITE_URL,
} from '../lib/supabase-bootstrap.mjs';

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
});

function harness(overrides = {}) {
  const calls = [];
  const fixtures = {
    edu_shared: () => EDU_SEED_IDS.map(id => ({ id, updated_at: '2026-11-24T00:00:00+00:00' })),
    alfanews: () => [{ id: ALFANEWS_SEED_ID, updated_at: '2026-11-24T00:00:00+00:00' }],
    journals: () => [],
    site_access: () => [],
    landing: () => ({ portfolio: { returnPct: 1 } }),
    news: () => ({ ok: true, data: { entries: [{ id: 'seed' }] } }),
    ...overrides,
  };
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    const u = new URL(url);
    if (u.hostname === 'new.supabase.co') {
      if (u.pathname === '/rest/v1/edu_shared') return json(fixtures.edu_shared());
      if (u.pathname === '/rest/v1/alfanews') return json(fixtures.alfanews());
      if (u.pathname === '/rest/v1/journals') return json(fixtures.journals());
      if (u.pathname === '/rest/v1/site_access') return json(fixtures.site_access());
      throw new Error('unexpected Supabase path ' + u.pathname);
    }
    if (u.origin === 'https://site.example') {
      if (u.pathname === '/api/edu-shared' && u.searchParams.get('kind') === 'landing') return json(fixtures.landing());
      if (u.pathname === '/api/edu-shared' && u.searchParams.get('kind') === 'news') return json(fixtures.news());
      throw new Error('unexpected site path ' + u.pathname);
    }
    throw new Error('unexpected origin ' + u.origin);
  };
  const run = extra => runBootstrapProbe({
    fetchImpl, supabaseUrl: 'https://new.supabase.co', siteUrl: 'https://site.example/', ...extra,
  });
  return { calls, run, fixtures };
}

test('bootstrap probe verifies seed rows, RLS boundary and service-backed site reads', async () => {
  const { calls, run } = harness();
  const result = await run();
  assert.equal(result.ok, true, JSON.stringify(result.checks));
  assert.deepEqual(result.checks.map(c => c.name), [
    'project_ref', 'edu_shared_seed', 'alfanews_seed', 'private_rows_not_public',
    'service_role_read', 'public_news_projection',
  ]);
  assert.ok(result.checks.every(c => c.ok));
  assert.ok(calls.every(c => !c.url.includes('zvnjslmptwmnuhftgqsr')));
  assert.equal(calls.filter(c => c.url.includes('/rest/v1/')).length, 4);
  const restCall = calls.find(c => c.url.includes('/rest/v1/edu_shared'));
  assert.equal(restCall.options.headers.apikey, 'sb_publishable_Zo8BS0jA6f0RBY0DIRUmvg_WsXngIx-');
  assert.ok(!JSON.stringify(calls).includes('sb_secret_'), 'probe must never send the service key');
});

test('legacy restricted project fails closed before any network call', async () => {
  const { calls, run } = harness();
  const result = await run({ supabaseUrl: 'https://zvnjslmptwmnuhftgqsr.supabase.co' });
  assert.equal(result.ok, false);
  assert.equal(result.checks.length, 1);
  assert.equal(result.checks[0].name, 'project_ref');
  assert.equal(calls.length, 0);
});

test('missing seed, leaked private row or broken service route makes the probe fail', async () => {
  const missingSeed = await harness({ edu_shared: () => EDU_SEED_IDS.slice(0, 3).map(id => ({ id })) }).run();
  assert.equal(missingSeed.checks.find(c => c.name === 'edu_shared_seed').ok, false);

  const leaked = await harness({ journals: () => [{ user_id: 'private' }] }).run();
  assert.equal(leaked.checks.find(c => c.name === 'private_rows_not_public').ok, false);

  const brokenService = await harness({ landing: () => ({ error: 'unavailable' }) }).run();
  assert.equal(brokenService.checks.find(c => c.name === 'service_role_read').ok, false);

  const emptyNews = await harness({ news: () => ({ ok: true, data: { entries: [] } }) }).run();
  assert.equal(emptyNews.checks.find(c => c.name === 'public_news_projection').ok, false);
});

test('bootstrap defaults point at the new project and the probe keeps secrets out of source', () => {
  assert.ok(SUPABASE_URL.includes('fssrtlpjqbavzomynwmg.supabase.co'));
  assert.ok(SUPABASE_PUBLISHABLE.startsWith('sb_publishable_'));
  assert.equal(SITE_URL, 'https://alfa-trader.com');
  const source = fs.readFileSync(new URL('../lib/supabase-bootstrap.mjs', import.meta.url), 'utf8');
  assert.ok(!source.includes('SUPABASE_SERVICE_ROLE'));
  assert.ok(!source.includes('sb_secret_'));
  const readme = fs.readFileSync(new URL('../supabase/site/README.md', import.meta.url), 'utf8');
  assert.match(readme, /node scripts\/verify-supabase-bootstrap\.mjs/);
});
