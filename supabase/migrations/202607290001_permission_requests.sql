create table if not exists public.permission_requests (
  id uuid primary key default gen_random_uuid(),
  permission_id uuid not null references public.permissions(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  requester_email text,
  requester_name text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_permission_requests_permission_id
  on public.permission_requests(permission_id);

create index if not exists idx_permission_requests_requested_by
  on public.permission_requests(requested_by);

create index if not exists idx_permission_requests_status_created_at
  on public.permission_requests(status, created_at desc);

create unique index if not exists idx_permission_requests_pending_unique
  on public.permission_requests(requested_by, permission_id)
  where completed_at is null;

drop trigger if exists trg_permission_requests_updated_at on public.permission_requests;
create trigger trg_permission_requests_updated_at
before update on public.permission_requests
for each row
execute function public.set_updated_at();

alter table public.permission_requests enable row level security;

drop policy if exists permission_requests_select_authenticated on public.permission_requests;
create policy permission_requests_select_authenticated
  on public.permission_requests
  for select
  to authenticated
  using (
    requested_by = auth.uid()
    or public.user_has_permission_code(auth.uid(), 'permissions.edit')
  );

drop policy if exists permission_requests_insert_own on public.permission_requests;
create policy permission_requests_insert_own
  on public.permission_requests
  for insert
  to authenticated
  with check (requested_by = auth.uid());

drop policy if exists permission_requests_update_permissions_edit on public.permission_requests;
create policy permission_requests_update_permissions_edit
  on public.permission_requests
  for update
  to authenticated
  using (public.user_has_permission_code(auth.uid(), 'permissions.edit'))
  with check (public.user_has_permission_code(auth.uid(), 'permissions.edit'));

grant select, insert, update on table public.permission_requests to authenticated;
