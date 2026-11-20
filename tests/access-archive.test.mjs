import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const api = fs.readFileSync(new URL('../api/access.mjs', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const sql = fs.readFileSync(new URL('../supabase/site/012_access_archive.sql', import.meta.url), 'utf8');

test('rejected and revoked access rows are archived, not deleted', () => {
  assert.match(api, /op === 'reject'[\s\S]{0,600}patch\.archived_at = new Date\(\)\.toISOString\(\)/);
  assert.match(api, /op === 'revoke'[\s\S]{0,300}patch\.archived_at = new Date\(\)\.toISOString\(\)/);
  assert.match(sql, /add column if not exists archived_at timestamptz/);
  assert.match(sql, /where status = 'rejected' and archived_at is null/);
});

test('admin list defaults to active rows and offers an archive view', () => {
  assert.match(api, /wantArchive \? '&archived_at=not\.is\.null' : '&archived_at=is\.null'/);
  assert.match(api, /archive: wantArchive/);
  assert.match(html, /<option value="archive">Arşiv<\/option>/);
  assert.ok(!html.includes('id="acc-admin-all"'), 'old rejected toggle is removed');
  assert.ok(!/<option value="rejected">/.test(html), 'rejected tab is removed from active list');
});

test('archived members can reapply and admin can restore them', () => {
  assert.match(api, /op === 'restore'/);
  assert.match(api, /status: 'pending'[\s\S]{0,120}archived_at: null/);
  assert.match(api, /const archived = !!\(existing && existing\.archived_at\)/);
  assert.match(api, /attempts: archived \? 1/);
  assert.match(html, /attrs\.replace\('%OP%', 'restore'\)/);
  assert.match(html, /can_reapply/);
  assert.match(api, /archived_at: r\.archived_at \|\| null/);
});
