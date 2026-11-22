insert into public.permissions (name, code)
values ('Manage Feedback', 'feedback.manage')
on conflict (code) do nothing;

insert into public.user_permissions (user_id, permission_id)
select source.user_id, target.id
from public.user_permissions source
join public.permissions existing on existing.id = source.permission_id and existing.code = 'ai.settings.access'
join public.permissions target on target.code = 'feedback.manage'
on conflict (user_id, permission_id) do nothing;

create table if not exists public.feedback_items (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id),
  type text not null check (type in ('bug', 'idea', 'question', 'other')),
  message text not null check (char_length(btrim(message)) between 1 and 5000),
  page_path text check (page_path is null or (left(page_path, 1) = '/' and left(page_path, 2) <> '//' and position(chr(92) in page_path) = 0 and page_path !~ '[[:cntrl:]]' and char_length(page_path) <= 2048)),
  status text not null default 'open' check (status in ('open', 'resolved')),
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  check ((status = 'open' and resolved_by is null and resolved_at is null) or (status = 'resolved' and resolved_by is not null and resolved_at is not null))
);
create index if not exists feedback_items_created_at_idx on public.feedback_items (created_at desc);
alter table public.feedback_items enable row level security;

drop policy if exists feedback_items_insert_own on public.feedback_items;
create policy feedback_items_insert_own on public.feedback_items for insert to authenticated
  with check (created_by = auth.uid());
drop policy if exists feedback_items_select_manage on public.feedback_items;
create policy feedback_items_select_manage on public.feedback_items for select to authenticated
  using (public.user_has_permission_code(auth.uid(), 'feedback.manage'));
drop policy if exists feedback_items_update_manage on public.feedback_items;
create policy feedback_items_update_manage on public.feedback_items for update to authenticated
  using (public.user_has_permission_code(auth.uid(), 'feedback.manage'))
  with check (public.user_has_permission_code(auth.uid(), 'feedback.manage') and (resolved_by is null or resolved_by = auth.uid()));

revoke all on public.feedback_items from public, anon, authenticated;
grant insert (created_by, type, message, page_path) on public.feedback_items to authenticated;
grant select on public.feedback_items to authenticated;
grant update (status, resolved_by, resolved_at) on public.feedback_items to authenticated;
grant select, insert, update, delete on public.feedback_items to service_role;

-- Only disclose identities of people who actually submitted or shared feedback.
create or replace function app_private.feedback_submitters()
returns table (user_id uuid, display_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.user_has_permission_code(auth.uid(), 'feedback.manage') then
    raise exception using errcode = '42501', message = 'feedback_manage_required';
  end if;
  return query
    select u.id, coalesce(nullif(u.raw_user_meta_data->>'full_name', ''), nullif(u.raw_user_meta_data->>'name', ''), u.email, 'Unknown user')
    from auth.users u
    where exists (select 1 from public.feedback_items f where f.created_by = u.id)
       or exists (select 1 from public.ai_chat_message_flags f where f.user_id = u.id and f.acknowledged);
end;
$$;
revoke all on function app_private.feedback_submitters() from public, anon;
grant execute on function app_private.feedback_submitters() to authenticated;
create or replace function public.feedback_submitters()
returns table (user_id uuid, display_name text)
language sql stable security invoker set search_path = '' as $$
  select * from app_private.feedback_submitters();
$$;
revoke all on function public.feedback_submitters() from public, anon;
grant execute on function public.feedback_submitters() to authenticated;
