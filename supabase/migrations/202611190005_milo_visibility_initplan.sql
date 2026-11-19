-- Compute only visibility that does not depend on Storage object RLS. The
-- caller's identity and the existing route rules remain authoritative.
create or replace function app_private.milo_visible_non_storage_source_ids()
returns uuid[]
language sql stable security definer
set search_path = ''
as $$
  with recursive
  permissions as materialized (
    select auth.uid() as uid,
      app_private.user_has_permission_code(auth.uid(), 'beta.1') as beta,
      app_private.user_has_permission_code(auth.uid(), 'wiki.manage') as wiki_manage,
      app_private.user_has_permission_code(auth.uid(), 'settings.access') as settings_access,
      app_private.user_has_permission_code(auth.uid(), 'permissions.access') as permissions_access,
      app_private.user_has_permission_code(auth.uid(), 'ai.settings.access') as ai_access,
      app_private.user_has_permission_code(auth.uid(), 'advanced-settings.access') as advanced_access
  ),
  rooted as (
    select id from public.wiki_nodes where parent_id is null and status <> 'archived'
    union
    select child.id from public.wiki_nodes child join rooted parent on child.parent_id = parent.id
    where child.status <> 'archived'
  ),
  published_ancestors as (
    select id, parent_id from public.wiki_nodes
    where type = 'page' and status = 'published'
    union
    select parent.id, parent.parent_id from public.wiki_nodes parent
    join published_ancestors child on child.parent_id = parent.id
    where parent.status <> 'archived'
  ),
  visible_nodes as materialized (
    select n.id from public.wiki_nodes n
    join rooted r on r.id = n.id
    cross join permissions p
    where p.uid is not null and p.beta
      and (p.wiki_manage or exists (select 1 from published_ancestors a where a.id = n.id))
  )
  select coalesce(array_agg(s.id), '{}'::uuid[])
  from public.knowledge_sources s
  cross join permissions p
  where p.uid is not null and s.status = 'active'
    and case
      when s.url = '/settings' or s.url like '/settings/%' then
        p.settings_access and case
          when s.url like '/settings/permissions%' then p.permissions_access
          when s.url like '/settings/ai%' then p.ai_access and p.beta
          when s.url like '/settings/advanced%' then p.advanced_access
          else true
        end
      when s.url = '/wiki' or s.url like '/wiki/%' then p.beta
      else true
    end
    and case s.source_type
      when 'wiki_page' then exists (select 1 from visible_nodes n where n.id::text = s.source_id)
      when 'wiki_asset' then exists (
        select 1 from public.wiki_assets a join visible_nodes n on n.id = a.node_id
        where a.id::text = s.source_id and a.status = 'active'
      )
      when 'support' then exists (select 1 from public.support_directory_sections d where d.id::text = s.source_id)
      when 'site' then s.url in (
        '/home', '/reports', '/pipeline', '/department-directory', '/people',
        '/branches', '/wiki', '/newsletters', '/bridge', '/file-viewer',
        '/reports/file-quality', '/reports/specialists-points', '/settings',
        '/settings/permissions', '/settings/ai', '/settings/advanced'
      )
      when 'report' then true
      when 'employee' then true
      when 'branch' then true
      else false
    end;
$$;

revoke all on function app_private.milo_visible_non_storage_source_ids() from public, anon;
grant execute on function app_private.milo_visible_non_storage_source_ids() to authenticated, service_role;
grant select, insert, update, delete on public.knowledge_sources, public.knowledge_chunks to service_role;

drop policy if exists knowledge_sources_select_authenticated on public.knowledge_sources;
create policy knowledge_sources_select_authenticated on public.knowledge_sources for select to authenticated
using (
  status = 'active' and (
    id = any ((select app_private.milo_visible_non_storage_source_ids())::uuid[])
    or (source_type in ('newsletter', 'document')
      and public.milo_can_access_knowledge_source(source_type, source_id, url, metadata))
  )
);

drop policy if exists knowledge_chunks_select_authenticated on public.knowledge_chunks;
create policy knowledge_chunks_select_authenticated on public.knowledge_chunks for select to authenticated
using (
  source_id = any ((select app_private.milo_visible_non_storage_source_ids())::uuid[])
  or exists (
    select 1 from public.knowledge_sources s
    where s.id = knowledge_chunks.source_id and s.source_type in ('newsletter', 'document')
  )
);
