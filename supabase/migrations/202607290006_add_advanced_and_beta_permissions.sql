insert into public.permissions (name, code)
values
  ('Edit Advanced Settings', 'advanced-settings.edit'),
  ('Beta 1', 'beta.1')
on conflict (code) do update
set name = excluded.name;

insert into public.user_permissions (user_id, permission_id)
select
  u.id,
  p.id
from auth.users u
cross join public.permissions p
where u.email = 'local-dev@canopymortgage.com'
  and p.code in ('advanced-settings.edit', 'beta.1')
on conflict (user_id, permission_id) do nothing;
