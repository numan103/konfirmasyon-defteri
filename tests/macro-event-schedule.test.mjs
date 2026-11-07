import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const sql=readFileSync(new URL('../supabase/site/004_macro_events.sql',import.meta.url),'utf8');
test('event storage is private and never replaces the original daily delivery table',()=>{
  assert.match(sql,/alfa_macro_events enable row level security/);
  assert.match(sql,/alfa_macro_updates enable row level security/);
  assert.match(sql,/revoke all on public.alfa_macro_events,public.alfa_macro_updates from anon,authenticated/);
  assert.ok(!/delete from|truncate|update public.alfa_macro_reports/i.test(sql));
  assert.match(sql,/where id=1 and not\(payload \? 'eventUpdatesEnabled'\)/);
});
test('event scheduler requires both permissions and has no embedded credentials or model calls',()=>{
  assert.match(sql,/'0 6,12,18 \* \* \*'/);
  assert.match(sql,/'\*\/5 \* \* \* \*'/);
  assert.equal((sql.match(/payload->>'enabled'='true' and payload->>'eventUpdatesEnabled'='true'/g)||[]).length,2);
  assert.equal((sql.match(/select cron.schedule\(/g)||[]).length,2);
  assert.ok(!/[a-f0-9]{64}/i.test(sql));
  assert.match(sql,/Pause macro delivery before installing/);
});
