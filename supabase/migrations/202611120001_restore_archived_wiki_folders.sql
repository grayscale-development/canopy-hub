-- Add a narrowly scoped restore path without changing the existing folder trigger.
create or replace function public.allow_archived_wiki_folder_restore()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.type = 'folder' and old.status = 'archived'
     and new.status = 'archived'
     and current_setting('canopy.restore_wiki_folder', true) = old.id::text then
    new.status := 'published';
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_catalog.pg_trigger where tgname = 'zzz_wiki_folder_restore' and tgrelid = 'public.wiki_nodes'::regclass) then
    create trigger zzz_wiki_folder_restore before update of status on public.wiki_nodes
      for each row execute function public.allow_archived_wiki_folder_restore();
  end if;
end;
$$;

create or replace function public.restore_archived_wiki_folder(target_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare restored boolean;
begin
  if not public.user_has_permission_code(auth.uid(), 'wiki.manage')
     or not public.user_has_permission_code(auth.uid(), 'beta.1') then
    raise exception 'You do not have permission to manage the Wiki.';
  end if;
  perform pg_catalog.set_config('canopy.restore_wiki_folder', target_id::text, true);
  update public.wiki_nodes set status = 'published', updated_by = auth.uid()
    where id = target_id and type = 'folder' and status = 'archived'
      and not exists (
        with recursive ancestors as (
          select parent.parent_id, parent.status from public.wiki_nodes parent
            join public.wiki_nodes child on child.parent_id = parent.id where child.id = target_id
          union all
          select parent.parent_id, parent.status from public.wiki_nodes parent
            join ancestors on parent.id = ancestors.parent_id
        ) select 1 from ancestors where status = 'archived'
      )
    returning status = 'published' into restored;
  perform pg_catalog.set_config('canopy.restore_wiki_folder', '', true);
  return coalesce(restored, false);
end;
$$;
revoke all on function public.restore_archived_wiki_folder(uuid) from public;
grant execute on function public.restore_archived_wiki_folder(uuid) to authenticated;
