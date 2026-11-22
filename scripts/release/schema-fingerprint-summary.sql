-- Summary of schema-fingerprint.sql: one row per object kind (count + md5 of all
-- identities and definitions). Read-only. Compare prod with CI's main replay.
with s(n) as (values ('public'), ('data'), ('raw'), ('app_private')),
objs as (
  select 'column' as kind,
         c.table_schema || '.' || c.table_name || '.' || c.column_name as ident,
         md5(concat_ws('|', c.data_type, c.udt_name, c.is_nullable, c.column_default)) as def
  from information_schema.columns c join s on s.n = c.table_schema
  union all
  select 'function',
         n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         md5(concat_ws('|', pg_get_function_result(p.oid), p.prosrc, p.prosecdef::text, p.provolatile::text, coalesce(array_to_string(p.proconfig, ','), '')))
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace join s on s.n = n.nspname
  where p.prokind in ('f', 'p')
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  union all
  select 'policy', schemaname || '.' || tablename || '.' || policyname,
         md5(concat_ws('|', permissive, array_to_string(roles, ','), cmd, qual, with_check))
  from pg_policies join s on s.n = schemaname
  union all
  select 'index', schemaname || '.' || indexname, md5(indexdef)
  from pg_indexes join s on s.n = schemaname
  union all
  select 'trigger', n.nspname || '.' || c.relname || '.' || t.tgname, md5(pg_get_triggerdef(t.oid))
  from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
  join s on s.n = n.nspname where not t.tgisinternal
  union all
  select 'rls', n.nspname || '.' || c.relname, md5(c.relrowsecurity::text || c.relforcerowsecurity::text)
  from pg_class c join pg_namespace n on n.oid = c.relnamespace join s on s.n = n.nspname
  where c.relkind in ('r', 'p')
  union all
  select 'table_grant', g.table_schema || '.' || g.table_name || '.' || g.grantee,
         md5(string_agg(g.privilege_type, ',' order by g.privilege_type))
  from information_schema.role_table_grants g join s on s.n = g.table_schema
  where g.grantee in ('anon', 'authenticated', 'service_role')
  group by g.table_schema, g.table_name, g.grantee
  union all
  select 'routine_grant', r.routine_schema || '.' || r.routine_name || '.' || r.grantee,
         md5(string_agg(distinct r.privilege_type, ','))
  from information_schema.role_routine_grants r join s on s.n = r.routine_schema
  where r.grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')
  group by r.routine_schema, r.routine_name, r.grantee
)
select kind, count(*) as n, md5(string_agg(ident || ':' || def, ',' order by ident)) as digest
from objs group by kind order by kind;
