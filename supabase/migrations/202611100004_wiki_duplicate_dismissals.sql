create table if not exists public.wiki_duplicate_dismissals (
  node_id uuid not null references public.wiki_nodes(id) on delete cascade,
  other_node_id uuid not null references public.wiki_nodes(id) on delete cascade,
  passage_hash text not null check (passage_hash ~ '^[0-9a-f]{64}$'),
  dismissed_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (node_id, other_node_id, passage_hash),
  check (node_id <> other_node_id)
);

alter table public.wiki_duplicate_dismissals enable row level security;

drop policy if exists wiki_duplicate_dismissals_read on public.wiki_duplicate_dismissals;
create policy wiki_duplicate_dismissals_read on public.wiki_duplicate_dismissals
  for select to authenticated
  using (
    public.milo_can_access_wiki_node(node_id::text)
    and public.milo_can_access_wiki_node(other_node_id::text)
  );

drop policy if exists wiki_duplicate_dismissals_insert on public.wiki_duplicate_dismissals;
create policy wiki_duplicate_dismissals_insert on public.wiki_duplicate_dismissals
  for insert to authenticated
  with check (
    public.user_has_permission_code(auth.uid(), 'wiki.manage')
    and dismissed_by = auth.uid()
    and public.milo_can_access_wiki_node(node_id::text)
    and public.milo_can_access_wiki_node(other_node_id::text)
  );

drop policy if exists wiki_duplicate_dismissals_delete on public.wiki_duplicate_dismissals;
create policy wiki_duplicate_dismissals_delete on public.wiki_duplicate_dismissals
  for delete to authenticated
  using (
    public.user_has_permission_code(auth.uid(), 'wiki.manage')
    and public.milo_can_access_wiki_node(node_id::text)
    and public.milo_can_access_wiki_node(other_node_id::text)
  );

grant select, insert, delete on public.wiki_duplicate_dismissals to authenticated;
