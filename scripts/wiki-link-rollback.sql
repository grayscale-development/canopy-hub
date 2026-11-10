-- Run as a database owner with psql -v ON_ERROR_STOP=1 -v run_id=<UUID>.
-- Refuses to overwrite any page edited after the link rewrite.
begin;
lock table public.wiki_nodes, public.wiki_page_revisions in share row exclusive mode;
create temporary table link_rollback_run on commit drop as select :'run_id'::uuid as id;
do $$
declare v_run uuid; v_item record; v_revision uuid; v_count integer := 0;
begin
  select id into v_run from link_rollback_run;
  if not exists (select 1 from app_private.wiki_link_rewrite_audit where run_id = v_run) then raise exception 'unknown_link_rewrite_run'; end if;
  if exists (select 1 from app_private.wiki_link_rewrite_rollbacks where run_id = v_run) then raise exception 'link_rewrite_already_rolled_back'; end if;
  if exists (select 1 from app_private.wiki_link_rewrite_audit a left join public.wiki_nodes n on n.id = a.node_id where a.run_id = v_run and (n.id is null or n.current_revision_id is distinct from a.new_revision_id)) then raise exception 'page_changed_after_link_rewrite'; end if;
  for v_item in select * from app_private.wiki_link_rewrite_audit where run_id = v_run order by node_id loop
    v_revision := gen_random_uuid();
    insert into public.wiki_page_revisions(id, node_id, blocks, plain_text, change_note, created_by) values (v_revision, v_item.node_id, v_item.old_blocks, v_item.old_plain_text, 'Restored before internal link update', null);
    update public.wiki_nodes set current_revision_id = v_revision where id = v_item.node_id;
    insert into app_private.wiki_link_rewrite_rollbacks(run_id, node_id, revision_id) values (v_run, v_item.node_id, v_revision);
    v_count := v_count + 1;
  end loop;
  raise notice 'Restored % pages as new revisions for run %', v_count, v_run;
end $$;
commit;
