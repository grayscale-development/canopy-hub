update public.wiki_nodes
set
  type = 'folder',
  title = 'Canopy Mortgage',
  status = 'published',
  sort_order = 0,
  updated_at = now()
where parent_id is null
  and lower(slug) = 'canopy-mortgage';

update public.wiki_nodes
set
  type = 'folder',
  title = 'Nano LOS',
  status = 'published',
  sort_order = 1,
  updated_at = now()
where parent_id is null
  and lower(slug) = 'nano-los';

insert into public.wiki_nodes (parent_id, type, slug, title, status, sort_order)
select null, 'folder', 'canopy-mortgage', 'Canopy Mortgage', 'published', 0
where not exists (
  select 1
  from public.wiki_nodes
  where parent_id is null
    and lower(slug) = 'canopy-mortgage'
);

insert into public.wiki_nodes (parent_id, type, slug, title, status, sort_order)
select null, 'folder', 'nano-los', 'Nano LOS', 'published', 1
where not exists (
  select 1
  from public.wiki_nodes
  where parent_id is null
    and lower(slug) = 'nano-los'
);
