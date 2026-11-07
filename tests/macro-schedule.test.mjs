import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../supabase/site/003_macro_schedule.sql', import.meta.url), 'utf8');

test('server schedule is UTC-bounded and cannot issue HTTP while macro delivery is disabled', () => {
  assert.match(sql, /'0,15,30 6 \* \* \*'/);
  assert.match(sql, /current_setting\('cron.timezone', true\)/);
  assert.match(sql, /where exists \(select 1 from public.alfa_macro_settings where id = 1 and payload->>'enabled' = 'true'\)/);
  assert.match(sql, /https:\/\/alfa-trader\.com\/api\/ai\?macro=1&action=run/);
  assert.equal((sql.match(/select cron\.schedule\(/g) || []).length, 1);
});

test('dormant installation requires a unique Vault secret and never embeds the credential', () => {
  assert.match(sql, /Install only while macro delivery is disabled/);
  assert.match(sql, /count\(\*\) from vault\.secrets where name = 'alfa_macro_trigger'\) <> 1/);
  assert.match(sql, /select decrypted_secret from vault\.decrypted_secrets/);
  assert.ok(!/[a-f0-9]{64}/i.test(sql));
  assert.match(sql, /\nbegin;/);
  assert.match(sql, /\ncommit;/);
});
