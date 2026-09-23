alter table public.wiki_nodes
  add column if not exists tags text[] not null default '{}'::text[];

alter table public.wiki_nodes
  drop constraint if exists wiki_nodes_tags_limit;

alter table public.wiki_nodes
  add constraint wiki_nodes_tags_limit
  check (cardinality(tags) <= 12);

create index if not exists idx_wiki_nodes_tags
  on public.wiki_nodes using gin (tags);
