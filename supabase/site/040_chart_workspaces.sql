-- Additive only: no existing settings/drawings/watchlists are changed.
-- Apply as the migration owner, outside an existing transaction.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
select pg_advisory_xact_lock(hashtext('alfa:chart_workspaces:v1'));

create table if not exists public.chart_workspaces (
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'default' check (name = 'default'),
  workspace jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, name),
  check (jsonb_typeof(workspace) = 'object' and octet_length(workspace::text) <= 65536)
);

-- IF NOT EXISTS must not silently accept a different table under this name.
do $workspace_shape$
declare
  target oid := 'public.chart_workspaces'::regclass;
  user_column smallint;
  name_column smallint;
begin
  if (select relkind <> 'r' from pg_class where oid = target)
    or (select count(*) from pg_attribute where attrelid = target and attnum > 0 and not attisdropped) <> 5
    or (select count(*) from pg_attribute
        where attrelid = target and attnum > 0 and not attisdropped and attnotnull
          and (attname, atttypid) in (
            ('user_id', 'uuid'::regtype), ('name', 'text'::regtype),
            ('workspace', 'jsonb'::regtype), ('revision', 'bigint'::regtype),
            ('updated_at', 'timestamptz'::regtype))) <> 5 then
    raise exception 'chart_workspaces schema mismatch: review existing table before migration';
  end if;
  select attnum into user_column from pg_attribute where attrelid = target and attname = 'user_id';
  select attnum into name_column from pg_attribute where attrelid = target and attname = 'name';
  if not exists (select 1 from pg_constraint where conrelid = target and contype = 'p'
                   and conkey = array[user_column, name_column])
    or not exists (select 1 from pg_constraint where conrelid = target and contype = 'f'
                    and conkey = array[user_column] and confrelid = 'auth.users'::regclass
                    and confkey = array[(select attnum from pg_attribute where attrelid = 'auth.users'::regclass and attname = 'id')]
                    and confdeltype = 'c' and convalidated)
    or not exists (select 1 from pg_constraint where conrelid = target and contype = 'c' and convalidated
                    and regexp_replace(pg_get_expr(conbin, conrelid), '[[:space:]()]', '', 'g') = 'name=''default''::text')
    or not exists (select 1 from pg_constraint where conrelid = target and contype = 'c' and convalidated
                    and regexp_replace(pg_get_expr(conbin, conrelid), '[[:space:]()]', '', 'g') = 'revision>0')
    or not exists (select 1 from pg_constraint where conrelid = target and contype = 'c' and convalidated
                    and regexp_replace(pg_get_expr(conbin, conrelid), '[[:space:]()]', '', 'g')
                      = 'jsonb_typeofworkspace=''object''::textANDoctet_lengthworkspace::text<=65536') then
    raise exception 'chart_workspaces constraint mismatch: existing data/table left unchanged';
  end if;
  if (select count(*) from pg_attrdef d join pg_attribute a
        on a.attrelid = d.adrelid and a.attnum = d.adnum
        where d.adrelid = target and (
          (a.attname = 'name' and pg_get_expr(d.adbin, d.adrelid) = '''default''::text')
          or (a.attname = 'revision' and pg_get_expr(d.adbin, d.adrelid) in ('1', '''1''::bigint'))
          or (a.attname = 'updated_at' and pg_get_expr(d.adbin, d.adrelid) = 'now()'))) <> 3 then
    raise exception 'chart_workspaces default mismatch: review existing table before migration';
  end if;
end
$workspace_shape$;

-- Preserve compatible policy objects (and their OIDs) on a rerun. Never swallow
-- duplicate_object: a policy with a different definition must fail closed.
do $workspace_policies$
declare
  expected record;
  existing record;
  owner_role oid := 'authenticated'::regrole;
  predicate text := 'auth.uid=user_id';
begin
  if exists (select 1 from pg_policy where polrelid = 'public.chart_workspaces'::regclass
             and polname not in ('chart_workspaces_select', 'chart_workspaces_insert', 'chart_workspaces_update')) then
    raise exception 'chart_workspaces unexpected RLS policy: manual review required; policies preserved';
  end if;
  for expected in select * from (values
    ('chart_workspaces_select', 'r', 'select'),
    ('chart_workspaces_insert', 'a', 'insert'),
    ('chart_workspaces_update', 'w', 'update')
  ) as definitions(policy_name, command_code, command_name) loop
    select * into existing from pg_policy
      where polrelid = 'public.chart_workspaces'::regclass and polname = expected.policy_name;
    if found then
      if existing.polcmd::text <> expected.command_code
        or not existing.polpermissive or existing.polroles <> array[owner_role]
        or (expected.command_code = 'a' and (
          existing.polqual is not null or existing.polwithcheck is null
          or regexp_replace(pg_get_expr(existing.polwithcheck, existing.polrelid), '[[:space:]()]', '', 'g') <> predicate))
        or (expected.command_code <> 'a' and (
          existing.polqual is null
          or regexp_replace(pg_get_expr(existing.polqual, existing.polrelid), '[[:space:]()]', '', 'g') <> predicate
          or (existing.polwithcheck is not null and (
            expected.command_code = 'r'
            or regexp_replace(pg_get_expr(existing.polwithcheck, existing.polrelid), '[[:space:]()]', '', 'g') <> predicate)))) then
        raise exception 'chart_workspaces policy mismatch: %; existing policies preserved', expected.policy_name;
      end if;
    elsif expected.command_code = 'a' then
      execute format('create policy %I on public.chart_workspaces for insert to authenticated with check (auth.uid() = user_id)', expected.policy_name);
    else
      execute format('create policy %I on public.chart_workspaces for %s to authenticated using (auth.uid() = user_id)', expected.policy_name, expected.command_name);
    end if;
  end loop;
end
$workspace_policies$;

alter table public.chart_workspaces enable row level security;
revoke all on public.chart_workspaces from anon;
grant select, insert, update on public.chart_workspaces to authenticated;
notify pgrst, 'reload schema';
commit;
