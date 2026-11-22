-- The service-role-only entry point is deliberately separate from manager tools.
create or replace function app_private.apply_wiki_tag_decisions(p_decisions jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_item jsonb; v_id uuid; v_target uuid; v_section uuid; v_action text;
  v_day text := pg_catalog.to_char(pg_catalog.now() at time zone 'UTC', 'YYYYMMDD');
  v_tags_backup text := 'wiki_tags_backup_' || v_day;
  v_links_backup text := 'wiki_page_tags_backup_' || v_day;
  v_nodes_backup text := 'wiki_node_tags_backup_' || v_day;
  v_hash text := pg_catalog.md5(p_decisions::text);
  v_result jsonb; v_before bigint; v_after bigint; v_expected bigint; v_tags_before bigint;
  v_affected uuid[]; v_expected_pairs jsonb; v_actual_pairs jsonb;
begin
  if pg_catalog.jsonb_typeof(p_decisions) is distinct from 'array' or pg_catalog.jsonb_array_length(p_decisions) = 0 then
    raise exception 'wiki_tag_decisions_empty';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(530054);
  select a.details into v_result from public.wiki_tag_audit a where a.action = 'migration' and a.details->>'decision_hash' = v_hash
    and not exists (select 1 from public.wiki_tag_audit r where r.action = 'migration_rollback' and r.details->>'decision_hash' = v_hash and r.created_at >= a.created_at)
    order by a.created_at desc limit 1;
  if found then return v_result || pg_catalog.jsonb_build_object('already_applied', true); end if;

  -- Block concurrent edits until backups, application and verification finish.
  lock table public.wiki_nodes, public.wiki_tags, public.wiki_page_tags in share row exclusive mode;
  if pg_catalog.to_regclass(pg_catalog.format('app_private.%I', v_tags_backup)) is not null
    or pg_catalog.to_regclass(pg_catalog.format('app_private.%I', v_links_backup)) is not null
    or pg_catalog.to_regclass(pg_catalog.format('app_private.%I', v_nodes_backup)) is not null then
    raise exception 'wiki_tag_backup_already_exists: backups for % already exist', v_day;
  end if;
  if exists (select 1 from pg_catalog.jsonb_array_elements(p_decisions) d group by (d->>'tag_id')::uuid having count(*) > 1) then
    raise exception 'wiki_tag_duplicate_decision';
  end if;
  for v_item in select value from pg_catalog.jsonb_array_elements(p_decisions) loop
    v_id := (v_item->>'tag_id')::uuid; v_action := v_item->>'action';
    if v_id is null or v_action is null or v_action not in ('keep', 'global', 'section', 'merge', 'delete') or not exists (select 1 from public.wiki_tags where id = v_id) then
      raise exception 'wiki_tag_invalid_decision: %', v_item;
    end if;
    if v_action = 'section' then
      v_section := (v_item->>'section_id')::uuid;
      if not exists (select 1 from public.wiki_nodes s join public.wiki_nodes r on r.id = s.parent_id where s.id = v_section and s.type = 'folder' and r.type = 'folder' and r.parent_id is null) then raise exception 'wiki_tag_invalid_section: %', v_item; end if;
    elsif v_item ? 'section_id' then raise exception 'wiki_tag_unexpected_section: %', v_item;
    end if;
    if v_action = 'merge' then
      v_target := (v_item->>'target_id')::uuid;
      if v_target is null or v_target = v_id or not exists (select 1 from public.wiki_tags where id = v_target) or exists (select 1 from pg_catalog.jsonb_array_elements(p_decisions) d where (d->>'tag_id')::uuid = v_target and d->>'action' in ('merge', 'delete')) then raise exception 'wiki_tag_invalid_target: %', v_item; end if;
    elsif v_item ? 'target_id' then raise exception 'wiki_tag_unexpected_target: %', v_item;
    end if;
  end loop;

  execute pg_catalog.format('create table app_private.%I as table public.wiki_tags', v_tags_backup);
  execute pg_catalog.format('create table app_private.%I as table public.wiki_page_tags', v_links_backup);
  execute pg_catalog.format('create table app_private.%I as select id, tags from public.wiki_nodes', v_nodes_backup);
  execute pg_catalog.format('revoke all on app_private.%I, app_private.%I, app_private.%I from public, anon, authenticated', v_tags_backup, v_links_backup, v_nodes_backup);
  select count(*) into v_before from public.wiki_page_tags;
  select count(*) into v_tags_before from public.wiki_tags;

  -- Expected pairs are independently derived from the original links and decisions.
  select count(*), coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(e.node_id, e.tag_id) order by e.node_id, e.tag_id), '[]'::jsonb)
    into v_expected, v_expected_pairs from (
      select distinct pt.node_id, coalesce((d.value->>'target_id')::uuid, pt.tag_id) as tag_id
      from public.wiki_page_tags pt
      left join lateral (select value from pg_catalog.jsonb_array_elements(p_decisions) where (value->>'tag_id')::uuid = pt.tag_id) d on true
      where coalesce(d.value->>'action', '') <> 'delete'
    ) e;
  if exists (
    select 1 from public.wiki_page_tags pt
    left join lateral (select value from pg_catalog.jsonb_array_elements(p_decisions) where (value->>'tag_id')::uuid = pt.tag_id) d on true
    group by pt.node_id having count(*) > 1 and pg_catalog.bool_and(coalesce(d.value->>'action', '') = 'delete')
  ) then raise exception 'wiki_tag_page_would_lose_all_tags'; end if;
  select coalesce(pg_catalog.array_agg(distinct pt.node_id), array[]::uuid[]) into v_affected from public.wiki_page_tags pt
    join pg_catalog.jsonb_array_elements(p_decisions) d on (d->>'tag_id')::uuid = pt.tag_id
    where d->>'action' in ('merge', 'delete');

  -- A target promoted to global can accept source pages from other sections.
  for v_item in select value from pg_catalog.jsonb_array_elements(p_decisions) where value->>'action' = 'global' loop
    update public.wiki_tags set scope = 'global', section_id = null where id = (v_item->>'tag_id')::uuid and scope <> 'global';
  end loop;
  for v_item in select value from pg_catalog.jsonb_array_elements(p_decisions) where value->>'action' = 'merge' loop
    v_id := (v_item->>'tag_id')::uuid; v_target := (v_item->>'target_id')::uuid;
    if exists (select 1 from public.wiki_page_tags pt where pt.tag_id = v_id and not app_private.wiki_tag_in_scope(pt.node_id, v_target)) then raise exception 'wiki_tag_out_of_scope: %', v_item; end if;
    insert into public.wiki_page_tags(node_id, tag_id) select node_id, v_target from public.wiki_page_tags where tag_id = v_id on conflict (node_id, tag_id) do nothing;
    delete from public.wiki_page_tags where tag_id = v_id;
    delete from public.wiki_tags where id = v_id;
  end loop;
  for v_item in select value from pg_catalog.jsonb_array_elements(p_decisions) where value->>'action' = 'delete' loop
    delete from public.wiki_page_tags where tag_id = (v_item->>'tag_id')::uuid;
    delete from public.wiki_tags where id = (v_item->>'tag_id')::uuid;
  end loop;
  for v_item in select value from pg_catalog.jsonb_array_elements(p_decisions) where value->>'action' = 'section' loop
    v_id := (v_item->>'tag_id')::uuid; v_section := (v_item->>'section_id')::uuid;
    if exists (
      with recursive ancestry as (
        select n.id as page_id, n.id, n.parent_id, array[n.id] as visited from public.wiki_nodes n join public.wiki_page_tags pt on pt.node_id = n.id where pt.tag_id = v_id
        union all select a.page_id, n.id, n.parent_id, a.visited || n.id from ancestry a join public.wiki_nodes n on n.id = a.parent_id where not n.id = any(a.visited)
      ) select 1 from public.wiki_page_tags pt where pt.tag_id = v_id and not exists (select 1 from ancestry a where a.page_id = pt.node_id and a.id = v_section)
    ) then raise exception 'wiki_tag_demote_blocked: %', v_item; end if;
    update public.wiki_tags set scope = 'section', section_id = v_section where id = v_id and (scope <> 'section' or section_id is distinct from v_section);
  end loop;
  if exists (select 1 from public.wiki_page_tags group by node_id having count(*) > 12) then raise exception 'wiki_tag_limit'; end if;
  update public.wiki_nodes n set tags = coalesce((select pg_catalog.array_agg(t.name order by t.name, t.id) from public.wiki_page_tags pt join public.wiki_tags t on t.id = pt.tag_id where pt.node_id = n.id), array[]::text[])
    where n.id = any(v_affected) and n.type = 'page';
  select count(*), coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(node_id, tag_id) order by node_id, tag_id), '[]'::jsonb) into v_after, v_actual_pairs from public.wiki_page_tags;
  if v_actual_pairs is distinct from v_expected_pairs then raise exception 'wiki_tag_pair_verification_failed'; end if;
  if v_after <> v_expected then raise exception 'wiki_tag_pair_count_verification_failed'; end if;
  v_result := pg_catalog.jsonb_build_object('decision_hash', v_hash, 'backup_date', v_day, 'pairs_before', v_before, 'pairs_after', v_after, 'expected_pairs', v_expected, 'tags_before', v_tags_before, 'tags_after', (select count(*) from public.wiki_tags), 'actor', 'service_role', 'decisions', p_decisions);
  insert into public.wiki_tag_audit(action, actor_id, details) values ('migration', coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid), v_result);
  return v_result;
end $$;
revoke all on function app_private.apply_wiki_tag_decisions(jsonb) from public, anon, authenticated;
grant execute on function app_private.apply_wiki_tag_decisions(jsonb) to service_role;

create or replace function public.apply_wiki_tag_decisions(p_decisions jsonb)
returns jsonb language sql security invoker set search_path = '' as $$ select app_private.apply_wiki_tag_decisions(p_decisions); $$;
revoke all on function public.apply_wiki_tag_decisions(jsonb) from public, anon, authenticated;
grant execute on function public.apply_wiki_tag_decisions(jsonb) to service_role;
