-- Salt-okunur katalog kontrolu; migration degildir.
-- Production projesini SQL Editor'de kendiniz dogrulayin.
-- Tamamini birlikte calistirin; preflight_json hucresini JSON olarak gonderin.
-- Kullanici kayitlari ve oturum token'lari okunmaz.
-- Tek bir katalog sorgusudur; kalici nesne veya veri degistirmez.
with recursive
target_relation as (
  select c.*, n.nspname
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'chart_workspaces'
),
target_table as (
  select * from target_relation where relkind = 'r'
),
required_roles(role_name) as (
  values ('anon'), ('authenticated'), ('service_role')
),
selected_roles as (
  select r.*
  from pg_catalog.pg_roles r
  where r.rolname in (select role_name from required_roles)
     or r.rolname = current_user
     or r.oid in (select relowner from target_relation)
),
memberships as (
  select r.oid as member_oid, r.oid as inherited_oid, array[r.oid] as role_path
  from selected_roles r
  union all
  select m.member_oid, a.roleid, m.role_path || a.roleid
  from memberships m
  join pg_catalog.pg_auth_members a on a.member = m.inherited_oid
  where not a.roleid = any(m.role_path)
),
workspace_relations as (
  select c.oid, n.nspname as schema_name, c.relname, c.relkind,
         c.relowner, c.relrowsecurity, c.relforcerowsecurity
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname not in ('pg_catalog', 'information_schema')
    and n.nspname not like 'pg_toast%'
    and (lower(c.relname) like '%workspace%'
      or (n.nspname = 'public' and c.relname in ('chart_settings', 'chart_drawings')))
    and c.relkind in ('r', 'p', 'v', 'm', 'f')
),
expected_columns(column_name, data_type, required_default) as (
  values
    ('user_id', 'uuid', null::text),
    ('name', 'text', '''default''::text'),
    ('workspace', 'jsonb', null::text),
    ('revision', 'bigint', '1'),
    ('updated_at', 'timestamp with time zone', 'now()')
),
target_columns as (
  select a.attname::text as column_name,
         pg_catalog.format_type(a.atttypid, a.atttypmod) as data_type,
         a.attnotnull as not_null,
         pg_catalog.pg_get_expr(d.adbin, d.adrelid) as column_default,
         a.attnum
  from target_table c
  join pg_catalog.pg_attribute a on a.attrelid = c.oid
  left join pg_catalog.pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum
  where a.attnum > 0 and not a.attisdropped
),
column_comparison as (
  select coalesce(e.column_name, a.column_name) as column_name,
         e.data_type as expected_type, a.data_type as actual_type,
         e.required_default, a.column_default as actual_default,
         a.not_null,
         case
           when not exists (select 1 from target_table) then 'NOT_APPLICABLE'
           when e.column_name is null then 'EXTRA_COLUMN'
           when a.column_name is null then 'MISSING_COLUMN'
           when e.data_type <> a.data_type or not a.not_null then 'MISMATCH'
           when e.required_default is not null
             and not (
               a.column_default is not distinct from e.required_default
               or (e.column_name = 'revision' and a.column_default is not distinct from '''1''::bigint')
             ) then 'DEFAULT_MISMATCH'
           else 'MATCH'
         end as comparison
  from expected_columns e
  full join target_columns a on a.column_name = e.column_name
),
expected_policies(policy_name) as (
  values ('chart_workspaces_select'),
         ('chart_workspaces_insert'),
         ('chart_workspaces_update')
),
table_acl as (
  select pg_catalog.pg_get_userbyid(x.grantor) as grantor,
         case when x.grantee = 0 then 'PUBLIC'
              else pg_catalog.pg_get_userbyid(x.grantee) end as grantee,
         x.privilege_type, x.is_grantable
  from target_table c
  cross join lateral pg_catalog.aclexplode(
    coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))
  ) x
),
column_acl as (
  select a.attname as column_name,
         pg_catalog.pg_get_userbyid(x.grantor) as grantor,
         case when x.grantee = 0 then 'PUBLIC'
              else pg_catalog.pg_get_userbyid(x.grantee) end as grantee,
         x.privilege_type, x.is_grantable
  from target_table c
  join pg_catalog.pg_attribute a on a.attrelid = c.oid
  cross join lateral pg_catalog.aclexplode(a.attacl) x
  where a.attnum > 0 and not a.attisdropped
),
effective_table_privileges as (
  select r.rolname as role_name, p.privilege_type,
         pg_catalog.has_table_privilege(r.oid, c.oid, p.privilege_type) as allowed,
         pg_catalog.has_table_privilege(
           r.oid, c.oid, p.privilege_type || ' WITH GRANT OPTION'
         ) as with_grant_option
  from selected_roles r
  cross join target_table c
  cross join lateral (
    select distinct x.privilege_type
    from pg_catalog.aclexplode(pg_catalog.acldefault('r', c.relowner)) x
  ) p
),
column_privilege_names as (
  select privilege_type from column_acl
  union select 'SELECT'
  union select 'REFERENCES'
),
effective_column_privileges as (
  select r.rolname as role_name, a.attname as column_name, p.privilege_type,
         pg_catalog.has_column_privilege(
           r.oid, c.oid, a.attnum, p.privilege_type
         ) as allowed
  from selected_roles r
  cross join target_table c
  join pg_catalog.pg_attribute a on a.attrelid = c.oid
  cross join column_privilege_names p
  where a.attnum > 0 and not a.attisdropped
),
truncate_checks as (
  select required.role_name,
         case
           when r.oid is null then 'ROLE_MISSING'
           when not exists (select 1 from target_relation) then 'TABLE_NOT_PRESENT'
           when not exists (select 1 from target_table) then 'RELATION_KIND_MISMATCH'
           when pg_catalog.has_table_privilege(r.oid, c.oid, 'TRUNCATE')
             then 'ALLOWED_REVIEW_REQUIRED'
           else 'DENIED'
         end as status,
         case when r.oid is not null and c.oid is not null
           then pg_catalog.has_table_privilege(r.oid, c.oid, 'TRUNCATE')
           else null end as allowed
  from required_roles required
  left join pg_catalog.pg_roles r on r.rolname = required.role_name
  left join target_table c on true
  where required.role_name in ('anon', 'authenticated')
),
default_acl as (
  select pg_catalog.pg_get_userbyid(d.defaclrole) as creator_role,
         case when d.defaclnamespace = 0 then '<GLOBAL>'
              else n.nspname end as schema_scope,
         d.defaclobjtype as object_type,
         coalesce((
           select jsonb_agg(jsonb_build_object(
             'grantor', pg_catalog.pg_get_userbyid(x.grantor),
             'grantee', case when x.grantee = 0 then 'PUBLIC'
                            else pg_catalog.pg_get_userbyid(x.grantee) end,
             'privilege', x.privilege_type,
             'is_grantable', x.is_grantable
           ) order by x.grantee, x.privilege_type)
           from pg_catalog.aclexplode(d.defaclacl) x
         ), '[]'::jsonb) as grants
  from pg_catalog.pg_default_acl d
  left join pg_catalog.pg_namespace n on n.oid = d.defaclnamespace
  where d.defaclnamespace = 0 or n.nspname = 'public'
)
select jsonb_pretty(jsonb_build_object(
  'format_version', 1,
  'checked_at_utc', to_char(current_timestamp at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'context', jsonb_build_object(
    'database', current_database(),
    'reader_role', current_user,
    'session_role', session_user,
    'postgres_version', version(),
    'migration_reference', 'supabase/site/040_chart_workspaces.sql',
    'notice', 'Catalog only. Confirm the Production project in the dashboard. Empty sections are not proof of safety.',
    'default_acl_notice', 'Global and schema defaults are combined. No explicit default entry does not mean no privileges.'
  ),
  'prerequisites', jsonb_build_object(
    'public_schema_exists', exists (select 1 from pg_catalog.pg_namespace where nspname = 'public'),
    'auth_schema_exists', exists (select 1 from pg_catalog.pg_namespace where nspname = 'auth'),
    'auth_users', pg_catalog.to_regclass('auth.users')::text,
    'auth_uid', pg_catalog.to_regprocedure('auth.uid()')::text,
    'auth_id_definition', coalesce((
      select jsonb_agg(jsonb_build_object(
        'type', pg_catalog.format_type(a.atttypid, a.atttypmod),
        'not_null', a.attnotnull,
        'primary_key', exists (
          select 1 from pg_catalog.pg_constraint k
          where k.conrelid = a.attrelid and k.contype = 'p'
            and k.conkey = array[a.attnum]
        )
      ))
      from pg_catalog.pg_attribute a
      where a.attrelid = pg_catalog.to_regclass('auth.users')
        and a.attname = 'id' and a.attnum > 0 and not a.attisdropped
    ), '[]'::jsonb),
    'required_roles', (
      select jsonb_agg(jsonb_build_object(
        'role', required.role_name,
        'exists', r.oid is not null,
        'superuser', r.rolsuper,
        'bypass_rls', r.rolbypassrls,
        'inherits', r.rolinherit
      ) order by required.role_name)
      from required_roles required
      left join pg_catalog.pg_roles r on r.rolname = required.role_name
    )
  ),
  'target_status', case
    when not exists (select 1 from target_relation) then 'NOT_PRESENT'
    when not exists (select 1 from target_table) then 'RELATION_KIND_MISMATCH'
    else 'EXISTING_TABLE_REQUIRES_REVIEW' end,
  'workspace_relations', coalesce((
    select jsonb_agg(jsonb_build_object(
      'schema', c.schema_name, 'name', c.relname, 'kind', c.relkind,
      'owner', pg_catalog.pg_get_userbyid(c.relowner),
      'rls_enabled', c.relrowsecurity, 'force_rls', c.relforcerowsecurity
    ) order by c.schema_name, c.relname)
    from workspace_relations c
  ), '[]'::jsonb),
  'column_comparison', (
    select jsonb_agg(to_jsonb(c) order by c.column_name) from column_comparison c
  ),
  'constraints', coalesce((
    select jsonb_agg(jsonb_build_object(
      'name', k.conname, 'kind', k.contype,
      'validated', k.convalidated,
      'definition', pg_catalog.pg_get_constraintdef(k.oid)
    ) order by k.conname)
    from pg_catalog.pg_constraint k
    where k.conrelid in (select oid from target_relation)
  ), '[]'::jsonb),
  'rls_policies', coalesce((
    select jsonb_agg(jsonb_build_object(
      'schema', p.schemaname, 'table', p.tablename, 'name', p.policyname,
      'permissive', p.permissive, 'roles', p.roles, 'command', p.cmd,
      'using', p.qual, 'with_check', p.with_check,
      'unexpected_on_target', p.schemaname = 'public'
        and p.tablename = 'chart_workspaces'
        and p.policyname not in (select policy_name from expected_policies)
    ) order by p.schemaname, p.tablename, p.policyname)
    from pg_catalog.pg_policies p
    where (p.schemaname, p.tablename) in (
      select schema_name, relname from workspace_relations
    )
  ), '[]'::jsonb),
  'expected_policy_presence', (
    select jsonb_agg(jsonb_build_object(
      'name', e.policy_name,
      'exists_on_target', exists (
        select 1 from pg_catalog.pg_policy p
        where p.polrelid in (select oid from target_table)
          and p.polname = e.policy_name
      )
    ) order by e.policy_name)
    from expected_policies e
  ),
  'direct_table_grants', coalesce((
    select jsonb_agg(to_jsonb(a) order by a.grantee, a.privilege_type) from table_acl a
  ), '[]'::jsonb),
  'direct_column_grants', coalesce((
    select jsonb_agg(to_jsonb(a) order by a.column_name, a.grantee, a.privilege_type)
    from column_acl a
  ), '[]'::jsonb),
  'effective_table_privileges', coalesce((
    select jsonb_agg(to_jsonb(p) order by p.role_name, p.privilege_type)
    from effective_table_privileges p
  ), '[]'::jsonb),
  'effective_column_privileges', coalesce((
    select jsonb_agg(to_jsonb(p) order by p.role_name, p.column_name, p.privilege_type)
    from effective_column_privileges p
  ), '[]'::jsonb),
  'truncate_check', (
    select jsonb_agg(to_jsonb(c) order by c.role_name) from truncate_checks c
  ),
  'default_privileges', coalesce((
    select jsonb_agg(to_jsonb(d) order by d.creator_role, d.schema_scope, d.object_type)
    from default_acl d
  ), '[]'::jsonb),
  'role_memberships', coalesce((
    select jsonb_agg(jsonb_build_object(
      'member', pg_catalog.pg_get_userbyid(m.member_oid),
      'inherited_role', pg_catalog.pg_get_userbyid(m.inherited_oid),
      'superuser', r.rolsuper, 'bypass_rls', r.rolbypassrls
    ) order by m.member_oid, m.inherited_oid)
    from memberships m join pg_catalog.pg_roles r on r.oid = m.inherited_oid
    where m.member_oid <> m.inherited_oid
  ), '[]'::jsonb),
  'name_collisions', jsonb_build_object(
    'relations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'schema', n.nspname, 'name', c.relname, 'kind', c.relkind,
        'owner', pg_catalog.pg_get_userbyid(c.relowner),
        'index_on', i.indrelid::regclass::text,
        'exact_public_table_name', n.nspname = 'public' and c.relname = 'chart_workspaces'
      ) order by n.nspname, c.relname)
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      left join pg_catalog.pg_index i on i.indexrelid = c.oid
      where lower(c.relname) in ('chart_workspaces', 'chart_workspaces_pkey')
    ), '[]'::jsonb),
    'types', coalesce((
      select jsonb_agg(jsonb_build_object(
        'schema', n.nspname, 'name', t.typname, 'kind', t.typtype,
        'related_relation', nullif(t.typrelid, 0)::regclass::text
      ) order by n.nspname, t.typname)
      from pg_catalog.pg_type t
      join pg_catalog.pg_namespace n on n.oid = t.typnamespace
      where lower(t.typname) = 'chart_workspaces'
    ), '[]'::jsonb)
  ),
  'user_triggers', coalesce((
    select jsonb_agg(jsonb_build_object(
      'name', t.tgname, 'enabled', t.tgenabled,
      'definition', pg_catalog.pg_get_triggerdef(t.oid)
    ) order by t.tgname)
    from pg_catalog.pg_trigger t
    where t.tgrelid in (select oid from target_relation) and not t.tgisinternal
  ), '[]'::jsonb)
)) as preflight_json;
