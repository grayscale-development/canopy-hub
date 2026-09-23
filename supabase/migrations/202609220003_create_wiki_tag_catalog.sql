create table if not exists public.wiki_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (btrim(name) <> ''),
  created_at timestamptz not null default now()
);

create table if not exists public.wiki_page_tags (
  node_id uuid not null references public.wiki_nodes(id) on delete cascade,
  tag_id uuid not null references public.wiki_tags(id) on delete cascade,
  primary key (node_id, tag_id)
);

create index if not exists idx_wiki_page_tags_tag_id
  on public.wiki_page_tags(tag_id);

insert into public.wiki_tags (name)
select distinct btrim(tag)
from public.wiki_nodes
cross join lateral unnest(tags) as tag
where btrim(tag) <> ''
on conflict (name) do nothing;

insert into public.wiki_page_tags (node_id, tag_id)
select node.id, tag.id
from public.wiki_nodes node
cross join lateral unnest(node.tags) as page_tag
join public.wiki_tags tag on tag.name = btrim(page_tag)
where node.type = 'page'
on conflict do nothing;
