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
      websearch_to_tsquery('english', coalesce(nullif(btrim(search_query), ''), '')) as exact_query
  ),
  significant_terms as (
    select distinct term
    from prepared_query pq
    cross join regexp_split_to_table(lower(coalesce(pq.phrase, '')), '[^a-z0-9]+') as term
    where length(term) > 2
      and term not in (
        'how',
        'what',
        'where',
        'when',
        'who',
        'why',
        'can',
        'could',
        'would',
        'should',
        'the',
        'and',
        'for',
        'you',
        'with',
        'that',
        'this',
        'from',
        'have',
        'need',
        'does',
        'into',
        'onto',
        'are',
        'was',
        'were',
        'did'
      )
  ),
  ranked_chunks as (
    select
      kc.id as chunk_id,
      ks.id as source_id,
      ks.source_type,
      ks.title as source_title,
      ks.url as source_url,
      kc.content,
      kc.metadata,
      coalesce(ks.title, '')
        || ' '
        || coalesce(ks.source_type, '')
        || ' '
        || coalesce(ks.url, '')
        || ' '
        || coalesce(kc.content, '') as search_text,
      pq.phrase,
      pq.exact_query
    from public.knowledge_chunks kc
    join public.knowledge_sources ks on ks.id = kc.source_id
    cross join prepared_query pq
    where pq.phrase is not null
      and ks.status = 'active'
      and (source_types is null or ks.source_type = any(source_types))
  )
  select
    rc.chunk_id,
    rc.source_id,
    rc.source_type,
    rc.source_title,
    rc.source_url,
    rc.content,
    rc.metadata,
    greatest(
      ts_rank_cd(to_tsvector('english', rc.search_text), rc.exact_query),
      case
        when lower(rc.source_title) = lower(rc.phrase) then 2
        when lower(rc.source_title) like '%' || lower(rc.phrase) || '%' then 1.5
        when lower(rc.search_text) like '%' || lower(rc.phrase) || '%' then 1
        else 0
      end,
      coalesce(
        (
          select max(
            case
              when lower(rc.source_title) = term then 0.85
              when lower(rc.source_title) like '%' || term || '%' then 0.75
              when lower(coalesce(rc.source_url, '')) like '%' || term || '%' then 0.65
              when lower(rc.search_text) like '%' || term || '%' then 0.35
              else 0
            end
          )
          from significant_terms
        ),
        0
      )
    )::double precision as similarity
  from ranked_chunks rc
  where to_tsvector('english', rc.search_text) @@ rc.exact_query
    or lower(rc.source_title) like '%' || lower(rc.phrase) || '%'
    or lower(rc.search_text) like '%' || lower(rc.phrase) || '%'
    or exists (
      select 1
      from significant_terms
      where lower(rc.search_text) like '%' || term || '%'
    )
  order by similarity desc, rc.source_type, rc.source_title
  limit least(greatest(match_count, 1), 50);
$$;

revoke all on function public.match_knowledge_chunks_keyword(text, integer, text[]) from public;
grant execute on function public.match_knowledge_chunks_keyword(text, integer, text[]) to authenticated;
