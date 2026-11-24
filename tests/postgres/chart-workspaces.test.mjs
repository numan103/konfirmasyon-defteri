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
    tableGrants: (await db.query("select relname,relowner,relacl from pg_class where oid in ('public.chart_settings'::regclass,'public.chart_drawings'::regclass,'public.watchlist_sentinel'::regclass) order by relname")).rows,
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

async function asUser(db, user, role = 'authenticated') {
  await db.exec(`reset role; set role ${role};`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user || '']);
}
async function denied(db, query, params = []) {
  await assert.rejects(db.query(query, params), error => error.code === '42501');
}
async function owner(db) { await db.exec('reset role;'); }

test('broad PUBLIC/anon/authenticated defaults and column grants are narrowed on both runs', async () => {
  const db = await setup({ broad: true });
  try {
    const before = await existingSnapshot(db);
    for (let run = 0; run < 2; run++) {
      await migrate(db);
      for (const role of ['anon', 'authenticated']) {
        for (const privilege of ['DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) {
          const result = await db.query('select has_table_privilege($1,$2,$3) as allowed', [role, 'public.chart_workspaces', privilege]);
          assert.equal(result.rows[0].allowed, false, `${role} ${privilege}`);
        }
      }
      assert.equal((await db.query("select has_any_column_privilege('anon','public.chart_workspaces','SELECT,INSERT,UPDATE,REFERENCES') as allowed")).rows[0].allowed, false);
      assert.equal((await db.query("select has_any_column_privilege('authenticated','public.chart_workspaces','REFERENCES') as allowed")).rows[0].allowed, false);
      assert.deepEqual(await existingSnapshot(db), before);
      if (!run) await db.exec('grant select(workspace), references(user_id) on public.chart_workspaces to public,anon; grant references(user_id) on public.chart_workspaces to authenticated;');
    }
    // Existing default ACLs are untouched: subsequent unrelated tables retain
    // their original grants, not a schema-wide change made by this migration.
    await db.exec('create table public.unrelated_after_migration(id int);');
    assert.equal((await db.query("select has_table_privilege('authenticated','public.unrelated_after_migration','TRUNCATE') as allowed")).rows[0].allowed, true);
    await asUser(db, alice);
    await denied(db, 'truncate public.chart_workspaces');
  } finally { await db.close(); }
});

test('RLS enforces SELECT/INSERT/UPDATE ownership; clients cannot delete either account', async () => {
  const db = await setup({ broad: true });
  try {
    await migrate(db);
    await asUser(db, alice);
    await db.query('insert into chart_workspaces(user_id,workspace) values($1,$2)', [alice, workspace]);
    assert.equal((await db.query('select * from chart_workspaces')).rows.length, 1);
    await asUser(db, bob);
    assert.equal((await db.query('select * from chart_workspaces')).rows.length, 0);
    assert.equal((await db.query('update chart_workspaces set revision=9 where user_id=$1 returning *', [alice])).rows.length, 0);
    await denied(db, 'insert into chart_workspaces(user_id,workspace) values($1,$2)', [alice, workspace]);
    await db.query('insert into chart_workspaces(user_id,workspace) values($1,$2)', [bob, workspace]);
    await denied(db, 'update chart_workspaces set user_id=$1 where user_id=$2', [alice, bob]);
    assert.equal((await db.query('update chart_workspaces set revision=revision+1 where user_id=$1 and revision=1 returning revision', [bob])).rows[0].revision, 2);
    assert.equal((await db.query('update chart_workspaces set revision=3 where user_id=$1 and revision=1 returning revision', [bob])).rows.length, 0);
    await denied(db, 'delete from chart_workspaces where user_id=$1', [bob]);
    await denied(db, 'delete from chart_workspaces where user_id=$1', [alice]);
    // Isolate the DELETE policy boundary too: even an accidental DELETE grant
    // in this disposable DB cannot bypass the absence of a DELETE RLS policy.
    await owner(db);
    await db.exec('grant delete on public.chart_workspaces to authenticated;');
    await asUser(db, bob);
    assert.equal((await db.query('delete from chart_workspaces returning *')).rows.length, 0);
    await owner(db);
    await migrate(db); // removes the intentionally injected grant
    assert.equal((await db.query('select * from chart_workspaces')).rows.length, 2);
    await asUser(db, '');
    assert.equal((await db.query('select * from chart_workspaces')).rows.length, 0);
    await denied(db, 'insert into chart_workspaces(user_id,workspace) values($1,$2)', [alice, workspace]);
    await asUser(db, '', 'anon');
    for (const statement of [
      'select * from chart_workspaces',
      `insert into chart_workspaces(user_id,workspace) values('${alice}','{}')`,
      'update chart_workspaces set revision=9', 'delete from chart_workspaces',
      'truncate public.chart_workspaces'
    ]) await denied(db, statement);
  } finally { await db.close(); }
});

test('service role and migration owner retain administrative access without changing shared roles', async () => {
  const db = await setup({ broad: true });
  try {
    const before = (await db.query("select rolname,rolsuper,rolbypassrls,rolinherit from pg_roles where rolname in ('postgres','anon','authenticated','service_role') order by rolname")).rows;
    await migrate(db); await migrate(db);
    assert.deepEqual((await db.query("select rolname,rolsuper,rolbypassrls,rolinherit from pg_roles where rolname in ('postgres','anon','authenticated','service_role') order by rolname")).rows, before);
    for (const id of [alice, bob]) await db.query('insert into chart_workspaces(user_id,workspace) values($1,$2)', [id, workspace]);
    await asUser(db, '', 'service_role');
    assert.equal((await db.query('select * from chart_workspaces')).rows.length, 2);
    assert.equal((await db.query('update chart_workspaces set revision=revision+1 returning *')).rows.length, 2);
    for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) {
      assert.equal((await db.query('select has_table_privilege(current_user,$1,$2) as allowed', ['public.chart_workspaces', privilege])).rows[0].allowed, true);
    }
    await owner(db);
    assert.equal((await db.query('select * from chart_workspaces')).rows.length, 2);
  } finally { await db.close(); }
});

test('inherited unsafe grants or owner membership fail closed without changing shared roles or existing data', async () => {
  for (const scenario of ['inherited', 'owner']) {
    const db = await setup();
    try {
      await migrate(db);
      await db.query('insert into chart_workspaces(user_id,workspace) values($1,$2)', [alice, workspace]);
      if (scenario === 'inherited') await db.exec('create role extra_workspace_rights; grant truncate on public.chart_workspaces to extra_workspace_rights; grant extra_workspace_rights to authenticated;');
      else await db.exec('grant postgres to authenticated;');
      const membership = (await db.query('select roleid,member from pg_auth_members order by roleid,member')).rows;
      await assert.rejects(migrate(db), /unexpected effective client privileges|unsafe client role/);
      assert.deepEqual((await db.query('select roleid,member from pg_auth_members order by roleid,member')).rows, membership);
      assert.equal((await db.query('select * from chart_workspaces')).rows.length, 1);
    } finally { await db.close(); }
  }
});

test('original v1 table with user data and explicit UPDATE WITH CHECK upgrades twice without replacing policies', async () => {
  const db = await setup({ broad: true });
  try {
    await db.exec(await fs.readFile(new URL('./fixtures/chart-workspaces-v1.sql', import.meta.url), 'utf8'));
    await db.query('insert into chart_workspaces(user_id,workspace,revision) values($1,$2,9),($3,$2,4)', [alice, workspace, bob]);
    const before = await existingSnapshot(db);
    const rows = (await db.query('select * from chart_workspaces order by user_id')).rows;
    const policies = (await db.query("select * from pg_policy where polrelid='public.chart_workspaces'::regclass order by oid")).rows;
    await migrate(db); await migrate(db);
    assert.deepEqual((await db.query('select * from chart_workspaces order by user_id')).rows, rows);
    assert.deepEqual((await db.query("select * from pg_policy where polrelid='public.chart_workspaces'::regclass order by oid")).rows, policies);
    assert.deepEqual(await existingSnapshot(db), before);
    assert.equal((await db.query("select has_table_privilege('authenticated','public.chart_workspaces','TRUNCATE') as allowed")).rows[0].allowed, false);
  } finally { await db.close(); }
});
