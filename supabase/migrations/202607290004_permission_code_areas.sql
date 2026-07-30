update public.permissions
set
  name = 'Edit Department Directory',
  code = 'department-directory.edit'
where code = 'support.edit';

update public.permissions
set
  name = 'View AI Settings',
  code = 'ai.settings.view'
where code = 'milo.flags.view';

drop index if exists public.idx_permissions_page_name;

alter table public.permissions
  drop column if exists page;

create index if not exists idx_permissions_area_name
  on public.permissions ((split_part(code, '.', 1)), name);
