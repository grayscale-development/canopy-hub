insert into public.permissions (name, code)
values ('Inspect Wiki Duplicates', 'wiki.duplicates.inspect')
on conflict (code) do nothing;
