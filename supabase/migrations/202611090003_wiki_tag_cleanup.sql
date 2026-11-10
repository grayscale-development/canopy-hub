-- Tag-only changes are recorded separately from page revisions.
create table if not exists public.wiki_tag_audit (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  actor_id uuid not null,
  details jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.wiki_tag_audit enable row level security;
revoke all on public.wiki_tag_audit from public, anon, authenticated;
grant select on public.wiki_tag_audit to authenticated;
drop policy if exists wiki_tag_audit_manager_read on public.wiki_tag_audit;
create policy wiki_tag_audit_manager_read on public.wiki_tag_audit for select to authenticated
  using (public.user_has_permission_code(auth.uid(), 'wiki.manage'));

-- Case-only edits do not introduce a new case-insensitive collision. In particular,
-- do not make grandfathered case variants impossible to clean up.
create or replace function app_private.guard_wiki_tag_name()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.name is not distinct from old.name and new.scope is not distinct from old.scope and new.section_id is not distinct from old.section_id then
    return new;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(pg_catalog.lower(new.name), 530053));
  if not (tg_op = 'UPDATE' and pg_catalog.lower(new.name) = pg_catalog.lower(old.name) and new.scope = old.scope and new.section_id is not distinct from old.section_id)
    and exists (
      select 1 from public.wiki_tags t where t.id <> new.id and pg_catalog.lower(t.name) = pg_catalog.lower(new.name)
        and (new.scope = 'global' or t.scope = 'global' or t.section_id = new.section_id)
    ) then
    raise exception using errcode = 'P0001', message = 'wiki_tag_name_conflict';
  end if;
  if new.scope = 'section' and not exists (select 1 from public.wiki_nodes n where n.id = new.section_id and n.type = 'folder') then
    raise exception using errcode = 'P0001', message = 'wiki_tag_invalid_section';
  end if;
  return new;
end $$;
revoke all on function app_private.guard_wiki_tag_name() from public, anon, authenticated;

create or replace function app_private.manage_wiki_tag(
  p_action text, p_source_id uuid default null, p_target_id uuid default null,
  p_name text default null, p_section_id uuid default null,
  p_delete_ids uuid[] default null, p_expected_node_ids uuid[] default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_source public.wiki_tags%rowtype;
  v_target public.wiki_tags%rowtype;
  v_nodes uuid[] := array[]::uuid[];
  v_both uuid[] := array[]::uuid[];
  v_deleted jsonb := '[]'::jsonb;
  v_details jsonb;
begin
  if auth.uid() is null or not public.user_has_permission_code(auth.uid(), 'wiki.manage') then
    raise exception using errcode = '42501', message = 'wiki_manage_required';
  end if;
  if p_action not in ('merge', 'rename', 'promote', 'demote', 'delete') then
    raise exception using errcode = 'P0001', message = 'wiki_tag_invalid_action';
  end if;
  if p_action = 'delete' then
    if coalesce(pg_catalog.cardinality(p_delete_ids), 0) = 0 then
      raise exception using errcode = 'P0001', message = 'wiki_tag_invalid';
    end if;
    perform 1 from public.wiki_tags where id = any(p_delete_ids) order by id for update;
    if (select count(*) from public.wiki_tags where id = any(p_delete_ids)) <> (select count(distinct id) from pg_catalog.unnest(p_delete_ids) id)
      or exists (select 1 from public.wiki_page_tags where tag_id = any(p_delete_ids)) then
      raise exception using errcode = 'P0001', message = 'wiki_tag_delete_used';
    end if;
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', id, 'name', name, 'scope', scope, 'section_id', section_id) order by id), '[]'::jsonb)
      into v_deleted from public.wiki_tags where id = any(p_delete_ids);
    delete from public.wiki_tags where id = any(p_delete_ids);
    v_details := pg_catalog.jsonb_build_object('tags', v_deleted, 'tag_count', pg_catalog.jsonb_array_length(v_deleted), 'page_count', 0, 'affected_node_ids', v_nodes);
  else
    perform 1 from public.wiki_tags where id = p_source_id or (p_action = 'merge' and id = p_target_id) order by id for update;
    select * into v_source from public.wiki_tags where id = p_source_id;
    if not found then raise exception using errcode = 'P0001', message = 'wiki_tag_not_found'; end if;
    if p_action = 'merge' then
      select * into v_target from public.wiki_tags where id = p_target_id;
      if not found or p_source_id = p_target_id then raise exception using errcode = 'P0001', message = 'wiki_tag_invalid_target'; end if;
    end if;
    -- Serialize with sync_wiki_page_tags and preserve the preview if it changed.
    perform 1 from public.wiki_nodes n where n.id in (select pt.node_id from public.wiki_page_tags pt where pt.tag_id = p_source_id) order by n.id for update;
    select coalesce(pg_catalog.array_agg(pt.node_id order by pt.node_id), array[]::uuid[]) into v_nodes from public.wiki_page_tags pt where pt.tag_id = p_source_id;
    if p_expected_node_ids is not null and v_nodes is distinct from (select coalesce(pg_catalog.array_agg(id order by id), array[]::uuid[]) from pg_catalog.unnest(p_expected_node_ids) id) then
      raise exception using errcode = 'P0001', message = 'wiki_tag_preview_changed';
    end if;
    v_details := pg_catalog.jsonb_build_object('source', pg_catalog.to_jsonb(v_source), 'page_count', pg_catalog.cardinality(v_nodes), 'affected_node_ids', v_nodes);
    if p_action = 'merge' then
      if exists (select 1 from pg_catalog.unnest(v_nodes) id where not app_private.wiki_tag_in_scope(id, p_target_id)) then
        raise exception using errcode = 'P0001', message = 'wiki_tag_out_of_scope';
      end if;
      select coalesce(pg_catalog.array_agg(node_id order by node_id), array[]::uuid[]) into v_both from public.wiki_page_tags where tag_id = p_target_id and node_id = any(v_nodes);
      insert into public.wiki_page_tags(node_id, tag_id) select id, p_target_id from pg_catalog.unnest(v_nodes) id on conflict (node_id, tag_id) do nothing;
      delete from public.wiki_page_tags where tag_id = p_source_id;
      delete from public.wiki_tags where id = p_source_id;
      v_details := v_details || pg_catalog.jsonb_build_object('target', pg_catalog.to_jsonb(v_target), 'target_existing_node_ids', v_both);
    elsif p_action = 'rename' then
      if p_name is null or pg_catalog.btrim(p_name) = '' or pg_catalog.length(p_name) > 60 then raise exception using errcode = 'P0001', message = 'wiki_tag_invalid'; end if;
      update public.wiki_tags set name = p_name where id = p_source_id;
      v_details := v_details || pg_catalog.jsonb_build_object('new_name', p_name);
    elsif p_action = 'promote' then
      if v_source.scope <> 'section' then raise exception using errcode = 'P0001', message = 'wiki_tag_invalid'; end if;
      update public.wiki_tags set scope = 'global', section_id = null where id = p_source_id;
    elsif p_action = 'demote' then
      if v_source.scope <> 'global' or p_section_id is null then raise exception using errcode = 'P0001', message = 'wiki_tag_invalid'; end if;
      if not exists (select 1 from public.wiki_nodes section join public.wiki_nodes root on root.id = section.parent_id where section.id = p_section_id and section.type = 'folder' and root.type = 'folder' and root.parent_id is null) then
        raise exception using errcode = 'P0001', message = 'wiki_tag_invalid_section';
      end if;
      -- Test the proposed section before changing the tag; moved pages can be out of scope.
      if exists (
        with recursive ancestry as (
          select n.id as page_id, n.id, n.parent_id, array[n.id] as visited from public.wiki_nodes n where n.id = any(v_nodes)
          union all select a.page_id, n.id, n.parent_id, a.visited || n.id from ancestry a join public.wiki_nodes n on n.id = a.parent_id where not n.id = any(a.visited)
        ) select 1 from pg_catalog.unnest(v_nodes) as page(node_id) where not exists (select 1 from ancestry a where a.page_id = page.node_id and a.id = p_section_id)
      ) then raise exception using errcode = 'P0001', message = 'wiki_tag_demote_blocked'; end if;
      update public.wiki_tags set scope = 'section', section_id = p_section_id where id = p_source_id;
      v_details := v_details || pg_catalog.jsonb_build_object('section_id', p_section_id);
    end if;
    if p_action in ('merge', 'rename') then
      update public.wiki_nodes n set tags = coalesce((select pg_catalog.array_agg(t.name order by t.name, t.id) from public.wiki_page_tags pt join public.wiki_tags t on t.id = pt.tag_id where pt.node_id = n.id), array[]::text[])
        where n.id = any(v_nodes);
    end if;
  end if;
  insert into public.wiki_tag_audit(action, actor_id, details) values (p_action, auth.uid(), v_details);
  return v_details;
end $$;
revoke all on function app_private.manage_wiki_tag(text, uuid, uuid, text, uuid, uuid[], uuid[]) from public, anon;
grant execute on function app_private.manage_wiki_tag(text, uuid, uuid, text, uuid, uuid[], uuid[]) to authenticated, service_role;
create or replace function public.manage_wiki_tag(
  p_action text, p_source_id uuid default null, p_target_id uuid default null,
  p_name text default null, p_section_id uuid default null,
  p_delete_ids uuid[] default null, p_expected_node_ids uuid[] default null
)
returns jsonb language sql security invoker set search_path = '' as $$
  select app_private.manage_wiki_tag(p_action, p_source_id, p_target_id, p_name, p_section_id, p_delete_ids, p_expected_node_ids);
$$;
revoke all on function public.manage_wiki_tag(text, uuid, uuid, text, uuid, uuid[], uuid[]) from public, anon;
grant execute on function public.manage_wiki_tag(text, uuid, uuid, text, uuid, uuid[], uuid[]) to authenticated, service_role;
