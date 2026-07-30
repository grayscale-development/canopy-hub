insert into public.permissions (name, page, code)
values ('View Milo Flags', 'Milo', 'milo.flags.view')
on conflict (code) do update
set
  name = excluded.name,
  page = excluded.page;
