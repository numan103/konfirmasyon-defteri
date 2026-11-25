// Catalog-only postflight checked against isolated PostgreSQL, never production.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(process.env.ALFA_PGLITE_PATH
  ? pathToFileURL(process.env.ALFA_PGLITE_PATH).href : '@electric-sql/pglite');
const migration = await fs.readFile(new URL('../../supabase/site/040_chart_workspaces.sql', import.meta.url), 'utf8');
const sql = await fs.readFile(new URL('../../supabase/site/040_chart_workspaces_postflight.sql', import.meta.url), 'utf8');
async function setup(migrate = true) {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
    grant usage on schema public to authenticated,anon,service_role;
    alter default privileges grant all on tables to public,anon,authenticated,service_role;
  `);
  if (migrate) await db.exec(migration);
  return db;
}
async function report(db) {
  const before = (await db.query("select oid,relacl,relrowsecurity from pg_class where relnamespace='public'::regnamespace order by oid")).rows;
  await db.exec('begin transaction read only;');
  let result;
  try { result = await db.query(sql); }
  finally { await db.exec('rollback;'); }
  assert.deepEqual((await db.query("select oid,relacl,relrowsecurity from pg_class where relnamespace='public'::regnamespace order by oid")).rows, before);
  assert.equal(result.rows.length, 1);
  return JSON.parse(result.rows[0].postflight_json);
}
test('postflight reports missing workspace as BLOCKED, never PASS', async () => {
  const db = await setup(false);
  try {
    const result = await report(db);
    assert.equal(result.overall, 'BLOCKED');
    assert.equal(result.checks.find(c => c.check_name === 'relation').status, 'BLOCKED');
  } finally { await db.close(); }
});
test('postflight passes after migration twice under broad defaults without changing catalogs', async () => {
  const db = await setup();
  try {
    await db.exec(migration);
    const result = await report(db);
    assert.equal(result.overall, 'PASS');
    assert.ok(result.checks.every(c => c.status === 'PASS'));
    assert.ok(result.effective_table_privileges.filter(p => ['anon','authenticated'].includes(p.role_name) && p.privilege_type === 'TRUNCATE').every(p => !p.allowed));
  } finally { await db.close(); }
});
test('postflight detects unsafe effective table and column grants, then passes after migration repair', async () => {
  const db = await setup();
  try {
    await db.exec('grant truncate on public.chart_workspaces to authenticated; grant select(workspace) on public.chart_workspaces to anon;');
    const result = await report(db);
    assert.equal(result.overall, 'FAIL');
    assert.equal(result.checks.find(c => c.check_name === 'effective_table_allowlist').status, 'FAIL');
    assert.equal(result.checks.find(c => c.check_name === 'effective_column_allowlist').status, 'FAIL');
    await db.exec(migration);
    assert.equal((await report(db)).overall, 'PASS');
  } finally { await db.close(); }
});
test('postflight detects disabled RLS or unexpected permissive policy', async () => {
  for (const statement of [
    'alter table public.chart_workspaces disable row level security',
    'create policy unrelated_permissive on public.chart_workspaces for select to authenticated using(true)'
  ]) {
    const db = await setup();
    try {
      await db.exec(statement);
      assert.equal((await report(db)).overall, 'FAIL');
    } finally { await db.close(); }
  }
});
