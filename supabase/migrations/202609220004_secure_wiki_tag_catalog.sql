alter table public.wiki_tags enable row level security;
alter table public.wiki_page_tags enable row level security;

drop policy if exists wiki_tags_select_authenticated on public.wiki_tags;
create policy wiki_tags_select_authenticated
  on public.wiki_tags
  for select
  to authenticated
  using (true);

drop policy if exists wiki_tags_mutate_wiki_managers on public.wiki_tags;
create policy wiki_tags_mutate_wiki_managers
  on public.wiki_tags
  for all
  to authenticated
  using (public.user_has_permission_code(auth.uid(), 'wiki.manage'))
  with check (public.user_has_permission_code(auth.uid(), 'wiki.manage'));

drop policy if exists wiki_page_tags_select_authenticated on public.wiki_page_tags;
create policy wiki_page_tags_select_authenticated
  on public.wiki_page_tags
  for select
  to authenticated
  using (true);

drop policy if exists wiki_page_tags_mutate_wiki_managers on public.wiki_page_tags;
create policy wiki_page_tags_mutate_wiki_managers
  on public.wiki_page_tags
  for all
  to authenticated
  using (public.user_has_permission_code(auth.uid(), 'wiki.manage'))
  with check (public.user_has_permission_code(auth.uid(), 'wiki.manage'));

grant select, insert, update, delete on table public.wiki_tags to authenticated;
grant select, insert, update, delete on table public.wiki_page_tags to authenticated;
