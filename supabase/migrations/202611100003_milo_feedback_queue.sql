alter table public.ai_chat_message_flags
  add column if not exists added_to_eval_set boolean not null default false;

-- Only return page identities and counts, never private chat text or citations.
create or replace function app_private.milo_gap_counts()
returns table (page_id uuid, page_title text, question_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
    or not public.user_has_permission_code(auth.uid(), 'settings.access')
    or not public.user_has_permission_code(auth.uid(), 'ai.settings.access')
    or not public.user_has_permission_code(auth.uid(), 'beta.1')
    or not public.user_has_permission_code(auth.uid(), 'wiki.manage') then
    raise exception using errcode = '42501', message = 'milo_feedback_access_required';
  end if;

  return query
    select closest.id, coalesce(closest.title, 'No matching page'), count(*)
    from public.ai_chat_messages m
    left join lateral (
      select n.id, n.title
      from public.ai_chat_citations c
      join public.knowledge_sources s on s.id = c.knowledge_source_id and s.source_type = 'wiki_page'
      join public.wiki_nodes n on n.id::text = s.source_id and n.type = 'page'
      where c.message_id = m.id
      -- Citations created in the same batch can share a timestamp; page ID
      -- provides a consistent topic when their retrieval order is unavailable.
      order by c.created_at, n.id, c.id
      limit 1
    ) closest on true
    where m.role = 'assistant' and m.metadata->'abstained' = 'true'::jsonb
    group by closest.id, closest.title
    order by count(*) desc, coalesce(closest.title, 'No matching page');
end;
$$;

revoke all on function app_private.milo_gap_counts() from public, anon;
grant execute on function app_private.milo_gap_counts() to authenticated;

create or replace function public.milo_gap_counts()
returns table (page_id uuid, page_title text, question_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from app_private.milo_gap_counts();
$$;
revoke all on function public.milo_gap_counts() from public, anon;
grant execute on function public.milo_gap_counts() to authenticated;
