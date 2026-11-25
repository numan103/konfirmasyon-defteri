-- Salt-okunur migration sonrasi kontrol; migration degildir.
-- Tek JSON sonuc dondurur, sadece kataloglari okur; kullanici satiri okumaz.
-- Tablo yokken genel sonuc BLOCKED olur. PASS, staging'deki iki hesapli
-- gercek API/RLS testinin veya backup/restore kanitinin yerine gecmez.
with
relation as (
  select c.* from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'chart_workspaces'
),
target as (
  select * from relation where relkind = 'r'
),
required_roles(role_name) as (
  values ('anon'), ('authenticated'), ('service_role')
),
roles as (
  select r.* from pg_catalog.pg_roles r
  where r.rolname in (select role_name from required_roles)
),
expected_policies(policy_name, command_code) as (
  values ('chart_workspaces_select','r'),
         ('chart_workspaces_insert','a'),
         ('chart_workspaces_update','w')
),
policy_checks as (
  select e.policy_name, coalesce(
    p.polcmd::text = e.command_code
    and p.polpermissive
    and p.polroles = array[(select oid from roles where rolname = 'authenticated')]
    and case when e.command_code = 'a' then
      p.polqual is null and p.polwithcheck is not null
      and regexp_replace(pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid), '[[:space:]()]', '', 'g') = 'auth.uid=user_id'
    else
      p.polqual is not null
      and regexp_replace(pg_catalog.pg_get_expr(p.polqual,p.polrelid), '[[:space:]()]', '', 'g') = 'auth.uid=user_id'
      and (p.polwithcheck is null or (
        e.command_code = 'w'
        and regexp_replace(pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid), '[[:space:]()]', '', 'g') = 'auth.uid=user_id'
      ))
    end, false) as matches
  from expected_policies e
  left join pg_catalog.pg_policy p
    on p.polname = e.policy_name and p.polrelid in (select oid from target)
),
effective_table as (
  select r.rolname as role_name, p.privilege_type,
         pg_catalog.has_table_privilege(r.oid,t.oid,p.privilege_type) as allowed,
         pg_catalog.has_table_privilege(r.oid,t.oid,p.privilege_type || ' WITH GRANT OPTION') as grantable
  from roles r cross join target t
  cross join lateral (
    select distinct privilege_type
    from pg_catalog.aclexplode(pg_catalog.acldefault('r',t.relowner))
  ) p
),
effective_columns as (
  select r.rolname as role_name,a.attname as column_name,p.privilege_type,
         pg_catalog.has_column_privilege(r.oid,t.oid,a.attnum,p.privilege_type) as allowed,
         pg_catalog.has_column_privilege(r.oid,t.oid,a.attnum,p.privilege_type || ' WITH GRANT OPTION') as grantable
  from roles r cross join target t
  join pg_catalog.pg_attribute a on a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped
  cross join (values ('SELECT'),('INSERT'),('UPDATE'),('REFERENCES')) p(privilege_type)
),
checks as (
  select 'relation' as check_name, case
    when not exists(select 1 from relation) then 'BLOCKED'
    when not exists(select 1 from target) then 'FAIL' else 'PASS' end as status
  union all select 'required_roles', case when (select count(*) from roles) = 3 then 'PASS' else 'FAIL' end
  union all select 'rls_enabled', case
    when not exists(select 1 from target) then 'BLOCKED'
    when (select relrowsecurity from target) then 'PASS' else 'FAIL' end
  union all select 'exact_owner_only_policies', case
    when not exists(select 1 from target) then 'BLOCKED'
    when (select bool_and(matches) from policy_checks)
      and (select count(*) from pg_catalog.pg_policy where polrelid in (select oid from target)) = 3
      then 'PASS' else 'FAIL' end
  union all select 'client_role_boundary', case
    when not exists(select 1 from target) then 'BLOCKED'
    when (select count(*) from roles where rolname in ('anon','authenticated')) = 2
      and not exists (
        select 1 from roles r cross join target t
        where r.rolname in ('anon','authenticated')
          and (r.rolsuper or r.rolbypassrls or pg_catalog.pg_has_role(r.oid,t.relowner,'MEMBER'))
      ) then 'PASS' else 'FAIL' end
  union all select 'effective_table_allowlist', case
    when not exists(select 1 from target) then 'BLOCKED'
    when (select count(*) from roles) = 3 and coalesce((
      select bool_and(case role_name
        when 'anon' then not allowed
        when 'authenticated' then allowed = (privilege_type in ('SELECT','INSERT','UPDATE')) and not grantable
        when 'service_role' then allowed
        else false end)
      from effective_table
    ),false) then 'PASS' else 'FAIL' end
  union all select 'effective_column_allowlist', case
    when not exists(select 1 from target) then 'BLOCKED'
    when (select count(*) from roles) = 3 and coalesce((
      select bool_and(case role_name
        when 'anon' then not allowed
        when 'authenticated' then allowed = (privilege_type in ('SELECT','INSERT','UPDATE')) and not grantable
        when 'service_role' then allowed
        else false end)
      from effective_columns
    ),false) then 'PASS' else 'FAIL' end
  union all select 'service_role_boundary', case
    when exists(select 1 from roles where rolname = 'service_role' and (rolbypassrls or rolsuper)) then 'PASS' else 'FAIL' end
  union all select 'authenticated_api_prerequisites', case
    when not exists(select 1 from target) then 'BLOCKED'
    when coalesce((
      select pg_catalog.has_schema_privilege(r.oid,n.oid,'USAGE')
        and pg_catalog.has_function_privilege(r.oid,pg_catalog.to_regprocedure('auth.uid()'),'EXECUTE')
      from roles r left join pg_catalog.pg_namespace n on n.nspname = 'public'
      where r.rolname = 'authenticated'
    ),false) then 'PASS' else 'FAIL' end
)
select jsonb_pretty(jsonb_build_object(
  'format_version', 1,
  'checked_at_utc', to_char(current_timestamp at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'database', current_database(),
  'reader_role', current_user,
  'overall', case
    when exists(select 1 from checks where status = 'FAIL') then 'FAIL'
    when exists(select 1 from checks where status = 'BLOCKED') then 'BLOCKED'
    else 'PASS' end,
  'checks', (select jsonb_agg(to_jsonb(c) order by check_name) from checks c),
  'table', coalesce((
    select jsonb_agg(jsonb_build_object(
      'owner',pg_catalog.pg_get_userbyid(relowner),
      'kind',relkind,'rls_enabled',relrowsecurity,'force_rls',relforcerowsecurity
    )) from relation
  ),'[]'::jsonb),
  'policies', (select jsonb_agg(to_jsonb(p) order by policy_name) from policy_checks p),
  'effective_table_privileges', coalesce((
    select jsonb_agg(to_jsonb(p) order by role_name,privilege_type) from effective_table p
  ),'[]'::jsonb),
  'effective_column_privileges', coalesce((
    select jsonb_agg(to_jsonb(p) order by role_name,column_name,privilege_type) from effective_columns p
  ),'[]'::jsonb),
  'notice','Catalog check only. Missing table is not PASS. Real API/RLS, backup and isolated restore evidence are separate release gates.'
)) as postflight_json;
