-- Advisory suggestions never change assignments or tag visibility.
alter table public.wiki_tags add column if not exists embedding extensions.vector(1536);

create or replace function app_private.clear_wiki_tag_embedding()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.name is distinct from old.name then new.embedding := null; end if;
  return new;
end $$;
revoke all on function app_private.clear_wiki_tag_embedding() from public, anon, authenticated;
drop trigger if exists wiki_tags_clear_embedding on public.wiki_tags;
create trigger wiki_tags_clear_embedding before update of name on public.wiki_tags
  for each row execute function app_private.clear_wiki_tag_embedding();

-- An invoker query preserves RLS and excludes tags from invisible sections.
create or replace function public.match_wiki_tags(query_embedding extensions.vector(1536), match_threshold double precision default 0.80, match_count integer default 3)
returns table(id uuid, name text, scope text, section_id uuid, section_name text, similarity double precision)
language sql stable security invoker set search_path = '' as $$
  select t.id, t.name, t.scope, t.section_id, n.title,
    1 - (t.embedding operator(extensions.<=>) query_embedding) as similarity
  from public.wiki_tags t
  left join public.milo_wiki_nodes n on n.id = t.section_id
  where auth.uid() is not null
    and public.user_has_permission_code(auth.uid(), 'wiki.manage')
    and public.user_has_permission_code(auth.uid(), 'beta.1')
    and (t.scope = 'global' or n.id is not null)
    and t.embedding is not null
    and 1 - (t.embedding operator(extensions.<=>) query_embedding) >= match_threshold
  order by t.embedding operator(extensions.<=>) query_embedding, t.id
  limit least(greatest(match_count, 1), 10);
$$;
revoke all on function public.match_wiki_tags(extensions.vector, double precision, integer) from public, anon;
grant execute on function public.match_wiki_tags(extensions.vector, double precision, integer) to authenticated, service_role;

-- One row per manager and minute; no tag names or page content are retained.
create table if not exists app_private.wiki_tag_suggestion_rate (
  actor_id uuid primary key,
  minute timestamptz not null,
  requests integer not null
);
revoke all on app_private.wiki_tag_suggestion_rate from public, anon, authenticated;

create or replace function app_private.consume_wiki_tag_suggestion_rate()
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_requests integer; v_minute timestamptz := pg_catalog.date_trunc('minute', pg_catalog.now());
begin
  if auth.uid() is null or not public.user_has_permission_code(auth.uid(), 'wiki.manage')
    or not public.user_has_permission_code(auth.uid(), 'beta.1') then
    raise exception using errcode = '42501', message = 'wiki_manage_required';
  end if;
  insert into app_private.wiki_tag_suggestion_rate as r(actor_id, minute, requests)
  values (auth.uid(), v_minute, 1)
  on conflict (actor_id) do update set
    minute = v_minute,
    requests = case when r.minute = v_minute then r.requests + 1 else 1 end
  returning requests into v_requests;
  return v_requests <= 30;
end $$;
revoke all on function app_private.consume_wiki_tag_suggestion_rate() from public, anon;
grant execute on function app_private.consume_wiki_tag_suggestion_rate() to authenticated, service_role;
create or replace function public.consume_wiki_tag_suggestion_rate()
returns boolean language sql security invoker set search_path = '' as $$
  select app_private.consume_wiki_tag_suggestion_rate();
$$;
revoke all on function public.consume_wiki_tag_suggestion_rate() from public, anon;
grant execute on function public.consume_wiki_tag_suggestion_rate() to authenticated, service_role;

create or replace function app_private.record_wiki_tag_suggestion(p_event text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.user_has_permission_code(auth.uid(), 'wiki.manage')
    or not public.user_has_permission_code(auth.uid(), 'beta.1') then
    raise exception using errcode = '42501', message = 'wiki_manage_required';
  end if;
  if p_event not in ('shown', 'accepted', 'ignored') then
    raise exception using errcode = '22023', message = 'invalid_suggestion_event';
  end if;
  insert into public.wiki_tag_audit(action, actor_id, details)
  values ('suggestion_' || p_event, auth.uid(), '{}'::jsonb);
end $$;
revoke all on function app_private.record_wiki_tag_suggestion(text) from public, anon;
grant execute on function app_private.record_wiki_tag_suggestion(text) to authenticated, service_role;
create or replace function public.record_wiki_tag_suggestion(p_event text)
returns void language sql security invoker set search_path = '' as $$
  select app_private.record_wiki_tag_suggestion(p_event);
$$;
revoke all on function public.record_wiki_tag_suggestion(text) from public, anon;
grant execute on function public.record_wiki_tag_suggestion(text) to authenticated, service_role;
