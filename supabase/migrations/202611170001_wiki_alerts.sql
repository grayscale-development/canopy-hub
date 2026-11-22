create table if not exists public.wiki_alerts (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'duplicate' check (kind in ('duplicate')),
  status text not null default 'open' check (status in ('open', 'dismissed', 'applied')),
  page_id uuid not null references public.wiki_nodes(id) on delete cascade,
  other_page_id uuid not null references public.wiki_nodes(id) on delete cascade,
  page_hash text,
  other_page_hash text,
  recommendation jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  dismissed_by uuid references auth.users(id),
  dismissed_at timestamptz,
  applied_by uuid references auth.users(id),
  applied_at timestamptz,
  check (page_id <> other_page_id)
);

create unique index if not exists wiki_alerts_open_pair_unique
  on public.wiki_alerts (least(page_id, other_page_id), greatest(page_id, other_page_id))
  where status = 'open';

drop trigger if exists trg_wiki_alerts_updated_at on public.wiki_alerts;
create trigger trg_wiki_alerts_updated_at
before update on public.wiki_alerts
for each row execute function public.set_updated_at();

create table if not exists public.wiki_alert_scan_state (
  singleton boolean primary key default true check (singleton),
  last_success_at timestamptz,
  last_page_updated_at timestamptz
);

alter table public.wiki_alerts enable row level security;
alter table public.wiki_alert_scan_state enable row level security;

drop policy if exists wiki_alerts_select_managers on public.wiki_alerts;
create policy wiki_alerts_select_managers on public.wiki_alerts
  for select to authenticated
  using (public.user_has_permission_code(auth.uid(), 'wiki.manage'));

drop policy if exists wiki_alerts_update_managers on public.wiki_alerts;
create policy wiki_alerts_update_managers on public.wiki_alerts
  for update to authenticated
  using (public.user_has_permission_code(auth.uid(), 'wiki.manage'))
  with check (public.user_has_permission_code(auth.uid(), 'wiki.manage'));

revoke all on public.wiki_alerts, public.wiki_alert_scan_state from public, anon, authenticated;
grant select on public.wiki_alerts to authenticated;
grant update (status, dismissed_by, dismissed_at, applied_by, applied_at) on public.wiki_alerts to authenticated;
grant all on public.wiki_alerts, public.wiki_alert_scan_state to service_role;
