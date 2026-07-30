create extension if not exists vector;

insert into storage.buckets (id, name, public)
values ('Wiki', 'Wiki', false)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public;

insert into public.permissions (name, page, code)
values ('Manage Wiki', 'Wiki', 'wiki.manage')
on conflict (code) do update
set
  name = excluded.name,
  page = excluded.page;

create or replace function public.user_has_permission_code(p_user_id uuid, p_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_permissions up
    join public.permissions p on p.id = up.permission_id
    where up.user_id = p_user_id
      and p.code = p_code
  );
$$;

create table if not exists public.wiki_nodes (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.wiki_nodes(id) on delete set null,
  type text not null check (type in ('folder', 'page')),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null check (btrim(title) <> ''),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  sort_order integer not null default 0,
  current_revision_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_wiki_nodes_sibling_slug_unique
  on public.wiki_nodes (coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(slug));

create index if not exists idx_wiki_nodes_parent_sort
  on public.wiki_nodes(parent_id, sort_order, title);

create index if not exists idx_wiki_nodes_status_type
  on public.wiki_nodes(status, type);

drop trigger if exists trg_wiki_nodes_updated_at on public.wiki_nodes;
create trigger trg_wiki_nodes_updated_at
before update on public.wiki_nodes
for each row
execute function public.set_updated_at();

create or replace function public.prevent_wiki_node_cycle()
returns trigger
language plpgsql
as $$
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'A wiki node cannot be its own parent.';
  end if;

  if exists (
    with recursive descendants as (
      select id
      from public.wiki_nodes
      where parent_id = new.id
      union all
      select child.id
      from public.wiki_nodes child
      join descendants d on child.parent_id = d.id
    )
    select 1
    from descendants
    where id = new.parent_id
  ) then
    raise exception 'A wiki node cannot be moved under one of its descendants.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_wiki_nodes_prevent_cycle on public.wiki_nodes;
create trigger trg_wiki_nodes_prevent_cycle
before insert or update of parent_id on public.wiki_nodes
for each row
execute function public.prevent_wiki_node_cycle();

create table if not exists public.wiki_page_revisions (
  id uuid primary key default gen_random_uuid(),
  node_id uuid not null references public.wiki_nodes(id) on delete cascade,
  blocks jsonb not null default '[]'::jsonb,
  plain_text text not null default '',
  change_note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_wiki_page_revisions_node_created
  on public.wiki_page_revisions(node_id, created_at desc);

alter table public.wiki_nodes
  drop constraint if exists wiki_nodes_current_revision_id_fkey;

alter table public.wiki_nodes
  add constraint wiki_nodes_current_revision_id_fkey
  foreign key (current_revision_id)
  references public.wiki_page_revisions(id)
  on delete set null;

create table if not exists public.wiki_assets (
  id uuid primary key default gen_random_uuid(),
  node_id uuid not null references public.wiki_nodes(id) on delete cascade,
  storage_bucket text not null default 'Wiki',
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  kind text not null check (kind in ('image', 'document', 'video')),
  title text,
  description text,
  alt_text text,
  extracted_text text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (storage_bucket, storage_path)
);

create index if not exists idx_wiki_assets_node_status
  on public.wiki_assets(node_id, status, created_at desc);

drop trigger if exists trg_wiki_assets_updated_at on public.wiki_assets;
create trigger trg_wiki_assets_updated_at
before update on public.wiki_assets
for each row
execute function public.set_updated_at();

drop policy if exists wiki_storage_objects_select_authenticated on storage.objects;
create policy wiki_storage_objects_select_authenticated
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'Wiki'
    and exists (
      select 1
      from public.wiki_assets a
      join public.wiki_nodes n on n.id = a.node_id
      where a.storage_bucket = storage.objects.bucket_id
        and a.storage_path = storage.objects.name
        and a.status = 'active'
        and (n.status = 'published' or public.user_has_permission_code(auth.uid(), 'wiki.manage'))
    )
  );

create table if not exists public.knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('wiki_page', 'wiki_asset', 'newsletter', 'document', 'report', 'support', 'site')),
  source_id text not null,
  title text not null,
  url text,
  metadata jsonb not null default '{}'::jsonb,
  content_hash text not null,
  status text not null default 'active' check (status in ('active', 'archived', 'error')),
  last_indexed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_type, source_id)
);

create index if not exists idx_knowledge_sources_type_status
  on public.knowledge_sources(source_type, status);

drop trigger if exists trg_knowledge_sources_updated_at on public.knowledge_sources;
create trigger trg_knowledge_sources_updated_at
before update on public.knowledge_sources
for each row
execute function public.set_updated_at();

create table if not exists public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.knowledge_sources(id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  token_count integer,
  embedding vector(1536),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (source_id, chunk_index)
);

create index if not exists idx_knowledge_chunks_source
  on public.knowledge_chunks(source_id, chunk_index);

create index if not exists idx_knowledge_chunks_embedding
  on public.knowledge_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

create table if not exists public.ai_chat_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ai_chat_threads_user_updated
  on public.ai_chat_threads(user_id, updated_at desc);

drop trigger if exists trg_ai_chat_threads_updated_at on public.ai_chat_threads;
create trigger trg_ai_chat_threads_updated_at
before update on public.ai_chat_threads
for each row
execute function public.set_updated_at();

create table if not exists public.ai_chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.ai_chat_threads(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  model text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_chat_messages_thread_created
  on public.ai_chat_messages(thread_id, created_at);

create table if not exists public.ai_chat_citations (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.ai_chat_messages(id) on delete cascade,
  knowledge_source_id uuid references public.knowledge_sources(id) on delete set null,
  knowledge_chunk_id uuid references public.knowledge_chunks(id) on delete set null,
  title text not null,
  url text,
  snippet text,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_chat_citations_message
  on public.ai_chat_citations(message_id);

create or replace function public.match_knowledge_chunks(
  query_embedding vector(1536),
  match_count integer default 8,
  source_types text[] default null
)
returns table (
  chunk_id uuid,
  source_id uuid,
  source_type text,
  source_title text,
  source_url text,
  content text,
  metadata jsonb,
  similarity double precision
)
language sql
stable
as $$
  select
    kc.id as chunk_id,
    ks.id as source_id,
    ks.source_type,
    ks.title as source_title,
    ks.url as source_url,
    kc.content,
    kc.metadata,
    1 - (kc.embedding <=> query_embedding) as similarity
  from public.knowledge_chunks kc
  join public.knowledge_sources ks on ks.id = kc.source_id
  where kc.embedding is not null
    and ks.status = 'active'
    and (source_types is null or ks.source_type = any(source_types))
  order by kc.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

alter table public.wiki_nodes enable row level security;
alter table public.wiki_page_revisions enable row level security;
alter table public.wiki_assets enable row level security;
alter table public.knowledge_sources enable row level security;
alter table public.knowledge_chunks enable row level security;
alter table public.ai_chat_threads enable row level security;
alter table public.ai_chat_messages enable row level security;
alter table public.ai_chat_citations enable row level security;

drop policy if exists wiki_nodes_select_authenticated on public.wiki_nodes;
create policy wiki_nodes_select_authenticated
  on public.wiki_nodes
  for select
  to authenticated
  using (status = 'published' or public.user_has_permission_code(auth.uid(), 'wiki.manage'));

drop policy if exists wiki_nodes_insert_wiki_managers on public.wiki_nodes;
create policy wiki_nodes_insert_wiki_managers
  on public.wiki_nodes
  for insert
  to authenticated
  with check (public.user_has_permission_code(auth.uid(), 'wiki.manage'));

drop policy if exists wiki_nodes_update_wiki_managers on public.wiki_nodes;
create policy wiki_nodes_update_wiki_managers
  on public.wiki_nodes
  for update
  to authenticated
  using (public.user_has_permission_code(auth.uid(), 'wiki.manage'))
  with check (public.user_has_permission_code(auth.uid(), 'wiki.manage'));

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
        and (n.status = 'published' or public.user_has_permission_code(auth.uid(), 'wiki.manage'))
    )
  );

drop policy if exists wiki_page_revisions_insert_wiki_managers on public.wiki_page_revisions;
create policy wiki_page_revisions_insert_wiki_managers
  on public.wiki_page_revisions
  for insert
  to authenticated
  with check (public.user_has_permission_code(auth.uid(), 'wiki.manage'));

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
        and (n.status = 'published' or public.user_has_permission_code(auth.uid(), 'wiki.manage'))
    )
  );

drop policy if exists wiki_assets_insert_wiki_managers on public.wiki_assets;
create policy wiki_assets_insert_wiki_managers
  on public.wiki_assets
  for insert
  to authenticated
  with check (public.user_has_permission_code(auth.uid(), 'wiki.manage'));

drop policy if exists wiki_assets_update_wiki_managers on public.wiki_assets;
create policy wiki_assets_update_wiki_managers
  on public.wiki_assets
  for update
  to authenticated
  using (public.user_has_permission_code(auth.uid(), 'wiki.manage'))
  with check (public.user_has_permission_code(auth.uid(), 'wiki.manage'));

drop policy if exists knowledge_sources_select_authenticated on public.knowledge_sources;
create policy knowledge_sources_select_authenticated
  on public.knowledge_sources
  for select
  to authenticated
  using (status = 'active');

drop policy if exists knowledge_sources_mutate_wiki_managers on public.knowledge_sources;
create policy knowledge_sources_mutate_wiki_managers
  on public.knowledge_sources
  for all
  to authenticated
  using (public.user_has_permission_code(auth.uid(), 'wiki.manage'))
  with check (public.user_has_permission_code(auth.uid(), 'wiki.manage'));

drop policy if exists knowledge_chunks_select_authenticated on public.knowledge_chunks;
create policy knowledge_chunks_select_authenticated
  on public.knowledge_chunks
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.knowledge_sources ks
      where ks.id = knowledge_chunks.source_id
        and ks.status = 'active'
    )
  );

drop policy if exists knowledge_chunks_mutate_wiki_managers on public.knowledge_chunks;
create policy knowledge_chunks_mutate_wiki_managers
  on public.knowledge_chunks
  for all
  to authenticated
  using (public.user_has_permission_code(auth.uid(), 'wiki.manage'))
  with check (public.user_has_permission_code(auth.uid(), 'wiki.manage'));

drop policy if exists ai_chat_threads_own_rows on public.ai_chat_threads;
create policy ai_chat_threads_own_rows
  on public.ai_chat_threads
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists ai_chat_messages_own_threads on public.ai_chat_messages;
create policy ai_chat_messages_own_threads
  on public.ai_chat_messages
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.ai_chat_threads t
      where t.id = ai_chat_messages.thread_id
        and t.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.ai_chat_threads t
      where t.id = ai_chat_messages.thread_id
        and t.user_id = auth.uid()
    )
  );

drop policy if exists ai_chat_citations_own_messages on public.ai_chat_citations;
create policy ai_chat_citations_own_messages
  on public.ai_chat_citations
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.ai_chat_messages m
      join public.ai_chat_threads t on t.id = m.thread_id
      where m.id = ai_chat_citations.message_id
        and t.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.ai_chat_messages m
      join public.ai_chat_threads t on t.id = m.thread_id
      where m.id = ai_chat_citations.message_id
        and t.user_id = auth.uid()
    )
  );

grant select, insert, update on table public.wiki_nodes to authenticated;
grant select, insert on table public.wiki_page_revisions to authenticated;
grant select, insert, update on table public.wiki_assets to authenticated;
grant select, insert, update, delete on table public.knowledge_sources to authenticated;
grant select, insert, update, delete on table public.knowledge_chunks to authenticated;
grant select, insert, update, delete on table public.ai_chat_threads to authenticated;
grant select, insert, update, delete on table public.ai_chat_messages to authenticated;
grant select, insert, update, delete on table public.ai_chat_citations to authenticated;
grant execute on function public.match_knowledge_chunks(vector(1536), integer, text[]) to authenticated;
