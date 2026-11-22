-- Proposals are retained outside user-writable chat metadata. Only the server
-- service role can create them; the authenticated RPC consumes them atomically.
create table if not exists public.milo_edit_proposals (
  message_id uuid primary key references public.ai_chat_messages(id) on delete cascade,
  thread_id uuid not null,
  user_id uuid not null,
  node_id uuid not null,
  base_revision_id uuid,
  card jsonb not null,
  edit_state jsonb not null,
  applied_revision_id uuid,
  undone_revision_id uuid,
  created_at timestamptz not null default now()
);
alter table public.milo_edit_proposals enable row level security;
revoke all on public.milo_edit_proposals from public, anon, authenticated;
grant all on public.milo_edit_proposals to service_role;

create table if not exists public.milo_edit_audit (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null,
  message_id uuid not null,
  user_id uuid not null,
  node_id uuid not null,
  base_revision_id uuid,
  new_revision_id uuid not null,
  action text not null check (action in ('approve', 'undo')),
  created_at timestamptz not null default now()
);
alter table public.milo_edit_audit enable row level security;
revoke all on public.milo_edit_audit from public, anon, authenticated, service_role;
grant select on public.milo_edit_audit to authenticated, service_role;
drop policy if exists milo_edit_audit_managers_read on public.milo_edit_audit;
create policy milo_edit_audit_managers_read on public.milo_edit_audit for select to authenticated
  using (public.user_has_permission_code(auth.uid(), 'wiki.manage'));
create index if not exists milo_edit_audit_user_created on public.milo_edit_audit (user_id, created_at desc);

create or replace function app_private.apply_milo_edit(p_thread_id uuid, p_message_id uuid, p_card_id text, p_action text, p_page_url text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_proposal public.milo_edit_proposals%rowtype;
  v_metadata jsonb;
  v_card jsonb;
  v_revision uuid;
  v_previous public.wiki_page_revisions%rowtype;
  v_note text;
  v_base uuid;
begin
  if v_user is null or not public.user_has_permission_code(v_user, 'beta.1')
    or not public.user_has_permission_code(v_user, 'wiki.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_action is null or p_action not in ('approve', 'undo') or p_page_url is null
    or p_page_url !~ '^/wiki/[0-9]+(/[0-9]+)*$' or p_card_id is null then
    raise exception 'invalid_action' using errcode = '22023';
  end if;
  -- Serialize each user's writes so concurrent requests cannot bypass the limit.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 76));
  if (select count(*) from public.milo_edit_audit where user_id = v_user and created_at > now() - interval '1 minute') >= 10 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  select * into v_proposal from public.milo_edit_proposals
    where message_id = p_message_id and thread_id = p_thread_id and user_id = v_user for update;
  if not found then raise exception 'proposal_not_found' using errcode = 'P0002'; end if;
  select m.metadata into v_metadata from public.ai_chat_messages m
    join public.ai_chat_threads t on t.id = m.thread_id
    where m.id = p_message_id and m.thread_id = p_thread_id and m.user_id = v_user
      and m.role = 'assistant' and t.user_id = v_user for update of m;
  if not found then raise exception 'proposal_not_found' using errcode = 'P0002'; end if;
  -- Keep the page and its ancestors stable until the revision is committed.
  perform n.id from public.wiki_nodes n where n.id in (
    with recursive ancestors as (
      select id, parent_id from public.wiki_nodes where id = v_proposal.node_id
      union
      select parent.id, parent.parent_id from public.wiki_nodes parent join ancestors child on parent.id = child.parent_id
    ) select id from ancestors
  ) order by n.id for update;
  if not exists (select 1 from public.wiki_nodes n where n.id = v_proposal.node_id and n.type = 'page' and n.status <> 'archived')
    or not app_private.milo_can_access_wiki_node(v_proposal.node_id::text) then
    raise exception 'page_unavailable' using errcode = '42501';
  end if;
  if p_action = 'approve' then
    if v_proposal.applied_revision_id is not null or v_proposal.card->>'id' <> p_card_id
      or not exists (select 1 from jsonb_array_elements(coalesce(v_metadata->'cards', '[]'::jsonb)) c where c = v_proposal.card) then
      raise exception 'proposal_changed' using errcode = 'P0001';
    end if;
    if octet_length(v_proposal.card::text) > 1000000 or jsonb_typeof(v_proposal.card->'blocks') <> 'array'
      or length(coalesce(v_proposal.card->>'plain_text', '')) > 500000
      or length(coalesce(v_proposal.card->>'changeNote', '')) > 1000 then
      raise exception 'proposal_too_large' using errcode = '22023';
    end if;
    v_base := v_proposal.base_revision_id;
    v_revision := app_private.apply_wiki_reviewed_revision(v_proposal.node_id, v_base, v_proposal.card->'blocks', v_proposal.card->>'plain_text', v_proposal.card->>'changeNote', null, null);
    update public.milo_edit_proposals set applied_revision_id = v_revision where message_id = p_message_id;
    v_card := jsonb_build_object('type', 'applied-edit', 'id', p_card_id, 'pageTitle', v_proposal.card->>'pageTitle', 'url', p_page_url, 'summary', coalesce(v_proposal.card->>'summary', 'Page updated.'), 'undoAvailable', true);
  else
    if v_proposal.applied_revision_id is null or v_proposal.undone_revision_id is not null or v_proposal.card->>'id' <> p_card_id then
      raise exception 'undo_unavailable' using errcode = 'P0001';
    end if;
    if v_proposal.base_revision_id is null then
      v_note := 'Restored empty page';
      v_previous.blocks := '[]'::jsonb;
      v_previous.plain_text := '';
    else
      select * into v_previous from public.wiki_page_revisions where id = v_proposal.base_revision_id and node_id = v_proposal.node_id;
      if not found then raise exception 'undo_unavailable' using errcode = 'P0001'; end if;
      v_note := 'Restored from ' || to_char(v_previous.created_at at time zone 'UTC', 'Mon FMDD, YYYY, FMHH12:MI AM') || ' UTC';
    end if;
    v_base := v_proposal.applied_revision_id;
    v_revision := app_private.apply_wiki_reviewed_revision(v_proposal.node_id, v_base, v_previous.blocks, v_previous.plain_text, v_note, null, null);
    update public.milo_edit_proposals set undone_revision_id = v_revision where message_id = p_message_id;
    v_card := jsonb_build_object('type', 'applied-edit', 'id', p_card_id, 'pageTitle', v_proposal.card->>'pageTitle', 'url', p_page_url, 'summary', coalesce(v_proposal.card->>'summary', 'Page updated.'), 'undoAvailable', false, 'undone', true);
  end if;
  insert into public.milo_edit_audit(thread_id, message_id, user_id, node_id, base_revision_id, new_revision_id, action)
    values (p_thread_id, p_message_id, v_user, v_proposal.node_id, v_base, v_revision, p_action);
  update public.ai_chat_messages set metadata = (v_metadata - 'miloEdit') || jsonb_build_object('cards',
    (select jsonb_agg(case when c->>'id' = p_card_id then v_card else c end) from jsonb_array_elements(v_metadata->'cards') c))
    where id = p_message_id;
  return v_card;
end;
$$;
revoke all on function app_private.apply_milo_edit(uuid, uuid, text, text, text) from public, anon;
grant execute on function app_private.apply_milo_edit(uuid, uuid, text, text, text) to authenticated;
create or replace function public.apply_milo_edit(p_thread_id uuid, p_message_id uuid, p_card_id text, p_action text, p_page_url text)
returns jsonb language sql security invoker set search_path = '' as $$
  select app_private.apply_milo_edit(p_thread_id, p_message_id, p_card_id, p_action, p_page_url);
$$;
revoke all on function public.apply_milo_edit(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.apply_milo_edit(uuid, uuid, text, text, text) to authenticated;
