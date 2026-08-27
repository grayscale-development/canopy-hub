alter table public.wiki_nodes
  add column if not exists is_pinned boolean not null default false;

update public.wiki_nodes
set is_pinned = false
where is_pinned is null;

alter table public.wiki_nodes
  drop constraint if exists wiki_nodes_pinned_folders_only;

alter table public.wiki_nodes
  add constraint wiki_nodes_pinned_folders_only
  check (is_pinned = false or type = 'folder');

create unique index if not exists idx_wiki_nodes_one_pinned_folder_per_parent
  on public.wiki_nodes(parent_id)
  where is_pinned = true
    and type = 'folder'
    and status <> 'archived'
    and parent_id is not null;
