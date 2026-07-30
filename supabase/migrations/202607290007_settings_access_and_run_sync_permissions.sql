update public.permissions
set
  name = 'Access Permissions',
  code = 'permissions.access'
where code = 'permissions.edit';

update public.permissions
set
  name = 'Access AI Settings',
  code = 'ai.settings.access'
where code = 'ai.settings.view';

update public.permissions
set
  name = 'Access Advanced Settings',
  code = 'advanced-settings.access'
where code = 'advanced-settings.edit';

insert into public.permissions (name, code)
values ('Run Sync', 'data-sync.run')
on conflict (code) do update
set name = excluded.name;

drop policy if exists permission_requests_select_authenticated on public.permission_requests;
create policy permission_requests_select_authenticated
  on public.permission_requests
  for select
  to authenticated
  using (
    requested_by = auth.uid()
    or public.user_has_permission_code(auth.uid(), 'permissions.access')
  );

drop policy if exists permission_requests_update_permissions_edit on public.permission_requests;
create policy permission_requests_update_permissions_access
  on public.permission_requests
  for update
  to authenticated
  using (public.user_has_permission_code(auth.uid(), 'permissions.access'))
  with check (public.user_has_permission_code(auth.uid(), 'permissions.access'));

insert into public.user_permissions (user_id, permission_id)
select
  u.id,
  p.id
from auth.users u
cross join public.permissions p
where u.email = 'local-dev@canopymortgage.com'
  and p.code in (
    'settings.access',
    'permissions.access',
    'ai.settings.access',
    'advanced-settings.access',
    'data-sync.run',
    'beta.1'
  )
on conflict (user_id, permission_id) do nothing;
