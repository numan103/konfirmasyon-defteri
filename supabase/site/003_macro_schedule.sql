-- Requires 002_macro.sql, pg_cron + pg_net, and a Vault secret named
-- alfa_macro_trigger containing the SAME value as MACRO_CRON_SECRET in Vercel.
-- Enter the value in the Supabase Vault UI; never commit it to SQL or cron text.
-- NO purchase is needed. Dormant provisioning is allowed while enabled=false.
-- Activation still requires a successful test for the CURRENT target/topic.
begin;
do $$ begin
  if exists (select 1 from public.alfa_macro_settings where id = 1 and payload->>'enabled' = 'true') then
    raise exception 'Install only while macro delivery is disabled';
  end if;
  if (select count(*) from vault.secrets where name = 'alfa_macro_trigger') <> 1 then
    raise exception 'Exactly one scheduler secret is required';
  end if;
end $$;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
do $$ begin
  if coalesce(current_setting('cron.timezone', true), 'GMT') not in ('GMT', 'UTC') then
    raise exception 'Cron timezone must be UTC/GMT before installing the 06:00 UTC schedule';
  end if;
end $$;
select cron.schedule(
  'alfa-macro-0900-istanbul',
  '0,15,30 6 * * *', -- UTC 06:00 = Europe/Istanbul 09:00; two bounded recovery ticks.
  $job$
  select net.http_get(
    url := 'https://alfa-trader.com/api/ai?macro=1&action=run',
    headers := jsonb_build_object('Authorization', 'Bearer ' ||
      (select decrypted_secret from vault.decrypted_secrets where name = 'alfa_macro_trigger' limit 1)),
    timeout_milliseconds := 55000
  )
  where exists (select 1 from public.alfa_macro_settings where id = 1 and payload->>'enabled' = 'true')
    and exists (select 1 from vault.secrets where name = 'alfa_macro_trigger');
  $job$
);
commit;
-- Inspect only schedule metadata, NEVER the Vault value or pg_net request headers:
-- select jobid, jobname, schedule, active from cron.job where jobname='alfa-macro-0900-istanbul';
-- Emergency stop: select cron.unschedule('alfa-macro-0900-istanbul');
