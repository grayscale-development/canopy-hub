-- Harden the API boundary without changing users' assigned permissions.
begin;

-- Internal definer helpers are not REST RPCs. Public wrappers below use invoker
-- rights and preserve the existing application API and policy dependencies.
create schema if not exists app_private;
revoke all on schema app_private from public, anon;
grant usage on schema app_private to authenticated, service_role;
revoke create on schema public from public, anon, authenticated;
revoke create on schema data, raw, extensions from public, anon, authenticated;

-- Legacy tables were provisioned outside the checked-in baseline on hosted
-- projects. Harden them when present; do not invent new tables on fresh installs.
do $$
declare table_name text;
begin
  foreach table_name in array array['allowed_domains', 'roles', 'user_roles', 'source_configs']
  loop
    if to_regclass(format('public.%I', table_name)) is null then
      continue;
    end if;
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from public, anon, authenticated', table_name);
    execute format('grant all on public.%I to service_role', table_name);
    if table_name = 'roles' then
      execute 'grant select on public.roles to authenticated';
      execute 'create policy roles_read on public.roles for select to authenticated using (auth.uid() is not null)';
    elsif table_name = 'user_roles' then
      execute 'grant select on public.user_roles to authenticated';
      execute 'create policy user_roles_read_own on public.user_roles for select to authenticated using (user_id = auth.uid())';
    end if;
  end loop;
end $$;
-- allowed_domains and source_configs are backend-only, with no client policy.

-- Reports already permit signed-in users. Invoker views now enforce that rule
-- on their underlying relations too. Only report inputs are client-readable;
-- sync payloads, job metadata, logs and retention controls stay backend-only.
do $$
declare relation record;
begin
  for relation in select c.oid::regclass as name
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'raw' and c.relkind in ('r', 'p')
  loop
    execute format('alter table %s enable row level security', relation.name);
    execute format('revoke all on %s from public, anon, authenticated', relation.name);
    execute format('grant all on %s to service_role', relation.name);
  end loop;
end $$;

grant usage on schema raw to authenticated;
do $$
declare table_name text;
begin
  foreach table_name in array array['divisions', 'branches', 'employees',
    'corporate_turn_times', 'file_quality_data', 'specialist_points_old',
    'specialist_points_new', 'processing_assistant_orgs', 'underwriting_orgs', 'production_data']
  loop
    execute format('grant select on raw.%I to authenticated', table_name);
    execute format('create policy report_read_authenticated on raw.%I for select to authenticated using (auth.uid() is not null)', table_name);
  end loop;
end $$;

do $$
declare view_name record;
begin
  for view_name in select c.oid::regclass as name
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'data' and c.relkind = 'v'
  loop
    execute format('alter view %s set (security_invoker = true)', view_name.name);
    execute format('revoke all on %s from public, anon', view_name.name);
    execute format('grant select on %s to authenticated, service_role', view_name.name);
  end loop;
end $$;

alter function data.get_division_production_last_12_months(text, date) security invoker;
alter function data.get_branch_production_last_12_months(text, date) security invoker;
alter function data.get_employee_production_last_12_months(text, date) security invoker;
alter function data.get_file_quality_rollups(date) security invoker;
alter function data.get_points_specialists_summary(date, text) security invoker;
do $$ begin
  if to_regprocedure('public.get_current_user_role_code()') is not null then
    alter function public.get_current_user_role_code() security invoker;
  end if;
end $$;

alter function public.user_has_permission_code(uuid, text) set schema app_private;
alter function public.milo_can_access_wiki_node(text) set schema app_private;
alter function public.list_permission_users() set schema app_private;
alter function public.list_permission_directory_users() set schema app_private;
do $$ begin
  if to_regprocedure('public.list_canopy_users_simple()') is not null then
    alter function public.list_canopy_users_simple() set schema app_private;
  end if;
end $$;

create function public.user_has_permission_code(p_user_id uuid, p_code text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select app_private.user_has_permission_code(p_user_id, p_code);
$$;

-- Prevent callers from probing another user's assignments through the helper.
create or replace function app_private.user_has_permission_code(p_user_id uuid, p_code text)
returns boolean language sql stable security definer set search_path = '' as $$
  select (p_user_id = auth.uid() or auth.role() = 'service_role') and exists (
    select 1 from public.user_permissions up
    join public.permissions p on p.id = up.permission_id
    where up.user_id = p_user_id and p.code = p_code
  );
$$;

create function public.milo_can_access_wiki_node(target_id text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select app_private.milo_can_access_wiki_node(target_id);
$$;
create function public.list_permission_users()
returns table(permission_id uuid, user_id uuid, email text, full_name text)
language sql security invoker set search_path = '' as $$
  select * from app_private.list_permission_users();
$$;
-- Put the permission check inside the definer helper, not just its wrapper.
create or replace function app_private.list_permission_users()
returns table(permission_id uuid, user_id uuid, email text, full_name text)
language sql security definer set search_path = '' as $$
  select up.permission_id, up.user_id, u.email::text,
    coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name',
      split_part(coalesce(u.email, ''), '@', 1))
  from public.user_permissions up join auth.users u on u.id = up.user_id
  where public.user_has_permission_code(auth.uid(), 'permissions.access')
    or auth.role() = 'service_role';
$$;
create function public.list_permission_directory_users()
returns table(user_id uuid, email text, full_name text)
language sql security invoker set search_path = '' as $$
  select * from app_private.list_permission_directory_users()
  where auth.uid() is not null or auth.role() = 'service_role';
$$;
do $migration$ begin
  if to_regprocedure('app_private.list_canopy_users_simple()') is not null then
    execute $wrapper$
      create function public.list_canopy_users_simple()
      returns table(full_name text, email text, role text)
      language sql security invoker set search_path = '' as $body$
        select * from app_private.list_canopy_users_simple()
        where auth.uid() is not null or auth.role() = 'service_role';
      $body$;
    $wrapper$;
  end if;
end $migration$;

-- RLS must enforce the same editor gate as the server actions. Restrictive
-- policies remain effective even if an older permissive policy is retained.
create policy permissions_editor_insert on public.permissions as restrictive
for insert to authenticated with check (public.user_has_permission_code(auth.uid(), 'permissions.access'));
create policy permissions_editor_update on public.permissions as restrictive
for update to authenticated using (public.user_has_permission_code(auth.uid(), 'permissions.access'))
with check (public.user_has_permission_code(auth.uid(), 'permissions.access'));
create policy permissions_editor_delete on public.permissions as restrictive
for delete to authenticated using (public.user_has_permission_code(auth.uid(), 'permissions.access'));
create policy user_permissions_read_scope on public.user_permissions as restrictive
for select to authenticated using (user_id = auth.uid() or public.user_has_permission_code(auth.uid(), 'permissions.access'));
create policy user_permissions_editor_insert on public.user_permissions as restrictive
for insert to authenticated with check (public.user_has_permission_code(auth.uid(), 'permissions.access'));
create policy user_permissions_editor_update on public.user_permissions as restrictive
for update to authenticated using (public.user_has_permission_code(auth.uid(), 'permissions.access'))
with check (public.user_has_permission_code(auth.uid(), 'permissions.access'));
create policy user_permissions_editor_delete on public.user_permissions as restrictive
for delete to authenticated using (public.user_has_permission_code(auth.uid(), 'permissions.access'));

do $$
declare table_name text;
begin
  foreach table_name in array array['support_directory_sections', 'support_directory_entries', 'support_directory_entry_contacts']
  loop
    execute format('create policy support_editor_insert on public.%I as restrictive for insert to authenticated with check (public.user_has_permission_code(auth.uid(), ''support.edit''))', table_name);
    execute format('create policy support_editor_update on public.%I as restrictive for update to authenticated using (public.user_has_permission_code(auth.uid(), ''support.edit'')) with check (public.user_has_permission_code(auth.uid(), ''support.edit''))', table_name);
    execute format('create policy support_editor_delete on public.%I as restrictive for delete to authenticated using (public.user_has_permission_code(auth.uid(), ''support.edit''))', table_name);
  end loop;
end $$;

-- A relocatable extension can move without rebuilding embeddings or indexes.
alter extension vector set schema extensions;
create or replace function public.match_knowledge_chunks(
  query_embedding extensions.vector, match_count integer default 8,
  source_types text[] default null
)
returns table(chunk_id uuid, source_id uuid, source_type text, source_title text,
  source_url text, content text, metadata jsonb, similarity double precision)
language sql stable security invoker set search_path = '' as $$
  select kc.id, ks.id, ks.source_type, ks.title, ks.url, kc.content, kc.metadata,
    1 - (kc.embedding operator(extensions.<=>) query_embedding) as similarity
  from public.knowledge_chunks kc join public.knowledge_sources ks on ks.id = kc.source_id
  where kc.embedding is not null and ks.status = 'active'
    and (source_types is null or ks.source_type = any(source_types))
  order by kc.embedding operator(extensions.<=>) query_embedding
  limit greatest(match_count, 1);
$$;

-- Pin all application functions, excluding objects owned by extensions.
-- Revoke explicit role grants AND PUBLIC's inherited default EXECUTE grants.
do $$
declare routine record;
begin
  for routine in select p.oid::regprocedure as signature, n.nspname, p.proname,
      p.prorettype = 'trigger'::regtype as is_trigger
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'data', 'raw', 'app_private') and p.prokind = 'f'
      and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass
        and d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('alter function %s set search_path = ''''', routine.signature);
    execute format('revoke all on function %s from public, anon, authenticated', routine.signature);
    execute format('grant execute on function %s to service_role', routine.signature);
    if not routine.is_trigger and routine.nspname <> 'raw'
      and routine.proname not in ('invoke_data_sync_dispatch_now', 'invoke_single_data_sync_source', 'get_data_sync_scheduler_health') then
      execute format('grant execute on function %s to authenticated', routine.signature);
    end if;
  end loop;
end $$;
-- PUBLIC's global EXECUTE default cannot be removed with a schema-only revoke.
alter default privileges revoke execute on functions from public, anon, authenticated;
alter default privileges in schema public, data, raw, app_private revoke execute on functions from public, anon, authenticated;
alter default privileges in schema public, data, raw, app_private revoke all on tables from anon, authenticated;

notify pgrst, 'reload schema';
commit;
