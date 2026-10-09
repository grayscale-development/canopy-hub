-- Evaluate live Wiki ancestry, never stale index metadata. This helper needs
-- definer rights only to see hidden parents; it always checks the caller's uid.
create or replace function public.milo_can_access_wiki_node(target_id text)
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
      or not exists (select 1 from ancestors where status <> 'published')
    );
$$;
revoke all on function public.milo_can_access_wiki_node(text) from public;
grant execute on function public.milo_can_access_wiki_node(text) to authenticated;

-- Direct select/search/aggregate tools use the same branch visibility as Wiki.
create view public.milo_wiki_nodes with (security_invoker = true) as
select * from public.wiki_nodes n where public.milo_can_access_wiki_node(n.id::text);
create view public.milo_wiki_assets with (security_invoker = true) as
select * from public.wiki_assets a
where a.status = 'active' and public.milo_can_access_wiki_node(a.node_id::text);
grant select on public.milo_wiki_nodes, public.milo_wiki_assets to authenticated;

create or replace function public.milo_can_access_knowledge_source(
  source_type text, source_id text, source_url text, source_metadata jsonb
)
returns boolean
language sql stable security invoker
set search_path = ''
as $$
  select auth.uid() is not null
    -- Settings page access is separate from edit/upload permissions.
    and case
      when source_url = '/settings' or source_url like '/settings/%' then
        public.user_has_permission_code(auth.uid(), 'settings.access')
        and case
          when source_url like '/settings/permissions%' then public.user_has_permission_code(auth.uid(), 'permissions.access')
          when source_url like '/settings/ai%' then public.user_has_permission_code(auth.uid(), 'ai.settings.access') and public.user_has_permission_code(auth.uid(), 'beta.1')
          when source_url like '/settings/advanced%' then public.user_has_permission_code(auth.uid(), 'advanced-settings.access')
          else true
        end
      when source_url = '/wiki' or source_url like '/wiki/%' then public.user_has_permission_code(auth.uid(), 'beta.1')
      else true
    end
    and case source_type
      when 'wiki_page' then public.milo_can_access_wiki_node(source_id)
      when 'wiki_asset' then exists (
        select 1 from public.wiki_assets a
        where a.id::text = source_id and a.status = 'active'
          and public.milo_can_access_wiki_node(a.node_id::text)
      )
      -- Invoker rights reuse the app's actual Storage object RLS checks.
      when 'newsletter' then exists (
        select 1 from storage.objects o where o.bucket_id = 'Newsletters' and o.name = source_id
      )
      when 'document' then exists (
        select 1 from storage.objects o
        where o.bucket_id = source_metadata->>'storageBucket'
          and o.name = source_metadata->>'storagePath'
      )
      when 'support' then exists (select 1 from public.support_directory_sections s where s.id::text = source_id)
      when 'site' then true
      when 'report' then true
      when 'employee' then true
      when 'branch' then true
      else false
    end;
$$;
revoke all on function public.milo_can_access_knowledge_source(text,text,text,jsonb) from public;
grant execute on function public.milo_can_access_knowledge_source(text,text,text,jsonb) to authenticated;

-- FOR ALL grants are permissive SELECT grants too. Split writes so wiki.manage
-- cannot override another source's read permissions or expose archived chunks.
drop policy if exists knowledge_sources_mutate_wiki_managers on public.knowledge_sources;
drop policy if exists knowledge_chunks_mutate_wiki_managers on public.knowledge_chunks;
create policy knowledge_sources_insert_wiki_managers on public.knowledge_sources for insert to authenticated with check (public.user_has_permission_code(auth.uid(), 'wiki.manage'));
create policy knowledge_sources_update_wiki_managers on public.knowledge_sources for update to authenticated using (public.user_has_permission_code(auth.uid(), 'wiki.manage')) with check (public.user_has_permission_code(auth.uid(), 'wiki.manage'));
create policy knowledge_sources_delete_wiki_managers on public.knowledge_sources for delete to authenticated using (public.user_has_permission_code(auth.uid(), 'wiki.manage'));
create policy knowledge_chunks_insert_wiki_managers on public.knowledge_chunks for insert to authenticated with check (public.user_has_permission_code(auth.uid(), 'wiki.manage'));
create policy knowledge_chunks_update_wiki_managers on public.knowledge_chunks for update to authenticated using (public.user_has_permission_code(auth.uid(), 'wiki.manage')) with check (public.user_has_permission_code(auth.uid(), 'wiki.manage'));
create policy knowledge_chunks_delete_wiki_managers on public.knowledge_chunks for delete to authenticated using (public.user_has_permission_code(auth.uid(), 'wiki.manage'));

drop policy if exists knowledge_sources_select_authenticated on public.knowledge_sources;
create policy knowledge_sources_select_authenticated on public.knowledge_sources for select to authenticated
using (status = 'active' and public.milo_can_access_knowledge_source(source_type, source_id, url, metadata));
drop policy if exists knowledge_chunks_select_authenticated on public.knowledge_chunks;
create policy knowledge_chunks_select_authenticated on public.knowledge_chunks for select to authenticated
using (exists (select 1 from public.knowledge_sources s where s.id = knowledge_chunks.source_id));

-- Both match RPCs already execute as invoker, so filtering happens before ranking
-- and LIMIT for keyword and embedding retrieval, including the fallback path.

-- Signed URLs, listings and inline reads must not expose assets under a hidden
-- or archived ancestor, even when the asset's immediate page is published.
create policy milo_wiki_storage_branch_access on storage.objects
as restrictive for select to authenticated
using (bucket_id <> 'Wiki' or exists (
  select 1 from public.wiki_assets a
  where a.storage_bucket = storage.objects.bucket_id and a.storage_path = storage.objects.name
    and a.status = 'active' and public.milo_can_access_wiki_node(a.node_id::text)
));
