-- Read-only restore compatibility metadata; no user rows or password hashes.
SELECT jsonb_build_object(
  'extensions', (SELECT jsonb_agg(jsonb_build_object(
    'name', extname, 'version', extversion,
    'owner', pg_get_userbyid(extowner))) FROM pg_extension),
  'vault_relations', (SELECT jsonb_agg(jsonb_build_object(
    'name', c.relname, 'owner', pg_get_userbyid(c.relowner),
    'acl', c.relacl::text, 'init_acl', i.initprivs::text))
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    LEFT JOIN pg_init_privs i ON i.objoid=c.oid AND i.classoid='pg_class'::regclass AND i.objsubid=0
    WHERE n.nspname='vault' AND c.relkind IN ('r','v')),
  'vault_functions', (SELECT jsonb_agg(jsonb_build_object(
    'name', p.proname, 'args', pg_get_function_identity_arguments(p.oid),
    'owner', pg_get_userbyid(p.proowner), 'acl', p.proacl::text,
    'init_acl', i.initprivs::text))
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    LEFT JOIN pg_init_privs i ON i.objoid=p.oid AND i.classoid='pg_proc'::regclass
    WHERE n.nspname='vault'),
  'roles', (SELECT jsonb_agg(jsonb_build_object(
    'name', rolname, 'superuser', rolsuper, 'bypassrls', rolbypassrls,
    'inherit', rolinherit, 'createrole', rolcreaterole, 'createdb', rolcreatedb))
    FROM pg_roles WHERE rolname NOT LIKE 'pg_%'),
  'database', (SELECT jsonb_build_object('collate',datcollate,'ctype',datctype)
    FROM pg_database WHERE datname=current_database())
) AS restore_metadata;
