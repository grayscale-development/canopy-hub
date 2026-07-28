insert into public.permissions (name, page, code)
values
  ('Access Settings', 'Settings', 'settings.access'),
  ('Edit Permissions', 'Settings', 'permissions.edit')
on conflict (code) do update
set
  name = excluded.name,
  page = excluded.page;

insert into public.user_permissions (user_id, permission_id)
select
  u.id,
  p.id
from auth.users u
cross join public.permissions p
where u.email = 'local-dev@canopymortgage.com'
  and p.code in ('settings.access', 'permissions.edit')
on conflict (user_id, permission_id) do nothing;
