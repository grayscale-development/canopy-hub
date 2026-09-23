do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'wiki_nodes' and column_name = 'role_tags'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'wiki_nodes' and column_name = 'tags'
  ) then
    alter table public.wiki_nodes rename column role_tags to tags;
  end if;
end;
$$;

alter table public.wiki_nodes
  drop constraint if exists wiki_nodes_role_tags_limit;

alter table public.wiki_nodes
  drop constraint if exists wiki_nodes_tags_limit;

alter table public.wiki_nodes
  add constraint wiki_nodes_tags_limit check (cardinality(tags) <= 12);

drop index if exists public.idx_wiki_nodes_role_tags;
create index if not exists idx_wiki_nodes_tags on public.wiki_nodes using gin (tags);
