-- Operator-run catalog audit ONLY. Not a migration; no user rows are read.
-- Run against the verified production project as an authorized catalog reader.
-- Return every result set, including empty sets/errors; never infer PASS from
-- missing output. Redact connection credentials, not schema/ACL findings.
begin transaction read only;
set local statement_timeout = '30s';

-- 1. Connection identity and existence (project ref must also be checked in the
-- connection/dashboard; current_database alone does not identify Supabase).
select current_database() as database_name, current_user as reader_role,
       session_user as session_role, version() as postgres_version,
       current_setting('transaction_read_only') as read_only;
select to_regclass('auth.users') as auth_users,
       to_regprocedure('auth.uid()') as auth_uid,
       to_regclass('public.chart_workspaces') as chart_workspaces,
       to_regclass('public.chart_settings') as chart_settings,
       to_regclass('public.chart_drawings') as chart_drawings;

-- 2. Existing workspace-related relations, owner and RLS flags.
select n.nspname as schema_name, c.relname, c.relkind,
       pg_get_userbyid(c.relowner) as owner,
       c.relrowsecurity, c.relforcerowsecurity
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and (c.relname like '%workspace%' or c.relname in ('chart_settings','chart_drawings'))
  and c.relkind in ('r','p','v','m','f')
order by c.relname;

-- 3. Columns/defaults and FK target shape; definitions only, no row data.
select n.nspname as schema_name, c.relname, a.attname,
       format_type(a.atttypid, a.atttypmod) as data_type,
       a.attnotnull, pg_get_expr(d.adbin,d.adrelid) as column_default
from pg_class c join pg_namespace n on n.oid = c.relnamespace
join pg_attribute a on a.attrelid = c.oid
left join pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum
where a.attnum > 0 and not a.attisdropped
  and ((n.nspname = 'auth' and c.relname = 'users' and a.attname = 'id')
    or (n.nspname = 'public' and (c.relname like '%workspace%'
      or c.relname in ('chart_settings','chart_drawings'))))
order by n.nspname,c.relname,a.attnum;
select conname, contype, convalidated, pg_get_constraintdef(oid) as definition
from pg_constraint where conrelid = to_regclass('public.chart_workspaces')
order by conname;

-- 4. Exact policy definitions, including PUBLIC roles and unexpected policies.
select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
from pg_policies where schemaname = 'public'
  and (tablename like '%workspace%' or tablename in ('chart_settings','chart_drawings'))
order by tablename,policyname;

-- 5. Direct table and column ACLs (PUBLIC is ACL grantee 0).
select c.relname, pg_get_userbyid(x.grantor) as grantor,
       case when x.grantee = 0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end as grantee,
       x.privilege_type,x.is_grantable
from pg_class c join pg_namespace n on n.oid = c.relnamespace
cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) x
where n.nspname = 'public' and c.relname = 'chart_workspaces'
order by grantee,x.privilege_type;
select c.relname,a.attname,pg_get_userbyid(x.grantor) as grantor,
       case when x.grantee = 0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end as grantee,
       x.privilege_type,x.is_grantable
from pg_class c join pg_namespace n on n.oid = c.relnamespace
join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
cross join lateral aclexplode(a.attacl) x
where n.nspname = 'public' and c.relname = 'chart_workspaces'
order by a.attnum,grantee,x.privilege_type;

-- 6. Global and public-schema defaults for every creator role. Global grants
-- apply even if a schema-specific default entry appears restrictive.
select pg_get_userbyid(d.defaclrole) as creator,
       case when d.defaclnamespace = 0 then '<GLOBAL>' else n.nspname end as schema_scope,
       d.defaclobjtype,pg_get_userbyid(x.grantor) as grantor,
       case when x.grantee = 0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end as grantee,
       x.privilege_type,x.is_grantable
from pg_default_acl d left join pg_namespace n on n.oid = d.defaclnamespace
cross join lateral aclexplode(d.defaclacl) x
where d.defaclnamespace = 0 or n.nspname = 'public'
order by creator,schema_scope,d.defaclobjtype,grantee,x.privilege_type;

-- 7. Role attributes and transitive membership (no password/auth payloads).
select rolname,rolsuper,rolbypassrls,rolinherit,rolcanlogin
from pg_roles where rolname in ('anon','authenticated','service_role') or rolname = current_user
  or oid in (select relowner from pg_class where oid = to_regclass('public.chart_workspaces'))
order by rolname;
with recursive membership as (
  select oid as member,oid as inherited_role,array[oid] as path
  from pg_roles where rolname in ('anon','authenticated','service_role') or rolname = current_user
    or oid in (select relowner from pg_class where oid = to_regclass('public.chart_workspaces'))
  union all
  select m.member,a.roleid,m.path || a.roleid
  from membership m join pg_auth_members a on a.member = m.inherited_role
  where not a.roleid = any(m.path)
)
select member::regrole as member,inherited_role::regrole as inherited_role,
       path, r.rolsuper, r.rolbypassrls
from membership m join pg_roles r on r.oid = m.inherited_role
where m.member <> m.inherited_role order by member::text,inherited_role::text;

-- 8. Effective rights, not only direct ACL. MAINTAIN is PostgreSQL 17+.
select r.rolname,p.privilege,
       case when p.privilege <> 'MAINTAIN'
              or current_setting('server_version_num')::integer >= 170000
            then has_table_privilege(r.oid,c.oid,p.privilege)
            else null end as allowed
from pg_roles r cross join pg_class c cross join (
  values ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),
         ('REFERENCES'),('TRIGGER'),('MAINTAIN'),
         ('SELECT WITH GRANT OPTION'),('INSERT WITH GRANT OPTION'),('UPDATE WITH GRANT OPTION')
) p(privilege)
where (r.rolname in ('anon','authenticated','service_role') or r.rolname = current_user
       or r.oid in (select relowner from pg_class where oid = to_regclass('public.chart_workspaces')))
  and c.oid = to_regclass('public.chart_workspaces')
order by r.rolname,p.privilege;
select r.rolname,a.attname,p.privilege,
       has_column_privilege(r.oid,c.oid,a.attnum,p.privilege) as allowed
from pg_roles r cross join pg_class c
join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
cross join (values ('SELECT'),('INSERT'),('UPDATE'),('REFERENCES')) p(privilege)
where (r.rolname in ('anon','authenticated','service_role') or r.rolname = current_user
       or r.oid in (select relowner from pg_class where oid = to_regclass('public.chart_workspaces')))
  and c.oid = to_regclass('public.chart_workspaces')
order by r.rolname,a.attnum,p.privilege;
select r.rolname,
       has_schema_privilege(r.oid,'public','USAGE') as public_schema_usage,
       has_function_privilege(r.oid,to_regprocedure('auth.uid()'),'EXECUTE') as auth_uid_execute
from pg_roles r
where r.rolname in ('anon','authenticated','service_role') or r.rolname = current_user
  or r.oid in (select relowner from pg_class where oid = to_regclass('public.chart_workspaces'))
order by r.rolname;

-- 9. Unexpected user triggers (internal FK triggers intentionally excluded).
select tgname,tgenabled,pg_get_triggerdef(oid) as definition
from pg_trigger
where tgrelid = to_regclass('public.chart_workspaces') and not tgisinternal
order by tgname;
rollback;
