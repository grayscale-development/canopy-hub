-- Preserve legacy case variants; block new collisions without rewriting tag IDs or links.
alter table public.wiki_tags add column if not exists scope text not null default 'global';
alter table public.wiki_tags add column if not exists section_id uuid references public.wiki_nodes(id) on delete cascade;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.wiki_tags'::regclass and conname = 'wiki_tags_scope_check') then
    alter table public.wiki_tags add constraint wiki_tags_scope_check check (scope in ('global', 'section'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.wiki_tags'::regclass and conname = 'wiki_tags_scope_section_check') then
    alter table public.wiki_tags add constraint wiki_tags_scope_section_check check ((scope = 'global' and section_id is null) or (scope = 'section' and section_id is not null));
  end if;
end $$;

-- Install the equivalent global constraint before removing the old one.
create unique index if not exists wiki_tags_global_name_exact_idx on public.wiki_tags (name) where scope = 'global';
create unique index if not exists wiki_tags_section_name_ci_idx on public.wiki_tags (section_id, lower(name)) where scope = 'section';
alter table public.wiki_tags drop constraint if exists wiki_tags_name_key;

create or replace function app_private.guard_wiki_tag_name()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.name is not distinct from old.name and new.scope is not distinct from old.scope and new.section_id is not distinct from old.section_id then
    return new;
  end if;
  -- Serialize same-name creations, including global versus section creations.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(pg_catalog.lower(new.name), 530053));
  if exists (
    select 1 from public.wiki_tags t
    where t.id <> new.id and pg_catalog.lower(t.name) = pg_catalog.lower(new.name)
      and (new.scope = 'global' or t.scope = 'global' or t.section_id = new.section_id)
  ) then
    raise exception using errcode = 'P0001', message = 'wiki_tag_name_conflict';
  end if;
  if new.scope = 'section' and not exists (select 1 from public.wiki_nodes n where n.id = new.section_id and n.type = 'folder') then
    raise exception using errcode = 'P0001', message = 'wiki_tag_invalid_section';
  end if;
  return new;
end $$;
revoke all on function app_private.guard_wiki_tag_name() from public, anon, authenticated;
drop trigger if exists wiki_tags_guard_name on public.wiki_tags;
create trigger wiki_tags_guard_name before insert or update of name, scope, section_id on public.wiki_tags for each row execute function app_private.guard_wiki_tag_name();

create or replace function app_private.wiki_tag_in_scope(p_node_id uuid, p_tag_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  with recursive ancestors as (
    select n.id, n.parent_id, array[n.id] as visited from public.wiki_nodes n where n.id = p_node_id and n.type = 'page'
    union all
    select n.id, n.parent_id, a.visited || n.id from public.wiki_nodes n join ancestors a on n.id = a.parent_id where not n.id = any(a.visited)
  )
  select exists (select 1 from public.wiki_tags t where t.id = p_tag_id and exists (select 1 from ancestors) and (t.scope = 'global' or exists (select 1 from ancestors a where a.id = t.section_id)));
$$;
revoke all on function app_private.wiki_tag_in_scope(uuid, uuid) from public, anon, authenticated;

create or replace function app_private.guard_wiki_page_tag_scope()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not app_private.wiki_tag_in_scope(new.node_id, new.tag_id) then
    raise exception using errcode = 'P0001', message = 'wiki_tag_out_of_scope';
  end if;
  return new;
end $$;
revoke all on function app_private.guard_wiki_page_tag_scope() from public, anon, authenticated;
drop trigger if exists wiki_page_tags_guard_scope on public.wiki_page_tags;
create trigger wiki_page_tags_guard_scope before insert or update of node_id, tag_id on public.wiki_page_tags for each row execute function app_private.guard_wiki_page_tag_scope();

create or replace function app_private.wiki_page_out_of_scope_tags(p_node_id uuid)
returns table(id uuid, name text, scope text, section_id uuid)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.user_has_permission_code(auth.uid(), 'wiki.manage') then
    raise exception using errcode = '42501', message = 'wiki_manage_required';
  end if;
  return query select t.id, t.name, t.scope, t.section_id from public.wiki_page_tags pt join public.wiki_tags t on t.id = pt.tag_id where pt.node_id = p_node_id and not app_private.wiki_tag_in_scope(pt.node_id, pt.tag_id) order by t.name, t.id;
end $$;
revoke all on function app_private.wiki_page_out_of_scope_tags(uuid) from public, anon;
grant execute on function app_private.wiki_page_out_of_scope_tags(uuid) to authenticated, service_role;
create or replace function public.wiki_page_out_of_scope_tags(p_node_id uuid)
returns table(id uuid, name text, scope text, section_id uuid)
language sql stable security invoker set search_path = '' as $$ select * from app_private.wiki_page_out_of_scope_tags(p_node_id); $$;
revoke all on function public.wiki_page_out_of_scope_tags(uuid) from public, anon;
grant execute on function public.wiki_page_out_of_scope_tags(uuid) to authenticated, service_role;

create or replace function app_private.sync_wiki_page_tags(p_node_id uuid, p_tags jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_tag jsonb; v_name text; v_scope text; v_section uuid; v_id uuid;
  v_ids uuid[] := array[]::uuid[]; v_names text[] := array[]::text[];
begin
  if auth.uid() is null or not public.user_has_permission_code(auth.uid(), 'wiki.manage') then
    raise exception using errcode = '42501', message = 'wiki_manage_required';
  end if;
  if jsonb_typeof(p_tags) is distinct from 'array' or jsonb_array_length(p_tags) > 12 then
    raise exception using errcode = 'P0001', message = 'wiki_tag_limit';
  end if;
  perform 1 from public.wiki_nodes where id = p_node_id and type = 'page' for update;
  if not found then raise exception using errcode = 'P0001', message = 'wiki_page_not_found'; end if;
  for v_tag in select value from pg_catalog.jsonb_array_elements(p_tags) loop
    v_name := v_tag->>'name'; v_scope := coalesce(v_tag->>'scope', 'global');
    v_section := nullif(v_tag->>'section_id', '')::uuid;
    if v_name is null or pg_catalog.btrim(v_name) = '' or pg_catalog.length(v_name) > 60 or v_scope not in ('global', 'section') or (v_scope = 'global' and v_section is not null) or (v_scope = 'section' and v_section is null) then
      raise exception using errcode = 'P0001', message = 'wiki_tag_invalid';
    end if;
    -- Lock before lookup so concurrent syncs cannot create the same name.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(pg_catalog.lower(v_name), 530053));
    select t.id, t.name into v_id, v_name from public.wiki_tags t
      where t.scope = v_scope and t.section_id is not distinct from v_section and pg_catalog.lower(t.name) = pg_catalog.lower(v_name)
      order by (t.name = v_name) desc, t.name, t.id limit 1;
    if v_id is null then
      v_name := v_tag->>'name';
      insert into public.wiki_tags(name, scope, section_id) values (v_name, v_scope, v_section) returning id into v_id;
    end if;
    if not app_private.wiki_tag_in_scope(p_node_id, v_id) then
      raise exception using errcode = 'P0001', message = 'wiki_tag_out_of_scope';
    end if;
    if not v_id = any(v_ids) then v_ids := v_ids || v_id; v_names := v_names || v_name; end if;
    v_id := null;
  end loop;
  delete from public.wiki_page_tags where node_id = p_node_id;
  insert into public.wiki_page_tags(node_id, tag_id) select p_node_id, unnest(v_ids);
  update public.wiki_nodes set tags = v_names, updated_by = auth.uid() where id = p_node_id;
end $$;
revoke all on function app_private.sync_wiki_page_tags(uuid, jsonb) from public, anon;
grant execute on function app_private.sync_wiki_page_tags(uuid, jsonb) to authenticated, service_role;
create or replace function public.sync_wiki_page_tags(p_node_id uuid, p_tags jsonb)
returns void language sql security invoker set search_path = '' as $$ select app_private.sync_wiki_page_tags(p_node_id, p_tags); $$;
revoke all on function public.sync_wiki_page_tags(uuid, jsonb) from public, anon;
grant execute on function public.sync_wiki_page_tags(uuid, jsonb) to authenticated, service_role;
