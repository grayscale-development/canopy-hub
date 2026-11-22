create table if not exists public.ai_chat_message_ratings (
  assistant_message_id uuid primary key references public.ai_chat_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating text not null check (rating in ('up', 'down')),
  created_at timestamptz not null default now()
);

alter table public.ai_chat_message_ratings enable row level security;

drop policy if exists ai_chat_message_ratings_own on public.ai_chat_message_ratings;
create policy ai_chat_message_ratings_own on public.ai_chat_message_ratings
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.ai_chat_messages m
      join public.ai_chat_threads t on t.id = m.thread_id
      where m.id = assistant_message_id and m.role = 'assistant'
        and t.user_id = auth.uid()
    )
  );

grant select, insert, update on public.ai_chat_message_ratings to authenticated;

-- A flag must refer to actual messages in the caller's own conversation.
drop policy if exists ai_chat_message_flags_insert_own on public.ai_chat_message_flags;
create policy ai_chat_message_flags_insert_own on public.ai_chat_message_flags
  for insert to authenticated
  with check (
    user_id = auth.uid() and acknowledged = true
    and exists (
      select 1 from public.ai_chat_threads t
      join public.ai_chat_messages a on a.thread_id = t.id
      join public.ai_chat_messages q on q.thread_id = t.id
      where t.id = ai_chat_message_flags.thread_id and t.user_id = auth.uid()
        and a.id = ai_chat_message_flags.assistant_message_id and a.role = 'assistant'
        and q.id = ai_chat_message_flags.user_message_id and q.role = 'user'
        and q.created_at < a.created_at
        and q.content = ai_chat_message_flags.user_message_content
        and a.content = ai_chat_message_flags.assistant_message_content
    )
  );
