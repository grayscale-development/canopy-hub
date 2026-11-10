-- Allow wiki readers to search visible tags using the existing matcher.
create or replace function public.match_wiki_tags(query_embedding extensions.vector(1536), match_threshold double precision default 0.80, match_count integer default 3)
returns table(id uuid, name text, scope text, section_id uuid, section_name text, similarity double precision)
language sql stable security invoker set search_path = '' as $$
  select t.id, t.name, t.scope, t.section_id, n.title,
    1 - (t.embedding operator(extensions.<=>) query_embedding) as similarity
  from public.wiki_tags t
  left join public.milo_wiki_nodes n on n.id = t.section_id
  where auth.uid() is not null
    and public.user_has_permission_code(auth.uid(), 'beta.1')
    and (t.scope = 'global' or n.id is not null)
    and t.embedding is not null
    and 1 - (t.embedding operator(extensions.<=>) query_embedding) >= match_threshold
  order by t.embedding operator(extensions.<=>) query_embedding, t.id
  limit least(greatest(match_count, 1), 10);
$$;
