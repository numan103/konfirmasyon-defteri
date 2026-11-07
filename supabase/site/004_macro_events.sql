-- Dormant event pipeline. Existing daily reports, approvals and portfolio data stay intact.
-- Requires 003_macro_schedule.sql and its Vault secret; no credential values in this file.
begin;
do $$ begin
  if exists(select 1 from public.alfa_macro_settings where id=1 and payload->>'enabled'='true') then
    raise exception 'Pause macro delivery before installing the event pipeline';
  end if;
  if coalesce(current_setting('cron.timezone',true),'GMT') not in ('GMT','UTC') then
    raise exception 'Cron timezone must be UTC/GMT';
  end if;
end $$;
create table if not exists public.alfa_macro_events (
  id text primary key,
  scheduled_at timestamptz not null,
  revision uuid not null,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists alfa_macro_events_scheduled_at on public.alfa_macro_events(scheduled_at);
create table if not exists public.alfa_macro_updates (
  id text primary key,
  revision uuid not null,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.alfa_macro_events enable row level security;
alter table public.alfa_macro_updates enable row level security;
revoke all on public.alfa_macro_events,public.alfa_macro_updates from anon,authenticated;
grant select,insert,update on public.alfa_macro_events,public.alfa_macro_updates to service_role;
update public.alfa_macro_settings set payload=payload||'{"eventUpdatesEnabled":false,"eventPipelineVersion":"events-v1"}'::jsonb,revision=gen_random_uuid(),updated_at=now()
where id=1 and not(payload ? 'eventUpdatesEnabled');
select cron.schedule('alfa-macro-agenda','0 6,12,18 * * *',$job$
  select net.http_get(url:='https://alfa-trader.com/api/ai?macro=1&action=agenda',headers:=jsonb_build_object('Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='alfa_macro_trigger' limit 1)),timeout_milliseconds:=55000)
  where exists(select 1 from public.alfa_macro_settings where id=1 and payload->>'enabled'='true' and payload->>'eventUpdatesEnabled'='true');
$job$);
select cron.schedule('alfa-macro-event-tick','*/5 * * * *',$job$
  select net.http_get(url:='https://alfa-trader.com/api/ai?macro=1&action=events',headers:=jsonb_build_object('Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='alfa_macro_trigger' limit 1)),timeout_milliseconds:=55000)
  where exists(select 1 from public.alfa_macro_settings where id=1 and payload->>'enabled'='true' and payload->>'eventUpdatesEnabled'='true');
$job$);
commit;
-- Safe verification: select jobname,schedule,active from cron.job where jobname like 'alfa-macro-%';
