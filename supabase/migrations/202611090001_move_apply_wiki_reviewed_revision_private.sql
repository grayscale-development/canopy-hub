-- Keep the SECURITY DEFINER implementation out of the exposed public schema so
-- the Supabase security advisor (authenticated_security_definer_function_executable)
-- passes, matching 202611040002_move_wiki_visibility_helpers_private.sql.
-- The function authorizes with auth.uid() and wiki.manage, so it behaves the
-- same when reached through the invoker wrapper. The client RPC name and
-- signature are unchanged.
alter function public.apply_wiki_reviewed_revision(uuid, uuid, jsonb, text, text, uuid, uuid)
  set schema app_private;

revoke all on function app_private.apply_wiki_reviewed_revision(uuid, uuid, jsonb, text, text, uuid, uuid)
  from public, anon;
grant execute on function app_private.apply_wiki_reviewed_revision(uuid, uuid, jsonb, text, text, uuid, uuid)
  to authenticated, service_role;

create or replace function public.apply_wiki_reviewed_revision(
  p_target_id uuid,
  p_base_revision_id uuid,
  p_blocks jsonb,
  p_plain_text text,
  p_change_note text,
  p_source_id uuid,
  p_source_base_revision_id uuid
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select app_private.apply_wiki_reviewed_revision(
    p_target_id,
    p_base_revision_id,
    p_blocks,
    p_plain_text,
    p_change_note,
    p_source_id,
    p_source_base_revision_id
  );
$$;

revoke all on function public.apply_wiki_reviewed_revision(uuid, uuid, jsonb, text, text, uuid, uuid)
  from public, anon;
grant execute on function public.apply_wiki_reviewed_revision(uuid, uuid, jsonb, text, text, uuid, uuid)
  to authenticated;
