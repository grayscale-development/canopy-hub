-- Archive a reviewed identical-page recommendation and close its alert atomically.
create or replace function app_private.apply_identical_wiki_alert(p_alert_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_alert public.wiki_alerts%rowtype;
  v_target uuid;
  v_canonical uuid;
begin
  if v_user is null or not public.user_has_permission_code(v_user, 'wiki.manage')
    or not public.user_has_permission_code(v_user, 'beta.1') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_alert from public.wiki_alerts where id = p_alert_id for update;
  if not found or v_alert.status <> 'open' or v_alert.recommendation->>'version' is distinct from '2'
    or v_alert.recommendation->>'kind' is distinct from 'identical' then
    raise exception 'stale_alert';
  end if;
  v_target := (v_alert.recommendation->>'targetPageId')::uuid;
  v_canonical := (v_alert.recommendation->>'canonicalPageId')::uuid;
  if v_target is null or v_canonical is null or v_target = v_canonical
    or v_target not in (v_alert.page_id, v_alert.other_page_id)
    or v_canonical not in (v_alert.page_id, v_alert.other_page_id) then
    raise exception 'stale_alert';
  end if;
  perform 1 from public.wiki_nodes where id in (v_target, v_canonical) order by id for update;
  if not exists (select 1 from public.wiki_nodes where id = v_target and type = 'page'
    and status <> 'archived' and current_revision_id::text = v_alert.recommendation->>'baseRevisionId')
    or not exists (select 1 from public.wiki_nodes where id = v_canonical and type = 'page'
    and status <> 'archived' and current_revision_id::text = v_alert.recommendation->>'canonicalRevisionId') then
    raise exception 'stale_revision';
  end if;
  -- An archived ancestor makes either page ineligible.
  if exists (with recursive ancestors as (
    select id, parent_id, status, array[id] as visited from public.wiki_nodes where id in (v_target, v_canonical)
    union all
    select n.id, n.parent_id, n.status, a.visited || n.id from public.wiki_nodes n
    join ancestors a on n.id = a.parent_id where not n.id = any(a.visited)
  ) select 1 from ancestors where status = 'archived') then
    raise exception 'stale_revision';
  end if;
  update public.wiki_nodes set status = 'archived', updated_by = v_user where id = v_target;
  update public.knowledge_sources set status = 'archived', last_indexed_at = now()
    where source_type = 'wiki_page' and source_id = v_target::text;
  update public.wiki_alerts set status = 'applied', applied_by = v_user, applied_at = now() where id = p_alert_id;
  -- Other pairs involving this now-archived page no longer need review.
  update public.wiki_alerts set status = 'dismissed', dismissed_by = v_user, dismissed_at = now()
    where status = 'open' and (page_id = v_target or other_page_id = v_target);
end;
$$;
revoke all on function app_private.apply_identical_wiki_alert(uuid) from public, anon, authenticated;
grant execute on function app_private.apply_identical_wiki_alert(uuid) to authenticated, service_role;
create or replace function public.apply_identical_wiki_alert(p_alert_id uuid)
returns void language sql security invoker set search_path = '' as $$
  select app_private.apply_identical_wiki_alert(p_alert_id);
$$;
revoke all on function public.apply_identical_wiki_alert(uuid) from public, anon, authenticated;
grant execute on function public.apply_identical_wiki_alert(uuid) to authenticated, service_role;
