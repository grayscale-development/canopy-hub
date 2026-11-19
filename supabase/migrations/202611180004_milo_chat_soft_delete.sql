-- Hide chats from their owner without removing manager feedback.
alter table public.ai_chat_threads
  add column if not exists deleted_at timestamptz;

create index if not exists idx_ai_chat_threads_active_user_updated
  on public.ai_chat_threads (user_id, updated_at desc)
  where deleted_at is null;
