-- Folder status is intentionally not a visibility gate. A folder is visible to
-- viewers exactly when it contains a published page at any descendant depth.
create or replace function public.wiki_node_is_visible_to_viewer(target_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  with recursive ancestors as (
    select id, parent_id, status, array[id] as visited
    from public.wiki_nodes
    where id = target_id

    union all

    select parent.id, parent.parent_id, parent.status, ancestors.visited || parent.id
    from public.wiki_nodes parent
    join ancestors on parent.id = ancestors.parent_id
    where not parent.id = any(ancestors.visited)
  ),
  descendants as (
    select id, parent_id, type, status, array[id] as visited
    from public.wiki_nodes
    where id = target_id and status <> 'archived'

    union all

    select child.id, child.parent_id, child.type, child.status, descendants.visited || child.id
    from public.wiki_nodes child
    join descendants on child.parent_id = descendants.id
    where child.status <> 'archived'
      and not child.id = any(descendants.visited)
  )
  select not exists (select 1 from ancestors where status = 'archived')
    and exists (
      select 1
      from descendants
      where type = 'page' and status = 'published'
    );
$$;

revoke all on function public.wiki_node_is_visible_to_viewer(uuid) from public;
grant execute on function public.wiki_node_is_visible_to_viewer(uuid) to authenticated;

-- Folder publication is derived, so clients cannot create or manually toggle a
-- folder's published/draft state. Archiving remains available for empty folders.
create or replace function public.enforce_wiki_folder_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.type <> 'folder' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.status := 'published';
  elsif new.status in ('draft', 'published') then
    new.status := old.status;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_wiki_nodes_enforce_folder_status on public.wiki_nodes;
create trigger trg_wiki_nodes_enforce_folder_status
before insert or update of type, status on public.wiki_nodes
for each row execute function public.enforce_wiki_folder_status();

drop policy if exists wiki_nodes_select_authenticated on public.wiki_nodes;
create policy wiki_nodes_select_authenticated
  on public.wiki_nodes
  for select
  to authenticated
  using (
    public.user_has_permission_code(auth.uid(), 'wiki.manage')
    or public.wiki_node_is_visible_to_viewer(id)
  );

drop policy if exists wiki_page_revisions_select_authenticated on public.wiki_page_revisions;
create policy wiki_page_revisions_select_authenticated
  on public.wiki_page_revisions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.wiki_nodes n
      where n.id = wiki_page_revisions.node_id
        and (
          public.user_has_permission_code(auth.uid(), 'wiki.manage')
          or public.wiki_node_is_visible_to_viewer(n.id)
        )
    )
  );

drop policy if exists wiki_assets_select_authenticated on public.wiki_assets;
create policy wiki_assets_select_authenticated
  on public.wiki_assets
  for select
  to authenticated
  using (
    status = 'active'
    and exists (
      select 1
      from public.wiki_nodes n
      where n.id = wiki_assets.node_id
        and (
          public.user_has_permission_code(auth.uid(), 'wiki.manage')
          or public.wiki_node_is_visible_to_viewer(n.id)
        )
    )
  );

-- Milo uses the same rule for indexed pages and assets. Preserve the root
-- membership check, but do not make a folder's stored status authoritative.
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
      or public.wiki_node_is_visible_to_viewer(target_id::uuid)
    );
$$;
