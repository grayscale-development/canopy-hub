-- A lease serializes on-demand scans across server instances. Stale leases expire
-- so a terminated server cannot block future runs indefinitely.
create table if not exists public.wiki_alert_manual_scan_lease (
  singleton boolean primary key default true check (singleton),
  token uuid not null,
  started_at timestamptz not null default now()
);
alter table public.wiki_alert_manual_scan_lease enable row level security;
revoke all on public.wiki_alert_manual_scan_lease from public, anon, authenticated;
grant select, insert, update, delete on public.wiki_alert_manual_scan_lease to service_role;

create or replace function app_private.acquire_wiki_alert_manual_scan(p_token uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_token is null then return false; end if;
  insert into public.wiki_alert_manual_scan_lease (singleton, token, started_at)
    values (true, p_token, now())
    on conflict (singleton) do update set token = excluded.token, started_at = excluded.started_at
    where public.wiki_alert_manual_scan_lease.started_at < now() - interval '30 minutes';
  return found;
end;
$$;
create or replace function app_private.release_wiki_alert_manual_scan(p_token uuid)
returns void language sql security definer set search_path = '' as $$
  delete from public.wiki_alert_manual_scan_lease where singleton = true and token = p_token;
$$;
revoke all on function app_private.acquire_wiki_alert_manual_scan(uuid), app_private.release_wiki_alert_manual_scan(uuid) from public, anon, authenticated;
grant execute on function app_private.acquire_wiki_alert_manual_scan(uuid), app_private.release_wiki_alert_manual_scan(uuid) to service_role;

create or replace function public.acquire_wiki_alert_manual_scan(p_token uuid)
returns boolean language sql security invoker set search_path = '' as $$
  select app_private.acquire_wiki_alert_manual_scan(p_token);
$$;
create or replace function public.release_wiki_alert_manual_scan(p_token uuid)
returns void language sql security invoker set search_path = '' as $$
  select app_private.release_wiki_alert_manual_scan(p_token);
$$;
revoke all on function public.acquire_wiki_alert_manual_scan(uuid), public.release_wiki_alert_manual_scan(uuid) from public, anon, authenticated;
grant execute on function public.acquire_wiki_alert_manual_scan(uuid), public.release_wiki_alert_manual_scan(uuid) to service_role;
