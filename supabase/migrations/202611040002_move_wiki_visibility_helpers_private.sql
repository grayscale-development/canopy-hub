-- Keep SECURITY DEFINER helpers out of the exposed public schema, matching the
-- app_private pattern from the security hardening migration. RLS policies keep
-- calling the moved helper because they reference it by object id.
alter function public.wiki_node_is_visible_to_viewer(uuid) set schema app_private;
revoke all on function app_private.wiki_node_is_visible_to_viewer(uuid) from public, anon;
grant execute on function app_private.wiki_node_is_visible_to_viewer(uuid) to authenticated, service_role;

-- The definer implementation lives in app_private; public keeps a thin invoker wrapper.
create or replace function app_private.milo_can_access_wiki_node(target_id text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  with recursive ancestors as (
    select id, parent_id, status, array[id] as visited
    from public.wiki_nodes where id::text = target_id
    union all
    select n.id, n.parent_id, n.status, a.visited || n.id
    from public.wiki_nodes n join ancestors a on n.id = a.parent_id
    where not n.id = any(a.visited)
  )
  select auth.uid() is not null
    and public.user_has_permission_code(auth.uid(), 'beta.1')
    and exists (select 1 from ancestors where parent_id is null)
    and not exists (select 1 from ancestors where status = 'archived')
    and (
      public.user_has_permission_code(auth.uid(), 'wiki.manage')
      or app_private.wiki_node_is_visible_to_viewer(target_id::uuid)
    );
$$;

create or replace function public.milo_can_access_wiki_node(target_id text)
returns boolean
language sql stable security invoker
set search_path = ''
as $$
  select app_private.milo_can_access_wiki_node(target_id);
$$;
