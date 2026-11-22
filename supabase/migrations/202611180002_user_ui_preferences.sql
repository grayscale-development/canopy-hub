create table public.user_ui_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  milo_corner text not null default 'bottom-right'
    check (milo_corner in ('top-left', 'top-right', 'bottom-left', 'bottom-right')),
  updated_at timestamptz not null default now()
);

create trigger trg_user_ui_preferences_updated_at
before update on public.user_ui_preferences
for each row execute function public.set_updated_at();

alter table public.user_ui_preferences enable row level security;
create policy user_ui_preferences_select_own on public.user_ui_preferences
  for select to authenticated using (user_id = auth.uid());
create policy user_ui_preferences_insert_own on public.user_ui_preferences
  for insert to authenticated with check (user_id = auth.uid());
create policy user_ui_preferences_update_own on public.user_ui_preferences
  for update to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.user_ui_preferences from public, anon, authenticated;
grant select, insert, update on public.user_ui_preferences to authenticated;
grant all on public.user_ui_preferences to service_role;
