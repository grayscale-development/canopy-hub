-- Preserve historical identifiers even if the associated user, page, or alert is removed.
create table if not exists public.ai_action_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_user_id uuid,
  action_type text not null check (action_type in ('milo_answer', 'alert_recommendation', 'alert_apply')),
  target_page_id uuid,
  target_alert_id uuid,
  summary text not null check (char_length(summary) between 1 and 280)
);

alter table public.ai_action_log enable row level security;
revoke all on public.ai_action_log from public, anon, authenticated, service_role;
grant insert, select on public.ai_action_log to service_role;

create or replace function public.prevent_ai_action_log_changes()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'AI action log is append-only';
end;
$$;

drop trigger if exists ai_action_log_append_only on public.ai_action_log;
create trigger ai_action_log_append_only before update or delete on public.ai_action_log
for each row execute function public.prevent_ai_action_log_changes();

create or replace function public.log_user_ai_action(
  p_action_type text,
  p_target_page_id uuid default null,
  p_target_alert_id uuid default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null or p_action_type not in ('milo_answer', 'alert_apply') or p_action_type is null then
    raise exception 'Not allowed to log this action';
  end if;
  if p_action_type = 'alert_apply' and not public.user_has_permission_code(actor, 'wiki.manage') then
    raise exception 'Not allowed to log this action';
  end if;
  insert into public.ai_action_log (actor_user_id, action_type, target_page_id, target_alert_id, summary)
  values (actor, p_action_type, p_target_page_id, p_target_alert_id,
    case when p_action_type = 'milo_answer' then 'Milo answered a question'
         else 'Applied an alert recommendation' end);
end;
$$;

revoke all on function public.log_user_ai_action(text, uuid, uuid) from public, anon;
grant execute on function public.log_user_ai_action(text, uuid, uuid) to authenticated;
