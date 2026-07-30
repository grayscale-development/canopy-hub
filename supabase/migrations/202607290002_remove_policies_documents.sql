delete from public.permission_requests
where permission_id in (
  select id from public.permissions where code = 'policies.manage'
);

delete from public.user_permissions
where permission_id in (
  select id from public.permissions where code = 'policies.manage'
);

delete from public.permissions
where code = 'policies.manage';

delete from public.knowledge_sources
where source_type = 'document'
  and url like '/policies/%';
