-- Save a reviewed wiki revision, move the page pointer, and archive a merge
-- source in one transaction. A stale base revision or a later error rolls
-- every write back, so a failed merge cannot leave the target updated while
-- the source is still published.
create or replace function public.apply_wiki_reviewed_revision(
  p_target_id uuid,
  p_base_revision_id uuid,
  p_blocks jsonb,
  p_plain_text text,
  p_change_note text,
  p_source_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_current uuid;
  v_revision uuid := gen_random_uuid();
  v_source_status text;
begin
  if v_user is null
    or not public.user_has_permission_code(v_user, 'wiki.manage')
  then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if jsonb_typeof(p_blocks) is distinct from 'array' then
    raise exception 'invalid_blocks' using errcode = '22023';
  end if;

  select current_revision_id
    into v_current
  from public.wiki_nodes
  where id = p_target_id
    and type = 'page'
  for update;

  if not found then
    raise exception 'target_not_found' using errcode = 'P0002';
  end if;

  if v_current is distinct from p_base_revision_id then
    -- P0001, not a serialization code. Clients retry 40001 and would hang.
    raise exception 'stale_revision' using errcode = 'P0001';
  end if;

  if p_source_id is not null then
    if p_source_id = p_target_id then
      raise exception 'same_page' using errcode = '22023';
    end if;

    select status
      into v_source_status
    from public.wiki_nodes
    where id = p_source_id
      and type = 'page'
    for update;

    if not found then
      raise exception 'source_not_found' using errcode = 'P0002';
    end if;
  end if;

  insert into public.wiki_page_revisions (
    id,
    node_id,
    blocks,
    plain_text,
    change_note,
    created_by
  )
  values (
    v_revision,
    p_target_id,
    p_blocks,
    coalesce(p_plain_text, ''),
    p_change_note,
    v_user
  );

  update public.wiki_nodes
  set current_revision_id = v_revision,
      updated_by = v_user
  where id = p_target_id;

  if p_source_id is not null then
    update public.wiki_nodes
    set status = 'archived',
        updated_by = v_user
    where id = p_source_id;

    update public.knowledge_sources
    set status = 'archived',
        last_indexed_at = now()
    where source_type = 'wiki_page'
      and source_id = p_source_id::text;
  end if;

  return v_revision;
end;
$$;

revoke all on function public.apply_wiki_reviewed_revision(uuid, uuid, jsonb, text, text, uuid)
  from public, anon;
grant execute on function public.apply_wiki_reviewed_revision(uuid, uuid, jsonb, text, text, uuid)
  to authenticated;
