-- Additive research storage. Apply separately in the Supabase SQL Editor.
-- No changes to chart_settings, drawings or existing application tables.
begin;
create table if not exists public.research_sessions (
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id text not null check (length(session_id) between 1 and 150),
  branch_id text not null default 'main' check (branch_id ~ '^[a-zA-Z0-9_-]{1,100}$'),
  symbol text not null check (symbol in ('BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT')),
  timeframe text not null check (timeframe in ('1m','5m','15m','30m','1h','4h','1d','1w')),
  revision bigint not null check (revision between 1 and 10000),
  payload jsonb not null check (jsonb_typeof(payload)='object' and octet_length(payload::text)<=4194304),
  updated_at timestamptz not null default now(),
  primary key (user_id,session_id,branch_id)
);
create table if not exists public.research_session_versions (
  user_id uuid not null,
  session_id text not null,
  branch_id text not null,
  revision bigint not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id,session_id,branch_id,revision),
  foreign key (user_id,session_id,branch_id) references public.research_sessions(user_id,session_id,branch_id) on delete cascade
);
create table if not exists public.research_candles (
  user_id uuid not null,
  session_id text not null,
  branch_id text not null,
  timeframe text not null check (timeframe in ('1m','5m','15m','30m','1h','4h','1d','1w')),
  time bigint not null check (time>0 and time<=8640000000000),
  open double precision not null,
  high double precision not null,
  low double precision not null,
  close double precision not null,
  primary key (user_id,session_id,branch_id,timeframe,time),
  foreign key (user_id,session_id,branch_id) references public.research_sessions(user_id,session_id,branch_id) on delete cascade,
  check (low>0 and high>0 and open>0 and close>0 and
    high< 'Infinity'::float8 and low< 'Infinity'::float8 and open< 'Infinity'::float8 and close< 'Infinity'::float8 and
    low<=least(open,close) and high>=greatest(open,close))
);
create table if not exists public.research_legacy_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  record_key text not null check (length(record_key) between 1 and 500),
  digest text not null check (digest ~ '^[a-f0-9]{64}$'),
  document jsonb not null check (octet_length(document::text)<=4194304),
  created_at timestamptz not null default now(),
  primary key(user_id,record_key,digest)
);
alter table public.research_sessions enable row level security;
alter table public.research_session_versions enable row level security;
alter table public.research_candles enable row level security;
alter table public.research_sessions force row level security;
alter table public.research_session_versions force row level security;
alter table public.research_candles force row level security;
alter table public.research_legacy_records enable row level security;
alter table public.research_legacy_records force row level security;
revoke all on public.research_sessions,public.research_session_versions,public.research_candles from public,anon,authenticated;
grant select,insert,update on public.research_sessions to authenticated;
grant select,insert on public.research_session_versions,public.research_candles to authenticated;
revoke all on public.research_legacy_records from public,anon,authenticated;
grant select,insert on public.research_legacy_records to authenticated;
drop policy if exists research_legacy_read on public.research_legacy_records;
drop policy if exists research_legacy_insert on public.research_legacy_records;
create policy research_legacy_read on public.research_legacy_records for select to authenticated using ((select auth.uid())=user_id);
create policy research_legacy_insert on public.research_legacy_records for insert to authenticated with check ((select auth.uid())=user_id);
drop policy if exists research_sessions_read on public.research_sessions;
drop policy if exists research_sessions_insert on public.research_sessions;
drop policy if exists research_sessions_update on public.research_sessions;
create policy research_sessions_read on public.research_sessions for select to authenticated using ((select auth.uid())=user_id);
create policy research_sessions_insert on public.research_sessions for insert to authenticated with check ((select auth.uid())=user_id);
create policy research_sessions_update on public.research_sessions for update to authenticated
  using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
drop policy if exists research_versions_read on public.research_session_versions;
drop policy if exists research_versions_insert on public.research_session_versions;
create policy research_versions_read on public.research_session_versions for select to authenticated using ((select auth.uid())=user_id);
create policy research_versions_insert on public.research_session_versions for insert to authenticated with check ((select auth.uid())=user_id);
drop policy if exists research_candles_read on public.research_candles;
drop policy if exists research_candles_insert on public.research_candles;
create policy research_candles_read on public.research_candles for select to authenticated using ((select auth.uid())=user_id);
create policy research_candles_insert on public.research_candles for insert to authenticated with check ((select auth.uid())=user_id);

create or replace function public.research_guard_session() returns trigger
language plpgsql security invoker set search_path='' as $$
declare r jsonb; p jsonb; old_events jsonb; new_events jsonb; item jsonb; k text; hist jsonb; step bigint;
begin
  if auth.uid() is null or new.user_id<>auth.uid() then raise exception 'research_owner_required' using errcode='42501'; end if;
  r:=new.payload->'replay'; p:=r->'paper';
  step:=case new.timeframe when '1m' then 60 when '5m' then 300 when '15m' then 900 when '30m' then 1800
    when '1h' then 3600 when '4h' then 14400 when '1d' then 86400 when '1w' then 604800 end;
  if new.payload->>'version' is distinct from '1' or r->>'version' is distinct from '1' or
    r->>'id' is distinct from new.session_id or r->>'symbol' is distinct from new.symbol or
    r->>'timeframe' is distinct from new.timeframe or r->>'exchange' is distinct from 'Binance' or
    r->>'marketType' is distinct from 'spot' then raise exception 'research_context_mismatch'; end if;
  if jsonb_typeof(new.payload->'watermark') is distinct from 'number' or
    jsonb_typeof(r->'dataStart') is distinct from 'number' or jsonb_typeof(r->'startTime') is distinct from 'number' or
    jsonb_typeof(r->'currentTime') is distinct from 'number' then raise exception 'research_clock_required'; end if;
  if (r->>'dataStart')::numeric<=0 or (r->>'dataStart')::numeric>(r->>'startTime')::numeric or
    (r->>'startTime')::numeric>(r->>'currentTime')::numeric or
    (new.payload->>'watermark')::numeric<(r->>'currentTime')::numeric+step or
    (new.payload->>'watermark')::numeric>extract(epoch from clock_timestamp())
  then raise exception 'research_clock_invalid'; end if;
  if p is not null and p<>'null'::jsonb then
    if p->>'version' is distinct from '1' or p->'context'->>'sessionId' is distinct from new.session_id or
      p->'context'->>'symbol' is distinct from new.symbol or p->'context'->>'timeframe' is distinct from new.timeframe or
      coalesce(p->'context'->>'branchId','main')<>new.branch_id or
      jsonb_typeof(p->'events') is distinct from 'array' then raise exception 'research_paper_invalid'; end if;
    new_events:=p->'events';
    if jsonb_array_length(new_events)>10000 or exists (
      select 1 from jsonb_array_elements(new_events) e
      where jsonb_typeof(e->'id') is distinct from 'string' or length(e->>'id') not between 1 and 150 or
        coalesce(e->>'type' not in ('create','edit','close','cancel','resolve'),true) or jsonb_typeof(e->'at') is distinct from 'number'
    ) or (select count(distinct e->>'id') from jsonb_array_elements(new_events) e)<>jsonb_array_length(new_events)
    then raise exception 'research_event_log_invalid'; end if;
  end if;
  if tg_op='UPDATE' then
    if (new.payload->>'watermark')::numeric<(old.payload->>'watermark')::numeric then raise exception 'research_watermark_immutable'; end if;
    if (new.user_id,new.session_id,new.branch_id,new.symbol,new.timeframe) is distinct from
       (old.user_id,old.session_id,old.branch_id,old.symbol,old.timeframe) or new.revision<>old.revision+1
    then raise exception 'research_revision_conflict' using errcode='40001'; end if;
    foreach k in array array['id','dataStart','startTime','symbol','timeframe','exchange','marketType'] loop
      if old.payload->'replay'->k is distinct from r->k then raise exception 'research_identity_immutable'; end if;
    end loop;
    old_events:=coalesce(old.payload->'replay'->'paper'->'events','[]'::jsonb);
    new_events:=coalesce(p->'events','[]'::jsonb);
    if jsonb_array_length(new_events)<jsonb_array_length(old_events) or exists (
      select 1 from jsonb_array_elements(old_events) with ordinality x(e,n) where new_events->((n-1)::int) is distinct from e
    ) then raise exception 'research_event_log_immutable'; end if;
    for k,hist in select key,value from jsonb_each(coalesce(old.payload->'replay'->'paper'->'lab'->'annotations','{}')) loop
      if not coalesce(p->'lab'->'annotations'->k,'[]'::jsonb) @> hist then raise exception 'research_lab_history_immutable'; end if;
    end loop;
    for item in select value from jsonb_array_elements(coalesce(old.payload->'replay'->'paper'->'lab'->'templates','[]')) loop
      if not coalesce(p->'lab'->'templates','[]'::jsonb) @> jsonb_build_array(item) then raise exception 'research_template_immutable'; end if;
    end loop;
    for k,item in select key,value from jsonb_each(coalesce(old.payload->'replay'->'paper'->'analytics'->'annotations','{}')) loop
      if p->'analytics'->'annotations'->k is null or
        (p->'analytics'->'annotations'->k is distinct from item and
          coalesce((p->'analytics'->'annotations'->k->>'revision')::bigint,0)<=coalesce((item->>'revision')::bigint,0))
      then raise exception 'research_annotation_revision_required'; end if;
    end loop;
  elsif new.revision<>1 then raise exception 'research_initial_revision_required'; end if;
  new.updated_at:=now();
  return new;
end $$;
create or replace function public.research_archive_session() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  insert into public.research_session_versions(user_id,session_id,branch_id,revision,payload)
    values(new.user_id,new.session_id,new.branch_id,new.revision,new.payload);
  return new;
end $$;
create or replace function public.research_guard_version() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if not exists (select 1 from public.research_sessions s where s.user_id=new.user_id and s.session_id=new.session_id and
    s.branch_id=new.branch_id and s.revision=new.revision and s.payload=new.payload) then raise exception 'research_version_mismatch'; end if;
  return new;
end $$;
create or replace function public.research_guard_candle() returns trigger
language plpgsql security invoker set search_path='' as $$
declare observed numeric; step bigint;
begin
  select (s.payload->>'watermark')::numeric into observed from public.research_sessions s
    where s.user_id=new.user_id and s.session_id=new.session_id and s.branch_id=new.branch_id;
  step:=case new.timeframe when '1m' then 60 when '5m' then 300 when '15m' then 900 when '30m' then 1800
    when '1h' then 3600 when '4h' then 14400 when '1d' then 86400 when '1w' then 604800 end;
  if observed is null or step is null or new.time+step>observed then raise exception 'research_candle_outside_observed_clock'; end if;
  return new;
end $$;
drop trigger if exists research_session_guard on public.research_sessions;
create trigger research_session_guard before insert or update on public.research_sessions for each row execute function public.research_guard_session();
drop trigger if exists research_session_archive on public.research_sessions;
create trigger research_session_archive after insert or update on public.research_sessions for each row execute function public.research_archive_session();
drop trigger if exists research_version_guard on public.research_session_versions;
create trigger research_version_guard before insert on public.research_session_versions for each row execute function public.research_guard_version();
drop trigger if exists research_candle_guard on public.research_candles;
create trigger research_candle_guard before insert on public.research_candles for each row execute function public.research_guard_candle();

create or replace function public.research_commit_session(
  p_user_id uuid,p_session_id text,p_branch_id text,p_expected_revision bigint,p_payload jsonb,p_candles jsonb default '[]'
) returns table(revision bigint,updated_at timestamptz)
language plpgsql security invoker set search_path='' as $$
declare current_revision bigint; r jsonb;
begin
  if auth.uid() is null or auth.uid() is distinct from p_user_id then raise exception 'research_owner_required' using errcode='42501'; end if;
  if p_expected_revision is null or p_expected_revision<0 then raise exception 'research_expected_revision_required'; end if;
  if jsonb_typeof(p_candles) is distinct from 'array' or jsonb_array_length(p_candles)>55000 or
    octet_length(p_candles::text)>12582912 then raise exception 'research_candle_limit'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text||':'||p_session_id||':'||p_branch_id,0));
  select s.revision into current_revision from public.research_sessions s
    where s.user_id=p_user_id and s.session_id=p_session_id and s.branch_id=p_branch_id for update;
  if coalesce(current_revision,0)<>p_expected_revision then raise exception 'research_revision_conflict' using errcode='40001'; end if;
  -- Bound retained version storage; reject, never silently prune user history.
  if (select coalesce(sum(pg_column_size(v.payload)),0) from public.research_session_versions v where v.user_id=p_user_id)>52428800
    then raise exception 'research_version_quota_export_required'; end if;
  r:=p_payload->'replay';
  if current_revision is null then
    insert into public.research_sessions(user_id,session_id,branch_id,symbol,timeframe,revision,payload)
      values(p_user_id,p_session_id,p_branch_id,r->>'symbol',r->>'timeframe',1,p_payload);
  else
    update public.research_sessions s set payload=p_payload,revision=s.revision+1
      where s.user_id=p_user_id and s.session_id=p_session_id and s.branch_id=p_branch_id;
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_candles) as x(tf text,t bigint,o float8,h float8,l float8,c float8)
    join public.research_candles s on s.user_id=p_user_id and s.session_id=p_session_id and s.branch_id=p_branch_id and s.timeframe=x.tf and s.time=x.t
    where (s.open,s.high,s.low,s.close) is distinct from (x.o,x.h,x.l,x.c)
  ) then raise exception 'research_candle_immutable'; end if;
  if exists (select 1 from jsonb_to_recordset(p_candles) as x(tf text,t bigint,o float8,h float8,l float8,c float8)
    group by x.tf,x.t having count(distinct row(x.o,x.h,x.l,x.c))>1) then raise exception 'research_candle_duplicate_conflict'; end if;
  insert into public.research_candles(user_id,session_id,branch_id,timeframe,time,open,high,low,close)
    select p_user_id,p_session_id,p_branch_id,x.tf,x.t,x.o,x.h,x.l,x.c
    from jsonb_to_recordset(p_candles) as x(tf text,t bigint,o float8,h float8,l float8,c float8)
    on conflict do nothing;
  return query select s.revision,s.updated_at from public.research_sessions s
    where s.user_id=p_user_id and s.session_id=p_session_id and s.branch_id=p_branch_id;
end $$;
revoke all on function public.research_commit_session(uuid,text,text,bigint,jsonb,jsonb) from public,anon;
grant execute on function public.research_commit_session(uuid,text,text,bigint,jsonb,jsonb) to authenticated;
revoke all on function public.research_guard_session(),public.research_archive_session(),public.research_guard_version(),public.research_guard_candle() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
