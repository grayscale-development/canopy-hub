-- Drop section pinning. Any values stored in wiki_nodes.is_pinned are discarded.
-- milo_wiki_nodes was created with select *, which PostgreSQL stores as an
-- explicit column list that includes is_pinned, so the view has to be replaced
-- before the column can be dropped.

drop view if exists public.milo_wiki_nodes;

drop index if exists public.idx_wiki_nodes_one_pinned_folder_per_parent;

alter table public.wiki_nodes
  drop constraint if exists wiki_nodes_pinned_folders_only;

alter table public.wiki_nodes
  drop column if exists is_pinned;

create view public.milo_wiki_nodes with (security_invoker = true) as
select * from public.wiki_nodes n where public.milo_can_access_wiki_node(n.id::text);

grant select on public.milo_wiki_nodes to authenticated;
