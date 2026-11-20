-- The editor duplicate highlighter was removed before the 2.2 release.
delete from public.user_permissions
where permission_id in (
  select id from public.permissions where code = 'wiki.duplicates.inspect'
);

delete from public.permissions
where code = 'wiki.duplicates.inspect';
