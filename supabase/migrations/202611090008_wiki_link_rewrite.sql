-- The backup contains the original revision and its newly inserted replacement.
create table if not exists app_private.wiki_link_rewrite_audit (
  run_id uuid not null,
  node_id uuid not null,
  old_revision_id uuid not null,
  new_revision_id uuid not null,
  old_blocks jsonb not null,
  old_plain_text text not null,
  created_at timestamptz not null default now(),
  primary key (run_id, node_id)
);
revoke all on app_private.wiki_link_rewrite_audit from public, anon, authenticated;
create table if not exists app_private.wiki_link_rewrite_rollbacks (
  run_id uuid not null,
  node_id uuid not null,
  revision_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (run_id, node_id)
);
revoke all on app_private.wiki_link_rewrite_rollbacks from public, anon, authenticated;

create or replace function app_private.apply_wiki_link_rewrite(p_nodes jsonb, p_revision_count bigint, p_changes jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_run uuid := gen_random_uuid(); v_item jsonb; v_revision uuid; v_current jsonb;
  v_pages bigint; v_before bigint; v_after bigint; v_applied integer := 0;
begin
  if pg_catalog.jsonb_typeof(p_nodes) is distinct from 'array' or pg_catalog.jsonb_typeof(p_changes) is distinct from 'array' or pg_catalog.jsonb_array_length(p_changes) = 0 then
    raise exception 'invalid_link_rewrite_input';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(530064);
  lock table public.wiki_nodes, public.wiki_page_revisions in share row exclusive mode;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', id, 'parent_id', parent_id, 'slug', slug, 'short_id', short_id, 'type', type, 'title', title, 'status', status, 'current_revision_id', current_revision_id) order by id), '[]'::jsonb) into v_current from public.wiki_nodes;
  if v_current is distinct from p_nodes then raise exception 'wiki_nodes_changed_since_preview'; end if;
  select count(*) into v_before from public.wiki_page_revisions;
  if v_before <> p_revision_count then raise exception 'wiki_revisions_changed_since_preview'; end if;
  select count(*) into v_pages from public.wiki_nodes where type = 'page';
  if exists (select 1 from pg_catalog.jsonb_array_elements(p_changes) d group by d->>'node_id' having count(*) > 1) then raise exception 'duplicate_link_rewrite_page'; end if;
  for v_item in select value from pg_catalog.jsonb_array_elements(p_changes) loop
    if pg_catalog.jsonb_typeof(v_item->'blocks') is distinct from 'array' or v_item->'blocks' = v_item->'original_blocks' or v_item->>'plain_text' is null then raise exception 'invalid_link_rewrite_page'; end if;
    if not exists (select 1 from public.wiki_nodes n join public.wiki_page_revisions r on r.id = n.current_revision_id and r.node_id = n.id where n.id = (v_item->>'node_id')::uuid and n.type = 'page' and r.id = (v_item->>'base_revision_id')::uuid and r.blocks = v_item->'original_blocks') then raise exception 'stale_link_rewrite_page'; end if;
    v_revision := gen_random_uuid();
    insert into app_private.wiki_link_rewrite_audit(run_id, node_id, old_revision_id, new_revision_id, old_blocks, old_plain_text)
      select v_run, n.id, r.id, v_revision, r.blocks, r.plain_text from public.wiki_nodes n join public.wiki_page_revisions r on r.id = n.current_revision_id where n.id = (v_item->>'node_id')::uuid;
    insert into public.wiki_page_revisions(id, node_id, blocks, plain_text, change_note, created_by)
      values (v_revision, (v_item->>'node_id')::uuid, v_item->'blocks', v_item->>'plain_text', 'Updated internal links', null);
    update public.wiki_nodes set current_revision_id = v_revision where id = (v_item->>'node_id')::uuid;
    v_applied := v_applied + 1;
  end loop;
  select count(*) into v_after from public.wiki_page_revisions;
  if v_after <> v_before + v_applied or (select count(*) from public.wiki_nodes where type = 'page') <> v_pages then raise exception 'link_rewrite_count_mismatch'; end if;
  return pg_catalog.jsonb_build_object('run_id', v_run, 'pages', v_pages, 'revisions_before', v_before, 'revisions_after', v_after, 'changed_pages', v_applied, 'new_revisions', (select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('node_id', node_id, 'new_revision_id', new_revision_id) order by node_id) from app_private.wiki_link_rewrite_audit where run_id = v_run));
end $$;
revoke all on function app_private.apply_wiki_link_rewrite(jsonb, bigint, jsonb) from public, anon, authenticated;
grant execute on function app_private.apply_wiki_link_rewrite(jsonb, bigint, jsonb) to service_role;
create or replace function public.apply_wiki_link_rewrite(p_nodes jsonb, p_revision_count bigint, p_changes jsonb)
returns jsonb language sql security invoker set search_path = '' as $$ select app_private.apply_wiki_link_rewrite(p_nodes, p_revision_count, p_changes); $$;
revoke all on function public.apply_wiki_link_rewrite(jsonb, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.apply_wiki_link_rewrite(jsonb, bigint, jsonb) to service_role;
