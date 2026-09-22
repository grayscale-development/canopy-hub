alter table public.wiki_nodes
  add column if not exists role_tags text[] not null default '{}'::text[];

alter table public.wiki_nodes
  drop constraint if exists wiki_nodes_role_tags_limit;

alter table public.wiki_nodes
  add constraint wiki_nodes_role_tags_limit
  check (cardinality(role_tags) <= 12);

create index if not exists idx_wiki_nodes_role_tags
  on public.wiki_nodes using gin (role_tags);
