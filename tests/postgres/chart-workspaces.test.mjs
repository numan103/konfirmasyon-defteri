// Real embedded PostgreSQL, isolated synthetic data only.
// ALFA_PGLITE_PATH=<absolute path to @electric-sql/pglite/dist/index.js>
// node --test tests/postgres/chart-workspaces.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(process.env.ALFA_PGLITE_PATH
  ? pathToFileURL(process.env.ALFA_PGLITE_PATH).href : '@electric-sql/pglite');
const sql = await fs.readFile(new URL('../../supabase/site/040_chart_workspaces.sql', import.meta.url), 'utf8');
const alice = '11111111-1111-4111-8111-111111111111', bob = '22222222-2222-4222-8222-222222222222';
const workspace = { panes: [{ id: 1, symbol: 'BTCUSDT', interval: '4h' }], layout: 1 };
async function setup({ broad = false } = {}) {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key);
    insert into auth.users values('${alice}'),('${bob}');
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,public to authenticated,anon,service_role;
    grant execute on function auth.uid() to authenticated,anon,service_role;
    create table public.chart_settings(id int primary key, settings jsonb);
    insert into public.chart_settings values(1,'{"sentinel":"keep-settings"}');
    alter table public.chart_settings enable row level security;
    create policy original_settings_policy on public.chart_settings for select to authenticated using(true);
    create table public.chart_drawings(id int primary key, document jsonb);
    insert into public.chart_drawings values(1,'{"sentinel":"keep-drawings"}');
    create table public.watchlist_sentinel(id int primary key, document jsonb);
    insert into public.watchlist_sentinel values(1,'{"sentinel":"keep-watchlist"}');
    alter default privileges in schema public grant all on tables to service_role;
    ${broad ? 'alter default privileges grant all on tables to public, anon, authenticated;' : ''}
  `);
  return db;
}
async function migrate(db) {
  try { await db.exec(sql); }
  catch (error) { await db.exec('rollback;'); throw error; }
}
async function existingSnapshot(db) {
  return {
    settings: (await db.query('select * from chart_settings')).rows,
    drawings: (await db.query('select * from chart_drawings')).rows,
    watchlist: (await db.query('select * from watchlist_sentinel')).rows,
    policies: (await db.query("select * from pg_policies where tablename='chart_settings'")).rows,
    defaults: (await db.query('select * from pg_default_acl order by oid')).rows
  };
}
test('migration applies twice, preserving workspace rows, revisions, policy OIDs and existing tables', async () => {
  const db = await setup();
  try {
    const before = await existingSnapshot(db);
    await migrate(db);
    await db.query('insert into chart_workspaces(user_id,workspace,revision) values($1,$2,7)', [alice, workspace]);
    const rows = (await db.query('select * from chart_workspaces')).rows;
    const policies = (await db.query("select * from pg_policy where polrelid='public.chart_workspaces'::regclass order by oid")).rows;
    await migrate(db);
    assert.deepEqual((await db.query('select * from chart_workspaces')).rows, rows);
    assert.deepEqual((await db.query("select * from pg_policy where polrelid='public.chart_workspaces'::regclass order by oid")).rows, policies);
    assert.deepEqual(await existingSnapshot(db), before);
  } finally { await db.close(); }
});
test('mismatched or unknown policies abort atomically without dropping policies or user data', async () => {
  for (const change of [
    'alter policy chart_workspaces_select on chart_workspaces using(true)',
    'create policy unrelated_policy on chart_workspaces for select to authenticated using(true)'
  ]) {
    const db = await setup();
    try {
      await migrate(db);
      await db.query('insert into chart_workspaces(user_id,workspace) values($1,$2)', [alice, workspace]);
      await db.exec(change);
      const policies = (await db.query("select * from pg_policy where polrelid='public.chart_workspaces'::regclass order by oid")).rows;
      await assert.rejects(migrate(db), /policy mismatch|unexpected RLS policy/);
      assert.equal((await db.query('select * from chart_workspaces')).rows.length, 1);
      assert.deepEqual((await db.query("select * from pg_policy where polrelid='public.chart_workspaces'::regclass order by oid")).rows, policies);
    } finally { await db.close(); }
  }
});
test('same-name incompatible schema fails closed instead of changing an unrelated table', async () => {
  const db = await setup();
  try {
    await db.exec('create table public.chart_workspaces(sentinel text); insert into public.chart_workspaces values (\'keep\');');
    await assert.rejects(migrate(db), /schema mismatch/);
    assert.deepEqual((await db.query('select * from public.chart_workspaces')).rows, [{ sentinel: 'keep' }]);
    assert.equal((await db.query("select relrowsecurity from pg_class where oid='public.chart_workspaces'::regclass")).rows[0].relrowsecurity, false);
  } finally { await db.close(); }
});
