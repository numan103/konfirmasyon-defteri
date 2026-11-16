-- Atomic portfolio-only versioning. Other edu_shared documents are unaffected.
begin;
create table if not exists public.portfolio_versions (
  id bigint generated always as identity primary key,
  revision timestamptz not null unique,
  saved_at timestamptz not null default clock_timestamp(),
  data jsonb not null,
  actor_id uuid,
  action text not null,
  position_count integer not null,
  sale_count integer not null
);
alter table public.portfolio_versions enable row level security;
revoke all on public.portfolio_versions from public, anon, authenticated, service_role;
grant select on public.portfolio_versions to service_role;
revoke all on sequence public.portfolio_versions_id_seq from public, anon, authenticated, service_role;

create or replace function public.portfolio_guard_version()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  effective_role text := current_setting('role', true);
  action_name text := coalesce(nullif(current_setting('alfa.portfolio_action', true), ''), 'legacy_write');
  actor uuid := nullif(current_setting('alfa.portfolio_actor', true), '')::uuid;
  missing_positions integer;
begin
  if (case when tg_op = 'DELETE' then old.id else new.id end) <> 'alfa_portfoy_public'
     and (tg_op <> 'UPDATE' or old.id <> 'alfa_portfoy_public') then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  -- Do not use current_user here: SECURITY DEFINER changes it to the owner.
  if not (
    coalesce(effective_role, 'none') in ('service_role', 'postgres', 'supabase_admin')
    or (coalesce(effective_role, 'none') = 'none' and session_user in ('postgres', 'supabase_admin'))
  ) then
    raise exception using errcode = '42501', message = 'portfolio_server_only';
  end if;
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and new.id <> old.id) then
    raise exception using errcode = '23514', message = 'portfolio_row_delete_forbidden';
  end if;
  if new.data is null or jsonb_typeof(new.data) <> 'object'
     or new.data->>'v' is distinct from '2'
     or jsonb_typeof(new.data->'positions') is distinct from 'array'
     or jsonb_typeof(new.data->'sells') is distinct from 'array'
     or jsonb_typeof(new.data->'ideas') is distinct from 'array'
     or jsonb_typeof(new.data->'history') is distinct from 'array'
     or jsonb_typeof(new.data->'startBalance') is distinct from 'number'
     or jsonb_typeof(new.data->'cash') is distinct from 'number'
     or (new.data->>'startBalance')::numeric <= 0
     or octet_length(new.data::text) > 262144 then
    raise exception using errcode = '23514', message = 'portfolio_invalid_document';
  end if;
  if exists (
    select 1 from jsonb_array_elements(new.data->'positions') p
    where jsonb_typeof(p) <> 'object' or coalesce(length(p->>'id'), 0) not between 1 and 120
       or coalesce(length(p->>'symbol'), 0) not between 1 and 40
       or jsonb_typeof(p->'qty') is distinct from 'number'
       or jsonb_typeof(p->'cost') is distinct from 'number'
       or case when jsonb_typeof(p->'qty') = 'number' then (p->>'qty')::numeric <= 0 else true end
       or case when jsonb_typeof(p->'cost') = 'number' then (p->>'cost')::numeric <= 0 else true end
  ) or (select count(*) <> count(distinct p->>'id') from jsonb_array_elements(new.data->'positions') p) then
    raise exception using errcode = '23514', message = 'portfolio_invalid_positions';
  end if;
  if tg_op = 'UPDATE' then
    if action_name not in ('reset', 'restore') then
      if not ((new.data->'sells') @> (old.data->'sells')) then
        raise exception using errcode = '23514', message = 'portfolio_sales_removal_blocked';
      end if;
      if jsonb_array_length(old.data->'history') > 0 and jsonb_array_length(new.data->'history') = 0 then
        raise exception using errcode = '23514', message = 'portfolio_history_removal_blocked';
      end if;
      select count(*) into missing_positions
      from jsonb_array_elements(old.data->'positions') p
      where not exists (select 1 from jsonb_array_elements(new.data->'positions') n where n->>'id' = p->>'id')
        and not exists (
          select 1 from jsonb_array_elements(new.data->'sells') s
          where s->>'posId' = p->>'id'
            and not ((old.data->'sells') @> jsonb_build_array(s))
        );
      if missing_positions > 0 and not (action_name = 'delete_position' and missing_positions = 1) then
        raise exception using errcode = '23514', message = 'portfolio_position_removal_blocked';
      end if;
    end if;
    -- Unchanged reads/quotes cannot create unbounded versions.
    if new.data = old.data then new.updated_at := old.updated_at; return new; end if;
    insert into public.portfolio_versions(revision, data, action, position_count, sale_count)
    values(old.updated_at, old.data, 'before_change', jsonb_array_length(old.data->'positions'), jsonb_array_length(old.data->'sells'))
    on conflict (revision) do nothing;
    new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  else
    new.updated_at := clock_timestamp();
  end if;
  insert into public.portfolio_versions(revision, data, actor_id, action, position_count, sale_count)
  values(new.updated_at, new.data, actor, action_name, jsonb_array_length(new.data->'positions'), jsonb_array_length(new.data->'sells'));
  -- Five bounded safety copies; no background egress polling.
  delete from public.portfolio_versions where id in
    (select id from public.portfolio_versions order by id desc offset 5);
  return new;
end;
$$;
revoke all on function public.portfolio_guard_version() from public, anon, authenticated, service_role;
drop trigger if exists portfolio_guard_version on public.edu_shared;
create trigger portfolio_guard_version before insert or update or delete on public.edu_shared
for each row execute function public.portfolio_guard_version();

create or replace function public.portfolio_commit(
  p_revision timestamptz, p_data jsonb, p_action text, p_actor uuid, p_restore_id bigint default null,
  p_confirmation text default null
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare current_row public.edu_shared%rowtype; next_data jsonb; next_revision timestamptz; version_id bigint;
begin
  if p_action not in ('save', 'delete_position', 'reset', 'restore') or p_action is null then
    raise exception using errcode = '23514', message = 'portfolio_invalid_action';
  end if;
  select * into current_row from public.edu_shared where id='alfa_portfoy_public' for update;
  if not found then raise exception using errcode = 'P0002', message = 'portfolio_missing'; end if;
  if p_revision is null or current_row.updated_at <> p_revision then
    raise exception using errcode = 'P0001', message = 'portfolio_conflict';
  end if;
  if p_action = 'restore' then
    if p_confirmation is distinct from 'RESTORE' then
      raise exception using errcode = '23514', message = 'portfolio_confirmation_required';
    end if;
    select data into next_data from public.portfolio_versions where id=p_restore_id;
    if not found then raise exception using errcode = 'P0002', message = 'portfolio_version_missing'; end if;
  elsif p_action = 'reset' then
    if p_confirmation is distinct from 'PORTFOYU SIFIRLA' then
      raise exception using errcode = '23514', message = 'portfolio_confirmation_required';
    end if;
    next_data := jsonb_build_object('v',2,'positions','[]'::jsonb,'sells','[]'::jsonb,
      'ideas','[]'::jsonb,'history','[]'::jsonb,'cash',1000,'startBalance',1000,
      'lastUpdate',clock_timestamp());
  else next_data := p_data;
  end if;
  perform set_config('alfa.portfolio_action', p_action, true);
  perform set_config('alfa.portfolio_actor', coalesce(p_actor::text,''), true);
  update public.edu_shared set data=next_data where id='alfa_portfoy_public' returning updated_at into next_revision;
  select id into version_id from public.portfolio_versions where revision=next_revision;
  return jsonb_build_object('revision',next_revision,'versionId',version_id,'backedUp',true,
    'cash',(next_data->>'cash')::numeric);
end;
$$;
revoke all on function public.portfolio_commit(timestamptz,jsonb,text,uuid,bigint,text) from public, anon, authenticated;
grant execute on function public.portfolio_commit(timestamptz,jsonb,text,uuid,bigint,text) to service_role;

-- Capture the current, recovered portfolio immediately, without editing its data.
insert into public.portfolio_versions(revision,data,action,position_count,sale_count)
select updated_at,data,'baseline',jsonb_array_length(data->'positions'),jsonb_array_length(data->'sells')
from public.edu_shared where id='alfa_portfoy_public'
on conflict (revision) do nothing;
notify pgrst, 'reload schema';
commit;
