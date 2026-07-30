create or replace function public.match_knowledge_chunks_keyword(
  search_query text,
  match_count integer default 8,
  source_types text[] default null
)
returns table (
  chunk_id uuid,
  source_id uuid,
  source_type text,
  source_title text,
  source_url text,
  content text,
  metadata jsonb,
  similarity double precision
)
language sql
stable
as $$
  with prepared_query as (
    select
      nullif(btrim(search_query), '') as phrase,
      websearch_to_tsquery('english', coalesce(nullif(btrim(search_query), ''), '')) as ts_query
  )
  select
    kc.id as chunk_id,
    ks.id as source_id,
    ks.source_type,
    ks.title as source_title,
    ks.url as source_url,
    kc.content,
    kc.metadata,
    greatest(
      ts_rank_cd(
        to_tsvector(
          'english',
          coalesce(ks.title, '') || ' ' || coalesce(kc.content, '')
        ),
        pq.ts_query
      ),
      case
        when lower(ks.title) like '%' || lower(pq.phrase) || '%'
          or lower(kc.content) like '%' || lower(pq.phrase) || '%'
          then 1
        else 0
      end
    )::double precision as similarity
  from public.knowledge_chunks kc
  join public.knowledge_sources ks on ks.id = kc.source_id
  cross join prepared_query pq
  where pq.phrase is not null
    and ks.status = 'active'
    and (source_types is null or ks.source_type = any(source_types))
    and (
      to_tsvector(
        'english',
        coalesce(ks.title, '') || ' ' || coalesce(kc.content, '')
      ) @@ pq.ts_query
      or lower(ks.title) like '%' || lower(pq.phrase) || '%'
      or lower(kc.content) like '%' || lower(pq.phrase) || '%'
    )
  order by similarity desc, ks.source_type, ks.title
  limit least(greatest(match_count, 1), 50);
$$;

revoke all on function public.match_knowledge_chunks_keyword(text, integer, text[]) from public;
grant execute on function public.match_knowledge_chunks_keyword(text, integer, text[]) to authenticated;
