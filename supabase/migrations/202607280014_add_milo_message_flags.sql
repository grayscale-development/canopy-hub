create table if not exists public.ai_chat_message_flags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  thread_id uuid not null references public.ai_chat_threads(id) on delete cascade,
  user_message_id uuid references public.ai_chat_messages(id) on delete set null,
  assistant_message_id uuid not null references public.ai_chat_messages(id) on delete cascade,
  reason text not null,
  acknowledged boolean not null default false,
  user_message_content text not null,
  assistant_message_content text not null,
  status text not null default 'open' check (status in ('open', 'reviewed', 'closed')),
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_chat_message_flags_created
  on public.ai_chat_message_flags(created_at desc);

create index if not exists idx_ai_chat_message_flags_assistant_message
  on public.ai_chat_message_flags(assistant_message_id);

create unique index if not exists idx_ai_chat_message_flags_user_assistant_unique
  on public.ai_chat_message_flags(user_id, assistant_message_id)
  where user_id is not null;

alter table public.ai_chat_message_flags enable row level security;

drop policy if exists ai_chat_message_flags_insert_own on public.ai_chat_message_flags;
create policy ai_chat_message_flags_insert_own
  on public.ai_chat_message_flags
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and acknowledged = true
    and exists (
      select 1
      from public.ai_chat_threads t
      where t.id = ai_chat_message_flags.thread_id
        and t.user_id = auth.uid()
    )
  );

drop policy if exists ai_chat_message_flags_select_own on public.ai_chat_message_flags;
create policy ai_chat_message_flags_select_own
  on public.ai_chat_message_flags
  for select
  to authenticated
  using (user_id = auth.uid());

grant select, insert on table public.ai_chat_message_flags to authenticated;
