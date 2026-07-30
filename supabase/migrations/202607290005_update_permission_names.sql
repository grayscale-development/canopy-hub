update public.permissions
set name = 'Upload Newsletters'
where code = 'newsletters.upload';

update public.permissions
set name = 'Edit Permissions'
where code = 'permissions.edit';

update public.permissions
set name = 'Access Settings'
where code = 'settings.access';

update public.permissions
set name = 'Edit Wiki'
where code = 'wiki.manage';

delete from public.user_permissions
where permission_id in (
  select id from public.permissions where code = 'office-floor-plan.upload'
);

delete from public.permission_requests
where permission_id in (
  select id from public.permissions where code = 'office-floor-plan.upload'
);

delete from public.permissions
where code = 'office-floor-plan.upload';
